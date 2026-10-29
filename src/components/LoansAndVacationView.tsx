import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Plane,
  Plus,
  Printer,
  RefreshCw,
  Scale,
  Trash2,
} from 'lucide-react';
import type {
  AccrualDayBasis,
  AccrualCalculationMethod,
  EmployeeLoanRecord,
  LeaveRecord,
  LeaveType,
  LoanRepaymentRecord,
  LoanStatus,
  LoanType,
  UserPrivateDatabaseSlice,
  VacationAccrualPeriod,
  VacationPayBasis,
  VacationPayCalculationRecord,
  VacationPayDivisorMethod,
  VacationPlanRecord,
  VacationPlanStatus,
  VacationYearViewMode,
} from '../types/payroll.ts';
import type { CollectionName } from '../storage/db.ts';
import {
  calculateAnnualLeaveAccrual,
  calculateLeaveBalances,
  calculateLoanPortfolioSummary,
  calculateVacationPay,
  countInclusiveDays,
  detectVacationOverlap,
  generateYearByYearVacationTable,
  getEffectiveSalaryVersion,
  validateLoanRepaymentCandidate,
} from '../engine/calculations.ts';
import {
  DateInputWithToday,
  formatDisplayDate,
  getLocalCurrentMonthISO,
  getLocalTodayISO,
  MonthInputWithToday,
  NumericInput,
} from './FormInputs.tsx';
import {
  exportLoanPortfolioExcelAndCSV,
  exportLoanPortfolioPDF,
  exportVacationAndAccrualPDF,
  exportVacationExcelAndCSV,
} from '../utils/exportUtils.ts';
import { EmptyStateIllustration } from './Illustrations.tsx';

interface Props {
  activeTab: 'loans' | 'leave';
  slice: UserPrivateDatabaseSlice;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  onSaveRecord: <T extends { id: string; userId: string }>(
    collection: CollectionName,
    record: Omit<T, 'id' | 'userId'> & { id?: string; userId?: string },
  ) => Promise<T>;
  onDeleteRecord: (collection: CollectionName, id: string) => Promise<void>;
  notify: (msg: string, type?: 'success' | 'warning') => void;
}

