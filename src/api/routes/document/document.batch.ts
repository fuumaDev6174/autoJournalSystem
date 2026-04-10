/**
 * @module 一括処理 API
 * @description 複数ファイルをまとめて OCR → 仕訳生成するバッチエンドポイント。
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}
import fs from 'fs';
import { processOCR } from '../../../domain/ocr/extractor.service.js';
import { generateJournalEntry } from '../../../domain/journal/ai-generator.service.js';
import { mapLinesToDBFormat } from '../../../domain/journal/line-mapper.service.js';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { verifyClientOwnership } from '../../../domain/auth/authorization.service.js';
import { getOrganizationId, fetchAccountItems, fetchTaxCategories, findFallbackAccountId } from '../../../domain/master/master-data.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { upload } from './document.upload.js';

const router = Router();

router.post('/process/batch', upload.array('files', 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as MulterFile[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }
    const { client_id, uploaded_by, industry } = req.body;
    if (!client_id || !uploaded_by) {
      return res.status(400).json({ error: 'client_idとuploaded_byは必須です' });
    }

    const authUser = (req as AuthenticatedRequest).user;
    if (!(await verifyClientOwnership(client_id, authUser.organization_id))) {
      return res.status(403).json({ error: '指定されたクライアントへのアクセス権限がありません' });
    }

    console.log(`[バッチ] 処理開始: ${files.length}件, client_id="${client_id}"`);

    const organizationId = await getOrganizationId(client_id);
    if (!organizationId) {
      return res.status(400).json({
        error: '指定された client_id に紐づく組織が見つかりません',
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

export default router;
