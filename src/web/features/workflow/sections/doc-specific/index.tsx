// 書類別パネルの遅延読み込みとセクションキーへのマッピング

import { lazy, Suspense } from 'react';

const ReceiptItemList = lazy(() => import('./ReceiptItemList'));
const InvoicePanel = lazy(() => import('./InvoicePanel'));
const WithholdingPanel = lazy(() => import('./WithholdingPanel'));
const TransferFeePanel = lazy(() => import('./TransferFeePanel'));
const PaymentMethodSelector = lazy(() => import('./PaymentMethodSelector'));
const PayrollSummaryPanel = lazy(() => import('./PayrollSummaryPanel'));
const SalesBreakdownPanel = lazy(() => import('./SalesBreakdownPanel'));
const DeductionCalcPanel = lazy(() => import('./DeductionCalcPanel'));
const IncomeCalcPanel = lazy(() => import('./IncomeCalcPanel'));
const ReconciliationPanel = lazy(() => import('./ReconciliationPanel'));
const MetadataFieldsPanel = lazy(() => import('./MetadataFieldsPanel'));
const HousingLoanCalcPanel = lazy(() => import('./HousingLoanCalcPanel'));
const LifeInsCalcPanel = lazy(() => import('./LifeInsCalcPanel'));
const MedicalCalcPanel = lazy(() => import('./MedicalCalcPanel'));
const FurusatoCalcPanel = lazy(() => import('./FurusatoCalcPanel'));
const InventoryCalcPanel = lazy(() => import('./InventoryCalcPanel'));
const DepreciationPanel = lazy(() => import('./DepreciationPanel'));
const CarryoverPanel = lazy(() => import('./CarryoverPanel'));

const SECTION_MAP: Record<string, React.LazyExoticComponent<() => React.ReactElement | null>> = {
  receipt_items: ReceiptItemList,
  invoice_panel: InvoicePanel,
  withholding: WithholdingPanel,
  transfer_fee: TransferFeePanel,
  payment_method: PaymentMethodSelector,
  payroll_summary: PayrollSummaryPanel,
  sales_breakdown: SalesBreakdownPanel,
  deduction_calc: DeductionCalcPanel,
  income_calc: IncomeCalcPanel,
  reconciliation: ReconciliationPanel,
  metadata_fields: MetadataFieldsPanel,
  housing_loan_calc: HousingLoanCalcPanel,
  life_ins_calc: LifeInsCalcPanel,
  medical_calc: MedicalCalcPanel,
  furusato_calc: FurusatoCalcPanel,
  inventory_calc: InventoryCalcPanel,
  depreciation: DepreciationPanel,
  carryover: CarryoverPanel,
};

interface DocSpecificSectionsProps {
  extraSections?: string[];
}

export default function DocSpecificSections({ extraSections }: DocSpecificSectionsProps) {
  if (!extraSections?.length) return null;
  return (
    <Suspense fallback={null}>
      {extraSections.map(key => {
        const Component = SECTION_MAP[key];
        if (!Component) return null;
        return <Component key={key} />;
      })}
    </Suspense>
  );
}
