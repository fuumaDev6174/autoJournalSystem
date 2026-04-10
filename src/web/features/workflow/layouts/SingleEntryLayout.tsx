/**
 * @module 単一仕訳レイアウト
 */
import ImageViewer from '@/web/features/workflow/components/ImageViewer';
import { useReview } from '../context/ReviewContext';
import { getDocTypeConfig } from '../doc-types/registry';
import MultiEntrySiblingTabs from '../sections/MultiEntrySiblingTabs';
import OcrSummaryBadges from '../sections/OcrSummaryBadges';
import RuleCandidatesBar from '../sections/RuleCandidatesBar';
import OcrReferenceBox from '../sections/OcrReferenceBox';
import SupplierField from '../sections/SupplierField';
import CoreFieldsGrid from '../sections/CoreFieldsGrid';
import BusinessRatioPanel from '../sections/BusinessRatioPanel';
import BusinessToggleRow from '../sections/BusinessToggleRow';
import NavigationBar from '../sections/NavigationBar';
import ExcludeButton from '../sections/ExcludeButton';
import SaveStatusBar from '../sections/SaveStatusBar';
import DocSpecificSections from '../sections/doc-specific';

export default function SingleEntryLayout() {
  const { ci, zoom, setZoom, rotation, setRotation } = useReview();
  if (!ci) return null;

  const config = getDocTypeConfig(ci.docClassification?.document_type_code);

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
        <MultiEntrySiblingTabs />
        <OcrSummaryBadges />
        <RuleCandidatesBar />
        <div className="flex-1 p-4 flex flex-col gap-3.5 overflow-y-auto">
          <OcrReferenceBox />
          <DocSpecificSections extraSections={config.extraSections} />
          <SupplierField />
          <CoreFieldsGrid />
          <BusinessRatioPanel />
          <BusinessToggleRow />
          <NavigationBar />
          <ExcludeButton />
          <SaveStatusBar />
        </div>
      </div>
    </div>
  );
}
