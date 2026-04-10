// 仕訳生成パイプライン: ルールマッチ → AI生成 → UUIDマッピング → バランスチェック → 取引先名寄せ

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';
import { STATEMENT_EXTRACT_TYPES, STATEMENT_PAYMENT_METHOD } from '../../shared/constants/accounting.js';
import { generateJournalEntry } from './ai-generator.service.js';
import { mapLinesToDBFormat } from './line-mapper.service.js';
import { buildEntryFromRule } from './rule-generator.service.js';
import { matchProcessingRulesWithCandidates } from '../rule-engine/matcher-with-candidates.js';
import { extractMultipleEntries } from '../ocr/multi-extractor.service.js';
import { findSupplierAliasMatch } from '../document/supplier-matcher.js';
import { validateDebitCreditBalance } from '../accounting/balance-validator.js';
import { getOrganizationId, fetchAccountItems, fetchTaxCategories, findFallbackAccountId } from '../master/master-data.service.js';
import { createNotification } from '../notification/notification.service.js';
import type { GeneratedJournalEntry } from './journal.types.js';
import type { AccountItemRef, TaxCategoryRef } from './journal.types.js';

export interface PipelineInput {
  document_id: string;
  client_id: string;
  ocr_result: Record<string, any>;
  industry?: string;
  organization_id: string;
}

export interface PipelineResult {
  success: boolean;
  message: string;
  multi_entry?: boolean;
  journal_entry?: Record<string, unknown>;
  journal_entries?: Record<string, unknown>[];
  balance_warning?: Record<string, unknown> | null;
  supplier_match?: Record<string, unknown> | null;
  rule_candidates?: Array<{ rule_id: string; rule_name: string; scope: string; priority: number; account_item_id: string }>;
}

interface MasterData {
  accountItems: AccountItemRef[];
  taxCategories: TaxCategoryRef[];
  fallbackAccountId: string;
  suppliers: Array<{ id: string; name: string }>;
  supplierAliases: Array<{ supplier_id: string; alias_name: string }>;
  items: Array<{ id: string; name: string }>;
}

async function loadMasterData(organizationId: string): Promise<MasterData> {
  const [accountItems, taxCategories, fallbackAccountId, suppliersData, aliasesData, itemsData] = await Promise.all([
    fetchAccountItems(organizationId),
    fetchTaxCategories(),
    findFallbackAccountId(organizationId),
    supabaseAdmin.from('suppliers').select('id, name').eq('organization_id', organizationId).eq('is_active', true),
    supabaseAdmin.from('supplier_aliases').select('supplier_id, alias_name, suppliers!inner(organization_id)').eq('suppliers.organization_id', organizationId),
    supabaseAdmin.from('items').select('id, name').eq('is_active', true).or(`organization_id.eq.${organizationId},organization_id.is.null`),
  ]);
  return {
    accountItems,
    taxCategories,
    fallbackAccountId,
    suppliers: suppliersData.data || [],
    supplierAliases: aliasesData.data || [],
    items: itemsData.data || [],
  };
}

