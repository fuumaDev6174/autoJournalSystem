/**
 * @module OCR 処理 API
 * @description 証憑分類(Step1) → フル OCR(Step2) の2段階パイプライン。
 */

import { Router, Request, Response } from 'express';
import { validateBody } from '../../middleware/validate.middleware.js';
import { processOCR } from '../../../domain/ocr/extractor.service.js';
import { classifyDocument } from '../../../domain/ocr/classifier.service.js';
import { checkDocumentDuplicate, checkReceiptDuplicate } from '../../../domain/document/duplicate-checker.js';
import {
  supabaseAdmin,
  isValidUUID,
  createNotification,
} from '../../helpers/master-data.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/ocr/process', validateBody({ document_id: 'uuid' }), async (req: Request, res: Response) => {
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

    const classification = await classifyDocument(imageBase64, mimeType);
    console.log(`[OCR] Step 1 判定: ${classification.document_type_code} (confidence=${classification.confidence})`);

    await supabaseAdmin.from('documents').update({
      doc_classification: classification,
      ocr_step1_type: classification.document_type_code,
      ocr_step1_confidence: classification.confidence,
      ocr_step: 'step1',
    }).eq('id', document_id);

    const { data: docType } = await supabaseAdmin
      .from('document_types')
      .select('id, requires_journal')
      .eq('code', classification.document_type_code)
      .single();

    if (docType) {
      await supabaseAdmin.from('documents').update({
        document_type_id: docType.id,
      }).eq('id', document_id);

      // 非仕訳対象 かつ confidence >= 0.8 → Step 2 スキップで処理時間を節約
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

    await supabaseAdmin.from('documents').update({ ocr_step: 'step2' }).eq('id', document_id);

    const ocrResult = await processOCR(targetUrl, { base64: imageBase64, mimeType });
    console.log(`[OCR] ✅ 完了: supplier="${ocrResult.extracted_supplier}", amount=${ocrResult.extracted_amount}, confidence=${ocrResult.confidence_score}`);

    const { data: docRow } = await supabaseAdmin.from('documents').select('hash_value, client_id').eq('id', document_id).single();
    let duplicate_warning = null;
    if (docRow?.hash_value) {
      const dupResult = await checkDocumentDuplicate(supabaseAdmin, docRow.hash_value, docRow.client_id, document_id);
      if (dupResult.isDuplicate) {
        duplicate_warning = { message: `同一ファイルが既に登録されています: ${dupResult.duplicateFileName}`, duplicateDocId: dupResult.duplicateDocId };
        console.log(`[OCR] ⚠️ 重複検出: ${dupResult.duplicateFileName}`);
      }
    }

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

export default router;
