/**
 * @module レイアウトディスパッチャー
 */
import { useReview } from '../context/ReviewContext';
import { getDocTypeConfig } from '../doc-types/registry';
import SingleEntryLayout from './SingleEntryLayout';
import StatementLayout from './StatementLayout';
import CompoundEntryLayout from './CompoundEntryLayout';
import MetadataLayout from './MetadataLayout';
import ArchiveLayout from './ArchiveLayout';

const LAYOUT_MAP = {
  single: SingleEntryLayout,
  statement: StatementLayout,
  compound: CompoundEntryLayout,
  metadata: MetadataLayout,
  archive: ArchiveLayout,
} as const;

export default function LayoutDispatcher() {
  const { ci } = useReview();
  if (!ci) return null;

  const docTypeCode = ci.docClassification?.document_type_code ?? null;
  const config = getDocTypeConfig(docTypeCode);
  const LayoutComponent = LAYOUT_MAP[config.layout];

  return <LayoutComponent />;
}
