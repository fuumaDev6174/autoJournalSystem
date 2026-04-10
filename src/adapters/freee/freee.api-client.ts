/**
 * @module freee API クライアント
 * @description freee API への仕訳エクスポート。バッチ並列処理でスループット向上。
 */

/** freee 取引登録用データ */
export interface FreeeTransaction {
  issue_date: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  account_item_id: number;
  tax_code: number;
}

const FREEE_API_BASE = 'https://api.freee.co.jp';
const BATCH_SIZE = 5;
const BATCH_INTERVAL_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 1件の取引を freee API に登録する */
async function postDeal(
  tx: FreeeTransaction,
  accessToken: string,
  companyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const dealBody = {
    company_id: Number(companyId),
    issue_date: tx.issue_date,
    type: tx.type,
    details: [{
      account_item_id: tx.account_item_id,
      tax_code: tx.tax_code,
      amount: tx.amount,
      description: tx.description || '',
    }],
  };

  try {
    const response = await fetch(`${FREEE_API_BASE}/api/1/deals`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dealBody),
    });

    if (response.ok) return { ok: true };

    const errData = await response.json().catch(() => ({ message: response.statusText })) as Record<string, any>;
    const errMsg = errData.errors?.[0]?.messages?.[0] || errData.message || `HTTP ${response.status}`;
    return { ok: false, error: errMsg };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** 仕訳データを freee API にバッチ並列で登録する */
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

  // BATCH_SIZE 件ずつ並列実行し、バッチ間にインターバルを入れてレート制限を遵守
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(tx => postDeal(tx, accessToken, companyId))
    );

    results.forEach((result, j) => {
      const globalIndex = i + j;
      if (result.status === 'fulfilled' && result.value.ok) {
        exportedCount++;
      } else {
        const errMsg = result.status === 'fulfilled'
          ? result.value.error || '不明なエラー'
          : result.reason?.message || '不明なエラー';
        errors.push({ index: globalIndex, error: errMsg });
        console.warn(`[freee] 取引${globalIndex + 1}件目エラー: ${errMsg}`);
      }
    });

    // 最後のバッチ以外はインターバルを入れる
    if (i + BATCH_SIZE < transactions.length) {
      await sleep(BATCH_INTERVAL_MS);
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
