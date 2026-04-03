import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import CompoundJournalTable from '@/web/shared/components/journal/CompoundJournalTable';
import { useReview } from '../context/ReviewContext';
import { getDocTypeConfig } from '../doc-types/registry';
import MultiEntrySiblingTabs from '../sections/MultiEntrySiblingTabs';
import OcrSummaryBadges from '../sections/OcrSummaryBadges';
import RuleCandidatesBar from '../sections/RuleCandidatesBar';
import OcrReferenceBox from '../sections/OcrReferenceBox';
import SupplierField from '../sections/SupplierField';
import NavigationBar from '../sections/NavigationBar';
import ExcludeButton from '../sections/ExcludeButton';
import SaveStatusBar from '../sections/SaveStatusBar';
import DocSpecificSections from '../sections/doc-specific';

export default function CompoundEntryLayout() {
  const { ci, form, setForm, zoom, setZoom, rotation, setRotation, compoundLines, setCompoundLines, accountItems, taxCategories } = useReview();
  if (!ci) return null;

  const config = getDocTypeConfig(ci.docClassification?.document_type_code);

  return (
    <div className="grid grid-cols-2 gap-4" style={{ animation: 'fadeSlideUp .3s ease' }}>
      <ImageViewer
        fileName={ci.fileName}
        imageUrl={ci.imageUrl}
        zoom={zoom}
        setZoom={setZoom}
        rotation={rotation}
        setRotation={setRotation}
      />
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
        <MultiEntrySiblingTabs />
        <OcrSummaryBadges />
        <RuleCandidatesBar />
        <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
          <OcrReferenceBox />
          <DocSpecificSections extraSections={config.extraSections} />
          <SupplierField />

          {/* Date / Description */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border-[1.5px] border-blue-200 rounded-lg p-3">
              <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />取引日</label>
              <input type="date" value={form.entryDate || ''} onChange={e => setForm(p => ({ ...p, entryDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">摘要</label>
              <input type="text" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="摘要を入力" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Compound Journal Table */}
          <CompoundJournalTable
            lines={compoundLines}
            onChange={setCompoundLines}
            accountItems={accountItems}
            taxCategories={taxCategories}
          />

          <NavigationBar />
          <ExcludeButton />
          <SaveStatusBar />
        </div>
      </div>
    </div>
  );
}
