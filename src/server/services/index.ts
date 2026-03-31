// Re-export everything from split service modules
export { normalizeJapanese } from '../../shared/utils/normalize-japanese.js';

export type { OCRTransaction, OCRResult } from './ocr.service.js';
export { classifyDocument, processOCR, extractMultipleEntries } from './ocr.service.js';

export type { AccountItemRef, TaxCategoryRef, JournalEntryInput, GeneratedJournalLine, GeneratedJournalEntry } from './journal.service.js';
export { generateJournalEntry } from './journal.service.js';

export type { RuleMatchInput, MatchedRule } from './rule-engine.js';
export { generateRuleName, matchProcessingRules, matchProcessingRulesWithCandidates, buildEntryFromRule, mapLinesToDBFormat } from './rule-engine.js';

export type { FreeeTransaction } from './freee.service.js';
export { exportToFreee } from './freee.service.js';

export type { DuplicateCheckResult, SupplierMatchResult, BalanceCheckResult, ReceiptDuplicateResult } from './validation.service.js';
export { checkDocumentDuplicate, findSupplierAliasMatch, validateDebitCreditBalance, checkReceiptDuplicate, validateJournalBalance } from './validation.service.js';

// Re-export utilities
export { sleep, callGeminiWithRetry, ai, GEMINI_MODEL_OCR, GEMINI_MODEL_JOURNAL } from '../utils/normalize.js';