// 明細分割モード: 通帳・クレカ等の複数行書類を行ごとに仕訳生成
async function processStatementExtract(
  input: PipelineInput, master: MasterData, docTypeCode: string, storagePath: string,
): Promise<PipelineResult | null> {
  if (!storagePath) return null;

  const { data: signedUrlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(storagePath, 600);
  if (!signedUrlData?.signedUrl) return null;

  const imgRes = await fetch(signedUrlData.signedUrl);
  const buf = await imgRes.arrayBuffer();
  const imageBase64 = Buffer.from(buf).toString('base64');
  const ct = imgRes.headers.get('content-type') || '';
  const mimeType = ct.includes('pdf') ? 'application/pdf' : ct.includes('png') ? 'image/png' : 'image/jpeg';

  const multiResult = await extractMultipleEntries(imageBase64, mimeType, docTypeCode || 'bank_statement', input.industry);
  if (multiResult.error) console.error(`[仕訳生成] 明細分割エラー: ${multiResult.error}`);

  const entries = [];
  for (const line of multiResult.lines) {
    const lineEntry = await generateJournalEntry({
      date: line.date || new Date().toISOString().split('T')[0],
      supplier: line.counterparty || line.description || '不明',
      amount: line.amount, tax_amount: null, tax_details: null, items: null,
      payment_method: STATEMENT_PAYMENT_METHOD[docTypeCode || ''] ?? null,
      invoice_number: null, industry: input.industry,
      account_items: master.accountItems, tax_categories: master.taxCategories,
    });
    const mappedLines = mapLinesToDBFormat(
      lineEntry.lines, master.accountItems, master.taxCategories,
      master.fallbackAccountId, master.suppliers, master.supplierAliases, master.items,
    );
    entries.push({
      document_id: input.document_id, client_id: input.client_id,
      entry_date: line.date || new Date().toISOString().split('T')[0],
      category: lineEntry.category, notes: lineEntry.notes,
      confidence: line.confidence, reasoning: lineEntry.reasoning,
      lines: mappedLines, _raw_lines: lineEntry.lines,
      rule_matched: false, is_income: line.is_income,
    });
  }

  return {
    success: true,
    message: `明細分割: ${entries.length}件の仕訳が生成されました`,
    multi_entry: true,
    journal_entries: entries,
  };
}

// 単一仕訳: ルールマッチ → AI フォールバック
async function processSingleEntry(
  input: PipelineInput, master: MasterData,
): Promise<{ entry: GeneratedJournalEntry; ruleMatched: boolean; ruleCandidates: Array<{ rule_id: string; rule_name: string; scope: string; priority: number; account_item_id: string }> }> {
  const { ocr_result, client_id, industry } = input;
  const supplierName = ocr_result.extracted_supplier || '不明';
  const amount = ocr_result.extracted_amount || 0;

  const { data: rulesData } = await supabaseAdmin.from('processing_rules').select('*').eq('is_active', true).order('priority', { ascending: true });
  const { data: clientIndustries } = await supabaseAdmin.from('client_industries').select('industry_id').eq('client_id', client_id);
  const { data: clientData } = await supabaseAdmin.from('clients').select('industry_id').eq('id', client_id).single();

  const industryIds = [
    ...(clientIndustries?.map((ci: any) => ci.industry_id) || []),
    ...(clientData?.industry_id ? [clientData.industry_id] : []),
  ].filter((id: string, idx: number, arr: string[]) => arr.indexOf(id) === idx);

  let entry!: GeneratedJournalEntry;
  let ruleMatched = false;
  let ruleCandidates: Array<{ rule_id: string; rule_name: string; scope: string; priority: number; account_item_id: string }> = [];

  if (rulesData && rulesData.length > 0) {
    const matchInput = {
      supplier: supplierName, amount, client_id, industry_ids: industryIds,
      description: ocr_result.extracted_items?.[0]?.name || supplierName,
      payment_method: ocr_result.extracted_payment_method || null,
      item_name: ocr_result.extracted_items?.[0]?.name || null,
      document_type: ocr_result.document_type || null,
      has_invoice_number: ocr_result.extracted_invoice_number ? true : null,
      tax_rate_hint: ocr_result.transactions?.[0]?.items?.[0]?.tax_rate ?? ocr_result.extracted_items?.[0]?.tax_rate ?? null,
      is_internal_tax: ocr_result.transactions?.[0]?.tax_included ?? ocr_result.tax_included ?? null,
      frequency_hint: null,
      tategaki: ocr_result.extracted_tategaki || null,
      withholding_tax_amount: ocr_result.extracted_withholding_tax ?? null,
      invoice_qualification: ocr_result.extracted_invoice_qualification || null,
      addressee: ocr_result.extracted_addressee || null,
      transaction_type: ocr_result.extracted_transaction_type || null,
      transfer_fee_bearer: ocr_result.extracted_transfer_fee_bearer || null,
    };

    const { matched, candidates } = matchProcessingRulesWithCandidates(rulesData, matchInput);
    ruleCandidates = candidates.map(c => ({ rule_id: c.rule_id, rule_name: c.rule_name, scope: c.scope, priority: c.priority, account_item_id: c.account_item_id }));

    if (matched) {
      entry = buildEntryFromRule(matched, {
        supplier: supplierName, amount,
        tax_amount: ocr_result.extracted_tax_amount || null,
        payment_method: ocr_result.extracted_payment_method || null,
        date: ocr_result.extracted_date || new Date().toISOString().split('T')[0],
      }, master.accountItems, master.taxCategories);
      ruleMatched = true;

      await supabaseAdmin.from('processing_rules').update({
        match_count: (rulesData.find(r => r.id === matched.rule_id)?.match_count || 0) + 1,
        last_matched_at: new Date().toISOString(),
      }).eq('id', matched.rule_id);
    }
  }

  if (!ruleMatched) {
    // 修正パターンヒントを取得
    let correctionHints: Array<{ supplier: string; original: string; corrected: string; count: number }> = [];
    const { data: corrections } = await supabaseAdmin.from('journal_entry_corrections')
      .select('supplier_name, original_name, corrected_name')
      .eq('client_id', client_id).eq('field_name', 'account_item_id')
      .order('corrected_at', { ascending: false }).limit(20);

    if (corrections && corrections.length > 0) {
      const patternMap = new Map<string, { supplier: string; original: string; corrected: string; count: number }>();
      for (const c of corrections) {
        const key = `${c.supplier_name}|${c.corrected_name}`;
        const existing = patternMap.get(key);
        if (existing) existing.count++;
        else patternMap.set(key, { supplier: c.supplier_name || '不明', original: c.original_name || '不明', corrected: c.corrected_name || '不明', count: 1 });
      }
      correctionHints = [...patternMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    }

    entry = await generateJournalEntry({
      date: ocr_result.extracted_date || new Date().toISOString().split('T')[0],
      supplier: supplierName, amount, tax_amount: ocr_result.extracted_tax_amount,
      tax_details: ocr_result.transactions?.[0]?.tax_details || null,
      items: ocr_result.extracted_items, payment_method: ocr_result.extracted_payment_method || null,
      invoice_number: ocr_result.extracted_invoice_number || null, industry,
      account_items: master.accountItems, tax_categories: master.taxCategories,
      tategaki: ocr_result.extracted_tategaki || null,
      withholding_tax_amount: ocr_result.extracted_withholding_tax ?? null,
      invoice_qualification: ocr_result.extracted_invoice_qualification || null,
      transaction_type: ocr_result.extracted_transaction_type || null,
      transfer_fee_bearer: ocr_result.extracted_transfer_fee_bearer || null,
      correction_hints: correctionHints,
    });
  }

  return { entry, ruleMatched, ruleCandidates };
}

export async function processJournalGeneration(input: PipelineInput): Promise<PipelineResult> {
  const { document_id, client_id, ocr_result, organization_id } = input;
  const master = await loadMasterData(organization_id);
  const docTypeCode = ocr_result.document_type || null;

  // 明細分割判定
  const { data: docRow } = await supabaseAdmin.from('documents').select('document_type_id, storage_path, file_path').eq('id', document_id).single();
  let processingPattern: string | null = null;
  if (docRow?.document_type_id) {
    const { data: dtRow } = await supabaseAdmin.from('document_types').select('processing_pattern').eq('id', docRow.document_type_id).single();
    processingPattern = dtRow?.processing_pattern || null;
  }

  if (processingPattern === 'statement_extract' || STATEMENT_EXTRACT_TYPES.includes(docTypeCode as any)) {
    const storagePath = docRow?.storage_path || docRow?.file_path || '';
    const multiResult = await processStatementExtract(input, master, docTypeCode, storagePath);
    if (multiResult) return multiResult;
  }

  // 単一仕訳モード
  const { entry: journalEntry, ruleMatched, ruleCandidates } = await processSingleEntry(input, master);
  const supplierName = ocr_result.extracted_supplier || '不明';
  const amount = ocr_result.extracted_amount || 0;

  const mappedLines = mapLinesToDBFormat(
    journalEntry.lines, master.accountItems, master.taxCategories,
    master.fallbackAccountId, master.suppliers, master.supplierAliases, master.items,
  );

  const balanceCheck = validateDebitCreditBalance(mappedLines.map(l => ({ debit_credit: l.debit_credit, amount: l.amount })));
  const balance_warning = balanceCheck.isBalanced ? null : { message: `貸借不一致: 借方${balanceCheck.debitTotal}円 / 貸方${balanceCheck.creditTotal}円`, ...balanceCheck };

  let supplier_match = null;
  if (supplierName && organization_id) {
    const matchResult = await findSupplierAliasMatch(supabaseAdmin, supplierName, organization_id);
    if (matchResult.matchType !== 'none') supplier_match = matchResult;
  }

  // 通知
  const { data: docUploader } = await supabaseAdmin.from('documents').select('uploaded_by').eq('id', document_id).single();
  if (docUploader?.uploaded_by) {
    await createNotification({
      organizationId: organization_id, userId: docUploader.uploaded_by,
      type: 'ocr_completed', title: 'AI仕訳生成が完了しました',
      message: `${supplierName} ¥${amount.toLocaleString()} の仕訳が生成されました${ruleMatched ? '（ルールマッチ）' : ''}`,
      entityType: 'document', entityId: document_id,
    });
  }

  return {
    success: true, message: '仕訳が生成されました',
    journal_entry: {
      document_id, client_id,
      entry_date: ocr_result.extracted_date || new Date().toISOString().split('T')[0],
      category: journalEntry.category, notes: journalEntry.notes,
      confidence: journalEntry.confidence, reasoning: journalEntry.reasoning,
      lines: mappedLines, _raw_lines: journalEntry.lines, rule_matched: ruleMatched,
    },
    balance_warning, supplier_match, rule_candidates: ruleCandidates,
  };
}
