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

  const { data: suppliers } = await supabaseAdmin.from('suppliers')
    .select('id, name').eq('organization_id', organizationId).eq('is_active', true);
  if (suppliers) {
    const exact = suppliers.find((s: any) => s.name.toLowerCase() === sName);
    if (exact) return { matchedSupplierId: exact.id, matchedSupplierName: exact.name, matchType: 'exact' };
    const partial = suppliers.find((s: any) => sName.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(sName));
    if (partial) return { matchedSupplierId: partial.id, matchedSupplierName: partial.name, matchType: 'partial' };
  }

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
