// OCR ページ
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Loader, RotateCcw } from 'lucide-react';
import { useWorkflow } from '@/web/app/providers/WorkflowProvider';
import { documentsApi, clientsApi, journalEntriesApi, storageApi, ocrApi, journalGenerateApi } from '@/web/shared/lib/api/backend.api';
import WorkflowHeader from '@/web/features/workflow/components/WorkflowHeader';
import { useConfirm } from '@/web/shared/hooks/useConfirm';

type OCRStatus = 'pending' | 'processing' | 'completed' | 'error';
type ErrorStep = 'storage_url' | 'ocr_api' | 'ocr_save' | 'journal_api' | 'journal_save' | 'lines_save' | 'unknown';

interface OCRResultItem {
  id: string;
  documentId: string;
  fileName: string;
  storagePath: string;
  status: OCRStatus;
  processedAt?: string;
  errorMessage?: string;
  errorStep?: ErrorStep;
  journalEntryId?: string;
  retryCount: number;
}

const MAX_RETRY = 3;

interface OCRApiResult {
  confidence_score?: number;
  extracted_supplier?: string;
  extracted_amount?: number;
  extracted_tax_amount?: number;
  extracted_date?: string;
  [key: string]: unknown;
}

interface JournalGenerateResult {
  journal_entry: {
    entry_date?: string;
    notes?: string;
    confidence?: number;
    lines?: Array<{
      line_number?: number;
      debit_credit: string;
      account_item_id: string;
      amount: number;
      tax_category_id?: string | null;
      tax_rate?: number | null;
      tax_amount?: number | null;
      description?: string | null;
    }>;
  };
  [key: string]: unknown;
}

// エラーステップの日本語ラベル
const ERROR_STEP_LABELS: Record<ErrorStep, string> = {
  storage_url: 'ファイルURL取得',
  ocr_api: 'OCR読取（Gemini API）',
  ocr_save: 'OCR結果のDB保存',
  journal_api: '仕訳生成（Gemini API）',
  journal_save: '仕訳ヘッダーのDB保存',
  lines_save: '仕訳明細行のDB保存',
  unknown: '不明',
};

