/**
 * @module コンボボックス UI
 */
import { useState, useEffect, useRef, useMemo, useId } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface ComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; code?: string; short_name?: string | null; name_kana?: string | null }>;
  placeholder?: string;
  textValue?: string;
  onNewText?: (text: string) => void;
  allowCreate?: boolean;
  onCreateNew?: (name: string) => void;
}

export default function ComboBox({ value, onChange, options, placeholder = '-- 選択 --', textValue, onNewText, allowCreate, onCreateNew }: ComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ドロップダウンが開いたときにハイライトをリセット
  useEffect(() => {
    if (isOpen) setHighlightIndex(-1);
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter(o => {
      const name = o.name.toLowerCase();
      const shortName = (o.short_name || '').toLowerCase();
      const nameKana = (o.name_kana || '').toLowerCase();
      const code = (o.code || '').toLowerCase();
      return name.includes(q) || shortName.includes(q) || nameKana.includes(q) || code.includes(q) || code.startsWith(q);
    });
  }, [query, options]);

  const handleSelect = (id: string) => { onChange(id); setIsOpen(false); setQuery(''); };
  const displayText = selectedOption
    ? `${selectedOption.code ? selectedOption.code + ' ' : ''}${selectedOption.name}`
    : (textValue || '');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        handleSelect(filtered[highlightIndex].id);
      } else if (filtered.length === 1) {
        handleSelect(filtered[0].id);
      } else if (filtered.length === 0 && query.trim() && onNewText) {
        onNewText(query.trim()); setIsOpen(false); setQuery('');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const activeDescendant = highlightIndex >= 0 && highlightIndex < filtered.length
    ? `${listboxId}-option-${highlightIndex}`
    : undefined;

  return (
    <div ref={ref} className="relative" role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-owns={listboxId}>
      <button type="button"
        onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 50); }}
        aria-label={displayText || placeholder}
        className="w-full border border-gray-300 rounded-lg p-2.5 pr-8 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
        {displayText ? (
          <span className={selectedOption ? '' : 'text-orange-600'}>{displayText}{!selectedOption && textValue ? ' (未登録)' : ''}</span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown size={14} className="absolute right-2.5 top-3.5 text-gray-400 pointer-events-none" />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="名前・ローマ字・番号で検索"
                role="searchbox"
                aria-controls={listboxId}
                aria-activedescendant={activeDescendant}
                className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={handleKeyDown} />
            </div>
          </div>
          <div id={listboxId} role="listbox" className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                該当なし
                {query.trim() && onNewText && (
                  <button type="button" onClick={() => { onNewText(query.trim()); setIsOpen(false); setQuery(''); }}
                    className="ml-2 text-blue-600 hover:underline">「{query}」をテキスト入力</button>
                )}
                {query.trim() && allowCreate && onCreateNew && (
                  <button type="button" onClick={() => { onCreateNew(query.trim()); setIsOpen(false); setQuery(''); }}
                    className="ml-2 text-green-600 hover:underline">マスタに追加</button>
                )}
              </div>
            ) : (
              <>
                {filtered.map((o, i) => (
                  <button key={o.id} id={`${listboxId}-option-${i}`} type="button" role="option"
                    aria-selected={o.id === value}
                    onClick={() => handleSelect(o.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      i === highlightIndex ? 'bg-blue-100 text-blue-800' :
                      o.id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-blue-50'
                    }`}>
                    {o.code && <span className="text-gray-400 mr-1.5">{o.code}</span>}
                    {o.name}
                    {o.short_name && <span className="text-gray-400 ml-1.5 text-xs">({o.short_name})</span>}
                  </button>
                ))}
                {query.trim() && allowCreate && onCreateNew && !filtered.find(f => f.name === query.trim()) && (
                  <button type="button" onClick={() => { onCreateNew(query.trim()); setIsOpen(false); setQuery(''); }}
                    className="w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 border-t border-gray-100">
                    + 「{query}」をマスタに追加
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
