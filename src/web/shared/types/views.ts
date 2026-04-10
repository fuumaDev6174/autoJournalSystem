/**
 * @module ビュー型定義
 */
import type { JournalEntry, JournalEntryLine, Supplier, Document } from '@/shared/types';

export interface EntryWithJoin extends JournalEntry {
  lines: (JournalEntryLine & {
    _accountName?: string;
    _taxCategoryName?: string;
  })[];
  _document?: Document;
  _supplier?: Supplier;
}
