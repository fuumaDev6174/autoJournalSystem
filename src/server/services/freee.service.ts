// ============================================
// freee連携サービス
// ============================================

export interface FreeeTransaction {
  issue_date: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  account_item_id: number;
  tax_code: number;
}

const FREEE_API_BASE = 'https://api.freee.co.jp';

export async function exportToFreee(
  transactions: FreeeTransaction[],
  accessToken: string,
  companyId: string,
): Promise<{
  success: boolean;
  message: string;
  exported_count: number;
  errors: Array<{ index: number; error: string }>;
}> {
  if (!accessToken || !companyId) {
    return { success: false, message: 'freee接続情報が不足しています', exported_count: 0, errors: [] };
  }

  console.log(`[freee] エクスポート開始: ${transactions.length}件, company_id=${companyId}`);

  let exportedCount = 0;
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    try {
      // freee API: POST /api/1/deals で取引を作成
      const dealBody = {
        company_id: Number(companyId),
        issue_date: tx.issue_date,
        type: tx.type,
        details: [
          {
            account_item_id: tx.account_item_id,
            tax_code: tx.tax_code,
            amount: tx.amount,
            description: tx.description || '',
          },
        ],
      };

      const response = await fetch(`${FREEE_API_BASE}/api/1/deals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dealBody),
      });

      if (response.ok) {
        exportedCount++;
      } else {
        const errData = await response.json().catch(() => ({ message: response.statusText })) as Record<string, any>;
        const errMsg = errData.errors?.[0]?.messages?.[0] || errData.message || `HTTP ${response.status}`;
        errors.push({ index: i, error: errMsg });
        console.warn(`[freee] 取引${i + 1}件目エラー: ${errMsg}`);
      }
    } catch (e: any) {
      errors.push({ index: i, error: e.message });
      console.error(`[freee] 取引${i + 1}件目例外: ${e.message}`);
    }
  }

  console.log(`[freee] エクスポート完了: 成功=${exportedCount}, エラー=${errors.length}`);

  return {
    success: errors.length === 0,
    message: errors.length === 0
      ? `${exportedCount}件の取引をfreeeに登録しました`
      : `${exportedCount}件成功、${errors.length}件エラー`,
    exported_count: exportedCount,
    errors,
  };
}
