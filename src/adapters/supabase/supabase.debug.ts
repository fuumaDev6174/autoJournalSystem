/**
 * @module Supabase デバッグ
 * @description ブラウザコンソールから `debugAuth()` で認証・RLS の問題を診断。
 */

import { supabase } from './supabase.client';

export const debugAuth = async () => {
  console.group('🔍 Tax Copilot 認証診断');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('❌ セッションなし: ログインしていません');
    console.groupEnd();
    return;
  }
  console.log('✅ セッションあり');
  console.log('  auth.uid:', session.user.id);
  console.log('  email:', session.user.email);

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, email, organization_id, role')
    .eq('id', session.user.id)
    .single();

  if (userErr || !userRow) {
    console.error('❌ usersテーブルに自分のレコードがありません');
    console.log('  エラー:', userErr?.message);
  } else {
    console.log('✅ usersテーブルのレコード確認OK');
    console.log('  organization_id:', userRow.organization_id);
    console.log('  role:', userRow.role);
  }

  const { data: taxData, error: taxErr } = await supabase
    .from('tax_categories').select('id, name').limit(3);
  if (taxErr || !taxData?.length) {
    console.error('❌ tax_categories が取得できません');
  } else {
    console.log(`✅ tax_categories OK (${taxData.length}件+)`);
  }

  const { data: accountData, error: accountErr } = await supabase
    .from('account_items').select('id, name, organization_id').limit(3);
  if (accountErr || !accountData?.length) {
    console.error('❌ account_items が取得できません');
  } else {
    console.log(`✅ account_items OK (${accountData.length}件+)`);
  }

  const { data: indData, error: indErr } = await supabase
    .from('industries').select('id, name').limit(3);
  if (indErr || !indData?.length) {
    console.error('❌ industries が取得できません:', indErr?.message);
  } else {
    console.log(`✅ industries OK (${indData.length}件+)`);
  }

  console.groupEnd();
  console.log('\n📋 診断完了。上記の ❌ 項目を修正してください。');
};

if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuth;
}
