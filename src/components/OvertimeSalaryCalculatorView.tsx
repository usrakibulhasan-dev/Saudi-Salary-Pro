import React, { useId, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calculator,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  History,
  Info,
  Layers,
  Minus,
  Percent,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  calculateOvertimeSalaryComparison,
  decimalToHoursAndMinutes,
  hoursAndMinutesToDecimal,
  roundCurrency,
} from '../engine/calculations.ts';
import { useTheme } from '../theme/ThemeContext.tsx';
import type { CollectionName } from '../storage/db.ts';
import type {
  OvertimeDeductionItem,
  SavedOvertimeCalculationRecord,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';
import { NumericInput } from './FormInputs.tsx';

interface OvertimeSalaryCalculatorViewProps {
  slice: UserPrivateDatabaseSlice;
  onSaveRecord: <T extends { id: string; userId: string }>(
    collection: CollectionName,
    record: Omit<T, 'id' | 'userId'> & { id?: string; userId?: string },
  ) => Promise<T>;
  onDeleteRecord: (collection: CollectionName, id: string) => Promise<void>;
  notify: (text: string, type?: 'success' | 'warning' | 'info') => void;
}

export const OvertimeSalaryCalculatorView: React.FC<OvertimeSalaryCalculatorViewProps> = ({
  slice,
  onSaveRecord,
  onDeleteRecord,
  notify,
}) => {
  const { isDark } = useTheme();

  // Active employment profile data for 1-click loading
  const currentEmp =
    slice.employments.find((e) => e.isCurrent) || slice.employments[slice.employments.length - 1];

  // Base salary inputs (defaults based on user request: Basic 2,050, Food 200)
  const [basicSalary, setBasicSalary] = useState<number>(2050);
  const [foodAllowance, setFoodAllowance] = useState<number>(200);
  const [housingAllowance, setHousingAllowance] = useState<number>(0);
  const [transportAllowance, setTransportAllowance] = useState<number>(0);
  const [otherAllowances, setOtherAllowances] = useState<number>(0);
  const [dailyWorkingHours, setDailyWorkingHours] = useState<number>(8);
  const [monthlyHoursDivisor, setMonthlyHoursDivisor] = useState<number>(240);

  // Overtime hours input mode
  const [timeInputMode, setTimeInputMode] = useState<'decimal' | 'hours_minutes'>('decimal');
  const [totalOtHoursDecimal, setTotalOtHoursDecimal] = useState<number>(44.5);
  const [hoursInput, setHoursInput] = useState<number>(44);
  const [minutesInput, setMinutesInput] = useState<number>(30);

  // Breakdown toggle & inputs
  const [useDetailedBreakdown, setUseDetailedBreakdown] = useState<boolean>(false);
  const [regularOtHours, setRegularOtHours] = useState<number>(44.5);
  const [restDayOtHours, setRestDayOtHours] = useState<number>(0);
  const [holidayOtHours, setHolidayOtHours] = useState<number>(0);

  // Method B Company Configuration
  const [companyFormulaType, setCompanyFormulaType] = useState<
    'basic_1_5' | 'total_1_5' | 'basic_custom' | 'fixed_hourly'
  >('basic_1_5');
  const [companyMultiplier, setCompanyMultiplier] = useState<number>(1.5);
  const [companyFixedHourlyRate, setCompanyFixedHourlyRate] = useState<number>(10);
  const [companyDivisorOverride, setCompanyDivisorOverride] = useState<number>(240);
  const [isCompanyFormulaVerified, setIsCompanyFormulaVerified] = useState<boolean>(false);

  // Deductions list
  const [deductions, setDeductions] = useState<OvertimeDeductionItem[]>([
    {
      id: 'ded-1',
      description: 'GOSI Employee Share (Basic+Housing 9.75%)',
      amount: 0,
      appliesTo: 'total_salary',
    },
  ]);

  // Saving state
  const [calcTitle, setCalcTitle] = useState<string>('Overtime Check - ' + new Date().toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }));
  const [calcNotes, setCalcNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showSavedDrawer, setShowSavedDrawer] = useState<boolean>(false);
  const [showFormulaModal, setShowFormulaModal] = useState<boolean>(false);

  // Accessible unique IDs for form controls
  const basicSalaryInputId = useId();
  const foodAllowanceInputId = useId();
  const housingAllowanceInputId = useId();
  const transportAllowanceInputId = useId();
  const otherAllowancesInputId = useId();
  const dailyHoursInputId = useId();
  const monthlyDivisorInputId = useId();
  const otDecimalInputId = useId();
  const otHoursPartInputId = useId();
  const otMinutesPartInputId = useId();
  const regularOtInputId = useId();
  const restDayOtInputId = useId();
  const holidayOtInputId = useId();
  const companyFormulaSelectId = useId();
  const companyDivisorInputId = useId();
  const customMultiplierInputId = useId();
  const fixedRateInputId = useId();

  // Effective overtime hours derived from mode
  const effectiveTotalOt = useDetailedBreakdown
    ? roundCurrency(regularOtHours + restDayOtHours + holidayOtHours)
    : timeInputMode === 'decimal'
      ? totalOtHoursDecimal
      : hoursAndMinutesToDecimal(hoursInput, minutesInput);

  const effectiveRegular = useDetailedBreakdown ? regularOtHours : effectiveTotalOt;
  const effectiveRestDay = useDetailedBreakdown ? restDayOtHours : 0;
  const effectiveHoliday = useDetailedBreakdown ? holidayOtHours : 0;

  // Real-time calculation engine execution
  const calcResult = calculateOvertimeSalaryComparison({
    basicSalary,
    foodAllowance,
    housingAllowance,
    transportAllowance,
    otherAllowances,
    dailyWorkingHours,
    monthlyHoursDivisorOverride: monthlyHoursDivisor,
    regularOtHours: effectiveRegular,
    restDayOtHours: effectiveRestDay,
    holidayOtHours: effectiveHoliday,
    companyFormulaType,
    companyMultiplier,
    companyFixedHourlyRate,
    companyDivisorOverride,
    deductions,
  });

  // Handlers for synchronizing time entry
  const handleDecimalChange = (val: number | undefined) => {
    const num = Math.max(0, val || 0);
    setTotalOtHoursDecimal(num);
    const { hours, minutes } = decimalToHoursAndMinutes(num);
    setHoursInput(hours);
    setMinutesInput(minutes);
    if (!useDetailedBreakdown) {
      setRegularOtHours(num);
    }
  };

  const handleHoursMinutesChange = (newHours: number, newMinutes: number) => {
    const safeH = Math.max(0, newHours);
    const safeM = Math.max(0, Math.min(59, newMinutes));
    setHoursInput(safeH);
    setMinutesInput(safeM);
    const decimal = hoursAndMinutesToDecimal(safeH, safeM);
    setTotalOtHoursDecimal(decimal);
    if (!useDetailedBreakdown) {
      setRegularOtHours(decimal);
    }
  };

  const applyPresetHours = (hours: number) => {
    handleDecimalChange(hours);
    notify(`Applied preset: ${hours} overtime hours`, 'info');
  };

  // 1-Click Load from User's Active Profile / Contract
  const handleLoadFromProfile = () => {
    if (!currentEmp) {
      notify('No active employment contract found in profile.', 'warning');
      return;
    }
    const latestVersion = slice.salaryVersions
      .filter((v) => v.employmentId === currentEmp.id)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

    if (latestVersion) {
      setBasicSalary(latestVersion.basicSalary);
      setFoodAllowance(latestVersion.foodAllowance || 0);
      setHousingAllowance(latestVersion.housingAllowance || 0);
      setTransportAllowance(latestVersion.transportAllowance || 0);
      setOtherAllowances(latestVersion.otherFixedAllowances || 0);
      notify(
        `Loaded salary figures from active contract (${currentEmp.employerName}): Basic SAR ${latestVersion.basicSalary.toLocaleString()}, Food SAR ${(latestVersion.foodAllowance || 0).toLocaleString()}`,
        'success',
      );
    } else {
      notify('Contract found, but no salary version record attached.', 'warning');
    }
  };

  // Reset to default sample values (Basic 2,050, Food 200, 44.5h)
  const handleResetDefaults = () => {
    setBasicSalary(2050);
    setFoodAllowance(200);
    setHousingAllowance(0);
    setTransportAllowance(0);
    setOtherAllowances(0);
    setDailyWorkingHours(8);
    setMonthlyHoursDivisor(240);
    setTimeInputMode('decimal');
    setTotalOtHoursDecimal(44.5);
    setHoursInput(44);
    setMinutesInput(30);
    setUseDetailedBreakdown(false);
    setRegularOtHours(44.5);
    setRestDayOtHours(0);
    setHolidayOtHours(0);
    setCompanyFormulaType('basic_1_5');
    setCompanyMultiplier(1.5);
    setCompanyFixedHourlyRate(10);
    setCompanyDivisorOverride(240);
    setIsCompanyFormulaVerified(false);
    setDeductions([
      {
        id: 'ded-1',
        description: 'GOSI Employee Share (Basic+Housing 9.75%)',
        amount: 0,
        appliesTo: 'total_salary',
      },
    ]);
    notify('Reset calculator to default benchmark parameters (Basic SAR 2,050, Food SAR 200, 44.5 hrs).', 'info');
  };

  // Add / remove deduction item
  const handleAddDeduction = (presetType?: string) => {
    const id = `ded-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    let defaultDesc = 'Other Deduction';
    let defaultAmount = 0;
    let defaultApplies: 'overtime_only' | 'total_salary' = 'total_salary';

    if (presetType === 'gosi') {
      defaultDesc = 'GOSI Employee Share (9.75% Basic+Housing)';
      defaultAmount = roundCurrency((basicSalary + housingAllowance) * 0.0975);
      defaultApplies = 'total_salary';
    } else if (presetType === 'loan') {
      defaultDesc = 'Company Loan Monthly Installment';
      defaultAmount = 250;
      defaultApplies = 'total_salary';
    } else if (presetType === 'advance') {
      defaultDesc = 'Mid-month Salary Advance Recovery';
      defaultAmount = 300;
      defaultApplies = 'total_salary';
    } else if (presetType === 'ot_penalty') {
      defaultDesc = 'Overtime Absence / Late Penalty';
      defaultAmount = 50;
      defaultApplies = 'overtime_only';
    }

    setDeductions((prev) => [
      ...prev,
      {
        id,
        description: defaultDesc,
        amount: defaultAmount,
        appliesTo: defaultApplies,
      },
    ]);
  };

  const handleUpdateDeduction = (
    id: string,
    field: keyof OvertimeDeductionItem,
    value: string | number,
  ) => {
    setDeductions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    );
  };

  const handleRemoveDeduction = (id: string) => {
    setDeductions((prev) => prev.filter((d) => d.id !== id));
  };

  // Save calculation to user's private database slice
  const handleSaveCalculation = async () => {
    if (!calcTitle.trim()) {
      notify('Please enter a calculation title before saving.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const record: Omit<SavedOvertimeCalculationRecord, 'id' | 'userId'> = {
        title: calcTitle.trim(),
        calculationDate: new Date().toISOString().split('T')[0],
        basicSalary,
        foodAllowance,
        housingAllowance,
        transportAllowance,
        otherAllowances,
        totalMonthlySalary: calcResult.totalMonthlySalary,
        dailyWorkingHours,
        monthlyHoursDivisor: calcResult.effectiveDivisor,
        regularOtHours: effectiveRegular,
        restDayOtHours: effectiveRestDay,
        holidayOtHours: effectiveHoliday,
        totalOtHours: calcResult.totalOtHours,
        otHoursInputMode: timeInputMode,
        rawHours: hoursInput,
        rawMinutes: minutesInput,
        laborLawHourlyBasic: calcResult.laborLawHourlyBasic,
        laborLawHourlyActual: calcResult.laborLawHourlyActual,
        laborLawOtRate: calcResult.laborLawOtRate,
        laborLawRestDayRate: calcResult.laborLawOtRate,
        laborLawGrossOt: calcResult.laborLawGrossOt,
        laborLawNetOt: calcResult.laborLawNetOt,
        laborLawFinalSalary: calcResult.laborLawFinalSalary,
        companyFormulaType,
        companyMultiplier,
        companyFixedHourlyRate,
        companyOtRate: calcResult.companyOtRate,
        companyGrossOt: calcResult.companyGrossOt,
        companyNetOt: calcResult.companyNetOt,
        companyFinalSalary: calcResult.companyFinalSalary,
        isCompanyFormulaVerified,
        deductions,
        totalOtDeductions: calcResult.totalOtDeductions,
        totalSalaryDeductions: calcResult.totalSalaryDeductions,
        totalAllDeductions: calcResult.totalAllDeductions,
        varianceGross: calcResult.varianceGross,
        varianceNet: calcResult.varianceNet,
        notes: calcNotes.trim(),
        createdAt: new Date().toISOString(),
      };

      await onSaveRecord('overtimeCalculations', record);
      notify(`Calculation "${calcTitle}" saved successfully to your private account.`, 'success');
    } catch {
      notify('Failed to save calculation record. Please try again.', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  // Load a previously saved calculation into the active workspace
  const handleLoadSavedRecord = (rec: SavedOvertimeCalculationRecord) => {
    setBasicSalary(rec.basicSalary);
    setFoodAllowance(rec.foodAllowance || 0);
    setHousingAllowance(rec.housingAllowance || 0);
    setTransportAllowance(rec.transportAllowance || 0);
    setOtherAllowances(rec.otherAllowances || 0);
    setDailyWorkingHours(rec.dailyWorkingHours || 8);
    setMonthlyHoursDivisor(rec.monthlyHoursDivisor || 240);
    setTimeInputMode(rec.otHoursInputMode || 'decimal');
    setTotalOtHoursDecimal(rec.totalOtHours);
    setHoursInput(rec.rawHours || Math.floor(rec.totalOtHours));
    setMinutesInput(rec.rawMinutes || Math.round((rec.totalOtHours - Math.floor(rec.totalOtHours)) * 60));
    setRegularOtHours(rec.regularOtHours);
    setRestDayOtHours(rec.restDayOtHours || 0);
    setHolidayOtHours(rec.holidayOtHours || 0);
    setUseDetailedBreakdown((rec.restDayOtHours || 0) > 0 || (rec.holidayOtHours || 0) > 0);
    setCompanyFormulaType(rec.companyFormulaType || 'basic_1_5');
    setCompanyMultiplier(rec.companyMultiplier || 1.5);
    setCompanyFixedHourlyRate(rec.companyFixedHourlyRate || 10);
    setIsCompanyFormulaVerified(Boolean(rec.isCompanyFormulaVerified));
    setDeductions(rec.deductions || []);
    setCalcTitle(rec.title);
    setCalcNotes(rec.notes || '');
    setShowSavedDrawer(false);
    notify(`Loaded calculation "${rec.title}" into calculator.`, 'success');
  };

  // Delete saved calculation
  const handleDeleteSavedRecord = async (id: string, title: string) => {
    if (!window.confirm(`Delete saved calculation "${title}"?`)) return;
    try {
      await onDeleteRecord('overtimeCalculations', id);
      notify(`Deleted "${title}".`, 'info');
    } catch {
      notify('Failed to delete calculation.', 'warning');
    }
  };

  const savedList = slice.overtimeCalculations || [];

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Controls */}
      <div
        className={`${
          isDark
            ? 'bg-gradient-to-r from-[#131B2E] via-[#16223B] to-[#122926] border-slate-800'
            : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-emerald-200/80'
        } border rounded-3xl p-6 shadow-sm`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md ring-2 ring-emerald-500/20">
                <Calculator className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Overtime Salary Calculator
              </h2>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Labor Law Art. 107 Standard
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              Independent calculation & verification engine for expatriates in Saudi Arabia. Compare statutory Labor Law overtime entitlements against your employer's payslip formula.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLoadFromProfile}
              className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
              title="Pre-fill Basic and Allowances from your active contract"
            >
              <UserCheck className="w-3.5 h-3.5 text-teal-500" />
              <span>Load My Profile</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
              }`}
              title="Reset to benchmark defaults: Basic SAR 2,050, Food SAR 200, 44.5h"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSavedDrawer(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>Saved Records ({savedList.length})</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className={`p-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
              }`}
              title="Print or Save PDF Summary"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Side-by-Side Comparison & Variance Banner */}
      <section className="space-y-4">
        {/* Discrepancy / Underpayment Highlight Banner */}
        <div
          className={`p-5 rounded-3xl border transition-all shadow-sm ${
            calcResult.isUnderpaid
              ? isDark
                ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                : 'bg-rose-50 border-rose-300 text-rose-900'
              : isDark
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`p-2.5 rounded-2xl shrink-0 ${
                  calcResult.isUnderpaid
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {calcResult.isUnderpaid ? (
                  <ShieldAlert className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black tracking-tight">
                    {calcResult.isUnderpaid
                      ? `Potential Underpayment Discrepancy: SAR ${calcResult.varianceGross.toFixed(2)} (${calcResult.variancePercentage.toFixed(1)}%)`
                      : calcResult.hasDiscrepancy
                        ? `Company Payslip Exceeds Statutory Minimum by SAR ${Math.abs(calcResult.varianceGross).toFixed(2)}`
                        : 'Company Method Matches Statutory Minimum Exactly'}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      calcResult.isUnderpaid
                        ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                        : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                    }`}
                  >
                    {calcResult.isUnderpaid ? 'Shortfall Detected' : 'Compliant / Surplus'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm opacity-90 max-w-3xl leading-relaxed">
                  {calcResult.isUnderpaid ? (
                    <>
                      Under Saudi Labor Law Article 107, statutory overtime includes 100% of Actual Hourly Wage + 50% of Basic Hourly Wage. Because your employer's payslip method computes overtime on Basic Wage only (or uses a reduced multiplier), you receive <strong>SAR {calcResult.companyGrossOt.toFixed(2)}</strong> instead of the statutory minimum <strong>SAR {calcResult.laborLawGrossOt.toFixed(2)}</strong> for {calcResult.totalOtHours} overtime hours.
                    </>
                  ) : (
                    <>
                      Your company's current calculation formula pays <strong>SAR {calcResult.companyGrossOt.toFixed(2)}</strong>, which meets or exceeds the statutory requirement of <strong>SAR {calcResult.laborLawGrossOt.toFixed(2)}</strong> under Article 107.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end justify-center pl-4 border-l border-current/15">
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-75">
                Hourly Rate Variance
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono">
                {calcResult.hourlyRateDiff > 0 ? `+SAR ${calcResult.hourlyRateDiff.toFixed(2)}/hr` : `SAR ${calcResult.hourlyRateDiff.toFixed(2)}/hr`}
              </div>
              <span className="text-[10px] opacity-75">Labor Law vs Company</span>
            </div>
          </div>
        </div>

        {/* 4 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Statutory Overtime Gross */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Method A: Labor Law (Art. 107)
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              SAR {calcResult.laborLawGrossOt.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Hourly Rate:</span>
              <strong className="font-mono text-slate-700 dark:text-slate-200">
                SAR {calcResult.laborLawOtRate.toFixed(4)}/hr
              </strong>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              For {calcResult.totalOtHours} hours worked
            </div>
          </div>

          {/* Card 2: Company Payslip Gross */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Method B: Company Payslip
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-semibold">
                {isCompanyFormulaVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
              SAR {calcResult.companyGrossOt.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Company Rate:</span>
              <strong className="font-mono text-slate-700 dark:text-slate-200">
                SAR {calcResult.companyOtRate.toFixed(4)}/hr
              </strong>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              {calcResult.formulaExplanationCompany}
            </div>
          </div>

          {/* Card 3: Net Overtime Pay */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Net Overtime Payout
              </span>
              <Coins className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
              SAR {calcResult.laborLawNetOt.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>OT Deductions:</span>
              <strong className="font-mono text-rose-500">
                -SAR {calcResult.totalOtDeductions.toFixed(2)}
              </strong>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              Company Net OT: SAR {calcResult.companyNetOt.toFixed(2)}
            </div>
          </div>

          {/* Card 4: Total Take-Home Monthly Salary */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                Total Monthly Take-Home
              </span>
              <DollarSign className="w-4 h-4 text-teal-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-teal-600 dark:text-teal-400 tabular-nums">
              SAR {calcResult.laborLawFinalSalary.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>All Deductions:</span>
              <strong className="font-mono text-rose-500">
                -SAR {calcResult.totalAllDeductions.toFixed(2)}
              </strong>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              Company Final: SAR {calcResult.companyFinalSalary.toFixed(2)}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main Data-Entry Workspace (Dual Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 Cols): Salary Components & Overtime Time Entry */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section A: Monthly Salary Components */}
          <div
            className={`p-6 rounded-3xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-4`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    1. Salary Structure & Working Hours
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Define monthly fixed components used to compute statutory hourly rates
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Actual Wage</span>
                <div className="text-sm font-black font-mono text-blue-600 dark:text-blue-400">
                  SAR {calcResult.totalMonthlySalary.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={basicSalaryInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Basic Monthly Salary (SAR) *
                </label>
                <NumericInput
                  id={basicSalaryInputId}
                  value={basicSalary}
                  onChange={(val) => setBasicSalary(val)}
                  min={0}
                  step={50}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-mono font-bold ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                  placeholder="2050"
                />
                <span className="text-[10px] text-slate-400">Default benchmark: SAR 2,050</span>
              </div>

              <div>
                <label htmlFor={foodAllowanceInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Food Allowance (SAR)
                </label>
                <NumericInput
                  id={foodAllowanceInputId}
                  value={foodAllowance}
                  onChange={(val) => setFoodAllowance(val)}
                  min={0}
                  step={25}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                  placeholder="200"
                />
                <span className="text-[10px] text-slate-400">Included in Actual Wage (Art. 107)</span>
              </div>

              <div>
                <label htmlFor={housingAllowanceInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Housing Allowance (SAR)
                </label>
                <NumericInput
                  id={housingAllowanceInputId}
                  value={housingAllowance}
                  onChange={(val) => setHousingAllowance(val)}
                  min={0}
                  step={50}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor={transportAllowanceInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Transportation Allowance (SAR)
                </label>
                <NumericInput
                  id={transportAllowanceInputId}
                  value={transportAllowance}
                  onChange={(val) => setTransportAllowance(val)}
                  min={0}
                  step={25}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor={otherAllowancesInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Other Fixed Allowances (SAR)
                </label>
                <NumericInput
                  id={otherAllowancesInputId}
                  value={otherAllowances}
                  onChange={(val) => setOtherAllowances(val)}
                  min={0}
                  step={25}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                  placeholder="0"
                />
              </div>

              <div>
                <label htmlFor={dailyHoursInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Daily Working Hours (hrs/day)
                </label>
                <NumericInput
                  id={dailyHoursInputId}
                  value={dailyWorkingHours}
                  onChange={(val) => {
                    const h = Math.max(1, val);
                    setDailyWorkingHours(h);
                    setMonthlyHoursDivisor(h * 30);
                  }}
                  min={4}
                  max={12}
                  step={1}
                  className={`w-full px-3 py-2 rounded-xl border text-sm font-mono ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                  placeholder="8"
                />
                <span className="text-[10px] text-slate-400">Standard: 8h/day (Ramadan: 6h/day)</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                <span>Monthly Divisor:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {monthlyHoursDivisor} hours (30 days × {dailyWorkingHours}h)
                </span>
              </div>
              <div className="text-[11px] font-mono">
                Basic Rate: <strong>SAR {calcResult.laborLawHourlyBasic.toFixed(4)}/hr</strong>
              </div>
            </div>
          </div>

          {/* Section B: Manual Overtime Entry */}
          <div
            className={`p-6 rounded-3xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-4`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    2. Overtime Hours & Entry Mode
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Supports decimal hours, hours + minutes (44h 30m = 44.5h), and breakdown
                  </p>
                </div>
              </div>

              {/* Mode switch */}
              <div
                className={`flex items-center p-0.5 rounded-xl border ${
                  isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setTimeInputMode('decimal')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    timeInputMode === 'decimal'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Decimal (44.5h)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeInputMode('hours_minutes')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    timeInputMode === 'hours_minutes'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Hours : Minutes (44h 30m)
                </button>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div>
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Quick Preset Hours:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {[10, 20, 30, 44.5, 60].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPresetHours(preset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                      Math.abs(calcResult.totalOtHours - preset) < 0.01
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : isDark
                          ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                          : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    }`}
                  >
                    {preset === 44.5 ? '44.5h (44h 30m)' : `${preset}h`}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs based on mode */}
            {timeInputMode === 'decimal' ? (
              <div>
                <label htmlFor={otDecimalInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Total Overtime Decimal Hours
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <NumericInput
                      id={otDecimalInputId}
                      value={totalOtHoursDecimal}
                      onChange={handleDecimalChange}
                      min={0}
                      step={0.5}
                      className={`w-full px-3 py-2.5 rounded-xl border text-base font-mono font-black ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-amber-400 focus:border-amber-500'
                          : 'bg-slate-50 border-slate-300 text-amber-600 focus:border-amber-500'
                      }`}
                      placeholder="44.5"
                    />
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    = <strong>{hoursInput}h {minutesInput}m</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Overtime in Hours and Minutes (Strict Mathematical Conversion)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={otHoursPartInputId} className="block text-[11px] text-slate-400 mb-1">Hours</label>
                    <NumericInput
                      id={otHoursPartInputId}
                      value={hoursInput}
                      onChange={(h) => handleHoursMinutesChange(h, minutesInput)}
                      min={0}
                      step={1}
                      className={`w-full px-3 py-2 rounded-xl border text-sm font-mono font-bold ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                      placeholder="44"
                    />
                  </div>
                  <div>
                    <label htmlFor={otMinutesPartInputId} className="block text-[11px] text-slate-400 mb-1">Minutes (0 - 59)</label>
                    <NumericInput
                      id={otMinutesPartInputId}
                      value={minutesInput}
                      onChange={(m) => handleHoursMinutesChange(hoursInput, m)}
                      min={0}
                      max={59}
                      step={15}
                      className={`w-full px-3 py-2 rounded-xl border text-sm font-mono font-bold ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                      placeholder="30"
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  Strictly parsed as <strong>{calcResult.totalOtHours} decimal hours</strong> (never 44.30)
                </div>
              </div>
            )}

            {/* Optional Detailed Breakdown Accordion */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="breakdownToggle"
                    checked={useDetailedBreakdown}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setUseDetailedBreakdown(enabled);
                      if (enabled) {
                        setRegularOtHours(totalOtHoursDecimal);
                        setRestDayOtHours(0);
                        setHolidayOtHours(0);
                      }
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label
                    htmlFor="breakdownToggle"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Specify Overtime Breakdown (Regular Days, Weekly Rest Days, Public Holidays)
                  </label>
                </div>
              </div>

              {useDetailedBreakdown && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60">
                  <div>
                    <label htmlFor={regularOtInputId} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Regular Working Days (hrs)
                    </label>
                    <NumericInput
                      id={regularOtInputId}
                      value={regularOtHours}
                      onChange={(v) => setRegularOtHours(Math.max(0, v))}
                      min={0}
                      step={0.5}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-400">SAR {calcResult.laborLawRegularOtPay.toFixed(2)}</span>
                  </div>

                  <div>
                    <label htmlFor={restDayOtInputId} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Weekly Rest Days (hrs)
                    </label>
                    <NumericInput
                      id={restDayOtInputId}
                      value={restDayOtHours}
                      onChange={(v) => setRestDayOtHours(Math.max(0, v))}
                      min={0}
                      step={0.5}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Friday / Saturday work</span>
                  </div>

                  <div>
                    <label htmlFor={holidayOtInputId} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Official Holidays (hrs)
                    </label>
                    <NumericInput
                      id={holidayOtInputId}
                      value={holidayOtHours}
                      onChange={(v) => setHolidayOtHours(Math.max(0, v))}
                      min={0}
                      step={0.5}
                      className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Eid, National Day</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (5 Cols): Method B Company Configuration & Deductions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Section C: Method B Company Payslip Configuration */}
          <div
            className={`p-6 rounded-3xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-4`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    3. Company Payslip Method Config
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Configure your employer's actual payslip formula
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <button
                type="button"
                onClick={() => setIsCompanyFormulaVerified(!isCompanyFormulaVerified)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                  isCompanyFormulaVerified
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700'
                    : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700'
                }`}
                title="Click to toggle verified status with your actual payslip"
              >
                {isCompanyFormulaVerified ? '✓ Verified by User' : '⚠ Unverified / Editable'}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor={companyFormulaSelectId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Employer Overtime Formula
                </label>
                <select
                  id={companyFormulaSelectId}
                  value={companyFormulaType}
                  onChange={(e) =>
                    setCompanyFormulaType(
                      e.target.value as 'basic_1_5' | 'total_1_5' | 'basic_custom' | 'fixed_hourly',
                    )
                  }
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  } focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer`}
                >
                  <option value="basic_1_5">Basic Salary × 1.50 (Common: Basic ÷ 240 × 1.5)</option>
                  <option value="total_1_5">Total Salary × 1.50 (Total Wage ÷ 240 × 1.5)</option>
                  <option value="basic_custom">Custom Multiplier (e.g. 1.25x, 1.75x, 2.0x)</option>
                  <option value="fixed_hourly">Flat Rate per Hour (SAR/hr)</option>
                </select>
              </div>

              {/* Conditional parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={companyDivisorInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Company Divisor (hrs)
                  </label>
                  <NumericInput
                    id={companyDivisorInputId}
                    value={companyDivisorOverride}
                    onChange={(val) => setCompanyDivisorOverride(Math.max(1, val))}
                    min={150}
                    max={300}
                    step={8}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                    placeholder="240"
                  />
                  <span className="text-[10px] text-slate-400">Default: 240 hrs (or 208)</span>
                </div>

                {companyFormulaType === 'basic_custom' && (
                  <div>
                    <label htmlFor={customMultiplierInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Multiplier (x)
                    </label>
                    <NumericInput
                      id={customMultiplierInputId}
                      value={companyMultiplier}
                      onChange={(val) => setCompanyMultiplier(Math.max(0.5, val))}
                      min={0.5}
                      max={3.0}
                      step={0.25}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                      placeholder="1.5"
                    />
                  </div>
                )}

                {companyFormulaType === 'fixed_hourly' && (
                  <div>
                    <label htmlFor={fixedRateInputId} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Fixed Rate (SAR/hr)
                    </label>
                    <NumericInput
                      id={fixedRateInputId}
                      value={companyFixedHourlyRate}
                      onChange={(val) => setCompanyFixedHourlyRate(Math.max(0, val))}
                      min={0}
                      step={1}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold ${
                        isDark
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                      placeholder="10"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40 text-[11px] text-purple-900 dark:text-purple-200">
                Effective Rate: <strong>SAR {calcResult.companyOtRate.toFixed(4)}/hr</strong>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {calcResult.formulaExplanationCompany}
                </div>
              </div>
            </div>
          </div>

          {/* Section D: Deductions Manager */}
          <div
            className={`p-6 rounded-3xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
            } shadow-xs space-y-4`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Minus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    4. Deductions (OT vs Total Salary)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Apply deductions to Overtime Only or Combined Salary
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Deductions</span>
                <div className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">
                  SAR {calcResult.totalAllDeductions.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Quick Preset Buttons for Deductions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleAddDeduction('gosi')}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                + GOSI (9.75%)
              </button>
              <button
                type="button"
                onClick={() => handleAddDeduction('loan')}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                + Loan
              </button>
              <button
                type="button"
                onClick={() => handleAddDeduction('advance')}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                + Advance
              </button>
              <button
                type="button"
                onClick={() => handleAddDeduction('ot_penalty')}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 transition cursor-pointer"
              >
                + OT Penalty
              </button>
            </div>

            {/* Dynamic Deductions List */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {deductions.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400 italic">
                  No deductions configured. Click a preset button above to add GOSI or loans.
                </div>
              ) : (
                deductions.map((d) => (
                  <div
                    key={d.id}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                      isDark ? 'bg-slate-900/80 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={d.description}
                        onChange={(e) => handleUpdateDeduction(d.id, 'description', e.target.value)}
                        className="w-full bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none"
                        placeholder="Description"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <select
                          value={d.appliesTo}
                          onChange={(e) =>
                            handleUpdateDeduction(
                              d.id,
                              'appliesTo',
                              e.target.value as 'overtime_only' | 'total_salary',
                            )
                          }
                          className="text-[10px] bg-transparent text-slate-500 dark:text-slate-400 cursor-pointer focus:outline-none font-semibold"
                        >
                          <option value="total_salary">From Total Salary</option>
                          <option value="overtime_only">From Overtime Only</option>
                        </select>
                      </div>
                    </div>

                    <div className="w-24 shrink-0">
                      <NumericInput
                        value={d.amount}
                        onChange={(val) => handleUpdateDeduction(d.id, 'amount', val)}
                        min={0}
                        step={10}
                        className="w-full px-2 py-1 rounded-lg border text-xs font-mono font-bold text-right"
                        placeholder="0"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveDeduction(d.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer"
                      title="Remove deduction"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Detailed Side-by-Side Comparison Table */}
      <section
        className={`p-6 rounded-3xl border ${
          isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs space-y-4`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              Side-by-Side Verification Table (Statutory vs Company)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit line-by-line variances between Saudi Labor Law standards and employer payslip practices
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFormulaModal(true)}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>View Full Legal Formula Breakdown</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr
                className={`border-b ${
                  isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
                } uppercase tracking-wider text-[10px] font-bold`}
              >
                <th className="py-3 px-4">Financial Metric / Component</th>
                <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                  Method A: Labor Law (Art. 107)
                </th>
                <th className="py-3 px-4 text-amber-600 dark:text-amber-400">
                  Method B: Company Payslip
                </th>
                <th className="py-3 px-4 text-right">Variance / Discrepancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-200">
                  Base Wage Basis
                </td>
                <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold">
                  SAR {calcResult.totalMonthlySalary.toFixed(2)} (Actual Wage)
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  SAR {companyFormulaType === 'total_1_5' ? calcResult.totalMonthlySalary.toFixed(2) : basicSalary.toFixed(2)} ({companyFormulaType === 'total_1_5' ? 'Total' : 'Basic'})
                </td>
                <td className="py-2.5 px-4 text-right text-slate-500 font-sans">
                  {companyFormulaType === 'total_1_5' ? 'Same Basis' : `Excludes Allowances (SAR ${(calcResult.totalMonthlySalary - basicSalary).toFixed(2)})`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-200">
                  Monthly Hours Divisor
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  {calcResult.effectiveDivisor} hours
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  {calcResult.companyDivisor} hours
                </td>
                <td className="py-2.5 px-4 text-right text-slate-500 font-sans">
                  {calcResult.effectiveDivisor === calcResult.companyDivisor ? 'Matched (240h)' : `${calcResult.effectiveDivisor - calcResult.companyDivisor} hrs diff`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-200">
                  Base Hourly Wage
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  SAR {calcResult.laborLawHourlyActual.toFixed(4)}/hr (Actual)
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  SAR {(basicSalary / calcResult.companyDivisor).toFixed(4)}/hr (Basic)
                </td>
                <td className="py-2.5 px-4 text-right text-slate-500 font-sans">
                  +SAR {(calcResult.laborLawHourlyActual - basicSalary / calcResult.companyDivisor).toFixed(4)}/hr
                </td>
              </tr>
              <tr className="bg-slate-50/50 dark:bg-slate-900/40 font-bold">
                <td className="py-3 px-4 font-sans text-slate-900 dark:text-white">
                  Overtime Hourly Rate
                </td>
                <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 text-sm">
                  SAR {calcResult.laborLawOtRate.toFixed(4)}/hr
                </td>
                <td className="py-3 px-4 text-amber-600 dark:text-amber-400 text-sm">
                  SAR {calcResult.companyOtRate.toFixed(4)}/hr
                </td>
                <td
                  className={`py-3 px-4 text-right text-sm ${
                    calcResult.hourlyRateDiff > 0.01
                      ? 'text-rose-600 dark:text-rose-400'
                      : calcResult.hourlyRateDiff < -0.01
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400'
                  }`}
                >
                  {calcResult.hourlyRateDiff > 0 ? `+SAR ${calcResult.hourlyRateDiff.toFixed(4)}/hr` : `SAR ${calcResult.hourlyRateDiff.toFixed(4)}/hr`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-200">
                  Gross Overtime Earnings ({calcResult.totalOtHours}h)
                </td>
                <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                  SAR {calcResult.laborLawGrossOt.toFixed(2)}
                </td>
                <td className="py-2.5 px-4 text-amber-600 dark:text-amber-400 font-bold text-sm">
                  SAR {calcResult.companyGrossOt.toFixed(2)}
                </td>
                <td
                  className={`py-2.5 px-4 text-right font-bold text-sm ${
                    calcResult.varianceGross > 0.05
                      ? 'text-rose-600 dark:text-rose-400'
                      : calcResult.varianceGross < -0.05
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500'
                  }`}
                >
                  {calcResult.varianceGross > 0.05
                    ? `-SAR ${calcResult.varianceGross.toFixed(2)} (Underpaid)`
                    : calcResult.varianceGross < -0.05
                      ? `+SAR ${Math.abs(calcResult.varianceGross).toFixed(2)} (Surplus)`
                      : 'SAR 0.00 (Exact Match)'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-200">
                  Overtime-Specific Deductions
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  -SAR {calcResult.totalOtDeductions.toFixed(2)}
                </td>
                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                  -SAR {calcResult.totalOtDeductions.toFixed(2)}
                </td>
                <td className="py-2.5 px-4 text-right text-slate-500 font-sans">Identical</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-sans font-medium text-slate-800 dark:text-slate-200">
                  Net Overtime Payout
                </td>
                <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold">
                  SAR {calcResult.laborLawNetOt.toFixed(2)}
                </td>
                <td className="py-2.5 px-4 text-amber-600 dark:text-amber-400 font-bold">
                  SAR {calcResult.companyNetOt.toFixed(2)}
                </td>
                <td
                  className={`py-2.5 px-4 text-right font-bold ${
                    calcResult.varianceNet > 0.05
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {calcResult.varianceNet > 0.05 ? `-SAR ${calcResult.varianceNet.toFixed(2)}` : `SAR ${calcResult.varianceNet.toFixed(2)}`}
                </td>
              </tr>
              <tr className="bg-slate-50/80 dark:bg-slate-900/60 font-black">
                <td className="py-3 px-4 font-sans text-slate-900 dark:text-white">
                  Total Monthly Net Take-Home
                </td>
                <td className="py-3 px-4 text-teal-600 dark:text-teal-400 text-sm">
                  SAR {calcResult.laborLawFinalSalary.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm">
                  SAR {calcResult.companyFinalSalary.toFixed(2)}
                </td>
                <td
                  className={`py-3 px-4 text-right text-sm ${
                    calcResult.laborLawFinalSalary - calcResult.companyFinalSalary > 0.05
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {(calcResult.laborLawFinalSalary - calcResult.companyFinalSalary).toFixed(2)} SAR
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Save Calculation Card */}
      <section
        className={`p-6 rounded-3xl border ${
          isDark ? 'bg-[#131B2E] border-slate-800' : 'bg-white border-slate-200'
        } shadow-xs space-y-4`}
      >
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Save className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Save This Calculation Record
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Persist your manual overtime verification to your private account for future review or proof
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Record Title / Label *
            </label>
            <input
              type="text"
              value={calcTitle}
              onChange={(e) => setCalcTitle(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs font-medium ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-1 focus:ring-indigo-500`}
              placeholder="e.g. April 2026 Ramadan Overtime"
            />
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Private Notes (Optional)
            </label>
            <input
              type="text"
              value={calcNotes}
              onChange={(e) => setCalcNotes(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs font-medium ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-1 focus:ring-indigo-500`}
              placeholder="e.g. Discussed with HR; supervisor admitted basic formula"
            />
          </div>

          <div className="md:col-span-1 flex items-end">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveCalculation}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save to My Private Records</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 6. Saved Calculations Modal / Drawer */}
      {showSavedDrawer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-3xl rounded-3xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Saved Overtime Calculations</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {savedList.length} calculation records saved in your private database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSavedDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {savedList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Calculator className="w-10 h-10 mx-auto opacity-30" />
                  <p className="text-sm">No saved calculations yet.</p>
                  <p className="text-xs">
                    Calculate your overtime above and click &quot;Save to My Private Records&quot;.
                  </p>
                </div>
              ) : (
                savedList.map((rec) => (
                  <div
                    key={rec.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isDark
                        ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {rec.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {rec.calculationDate}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3 font-mono">
                        <span>Hours: <strong>{rec.totalOtHours}h</strong></span>
                        <span>Labor Law: <strong className="text-emerald-500">SAR {rec.laborLawGrossOt.toFixed(2)}</strong></span>
                        <span>Company: <strong className="text-amber-500">SAR {rec.companyGrossOt.toFixed(2)}</strong></span>
                        {rec.varianceGross > 0.05 && (
                          <span className="text-rose-500 font-bold">
                            Diff: -SAR {rec.varianceGross.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {rec.notes && (
                        <p className="text-[11px] text-slate-400 italic">
                          &quot;{rec.notes}&quot;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadSavedRecord(rec)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer"
                      >
                        Load into Calculator
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedRecord(rec.id, rec.title)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setShowSavedDrawer(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Legal Formula Breakdown Modal */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl rounded-3xl border ${
              isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            } shadow-2xl overflow-hidden flex flex-col max-h-[85vh]`}
          >
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold">Article 107 Statutory Overtime Formula</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60">
                <h4 className="font-bold text-indigo-900 dark:text-indigo-200 mb-1">
                  Saudi Labor Law Article 107 (Statutory Rule):
                </h4>
                <p className="text-xs">
                  &quot;The employer shall pay the worker for overtime hours an additional amount equal to the hourly wage plus 50% of his basic wage.&quot;
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Mathematical Interpretation by HRSD:
                </h4>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 font-mono text-xs space-y-1.5">
                  <div>1. Basic Hourly Wage = Basic Monthly Salary ÷ (30 × Daily Working Hours)</div>
                  <div>2. Actual Hourly Wage = (Basic + Fixed Allowances) ÷ (30 × Daily Working Hours)</div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                    3. Overtime Rate/hr = Actual Hourly Wage + 0.50 × Basic Hourly Wage
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Why many employers create a shortfall:
                </h4>
                <p className="text-xs">
                  Many payroll systems calculate overtime simply as <code>Basic Salary ÷ 240 × 1.5</code>. When an employee receives regular allowances (such as food, housing, or transport), this formula unlawfully excludes the allowance portion from the 100% actual hourly base, causing underpayment on every overtime hour.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Weekly Rest Days & Public Holidays:
                </h4>
                <p className="text-xs">
                  Under Article 107 and HRSD regulations, all hours worked during weekly rest days (Friday / Saturday) or official public holidays (Eid al-Fitr, Eid al-Adha, Saudi National Day, Founding Day) are deemed overtime hours and must be compensated at the full statutory rate.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
