import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Search, ChevronDown, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react';
import type { Industry, Client } from '@/types';
import { useNavigate } from 'react-router-dom';
import Modal from '@/client/components/ui/Modal';
import { supabase } from '@/client/lib/supabase';

interface IndustryNode extends Industry {
  children: IndustryNode[];
  level: number;
  clientCount: number;
}

export default function IndustriesPage() {
  const navigate = useNavigate();
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState<Industry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<string>('viewer');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canEdit = ['admin','manager','operator'].includes(userRole);

  const [formData, setFormData] = useState({
    code: '', name: '', description: '', parent_id: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data: userRow } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
      if (userRow) setUserRole(userRow.role);
    }
    const [indRes, clientRes] = await Promise.all([
      supabase.from('industries').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('clients').select('id, industry_id'),
    ]);
    if (indRes.data) {
      setIndustries(indRes.data as Industry[]);
      const level1Ids = new Set((indRes.data as Industry[]).filter(i => !i.parent_id).map(i => i.id));
      setExpanded(level1Ids);
    }
    if (clientRes.data) setClients(clientRes.data as Client[]);
    setLoading(false);
  };

  const tree = useMemo(() => {
    const getClientCount = (id: string): number => {
      const direct = clients.filter(c => c.industry_id === id).length;
      const childIds = industries.filter(i => i.parent_id === id).map(i => i.id);
      return direct + childIds.reduce((sum, cid) => sum + getClientCount(cid), 0);
    };
    const buildTree = (parentId: string | null, level: number): IndustryNode[] => {
      return industries.filter(i => i.parent_id === parentId).map(i => ({
        ...i, level, clientCount: getClientCount(i.id), children: buildTree(i.id, level + 1),
      }));
    };
    return buildTree(null, 0);
  }, [industries, clients]);

  const matchesSearch = (node: IndustryNode): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q) ||
        (node.description?.toLowerCase().includes(q) ?? false)) return true;
    return node.children.some(c => matchesSearch(c));
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const expandAll = () => setExpanded(new Set(industries.map(i => i.id)));
  const collapseAll = () => setExpanded(new Set());

  const handleOpenNewModal = (parentId = '') => {
    setEditingIndustry(null);
    setFormData({ code: '', name: '', description: '', parent_id: parentId });
    setShowModal(true);
  };
  const handleOpenEditModal = (industry: Industry) => {
    setEditingIndustry(industry);
    setFormData({ code: industry.code, name: industry.name, description: industry.description || '', parent_id: industry.parent_id || '' });
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const siblings = industries.filter(i => (i.parent_id || '') === formData.parent_id);
    const maxSort = siblings.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const data = {
      code: formData.code, name: formData.name, description: formData.description || null,
      parent_id: formData.parent_id || null, sort_order: editingIndustry ? editingIndustry.sort_order : maxSort + 1, is_active: true,
    };
    if (editingIndustry) {
      const { error } = await supabase.from('industries').update(data).eq('id', editingIndustry.id);
      if (error) { alert('更新に失敗しました: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('industries').insert([data]);
      if (error) { alert('登録に失敗しました: ' + error.message); return; }
    }
    setShowModal(false); setEditingIndustry(null); loadData();
  };
  const handleDelete = async (industry: Industry) => {
    const childCount = industries.filter(i => i.parent_id === industry.id).length;
    const clientCount = clients.filter(c => c.industry_id === industry.id).length;
    if (childCount > 0) { alert(`この業種には${childCount}件の子項目があります。\n先に子項目を削除してください。`); return; }
    if (clientCount > 0) { alert(`この業種は${clientCount}件の顧客に紐付いています。\n先に顧客の業種を変更してください。`); return; }
    if (!window.confirm(`「${industry.name}」を削除しますか？`)) return;
    const { error } = await supabase.from('industries').update({ is_active: false }).eq('id', industry.id);
    if (error) alert('削除に失敗しました: ' + error.message); else loadData();
  };

  const getLevel = (id: string): number => {
    let level = 0;
    let current = industries.find(i => i.id === id);
    while (current?.parent_id) {
      level++;
      current = industries.find(i => i.id === current!.parent_id);
    }
    return level;
  };

  const getLevelLabel = (parentId: string) => {
    if (!parentId) return 'Level 1（ルート）';
    const parentLevel = getLevel(parentId);
    return `Level ${parentLevel + 2}`;
  };

  const parentOptions = useMemo(() => {
    const options: Array<{ id: string; name: string; level: number }> = [];
    const buildOptions = (parentId: string | null, level: number) => {
      industries
        .filter(i => i.parent_id === parentId)
        .forEach(i => {
          const indent = '　'.repeat(level);
          const prefix = level === 0 ? '📁 ' : '└ ';
          options.push({ id: i.id, name: `${indent}${prefix}${i.name}`, level });
          buildOptions(i.id, level + 1);
        });
    };
    buildOptions(null, 0);
    return options;
  }, [industries]);

  const levelCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const countByLevel = (parentId: string | null, level: number) => {
      industries.filter(i => i.parent_id === parentId).forEach(i => {
        counts[level] = (counts[level] || 0) + 1;
        countByLevel(i.id, level + 1);
      });
    };
    countByLevel(null, 0);
    return counts;
  }, [industries]);

  const maxLevel = Math.max(0, ...Object.keys(levelCounts).map(Number));

  // ★ selectedNode は early return の【前】に配置（Reactフックルール）
  const selectedNode = useMemo(() => {
    const findNode = (nodes: IndustryNode[]): IndustryNode | null => {
      for (const n of nodes) {
        if (n.id === selectedId) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    return selectedId ? findNode(tree) : null;
  }, [selectedId, tree]);

  // ============================================
  // ローディング（全フックの後に配置）
  // ============================================
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // 左ペインのツリーアイテム
  const renderTreeItem = (node: IndustryNode): React.ReactNode => {
    if (!matchesSearch(node)) return null;
    const hasChildren = node.children.length > 0;
    const isExp = expanded.has(node.id);
    const isSel = node.id === selectedId;
    const indent = node.level * 16;
    return (
      <React.Fragment key={node.id}>
        <div onClick={() => setSelectedId(node.id)}
          className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded-md transition-colors text-sm ${isSel ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
          style={{ paddingLeft: 8 + indent }}>
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }} className="p-0.5">
              {isExp ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
            </button>
          ) : <span className="w-4" />}
          <span className="truncate">{node.name}</span>
          {node.clientCount > 0 && <span className="ml-auto text-[10px] text-blue-500 flex-shrink-0">{node.clientCount}</span>}
        </div>
        {hasChildren && isExp && node.children.map(child => renderTreeItem(child))}
      </React.Fragment>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} className="text-gray-700" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">業種管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            {maxLevel + 1}階層構成（{Object.entries(levelCounts).map(([lv, cnt]) => `L${Number(lv) + 1}: ${cnt}件`).join(' / ')}）
          </p>
        </div>
        {canEdit && (
          <button onClick={() => handleOpenNewModal()} className="flex items-center gap-2 btn-primary"><Plus size={18} /> 新規追加</button>
        )}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-60 flex-shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col">
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="検索..." className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="flex gap-1 mt-1.5">
              <button onClick={expandAll} className="text-[10px] text-gray-500 hover:text-blue-600">全展開</button>
              <span className="text-gray-300">|</span>
              <button onClick={collapseAll} className="text-[10px] text-gray-500 hover:text-blue-600">全閉じ</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {tree.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">業種が登録されていません</p>
            ) : tree.map(node => renderTreeItem(node))}
          </div>
          {canEdit && (
            <div className="p-2 border-t border-gray-200">
              <button onClick={() => handleOpenNewModal()} className="w-full text-xs text-blue-600 hover:bg-blue-50 rounded py-1.5 transition-colors">+ 業界を追加</button>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-y-auto">
          {!selectedNode ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <AlertCircle size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm">左のツリーから項目を選択してください</p>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      selectedNode.level === 0 ? 'bg-blue-100 text-blue-700' : selectedNode.level === 1 ? 'bg-cyan-100 text-cyan-700' : selectedNode.level === 2 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                    }`}>Level {selectedNode.level + 1}</span>
                    <h2 className="text-lg font-bold text-gray-900">{selectedNode.name}</h2>
                    {/* パンくずリスト */}
                    {(() => {
                      const breadcrumb: Array<{ id: string; name: string }> = [];
                      let current: Industry | undefined = industries.find(i => i.id === selectedNode.id);
                      while (current?.parent_id) {
                        const parent = industries.find(i => i.id === current!.parent_id);
                        if (parent) breadcrumb.unshift({ id: parent.id, name: parent.name });
                        current = parent;
                      }
                      return breadcrumb.length > 0 ? (
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                          {breadcrumb.map((b, i) => (
                            <React.Fragment key={b.id}>
                              {i > 0 && <span>/</span>}
                              <button onClick={() => setSelectedId(b.id)} className="hover:text-blue-600 hover:underline">{b.name}</button>
                            </React.Fragment>
                          ))}
                          <span>/</span>
                          <span className="text-gray-600">{selectedNode.name}</span>
                        </div>
                      ) : null;
                    })()}
                    <span className="text-xs font-mono text-gray-400">{selectedNode.code}</span>
                  </div>
                  {selectedNode.description && <p className="text-sm text-gray-600 mt-1">{selectedNode.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    {(
                      <button onClick={() => handleOpenNewModal(selectedNode.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100">
                        <Plus size={14} />子項目を追加</button>
                    )}
                    <button onClick={() => handleOpenEditModal(selectedNode)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
                      <Edit size={14} />編集</button>
                    <button onClick={() => handleDelete(selectedNode)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100">
                      <Trash2 size={14} />削除</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3"><div className="text-xl font-bold text-gray-900">{selectedNode.children.length}</div><div className="text-xs text-gray-500">子項目</div></div>
                <div className="bg-blue-50 rounded-lg p-3"><div className="text-xl font-bold text-blue-600">{selectedNode.clientCount}</div><div className="text-xs text-gray-500">紐づき顧客</div></div>
                <div className="bg-gray-50 rounded-lg p-3"><div className="text-xl font-bold text-gray-600">{selectedNode.level}</div><div className="text-xs text-gray-500">レベル</div></div>
              </div>

              {selectedNode.children.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">子項目一覧（{selectedNode.children.length}件）</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedNode.children.map(child => (
                      <div key={child.id} onClick={() => { setSelectedId(child.id); setExpanded(prev => new Set([...prev, selectedNode.id])); }}
                        className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-gray-900">{child.name}</span>
                          <span className="text-[10px] font-mono text-gray-400">{child.code}</span>
                        </div>
                        {child.description && <p className="text-xs text-gray-500 line-clamp-2">{child.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                          {child.children.length > 0 && <span>{child.children.length}子項目</span>}
                          {child.clientCount > 0 && <span className="text-blue-500">{child.clientCount}顧客</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.children.length === 0 && canEdit && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm mb-2">子項目がまだありません</p>
                  <button onClick={() => handleOpenNewModal(selectedNode.id)} className="text-sm text-blue-600 hover:underline">+ 子項目を追加</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingIndustry(null); }}
        title={editingIndustry ? `編集: ${editingIndustry.name}` : `新規追加（${getLevelLabel(formData.parent_id)}）`} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">親項目</label>
            <select value={formData.parent_id} onChange={e => setFormData(p => ({ ...p, parent_id: e.target.value }))} className="input">
              <option value="">なし（業界として登録）</option>
              {parentOptions.map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称 <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">コード <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} className="input font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明（経費の特徴など）</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className="input" rows={3} placeholder="例: 化粧品→経費OK、食事→家事按分、一般衣服→経費NG" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => { setShowModal(false); setEditingIndustry(null); }} className="btn-secondary">キャンセル</button>
            <button type="submit" className="btn-primary">{editingIndustry ? '更新' : '登録'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}