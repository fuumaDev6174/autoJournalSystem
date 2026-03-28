import { useState, useEffect, useCallback } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, LogOut } from 'lucide-react';
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
      {/* header */}
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
        {/* client selector */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">顧客を選択 <span className="text-red-500">*</span></label>
          <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">選択してください</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* pending count */}
        {selectedClientId && pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-800">未処理の証憑が <span className="font-bold">{pendingCount}件</span> あります。</p>
          </div>
        )}

        {/* dropzone */}
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
              <p className="text-sm text-gray-600 font-medium">ファイルをドラッグ&ドロップ</p>
              <p className="text-xs text-gray-400 mt-1">または クリックしてファイルを選択（画像/PDF対応）</p>
            </>
          )}
        </div>

        {/* upload results */}
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

        {/* recent docs */}
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
