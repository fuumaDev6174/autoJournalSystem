import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import {
  processOCR,
  generateJournalEntry,
  exportToFreee,
  mapLinesToDBFormat,
  matchProcessingRules,
  buildEntryFromRule,
  classifyDocument,
  extractMultipleEntries,
} from './services.js';
import type { AccountItemRef, TaxCategoryRef, GeneratedJournalEntry } from './services.js';

const router = express.Router();

// UUID形式バリデーション
const isValidUUID = (str: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// ============================================
// Supabase サーバーサイドクライアント（service_role で RLS バイパス）
// ============================================
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 起動時の環境変数診断ログ
console.log('=== Supabase 環境変数診断 ===');
console.log(`  SUPABASE_URL:              ${supabaseUrl ? '✅ 設定済み' : '❌ 未設定'}`);
console.log(`  VITE_SUPABASE_URL:         ${process.env.VITE_SUPABASE_URL ? '✅ 設定済み' : '（未設定 - フォールバック対象）'}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY:  ${supabaseServiceKey ? '✅ 設定済み' : '❌ 未設定'}`);
console.log('============================');

if (!supabaseUrl) {
  console.error('⚠️  SUPABASE_URL も VITE_SUPABASE_URL も設定されていません。マスタ取得が全て失敗します。');
}
if (!supabaseServiceKey) {
  console.error('⚠️  SUPABASE_SERVICE_ROLE_KEY が設定されていません。RLS バイパスできず、全クエリが失敗します。');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================
// マスタデータ取得ヘルパー（全てエラーログ付き）
// ============================================

/** client_id → organization_id を解決 */
async function getOrganizationId(clientId: string): Promise<string | null> {
  console.log(`[getOrganizationId] client_id="${clientId}" で clients テーブルを検索中...`);

  const { data, error, status, statusText } = await supabaseAdmin
    .from('clients')
    .select('organization_id')
    .eq('id', clientId)
    .single();

  if (error) {
    console.error(`[getOrganizationId] ❌ Supabase エラー:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      httpStatus: status,
      httpStatusText: statusText,
    });
    return null;
  }

  if (!data) {
    console.warn(`[getOrganizationId] ⚠️ client_id="${clientId}" のレコードが見つかりません (data=null)`);
    return null;
  }

  console.log(`[getOrganizationId] ✅ organization_id="${data.organization_id}"`);
  return data.organization_id || null;
}

/** 勘定科目を取得（組織固有 + 共通マスタ(organization_id=NULL)） */
async function fetchAccountItems(organizationId: string): Promise<AccountItemRef[]> {
  console.log(`[fetchAccountItems] organization_id="${organizationId}" で勘定科目を取得中（共通マスタ含む）...`);

  const { data, error, status } = await supabaseAdmin
    .from('account_items')
    .select('id, code, name, category:account_categories(name)')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    console.error(`[fetchAccountItems] ❌ Supabase エラー:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      httpStatus: status,
    });
    return [];
  }

  const items = (data || []).map((item: any) => ({
    id: item.id,
    code: item.code || '',
    name: item.name,
    category: item.category?.name || 'expense',
  }));

  console.log(`[fetchAccountItems] ✅ ${items.length}件の勘定科目を取得`);
  return items;
}

/** 税区分を取得（tax_rates を JOIN して税率を取得） */
async function fetchTaxCategories(): Promise<TaxCategoryRef[]> {
  console.log(`[fetchTaxCategories] 税区分マスタを取得中（tax_rates JOIN）...`);

  const { data, error, status } = await supabaseAdmin
    .from('tax_categories')
    .select('id, code, name, tax_rate:tax_rates!current_tax_rate_id(rate)')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) {
    // FK名が違う場合のフォールバック: tax_rates を JOIN せずに取得
    console.warn(`[fetchTaxCategories] ⚠️ JOIN エラー（FK名不一致の可能性）:`, error.message);
    console.log(`[fetchTaxCategories] フォールバック: tax_rates なしで取得中...`);

    const { data: fallbackData, error: fallbackError } = await supabaseAdmin
      .from('tax_categories')
      .select('id, code, name, current_tax_rate_id')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (fallbackError) {
      console.error(`[fetchTaxCategories] ❌ フォールバックも失敗:`, fallbackError.message);
      return [];
    }

    // current_tax_rate_id を使って tax_rates を個別取得
    const rateIds = [...new Set((fallbackData || []).map((t: any) => t.current_tax_rate_id).filter(Boolean))];
    let rateMap: Record<string, number> = {};

    if (rateIds.length > 0) {
      const { data: rates } = await supabaseAdmin
        .from('tax_rates')
        .select('id, rate')
        .in('id', rateIds);

      if (rates) {
        rateMap = Object.fromEntries(rates.map((r: any) => [r.id, Number(r.rate)]));
      }
    }

    const categories = (fallbackData || []).map((item: any) => ({
      id: item.id,
      code: item.code || '',
      name: item.name,
      rate: item.current_tax_rate_id ? (rateMap[item.current_tax_rate_id] || 0) : 0,
    }));

    console.log(`[fetchTaxCategories] ✅ ${categories.length}件の税区分を取得（フォールバック）`);
    return categories;
  }

  const categories = (data || []).map((item: any) => ({
    id: item.id,
    code: item.code || '',
    name: item.name,
    rate: Number(item.tax_rate?.rate) || 0,
  }));

  console.log(`[fetchTaxCategories] ✅ ${categories.length}件の税区分を取得`);
  return categories;
}

