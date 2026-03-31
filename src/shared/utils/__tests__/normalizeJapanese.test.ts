import { describe, it, expect } from 'vitest';
import { normalizeJapanese } from '../normalize-japanese';

describe('normalizeJapanese', () => {
  it('converts half-width katakana to full-width', () => {
    expect(normalizeJapanese('ｱｲｳｴｵ')).toBe('アイウエオ');
    expect(normalizeJapanese('ｶｷｸｹｺ')).toBe('カキクケコ');
  });

  it('converts full-width alphanumerics to half-width', () => {
    expect(normalizeJapanese('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('removes corporate suffixes', () => {
    expect(normalizeJapanese('株式会社テスト')).toBe('テスト');
    expect(normalizeJapanese('テスト㈱')).toBe('テスト');
    expect(normalizeJapanese('有限会社サンプル')).toBe('サンプル');
    expect(normalizeJapanese('合同会社データ')).toBe('データ');
  });

  it('normalizes spaces', () => {
    expect(normalizeJapanese('テスト　会社')).toBe('テスト 会社');
    expect(normalizeJapanese('テスト  会社')).toBe('テスト 会社');
  });

  it('trims whitespace', () => {
    expect(normalizeJapanese('  テスト  ')).toBe('テスト');
  });

  it('handles combined transformations', () => {
    expect(normalizeJapanese('株式会社ＡＢＣ　ｼｽﾃﾑ')).toBe('ABC システム');
  });
});