export const LoansAndVacationView: React.FC<Props> = ({
  activeTab,
  slice,
  selectedMonth,
  setSelectedMonth,
  onSaveRecord,
  onDeleteRecord,
  notify,
}) => {
  const currentEmployment = useMemo(
    () => slice.employments.find((e) => e.isCurrent) || slice.employments[0],
    [slice.employments],
  );

  const effectiveSalary = useMemo(
    () =>
      getEffectiveSalaryVersion(
        slice.salaryVersions,
        currentEmployment?.id || '',
        `${selectedMonth}-15`,
      ),
    [slice.salaryVersions, currentEmployment, selectedMonth],
  );

  // ============================================================================
  // 1. LOAN MANAGEMENT STATE & HANDLERS
  // ============================================================================
  const loans = useMemo(() => slice.loans || [], [slice.loans]);
  const loanRepayments = useMemo(() => slice.loanRepayments || [], [slice.loanRepayments]);

  const loanPortfolio = useMemo(
    () => calculateLoanPortfolioSummary(loans, loanRepayments, selectedMonth),
    [loans, loanRepayments, selectedMonth],
  );

  const [loanForm, setLoanForm] = useState<{
    id?: string;
    loanCode: string;
    loanName: string;
    loanType: LoanType;
    issueDate: string;
    originalAmount: number | undefined;
    currency: string;
    monthlyDeductionAmount: number | undefined;
    firstDeductionMonth: string;
    expectedFinalDeductionMonth: string;
    status: LoanStatus;
    notes: string;
    supportingDocumentName: string;
  }>({
    loanCode: `LN-${new Date().getFullYear()}-${String((slice.loans?.length || 0) + 1).padStart(2, '0')}`,
    loanName: '',
    loanType: 'company_loan',
    issueDate: getLocalTodayISO(),
    originalAmount: 3000,
    currency: slice.profile.preferredCurrency || 'SAR',
    monthlyDeductionAmount: 500,
    firstDeductionMonth: selectedMonth || getLocalCurrentMonthISO(),
    expectedFinalDeductionMonth: '2026-09',
    status: 'active',
    notes: '',
    supportingDocumentName: '',
  });
  const [loanFormError, setLoanFormError] = useState<string>('');
  const [isSavingLoan, setIsSavingLoan] = useState(false);

  const [repaymentForm, setRepaymentForm] = useState<{
    id?: string;
    loanId: string;
    deductionDate: string;
    salaryMonth: string;
    scheduledDeduction: number | undefined;
    actualDeduction: number | undefined;
    amountAppliedToPrincipal: number | undefined;
    payslipReference: string;
    notes: string;
    allowDuplicateMonth: boolean;
    allowNegativeBalance: boolean;
  }>({
    loanId: loans[0]?.id || '',
    deductionDate: getLocalTodayISO(),
    salaryMonth: selectedMonth || getLocalCurrentMonthISO(),
    scheduledDeduction: loans[0]?.monthlyDeductionAmount ?? 750,
    actualDeduction: loans[0]?.monthlyDeductionAmount ?? 750,
    amountAppliedToPrincipal: loans[0]?.monthlyDeductionAmount ?? 750,
    payslipReference: '',
    notes: '',
    allowDuplicateMonth: false,
    allowNegativeBalance: false,
  });
  const [repaymentError, setRepaymentError] = useState<string>('');
  const [isSavingRepayment, setIsSavingRepayment] = useState(false);

  const selectedRepaymentLoan = useMemo(
    () => loans.find((l) => l.id === (repaymentForm.loanId || loans[0]?.id)) || loans[0],
    [loans, repaymentForm.loanId],
  );

  const repaymentValidation = useMemo(() => {
    if (!selectedRepaymentLoan) return null;
    const relevantRepayments = repaymentForm.id
      ? loanRepayments.filter((r) => r.id !== repaymentForm.id)
      : loanRepayments;
    return validateLoanRepaymentCandidate({
      loan: selectedRepaymentLoan,
      existingRepayments: relevantRepayments,
      salaryMonth: repaymentForm.salaryMonth,
      amountAppliedToPrincipal: repaymentForm.amountAppliedToPrincipal ?? 0,
      allowDuplicateMonth: repaymentForm.allowDuplicateMonth,
      allowNegativeBalance: repaymentForm.allowNegativeBalance,
    });
  }, [
    selectedRepaymentLoan,
    loanRepayments,
    repaymentForm.id,
    repaymentForm.salaryMonth,
    repaymentForm.amountAppliedToPrincipal,
    repaymentForm.allowDuplicateMonth,
    repaymentForm.allowNegativeBalance,
  ]);

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanFormError('');
    if (!loanForm.loanCode.trim() || !loanForm.loanName.trim()) {
      setLoanFormError('Loan ID and Loan Name / Description are required.');
      return;
    }
    if (loanForm.originalAmount === undefined || loanForm.originalAmount <= 0) {
      setLoanFormError('Please enter a valid Original Loan Amount greater than 0.');
      return;
    }
    if (loanForm.monthlyDeductionAmount === undefined || loanForm.monthlyDeductionAmount < 0) {
      setLoanFormError('Please enter a valid Monthly Deduction Amount.');
      return;
    }
    setIsSavingLoan(true);
    try {
      const now = new Date().toISOString();
      const isEditing = Boolean(loanForm.id);
      const saved = await onSaveRecord<EmployeeLoanRecord>('loans', {
        id: loanForm.id,
        employmentId: currentEmployment?.id || 'emp-rahim-curr',
        loanCode: loanForm.loanCode.trim(),
        loanName: loanForm.loanName.trim(),
        loanType: loanForm.loanType,
        issueDate: loanForm.issueDate,
        originalAmount: loanForm.originalAmount,
        currency: loanForm.currency || 'SAR',
        monthlyDeductionAmount: loanForm.monthlyDeductionAmount,
        firstDeductionMonth: loanForm.firstDeductionMonth,
        expectedFinalDeductionMonth: loanForm.expectedFinalDeductionMonth,
        status: loanForm.status,
        notes: loanForm.notes,
        supportingDocumentName: loanForm.supportingDocumentName || undefined,
        createdAt: now,
        updatedAt: now,
      });
      setLoanForm({
        loanCode: `LN-${new Date().getFullYear()}-${String(loans.length + (isEditing ? 1 : 2)).padStart(2, '0')}`,
        loanName: '',
        loanType: 'company_loan',
        issueDate: getLocalTodayISO(),
        originalAmount: 3000,
        currency: slice.profile.preferredCurrency || 'SAR',
        monthlyDeductionAmount: 500,
        firstDeductionMonth: selectedMonth,
        expectedFinalDeductionMonth: '2026-10',
        status: 'active',
        notes: '',
        supportingDocumentName: '',
      });
      if (!isEditing) {
        setRepaymentForm((prev) => ({
          ...prev,
          id: undefined,
          loanId: saved.id,
          scheduledDeduction: saved.monthlyDeductionAmount,
          actualDeduction: saved.monthlyDeductionAmount,
          amountAppliedToPrincipal: saved.monthlyDeductionAmount,
        }));
      }
      notify(
        isEditing
          ? `Updated loan "${saved.loanName}" (${saved.loanCode}).`
          : `Loan "${saved.loanName}" (${saved.loanCode}) saved to private ledger.`,
        'success',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save loan record.';
      setLoanFormError(msg);
      notify(msg, 'warning');
    } finally {
      setIsSavingLoan(false);
    }
  };

  const handleSaveRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepaymentError('');
    if (!selectedRepaymentLoan) {
      setRepaymentError('Please register or select a loan first.');
      return;
    }
    if (
      repaymentForm.actualDeduction === undefined ||
      repaymentForm.amountAppliedToPrincipal === undefined ||
      repaymentForm.amountAppliedToPrincipal < 0
    ) {
      setRepaymentError('Actual deduction and principal applied amounts are required.');
      return;
    }
    if (!repaymentValidation) return;
    if (!repaymentValidation.canSave) {
      setRepaymentError(
        repaymentValidation.duplicateMonthWarning ||
          repaymentValidation.negativeBalanceWarning ||
          'Please confirm warnings before saving.',
      );
      return;
    }

    setIsSavingRepayment(true);
    try {
      const isEditing = Boolean(repaymentForm.id);
      await onSaveRecord<LoanRepaymentRecord>('loanRepayments', {
        id: repaymentForm.id,
        loanId: selectedRepaymentLoan.id,
        deductionDate: repaymentForm.deductionDate,
        salaryMonth: repaymentForm.salaryMonth,
        scheduledDeduction:
          repaymentForm.scheduledDeduction ?? selectedRepaymentLoan.monthlyDeductionAmount,
        actualDeduction: repaymentForm.actualDeduction,
        amountAppliedToPrincipal: repaymentForm.amountAppliedToPrincipal,
        remainingBalanceAfter: repaymentValidation.projectedRemainingBalance,
        payslipReference: repaymentForm.payslipReference || undefined,
        notes: repaymentForm.notes || undefined,
        confirmedDuplicateMonth: repaymentForm.allowDuplicateMonth || undefined,
        confirmedNegativeBalance: repaymentForm.allowNegativeBalance || undefined,
        createdAt: new Date().toISOString(),
      });

      // If remaining balance reached 0, optionally mark loan completed
      if (
        repaymentValidation.projectedRemainingBalance === 0 &&
        selectedRepaymentLoan.status === 'active'
      ) {
        await onSaveRecord<EmployeeLoanRecord>('loans', {
          ...selectedRepaymentLoan,
          status: 'completed',
          updatedAt: new Date().toISOString(),
        });
      }

      setRepaymentForm((prev) => ({
        ...prev,
        id: undefined,
        payslipReference: '',
        notes: '',
        allowDuplicateMonth: false,
        allowNegativeBalance: false,
      }));
      notify(
        isEditing
          ? `Updated repayment for ${selectedRepaymentLoan.loanCode} (${repaymentForm.salaryMonth}).`
          : `Recorded SAR ${repaymentForm.amountAppliedToPrincipal.toFixed(2)} repayment for ${selectedRepaymentLoan.loanCode} (${repaymentForm.salaryMonth}).`,
        'success',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save loan repayment.';
      setRepaymentError(msg);
      notify(msg, 'warning');
    } finally {
      setIsSavingRepayment(false);
    }
  };

  // ============================================================================
  // 2. VACATION & ANNUAL LEAVE MANAGEMENT STATE & HANDLERS
  // ============================================================================
  const [vacationSubTab, setVacationSubTab] = useState<
    'accrual' | 'planner' | 'log' | 'yearly' | 'pay_calc'
  >('accrual');

  const activeAccrualPeriod = useMemo(
    () =>
      (slice.vacationAccrualPeriods || []).find(
        (p) => p.employmentId === currentEmployment?.id && (p.isActive || p.isCurrentPeriod),
      ) || (slice.vacationAccrualPeriods || [])[0],
    [slice.vacationAccrualPeriods, currentEmployment],
  );

  const [accrualConfig, setAccrualConfig] = useState<{
    id?: string;
    periodLabel: string;
    accrualStartDate: string;
    targetCalculationDate: string;
    annualEntitlementDays: number | undefined;
    accrualMethod: AccrualCalculationMethod;
    dayBasis: AccrualDayBasis;
    openingCarryForwardDays: number | undefined;
    leaveTakenInPeriodDays: number | undefined;
    manualAdjustmentDays: number | undefined;
    manualAdjustmentReason: string;
    isPostVacationReset: boolean;
    returnedFromVacationDate: string;
  }>({
    id: activeAccrualPeriod?.id,
    periodLabel:
      activeAccrualPeriod?.periodLabel || 'Post-Vacation Return Reset (1 Sep 2026 Policy)',
    accrualStartDate:
      activeAccrualPeriod?.accrualStartDate ||
      activeAccrualPeriod?.newAccrualStartDate ||
      '2026-09-01',
    targetCalculationDate: '2026-12-31',
    annualEntitlementDays:
      activeAccrualPeriod?.annualEntitlementDays ??
      currentEmployment?.annualLeaveEntitlementDays ??
      21,
    accrualMethod: activeAccrualPeriod?.accrualMethod || 'daily',
    dayBasis: activeAccrualPeriod?.dayBasis || activeAccrualPeriod?.yearDayBasis || '365_fixed',
    openingCarryForwardDays:
      activeAccrualPeriod?.openingCarryForwardDays ??
      activeAccrualPeriod?.openingCarryoverDays ??
      5,
    leaveTakenInPeriodDays: activeAccrualPeriod?.leaveTakenInPeriodDays ?? 0,
    manualAdjustmentDays: activeAccrualPeriod?.manualAdjustmentDays ?? 0,
    manualAdjustmentReason:
      activeAccrualPeriod?.manualAdjustmentReason ||
      'Prior unused balance carried forward separately',
    isPostVacationReset:
      activeAccrualPeriod?.isPostVacationReset ??
      activeAccrualPeriod?.useReturnDateResetRule ??
      true,
    returnedFromVacationDate:
      activeAccrualPeriod?.returnedFromVacationDate ||
      activeAccrualPeriod?.lastVacationReturnDate ||
      '2026-09-01',
  });

  // Automatically calculate taken leave inside the active accrual window from shared LeaveRecord ledger
  const recordedLeaveTakenInAccrualWindow = useMemo(() => {
    return slice.leaves
      .filter(
        (lv) =>
          lv.employmentId === currentEmployment?.id &&
          lv.leaveType === 'annual_leave' &&
          (lv.approvalStatus === 'approved' || lv.approvalStatus === 'completed') &&
          lv.startDate >= accrualConfig.accrualStartDate &&
          lv.startDate <= accrualConfig.targetCalculationDate,
      )
      .reduce((acc, lv) => acc + lv.totalDays, 0);
  }, [slice.leaves, currentEmployment, accrualConfig.accrualStartDate, accrualConfig.targetCalculationDate]);

  const effectiveLeaveTakenForAccrual =
    accrualConfig.leaveTakenInPeriodDays !== undefined && accrualConfig.leaveTakenInPeriodDays > 0
      ? accrualConfig.leaveTakenInPeriodDays
      : recordedLeaveTakenInAccrualWindow;

  const liveAccrualResult = useMemo(
    () =>
      calculateAnnualLeaveAccrual({
        accrualStartDate: accrualConfig.accrualStartDate,
        targetCalculationDate: accrualConfig.targetCalculationDate,
        annualEntitlementDays: accrualConfig.annualEntitlementDays ?? 21,
        accrualMethod: accrualConfig.accrualMethod,
        dayBasis: accrualConfig.dayBasis,
        carriedForwardDays: accrualConfig.openingCarryForwardDays ?? 0,
        leaveTakenInPeriod: effectiveLeaveTakenForAccrual,
        manualAdjustmentDays: accrualConfig.manualAdjustmentDays ?? 0,
        joiningDate: currentEmployment?.joiningDate,
        isPostVacationReset: accrualConfig.isPostVacationReset,
      }),
    [accrualConfig, effectiveLeaveTakenForAccrual, currentEmployment],
  );

  // Year-end accrual projection (31 Dec of current year)
  const currentYearEndStr = `${new Date().getFullYear()}-12-31`;
  const yearEndAccrualResult = useMemo(
    () =>
      calculateAnnualLeaveAccrual({
        accrualStartDate: accrualConfig.accrualStartDate,
        targetCalculationDate:
          accrualConfig.accrualStartDate > currentYearEndStr
            ? accrualConfig.targetCalculationDate
            : currentYearEndStr,
        annualEntitlementDays: accrualConfig.annualEntitlementDays ?? 21,
        accrualMethod: accrualConfig.accrualMethod,
        dayBasis: accrualConfig.dayBasis,
        carriedForwardDays: accrualConfig.openingCarryForwardDays ?? 0,
        leaveTakenInPeriod: effectiveLeaveTakenForAccrual,
        manualAdjustmentDays: accrualConfig.manualAdjustmentDays ?? 0,
        joiningDate: currentEmployment?.joiningDate,
        isPostVacationReset: accrualConfig.isPostVacationReset,
      }),
    [accrualConfig, currentYearEndStr, effectiveLeaveTakenForAccrual, currentEmployment],
  );

  // Career Leave Balances & Sick Leave Tiers
  const careerLeaveBalances = useMemo(() => {
    if (!currentEmployment) return null;
    return calculateLeaveBalances(
      currentEmployment,
      slice.leaves.filter((l) => l.employmentId === currentEmployment.id),
      getLocalTodayISO(),
    );
  }, [currentEmployment, slice.leaves]);

  // Approved Future Leave & Pending Leave Requests
  const approvedFutureLeaveDays = useMemo(() => {
    const today = getLocalTodayISO();
    const fromPlans = (slice.vacationPlans || [])
      .filter(
        (p) =>
          p.employmentId === currentEmployment?.id &&
          p.approvalStatus === 'approved' &&
          p.plannedDepartureDate >= today,
      )
      .reduce((s, p) => s + p.plannedVacationDays, 0);
    const fromLeaves = slice.leaves
      .filter(
        (l) =>
          l.employmentId === currentEmployment?.id &&
          l.leaveType === 'annual_leave' &&
          l.approvalStatus === 'approved' &&
          l.startDate > today,
      )
      .reduce((s, l) => s + l.totalDays, 0);
    return Math.round((fromPlans + fromLeaves) * 100) / 100;
  }, [slice.vacationPlans, slice.leaves, currentEmployment]);

  const pendingLeaveRequestDays = useMemo(() => {
    const fromPlans = (slice.vacationPlans || [])
      .filter(
        (p) =>
          p.employmentId === currentEmployment?.id &&
          (p.approvalStatus === 'planned' || p.approvalStatus === 'draft'),
      )
      .reduce((s, p) => s + p.plannedVacationDays, 0);
    const fromLeaves = slice.leaves
      .filter((l) => l.employmentId === currentEmployment?.id && l.approvalStatus === 'pending')
      .reduce((s, l) => s + l.totalDays, 0);
    return Math.round((fromPlans + fromLeaves) * 100) / 100;
  }, [slice.vacationPlans, slice.leaves, currentEmployment]);

  // Next accrual anniversary
  const nextAccrualAnniversary = useMemo(() => {
    const baseDate = accrualConfig.accrualStartDate || currentEmployment?.joiningDate || '2026-03-01';
    const parts = baseDate.split('-').map(Number);
    const nowYear = new Date().getFullYear();
    const candidate = `${nowYear}-${String(parts[1] || 3).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}`;
    if (candidate >= getLocalTodayISO()) return candidate;
    return `${nowYear + 1}-${String(parts[1] || 3).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}`;
  }, [accrualConfig.accrualStartDate, currentEmployment]);

  // Year-by-year vacation balance table
  const [yearTableMode, setYearTableMode] = useState<VacationYearViewMode>('calendar_year');
  const yearlyVacationRows = useMemo(() => {
    if (!currentEmployment) return [];
    return generateYearByYearVacationTable({
      joiningDate: currentEmployment.joiningDate,
      asOfDate: accrualConfig.targetCalculationDate || getLocalTodayISO(),
      annualEntitlementDays:
        accrualConfig.annualEntitlementDays ?? currentEmployment.annualLeaveEntitlementDays,
      leaves: slice.leaves.filter((l) => l.employmentId === currentEmployment.id),
      accrualPeriods: (slice.vacationAccrualPeriods || []).filter(
        (p) => p.employmentId === currentEmployment.id,
      ),
      viewMode: yearTableMode,
      dayBasis: accrualConfig.dayBasis,
    });
  }, [
    currentEmployment,
    accrualConfig.targetCalculationDate,
    accrualConfig.annualEntitlementDays,
    accrualConfig.dayBasis,
    slice.leaves,
    slice.vacationAccrualPeriods,
    yearTableMode,
  ]);

  // Vacation Plan Form
  const [planForm, setPlanForm] = useState<{
    id?: string;
    title: string;
    plannedDepartureDate: string;
    plannedReturnDate: string;
    plannedVacationDays: number | undefined;
    vacationType: LeaveType;
    expectedVacationPay: number | undefined;
    travelTicketBudget: number | undefined;
    approvalStatus: VacationPlanStatus;
    notes: string;
    attachmentName: string;
  }>({
    title: 'Annual Family Vacation',
    plannedDepartureDate: '2026-12-01',
    plannedReturnDate: '2026-12-15',
    plannedVacationDays: 15,
    vacationType: 'annual_leave',
    expectedVacationPay: 3500,
    travelTicketBudget: 2000,
    approvalStatus: 'planned',
    notes: '',
    attachmentName: '',
  });
  const [planError, setPlanError] = useState<string>('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const planOverlapCheck = useMemo(
    () =>
      detectVacationOverlap({
        startDate: planForm.plannedDepartureDate,
        endDate: planForm.plannedReturnDate,
        existingLeaves: slice.leaves.filter((l) => l.employmentId === currentEmployment?.id),
        existingPlans: (slice.vacationPlans || []).filter(
          (p) => p.employmentId === currentEmployment?.id,
        ),
        excludeId: planForm.id,
      }),
    [planForm.plannedDepartureDate, planForm.plannedReturnDate, planForm.id, slice.leaves, slice.vacationPlans, currentEmployment],
  );

  // Vacation Log (shared LeaveRecord) Form
  const [logForm, setLogForm] = useState<{
    id?: string;
    startDate: string;
    endDate: string;
    actualReturnDate: string;
    returnToWorkConfirmed: boolean;
    leaveType: LeaveType;
    totalDays: number | undefined;
    paidLeaveDays: number | undefined;
    unpaidLeaveDays: number | undefined;
    approvalStatus: LeaveRecord['approvalStatus'];
    vacationPayReceived: number | undefined;
    ticketAllowanceReceived: number | undefined;
    medicalCertificateRef: string;
    reason: string;
  }>({
    startDate: getLocalTodayISO(),
    endDate: getLocalTodayISO(),
    actualReturnDate: '',
    returnToWorkConfirmed: false,
    leaveType: 'annual_leave',
    totalDays: 1,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    approvalStatus: 'approved',
    vacationPayReceived: undefined,
    ticketAllowanceReceived: undefined,
    medicalCertificateRef: '',
    reason: '',
  });
  const [logError, setLogError] = useState<string>('');
  const [isSavingLog, setIsSavingLog] = useState(false);

  const [accrualError, setAccrualError] = useState<string>('');
  const [isSavingAccrual, setIsSavingAccrual] = useState(false);

  // Vacation Pay Calculator State
  const [payCalcForm, setPayCalcForm] = useState<{
    id?: string;
    title: string;
    expectedDepartureDate: string;
    expectedPaymentDate: string;
    basicSalary: number | undefined;
    housingAllowance: number | undefined;
    otherEligibleAllowances: number | undefined;
    leavePayBasis: VacationPayBasis;
    payableVacationDays: number | undefined;
    divisorMethod: VacationPayDivisorMethod;
    actualVacationPayReceived: number | undefined;
    notes: string;
  }>({
    title: 'Annual Leave Salary Calculation',
    expectedDepartureDate: '2026-08-01',
    expectedPaymentDate: '2026-07-28',
    basicSalary: effectiveSalary?.basicSalary ?? 4600,
    housingAllowance: effectiveSalary?.housingAllowance ?? 1150,
    otherEligibleAllowances:
      (effectiveSalary?.foodAllowance ?? 350) +
      (effectiveSalary?.transportAllowance ?? 500) +
      (effectiveSalary?.otherFixedAllowances ?? 400),
    leavePayBasis: 'actual_wage',
    payableVacationDays: 21,
    divisorMethod: '30_day_month',
    actualVacationPayReceived: undefined,
    notes: '',
  });
  const [payCalcError, setPayCalcError] = useState<string>('');
  const [isSavingPayCalc, setIsSavingPayCalc] = useState(false);

  const liveVacationPayResult = useMemo(
    () =>
      calculateVacationPay({
        basicSalary: payCalcForm.basicSalary ?? 0,
        housingAllowance: payCalcForm.housingAllowance ?? 0,
        otherEligibleAllowances: payCalcForm.otherEligibleAllowances ?? 0,
        leavePayBasis: payCalcForm.leavePayBasis,
        payableVacationDays: payCalcForm.payableVacationDays ?? 0,
        divisorMethod: payCalcForm.divisorMethod,
        actualVacationPayReceived: payCalcForm.actualVacationPayReceived,
        referenceMonth: payCalcForm.expectedDepartureDate.slice(0, 7),
      }),
    [payCalcForm],
  );

  const handleSaveAccrualPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccrualError('');
    if (!accrualConfig.accrualStartDate || !accrualConfig.targetCalculationDate) {
      setAccrualError('Accrual Start Date and Target Calculation Date are required.');
      return;
    }
    if ((accrualConfig.annualEntitlementDays ?? 0) <= 0) {
      setAccrualError('Annual leave entitlement days must be greater than 0.');
      return;
    }
    setIsSavingAccrual(true);
    try {
      const now = new Date().toISOString();
      await onSaveRecord<VacationAccrualPeriod>('vacationAccrualPeriods', {
        id: accrualConfig.id || 'vac-acc-active',
        employmentId: currentEmployment?.id || 'emp-rahim-curr',
        periodLabel: accrualConfig.periodLabel || 'Active Accrual Period',
        accrualStartDate: accrualConfig.accrualStartDate,
        accrualEndDate: accrualConfig.targetCalculationDate,
        annualEntitlementDays: accrualConfig.annualEntitlementDays ?? 21,
        accrualMethod: accrualConfig.accrualMethod,
        dayBasis: accrualConfig.dayBasis,
        openingCarryForwardDays: accrualConfig.openingCarryForwardDays ?? 0,
        leaveTakenInPeriodDays: effectiveLeaveTakenForAccrual,
        manualAdjustmentDays: accrualConfig.manualAdjustmentDays ?? 0,
        manualAdjustmentReason: accrualConfig.manualAdjustmentReason,
        isPostVacationReset: accrualConfig.isPostVacationReset,
        returnedFromVacationDate: accrualConfig.returnedFromVacationDate || undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      notify('Saved Annual Leave Accrual Period & Reset Rule settings.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save accrual settings.';
      setAccrualError(msg);
      notify(msg, 'warning');
    } finally {
      setIsSavingAccrual(false);
    }
  };

  const handleSaveVacationPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanError('');
    if (!planForm.title.trim()) {
      setPlanError('Please enter a Vacation Plan title.');
      return;
    }
    if (!planForm.plannedDepartureDate || !planForm.plannedReturnDate) {
      setPlanError('Planned departure date and return date are required.');
      return;
    }
    if (planForm.plannedReturnDate < planForm.plannedDepartureDate) {
      setPlanError('Planned return date cannot be earlier than planned departure date.');
      return;
    }
    const days =
      planForm.plannedVacationDays ??
      countInclusiveDays(planForm.plannedDepartureDate, planForm.plannedReturnDate);
    if (days <= 0) {
      setPlanError('Planned vacation days must be greater than 0.');
      return;
    }
    setIsSavingPlan(true);
    try {
      const now = new Date().toISOString();
      const isEditing = Boolean(planForm.id);
      await onSaveRecord<VacationPlanRecord>('vacationPlans', {
        id: planForm.id,
        employmentId: currentEmployment?.id || 'emp-rahim-curr',
        title: planForm.title.trim(),
        plannedDepartureDate: planForm.plannedDepartureDate,
        plannedReturnDate: planForm.plannedReturnDate,
        plannedVacationDays: days,
        vacationType: planForm.vacationType,
        expectedVacationPay: planForm.expectedVacationPay ?? 0,
        travelTicketBudget: planForm.travelTicketBudget ?? 0,
        approvalStatus: planForm.approvalStatus,
        notes: planForm.notes || undefined,
        attachmentName: planForm.attachmentName || undefined,
        createdAt: now,
        updatedAt: now,
      });
      setPlanForm((prev) => ({ ...prev, id: undefined, title: '', notes: '' }));
      notify(isEditing ? 'Vacation plan updated.' : 'Vacation plan saved.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vacation plan.';
      setPlanError(msg);
      notify(msg, 'warning');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleSaveVacationLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogError('');
    if (!logForm.startDate || !logForm.endDate) {
      setLogError('Actual departure date and expected return date are required.');
      return;
    }
    if (logForm.endDate < logForm.startDate) {
      setLogError('Expected return / end date cannot be before departure date.');
      return;
    }
    const calendarDays = countInclusiveDays(logForm.startDate, logForm.endDate);
    const totalDays = logForm.totalDays ?? calendarDays;
    if (totalDays <= 0) {
      setLogError('Total leave days charged must be greater than 0.');
      return;
    }
    setIsSavingLog(true);
    try {
      const isEditing = Boolean(logForm.id);
      await onSaveRecord<LeaveRecord>('leaves', {
        id: logForm.id,
        employmentId: currentEmployment?.id || 'emp-rahim-curr',
        startDate: logForm.startDate,
        endDate: logForm.endDate,
        actualDepartureDate: logForm.startDate,
        expectedReturnDate: logForm.endDate,
        actualReturnDate: logForm.actualReturnDate || undefined,
        returnToWorkConfirmed: logForm.returnToWorkConfirmed,
        durationType: 'full_day',
        calendarDaysAway: calendarDays,
        totalDays,
        paidLeaveDays: logForm.paidLeaveDays ?? totalDays,
        unpaidLeaveDays: logForm.unpaidLeaveDays ?? 0,
        leaveType: logForm.leaveType,
        isPaid: (logForm.unpaidLeaveDays ?? 0) < totalDays,
        approvalStatus: logForm.returnToWorkConfirmed ? 'completed' : logForm.approvalStatus,
        vacationPayReceived: logForm.vacationPayReceived,
        ticketAllowanceReceived: logForm.ticketAllowanceReceived,
        medicalCertificateRef: logForm.medicalCertificateRef || undefined,
        reason: logForm.reason || 'Recorded in Vacation & Leave Log',
        createdAt: new Date().toISOString(),
      });
      setLogForm((prev) => ({
        ...prev,
        id: undefined,
        reason: '',
        actualReturnDate: '',
        returnToWorkConfirmed: false,
      }));
      notify(
        isEditing
          ? 'Vacation & Leave Log record updated.'
          : 'Vacation & Leave Log record saved (synced with Leave Tracker without double-counting).',
        'success',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vacation log.';
      setLogError(msg);
      notify(msg, 'warning');
    } finally {
      setIsSavingLog(false);
    }
  };

  const handleApplyPostVacationResetFromLog = async (leave: LeaveRecord) => {
    const resetDate = leave.actualReturnDate || leave.endDate;
    setAccrualConfig((prev) => ({
      ...prev,
      periodLabel: `Post-Vacation Reset (${resetDate})`,
      accrualStartDate: resetDate,
      returnedFromVacationDate: resetDate,
      isPostVacationReset: true,
    }));
    setVacationSubTab('accrual');
    notify(
      `Accrual start date set to Return-to-Work date (${resetDate}). Prior carryover balance (${accrualConfig.openingCarryForwardDays ?? 0} days) is preserved separately.`,
      'success',
    );
  };

  const handleSaveVacationPayRecord = async () => {
    setPayCalcError('');
    if ((payCalcForm.basicSalary ?? 0) <= 0 || (payCalcForm.payableVacationDays ?? 0) <= 0) {
      setPayCalcError('Basic salary and payable vacation days must be greater than 0.');
      return;
    }
    setIsSavingPayCalc(true);
    try {
      const isEditing = Boolean(payCalcForm.id);
      await onSaveRecord<VacationPayCalculationRecord>('vacationPayCalculations', {
        id: payCalcForm.id,
        employmentId: currentEmployment?.id || 'emp-rahim-curr',
        title: payCalcForm.title || 'Vacation Pay Calculation',
        calculationDate: getLocalTodayISO(),
        expectedDepartureDate: payCalcForm.expectedDepartureDate,
        expectedPaymentDate: payCalcForm.expectedPaymentDate,
        basicSalary: payCalcForm.basicSalary ?? 0,
        housingAllowance: payCalcForm.housingAllowance ?? 0,
        otherEligibleAllowances: payCalcForm.otherEligibleAllowances ?? 0,
        leavePayBasis: payCalcForm.leavePayBasis,
        payableVacationDays: payCalcForm.payableVacationDays ?? 0,
        divisorMethod: payCalcForm.divisorMethod,
        dailyLeaveSalaryRate: liveVacationPayResult.dailyLeaveSalaryRate,
        estimatedGrossVacationPay: liveVacationPayResult.estimatedGrossVacationPay,
        actualVacationPayReceived: payCalcForm.actualVacationPayReceived,
        varianceAmount: liveVacationPayResult.varianceAmount,
        notes: payCalcForm.notes || undefined,
        createdAt: new Date().toISOString(),
      });
      setPayCalcForm((prev) => ({ ...prev, id: undefined }));
      notify(
        isEditing
          ? 'Updated Vacation Pay Calculation record.'
          : 'Saved Vacation Pay Calculation to your private records.',
        'success',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vacation pay calculation.';
      setPayCalcError(msg);
      notify(msg, 'warning');
    } finally {
      setIsSavingPayCalc(false);
    }
  };

  // ============================================================================
  // RENDER: LOAN MANAGEMENT MODULE
  // ============================================================================
  if (activeTab === 'loans') {
    const expectedGrossSalary = effectiveSalary
      ? effectiveSalary.basicSalary +
        effectiveSalary.housingAllowance +
        effectiveSalary.foodAllowance +
        effectiveSalary.transportAllowance +
        effectiveSalary.otherFixedAllowances
      : 7000;
    const confirmedLoanDed = loanPortfolio.totalActualMonthlyDeduction;
    const netSalaryAfterLoan = Math.round((expectedGrossSalary - confirmedLoanDed) * 100) / 100;

    return (
      <div className="space-y-6 text-slate-900">
        {/* Header & Export Bar */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
                <CreditCard className="w-3.5 h-3.5" /> Personal Employee Loan & Advance Ledger
              </span>
              <h2 className="text-2xl font-bold">Employee Loan Management</h2>
              <p className="text-sm text-slate-300 mt-1">
                Track company loans, salary advances, and confirmed monthly deductions. Principal repaid is calculated strictly from saved repayment records.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <MonthInputWithToday
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  ariaLabel="Selected Loan Month"
                  className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  exportLoanPortfolioPDF({
                    employeeName: slice.profile.fullName,
                    employerName: currentEmployment?.employerName || '',
                    selectedMonth,
                    portfolio: loanPortfolio,
                  })
                }
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" /> PDF Statement
              </button>
              <button
                type="button"
                onClick={() =>
                  exportLoanPortfolioExcelAndCSV({
                    selectedMonth,
                    loans,
                    repayments: loanRepayments,
                    format: 'xlsx',
                  })
                }
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() =>
                  exportLoanPortfolioExcelAndCSV({
                    selectedMonth,
                    loans,
                    repayments: loanRepayments,
                    format: 'csv',
                  })
                }
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>

          {/* 6 Loan Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">1. Total Loans Taken</div>
              <div className="text-xl font-bold font-mono mt-1">{loanPortfolio.totalLoansTaken}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">All personal loans</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">2. Original Loan Amount</div>
              <div className="text-xl font-bold font-mono text-white mt-1">
                SAR {loanPortfolio.totalOriginalAmount.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Total principal issued</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">3. Total Loan Repaid</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                SAR {loanPortfolio.totalPrincipalRepaid.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">From saved repayments</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">4. Monthly Deduction</div>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                SAR {loanPortfolio.totalScheduledMonthlyDeduction.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Confirmed ({selectedMonth}): SAR {loanPortfolio.totalActualMonthlyDeduction.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">5. Outstanding Balance</div>
              <div className="text-xl font-bold font-mono text-rose-300 mt-1">
                SAR {loanPortfolio.totalOutstandingBalance.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Original − Principal Repaid</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">6. Active Loans</div>
              <div className="text-xl font-bold font-mono text-sky-300 mt-1">
                {loanPortfolio.activeLoansCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Currently active schedules</div>
            </div>
          </div>
        </div>

        {/* Monthly Salary Integration Strip */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Monthly Salary & Loan Deduction Integration ({selectedMonth})
              </h3>
              <p className="text-xs text-slate-500">
                Scheduled deductions are shown for planning; only confirmed repayment records reduce your loan balance.
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md">
              Formula: Outstanding Balance = Original Loan Amount − Total Principal Repaid
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Contract Gross Salary</div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                SAR {expectedGrossSalary.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-amber-800">Scheduled Loan Deduction</div>
              <div className="text-base font-bold font-mono text-amber-900 mt-0.5">
                SAR {loanPortfolio.totalScheduledMonthlyDeduction.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-rose-800">Confirmed Loan Deduction</div>
              <div className="text-base font-bold font-mono text-rose-900 mt-0.5">
                -SAR {confirmedLoanDed.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Deduction Variance</div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                SAR {(confirmedLoanDed - loanPortfolio.totalScheduledMonthlyDeduction).toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-emerald-800">Est. Net Salary After Loan</div>
              <div className="text-base font-bold font-mono text-emerald-900 mt-0.5">
                SAR {netSalaryAfterLoan.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <div className="text-indigo-800">Remaining Loan Balance</div>
              <div className="text-base font-bold font-mono text-indigo-900 mt-0.5">
                SAR {loanPortfolio.totalOutstandingBalance.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Forms Grid: Register Loan + Record Monthly Deduction */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* A. Loan Registration Form */}
          <form
            noValidate
            onSubmit={handleSaveLoan}
            className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {loanForm.id ? 'Edit Loan Record' : 'Register New Personal Loan / Advance'}
                </h3>
                <p className="text-xs text-slate-500">
                  Register company loans, salary advances, or emergency loans.
                </p>
              </div>
              {loanForm.id && (
                <button
                  type="button"
                  onClick={() =>
                    setLoanForm((prev) => ({
                      ...prev,
                      id: undefined,
                      loanCode: `LN-${new Date().getFullYear()}-${String(loans.length + 1).padStart(2, '0')}`,
                      loanName: '',
                    }))
                  }
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {loanFormError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium"
              >
                {loanFormError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Loan ID / Code *</label>
                <input
                  type="text"
                  required
                  value={loanForm.loanCode}
                  onChange={(e) => setLoanForm({ ...loanForm, loanCode: e.target.value })}
                  placeholder="e.g. LN-ARMEC-2026-01"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Loan Type *</label>
                <select
                  value={loanForm.loanType}
                  onChange={(e) => setLoanForm({ ...loanForm, loanType: e.target.value as LoanType })}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="company_loan">Company Loan</option>
                  <option value="salary_advance">Salary Advance</option>
                  <option value="personal_loan">Personal Loan</option>
                  <option value="emergency_loan">Emergency Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Loan Name or Description *</label>
                <input
                  type="text"
                  required
                  value={loanForm.loanName}
                  onChange={(e) => setLoanForm({ ...loanForm, loanName: e.target.value })}
                  placeholder="e.g. Company Housing Advance / Car Repair Loan"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Loan Issue Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={loanForm.issueDate}
                    onChange={(val) => setLoanForm({ ...loanForm, issueDate: val })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Loan Status *</label>
                <select
                  value={loanForm.status}
                  onChange={(e) => setLoanForm({ ...loanForm, status: e.target.value as LoanStatus })}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Original Loan Amount (SAR) *</label>
                <NumericInput
                  value={loanForm.originalAmount}
                  onValueChange={(val) => setLoanForm({ ...loanForm, originalAmount: val })}
                  required
                  min={0}
                  placeholder="e.g. 6000"
                  ariaLabel="Original Loan Amount"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Scheduled Monthly Deduction (SAR) *</label>
                <NumericInput
                  value={loanForm.monthlyDeductionAmount}
                  onValueChange={(val) => setLoanForm({ ...loanForm, monthlyDeductionAmount: val })}
                  required
                  min={0}
                  placeholder="e.g. 750"
                  ariaLabel="Scheduled Monthly Deduction"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">First Deduction Month *</label>
                <div className="mt-1">
                  <MonthInputWithToday
                    value={loanForm.firstDeductionMonth}
                    onChange={(val) => setLoanForm({ ...loanForm, firstDeductionMonth: val })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Expected Final Deduction Month *</label>
                <div className="mt-1">
                  <MonthInputWithToday
                    value={loanForm.expectedFinalDeductionMonth}
                    onChange={(val) => setLoanForm({ ...loanForm, expectedFinalDeductionMonth: val })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Supporting Document Ref (Optional)</label>
                <input
                  type="text"
                  value={loanForm.supportingDocumentName}
                  onChange={(e) => setLoanForm({ ...loanForm, supportingDocumentName: e.target.value })}
                  placeholder="e.g. HR_Loan_Agreement_2026.pdf"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Notes</label>
                <input
                  type="text"
                  value={loanForm.notes}
                  onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })}
                  placeholder="Installment terms or remarks"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingLoan}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {isSavingLoan
                ? 'Saving...'
                : loanForm.id
                  ? 'Update Loan Record'
                  : 'Save Loan to Personal Ledger'}
            </button>
          </form>

          {/* C. Record Monthly Loan Repayment / Deduction */}
          <form
            noValidate
            onSubmit={handleSaveRepayment}
            className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {repaymentForm.id
                    ? 'Edit Loan Deduction / Repayment'
                    : 'Record Actual Monthly Loan Deduction / Repayment'}
                </h3>
                <p className="text-xs text-slate-500">
                  Compare scheduled vs. actual salary deduction and update remaining principal balance.
                </p>
              </div>
              {repaymentForm.id && (
                <button
                  type="button"
                  onClick={() =>
                    setRepaymentForm((prev) => ({
                      ...prev,
                      id: undefined,
                      payslipReference: '',
                      notes: '',
                    }))
                  }
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {repaymentError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium"
              >
                {repaymentError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Select Loan *</label>
                <select
                  value={selectedRepaymentLoan?.id || ''}
                  onChange={(e) => {
                    const found = loans.find((l) => l.id === e.target.value);
                    setRepaymentForm((prev) => ({
                      ...prev,
                      loanId: e.target.value,
                      scheduledDeduction: found?.monthlyDeductionAmount ?? 0,
                      actualDeduction: found?.monthlyDeductionAmount ?? 0,
                      amountAppliedToPrincipal: found?.monthlyDeductionAmount ?? 0,
                    }));
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium"
                >
                  {loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      [{l.loanCode}] {l.loanName} — Orig: SAR {l.originalAmount.toLocaleString()} ({l.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Salary Month *</label>
                <div className="mt-1">
                  <MonthInputWithToday
                    value={repaymentForm.salaryMonth}
                    onChange={(val) => setRepaymentForm({ ...repaymentForm, salaryMonth: val })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Deduction Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={repaymentForm.deductionDate}
                    onChange={(val) => setRepaymentForm({ ...repaymentForm, deductionDate: val })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Scheduled Deduction (SAR)</label>
                <NumericInput
                  value={repaymentForm.scheduledDeduction}
                  onValueChange={(val) => setRepaymentForm({ ...repaymentForm, scheduledDeduction: val })}
                  min={0}
                  ariaLabel="Scheduled Deduction Amount"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Actual Deduction on Slip (SAR) *</label>
                <NumericInput
                  value={repaymentForm.actualDeduction}
                  onValueChange={(val) =>
                    setRepaymentForm({
                      ...repaymentForm,
                      actualDeduction: val,
                      amountAppliedToPrincipal: val,
                    })
                  }
                  required
                  min={0}
                  ariaLabel="Actual Deduction Amount"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Amount Applied to Principal (SAR) *</label>
                <NumericInput
                  value={repaymentForm.amountAppliedToPrincipal}
                  onValueChange={(val) =>
                    setRepaymentForm({ ...repaymentForm, amountAppliedToPrincipal: val })
                  }
                  required
                  min={0}
                  ariaLabel="Amount Applied to Principal"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Projected Remaining Balance (SAR)</label>
                <div className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold text-slate-900">
                  SAR {(repaymentValidation?.projectedRemainingBalance ?? 0).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Payslip Reference / Attachment</label>
                <input
                  type="text"
                  value={repaymentForm.payslipReference}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, payslipReference: e.target.value })}
                  placeholder="e.g. ARMEC-SLIP-2026-03"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Notes</label>
                <input
                  type="text"
                  value={repaymentForm.notes}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, notes: e.target.value })}
                  placeholder="Partial deduction / extra payment note"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            {/* Duplicate Month Warning & Confirmation */}
            {repaymentValidation?.hasDuplicateMonth && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Duplicate Salary Month Detected ({repaymentForm.salaryMonth})
                </div>
                <p>
                  A repayment is already recorded for this loan in {repaymentForm.salaryMonth}. Check below only if an additional deduction was genuinely taken in the same month.
                </p>
                <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={repaymentForm.allowDuplicateMonth}
                    onChange={(e) =>
                      setRepaymentForm({ ...repaymentForm, allowDuplicateMonth: e.target.checked })
                    }
                  />
                  Confirm additional deduction in {repaymentForm.salaryMonth}
                </label>
              </div>
            )}

            {/* Negative Balance Warning & Confirmation */}
            {repaymentValidation?.wouldBecomeNegative && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  Negative Outstanding Balance Warning (SAR{' '}
                  {repaymentValidation.projectedRemainingBalance.toFixed(2)})
                </div>
                <p>
                  This deduction exceeds the remaining loan balance of SAR{' '}
                  {repaymentValidation.currentOutstandingBalance.toFixed(2)}.
                </p>
                <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={repaymentForm.allowNegativeBalance}
                    onChange={(e) =>
                      setRepaymentForm({ ...repaymentForm, allowNegativeBalance: e.target.checked })
                    }
                  />
                  Confirm overpayment / negative loan balance
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingRepayment}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />{' '}
              {isSavingRepayment
                ? 'Saving...'
                : repaymentForm.id
                  ? 'Update Loan Deduction'
                  : 'Record Confirmed Loan Deduction'}
            </button>
          </form>
        </div>

        {/* Remaining Balance Visual Chart & Individual Loan Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Loan Portfolio Progress & Repayment History
          </h3>
          {loanPortfolio.loanBreakdown.length === 0 ? (
            <EmptyStateIllustration
              type="loans"
              title="No Employee Loans Registered"
              description="Record company advances, personal loans, or emergency funds with automated monthly salary deductions."
            />
          ) : (
            <div className="space-y-4">
              {loanPortfolio.loanBreakdown.map((item) => (
                <div
                  key={item.loan.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 mr-2">
                        {item.loan.loanCode}
                      </span>
                      <span className="text-sm font-bold text-slate-900">{item.loan.loanName}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        ({item.loan.loanType.replace('_', ' ')} • Issued {formatDisplayDate(item.loan.issueDate, slice.profile.dateFormat)})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase ${
                          item.loan.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.loan.status === 'completed'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.loan.status}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setLoanForm({
                            id: item.loan.id,
                            loanCode: item.loan.loanCode,
                            loanName: item.loan.loanName,
                            loanType: item.loan.loanType,
                            issueDate: item.loan.issueDate,
                            originalAmount: item.loan.originalAmount,
                            currency: item.loan.currency,
                            monthlyDeductionAmount: item.loan.monthlyDeductionAmount,
                            firstDeductionMonth: item.loan.firstDeductionMonth,
                            expectedFinalDeductionMonth: item.loan.expectedFinalDeductionMonth,
                            status: item.loan.status,
                            notes: item.loan.notes || '',
                            supportingDocumentName: item.loan.supportingDocumentName || '',
                          })
                        }
                        className="text-xs text-emerald-700 hover:underline font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRecord('loans', item.loan.id)}
                        className="text-rose-600 hover:text-rose-800 p-1"
                        aria-label={`Delete loan ${item.loan.loanCode}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">
                        Principal Repaid: <strong>SAR {item.principalRepaid.toLocaleString()}</strong> of SAR{' '}
                        {item.loan.originalAmount.toLocaleString()} ({item.progressPercentage.toFixed(1)}%)
                      </span>
                      <span className="font-mono font-bold text-rose-700">
                        Remaining: SAR {item.outstandingBalance.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, item.progressPercentage))}%` }}
                      />
                    </div>
                  </div>

                  {/* Repayment Table for this Loan */}
                  {item.repayments.length > 0 && (
                    <div className="overflow-x-auto pt-2">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1.5 pr-3">Salary Month</th>
                            <th className="py-1.5 pr-3">Deduction Date</th>
                            <th className="py-1.5 pr-3">Scheduled</th>
                            <th className="py-1.5 pr-3">Actual Deducted</th>
                            <th className="py-1.5 pr-3">Principal Applied</th>
                            <th className="py-1.5 pr-3">Remaining Balance</th>
                            <th className="py-1.5 pr-3">Payslip Ref</th>
                            <th className="py-1.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 font-mono">
                          {item.repayments.map((rep) => (
                            <tr key={rep.id}>
                              <td className="py-1.5 pr-3 font-semibold">{rep.salaryMonth}</td>
                              <td className="py-1.5 pr-3">{rep.deductionDate}</td>
                              <td className="py-1.5 pr-3">SAR {rep.scheduledDeduction.toFixed(2)}</td>
                              <td className="py-1.5 pr-3 text-emerald-700 font-semibold">
                                SAR {rep.actualDeduction.toFixed(2)}
                              </td>
                              <td className="py-1.5 pr-3">SAR {rep.amountAppliedToPrincipal.toFixed(2)}</td>
                              <td className="py-1.5 pr-3 font-bold text-slate-900">
                                SAR {rep.remainingBalanceAfter.toFixed(2)}
                              </td>
                              <td className="py-1.5 pr-3 font-sans text-slate-600">
                                {rep.payslipReference || '—'}
                              </td>
                              <td className="py-1.5 text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRepaymentForm({
                                      id: rep.id,
                                      loanId: rep.loanId,
                                      deductionDate: rep.deductionDate,
                                      salaryMonth: rep.salaryMonth,
                                      scheduledDeduction: rep.scheduledDeduction,
                                      actualDeduction: rep.actualDeduction,
                                      amountAppliedToPrincipal: rep.amountAppliedToPrincipal,
                                      payslipReference: rep.payslipReference || '',
                                      notes: rep.notes || '',
                                      allowDuplicateMonth: Boolean(rep.confirmedDuplicateMonth),
                                      allowNegativeBalance: Boolean(rep.confirmedNegativeBalance),
                                    })
                                  }
                                  className="text-emerald-700 hover:underline font-sans font-semibold text-xs"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteRecord('loanRepayments', rep.id)}
                                  className="text-rose-600 hover:text-rose-800"
                                  aria-label={`Delete repayment ${rep.salaryMonth}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 inline" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: COMPLETE VACATION & ANNUAL LEAVE MANAGEMENT SYSTEM (activeTab === 'leave')
  // ============================================================================
  return (
    <div className="space-y-6 text-slate-900">
      {/* Header + Export Bar + 10 Vacation Balance Cards */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
              <Plane className="w-3.5 h-3.5" /> Saudi Labor Law Art. 109 / 111 / 117 — Vacation & Leave Hub
            </span>
            <h2 className="text-2xl font-bold">
              Vacation Planning, Accrual Reset Calculator, Leave Log & Vacation Pay
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Supports post-vacation Return-to-Work accrual reset dates, separate carried-forward balances, year-by-year tracking, and Art. 109 leave salary calculation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportVacationAndAccrualPDF({
                  employeeName: slice.profile.fullName,
                  employerName: currentEmployment?.employerName || '',
                  accrual: liveAccrualResult,
                  plans: slice.vacationPlans || [],
                  leaveHistory: slice.leaves,
                  yearlyRows: yearlyVacationRows,
                  payCalculations: slice.vacationPayCalculations || [],
                })
              }
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" /> Vacation PDF Report
            </button>
            <button
              type="button"
              onClick={() =>
                exportVacationExcelAndCSV({
                  accrual: liveAccrualResult,
                  plans: slice.vacationPlans || [],
                  leaveHistory: slice.leaves,
                  yearlyRows: yearlyVacationRows,
                  payCalculations: slice.vacationPayCalculations || [],
                  format: 'xlsx',
                })
              }
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() =>
                exportVacationExcelAndCSV({
                  accrual: liveAccrualResult,
                  plans: slice.vacationPlans || [],
                  leaveHistory: slice.leaves,
                  yearlyRows: yearlyVacationRows,
                  payCalculations: slice.vacationPayCalculations || [],
                  format: 'csv',
                })
              }
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        </div>

        {/* 10 Vacation Balance Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">1. Annual Entitlement</div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">
              {liveAccrualResult.annualEntitlementDays} days/yr
            </div>
            <div className="text-[10px] text-slate-400">
              Rate: {liveAccrualResult.dailyAccrualRate.toFixed(4)} d/day
            </div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">2. Opening / Carryover</div>
            <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
              {liveAccrualResult.carriedForwardDays.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">Preserved separately</div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">3. Earned This Year</div>
            <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
              {(yearlyVacationRows[yearlyVacationRows.length - 1]?.earned ?? liveAccrualResult.accruedInCurrentPeriod).toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">Current leave year</div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">4. Earned in Accrual Period</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {liveAccrualResult.accruedInCurrentPeriod.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">
              {liveAccrualResult.daysElapsed}d since {liveAccrualResult.accrualStartDate}
            </div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">5. Leave Taken</div>
            <div className="text-lg font-bold font-mono text-rose-300 mt-0.5">
              {liveAccrualResult.leaveTakenInPeriod.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">
              Career total: {careerLeaveBalances?.annualLeaveTaken ?? 0}d
            </div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">6. Approved Future Leave</div>
            <div className="text-lg font-bold font-mono text-sky-300 mt-0.5">
              {approvedFutureLeaveDays.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">Scheduled & approved</div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">7. Pending Leave Requests</div>
            <div className="text-lg font-bold font-mono text-amber-200 mt-0.5">
              {pendingLeaveRequestDays.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">Awaiting HR approval</div>
          </div>
          <div className="bg-slate-800/90 border border-emerald-500/50 rounded-xl p-3">
            <div className="text-[11px] text-emerald-300 font-semibold">8. Remaining Available</div>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {liveAccrualResult.totalEstimatedAvailableDays.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-300">As of {liveAccrualResult.targetCalculationDate}</div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">9. Est. Year-End Balance</div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">
              {yearEndAccrualResult.totalEstimatedAvailableDays.toFixed(2)} days
            </div>
            <div className="text-[10px] text-slate-400">Projected at 31 Dec</div>
          </div>
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] text-slate-400">10. Next Accrual Anniversary</div>
            <div className="text-lg font-bold font-mono text-indigo-300 mt-0.5">
              {nextAccrualAnniversary}
            </div>
            <div className="text-[10px] text-slate-400">Contract cycle milestone</div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Pills for the 5 Vacation & Leave Sections */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
        {[
          { id: 'accrual', label: '1. Accrual & Post-Vacation Reset Calculator' },
          { id: 'planner', label: '2. Vacation Plan & Timeline' },
          { id: 'log', label: '3. Vacation Log & Return Confirmation' },
          { id: 'yearly', label: '4. Year-by-Year Balance & Career History' },
          { id: 'pay_calc', label: '5. Vacation Pay Calculator (Art. 109)' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setVacationSubTab(t.id as typeof vacationSubTab)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              vacationSubTab === t.id
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: ANNUAL LEAVE ACCRUAL & POST-VACATION RETURN RESET CALCULATOR */}
      {vacationSubTab === 'accrual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            noValidate
            onSubmit={handleSaveAccrualPeriod}
            className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
          >
            {accrualError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium"
              >
                {accrualError}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Annual Leave Accrual & Post-Vacation Reset Configuration
                </h3>
                <p className="text-xs text-slate-500">
                  Configure your annual entitlement (21, 30, or custom days) and Return-to-Work accrual reset date.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setAccrualConfig({
                    ...accrualConfig,
                    periodLabel: '1 Sep 2026 Return-to-Work Reset Example (21-Day Entitlement)',
                    accrualStartDate: '2026-09-01',
                    targetCalculationDate: '2026-12-31',
                    annualEntitlementDays: 21,
                    accrualMethod: 'daily',
                    dayBasis: '365_fixed',
                    openingCarryForwardDays: 5,
                    leaveTakenInPeriodDays: 0,
                    manualAdjustmentDays: 0,
                    isPostVacationReset: true,
                    returnedFromVacationDate: '2026-09-01',
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Load 1 Sep → 31 Dec 2026 Reset Example (7.02d)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Accrual Period Label</label>
                <input
                  type="text"
                  value={accrualConfig.periodLabel}
                  onChange={(e) => setAccrualConfig({ ...accrualConfig, periodLabel: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">
                  Accrual Start Date (Joining or Return-to-Work Date) *
                </label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={accrualConfig.accrualStartDate}
                    onChange={(val) => setAccrualConfig({ ...accrualConfig, accrualStartDate: val })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Target Calculation Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={accrualConfig.targetCalculationDate}
                    onChange={(val) =>
                      setAccrualConfig({ ...accrualConfig, targetCalculationDate: val })
                    }
                    required
                  />
                </div>
                {/* Target Date Quick Presets */}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setAccrualConfig({ ...accrualConfig, targetCalculationDate: getLocalTodayISO() })
                    }
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAccrualConfig({ ...accrualConfig, targetCalculationDate: '2026-12-31' })
                    }
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700"
                  >
                    31 Dec 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextPlan = (slice.vacationPlans || [])[0];
                      if (nextPlan) {
                        setAccrualConfig({
                          ...accrualConfig,
                          targetCalculationDate: nextPlan.plannedDepartureDate,
                        });
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700"
                  >
                    Planned Vacation
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m, d] = accrualConfig.accrualStartDate.split('-').map(Number);
                      setAccrualConfig({
                        ...accrualConfig,
                        targetCalculationDate: `${(y || 2026) + 1}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`,
                      });
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700"
                  >
                    +12 Months
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">
                  Annual Leave Entitlement (Days / Year) *
                </label>
                <NumericInput
                  value={accrualConfig.annualEntitlementDays}
                  onValueChange={(val) =>
                    setAccrualConfig({ ...accrualConfig, annualEntitlementDays: val })
                  }
                  min={1}
                  max={120}
                  ariaLabel="Annual Leave Entitlement Days"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
                <div className="flex gap-1.5 mt-1">
                  {[21, 30, 35].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setAccrualConfig({ ...accrualConfig, annualEntitlementDays: preset })
                      }
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-mono"
                    >
                      {preset}d
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Day Basis / Divisor Method</label>
                <select
                  value={accrualConfig.dayBasis}
                  onChange={(e) =>
                    setAccrualConfig({
                      ...accrualConfig,
                      dayBasis: e.target.value as AccrualDayBasis,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="365_fixed">365-Day Standard Basis (Art. 109 Default)</option>
                  <option value="leap_aware_365_366">Leap-Year Aware (365 / 366 Days)</option>
                  <option value="360_contractual">360-Day Contractual Basis (30d × 12m)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Accrual Method</label>
                <select
                  value={accrualConfig.accrualMethod}
                  onChange={(e) =>
                    setAccrualConfig({
                      ...accrualConfig,
                      accrualMethod: e.target.value as AccrualCalculationMethod,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="daily">Daily Accrual (Elapsed Days × Entitlement / Basis)</option>
                  <option value="monthly">Monthly Accrual (Entitlement / 12 per Month)</option>
                  <option value="company_defined">Company-Defined Custom Formula</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">
                  1. Carried-Forward Leave Balance (Before Period)
                </label>
                <NumericInput
                  value={accrualConfig.openingCarryForwardDays}
                  onValueChange={(val) =>
                    setAccrualConfig({ ...accrualConfig, openingCarryForwardDays: val })
                  }
                  min={0}
                  ariaLabel="Carried Forward Leave Balance"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">
                  3. Leave Already Taken in Current Period
                </label>
                <NumericInput
                  value={accrualConfig.leaveTakenInPeriodDays}
                  onValueChange={(val) =>
                    setAccrualConfig({ ...accrualConfig, leaveTakenInPeriodDays: val })
                  }
                  min={0}
                  ariaLabel="Leave Taken in Current Period"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">
                  4. Manual Balance Adjustment (+/- Days)
                </label>
                <NumericInput
                  value={accrualConfig.manualAdjustmentDays}
                  onValueChange={(val) =>
                    setAccrualConfig({ ...accrualConfig, manualAdjustmentDays: val })
                  }
                  allowNegative
                  ariaLabel="Manual Leave Adjustment Days"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Manual Adjustment / Carryover Reason</label>
                <input
                  type="text"
                  value={accrualConfig.manualAdjustmentReason}
                  onChange={(e) =>
                    setAccrualConfig({ ...accrualConfig, manualAdjustmentReason: e.target.value })
                  }
                  placeholder="e.g. 5 days carried forward prior to 1 Sep 2026 return from vacation"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">
                    Post-Vacation Return-to-Work Reset Mode
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Starts a fresh accrual period from your return-to-work date while keeping prior carried-forward days separate.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={accrualConfig.isPostVacationReset}
                  onChange={(e) =>
                    setAccrualConfig({ ...accrualConfig, isPostVacationReset: e.target.checked })
                  }
                  className="w-4 h-4"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingAccrual}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs"
            >
              {isSavingAccrual ? 'Saving...' : 'Save Active Accrual Period & Reset Rule'}
            </button>
          </form>

          {/* Right Column: 5-Line Strict Breakdown + Legal Reset Warning */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Transparent 5-Part Leave Balance Breakdown
                </span>
                <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-700">
                  {liveAccrualResult.daysElapsed} Inclusive Days
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div>
                    <div className="font-bold text-amber-950">
                      1. Leave Balance Carried Forward (Before Period)
                    </div>
                    <div className="text-[11px] text-amber-800">
                      Never erased when accrual start date is reset
                    </div>
                  </div>
                  <span className="text-base font-bold font-mono text-amber-900">
                    {liveAccrualResult.carriedForwardDays.toFixed(2)} d
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div>
                    <div className="font-bold text-emerald-950">
                      2. Leave Accrued During Current Period
                    </div>
                    <div className="text-[11px] text-emerald-800 font-mono">
                      {liveAccrualResult.formula}
                    </div>
                  </div>
                  <span className="text-base font-bold font-mono text-emerald-900">
                    +{liveAccrualResult.accruedInCurrentPeriod.toFixed(2)} d
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                  <div>
                    <div className="font-bold text-rose-950">
                      3. Leave Already Taken During Period
                    </div>
                    <div className="text-[11px] text-rose-800">
                      Confirmed annual leave days in this window
                    </div>
                  </div>
                  <span className="text-base font-bold font-mono text-rose-900">
                    -{liveAccrualResult.leaveTakenInPeriod.toFixed(2)} d
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-800">4. Manual Adjustments</div>
                    <div className="text-[11px] text-slate-500">
                      {accrualConfig.manualAdjustmentReason || 'No manual adjustment'}
                    </div>
                  </div>
                  <span className="text-base font-bold font-mono text-slate-900">
                    {liveAccrualResult.manualAdjustmentDays >= 0 ? '+' : ''}
                    {liveAccrualResult.manualAdjustmentDays.toFixed(2)} d
                  </span>
                </div>

                <div className="flex justify-between items-center p-4 rounded-xl bg-slate-900 text-white">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">
                      5. Total Estimated Available Leave
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Carryover + Current Period Accrued − Taken + Adjustments
                    </div>
                  </div>
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {liveAccrualResult.totalEstimatedAvailableDays.toFixed(2)} d
                  </span>
                </div>
              </div>

              {liveAccrualResult.resetRuleWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-amber-700 shrink-0" />
                    Saudi Labor Law Art. 109 Service-Anniversary Notice
                  </div>
                  <p>{liveAccrualResult.resetRuleWarning}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: VACATION PLAN (FUTURE VACATION PLANNER & TIMELINE) */}
      {vacationSubTab === 'planner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            noValidate
            onSubmit={handleSaveVacationPlan}
            className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {planForm.id ? 'Edit Vacation Plan' : 'Plan Future Vacation'}
              </h3>
              {planForm.id && (
                <button
                  type="button"
                  onClick={() =>
                    setPlanForm((prev) => ({
                      ...prev,
                      id: undefined,
                      title: '',
                      notes: '',
                    }))
                  }
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            {planError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700"
              >
                {planError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Vacation Plan Title *</label>
                <input
                  type="text"
                  required
                  value={planForm.title}
                  onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                  placeholder="e.g. Summer Family Vacation to Dhaka 2026"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Planned Departure Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={planForm.plannedDepartureDate}
                    onChange={(val) => {
                      const days = countInclusiveDays(val, planForm.plannedReturnDate);
                      setPlanForm({
                        ...planForm,
                        plannedDepartureDate: val,
                        plannedVacationDays: days > 0 ? days : planForm.plannedVacationDays,
                      });
                    }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Planned Return Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={planForm.plannedReturnDate}
                    onChange={(val) => {
                      const days = countInclusiveDays(planForm.plannedDepartureDate, val);
                      setPlanForm({
                        ...planForm,
                        plannedReturnDate: val,
                        plannedVacationDays: days > 0 ? days : planForm.plannedVacationDays,
                      });
                    }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Planned Vacation Days *</label>
                <NumericInput
                  value={planForm.plannedVacationDays}
                  onValueChange={(val) => setPlanForm({ ...planForm, plannedVacationDays: val })}
                  min={0.5}
                  required
                  ariaLabel="Planned Vacation Days"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Vacation Type</label>
                <select
                  value={planForm.vacationType}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, vacationType: e.target.value as LeaveType })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="annual_leave">Annual Leave</option>
                  <option value="unpaid_leave">Unpaid Leave</option>
                  <option value="emergency_leave">Emergency Leave</option>
                  <option value="eid_al_fitr">Eid Al-Fitr Holiday</option>
                  <option value="eid_al_adha">Eid Al-Adha Holiday</option>
                  <option value="hajj_leave">Hajj Leave</option>
                  <option value="marriage_leave">Marriage Leave</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Expected Vacation Pay (SAR)</label>
                <NumericInput
                  value={planForm.expectedVacationPay}
                  onValueChange={(val) => setPlanForm({ ...planForm, expectedVacationPay: val })}
                  min={0}
                  ariaLabel="Expected Vacation Pay"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Travel / Ticket Budget (SAR)</label>
                <NumericInput
                  value={planForm.travelTicketBudget}
                  onValueChange={(val) => setPlanForm({ ...planForm, travelTicketBudget: val })}
                  min={0}
                  ariaLabel="Travel Ticket Budget"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Approval Status</label>
                <select
                  value={planForm.approvalStatus}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      approvalStatus: e.target.value as VacationPlanStatus,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="draft">Draft</option>
                  <option value="planned">Planned</option>
                  <option value="approved">Approved</option>
                  <option value="started">Started</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Supporting Attachment Ref</label>
                <input
                  type="text"
                  value={planForm.attachmentName}
                  onChange={(e) => setPlanForm({ ...planForm, attachmentName: e.target.value })}
                  placeholder="e.g. Exit_ReEntry_Visa_Approval.pdf"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Notes</label>
                <input
                  type="text"
                  value={planForm.notes}
                  onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                  placeholder="Flight booking, exit/re-entry visa notes, handover"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            {/* Balance & Overlap Warnings */}
            {(planForm.plannedVacationDays ?? 0) > liveAccrualResult.totalEstimatedAvailableDays && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900">
                <strong>Balance Warning:</strong> Planned days ({planForm.plannedVacationDays}d) exceed your current estimated available leave balance ({liveAccrualResult.totalEstimatedAvailableDays.toFixed(2)}d). Excess days may be treated as unpaid leave unless accrued before departure.
              </div>
            )}
            {planOverlapCheck.hasOverlap && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900">
                <strong>Date Overlap Detected:</strong> Overlaps with{' '}
                {planOverlapCheck.overlappingLabels.join(', ')}.
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingPlan}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs"
            >
              {isSavingPlan
                ? 'Saving...'
                : planForm.id
                  ? 'Update Vacation Plan'
                  : 'Save Vacation Plan'}
            </button>
          </form>

          {/* Planned & Completed Vacations Timeline */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Planned & Completed Vacation Timeline
            </h3>
            {(slice.vacationPlans || []).length === 0 ? (
              <EmptyStateIllustration
                type="vacation"
                title="No Vacation Plans Saved"
                description="Schedule upcoming annual leaves, exit re-entry permits, ticket budgets, and return-to-work milestones."
              />
            ) : (
              <div className="space-y-3">
                {(slice.vacationPlans || []).map((plan) => (
                  <div
                    key={plan.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-slate-900">{plan.title}</span>
                        <span className="ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-semibold uppercase">
                          {plan.approvalStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPlanForm({
                              id: plan.id,
                              title: plan.title || plan.planName || '',
                              plannedDepartureDate: plan.plannedDepartureDate,
                              plannedReturnDate: plan.plannedReturnDate,
                              plannedVacationDays: plan.plannedVacationDays,
                              vacationType: plan.vacationType,
                              expectedVacationPay: plan.expectedVacationPay,
                              travelTicketBudget: plan.travelTicketBudget,
                              approvalStatus: plan.approvalStatus || plan.status || 'planned',
                              notes: plan.notes || '',
                              attachmentName: plan.attachmentName || '',
                            })
                          }
                          className="text-xs text-emerald-700 hover:underline font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLogForm({
                              startDate: plan.plannedDepartureDate,
                              endDate: plan.plannedReturnDate,
                              actualReturnDate: plan.plannedReturnDate,
                              returnToWorkConfirmed: false,
                              leaveType: plan.vacationType,
                              totalDays: plan.plannedVacationDays,
                              paidLeaveDays: plan.plannedVacationDays,
                              unpaidLeaveDays: 0,
                              approvalStatus: 'approved',
                              vacationPayReceived: plan.expectedVacationPay,
                              ticketAllowanceReceived: plan.travelTicketBudget,
                              medicalCertificateRef: '',
                              reason: plan.title || plan.planName || '',
                            });
                            setVacationSubTab('log');
                            notify('Loaded plan into Vacation Log for return-to-work confirmation.');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold"
                        >
                          Log Actual Vacation & Return
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecord('vacationPlans', plan.id)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                          aria-label={`Delete plan ${plan.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-500 font-sans block">Departure:</span>
                        {plan.plannedDepartureDate}
                      </div>
                      <div>
                        <span className="text-slate-500 font-sans block">Planned Return:</span>
                        {plan.plannedReturnDate}
                      </div>
                      <div>
                        <span className="text-slate-500 font-sans block">Planned Days:</span>
                        {plan.plannedVacationDays} days
                      </div>
                      <div>
                        <span className="text-slate-500 font-sans block">Est. Leave Pay:</span>
                        SAR {plan.expectedVacationPay.toLocaleString()}
                      </div>
                    </div>
                    {plan.notes && <p className="text-xs text-slate-600">{plan.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: VACATION LOG & ACTUAL RETURN-TO-WORK CONFIRMATION */}
      {vacationSubTab === 'log' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            noValidate
            onSubmit={handleSaveVacationLog}
            className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {logForm.id
                    ? 'Edit Vacation / Leave Log Entry'
                    : 'Record Actual Vacation / Leave & Confirm Return-to-Work Date'}
                </h3>
                <p className="text-xs text-slate-500">
                  Uses a single unified LeaveRecord ledger shared with Leave Tracker (no double-counting). Never assumes planned return = actual return.
                </p>
              </div>
              {logForm.id && (
                <button
                  type="button"
                  onClick={() =>
                    setLogForm((prev) => ({
                      ...prev,
                      id: undefined,
                      reason: '',
                      actualReturnDate: '',
                      returnToWorkConfirmed: false,
                    }))
                  }
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            {logError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700"
              >
                {logError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Actual Departure / Start Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={logForm.startDate}
                    onChange={(val) => {
                      const days = countInclusiveDays(val, logForm.endDate);
                      setLogForm({
                        ...logForm,
                        startDate: val,
                        totalDays: days > 0 ? days : logForm.totalDays,
                        paidLeaveDays: days > 0 ? days : logForm.paidLeaveDays,
                      });
                    }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Expected Return / End Date *</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={logForm.endDate}
                    onChange={(val) => {
                      const days = countInclusiveDays(logForm.startDate, val);
                      setLogForm({
                        ...logForm,
                        endDate: val,
                        totalDays: days > 0 ? days : logForm.totalDays,
                        paidLeaveDays: days > 0 ? days : logForm.paidLeaveDays,
                      });
                    }}
                    required
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">
                  Actual Return-to-Work Date (Enter when confirmed)
                </label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={logForm.actualReturnDate}
                    onChange={(val) =>
                      setLogForm({
                        ...logForm,
                        actualReturnDate: val,
                        returnToWorkConfirmed: Boolean(val),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Leave Type *</label>
                <select
                  value={logForm.leaveType}
                  onChange={(e) =>
                    setLogForm({ ...logForm, leaveType: e.target.value as LeaveType })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="annual_leave">Annual Leave (Art. 109)</option>
                  <option value="sick_leave">Sick Leave (Art. 117 — 30/60/30)</option>
                  <option value="unpaid_leave">Unpaid Leave</option>
                  <option value="emergency_leave">Emergency Leave</option>
                  <option value="hajj_leave">Hajj Leave (Art. 114)</option>
                  <option value="marriage_leave">Marriage Leave (Art. 113)</option>
                  <option value="paternity_maternity">Birth / Paternity / Maternity</option>
                  <option value="bereavement_leave">Bereavement Leave</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Leave Days Charged *</label>
                <NumericInput
                  value={logForm.totalDays}
                  onValueChange={(val) => setLogForm({ ...logForm, totalDays: val })}
                  min={0.5}
                  required
                  ariaLabel="Leave Days Charged"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Paid Leave Days</label>
                <NumericInput
                  value={logForm.paidLeaveDays}
                  onValueChange={(val) => setLogForm({ ...logForm, paidLeaveDays: val })}
                  min={0}
                  ariaLabel="Paid Leave Days"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Unpaid Leave Days</label>
                <NumericInput
                  value={logForm.unpaidLeaveDays}
                  onValueChange={(val) => setLogForm({ ...logForm, unpaidLeaveDays: val })}
                  min={0}
                  ariaLabel="Unpaid Leave Days"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Vacation Pay Received (SAR)</label>
                <NumericInput
                  value={logForm.vacationPayReceived}
                  onValueChange={(val) => setLogForm({ ...logForm, vacationPayReceived: val })}
                  min={0}
                  ariaLabel="Vacation Pay Received"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Ticket Allowance Received (SAR)</label>
                <NumericInput
                  value={logForm.ticketAllowanceReceived}
                  onValueChange={(val) => setLogForm({ ...logForm, ticketAllowanceReceived: val })}
                  min={0}
                  ariaLabel="Ticket Allowance Received"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Reason / Notes</label>
                <input
                  type="text"
                  value={logForm.reason}
                  onChange={(e) => setLogForm({ ...logForm, reason: e.target.value })}
                  placeholder="Destination, approval ref, or Sehhaty medical certificate #"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={logForm.returnToWorkConfirmed}
                    onChange={(e) =>
                      setLogForm({ ...logForm, returnToWorkConfirmed: e.target.checked })
                    }
                  />
                  Confirm Return-to-Work Completed
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingLog}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs"
            >
              {isSavingLog
                ? 'Saving...'
                : logForm.id
                  ? 'Update Vacation / Leave Log Entry'
                  : 'Save Vacation / Leave Log Entry'}
            </button>
          </form>

          {/* Permanent Vacation & Leave History Table */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Permanent Vacation & Leave History (Shared Ledger)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Departure – End</th>
                    <th className="py-2 pr-3">Actual Return</th>
                    <th className="py-2 pr-3">Charged Days</th>
                    <th className="py-2 pr-3">Leave Pay</th>
                    <th className="py-2 pr-3">Reset Action</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slice.leaves.map((lv) => (
                    <tr key={lv.id}>
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">
                        {lv.leaveType.replace(/_/g, ' ')}
                        <div className="text-[10px] text-slate-500">{lv.reason}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono">
                        {lv.startDate} → {lv.endDate}
                      </td>
                      <td className="py-2.5 pr-3 font-mono">
                        {lv.actualReturnDate ? (
                          <span className="text-emerald-700 font-semibold">
                            {lv.actualReturnDate} ✓
                          </span>
                        ) : (
                          <span className="text-amber-700">Not confirmed</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-bold">{lv.totalDays}d</td>
                      <td className="py-2.5 pr-3 font-mono">
                        {lv.vacationPayReceived !== undefined
                          ? `SAR ${lv.vacationPayReceived.toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          onClick={() => handleApplyPostVacationResetFromLog(lv)}
                          className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold"
                        >
                          Use Return Date for Accrual Reset
                        </button>
                      </td>
                      <td className="py-2.5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() =>
                            setLogForm({
                              id: lv.id,
                              startDate: lv.startDate,
                              endDate: lv.endDate,
                              actualReturnDate: lv.actualReturnDate || '',
                              returnToWorkConfirmed: Boolean(lv.returnToWorkConfirmed),
                              leaveType: lv.leaveType,
                              totalDays: lv.totalDays,
                              paidLeaveDays: lv.paidLeaveDays ?? lv.totalDays,
                              unpaidLeaveDays: lv.unpaidLeaveDays ?? 0,
                              approvalStatus: lv.approvalStatus,
                              vacationPayReceived: lv.vacationPayReceived,
                              ticketAllowanceReceived: lv.ticketAllowanceReceived,
                              medicalCertificateRef: lv.medicalCertificateRef || '',
                              reason: lv.reason || '',
                            })
                          }
                          className="text-emerald-700 hover:underline font-semibold text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecord('leaves', lv.id)}
                          className="text-rose-600 hover:text-rose-800 p-1"
                          aria-label={`Delete leave ${lv.startDate}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: YEAR-BY-YEAR VACATION BALANCE TABLE & EMPLOYMENT HISTORY */}
      {vacationSubTab === 'yearly' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Year-by-Year Vacation Balance Table
                </h3>
                <p className="text-xs text-slate-500">
                  Closing Balance = Opening Balance + Earned − Taken + Adjustments
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'calendar_year', label: 'Calendar Year (Jan–Dec)' },
                    { id: 'anniversary_year', label: 'Service Anniversary Year' },
                    { id: 'custom_accrual_period', label: 'Custom / Post-Vacation Reset Period' },
                    { id: 'employer_leave_year', label: 'Employer Leave Year' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setYearTableMode(m.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                      yearTableMode === m.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-4">Leave Year / Period</th>
                    <th className="py-2.5 pr-4">Window</th>
                    <th className="py-2.5 pr-4">Annual Entitlement</th>
                    <th className="py-2.5 pr-4">Opening Balance</th>
                    <th className="py-2.5 pr-4">Earned</th>
                    <th className="py-2.5 pr-4">Taken</th>
                    <th className="py-2.5 pr-4">Adjustments</th>
                    <th className="py-2.5 text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {yearlyVacationRows.map((row, idx) => (
                    <tr key={`${row.leaveYearLabel}-${row.periodStart}-${idx}`}>
                      <td className="py-2.5 pr-4 font-sans font-bold text-slate-900">
                        {row.leaveYearLabel}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {row.periodStart} → {row.periodEnd}
                      </td>
                      <td className="py-2.5 pr-4">{row.annualEntitlement} d</td>
                      <td className="py-2.5 pr-4 text-amber-800">{row.openingBalance.toFixed(2)} d</td>
                      <td className="py-2.5 pr-4 text-emerald-700 font-semibold">
                        +{row.earned.toFixed(2)} d
                      </td>
                      <td className="py-2.5 pr-4 text-rose-700">-{row.taken.toFixed(2)} d</td>
                      <td className="py-2.5 pr-4">
                        {row.adjustments >= 0 ? '+' : ''}
                        {row.adjustments.toFixed(2)} d
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        {row.closingBalance.toFixed(2)} d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Employment & Contract Leave History Isolation */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Multi-Employer Vacation & Contract Entitlement History
            </h3>
            <p className="text-xs text-slate-500">
              Previous employer leave records are preserved in your career archive and are never automatically transferred into a new employer&apos;s balance unless explicitly entered as an opening carryover.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slice.employments.map((emp) => (
                <div
                  key={emp.id}
                  className={`p-4 rounded-xl border ${
                    emp.isCurrent
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{emp.employerName}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                      {emp.isCurrent ? 'Current Employer' : 'Archived Contract'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Role: {emp.jobTitle} • Joined: {emp.joiningDate}{' '}
                    {emp.lastWorkingDate ? `→ Ended: ${emp.lastWorkingDate}` : ''}
                  </div>
                  <div className="text-xs font-mono font-semibold text-emerald-800 mt-2">
                    Contract Annual Leave Entitlement: {emp.annualLeaveEntitlementDays} days/year
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: VACATION PAY CALCULATOR (VACATION MONEY CALCULATOR) */}
      {vacationSubTab === 'pay_calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Vacation Pay Calculator (Saudi Labor Law Art. 109 / Art. 111)
              </h3>
              <p className="text-xs text-slate-500">
                Calculate expected leave salary prior to vacation departure or encashment, and compare with actual vacation pay received.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">Calculation Title</label>
                <input
                  type="text"
                  value={payCalcForm.title}
                  onChange={(e) => setPayCalcForm({ ...payCalcForm, title: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Basic Salary (SAR) *</label>
                <NumericInput
                  value={payCalcForm.basicSalary}
                  onValueChange={(val) => setPayCalcForm({ ...payCalcForm, basicSalary: val })}
                  min={0}
                  ariaLabel="Vacation Calc Basic Salary"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Housing Allowance (SAR)</label>
                <NumericInput
                  value={payCalcForm.housingAllowance}
                  onValueChange={(val) => setPayCalcForm({ ...payCalcForm, housingAllowance: val })}
                  min={0}
                  ariaLabel="Vacation Calc Housing Allowance"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Other Eligible Allowances (SAR)</label>
                <NumericInput
                  value={payCalcForm.otherEligibleAllowances}
                  onValueChange={(val) =>
                    setPayCalcForm({ ...payCalcForm, otherEligibleAllowances: val })
                  }
                  min={0}
                  ariaLabel="Vacation Calc Other Allowances"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Leave-Pay Wage Basis</label>
                <select
                  value={payCalcForm.leavePayBasis}
                  onChange={(e) =>
                    setPayCalcForm({
                      ...payCalcForm,
                      leavePayBasis: e.target.value as VacationPayBasis,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="actual_wage">Full Actual Wage (Art. 109 Statutory Standard)</option>
                  <option value="basic_plus_housing">Basic + Housing Allowance</option>
                  <option value="basic_only">Basic Salary Only (Company Policy)</option>
                  <option value="custom_components">Custom Eligible Components</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Payable Vacation Days *</label>
                <NumericInput
                  value={payCalcForm.payableVacationDays}
                  onValueChange={(val) =>
                    setPayCalcForm({ ...payCalcForm, payableVacationDays: val })
                  }
                  min={0.5}
                  ariaLabel="Payable Vacation Days"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Daily Rate Divisor Method</label>
                <select
                  value={payCalcForm.divisorMethod}
                  onChange={(e) =>
                    setPayCalcForm({
                      ...payCalcForm,
                      divisorMethod: e.target.value as VacationPayDivisorMethod,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="30_day_month">30-Day Standard Month (Monthly ÷ 30)</option>
                  <option value="actual_days_in_month">Actual Days in Departure Month</option>
                  <option value="daily_contract_365">Annualized 365-Day Rate ((Monthly × 12) ÷ 365)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Expected Departure Date</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={payCalcForm.expectedDepartureDate}
                    onChange={(val) =>
                      setPayCalcForm({ ...payCalcForm, expectedDepartureDate: val })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Expected Payment Date</label>
                <div className="mt-1">
                  <DateInputWithToday
                    value={payCalcForm.expectedPaymentDate}
                    onChange={(val) =>
                      setPayCalcForm({ ...payCalcForm, expectedPaymentDate: val })
                    }
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700">
                  Actual Vacation Pay Received in Bank (SAR — Optional for Comparison)
                </label>
                <NumericInput
                  value={payCalcForm.actualVacationPayReceived}
                  onValueChange={(val) =>
                    setPayCalcForm({ ...payCalcForm, actualVacationPayReceived: val })
                  }
                  min={0}
                  placeholder="Leave blank if not yet paid"
                  ariaLabel="Actual Vacation Pay Received"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
            </div>

            {payCalcError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium"
              >
                {payCalcError}
              </div>
            )}

            <button
              type="button"
              disabled={isSavingPayCalc}
              onClick={handleSaveVacationPayRecord}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold text-xs"
            >
              {isSavingPayCalc
                ? 'Saving...'
                : payCalcForm.id
                  ? 'Update Vacation Pay Calculation Record'
                  : 'Save Vacation Pay Calculation Record'}
            </button>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4">
              <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                {liveVacationPayResult.legalCitation}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-800 border border-slate-700">
                  <div className="text-xs text-slate-400">Eligible Monthly Base</div>
                  <div className="text-xl font-bold font-mono mt-0.5">
                    SAR {liveVacationPayResult.eligibleMonthlyBase.toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-800 border border-slate-700">
                  <div className="text-xs text-slate-400">Daily Leave Salary Rate</div>
                  <div className="text-xl font-bold font-mono text-emerald-300 mt-0.5">
                    SAR {liveVacationPayResult.dailyLeaveSalaryRate.toFixed(2)} / day
                  </div>
                </div>
                <div className="col-span-2 p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40">
                  <div className="text-xs text-emerald-300">Estimated Gross Vacation Pay</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5">
                    SAR {liveVacationPayResult.estimatedGrossVacationPay.toLocaleString()}
                  </div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    {liveVacationPayResult.formula}
                  </div>
                </div>
              </div>

              {liveVacationPayResult.varianceAmount !== undefined && (
                <div className="p-3.5 rounded-xl bg-slate-800 border border-slate-700 flex justify-between items-center text-xs">
                  <span>Actual Received vs. Estimated Variance:</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      liveVacationPayResult.varianceAmount < 0
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    SAR {liveVacationPayResult.varianceAmount.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="text-[11px] text-slate-300 space-y-1">
                {liveVacationPayResult.assumptions.map((a, i) => (
                  <div key={i}>• {a}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
