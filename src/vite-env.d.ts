/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // 今後追加する環境変数
  readonly VITE_FREEE_CLIENT_ID?: string;
  readonly VITE_FREEE_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}