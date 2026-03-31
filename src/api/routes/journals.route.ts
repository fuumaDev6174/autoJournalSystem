import { Router, Request, Response } from 'express';
import {
  generateJournalEntry,
  mapLinesToDBFormat,
  matchProcessingRulesWithCandidates,
  buildEntryFromRule,
  extractMultipleEntries,
  validateDebitCreditBalance,
  findSupplierAliasMatch,
} from '../../server/services/index.js';
import type { GeneratedJournalEntry } from '../../server/services/index.js';
import {
  supabaseAdmin,
  isValidUUID,
  createNotification,
  getOrganizationId,
  fetchAccountItems,
  fetchTaxCategories,
  findFallbackAccountId,
} from '../helpers/master-data.js';

const router = Router();

// ============================================
// AI仕訳生成API
// ============================================

router.post('/journal-entries/generate', async (req: Request, res: Response) => {
  try {
    const { document_id, client_id, ocr_result, industry } = req.body;

    console.log(`[仕訳生成] リクエスト受信: document_id="${document_id}", client_id="${client_id}"`);

    if (!document_id || !client_id || !ocr_result) {
      console.error('[仕訳生成] ❌ 必須パラメータ不足:', {
        document_id: !!document_id,
        client_id: !!client_id,
        ocr_result: !!ocr_result,
      });
      return res.status(400).json({ error: '必須パラメータが不足しています' });
    }
    if (!isValidUUID(document_id) || !isValidUUID(client_id)) {
      return res.status(400).json({ error: 'document_id / client_id が不正な形式です' });
    }

    // 1. organization_id を解決
    const organizationId = await getOrganizationId(client_id);
    if (!organizationId) {
      console.error(`[仕訳生成] ❌ organization_id 解決失敗。client_id="${client_id}"`);
      return res.status(400).json({
        error: '指定された client_id に紐づく組織が見つかりません',
        debug: {
          client_id,
          supabase_url_set: !!process.env.SUPABASE_URL,
          service_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      });
    }

    // 2. マスタデータを取得
    console.log(`[仕訳生成] マスタデータ取得中... organization_id="${organizationId}"`);
    const [accountItems, taxCategories, fallbackAccountId, suppliersData, aliasesData, itemsData] = await Promise.all([
      fetchAccountItems(organizationId),
      fetchTaxCategories(),
      findFallbackAccountId(organizationId),
      supabaseAdmin.from('suppliers').select('id, name').eq('organization_id', organizationId).eq('is_active', true),
      supabaseAdmin.from('supplier_aliases').select('supplier_id, alias_name'),
      supabaseAdmin.from('items').select('id, name').eq('is_active', true).or(`organization_id.eq.${organizationId},organization_id.is.null`),
    ]);
    const suppliers = suppliersData.data || [];
    const supplierAliases = aliasesData.data || [];
    const itemsList = itemsData.data || [];
    console.log(`[仕訳生成] マスタ: 勘定科目=${accountItems.length}件, 税区分=${taxCategories.length}件, 取引先=${suppliers.length}件, 品目=${itemsList.length}件`);

    // 2.5a statement_extract判定: 明細分割が必要な証憑種別か確認
    const statementExtractTypes = ['bank_statement', 'credit_card', 'etc_statement', 'e_money_statement', 'expense_report'];
    const docTypeCode = ocr_result.document_type || null;

    // document_type_id から processing_pattern を取得
    let processingPattern: string | null = null;
    if (document_id) {
      const { data: docRow } = await supabaseAdmin
        .from('documents')
        .select('document_type_id, storage_path, file_path')
        .eq('id', document_id)
        .single();
      if (docRow?.document_type_id) {
        const { data: dtRow } = await supabaseAdmin
          .from('document_types')
          .select('processing_pattern')
          .eq('id', docRow.document_type_id)
          .single();
        processingPattern = dtRow?.processing_pattern || null;
      }

      // processing_pattern が statement_extract、またはdocument_typeが明細系 → 明細分割エンジン
      if (processingPattern === 'statement_extract' || statementExtractTypes.includes(docTypeCode)) {
        console.log(`[仕訳生成] 明細分割モード: pattern=${processingPattern}, type=${docTypeCode}`);

        // 画像をBase64取得
        const storagePath = docRow?.storage_path || docRow?.file_path || '';
        let imageBase64 = '';
        let mimeType = 'image/jpeg';
        if (storagePath) {
          const { data: signedUrlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(storagePath, 600);
          if (signedUrlData?.signedUrl) {
            const imgRes = await fetch(signedUrlData.signedUrl);
            const buf = await imgRes.arrayBuffer();
            imageBase64 = Buffer.from(buf).toString('base64');
            const ct = imgRes.headers.get('content-type') || '';
            mimeType = ct.includes('pdf') ? 'application/pdf' : ct.includes('png') ? 'image/png' : 'image/jpeg';
          }
        }

        if (imageBase64) {
          const extractedLines = await extractMultipleEntries(imageBase64, mimeType, docTypeCode || 'bank_statement', industry);
          console.log(`[仕訳生成] 明細分割完了: ${extractedLines.length}行`);

          // 各行ごとに仕訳を生成してまとめて返却
          const multiEntries = [];
          for (const line of extractedLines) {
            const lineEntry = await generateJournalEntry({
              date: line.date || new Date().toISOString().split('T')[0],
              supplier: line.counterparty || line.description || '不明',
              amount: line.amount,
              tax_amount: null,
              tax_details: null,
              items: null,
              payment_method: docTypeCode === 'credit_card' ? 'credit_card' : docTypeCode === 'bank_statement' ? 'bank_transfer' : null,
              invoice_number: null,
              industry,
              account_items: accountItems,
              tax_categories: taxCategories,
            });

            const mappedLines = mapLinesToDBFormat(
              lineEntry.lines, accountItems, taxCategories, fallbackAccountId, suppliers, supplierAliases, itemsList
            );

            multiEntries.push({
              document_id,
              client_id,
              entry_date: line.date || new Date().toISOString().split('T')[0],
              category: lineEntry.category,
              notes: lineEntry.notes,
              confidence: line.confidence,
              reasoning: lineEntry.reasoning,
              lines: mappedLines,
              _raw_lines: lineEntry.lines,
              rule_matched: false,
              is_income: line.is_income,
            });
          }

          return res.json({
            success: true,
            message: `明細分割: ${multiEntries.length}件の仕訳が生成されました`,
            multi_entry: true,
            journal_entries: multiEntries,
          });
        }
      }
    }

    // 2.5b ルールマッチング（B1: ルールが先、マッチしなければGemini）
    const supplierName = ocr_result.extracted_supplier || '不明';
    const amount = ocr_result.extracted_amount || 0;

    // processing_rules を取得
    const { data: rulesData } = await supabaseAdmin
      .from('processing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    // クライアントの業種IDを取得（client_industries 中間テーブル）
    const { data: clientIndustries } = await supabaseAdmin
      .from('client_industries')
      .select('industry_id')
      .eq('client_id', client_id);

    // フォールバック: clients.industry_id も取得
    const { data: clientData } = await supabaseAdmin
      .from('clients')
      .select('industry_id')
      .eq('id', client_id)
      .single();

    const industryIds = [
      ...(clientIndustries?.map((ci: any) => ci.industry_id) || []),
      ...(clientData?.industry_id ? [clientData.industry_id] : []),
    ].filter((id, idx, arr) => arr.indexOf(id) === idx); // 重複除去

    let journalEntry!: GeneratedJournalEntry;
    let ruleMatched = false;
    let ruleCandidates: Array<{ rule_id: string; rule_name: string; scope: string; priority: number; account_item_id: string }> = [];

    if (rulesData && rulesData.length > 0) {
      const ruleMatchInput = {
        supplier: supplierName,
        amount: amount,
        description: ocr_result.extracted_items?.[0]?.name || ocr_result.extracted_supplier || '',
        client_id: client_id,
        industry_ids: industryIds,
        payment_method: ocr_result.extracted_payment_method || null,
        item_name: ocr_result.extracted_items?.[0]?.name || null,
        document_type: ocr_result.document_type || null,
        has_invoice_number: ocr_result.extracted_invoice_number ? true : null,
        tax_rate_hint: ocr_result.transactions?.[0]?.items?.[0]?.tax_rate
          ?? ocr_result.extracted_items?.[0]?.tax_rate ?? null,
        is_internal_tax: ocr_result.transactions?.[0]?.tax_included
          ?? ocr_result.tax_included ?? null,
        frequency_hint: null,
        tategaki: ocr_result.extracted_tategaki || null,
        withholding_tax_amount: ocr_result.extracted_withholding_tax ?? null,
        invoice_qualification: ocr_result.extracted_invoice_qualification || null,
        addressee: ocr_result.extracted_addressee || null,
        transaction_type: ocr_result.extracted_transaction_type || null,
        transfer_fee_bearer: ocr_result.extracted_transfer_fee_bearer || null,
      };

      const { matched, candidates } = matchProcessingRulesWithCandidates(rulesData, ruleMatchInput);
      ruleCandidates = candidates.map(c => ({
        rule_id: c.rule_id, rule_name: c.rule_name, scope: c.scope,
        priority: c.priority, account_item_id: c.account_item_id,
      }));

      if (matched) {
        // ルールマッチ → ルールベースで仕訳生成
        journalEntry = buildEntryFromRule(matched, {
          supplier: supplierName,
          amount: amount,
          tax_amount: ocr_result.extracted_tax_amount || null,
          payment_method: ocr_result.extracted_payment_method || null,
          date: ocr_result.extracted_date || new Date().toISOString().split('T')[0],
        }, accountItems, taxCategories);
        ruleMatched = true;

        // match_count と last_matched_at を更新
        await supabaseAdmin
          .from('processing_rules')
          .update({
            match_count: (rulesData.find(r => r.id === matched.rule_id)?.match_count || 0) + 1,
            last_matched_at: new Date().toISOString(),
          })
          .eq('id', matched.rule_id);

        console.log(`[仕訳生成] ✅ ルールマッチ完了: "${matched.rule_name}", confidence=${matched.confidence}`);
      }
    }

    if (!ruleMatched) {
      // 3. AI仕訳生成（ルールマッチしなかった場合のみ）
      console.log('[仕訳生成] Gemini AI 呼び出し中...', {
        supplier: supplierName,
        amount: amount,
        industry,
      });

      // 改善3-E: 修正履歴を取得してAIプロンプトに渡す
      let correctionHints: Array<{ supplier: string; original: string; corrected: string; count: number }> = [];
      const { data: corrections } = await supabaseAdmin
        .from('journal_entry_corrections')
        .select('supplier_name, original_name, corrected_name')
        .eq('client_id', client_id)
        .eq('field_name', 'account_item_id')
        .order('corrected_at', { ascending: false })
        .limit(50);
      if (corrections && corrections.length > 0) {
        const patternMap = new Map<string, { supplier: string; original: string; corrected: string; count: number }>();
        for (const c of corrections) {
          const key = `${c.supplier_name}|${c.corrected_name}`;
          const existing = patternMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            patternMap.set(key, {
              supplier: c.supplier_name || '不明',
              original: c.original_name || '不明',
              corrected: c.corrected_name || '不明',
              count: 1,
            });
          }
        }
        correctionHints = [...patternMap.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
      }

      journalEntry = await generateJournalEntry({
        date: ocr_result.extracted_date || new Date().toISOString().split('T')[0],
        supplier: supplierName,
        amount: amount,
        tax_amount: ocr_result.extracted_tax_amount,
        tax_details: ocr_result.transactions?.[0]?.tax_details || null,
        items: ocr_result.extracted_items,
        payment_method: ocr_result.extracted_payment_method || null,
        invoice_number: ocr_result.extracted_invoice_number || null,
        industry,
        account_items: accountItems,
        tax_categories: taxCategories,
        tategaki: ocr_result.extracted_tategaki || null,
        withholding_tax_amount: ocr_result.extracted_withholding_tax ?? null,
        invoice_qualification: ocr_result.extracted_invoice_qualification || null,
        transaction_type: ocr_result.extracted_transaction_type || null,
        transfer_fee_bearer: ocr_result.extracted_transfer_fee_bearer || null,
        correction_hints: correctionHints,
      });

      console.log(`[仕訳生成] ✅ AI完了: category="${journalEntry.category}", lines=${journalEntry.lines.length}件, confidence=${journalEntry.confidence}`);
    }

    // 4. UUID マッピング（取引先・品目マッチング含む）
    const mappedLines = mapLinesToDBFormat(
      journalEntry.lines,
      accountItems,
      taxCategories,
      fallbackAccountId,
      suppliers,
      supplierAliases,
      itemsList
    );
    console.log(`[仕訳生成] ✅ UUIDマッピング完了: ${mappedLines.length}件`);

    // 5-4(g): 貸借バランスチェック
    const balanceCheck = validateDebitCreditBalance(mappedLines.map(l => ({ debit_credit: l.debit_credit, amount: l.amount })));
    let balance_warning = null;
    if (!balanceCheck.isBalanced) {
      balance_warning = { message: `貸借不一致: 借方${balanceCheck.debitTotal}円 / 貸方${balanceCheck.creditTotal}円 (差額${balanceCheck.difference}円)`, ...balanceCheck };
      console.log(`[仕訳生成] ⚠️ 貸借不一致: 差額=${balanceCheck.difference}円`);
    }

    // 5-4(e): 取引先名寄せ
    let supplier_match = null;
    if (supplierName && organizationId) {
      const matchResult = await findSupplierAliasMatch(supabaseAdmin, supplierName, organizationId);
      if (matchResult.matchType !== 'none') {
        supplier_match = matchResult;
        console.log(`[仕訳生成] 取引先マッチ: "${matchResult.matchedSupplierName}" (${matchResult.matchType})`);
      }
    }

    // 5. レスポンス
    const entry = {
      document_id,
      client_id,
      entry_date: ocr_result.extracted_date || new Date().toISOString().split('T')[0],
      category: journalEntry.category,
      notes: journalEntry.notes,
      confidence: journalEntry.confidence,
      reasoning: journalEntry.reasoning,
      lines: mappedLines,
      _raw_lines: journalEntry.lines,
      rule_matched: ruleMatched,
    };

    // 通知: 仕訳生成完了
    if (organizationId) {
      // uploaded_by をドキュメントから取得
      const { data: docUploader } = await supabaseAdmin.from('documents').select('uploaded_by').eq('id', document_id).single();
      if (docUploader?.uploaded_by) {
        await createNotification({
          organizationId,
          userId: docUploader.uploaded_by,
          type: 'ocr_completed',
          title: 'AI仕訳生成が完了しました',
          message: `${supplierName} ¥${amount.toLocaleString()} の仕訳が生成されました${ruleMatched ? '（ルールマッチ）' : ''}`,
          entityType: 'document',
          entityId: document_id,
        });
      }
    }

    res.json({
      success: true,
      message: '仕訳が生成されました',
      journal_entry: entry,
      balance_warning,
      supplier_match,
      rule_candidates: ruleCandidates,
    });
  } catch (error: any) {
    console.error('[仕訳生成] ❌ 予期しないエラー:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

export default router;
