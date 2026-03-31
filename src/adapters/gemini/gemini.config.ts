export const GEMINI_CONFIG = {
  modelOcr: process.env.GEMINI_MODEL_OCR || 'gemini-3-flash-preview',
  modelJournal: process.env.GEMINI_MODEL_JOURNAL || 'gemini-3.1-pro-preview',
  maxRetries: 4,
  minIntervalMs: 150,
} as const;
