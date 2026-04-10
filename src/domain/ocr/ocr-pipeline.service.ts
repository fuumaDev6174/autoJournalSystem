// OCRパイプライン: 画像取得 → 分類(Step1) → 抽出(Step2) → 重複チェック → 通知

import { supabaseAdmin } from '../../adapters/supabase/supabase-admin.client.js';
import { classifyDocument } from './classifier.service.js';
import { processOCR } from './extractor.service.js';
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

function detectMimeType(url: string, contentType: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || contentType.includes('pdf')) return 'application/pdf';
  if (ext === 'png' || contentType.includes('png')) return 'image/png';
  if (ext === 'webp' || contentType.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}

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

  await supabaseAdmin.from('documents').update({
    doc_classification: classification,
    ocr_step1_type: classification.document_type_code,
    ocr_step1_confidence: classification.confidence,
    ocr_step: 'step1',
  }).eq('id', document_id);

  // document_types テーブルから仕訳要否を判定
  const { data: docType } = await supabaseAdmin
    .from('document_types').select('id, requires_journal')
    .eq('code', classification.document_type_code).single();

  if (docType) {
    await supabaseAdmin.from('documents').update({ document_type_id: docType.id }).eq('id', document_id);

    // 非仕訳対象 かつ confidence >= 0.8 → Step 2 スキップ
    if (!docType.requires_journal && classification.confidence >= 0.8) {
      await supabaseAdmin.from('documents').update({ ocr_status: 'completed', ocr_step: 'step1', status: 'excluded' }).eq('id', document_id);
      return { success: true, skipped: true, classification, message: '非仕訳対象のためOCRスキップ' };
    }
  }

  // Step 2: データ抽出
  await supabaseAdmin.from('documents').update({ ocr_step: 'step2' }).eq('id', document_id);
  const ocrResult = await processOCR(file_url, { base64: imageBase64, mimeType });

  // 重複チェック
  const { data: docRow } = await supabaseAdmin.from('documents').select('hash_value, client_id').eq('id', document_id).single();

  let duplicate_warning: Record<string, unknown> | null = null;
  if (docRow?.hash_value) {
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

  // 通知
  if (docRow?.client_id) {
    const { data: clientInfo } = await supabaseAdmin.from('clients').select('organization_id').eq('id', docRow.client_id).single();
    const { data: docInfo } = await supabaseAdmin.from('documents').select('uploaded_by').eq('id', document_id).single();
    if (clientInfo?.organization_id && docInfo?.uploaded_by) {
      await createNotification({
        organizationId: clientInfo.organization_id, userId: docInfo.uploaded_by,
        type: 'ocr_completed', title: 'OCR処理が完了しました',
        message: `証憑 ${ocrResult.extracted_supplier || document_id} のOCR読取が完了しました`,
        entityType: 'document', entityId: document_id,
      });
    }
  }

  return {
    success: true, message: 'OCR処理が完了しました', classification,
    duplicate_warning, receipt_duplicate_warning,
    ocr_result: { id: `ocr-${Date.now()}`, document_id, ...ocrResult, created_at: new Date().toISOString() },
  };
}
