// 書類種別型定義
export type LayoutType = 'single' | 'statement' | 'compound' | 'metadata' | 'archive' | 'deduction';

export interface DocTypeConfig {
  code: string;
  layout: LayoutType;
  gridRatio?: string;
  extraSections?: string[];
  supportsMultiLine?: boolean;
}
