前提: 現在の状態
完了済み

第1弾: DB基盤整備（全完了）
第2弾: ルールエンジン強化（全完了）
第3弾: 3-1（ステータス5段階）、3-2（rules.tsxフォーム拡張）、3-3（industries.tsx N階層）、3-4（承認ダッシュボード）

技術スタック

フロント: React + TypeScript + Tailwind CSS + Vite
バックエンド: Express.js（src/server/）
DB: Supabase（PostgreSQL + Storage + Auth）
AI: Google Gemini（OCR: Flash、仕訳生成: Pro）
パスエイリアス: @/ → src/

ロール体系（4種）

admin: 全権限
manager: ルール承認、仕訳承認、エクスポート
operator: 仕訳確認・修正、ルール提案
viewer: 証憑アップロードと閲覧のみ

ステータス遷移（5段階）

draft → reviewed（operator確認OK）→ approved（manager承認）→ posted（エクスポート済）→ amended（修正必要）


タスク 3-5: viewer専用アップロード画面
概要
viewerロールのユーザーがログインすると /upload-only に遷移する専用画面を作成。
ワークフローの他ステップには進めない。顧客選択 + D&D + アップロード済み一覧 + 未処理証憑数を表示。
ファイル変更
新規作成: src/client/pages/uploadOnly.tsx
tsximport { useState, useEffect, useCallback } from 'react';
import { Upload, X, CheckCircle, AlertCircle, FileText, LogOut } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/client/lib/supabase';

interface UploadedFile {
  id: string;
  file: File;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
}

interface RecentDoc {
  id: string;
  file_name: string;
  document_date: string;
  ocr_status: string;
  created_at: string;
}

