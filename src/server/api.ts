import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  processOCR,
  generateJournalEntry,
  exportToFreee,
  mapLinesToDBFormat,
  matchProcessingRules,
  matchProcessingRulesWithCandidates,
  buildEntryFromRule,
  classifyDocument,
  extractMultipleEntries,
  checkDocumentDuplicate,
  findSupplierAliasMatch,
  validateDebitCreditBalance,
  checkReceiptDuplicate,
  validateJournalBalance,
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
// 通知作成ヘルパー (Task 5-1)
// ============================================
async function createNotification(params: {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  linkUrl?: string;
}) {
  try {
    await supabaseAdmin.from('notifications').insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      link_url: params.linkUrl || null,
    });
  } catch (e: any) {
    console.error('[通知] 作成エラー:', e.message);
  }
}

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

    // 5-4(a): ハッシュベース重複チェック
    const { data: docRow } = await supabaseAdmin.from('documents').select('hash_value, client_id').eq('id', document_id).single();
    let duplicate_warning = null;
    if (docRow?.hash_value) {
      const dupResult = await checkDocumentDuplicate(supabaseAdmin, docRow.hash_value, docRow.client_id, document_id);
      if (dupResult.isDuplicate) {
        duplicate_warning = { message: `同一ファイルが既に登録されています: ${dupResult.duplicateFileName}`, duplicateDocId: dupResult.duplicateDocId };
        console.log(`[OCR] ⚠️ 重複検出: ${dupResult.duplicateFileName}`);
      }
    }

    // 5-4(l): 内容ベース重複チェック
    let receipt_duplicate_warning = null;
    if (docRow?.client_id && ocrResult.extracted_amount) {
      const receiptDup = await checkReceiptDuplicate(
        supabaseAdmin, docRow.client_id, ocrResult.extracted_amount,
        ocrResult.extracted_date || null, ocrResult.extracted_supplier || null, document_id,
      );
      if (receiptDup.possibleDuplicates.length > 0) {
        receipt_duplicate_warning = { message: `類似の証憑が${receiptDup.possibleDuplicates.length}件見つかりました`, duplicates: receiptDup.possibleDuplicates };
        console.log(`[OCR] ⚠️ 類似証憑検出: ${receiptDup.possibleDuplicates.length}件`);
      }
    }

    // 通知: OCR完了
    if (docRow?.client_id) {
      const { data: clientInfo } = await supabaseAdmin.from('clients').select('organization_id').eq('id', docRow.client_id).single();
      const { data: docInfo } = await supabaseAdmin.from('documents').select('uploaded_by').eq('id', document_id).single();
      if (clientInfo?.organization_id && docInfo?.uploaded_by) {
        await createNotification({
          organizationId: clientInfo.organization_id,
          userId: docInfo.uploaded_by,
          type: 'ocr_completed',
          title: 'OCR処理が完了しました',
          message: `証憑 ${ocrResult.extracted_supplier || document_id} のOCR読取が完了しました`,
          entityType: 'document',
          entityId: document_id,
        });
      }
    }

    res.json({
      success: true,
      message: 'OCR処理が完了しました',
      classification,
      duplicate_warning,
      receipt_duplicate_warning,
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
        tax_rate_hint: ocr_result.transactions?.[0]?.items?.[0]?.tax_rate ?? null,
        is_internal_tax: ocr_result.transactions?.[0]?.tax_included ?? null,
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

// ============================================
// freeeエクスポートAPI
// ============================================

router.post('/freee/export', async (req: Request, res: Response) => {
  try {
    const { journal_entries } = req.body;
    if (!journal_entries || !Array.isArray(journal_entries)) {
      return res.status(400).json({ error: 'journal_entriesは配列である必要があります' });
    }

    // freee接続情報を取得
    const { data: conn } = await supabaseAdmin.from('freee_connections')
      .select('access_token, freee_company_id, token_expires_at')
      .eq('sync_status', 'active').limit(1).single();
    if (!conn) {
      return res.status(400).json({ error: 'freeeに接続されていません。設定画面からfreee連携を行ってください。' });
    }
    // トークン期限チェック
    if (new Date(conn.token_expires_at) < new Date()) {
      return res.status(401).json({ error: 'freeeのアクセストークンが期限切れです。設定画面からトークンをリフレッシュしてください。' });
    }

    // freee勘定科目マッピングの取得（account_items.freee_account_item_id）
    const freeeAccountMap = new Map<string, number>();
    const accountIds = [...new Set(
      journal_entries.flatMap((e: any) => (e.lines || []).map((l: any) => l.account_item_id)).filter(Boolean)
    )];
    if (accountIds.length > 0) {
      const { data: accountMappings } = await supabaseAdmin
        .from('account_items')
        .select('id, freee_account_item_id')
        .in('id', accountIds)
        .not('freee_account_item_id', 'is', null);
      if (accountMappings) {
        for (const m of accountMappings) {
          freeeAccountMap.set(m.id, Number(m.freee_account_item_id));
        }
      }
    }

    // 税区分コードマッピングの取得
    const freeTaxCodeMap = new Map<string, number>();
    const taxCatIds = [...new Set(
      journal_entries.flatMap((e: any) => (e.lines || []).map((l: any) => l.tax_category_id)).filter(Boolean)
    )];
    if (taxCatIds.length > 0) {
      const { data: taxMappings } = await supabaseAdmin
        .from('tax_categories')
        .select('id, code')
        .in('id', taxCatIds);
      if (taxMappings) {
        const taxCodeLookup: Record<string, number> = {
          'TAX_10': 116, 'TAX_8_REDUCED': 120, 'TAX_EXEMPT': 0,
          'NON_TAXABLE': 0, 'NOT_APPLICABLE': 0,
          'TAX_10_PURCHASE': 133, 'TAX_8_REDUCED_PURCHASE': 137,
        };
        for (const t of taxMappings) {
          freeTaxCodeMap.set(t.id, taxCodeLookup[t.code] || 0);
        }
      }
    }

    // journal_entries[].lines[] から借方行を取り出してfreeeトランザクションに変換
    const transactions = journal_entries.map((entry: any) => {
      const debitLine = (entry.lines || []).find((l: any) => l.debit_credit === 'debit') || entry.lines?.[0];
      return {
        issue_date: entry.entry_date,
        type: 'expense' as 'income' | 'expense',
        amount: debitLine?.amount || 0,
        description: entry.description || '',
        account_item_id: freeeAccountMap.get(debitLine?.account_item_id) || 0,
        tax_code: freeTaxCodeMap.get(debitLine?.tax_category_id) || 0,
      };
    });

    // マッピングなしの項目を警告
    const unmapped = transactions.filter(t => t.account_item_id === 0);
    if (unmapped.length > 0) {
      console.warn(`[freee] ${unmapped.length}件の仕訳にfreee勘定科目マッピングがありません`);
    }

    const result = await exportToFreee(transactions, conn.access_token, conn.freee_company_id);

    // エクスポート成功時に通知
    if (result.exported_count > 0) {
      const { data: orgData } = await supabaseAdmin.from('organizations').select('id').limit(1).single();
      if (orgData?.id) {
        // 全管理者に通知
        const { data: admins } = await supabaseAdmin.from('users').select('id').eq('organization_id', orgData.id).in('role', ['admin', 'manager']);
        if (admins) {
          for (const admin of admins) {
            await createNotification({
              organizationId: orgData.id,
              userId: admin.id,
              type: 'exported',
              title: 'freeeエクスポート完了',
              message: `${result.exported_count}件の仕訳をfreeeに登録しました`,
            });
          }
        }
      }
    }

    res.json({ success: result.success, message: result.message, exported_count: result.exported_count, errors: result.errors });
  } catch (error: any) {
    console.error('freeeエクスポートエラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// freee OAuth連携 (Task 5-3)
// ============================================

const FREEE_CLIENT_ID = process.env.FREEE_CLIENT_ID || process.env.VITE_FREEE_CLIENT_ID || '';
const FREEE_CLIENT_SECRET = process.env.FREEE_CLIENT_SECRET || process.env.VITE_FREEE_CLIENT_SECRET || '';
const FREEE_REDIRECT_URI = process.env.FREEE_REDIRECT_URI || 'http://localhost:5173/settings';
const FREEE_AUTH_URL = 'https://accounts.secure.freee.co.jp/public_api/authorize';
const FREEE_TOKEN_URL = 'https://accounts.secure.freee.co.jp/public_api/token';
const FREEE_API_BASE = 'https://api.freee.co.jp';

// OAuth認証URL生成
router.get('/freee/auth-url', async (_req: Request, res: Response) => {
  if (!FREEE_CLIENT_ID) {
    return res.status(400).json({ error: 'FREEE_CLIENT_ID が設定されていません' });
  }
  const state = crypto.randomUUID();
  const url = `${FREEE_AUTH_URL}?client_id=${FREEE_CLIENT_ID}&redirect_uri=${encodeURIComponent(FREEE_REDIRECT_URI)}&response_type=code&state=${state}`;
  res.json({ url, state });
});

// OAuthコールバック処理
router.post('/freee/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code が必要です' });

    // コード→トークン交換
    const tokenRes = await fetch(FREEE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: FREEE_REDIRECT_URI,
        client_id: FREEE_CLIENT_ID,
        client_secret: FREEE_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json() as Record<string, any>;
    if (!tokenRes.ok) {
      return res.status(400).json({ error: 'トークン取得失敗', details: tokenData });
    }

    // ユーザー情報取得（事業所ID含む）
    const meRes = await fetch(`${FREEE_API_BASE}/api/1/users/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meData = await meRes.json() as Record<string, any>;
    const companyId = meData.user?.companies?.[0]?.id?.toString() || '';

    // DB保存
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString();
    await supabaseAdmin.from('freee_connections').upsert({
      organization_id: (await supabaseAdmin.from('organizations').select('id').limit(1).single()).data?.id,
      freee_company_id: companyId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      scope: tokenData.scope || null,
      sync_status: 'active',
      connected_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

    res.json({ success: true, companyId });
  } catch (error: any) {
    console.error('[freee] コールバックエラー:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 接続状態確認
router.get('/freee/connection-status', async (_req: Request, res: Response) => {
  try {
    const { data } = await supabaseAdmin.from('freee_connections')
      .select('freee_company_id, token_expires_at, sync_status, connected_at')
      .eq('sync_status', 'active').limit(1).single();
    if (data) {
      const isExpired = new Date(data.token_expires_at) < new Date();
      res.json({ connected: !isExpired, companyId: data.freee_company_id, connectedAt: data.connected_at, syncStatus: data.sync_status, expired: isExpired });
    } else {
      res.json({ connected: false });
    }
  } catch {
    res.json({ connected: false });
  }
});

// トークンリフレッシュ
router.post('/freee/refresh-token', async (_req: Request, res: Response) => {
  try {
    const { data: conn } = await supabaseAdmin.from('freee_connections')
      .select('id, refresh_token').eq('sync_status', 'active').limit(1).single();
    if (!conn) return res.status(404).json({ error: 'freee接続が見つかりません' });

    const tokenRes = await fetch(FREEE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: conn.refresh_token,
        client_id: FREEE_CLIENT_ID,
        client_secret: FREEE_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json() as Record<string, any>;
    if (!tokenRes.ok) return res.status(400).json({ error: 'リフレッシュ失敗', details: tokenData });

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString();
    await supabaseAdmin.from('freee_connections').update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || conn.refresh_token,
      token_expires_at: expiresAt,
      sync_status: 'active',
    }).eq('id', conn.id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 切断
router.post('/freee/disconnect', async (_req: Request, res: Response) => {
  try {
    await supabaseAdmin.from('freee_connections').update({ sync_status: 'revoked' }).eq('sync_status', 'active');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// freee勘定科目取得
router.get('/freee/account-items', async (_req: Request, res: Response) => {
  try {
    const { data: conn } = await supabaseAdmin.from('freee_connections')
      .select('access_token, freee_company_id').eq('sync_status', 'active').limit(1).single();
    if (!conn) return res.status(404).json({ error: 'freee接続が見つかりません' });

    const apiRes = await fetch(`${FREEE_API_BASE}/api/1/account_items?company_id=${conn.freee_company_id}`, {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    });
    const data = await apiRes.json() as Record<string, any>;
    res.json({ success: true, account_items: data.account_items || [] });
  } catch (error: any) {
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
// バリデーションAPI (Task 5-4)
// ============================================

// (m) 仕訳エントリの貸借バランスチェック
router.post('/validate/journal-balance', async (req: Request, res: Response) => {
  try {
    const { journal_entry_id } = req.body;
    if (!journal_entry_id || !isValidUUID(journal_entry_id)) {
      return res.status(400).json({ error: 'journal_entry_id が必要です' });
    }
    const result = await validateJournalBalance(supabaseAdmin, journal_entry_id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// (a) 証憑重複チェック（hash_value ベース）
router.post('/validate/document-duplicate', async (req: Request, res: Response) => {
  try {
    const { hash_value, client_id, exclude_doc_id } = req.body;
    if (!client_id || !isValidUUID(client_id)) {
      return res.status(400).json({ error: 'client_id が必要です' });
    }
    const result = await checkDocumentDuplicate(supabaseAdmin, hash_value, client_id, exclude_doc_id);
    res.json({ success: true, ...result });
  } catch (error: any) {
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