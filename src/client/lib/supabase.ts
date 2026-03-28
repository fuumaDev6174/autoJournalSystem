import { createClient } from '@supabase/supabase-js';

// 環境変数から取得（.envファイルに設定）
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Supabaseクライアントのシングルトンインスタンス
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// 認証ヘルパー関数
export const auth = {
  // ログイン
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  // ログアウト
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  // 現在のユーザー取得
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  // セッション取得
  getSession: async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  },

  // Google OAuth ログイン
  signInWithGoogle: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    return { data, error };
  },

  // サインアップ（通常登録）
  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  },

  // 認証状態変化の監視
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// ストレージヘルパー関数
export const storage = {
  // ファイルアップロード
  uploadFile: async (bucket: string, path: string, file: File) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
    return { data, error };
  },

  // ファイル取得URL
  getPublicUrl: (bucket: string, path: string) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  },

  // ファイル削除
  deleteFile: async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove([path]);
    return { data, error };
  },
};

// ============================================
// デバッグ診断関数
// ブラウザのコンソールで debugAuth() を呼び出すと
// 現在の認証状態とRLSの通り具合を確認できます
// ============================================
export const debugAuth = async () => {
  console.group('🔍 Tax Copilot 認証診断');

  // 1. Supabase Auth のセッション確認
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('❌ セッションなし: ログインしていません');
    console.groupEnd();
    return;
  }
  console.log('✅ セッションあり');
  console.log('  auth.uid:', session.user.id);
  console.log('  email:', session.user.email);

  // 2. usersテーブルに自分のレコードが存在するか
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, email, organization_id, role')
    .eq('id', session.user.id)
    .single();

  if (userErr || !userRow) {
    console.error('❌ usersテーブルに自分のレコードがありません');
    console.error('   → Supabase Auth のUIDとusersテーブルのidが一致していない可能性があります');
    console.error('   → debug_and_fix.sql の「修正SQL2」を実行してください');
    console.log('  エラー:', userErr?.message);
  } else {
    console.log('✅ usersテーブルのレコード確認OK');
    console.log('  organization_id:', userRow.organization_id);
    console.log('  role:', userRow.role);
  }

  // 3. tax_categories が見えるか（USING (true) なので必ず見える）
  const { data: taxData, error: taxErr } = await supabase
    .from('tax_categories')
    .select('id, name')
    .limit(3);

  if (taxErr || !taxData?.length) {
    console.error('❌ tax_categories が取得できません');
    console.error('   エラー:', taxErr?.message);
    console.error('   データなし:', !taxData?.length);
  } else {
    console.log(`✅ tax_categories OK (${taxData.length}件+)`);
    console.log('  サンプル:', taxData.map(t => t.name).join(', '));
  }

  // 4. account_items が見えるか（RLSが問題）
  const { data: accountData, error: accountErr } = await supabase
    .from('account_items')
    .select('id, name, organization_id')
    .limit(3);

  if (accountErr || !accountData?.length) {
    console.error('❌ account_items が取得できません');
    console.error('   エラー:', accountErr?.message);
    console.error('   データなし（0件）:', !accountData?.length);
    console.error('   → RLSポリシーを修正する必要があります');
    console.error('   → debug_and_fix.sql の「修正SQL1」を実行してください');
  } else {
    console.log(`✅ account_items OK (${accountData.length}件+)`);
    console.log('  サンプル:', accountData.map(a => `${a.name}(org:${a.organization_id ?? 'null'})`).join(', '));
  }

  // 5. industries が見えるか（USING (true) なので必ず見える）
  const { data: indData, error: indErr } = await supabase
    .from('industries')
    .select('id, name')
    .limit(3);

  if (indErr || !indData?.length) {
    console.error('❌ industries が取得できません:', indErr?.message);
  } else {
    console.log(`✅ industries OK (${indData.length}件+)`);
  }

  console.groupEnd();
  console.log('\n📋 診断完了。上記の ❌ 項目を修正してください。');
  console.log('SQLの修正は Supabase Dashboard > SQL Editor で実行してください。');
};

// グローバルに公開（ブラウザコンソールから debugAuth() で呼べる）
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuth;
}