export default function UploadOnlyPage() {
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: userRow } = await supabase.from('users').select('organization_id').eq('id', user.id).single();
      if (userRow) setOrgId(userRow.organization_id);
      const { data: clientsData } = await supabase.from('clients').select('id, name').order('name');
      if (clientsData) setClients(clientsData);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedClientId) { setRecentDocs([]); setPendingCount(0); return; }
    const loadDocs = async () => {
      const { data } = await supabase.from('documents')
        .select('id, file_name, document_date, ocr_status, created_at')
        .eq('client_id', selectedClientId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        setRecentDocs(data);
        setPendingCount(data.filter(d => d.ocr_status === 'pending').length);
      }
    };
    loadDocs();
  }, [selectedClientId]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedClientId || !userId || !orgId) return;
    const newFiles: UploadedFile[] = acceptedFiles.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      status: 'uploading' as const,
      progress: 0,
    }));
    setUploadedFiles(prev => [...newFiles, ...prev]);

    for (const uf of newFiles) {
      try {
        const timestamp = Date.now();
        const safeName = uf.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `documents/${orgId}/${selectedClientId}/${timestamp}_${safeName}`;

        const { error: storageError } = await supabase.storage
          .from('documents').upload(storagePath, uf.file, { cacheControl: '3600', upsert: false });
        if (storageError) throw new Error(storageError.message);

        const { error: dbError } = await supabase.from('documents').insert({
          client_id: selectedClientId,
          organization_id: orgId,
          file_name: uf.file.name,
          original_file_name: uf.file.name,
          file_path: storagePath,
          storage_path: storagePath,
          file_size: uf.file.size,
          file_type: uf.file.type,
          document_date: new Date().toISOString().split('T')[0],
          ocr_status: 'pending',
          status: 'uploaded',
          uploaded_by: userId,
        });
        if (dbError) throw new Error(dbError.message);

        setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'success', progress: 100 } : f));
        setPendingCount(prev => prev + 1);
      } catch (err: any) {
        setUploadedFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'error', errorMessage: err.message } : f));
      }
    }
  }, [selectedClientId, userId, orgId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'], 'application/pdf': ['.pdf'] },
    disabled: !selectedClientId,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">証憑アップロード</h1>
          <p className="text-sm text-gray-500">証憑をアップロードしてください。担当者が仕訳処理を行います。</p>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          <LogOut size={16} /> ログアウト
        </button>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* 顧客選択 */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">顧客を選択 <span className="text-red-500">*</span></label>
          <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">選択してください</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* 未処理数 */}
        {selectedClientId && pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-800">未処理の証憑が <span className="font-bold">{pendingCount}件</span> あります。</p>
          </div>
        )}

        {/* ドロップゾーン */}
        <div {...getRootProps()}
          className={`bg-white rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
            !selectedClientId ? 'border-gray-200 bg-gray-50 cursor-not-allowed' :
            isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
          }`}>
          <input {...getInputProps()} />
          <Upload size={40} className={`mx-auto mb-3 ${!selectedClientId ? 'text-gray-300' : 'text-gray-400'}`} />
          {!selectedClientId ? (
            <p className="text-sm text-gray-400">先に顧客を選択してください</p>
          ) : isDragActive ? (
            <p className="text-sm text-blue-600 font-medium">ここにドロップ</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 font-medium">ファイルをドラッグ＆ドロップ</p>
              <p className="text-xs text-gray-400 mt-1">または クリックしてファイルを選択（画像/PDF対応）</p>
            </>
          )}
        </div>

        {/* アップロード結果 */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {uploadedFiles.map(uf => (
              <div key={uf.id} className="flex items-center gap-3 px-4 py-3">
                {uf.status === 'success' ? <CheckCircle size={18} className="text-green-500 flex-shrink-0" /> :
                 uf.status === 'error' ? <AlertCircle size={18} className="text-red-500 flex-shrink-0" /> :
                 <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{uf.file.name}</p>
                  {uf.errorMessage && <p className="text-xs text-red-500">{uf.errorMessage}</p>}
                </div>
                <span className={`text-xs font-medium ${uf.status === 'success' ? 'text-green-600' : uf.status === 'error' ? 'text-red-600' : 'text-blue-600'}`}>
                  {uf.status === 'success' ? '完了' : uf.status === 'error' ? 'エラー' : 'アップロード中...'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* アップロード済み一覧 */}
        {selectedClientId && recentDocs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">最近アップロードした証憑</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {recentDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                  <FileText size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900 flex-1 truncate">{doc.file_name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    doc.ocr_status === 'completed' ? 'bg-green-100 text-green-700' :
                    doc.ocr_status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    doc.ocr_status === 'error' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{doc.ocr_status === 'completed' ? '処理済' : doc.ocr_status === 'processing' ? '処理中' : doc.ocr_status === 'error' ? 'エラー' : '未処理'}</span>
                  <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString('ja-JP')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
修正: src/client/main.tsx

import追加（SettingsPageのimportの近くに）:

typescriptimport UploadOnlyPage from './pages/uploadOnly';

Route追加（<Route path="/settings" ...> の後に）:

tsx<Route path="/upload-only" element={<UploadOnlyPage />} />

PrivateRouteコンポーネント内で、viewerロールの場合にリダイレクトするロジックを追加。
PrivateRouteの定義を探して、以下の処理を追加:


ログイン後にユーザーのroleを取得
role === 'viewer' の場合、/upload-only にリダイレクト
/upload-only はLayoutを使わない（サイドバー不要）

具体的には、/upload-only のRouteは <Layout> の外側に配置する:
tsx{/* viewer専用（Layout外） */}
<Route path="/upload-only" element={
  <PrivateRoute>
    <UploadOnlyPage />
  </PrivateRoute>
} />
そして <Layout> 内のルートにviewerガードを追加するか、Layout.tsx側でviewerの場合は /upload-only にリダイレクトする。
修正: src/client/components/layout/Layout.tsx
viewerロールの場合の処理を追加。Layout内でuserRoleを取得し、viewerなら/upload-onlyにリダイレクトする:
tsx// Layout.tsx の冒頭（useEffect内で）
useEffect(() => {
  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
      if (data?.role === 'viewer') {
        navigate('/upload-only');
      }
    }
  };
  checkRole();
}, []);
navigate は useNavigate() から取得。既にimport済みならそのまま使用。

タスク 4-1: 書類種別の自動判定
概要
OCRのStep 0（ファイル拡張子判定）とStep 1（Gemini Flashで証憑種別+confidence判定）を実装。
document_typesテーブルの25種別に対応した種別判定を行い、結果をdocuments.doc_classification/ocr_step1_type/ocr_step1_confidenceに保存。
ファイル変更
修正: src/server/services.ts
processOCR関数の前に、新しい関数 classifyDocument を追加:
typescript/**
 * Step 1: 証憑種別の自動判定（Gemini Flash）
 * 証憑画像をGemini Flashに送り、document_typesの25種別から最適なものを判定。
 * confidence >= 0.8 かつ requires_journal=false なら、Step 2（フルOCR）をスキップ可能。
 */
export async function classifyDocument(
  imageBase64: string,
  mimeType: string
): Promise<{
  document_type_code: string;
  confidence: number;
  estimated_lines: number;
  description: string;
}> {
  const prompt = `あなたは日本の税理士事務所で使われる証憑分類AIです。
以下の画像を分析し、証憑の種別を判定してください。

選択肢（codeで回答）:
【仕訳対象】
receipt: レシート/領収書
invoice: 請求書
bank_statement: 銀行通帳
credit_card: クレカ明細
etc_statement: ETC利用明細
e_money_statement: 電子マネー/QR決済
expense_report: 経費精算書
payroll: 給与明細
sales_report: 売上集計表/レジ日報
payment_notice: 支払通知書
other_journal: その他仕訳対象

【非仕訳対象】
medical: 医療費
deduction_cert: 控除証明書
housing_loan: 住宅ローン
mynumber: マイナンバー
id_card: 免許証/保険証
other_deduction: その他控除
contract: 契約書
estimate: 見積書
purchase_order: 発注書
delivery_note: 納品書
insurance_policy: 保険証券
registry: 登記簿謄本
minutes: 議事録
other_ref: その他書類

以下のJSON形式で回答してください（JSON以外は出力しないでください）:
{
  "document_type_code": "receipt",
  "confidence": 0.95,
  "estimated_lines": 1,
  "description": "コンビニのレシート"
}

- confidence: 0.0〜1.0の確信度
- estimated_lines: 推定取引行数（レシート=1、通帳=複数行）
- description: 簡潔な説明`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_OCR,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
    });

    const text = response.text?.replace(/```json\n?|```\n?/g, '').trim() || '';
    const parsed = JSON.parse(text);
    return {
      document_type_code: parsed.document_type_code || 'other_ref',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      estimated_lines: parsed.estimated_lines || 1,
      description: parsed.description || '',
    };
  } catch (error) {
    console.error('[classifyDocument] 証憑種別判定エラー:', error);
    return {
      document_type_code: 'other_journal',
      confidence: 0.3,
      estimated_lines: 1,
      description: 'AI判定失敗',
    };
  }
}
修正: src/server/api.ts

importにclassifyDocumentを追加:

typescriptimport { processOCR, generateJournalEntry, exportToFreee, mapLinesToDBFormat, matchProcessingRules, buildEntryFromRule, classifyDocument } from './services.js';

/api/ocr/process エンドポイント内で、processOCRの前にclassifyDocumentを呼ぶ:

OCR処理の冒頭（画像をbase64に変換した直後）に以下を追加:
typescript    // Step 1: 証憑種別の自動判定
    const classification = await classifyDocument(imageBase64, mimeType);
    console.log(`[OCR] Step 1 判定: ${classification.document_type_code} (confidence=${classification.confidence})`);

    // documents テーブルに判定結果を保存
    await supabaseAdmin.from('documents').update({
      doc_classification: classification,
      ocr_step1_type: classification.document_type_code,
      ocr_step1_confidence: classification.confidence,
      ocr_step: 'step1',
    }).eq('id', document_id);

    // document_type_id を設定（document_typesテーブルからcodeで検索）
    const { data: docType } = await supabaseAdmin
      .from('document_types')
      .select('id, requires_journal')
      .eq('code', classification.document_type_code)
      .single();

    if (docType) {
      await supabaseAdmin.from('documents').update({
        document_type_id: docType.id,
      }).eq('id', document_id);

      // 非仕訳対象 かつ confidence >= 0.8 → Step 2スキップ
      if (!docType.requires_journal && classification.confidence >= 0.8) {
        console.log(`[OCR] 非仕訳対象 (confidence=${classification.confidence}) → Step 2スキップ`);
        await supabaseAdmin.from('documents').update({
          ocr_status: 'completed',
          ocr_step: 'step1',
          status: 'excluded',
        }).eq('id', document_id);
        return res.json({
          success: true,
          skipped: true,
          classification,
          message: '非仕訳対象のためOCRスキップ',
        });
      }
    }

    // Step 2: フルOCR（既存のprocessOCR処理）に進む
    await supabaseAdmin.from('documents').update({ ocr_step: 'step2' }).eq('id', document_id);

タスク 4-2: 明細分割エンジン
概要
statement_extractパターン（通帳、クレカ明細等）の証憑から複数取引を抽出するエンジン。
Gemini Proに全ページ画像を一括送信し、各行のデータを配列で返却。
ファイル変更
修正: src/server/services.ts
processOCR関数の後に、新しい関数 extractMultipleEntries を追加:
typescript/**
 * 明細分割エンジン: statement_extract パターンの証憑から複数取引を抽出
 * 通帳、クレカ明細、ETC明細、経費精算書等に使用。
 * Gemini Proに全ページ画像を一括送信→各行のデータを配列で返却。
 */
export async function extractMultipleEntries(
  imageBase64: string,
  mimeType: string,
  documentType: string,
  industryPath?: string
): Promise<Array<{
  date: string;
  description: string;
  amount: number;
  counterparty: string | null;
  is_income: boolean;
  suggested_account_name: string | null;
  tax_rate: number | null;
  confidence: number;
}>> {
  const typeHints: Record<string, string> = {
    bank_statement: '銀行通帳の入出金明細です。各行の日付・摘要・入金額または出金額を抽出してください。',
    credit_card: 'クレジットカードの利用明細です。各行の利用日・利用先・金額を抽出してください。',
    etc_statement: 'ETC利用明細です。各行の利用日・IC名・金額を抽出してください。',
    e_money_statement: '電子マネー/QR決済の利用明細です。各行の日付・利用先・金額を抽出してください。',
    expense_report: '経費精算書です。各行の日付・項目・金額を抽出してください。',
  };

  const hint = typeHints[documentType] || '明細書です。各行のデータを抽出してください。';
  const industryContext = industryPath ? `\n- 業種階層: ${industryPath}` : '';

  const prompt = `あなたは日本の税理士事務所のOCR解析AIです。
${hint}
${industryContext}

各取引行を以下のJSON配列で返してください（JSON以外は出力しないでください）:
[
  {
    "date": "2024-03-15",
    "description": "摘要/利用先",
    "amount": 1500,
    "counterparty": "取引先名（不明ならnull）",
    "is_income": false,
    "suggested_account_name": "推定される勘定科目名（不明ならnull）",
    "tax_rate": 0.10,
    "confidence": 0.85
  }
]

- date: YYYY-MM-DD形式
- amount: 正の数値（円単位、税込）
- is_income: 入金/売上ならtrue、出金/支出ならfalse
- suggested_account_name: 日本の勘定科目名（例: 旅費交通費、消耗品費、売上高）
- confidence: 各行の抽出確信度（0.0〜1.0）
- 読み取れない行はconfidence=0.3以下で含める`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_JOURNAL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
    });

    const text = response.text?.replace(/```json\n?|```\n?/g, '').trim() || '[]';
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error('[extractMultipleEntries] 明細分割エラー:', error);
    return [];
  }
}
修正: src/server/api.ts