export default function OCRPage() {
  const { currentWorkflow, updateWorkflowData } = useWorkflow();
  const { confirm, ConfirmDialogElement } = useConfirm();
  const [ocrResults, setOcrResults] = useState<OCRResultItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [industry, setIndustry] = useState<string>('');

  useEffect(() => {
    if (!currentWorkflow) return;
    const wfData = currentWorkflow.data as Record<string, unknown>;
    const documentIds: string[] = (wfData.documents as string[] | undefined) ?? (wfData.uploaded_document_ids as string[] | undefined) ?? [];
    if (documentIds.length === 0) return;

    const init = async () => {
      const results: OCRResultItem[] = [];
      for (const docId of documentIds) {
        const { data: doc } = await documentsApi.getById(docId);
        if (doc) {
          results.push({
            id: `ocr-${docId}`,
            documentId: docId,
            fileName: doc.original_file_name || doc.file_name,
            storagePath: doc.storage_path || doc.file_path,
            status: doc.ocr_status === 'completed' ? 'completed' : doc.ocr_status === 'error' ? 'error' : 'pending',
            errorMessage: doc.ocr_status === 'error' ? '前回の処理でエラーが発生しました' : undefined,
            retryCount: 0,
          });
        }
      }

      const clientId = currentWorkflow.clientId;
      const { data: client } = await clientsApi.getById(clientId);
      if (client?.industry) setIndustry(client.industry.name || '');

      setOcrResults(results);
    };
    init();
  }, [currentWorkflow]);

  const resolveOrganizationId = async (clientId: string): Promise<string | null> => {
    const { data, error } = await clientsApi.getById(clientId);
    if (error || !data) return null;
    return data.organization_id;
  };

  const processOneDocument = async (result: OCRResultItem) => {
    setOcrResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'processing' as OCRStatus, errorMessage: undefined, errorStep: undefined } : r));

    let currentStep: ErrorStep = 'unknown';

    try {
      // --- STEP 1: Storage署名付きURL ---
      currentStep = 'storage_url';
      const storagePath = result.storagePath;

      const { data: signedUrlData, error: urlError } = await storageApi.getSignedUrl(storagePath);

      if (urlError || !signedUrlData?.signedUrl) {
        throw new Error(`ファイルURLの取得に失敗: ${urlError || '署名URL生成エラー'}`);
      }

      // --- STEP 2: OCR API ---
      currentStep = 'ocr_api';
      const { data: ocrData, error: ocrError } = await ocrApi.process({
        document_id: result.documentId,
        file_url: signedUrlData.signedUrl,
        file_path: result.storagePath,
      });

      if (ocrError || !ocrData) {
        throw new Error(ocrError || 'OCR API エラー');
      }

      const ocrResult = ocrData.ocr_result as OCRApiResult;

      // --- STEP 3: OCR結果をDBに保存 ---
      // doc_classification に classifier 結果 + extractor の全抽出データを統合保存
      currentStep = 'ocr_save';
      const existingClassification = ocrData.classification ?? {};
      const mergedClassification: Record<string, unknown> = {
        ...existingClassification,
        // extractor の全フィールドを統合（レビューページの各パネルで参照される）
        extracted_supplier: ocrResult.extracted_supplier ?? null,
        extracted_amount: ocrResult.extracted_amount ?? null,
        extracted_tax_amount: ocrResult.extracted_tax_amount ?? null,
        extracted_date: ocrResult.extracted_date ?? null,
        extracted_items: ocrResult.extracted_items ?? null,
        extracted_payment_method: ocrResult.extracted_payment_method ?? null,
        extracted_invoice_number: ocrResult.extracted_invoice_number ?? null,
        extracted_tategaki: ocrResult.extracted_tategaki ?? null,
        withholding_tax_amount: ocrResult.extracted_withholding_tax ?? null,
        invoice_qualification: ocrResult.extracted_invoice_qualification ?? null,
        extracted_addressee: ocrResult.extracted_addressee ?? null,
        extracted_transaction_type: ocrResult.extracted_transaction_type ?? null,
        extracted_transfer_fee_bearer: ocrResult.extracted_transfer_fee_bearer ?? null,
        confidence_score: ocrResult.confidence_score ?? null,
        // 控除証明書系の追加フィールド
        life_insurance_details: ocrResult.life_insurance_details ?? null,
        annual_amount: ocrResult.annual_amount ?? null,
        donation_amount: ocrResult.donation_amount ?? null,
        earthquake_premium: ocrResult.earthquake_premium ?? null,
        total_medical_expense: ocrResult.total_medical_expense ?? null,
        loan_balance: ocrResult.loan_balance ?? null,
        // 複合仕訳系
        payroll_details: ocrResult.payroll_details ?? null,
        sales_details: ocrResult.sales_details ?? null,
        // 資産系
        acquisition_cost: ocrResult.acquisition_cost ?? null,
        useful_life: ocrResult.useful_life ?? null,
        // 繰越
        carryover_loss: ocrResult.carryover_loss ?? null,
        fiscal_year: ocrResult.fiscal_year ?? null,
      };

      const { error: ocrSaveError } = await documentsApi.update(result.documentId, {
        ocr_status: 'completed',
        ocr_confidence: ocrResult.confidence_score ?? null,
        supplier_name: ocrResult.extracted_supplier ?? null,
        amount: ocrResult.extracted_amount ?? null,
        tax_amount: ocrResult.extracted_tax_amount ?? null,
        document_date: ocrResult.extracted_date || new Date().toISOString().split('T')[0],
        status: 'ocr_completed',
        doc_classification: mergedClassification,
      });

      if (ocrSaveError) {
        throw new Error(`OCR結果の保存に失敗: ${ocrSaveError}`);
      }

      // --- STEP 4: 仕訳生成API ---
      currentStep = 'journal_api';
      const { data: journalData, error: journalError } = await journalGenerateApi.generate({
        document_id: result.documentId,
        client_id: currentWorkflow!.clientId,
        ocr_result: ocrResult,
        industry,
      });

      if (journalError || !journalData) {
        throw new Error(journalError || '仕訳生成 API エラー');
      }

      const journalGenResult = journalData as unknown as JournalGenerateResult;
      const journalEntry = journalGenResult.journal_entry;

      // --- STEP 5: 仕訳ヘッダーINSERT ---
      currentStep = 'journal_save';
      const organizationId = await resolveOrganizationId(currentWorkflow!.clientId);
      if (!organizationId) {
        throw new Error('organization_id の取得に失敗しました');
      }

      // Backend POST /api/journal-entries accepts { ...entry, lines } and inserts both header and lines
      currentStep = 'lines_save';
      const linesToInsert = (journalEntry.lines || []).map((line, idx) => ({
        line_number: line.line_number ?? idx + 1,
        debit_credit: line.debit_credit,
        account_item_id: line.account_item_id,
        amount: line.amount,
        tax_category_id: line.tax_category_id || null,
        tax_rate: line.tax_rate || null,
        tax_amount: line.tax_amount || null,
        description: line.description || null,
      }));

      const { data: savedEntry, error: dbSaveError } = await journalEntriesApi.create({
        organization_id: organizationId,
        client_id: currentWorkflow!.clientId,
        document_id: result.documentId,
        entry_date: journalEntry.entry_date || ocrResult.extracted_date,
        entry_type: 'normal',
        description: journalEntry.notes,
        status: 'draft',
        notes: journalEntry.notes,
        ai_generated: true,
        ai_confidence: journalEntry.confidence,
        lines: linesToInsert,
      });

      if (dbSaveError || !savedEntry) {
        throw new Error(`仕訳保存エラー: ${dbSaveError || '保存失敗'}`);
      }

      // --- STEP 6: documentsステータス更新 ---
      await documentsApi.update(result.documentId, { status: 'ai_processing' });

      // --- 完了 ---
      setOcrResults(prev => prev.map(r =>
        r.id === result.id
          ? { ...r, status: 'completed' as OCRStatus, processedAt: new Date().toISOString(), journalEntryId: savedEntry.id, errorMessage: undefined, errorStep: undefined }
          : r
      ));

    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`OCR エラー [${currentStep}] (${result.fileName}):`, error);

      // DB側のステータスも適切に更新
      if (currentStep === 'ocr_api' || currentStep === 'storage_url') {
        // OCR自体が失敗 → ocr_status='error'
        await documentsApi.update(result.documentId, { ocr_status: 'error', status: 'uploaded' });
      } else if (currentStep === 'journal_api' || currentStep === 'journal_save' || currentStep === 'lines_save') {
        // OCRは成功、仕訳生成が失敗 → ocr_status='completed' のまま、status='ocr_completed'
        await documentsApi.update(result.documentId, { status: 'ocr_completed' });
      }

      setOcrResults(prev => prev.map(r =>
        r.id === result.id
          ? { ...r, status: 'error' as OCRStatus, errorMessage: errMsg, errorStep: currentStep, retryCount: r.retryCount + 1 }
          : r
      ));
    }
  };

  const CONCURRENCY = 200;

  const runBatch = async (targets: OCRResultItem[]) => {
    if (targets.length === 0) return;
    setProcessing(true);
    let running = 0;
    let index = 0;

    await new Promise<void>((resolve) => {
      const tryNext = () => {
        if (index >= targets.length && running === 0) { resolve(); return; }
        while (running < CONCURRENCY && index < targets.length) {
          const item = targets[index++];
          running++;
          processOneDocument(item).finally(() => { running--; tryNext(); });
        }
      };
      tryNext();
    });

    setProcessing(false);
  };

  // 全pending処理
  const startOCRProcessing = useCallback(() => {
    runBatch(ocrResults.filter(r => r.status === 'pending'));
  }, [ocrResults]);

  // ショートカットキー
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') { e.preventDefault(); startOCRProcessing(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [startOCRProcessing]);

  // 1件再処理
  const retryOne = async (result: OCRResultItem) => {
    if (result.retryCount >= MAX_RETRY) {
      if (!await confirm(`この証憑は${result.retryCount}回再処理しています。\nもう一度試しますか？`)) return;
    }
    runBatch([result]);
  };

  // エラー全件再処理
  const retryAllErrors = async () => {
    const errors = ocrResults.filter(r => r.status === 'error');
    if (errors.length === 0) return;
    if (!await confirm(`エラーの${errors.length}件を再処理しますか？`)) return;
    runBatch(errors);
  };

  const handleBeforeNext = async (): Promise<boolean> => {
    if (ocrResults.some(r => r.status === 'pending' || r.status === 'processing')) {
      alert('すべてのOCR処理が完了していません。処理を開始してください。');
      return false;
    }
    const errorItems = ocrResults.filter(r => r.status === 'error');
    if (errorItems.length > 0) {
      const proceed = await confirm(
        `エラーの証憑が${errorItems.length}件あります。\n\n` +
        errorItems.map(e => `・${e.fileName}: ${ERROR_STEP_LABELS[e.errorStep || 'unknown']}で失敗`).join('\n') +
        '\n\nこのまま次へ進みますか？（エラー件は除外されます）'
      );
      if (!proceed) return false;
    }
    updateWorkflowData({ ocrResults: ocrResults.filter(r => r.status === 'completed').map(r => r.id) });
    return true;
  };

  const completedCount = ocrResults.filter(r => r.status === 'completed').length;
  const processingCount = ocrResults.filter(r => r.status === 'processing').length;
  const pendingCount = ocrResults.filter(r => r.status === 'pending').length;
  const errorCount = ocrResults.filter(r => r.status === 'error').length;
  const totalCount = ocrResults.length;
  const allDone = totalCount > 0 && ocrResults.every(r => r.status === 'completed' || r.status === 'error');

  if (!currentWorkflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center max-w-md">
          <AlertCircle size={64} className="text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">ワークフローが開始されていません</h2>
          <p className="text-gray-600 mb-6">OCR処理を行うには、顧客一覧からワークフローを開始してください。</p>
          <a href="/clients" className="btn-primary">顧客一覧へ戻る</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <WorkflowHeader onBeforeNext={handleBeforeNext} nextLabel="AIチェックへ" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* サマリーカード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 bg-blue-500 rounded-full"></div><h3 className="text-sm font-medium text-gray-600">総ファイル数</h3></div>
              <div className="text-3xl font-bold text-gray-900">{totalCount}</div>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-2"><CheckCircle size={20} className="text-green-500" /><h3 className="text-sm font-medium text-gray-600">完了</h3></div>
              <div className="text-3xl font-bold text-green-600">{completedCount}</div>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-2"><Loader size={20} className="text-orange-500" /><h3 className="text-sm font-medium text-gray-600">処理中</h3></div>
              <div className="text-3xl font-bold text-gray-900">{processingCount}</div>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-2"><AlertCircle size={20} className="text-red-500" /><h3 className="text-sm font-medium text-gray-600">エラー</h3></div>
              <div className="text-3xl font-bold text-red-600">{errorCount}</div>
            </div>
          </div>

          {/* 進捗ゲージ */}
          {processing && (
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">処理進捗</h3>
                <span className="text-sm font-medium text-gray-700">{completedCount} / {totalCount} 件完了</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          {/* OCR開始ボタン */}
          {pendingCount > 0 && !processing && (
            <div className="card bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">OCR処理を開始</h3>
                  <p className="text-sm text-gray-600">{pendingCount}件のファイルをOCR処理・仕訳生成します</p>
                  {industry && <p className="text-xs text-gray-500 mt-1">業種: {industry}</p>}
                </div>
                <button type="button" onClick={startOCRProcessing} className="btn-primary">処理開始</button>
              </div>
            </div>
          )}

          {/* エラー全件再処理ボタン */}
          {errorCount > 0 && !processing && (
            <div className="card bg-red-50 border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">エラーが{errorCount}件あります</h3>
                  <p className="text-sm text-red-700">再処理ボタンで個別に、または一括で再実行できます</p>
                </div>
                <button type="button" onClick={retryAllErrors} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                  <RotateCcw size={16} />エラー全件再処理
                </button>
              </div>
            </div>
          )}

          {/* 処理状況リスト */}
          {ocrResults.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">処理状況</h2>
              <div className="space-y-2">
                {ocrResults.map(result => (
                  <div key={result.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border ${
                      result.status === 'completed' ? 'bg-green-50 border-green-200'
                      : result.status === 'error' ? 'bg-red-50 border-red-200'
                      : result.status === 'processing' ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                    }`}>

                    {/* ステータスアイコン */}
                    <div className="flex-shrink-0">
                      {result.status === 'pending' && <div className="w-6 h-6 rounded-full bg-gray-200" />}
                      {result.status === 'processing' && <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
                      {result.status === 'completed' && <CheckCircle size={22} className="text-green-500" />}
                      {result.status === 'error' && <AlertCircle size={22} className="text-red-500" />}
                    </div>

                    {/* ファイル名 + エラー詳細 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{result.fileName}</p>
                      {result.processedAt && (
                        <p className="text-xs text-gray-500">{new Date(result.processedAt).toLocaleTimeString('ja-JP')} 完了</p>
                      )}
                      {result.status === 'error' && (
                        <div className="mt-1">
                          {result.errorStep && (
                            <p className="text-xs text-red-700 font-medium">
                              失敗箇所: {ERROR_STEP_LABELS[result.errorStep]}
                            </p>
                          )}
                          <p className="text-xs text-red-600 mt-0.5">{result.errorMessage}</p>
                          {result.retryCount > 0 && (
                            <p className="text-xs text-red-400 mt-0.5">再処理回数: {result.retryCount}回</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ステータス + 再処理ボタン */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {result.status === 'pending' && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">待機中</span>}
                      {result.status === 'processing' && <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded font-medium">処理中...</span>}
                      {result.status === 'completed' && <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded font-medium">完了</span>}
                      {result.status === 'error' && (
                        <>
                          <span className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded font-medium">エラー</span>
                          {!processing && (
                            <button
                              onClick={() => retryOne(result)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors"
                              title="この証憑を再処理"
                            >
                              <RotateCcw size={12} />再処理
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 完了メッセージ */}
          {allDone && completedCount > 0 && (
            <div className="card bg-green-50 border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle size={32} className="text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-900">OCR処理・仕訳生成が完了しました</h3>
                  <p className="text-sm text-green-700">
                    {completedCount}件を処理しました。「→」キーまたは上部の「AIチェックへ」で次に進んでください。
                    {errorCount > 0 && ` (${errorCount}件はエラー — 再処理するか、このまま除外して進めます)`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ファイルなし */}
          {ocrResults.length === 0 && (
            <div className="card text-center py-12">
              <AlertCircle size={64} className="text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">処理するファイルがありません</h3>
              <p className="text-sm text-gray-500 mb-4">前のステップで証憑をアップロードしてください</p>
            </div>
          )}
        </div>
      </div>
      {ConfirmDialogElement}
    </div>
  );
}