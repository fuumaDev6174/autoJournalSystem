/**
 * @module freee 連携セクション
 */
import { useState, useEffect } from 'react';
import { Link2, Unlink } from 'lucide-react';

export default function FreeeIntegration() {
  const [status, setStatus] = useState<'loading' | 'disconnected' | 'connected' | 'error'>('loading');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkConnection();
    handleCallback();
  }, []);

  const checkConnection = async () => {
    try {
      const res = await fetch('/api/freee/connection-status');
      const data = await res.json();
      if (data.connected) {
        setStatus('connected');
        setCompanyId(data.companyId);
        setConnectedAt(data.connectedAt);
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/freee/auth-url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert('認証URL の生成に失敗しました');
    } catch (e: unknown) {
      alert('freee連携エラー: ' + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('freee連携を解除しますか？')) return;
    setLoading(true);
    try {
      await fetch('/api/freee/disconnect', { method: 'POST' });
      setStatus('disconnected');
      setCompanyId(null);
      setConnectedAt(null);
    } catch (e: unknown) {
      alert('切断エラー: ' + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  };

  const handleCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code) return;
    window.history.replaceState({}, '', window.location.pathname);
    try {
      const res = await fetch('/api/freee/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('connected');
        setCompanyId(data.companyId || null);
        setConnectedAt(new Date().toISOString());
        alert('freee連携が完了しました');
      } else {
        alert('freee連携に失敗しました: ' + (data.error || '不明なエラー'));
      }
    } catch (e: unknown) {
      alert('freeeコールバックエラー: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">外部API連携</h2>
          <p className="text-sm text-gray-500 mt-0.5">会計ソフトとの連携設定</p>
        </div>
      </div>
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-700 font-bold text-sm">f</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">freee会計</h3>
              {status === 'connected' ? (
                <div className="text-xs text-gray-500">
                  事業所ID: {companyId || '-'}
                  {connectedAt && <span className="ml-2">（{new Date(connectedAt).toLocaleDateString('ja-JP')}接続）</span>}
                </div>
              ) : (
                <p className="text-xs text-gray-400">未接続</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === 'connected' ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <Link2 size={12} />接続済み
                </span>
                <button type="button" onClick={handleDisconnect} disabled={loading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                  <Unlink size={12} />切断
                </button>
              </>
            ) : status === 'loading' ? (
              <span className="text-xs text-gray-400">確認中...</span>
            ) : (
              <button type="button" onClick={handleConnect} disabled={loading}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                <Link2 size={14} />{loading ? '処理中...' : 'freee連携開始'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
