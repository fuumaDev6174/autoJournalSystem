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

  let filtered = data;
  if (supplierName) {
    const sLower = supplierName.toLowerCase();
    filtered = data.filter((d: any) => {
      if (!d.supplier_name) return true;
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
