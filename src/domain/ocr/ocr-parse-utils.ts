// OCR共通パースユーティリティ — Gemini応答のJSON抽出・修復・型変換を一元化

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', webp: 'image/webp',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

export function detectMimeType(url: string, contentType: string | null): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  if (contentType) {
    for (const mime of Object.values(EXT_TO_MIME)) {
      if (contentType.includes(mime)) return mime;
    }
  }
  return 'image/jpeg';
}

/** Gemini の生テキストから JSON 部分を切り出す（コードブロック or 裸の {} or []） */
export function extractJSON(raw: string, arrayMode = false): string {
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock) return codeBlock[1].trim();

  if (arrayMode) {
    const bareArray = raw.match(/\[[\s\S]*\]/);
    if (bareArray) return bareArray[0].trim();
    // 単一オブジェクトを配列に包む
    const bareObj = raw.match(/\{[\s\S]*\}/);
    if (bareObj) return `[${bareObj[0].trim()}]`;
  } else {
    const bare = raw.match(/\{[\s\S]*\}/);
    if (bare) return bare[0].trim();
  }

  return '';
}

// Gemini は末尾カンマ・シングルクォート・クォートなしキーを返すことがある
function repairJSON(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/'/g, '"')
    .replace(/(\w+)\s*:/g, '"$1":');
}

export function safeParseJSON(text: string, label: string): any | null {
  try {
    return JSON.parse(text);
  } catch { /* 修復を試みる */ }

  try {
    const result = JSON.parse(repairJSON(text));
    console.warn(`[${label}] JSON修復パースで成功`);
    return result;
  } catch {
    console.error(`[${label}] JSONパース失敗。テキスト:`, text.slice(0, 300));
    return null;
  }
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function asStringOrNull(value: unknown): string | null {
  return (typeof value === 'string' && value.trim()) ? value.trim() : null;
}

export function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function asEnumOrNull<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return (typeof value === 'string' && (allowed as readonly string[]).includes(value))
    ? value as T
    : null;
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function errorSummary(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 100);
}
