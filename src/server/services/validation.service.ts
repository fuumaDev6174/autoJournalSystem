// ============================================
// 自動処理: バリデーション関数群 (Task 5-4)
// ============================================

/**
 * (a) 証憑重複チェック（hash_value による完全一致）
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateDocId: string | null;
  duplicateFileName: string | null;
}

export async function checkDocumentDuplicate(
  supabaseAdmin: any,
  hashValue: string | null,
  clientId: string,
  excludeDocId?: string,
): Promise<DuplicateCheckResult> {
  if (!hashValue) return { isDuplicate: false, duplicateDocId: null, duplicateFileName: null };
  let query = supabaseAdmin.from('documents')
    .select('id, file_name')
    .eq('hash_value', hashValue)
    .eq('client_id', clientId)
    .limit(1);
  if (excludeDocId) query = query.neq('id', excludeDocId);
  const { data } = await query;
  if (data && data.length > 0) {
    return { isDuplicate: true, duplicateDocId: data[0].id, duplicateFileName: data[0].file_name };
  }
  return { isDuplicate: false, duplicateDocId: null, duplicateFileName: null };
}

/**
 * (e) 取引先名寄せ（suppliers + supplier_aliases で段階的マッチ）
 */
export interface SupplierMatchResult {
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  matchType: 'exact' | 'partial' | 'alias' | 'none';
}

export async function findSupplierAliasMatch(
  supabaseAdmin: any,
  supplierName: string | null,
  organizationId: string,
): Promise<SupplierMatchResult> {
  if (!supplierName) return { matchedSupplierId: null, matchedSupplierName: null, matchType: 'none' };
  const sName = supplierName.toLowerCase();

  // 1. suppliers.name で完全一致
  const { data: suppliers } = await supabaseAdmin.from('suppliers')
    .select('id, name').eq('organization_id', organizationId).eq('is_active', true);
  if (suppliers) {
    const exact = suppliers.find((s: any) => s.name.toLowerCase() === sName);
    if (exact) return { matchedSupplierId: exact.id, matchedSupplierName: exact.name, matchType: 'exact' };
    // 2. 部分一致
    const partial = suppliers.find((s: any) => sName.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(sName));
    if (partial) return { matchedSupplierId: partial.id, matchedSupplierName: partial.name, matchType: 'partial' };
  }

  // 3. supplier_aliases で一致
  const { data: aliases } = await supabaseAdmin.from('supplier_aliases')
    .select('supplier_id, alias_name, suppliers!inner(id, name)')
    .order('created_at', { ascending: false });
  if (aliases) {
    const aliasMatch = aliases.find((a: any) => {
      const aName = a.alias_name.toLowerCase();
      return aName === sName || sName.includes(aName) || aName.includes(sName);
    });
    if (aliasMatch) {
      const sup = Array.isArray(aliasMatch.suppliers) ? aliasMatch.suppliers[0] : aliasMatch.suppliers;
      return { matchedSupplierId: aliasMatch.supplier_id, matchedSupplierName: sup?.name || null, matchType: 'alias' };
    }
  }

  return { matchedSupplierId: null, matchedSupplierName: null, matchType: 'none' };
}

/**
 * (g) 貸借バランスチェック（純粋関数）
 */
export interface BalanceCheckResult {
  isBalanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
}

export function validateDebitCreditBalance(
  lines: Array<{ debit_credit: string; amount: number }>,
): BalanceCheckResult {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (line.debit_credit === 'debit') debitTotal += line.amount;
    else if (line.debit_credit === 'credit') creditTotal += line.amount;
  }
  // 小数点丸め誤差を考慮（1円以内の差は許容）
  const difference = Math.abs(debitTotal - creditTotal);
  return { isBalanced: difference < 1, debitTotal, creditTotal, difference };
}

/**
 * (l) 証憑重複チェック（金額+日付+取引先の類似検索）
 */
export interface ReceiptDuplicateResult {
  possibleDuplicates: Array<{ id: string; fileName: string; date: string; amount: number; supplierName: string | null }>;
}

export async function checkReceiptDuplicate(
  supabaseAdmin: any,
  clientId: string,
  amount: number | null,
  date: string | null,
  supplierName: string | null,
  excludeDocId?: string,
): Promise<ReceiptDuplicateResult> {
  if (!amount || !date) return { possibleDuplicates: [] };

  // 日付 ±1日 かつ 金額完全一致
  const dateObj = new Date(date);
  const dayBefore = new Date(dateObj); dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(dateObj); dayAfter.setDate(dayAfter.getDate() + 1);

  let query = supabaseAdmin.from('documents')
    .select('id, file_name, document_date, amount, supplier_name')
    .eq('client_id', clientId)
    .eq('amount', amount)
    .gte('document_date', dayBefore.toISOString().split('T')[0])
    .lte('document_date', dayAfter.toISOString().split('T')[0]);
  if (excludeDocId) query = query.neq('id', excludeDocId);

  const { data } = await query;
  if (!data || data.length === 0) return { possibleDuplicates: [] };

  // 取引先名がある場合、取引先名も部分一致でフィルタ
  let filtered = data;
  if (supplierName) {
    const sLower = supplierName.toLowerCase();
    filtered = data.filter((d: any) => {
      if (!d.supplier_name) return true; // 取引先未設定はヒット扱い
      const dLower = d.supplier_name.toLowerCase();
      return dLower.includes(sLower) || sLower.includes(dLower);
    });
  }

  return {
    possibleDuplicates: filtered.map((d: any) => ({
      id: d.id, fileName: d.file_name, date: d.document_date,
      amount: d.amount, supplierName: d.supplier_name,
    })),
  };
}

/**
 * (m) 仕訳エントリの貸借バランスチェック（DB参照あり）
 */
export async function validateJournalBalance(
  supabaseAdmin: any,
  journalEntryId: string,
): Promise<BalanceCheckResult> {
  const { data: lines } = await supabaseAdmin.from('journal_entry_lines')
    .select('debit_credit, amount')
    .eq('journal_entry_id', journalEntryId);
  if (!lines || lines.length === 0) return { isBalanced: true, debitTotal: 0, creditTotal: 0, difference: 0 };
  return validateDebitCreditBalance(lines);
}
