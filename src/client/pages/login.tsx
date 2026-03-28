import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle, Loader } from 'lucide-react';
import { auth } from '../lib/supabase';
import { useAuth } from '../main';

// ============================================================
// Google アイコン（SVG インライン）
// ============================================================
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ============================================================
// LoginPage
// ============================================================
export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // すでにログイン済みなら /clients へ
  useEffect(() => {
    if (!loading && user) {
      navigate('/clients', { replace: true });
    }
  }, [user, loading, navigate]);

  // フォーム状態
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ============================================================
  // 通常ログイン（メール + パスワード）
  // パスワードは Supabase Auth が bcrypt で自動暗号化して保存しているため
  // フロントは平文を渡すだけでよい
  // ============================================================
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('メールアドレスとパスワードを入力してください。');
      return;
    }

    setIsSubmitting(true);
    const { error } = await auth.signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      // Supabase のエラーメッセージを日本語に変換
      if (error.message.includes('Invalid login credentials')) {
        setErrorMessage('メールアドレスまたはパスワードが正しくありません。');
      } else if (error.message.includes('Email not confirmed')) {
        setErrorMessage('メールアドレスの確認が完了していません。メールをご確認ください。');
      } else {
        setErrorMessage('ログインに失敗しました。しばらくしてから再度お試しください。');
      }
      return;
    }

    // ログイン成功 → onAuthStateChange が user を更新 → useEffect でリダイレクト
    navigate('/clients', { replace: true });
  };

  // ============================================================
  // Google OAuth ログイン
  // Supabase が Google のページへリダイレクト → 戻ってきたら
  // supabase.ts の detectSessionInUrl: true が自動でセッションを処理する
  // ============================================================
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setIsGoogleLoading(true);
    const { error } = await auth.signInWithGoogle();
    // リダイレクトが走るのでここ以降は基本実行されないが、エラー時のみ処理
    if (error) {
      setErrorMessage('Googleログインに失敗しました。しばらくしてから再度お試しください。');
      setIsGoogleLoading(false);
    }
  };

  // セッション確認中はスピナー
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      {/* カード */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

        {/* ヘッダー部分 */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 rounded-2xl mb-4">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">仕訳自動化システム</h1>
          <p className="text-blue-100 text-sm mt-1">Tax Copilot</p>
        </div>

        {/* フォーム部分 */}
        <div className="px-8 py-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6 text-center">ログイン</h2>

          {/* エラーメッセージ */}
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── Google ログインボタン ── */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isSubmitting}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isGoogleLoading ? (
              <Loader size={16} className="animate-spin text-gray-500" />
            ) : (
              <GoogleIcon />
            )}
            <span>Googleでログイン</span>
          </button>

          {/* 区切り線 */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">または</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* ── メール / パスワードログインフォーム ── */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            {/* メールアドレス */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                メールアドレス
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@company.com"
                  autoComplete="email"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* パスワード */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                パスワード
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  <span>ログイン中...</span>
                </>
              ) : (
                <span>ログイン</span>
              )}
            </button>
          </form>

          {/* 注意書き */}
          <p className="text-center text-xs text-gray-400 mt-6">
            アカウントの作成は管理者にお問い合わせください
          </p>
        </div>
      </div>
    </div>
  );
}