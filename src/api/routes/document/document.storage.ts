/**
 * @module ストレージ CRUD
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { isValidStoragePath } from '../../../shared/utils/request-helpers.js';
import { asyncHandler } from '../../helpers/async-handler.js';

const router = Router();
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/storage/upload
router.post('/storage/upload', memoryUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
  const { path: storagePath } = req.body;
  if (!storagePath) return res.status(400).json({ error: 'path は必須です' });
  if (!isValidStoragePath(storagePath)) return res.status(400).json({ error: 'パスに不正な文字列が含まれています' });

  const { data, error } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, req.file.buffer, {
      contentType: req.file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, data });
}));

// GET /api/storage/signed-url
router.get('/storage/signed-url', asyncHandler(async (req: Request, res: Response) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  if (!isValidStoragePath(filePath as string)) return res.status(400).json({ error: 'パスに不正な文字列が含まれています' });
  const { data, error } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUrl(filePath as string, 3600);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
}));

// DELETE /api/storage/delete
router.delete('/storage/delete', asyncHandler(async (req: Request, res: Response) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const paths = Array.isArray(filePath) ? filePath as string[] : [filePath as string];
  if (paths.some(p => !isValidStoragePath(p))) return res.status(400).json({ error: 'パスに不正な文字列が含まれています' });
  const { error } = await supabaseAdmin.storage.from('documents').remove(paths);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

export default router;
