/**
 * @module Supabase Admin クライアント（サーバー用）
 * @description service_role_key を使い RLS をバイパスする。サーバーサイドのみ使用。
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定');
}

export const supabaseAdmin = createClient(supabaseUrl || '', serviceRoleKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});
