export type LayoutType = 'single' | 'statement' | 'compound' | 'metadata' | 'archive';

export interface DocTypeConfig {
  code: string;
  layout: LayoutType;
  gridRatio?: string;
  extraSections?: string[];
  supportsMultiLine?: boolean;
}