importにextractMultipleEntriesを追加
仕訳生成エンドポイント（/api/journal-entries/generate）内で、
document_typeが statement_extract パターンの場合に extractMultipleEntries を使い、
各行ごとにjournal_entries + journal_entry_linesをbulk INSERTする分岐を追加。
判定ロジック:

typescript   // doc_classificationまたはdocument_type_idからprocessing_patternを取得
   // processing_pattern === 'statement_extract' の場合→ extractMultipleEntries を使用
   // それ以外 → 既存の generateJournalEntry を使用

タスク 4-3: 複合仕訳の自動生成
概要
Geminiの仕訳生成プロンプトを拡充し、6パターンの複合仕訳に対応。
既存のgenerateJournalEntry関数のプロンプトを改善。
ファイル変更
修正: src/server/services.ts
generateJournalEntry関数のGeminiプロンプトに以下の複合仕訳パターンを追加:
複合仕訳が必要な場合は、以下のパターンを参考にlines配列に3行以上を含めてください:

パターンA（源泉所得税あり）:
  借方: 外注費 + 仮払消費税
  貸方: 普通預金 + 預り金（源泉所得税）

パターンB（家事按分）:
  借方: 該当科目（事業用分） + 事業主貸（私用分）
  貸方: 現金/未払金

パターンC（借入金返済）:
  借方: 借入金 + 支払利息
  貸方: 普通預金

