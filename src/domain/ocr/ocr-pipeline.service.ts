// OCRパイプライン: 画像取得 → 分類(Step1) → 抽出(Step2) → 重複チェック → 通知

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';
import { classifyDocument } from './classifier.service.js';
import { processOCR } from './extractor.service.js';
import { detectMimeType } from './ocr-parse-utils.js';
import { checkDocumentDuplicate, checkReceiptDuplicate } from '../document/duplicate-checker.js';
import { createNotification } from '../notification/notification.service.js';
import type { ClassificationResult } from './ocr.types.js';

export interface OCRPipelineInput {
  document_id: string;
  file_url: string;
}

export interface OCRPipelineResult {
  success: boolean;
  message: string;
  skipped?: boolean;
  classification: ClassificationResult;
  duplicate_warning?: Record<string, unknown> | null;
  receipt_duplicate_warning?: Record<string, unknown> | null;
  ocr_result?: Record<string, unknown>;
}

// 非仕訳対象書類のスキップ閾値（分類 confidence がこの値以上ならStep2を省略）
const SKIP_CONFIDENCE_THRESHOLD = 0.8;

export async function processDocumentOCR(input: OCRPipelineInput): Promise<OCRPipelineResult> {
  const { document_id, file_url } = input;

  // 画像取得
  const fetchRes = await fetch(file_url);
  if (!fetchRes.ok) throw new Error(`画像の取得に失敗: ${fetchRes.status}`);
  const arrayBuffer = await fetchRes.arrayBuffer();
  const imageBase64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = detectMimeType(file_url, fetchRes.headers.get('content-type') || 'image/jpeg');

  // Step 1: 分類
  const classification = await classifyDocument(imageBase64, mimeType);

  // document_types テーブルから仕訳要否を判定
  const { data: docType } = await supabaseAdmin
    .from('document_types').select('id, requires_journal')
    .eq('code', classification.document_type_code).single();

  // Step1 結果 + document_type_id を1回のupdateにマージ
  const step1Update: Record<string, unknown> = {
    doc_classification: classification,
    ocr_step1_type: classification.document_type_code,
    ocr_step1_confidence: classification.confidence,
    ocr_step: 'step1',
  };
  if (docType) step1Update.document_type_id = docType.id;
  await supabaseAdmin.from('documents').update(step1Update).eq('id', document_id);

  if (docType && !docType.requires_journal && classification.confidence >= SKIP_CONFIDENCE_THRESHOLD) {
    await supabaseAdmin.from('documents').update({ ocr_status: 'completed', ocr_step: 'step1', status: 'excluded' }).eq('id', document_id);
    return { success: true, skipped: true, classification, message: '非仕訳対象のためOCRスキップ' };
  }

  // Step 2: データ抽出（classifier の書類種別コードを extractor に引き継ぐ）
  await supabaseAdmin.from('documents').update({ ocr_step: 'step2' }).eq('id', document_id);
  const ocrResult = await processOCR(file_url, { base64: imageBase64, mimeType }, classification.document_type_code);

  // 重複チェック + 通知用データを1回のSELECTで取得（旧: 2回の別々のSELECT + clients SELECT）
  const { data: docRow } = await supabaseAdmin
    .from('documents')
    .select('hash_value, client_id, uploaded_by, clients(organization_id)')
    .eq('id', document_id)
    .single();

  let duplicate_warning: Record<string, unknown> | null = null;
  if (docRow?.hash_value && docRow?.client_id) {
    const dupResult = await checkDocumentDuplicate(supabaseAdmin, docRow.hash_value, docRow.client_id, document_id);
    if (dupResult.isDuplicate) {
      duplicate_warning = { message: `同一ファイルが既に登録されています: ${dupResult.duplicateFileName}`, duplicateDocId: dupResult.duplicateDocId };
    }
  }

  let receipt_duplicate_warning: Record<string, unknown> | null = null;
  if (docRow?.client_id && ocrResult.extracted_amount) {
    const receiptDup = await checkReceiptDuplicate(
      supabaseAdmin, docRow.client_id, ocrResult.extracted_amount,
      ocrResult.extracted_date || null, ocrResult.extracted_supplier || null, document_id,
    );
    if (receiptDup.possibleDuplicates.length > 0) {
      receipt_duplicate_warning = { message: `類似の証憑が${receiptDup.possibleDuplicates.length}件見つかりました`, duplicates: receiptDup.possibleDuplicates };
    }
  }

  // 通知（docRow から直接取得した情報を使用）
  const clientsRaw = docRow?.clients as unknown;
  const clientOrg = Array.isArray(clientsRaw) ? clientsRaw[0]?.organization_id : (clientsRaw as any)?.organization_id;
  if (clientOrg && docRow?.uploaded_by) {
    await createNotification({
      organizationId: clientOrg, userId: docRow.uploaded_by,
      type: 'ocr_completed', title: 'OCR処理が完了しました',
      message: `証憑 ${ocrResult.extracted_supplier || document_id} のOCR読取が完了しました`,
      entityType: 'document', entityId: document_id,
    });
  }

  return {
    success: true, message: 'OCR処理が完了しました', classification,
    duplicate_warning, receipt_duplicate_warning,
    ocr_result: { id: `ocr-${Date.now()}`, document_id, ...ocrResult, created_at: new Date().toISOString() },
  };
}
