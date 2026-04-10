/**
 * @module 証憑アップロード API
 * @description ファイルアップロードの受付と Multer 設定。
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({
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

export default router;
