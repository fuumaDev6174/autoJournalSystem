/**
 * @module 所得控除レイアウト
 * SingleEntryLayout ベースだが CoreFieldsGrid / BusinessRatioPanel / RuleCandidatesBar を非表示。
 * 金額ラベル→「証明額合計」、日付ラベル→「証明書発行日」に変更。
 */
import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import { useReview } from '../context/ReviewContext';
import { getDocTypeConfig } from '../doc-types/registry';
import OcrSummaryBadges from '../sections/OcrSummaryBadges';
import OcrReferenceBox from '../sections/OcrReferenceBox';
import SupplierField from '../sections/SupplierField';
import NavigationBar from '../sections/NavigationBar';
import ExcludeButton from '../sections/ExcludeButton';
import SaveStatusBar from '../sections/SaveStatusBar';
import DocSpecificSections from '../sections/doc-specific';

export default function DeductionLayout() {
  const { ci, form, setForm, zoom, setZoom, rotation, setRotation, fmt } = useReview();
  if (!ci) return null;

  const config = getDocTypeConfig(ci.docClassification?.document_type_code);
  const formAny = form as Record<string, unknown>;

  return (
    <div className="grid grid-cols-2 gap-4 animate-fadeSlideUp">
      <ImageViewer
        fileName={ci.fileName}
        imageUrl={ci.imageUrl}
        zoom={zoom}
        setZoom={setZoom}
        rotation={rotation}
        setRotation={setRotation}
      />
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-h-[480px]">
        <OcrSummaryBadges />
        <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
          <OcrReferenceBox />
          <DocSpecificSections extraSections={config.extraSections} />
          <SupplierField />

          {/* 証明書発行日 + 証明額合計（CoreFieldsGrid の代わり） */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">証明書発行日</label>
              <input
                type="date"
                value={(formAny.entry_date as string) || ''}
                onChange={e => setForm(prev => ({ ...prev, entry_date: e.target.value }))}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">証明額合計（円）</label>
              <input
                type="text"
                inputMode="numeric"
                value={formAny.amount != null ? String(formAny.amount) : ''}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setForm(prev => ({ ...prev, amount: v ? Number(v) : undefined }));
                }}
                className="input text-sm text-right tabular-nums"
                placeholder="0"
              />
              {formAny.amount != null && (
                <p className="text-[10px] text-gray-400 mt-0.5 text-right">{fmt(formAny.amount as number)}</p>
              )}
            </div>
          </div>

          <NavigationBar />
          <ExcludeButton />
          <SaveStatusBar />
        </div>
      </div>
    </div>
  );
}