パターンD（給与支払い）:
  借方: 給与手当
  貸方: 普通預金 + 預り金（所得税） + 預り金（住民税） + 預り金（社会保険料）

パターンE（報酬受取）:
  借方: 普通預金 + 事業主貸（源泉徴収分）
  貸方: 売上高 + 仮受消費税

パターンF（カード引落し精算）:
  借方: 未払金
  貸方: 普通預金

重要: 借方合計 = 貸方合計 を必ず守ること。
1円以上の差異がある場合は貸方最終行で調整し、requires_manual_review: true を設定すること。
この指示をgenerateJournalEntryのプロンプト内に追加する。
既存のプロンプトの lines 配列の説明部分を拡張する形で。

タスク 4-4: review.tsxのmulti_entry対応
概要
1つのdocumentに複数のjournal_entriesが紐づくケース（通帳等）の表示対応。
一覧で親行（ドキュメント情報+件数+合計）と子行（各仕訳）を展開表示。
ファイル変更
修正: src/client/pages/review.tsx
この修正は大規模なので、以下の方針で段階的に実装:

データ取得の変更: document_idでグループ化し、1ドキュメントに複数仕訳があるかを検出
一覧モードの変更: multi_entryのドキュメントは折りたたみ行で表示
個別チェックモードの変更: multi_entryの場合、左にPDF固定、右に仕訳リストをスクロール表示
一括操作: 「全て確認済みにする」ボタンをmulti_entry行に追加

