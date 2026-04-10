/**
 * @module freee 連携 API
 * @description freee OAuth 認証・トークン管理・仕訳エクスポートを提供。
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { exportToFreee } from '../../../adapters/freee/freee.api-client.js';
import { encryptToken, decryptToken } from '../../../shared/utils/encryption.js';
import { supabaseAdmin } from '../../../adapters/supabase/supabase-admin.client.js';
import { createNotification } from '../../../domain/notification/notification.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

const router = Router();

const FREEE_CLIENT_ID = process.env.FREEE_CLIENT_ID || '';
const FREEE_CLIENT_SECRET = process.env.FREEE_CLIENT_SECRET || '';
const FREEE_REDIRECT_URI = process.env.FREEE_REDIRECT_URI || '';
const FREEE_AUTH_URL = 'https://accounts.secure.freee.co.jp/public_api/authorize';
const FREEE_TOKEN_URL = 'https://accounts.secure.freee.co.jp/public_api/token';
const FREEE_API_BASE = 'https://api.freee.co.jp';

router.post('/freee/export', async (req: Request, res: Response) => {
  try {
    const { journal_entries } = req.body;
    if (!journal_entries || !Array.isArray(journal_entries)) {
      return res.status(400).json({ error: 'journal_entriesは配列である必要があります' });
    }

    const orgId = (req as AuthenticatedRequest).user.organization_id;

    const { data: conn } = await supabaseAdmin.from('freee_connections')
      .select('access_token, freee_company_id, token_expires_at')
      .eq('organization_id', orgId)
      .eq('sync_status', 'active').limit(1).single();
    if (!conn) {
      return res.status(400).json({ error: 'freeeに接続されていません。設定画面からfreee連携を行ってください。' });
    }
    if (new Date(conn.token_expires_at) < new Date()) {
      return res.status(401).json({ error: 'freeeのアクセストークンが期限切れです。設定画面からトークンをリフレッシュしてください。' });
    }

    const freeeAccountMap = new Map<string, number>();
    const accountIds = [...new Set(
      journal_entries.flatMap((e: any) => (e.lines || []).map((l: any) => l.account_item_id)).filter(Boolean)
    )];
    if (accountIds.length > 0) {
      const { data: accountMappings } = await supabaseAdmin
        .from('account_items')
        .select('id, freee_account_item_id')
        .in('id', accountIds)
        .not('freee_account_item_id', 'is', null);
      if (accountMappings) {
        for (const m of accountMappings) {
          freeeAccountMap.set(m.id, Number(m.freee_account_item_id));
        }
      }
    }

    const freeTaxCodeMap = new Map<string, number>();
    const taxCatIds = [...new Set(
      journal_entries.flatMap((e: any) => (e.lines || []).map((l: any) => l.tax_category_id)).filter(Boolean)
    )];
    if (taxCatIds.length > 0) {
      const { data: taxMappings } = await supabaseAdmin
        .from('tax_categories')
        .select('id, code')
        .in('id', taxCatIds);
      if (taxMappings) {
        const taxCodeLookup: Record<string, number> = {
          'TAX_10': 116, 'TAX_8_REDUCED': 120, 'TAX_EXEMPT': 0,
          'NON_TAXABLE': 0, 'NOT_APPLICABLE': 0,
          'TAX_10_PURCHASE': 133, 'TAX_8_REDUCED_PURCHASE': 137,
        };
        for (const t of taxMappings) {
          freeTaxCodeMap.set(t.id, taxCodeLookup[t.code] || 0);
        }
      }
    }

    const transactions = journal_entries.map((entry: any) => {
      const debitLine = (entry.lines || []).find((l: any) => l.debit_credit === 'debit') || entry.lines?.[0];
      return {
        issue_date: entry.entry_date,
        type: 'expense' as 'income' | 'expense',
        amount: debitLine?.amount || 0,
        description: entry.description || '',
        account_item_id: freeeAccountMap.get(debitLine?.account_item_id) || 0,
        tax_code: freeTaxCodeMap.get(debitLine?.tax_category_id) || 0,
      };
    });

    const unmapped = transactions.filter(t => t.account_item_id === 0);
    if (unmapped.length > 0) {
      console.warn(`[freee] ${unmapped.length}件の仕訳にfreee勘定科目マッピングがありません`);
    }

    const result = await exportToFreee(transactions, decryptToken(conn.access_token), conn.freee_company_id);

    if (result.exported_count > 0) {
      if (orgId) {
        const { data: admins } = await supabaseAdmin.from('users').select('id').eq('organization_id', orgId).in('role', ['admin', 'manager']);
        if (admins) {
          for (const admin of admins) {
            await createNotification({
              organizationId: orgId,
              userId: admin.id,
              type: 'exported',
              title: 'freeeエクスポート完了',
              message: `${result.exported_count}件の仕訳をfreeeに登録しました`,
            });
          }
        }
      }
    }

    res.json({ success: result.success, message: result.message, exported_count: result.exported_count, errors: result.errors });
  } catch (error: any) {
    console.error('freeeエクスポートエラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth state はクライアントに返して CSRF 検証に使う（理想的にはサーバー側保存が望ましい）
router.get('/freee/auth-url', async (_req: Request, res: Response) => {
  if (!FREEE_CLIENT_ID) {
    return res.status(400).json({ error: 'FREEE_CLIENT_ID が設定されていません' });
  }
  if (!FREEE_REDIRECT_URI) {
    return res.status(500).json({ error: 'FREEE_REDIRECT_URI が設定されていません' });
  }
  const state = crypto.randomUUID();
  const url = `${FREEE_AUTH_URL}?client_id=${FREEE_CLIENT_ID}&redirect_uri=${encodeURIComponent(FREEE_REDIRECT_URI)}&response_type=code&state=${state}`;
  res.json({ url, state });
});

router.post('/freee/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code が必要です' });

    const tokenRes = await fetch(FREEE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: FREEE_REDIRECT_URI,
        client_id: FREEE_CLIENT_ID,
        client_secret: FREEE_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json() as Record<string, any>;
    if (!tokenRes.ok) {
      return res.status(400).json({ error: 'トークン取得失敗' });
    }

    const meRes = await fetch(`${FREEE_API_BASE}/api/1/users/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meData = await meRes.json() as Record<string, any>;
    const companyId = meData.user?.companies?.[0]?.id?.toString() || '';

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString();
    await supabaseAdmin.from('freee_connections').upsert({
      organization_id: (req as AuthenticatedRequest).user.organization_id,
      freee_company_id: companyId,
      access_token: encryptToken(tokenData.access_token),
      refresh_token: encryptToken(tokenData.refresh_token),
      token_expires_at: expiresAt,
      scope: tokenData.scope || null,
      sync_status: 'active',
      connected_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

    res.json({ success: true, companyId });
  } catch (error: any) {
    console.error('[freee] コールバックエラー:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/freee/connection-status', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { data } = await supabaseAdmin.from('freee_connections')
      .select('freee_company_id, token_expires_at, sync_status, connected_at')
      .eq('organization_id', orgId)
      .eq('sync_status', 'active').limit(1).single();
    if (data) {
      const isExpired = new Date(data.token_expires_at) < new Date();
      res.json({ connected: !isExpired, companyId: data.freee_company_id, connectedAt: data.connected_at, syncStatus: data.sync_status, expired: isExpired });
    } else {
      res.json({ connected: false });
    }
  } catch {
    res.json({ connected: false });
  }
});

router.post('/freee/refresh-token', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { data: conn } = await supabaseAdmin.from('freee_connections')
      .select('id, refresh_token').eq('organization_id', orgId).eq('sync_status', 'active').limit(1).single();
    if (!conn) return res.status(404).json({ error: 'freee接続が見つかりません' });

    const tokenRes = await fetch(FREEE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: decryptToken(conn.refresh_token),
        client_id: FREEE_CLIENT_ID,
        client_secret: FREEE_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json() as Record<string, any>;
    if (!tokenRes.ok) return res.status(400).json({ error: 'リフレッシュ失敗' });

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString();
    await supabaseAdmin.from('freee_connections').update({
      access_token: encryptToken(tokenData.access_token),
      refresh_token: encryptToken(tokenData.refresh_token || decryptToken(conn.refresh_token)),
      token_expires_at: expiresAt,
      sync_status: 'active',
    }).eq('id', conn.id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/freee/disconnect', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    await supabaseAdmin.from('freee_connections').update({ sync_status: 'revoked' }).eq('organization_id', orgId).eq('sync_status', 'active');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/freee/account-items', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthenticatedRequest).user.organization_id;
    const { data: conn } = await supabaseAdmin.from('freee_connections')
      .select('access_token, freee_company_id').eq('organization_id', orgId).eq('sync_status', 'active').limit(1).single();
    if (!conn) return res.status(404).json({ error: 'freee接続が見つかりません' });

    const apiRes = await fetch(`${FREEE_API_BASE}/api/1/account_items?company_id=${conn.freee_company_id}`, {
      headers: { Authorization: `Bearer ${decryptToken(conn.access_token)}` },
    });
    const data = await apiRes.json() as Record<string, any>;
    res.json({ success: true, account_items: data.account_items || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