/** 「雑費」のフォールバック用 UUID を取得 */
async function findFallbackAccountId(organizationId: string): Promise<string> {
  // organization固有 → 共通(null) の順で検索
  const { data, error } = await supabaseAdmin
    .from('account_items')
    .select('id')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .eq('name', '雑費')
    .eq('is_active', true)
    .limit(1);

  if (error) {
    console.warn(`[findFallbackAccountId] 「雑費」が見つかりません:`, error.message);
    return '';
  }

  const fallbackId = data?.[0]?.id || '';
  console.log(`[findFallbackAccountId] ✅ 雑費 ID="${fallbackId}"`);
  return fallbackId;
}

// ============================================
// アップロードディレクトリの設定
// ============================================
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer設定
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('画像ファイル（JPEG, PNG, WebP, PDF）のみアップロード可能です'));
    }
  },
});

// ============================================
// 証憑アップロードAPI
// ============================================

router.post('/documents/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }
    const { client_id, uploaded_by } = req.body;
    if (!client_id || !uploaded_by) {
      return res.status(400).json({ error: 'client_idとuploaded_byは必須です' });
    }
    const document = {
      id: `doc-${Date.now()}`,
      client_id,
      uploaded_by,
      file_path: req.file.path,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      file_size: req.file.size,
      upload_date: new Date().toISOString().split('T')[0],
      ocr_status: 'pending',
      created_at: new Date().toISOString(),
    };
    res.json({ success: true, message: 'ファイルがアップロードされました', document });
  } catch (error: any) {
    console.error('アップロードエラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OCR処理API
// ============================================

router.post('/ocr/process', async (req: Request, res: Response) => {
  try {
    const { document_id, file_url, file_path } = req.body;
    const targetUrl = file_url || file_path;
    if (!document_id || !targetUrl) {
      return res.status(400).json({ error: 'document_idとfile_url（またはfile_path）は必須です' });
    }
    if (!isValidUUID(document_id)) {
      return res.status(400).json({ error: 'document_idが不正な形式です' });
    }

    console.log(`[OCR] 処理開始: document_id="${document_id}"`);

    // Step 0: 画像をBase64に変換（classifyDocumentでも使用）
    const fetchRes = await fetch(targetUrl);
    if (!fetchRes.ok) throw new Error(`画像の取得に失敗: ${fetchRes.status}`);
    const arrayBuffer = await fetchRes.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
    const ext = targetUrl.split('?')[0].split('.').pop()?.toLowerCase();
    const mimeType =
      ext === 'pdf' || contentType.includes('pdf') ? 'application/pdf' :
      ext === 'png' || contentType.includes('png') ? 'image/png' :
      ext === 'webp' || contentType.includes('webp') ? 'image/webp' : 'image/jpeg';

    // Step 1: 証憑種別の自動判定
    const classification = await classifyDocument(imageBase64, mimeType);
    console.log(`[OCR] Step 1 判定: ${classification.document_type_code} (confidence=${classification.confidence})`);

    // documents テーブルに判定結果を保存
    await supabaseAdmin.from('documents').update({
      doc_classification: classification,
      ocr_step1_type: classification.document_type_code,
      ocr_step1_confidence: classification.confidence,
      ocr_step: 'step1',
    }).eq('id', document_id);

    // document_type_id を設定（document_typesテーブルからcodeで検索）
    const { data: docType } = await supabaseAdmin
      .from('document_types')
      .select('id, requires_journal')
      .eq('code', classification.document_type_code)
      .single();

    if (docType) {
      await supabaseAdmin.from('documents').update({
        document_type_id: docType.id,
      }).eq('id', document_id);

      // 非仕訳対象 かつ confidence >= 0.8 → Step 2スキップ
      if (!docType.requires_journal && classification.confidence >= 0.8) {
        console.log(`[OCR] 非仕訳対象 (confidence=${classification.confidence}) → Step 2スキップ`);
        await supabaseAdmin.from('documents').update({
          ocr_status: 'completed',
          ocr_step: 'step1',
          status: 'excluded',
        }).eq('id', document_id);
        return res.json({
          success: true,
          skipped: true,
          classification,
          message: '非仕訳対象のためOCRスキップ',
        });
      }
    }

    // Step 2: フルOCR（既存のprocessOCR処理）に進む
    await supabaseAdmin.from('documents').update({ ocr_step: 'step2' }).eq('id', document_id);

    const ocrResult = await processOCR(targetUrl);
    console.log(`[OCR] ✅ 完了: supplier="${ocrResult.extracted_supplier}", amount=${ocrResult.extracted_amount}, confidence=${ocrResult.confidence_score}`);

    res.json({
      success: true,
      message: 'OCR処理が完了しました',
      classification,
      ocr_result: {
        id: `ocr-${Date.now()}`,
        document_id,
        ...ocrResult,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[OCR] ❌ エラー:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
          supabase_url_set: !!supabaseUrl,
          service_key_set: !!supabaseServiceKey,
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

    // industry_closure で全祖先IDを取得（階層遡り）
    let industryIdsWithAncestors: string[] = [...industryIds];
    const industryDepths = new Map<string, number>();
    
    if (industryIds.length > 0) {
      const { data: closureData } = await supabaseAdmin
        .from('industry_closure')
        .select('ancestor_id, descendant_id, depth')
        .in('descendant_id', industryIds);
      
      if (closureData) {
        for (const row of closureData) {
          if (!industryIdsWithAncestors.includes(row.ancestor_id)) {
            industryIdsWithAncestors.push(row.ancestor_id);
          }
          // depthマップ: 同一ancestor_idに複数descendantがある場合は最小depthを採用
          const existing = industryDepths.get(row.ancestor_id);
          if (existing == null || row.depth < existing) {
            industryDepths.set(row.ancestor_id, row.depth);
          }
        }
      }
    }

    let journalEntry!: GeneratedJournalEntry;
    let ruleMatched = false;

    if (rulesData && rulesData.length > 0) {
      const matched = matchProcessingRules(rulesData, {
        supplier: supplierName,
        amount: amount,
        description: ocr_result.extracted_supplier || '',
        client_id: client_id,
        industry_ids: industryIds,
        industry_ids_with_ancestors: industryIdsWithAncestors,
        industry_depths: industryDepths,
        payment_method: ocr_result.extracted_payment_method || null,
        item_name: null,  // OCR結果から品目名を取得する場合はここに渡す
        document_type: ocr_result.document_type || null,
        has_invoice_number: ocr_result.transactions?.[0]?.invoice_number ? true : null,
        tax_rate_hint: null,
        is_internal_tax: null,
        frequency_hint: null,
      });

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

    res.json({
      success: true,
      message: '仕訳が生成されました',
      journal_entry: entry,
    });
  } catch (error: any) {
    console.error('[仕訳生成] ❌ 予期しないエラー:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// freeeエクスポートAPI
// ============================================

router.post('/freee/export', async (req: Request, res: Response) => {
  try {
    const { journal_entries } = req.body;
    if (!journal_entries || !Array.isArray(journal_entries)) {
      return res.status(400).json({ error: 'journal_entriesは配列である必要があります' });
    }
    const transactions = journal_entries.map((entry: any) => ({
      issue_date: entry.entry_date,
      type: 'expense' as 'income' | 'expense',
      amount: entry.amount || 0,
      description: entry.notes || '',
      account_item_id: 0,
      tax_code: 0,
    }));
    const result = await exportToFreee(transactions);
    res.json({ success: result.success, message: result.message, exported_count: result.exported_count });
  } catch (error: any) {
    console.error('freeeエクスポートエラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 一括処理API
// ============================================

router.post('/process/batch', upload.array('files', 500), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }
    const { client_id, uploaded_by, industry } = req.body;
    if (!client_id || !uploaded_by) {
      return res.status(400).json({ error: 'client_idとuploaded_byは必須です' });
    }

    console.log(`[バッチ] 処理開始: ${files.length}件, client_id="${client_id}"`);

    const organizationId = await getOrganizationId(client_id);
    if (!organizationId) {
      return res.status(400).json({
        error: '指定された client_id に紐づく組織が見つかりません',
        debug: { client_id, supabase_url_set: !!supabaseUrl, service_key_set: !!supabaseServiceKey },
      });
    }

    const [accountItems, taxCategories, fallbackAccountId, bSuppData, bAliasData, bItemsData] = await Promise.all([
      fetchAccountItems(organizationId),
      fetchTaxCategories(),
      findFallbackAccountId(organizationId),
      supabaseAdmin.from('suppliers').select('id, name').eq('organization_id', organizationId).eq('is_active', true),
      supabaseAdmin.from('supplier_aliases').select('supplier_id, alias_name'),
      supabaseAdmin.from('items').select('id, name').eq('is_active', true).or(`organization_id.eq.${organizationId},organization_id.is.null`),
    ]);
    const bSuppliers = bSuppData.data || [];
    const bAliases = bAliasData.data || [];
    const bItems = bItemsData.data || [];

    const results = [];
    for (const file of files) {
      try {
        console.log(`[バッチ] 処理中: ${file.originalname}`);
        const ocrResult = await processOCR(file.path);
        const journalEntry = await generateJournalEntry({
          date: ocrResult.extracted_date || new Date().toISOString().split('T')[0],
          supplier: ocrResult.extracted_supplier || '不明',
          amount: ocrResult.extracted_amount || 0,
          tax_amount: ocrResult.extracted_tax_amount,
          tax_details: ocrResult.transactions?.[0]?.tax_details || null,
          items: ocrResult.extracted_items,
          payment_method: ocrResult.extracted_payment_method || null,
          invoice_number: ocrResult.extracted_invoice_number || null,
          industry,
          account_items: accountItems,
          tax_categories: taxCategories,
        });
        const mappedLines = mapLinesToDBFormat(journalEntry.lines, accountItems, taxCategories, fallbackAccountId, bSuppliers, bAliases, bItems);
        results.push({
          file_name: file.originalname,
          success: true,
          ocr: ocrResult,
          journal_entry: { entry_date: ocrResult.extracted_date, category: journalEntry.category, notes: journalEntry.notes, confidence: journalEntry.confidence, reasoning: journalEntry.reasoning, lines: mappedLines },
        });
        console.log(`[バッチ] ✅ 完了: ${file.originalname}`);
      } catch (error: any) {
        console.error(`[バッチ] ❌ エラー (${file.originalname}):`, error.message);
        results.push({ file_name: file.originalname, success: false, error: error.message });
      } finally {
        // tempファイルをディスクから削除
        try { fs.unlinkSync(file.path); } catch { /* already cleaned */ }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    console.log(`[バッチ] 完了: 成功=${successCount}, 失敗=${failureCount}`);

    res.json({ success: true, message: `${successCount}件処理完了、${failureCount}件失敗`, total: files.length, success_count: successCount, failure_count: failureCount, results });
  } catch (error: any) {
    console.error('[バッチ] ❌ エラー:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ヘルスチェックAPI（Supabase 接続テスト付き）
// ============================================

router.get('/health', async (req: Request, res: Response) => {
  let supabaseConnected = false;
  let supabaseTestError: string | null = null;
  let testRowCount: number | null = null;

  try {
    const { data, error, count } = await supabaseAdmin
      .from('organizations')
      .select('id', { count: 'exact' })
      .limit(1);

    if (error) {
      supabaseTestError = `${error.code}: ${error.message}`;
    } else {
      supabaseConnected = true;
      testRowCount = count;
    }
  } catch (e: any) {
    supabaseTestError = e.message;
  }

  res.json({
    status: 'ok',
    message: 'APIサーバーは正常に動作しています',
    timestamp: new Date().toISOString(),
    gemini: {
      configured: !!process.env.GEMINI_API_KEY,
      model_ocr: process.env.GEMINI_MODEL_OCR || 'gemini-3-flash-preview',
      model_journal: process.env.GEMINI_MODEL_JOURNAL || 'gemini-3.1-pro-preview',
    },
    supabase: {
      url_set: !!supabaseUrl,
      service_key_set: !!supabaseServiceKey,
      connected: supabaseConnected,
      organizations_count: testRowCount,
      error: supabaseTestError,
    },
    env_check: {
      SUPABASE_URL: supabaseUrl ? '✅' : '❌',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? '✅' : '❌',
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? '✅' : '❌',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '✅' : '❌',
    },
  });
});

export default router;