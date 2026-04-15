// 生命保険料控除計算パネル — 3区分×新旧制度、自動計算
import { useState, useMemo } from 'react';
import { useReview } from '../../context/ReviewContext';

// --- 控除額計算ロジック（確定申告書の計算式に準拠）---

function calcNewSystem(premium: number): number {
  if (premium <= 20_000) return premium;
  if (premium <= 40_000) return Math.floor(premium * 0.5 + 10_000);
  if (premium <= 80_000) return Math.floor(premium * 0.25 + 20_000);
  return 40_000;
}

function calcOldSystem(premium: number): number {
  if (premium <= 25_000) return premium;
  if (premium <= 50_000) return Math.floor(premium * 0.5 + 12_500);
  if (premium <= 100_000) return Math.floor(premium * 0.25 + 25_000);
  return 50_000;
}

function calcCategory(newP: number, oldP: number): number {
  const nd = calcNewSystem(newP);
  const od = calcOldSystem(oldP);
  if (newP > 0 && oldP > 0) return Math.max(nd, od, Math.min(nd + od, 40_000));
  if (newP > 0) return nd;
  if (oldP > 0) return od;
  return 0;
}

interface RowState { certifiedAmount: number; declaredAmount: number }

export default function LifeInsCalcPanel() {
  const { ci, setForm } = useReview();
  if (!ci) return null;

  // OCR 抽出データから初期値を取得
  const classification = ci.docClassification as Record<string, unknown> | null;
  const lifeDetails = classification?.life_insurance_details as Record<string, Record<string, number>> | undefined;

  const toRow = (key: string): RowState => ({
    certifiedAmount: lifeDetails?.[key]?.certified_amount ?? 0,
    declaredAmount: lifeDetails?.[key]?.declared_amount ?? 0,
  });

  const [ippanNew, setIppanNew] = useState<RowState>(toRow('ippan_new'));
  const [ippanOld, setIppanOld] = useState<RowState>(toRow('ippan_old'));
  const [kaigoNew, setKaigoNew] = useState<RowState>(toRow('kaigo_new'));
  const [nenkinNew, setNenkinNew] = useState<RowState>(toRow('nenkin_new'));
  const [nenkinOld, setNenkinOld] = useState<RowState>(toRow('nenkin_old'));

  const deductions = useMemo(() => {
    const ippan = calcCategory(ippanNew.declaredAmount, ippanOld.declaredAmount);
    const kaigo = calcNewSystem(kaigoNew.declaredAmount);
    const nenkin = calcCategory(nenkinNew.declaredAmount, nenkinOld.declaredAmount);
    const total = Math.min(ippan + kaigo + nenkin, 120_000);
    return { ippan, kaigo, nenkin, total };
  }, [ippanNew, ippanOld, kaigoNew, nenkinNew, nenkinOld]);

  // form に合計控除額を同期
  const syncToForm = (total: number) => {
    setForm(prev => ({ ...prev, amount: total }));
  };

  // 値が変更されるたびにフォームを更新
  useMemo(() => syncToForm(deductions.total), [deductions.total]);

  const fmt = (n: number) => `¥${n.toLocaleString()}`;

  function AmountRow({ label, row, setRow, color }: { label: string; row: RowState; setRow: (r: RowState) => void; color: string }) {
    return (
      <tr>
        <td className={`py-1.5 pr-2 text-xs font-medium ${color}`}>{label}</td>
        <td className="py-1.5 px-1">
          <input type="number" value={row.certifiedAmount || ''} placeholder="0"
            onChange={e => setRow({ ...row, certifiedAmount: Number(e.target.value) || 0 })}
            className="w-full border border-gray-300 rounded p-1 text-xs text-right bg-white" />
        </td>
        <td className="py-1.5 px-1">
          <input type="number" value={row.declaredAmount || ''} placeholder="0"
            onChange={e => setRow({ ...row, declaredAmount: Number(e.target.value) || 0 })}
            className="w-full border border-gray-300 rounded p-1 text-xs text-right bg-white" />
        </td>
      </tr>
    );
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-indigo-800 mb-3">生命保険料控除</div>

      {/* 一般の生命保険料 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-gray-600 mb-1">一般の生命保険料</div>
        <table className="w-full">
          <thead><tr className="text-[10px] text-gray-400">
            <th className="text-left w-20"></th>
            <th className="text-right px-1">証明額（円）</th>
            <th className="text-right px-1">申告額（円）</th>
          </tr></thead>
          <tbody>
            <AmountRow label="新制度" row={ippanNew} setRow={setIppanNew} color="text-indigo-700" />
            <AmountRow label="旧制度" row={ippanOld} setRow={setIppanOld} color="text-gray-600" />
          </tbody>
        </table>
      </div>

      {/* 介護医療保険料 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-gray-600 mb-1">介護医療保険料（新制度のみ）</div>
        <table className="w-full">
          <thead><tr className="text-[10px] text-gray-400">
            <th className="text-left w-20"></th>
            <th className="text-right px-1">証明額（円）</th>
            <th className="text-right px-1">申告額（円）</th>
          </tr></thead>
          <tbody>
            <AmountRow label="新制度" row={kaigoNew} setRow={setKaigoNew} color="text-indigo-700" />
          </tbody>
        </table>
      </div>

      {/* 個人年金保険料 */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold text-gray-600 mb-1">個人年金保険料</div>
        <table className="w-full">
          <thead><tr className="text-[10px] text-gray-400">
            <th className="text-left w-20"></th>
            <th className="text-right px-1">証明額（円）</th>
            <th className="text-right px-1">申告額（円）</th>
          </tr></thead>
          <tbody>
            <AmountRow label="新制度" row={nenkinNew} setRow={setNenkinNew} color="text-indigo-700" />
            <AmountRow label="旧制度" row={nenkinOld} setRow={setNenkinOld} color="text-gray-600" />
          </tbody>
        </table>
      </div>

      {/* 控除額計算結果 */}
      <div className="border-t border-indigo-200 pt-2 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-gray-600">一般の生命保険料控除額</span><span className="font-medium">{fmt(deductions.ippan)}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">介護医療保険料控除額</span><span className="font-medium">{fmt(deductions.kaigo)}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">個人年金保険料控除額</span><span className="font-medium">{fmt(deductions.nenkin)}</span></div>
        <div className="flex justify-between border-t border-indigo-300 pt-1">
          <span className="font-semibold text-indigo-800">生命保険料控除 合計</span>
          <span className="font-bold text-indigo-900">{fmt(deductions.total)}<span className="text-[10px] text-gray-500 ml-1">（上限12万円）</span></span>
        </div>
      </div>
    </div>
  );
}
