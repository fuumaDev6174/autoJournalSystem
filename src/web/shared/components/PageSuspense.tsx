/**
 * @module ページ読み込みフォールバック
 * React.lazy + Suspense 用の共通ローディング UI。
 */
export default function PageSuspense() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    </div>
  );
}
