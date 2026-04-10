/**
 * @module レビューフォームコンテキスト
 * フォーム編集に関する状態を管理。ビューやデータの変更とは独立して更新される。
 */
import { createContext, useContext, useState } from 'react';
import type { DocumentWithEntry } from './ReviewContext';
import type { JournalEntryLineInput } from '@/web/shared/components/journal/CompoundJournalTable';

export interface ReviewFormContextType {
  form: Partial<DocumentWithEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;
  compoundLines: JournalEntryLineInput[];
  setCompoundLines: React.Dispatch<React.SetStateAction<JournalEntryLineInput[]>>;
  aiOriginalForm: Partial<DocumentWithEntry>;
  setAiOriginalForm: React.Dispatch<React.SetStateAction<Partial<DocumentWithEntry>>>;

  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  savedAt: string | null;
  setSavedAt: React.Dispatch<React.SetStateAction<string | null>>;

  businessRatio: number;
  setBusinessRatio: React.Dispatch<React.SetStateAction<number>>;

  addRule: boolean;
  setAddRule: React.Dispatch<React.SetStateAction<boolean>>;
  ruleScope: 'shared' | 'industry' | 'client';
  setRuleScope: React.Dispatch<React.SetStateAction<'shared' | 'industry' | 'client'>>;
  ruleIndustryId: string;
  setRuleIndustryId: React.Dispatch<React.SetStateAction<string>>;
  ruleSuggestion: string;
  setRuleSuggestion: React.Dispatch<React.SetStateAction<string>>;

  supplierText: string;
  setSupplierText: React.Dispatch<React.SetStateAction<string>>;
  itemText: string;
  setItemText: React.Dispatch<React.SetStateAction<string>>;
}

const ReviewFormCtx = createContext<ReviewFormContextType | null>(null);

export function useReviewForm(): ReviewFormContextType {
  const ctx = useContext(ReviewFormCtx);
  if (!ctx) throw new Error('useReviewForm must be used within ReviewFormProvider');
  return ctx;
}

export function ReviewFormProvider({ children }: { children: React.ReactNode }) {
  const [form, setForm] = useState<Partial<DocumentWithEntry>>({});
  const [compoundLines, setCompoundLines] = useState<JournalEntryLineInput[]>([]);
  const [aiOriginalForm, setAiOriginalForm] = useState<Partial<DocumentWithEntry>>({});

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [businessRatio, setBusinessRatio] = useState(100);

  const [addRule, setAddRule] = useState(false);
  const [ruleScope, setRuleScope] = useState<'shared' | 'industry' | 'client'>('shared');
  const [ruleIndustryId, setRuleIndustryId] = useState('');
  const [ruleSuggestion, setRuleSuggestion] = useState('');

  const [supplierText, setSupplierText] = useState('');
  const [itemText, setItemText] = useState('');

  const value: ReviewFormContextType = {
    form, setForm, compoundLines, setCompoundLines, aiOriginalForm, setAiOriginalForm,
    saving, setSaving, savedAt, setSavedAt,
    businessRatio, setBusinessRatio,
    addRule, setAddRule, ruleScope, setRuleScope, ruleIndustryId, setRuleIndustryId, ruleSuggestion, setRuleSuggestion,
    supplierText, setSupplierText, itemText, setItemText,
  };

  return <ReviewFormCtx.Provider value={value}>{children}</ReviewFormCtx.Provider>;
}