実装の詳細は review.tsx のコードを読んだ上で、既存のDocumentWithEntry型とEntryRow型を
拡張する形で進める。新しい型:
typescriptinterface MultiEntryGroup {
  documentId: string;
  fileName: string;
  storagePath: string;
  entries: EntryRow[];
  totalAmount: number;
  uncheckedCount: number;
  isExpanded: boolean;
}

タスク 5（第5弾の主要タスク、概要のみ）

第5弾は設計議論の引き継ぎ書（doc1）のセクション10〜14を参照。
以下は概要と、Claude Codeに渡す際の注意点のみ記載。

5-1: 通知パネルUI

Layout.tsxのヘッダー右にベルアイコン + 未読バッジ + ドロップダウン
notificationsテーブル（既存）からデータ取得
クリックでlink_urlに遷移、is_read=true に更新

5-2: メモ機能UI

review.tsxと証憑詳細にメモアイコン配置
notesテーブル（A-4で作成済み）にCRUD
未解決メモにバッジ表示、is_resolvedで「対応済み」マーク

5-3: freee API連携

OAuth 2.0認証（settings.tsxに「freee連携開始」ボタン）
account_items.freee_account_item_id カラム追加（ALTER TABLE）
8エンドポイントの実装（deals, manual_journals, receipts, account_items, taxes/codes, partners, reports/trial_bs, reports/journals）
export.tsx からfreee APIへの仕訳送信

5-4: 自動処理13項目

引き継ぎ書セクション9の全13項目を順次実装
優先度高: a(重複検出), e(取引先名寄せ), g(整合性チェック), l(証憑重複検出), m(貸借バランスチェック)