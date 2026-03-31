import { Router, Request, Response } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';

const router = Router();
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/storage/upload
router.post('/storage/upload', memoryUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
    const { path: storagePath } = req.body;
    if (!storagePath) return res.status(400).json({ error: 'path は必須です' });

    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/storage/signed-url
router.get('/storage/signed-url', async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(filePath as string, 3600);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/storage/delete
router.delete('/storage/delete', async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    const paths = Array.isArray(filePath) ? filePath as string[] : [filePath as string];
    const { error } = await supabaseAdmin.storage.from('documents').remove(paths);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
