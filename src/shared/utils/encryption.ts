/**
 * @module トークン暗号化
 * @description AES-256-GCM でトークンを暗号化/復号化する。TOKEN_ENCRYPTION_KEY 未設定時は平文で通過（開発環境用）。
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) return null;
  return Buffer.from(keyHex, 'hex');
}

/** トークンを AES-256-GCM で暗号化する。キー未設定時は平文をそのまま返す */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // iv + tag + ciphertext を base64 結合
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** 暗号化されたトークンを復号化する。キー未設定時は平文として返す */
export function decryptToken(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext;

  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    // 復号化失敗 = 平文トークン（移行期間の後方互換）
    return ciphertext;
  }
}
