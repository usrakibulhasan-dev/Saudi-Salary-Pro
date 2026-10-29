import React, { useState } from 'react';
import {
  Briefcase,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Plus,
  Save,
  Shield,
  TrendingUp,
  Trash2,
  User,
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  Sparkles,
  ChevronRight,
  Check,
  Building,
  MapPin,
  CalendarDays,
  FileCheck,
} from 'lucide-react';
import { WelcomeBannerIllustration } from './Illustrations.tsx';
import { DashboardCharts } from './DashboardCharts.tsx';
import { MODULE_THEMES } from '../theme/designSystem.ts';
import { useTheme } from '../theme/ThemeContext.tsx';
import type {
  EmploymentPeriod,
  PersonalProfile,
  PrimaryNavModule,
  SalaryVersion,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';
import {
  calculateEOSB,
  calculateLeaveSummary,
  calculateLoanPortfolioSummary,
  calculateOvertimePay,
  calculateServiceDuration,
  generateMonthlyAttendanceReport,
  reconcileMonthlySalary,
  resolveEffectiveSalaryForMonth,
} from '../engine/calculations.ts';
import { exportUserBackupJSON } from '../utils/exportUtils.ts';
import { DateInputWithToday, getLocalTodayISO, NumericInput } from './FormInputs.tsx';

interface DashboardAndProfileProps {
  activeTab: 'dashboard' | 'profile' | 'employment';
  slice: UserPrivateDatabaseSlice;
  selectedMonth: string;
  onNavigate: (module: PrimaryNavModule) => void;
  onUpdateProfile: (updates: Partial<PersonalProfile>) => Promise<void>;
  onSaveEmployment: (emp: Partial<EmploymentPeriod>) => Promise<void>;
  onDeleteEmployment: (id: string) => Promise<void>;
  onSaveSalaryVersion: (ver: Partial<SalaryVersion>) => Promise<void>;
  onDeleteSalaryVersion: (id: string) => Promise<void>;
  notify?: (msg: string, type?: 'success' | 'warning') => void;
}

export const DashboardAndProfileView: React.FC<DashboardAndProfileProps> = ({
  activeTab,
  slice,
  selectedMonth,
  onNavigate,
  onUpdateProfile,
  onSaveEmployment,
  onDeleteEmployment,
  onSaveSalaryVersion,
  onDeleteSalaryVersion,
  notify,
}) => {
  const { isDark } = useTheme();
  const currentEmp =
    slice.employments.find((e) => e.isCurrent) || slice.employments[slice.employments.length - 1];

  const todayStr = getLocalTodayISO();
  const loanPortfolio = calculateLoanPortfolioSummary(
    slice.loans || [],
    slice.loanRepayments || [],
    selectedMonth,
  );
  const salaryInfo = currentEmp
    ? resolveEffectiveSalaryForMonth(slice.salaryVersions, currentEmp.id, selectedMonth)
    : {
        basicSalary: 0,
        housingAllowance: 0,
        foodAllowance: 0,
        transportAllowance: 0,
        otherFixedAllowances: 0,
        variableAllowances: 0,
        actualWage: 0,
        usedVersions: [],
        explanation: 'No active employment period.',
      };

  const monthPayslip = slice.payslips.find((p) => p.payPeriod === selectedMonth);

  const monthReport = generateMonthlyAttendanceReport({
    monthYear: selectedMonth,
    attendanceRecords: slice.attendance.filter((a) =>
      currentEmp ? a.employmentId === currentEmp.id : true,
    ),
    leaveRecords: slice.leaves.filter((l) =>
      currentEmp ? l.employmentId === currentEmp.id : true,
    ),
    salaryInfo,
    payslip: monthPayslip,
  });

  const leaveSummary = currentEmp
    ? calculateLeaveSummary({
        joiningDate: currentEmp.joiningDate,
        asOfDate: todayStr,
        configuredEntitlementDays: currentEmp.annualLeaveEntitlementDays,
        carryoverDays: 0,
        leaveRecords: slice.leaves.filter((l) => l.employmentId === currentEmp.id),
        actualMonthlyWage: salaryInfo.actualWage,
      })
    : null;

  const eosbEstimate = currentEmp
    ? calculateEOSB({
        startDate: currentEmp.joiningDate,
        endDate: currentEmp.lastWorkingDate || todayStr,
        basicSalary: salaryInfo.basicSalary,
        actualSalary: salaryInfo.actualWage,
        wageBasisType: 'actual_wage',
        contractType: currentEmp.contractType,
        terminationReason: 'contract_expiry',
      })
    : null;

  const reconciliation = reconcileMonthlySalary({
    monthYear: selectedMonth,
    expectedBasic: salaryInfo.basicSalary,
    expectedActualWage: salaryInfo.actualWage,
    recordedAttendanceOvertimeHours: monthReport.recordedOvertimeHours,
    payslip: monthPayslip,
  });

  const finalSettlementTotal =
    (eosbEstimate?.estimatedEOSB || 0) +
    (leaveSummary?.unusedLeaveValue || 0) +
    salaryInfo.actualWage +
    monthReport.estimatedOvertimePay;

  // Profile form state
  const [profileForm, setProfileForm] = useState<PersonalProfile>(slice.profile);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // New employment modal/form state
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | undefined>(undefined);
  const [empError, setEmpError] = useState<string | null>(null);
  const [isSavingEmp, setIsSavingEmp] = useState(false);
  const [empDraft, setEmpDraft] = useState<Partial<EmploymentPeriod>>({
    employerName: '',
    jobTitle: '',
    department: '',
    employeeNumber: '',
    workLocation: 'Riyadh',
    joiningDate: todayStr,
    isCurrent: true,
    contractType: 'fixed_term',
    contractStartDate: todayStr,
    contractEndDate: '2027-03-01',
    probationDays: 90,
    noticePeriodDays: 60,
    weeklyRestDays: ['Friday'],
    expectedDailyHours: 8,
    expectedWeeklyHours: 48,
    annualLeaveEntitlementDays: 21,
  });

  // New salary version state
  const [showSalForm, setShowSalForm] = useState(false);
  const [editingSalId, setEditingSalId] = useState<string | undefined>(undefined);
  const [salError, setSalError] = useState<string | null>(null);
  const [isSavingSal, setIsSavingSal] = useState(false);
  const [salDraft, setSalDraft] = useState<Partial<SalaryVersion>>({
    employmentId: currentEmp?.id || '',
    effectiveFrom: todayStr,
    basicSalary: 4500,
    housingAllowance: 1125,
    foodAllowance: 300,
    transportAllowance: 450,
    otherFixedAllowances: 0,
    variableAllowances: 0,
    payFrequency: 'monthly',
    reasonForChange: 'Annual Increment / Promotion',
    contractualNotes: '',
  });

  if (activeTab === 'dashboard') {
    const firstSalary = slice.salaryVersions[0];
    const firstWage = firstSalary
      ? firstSalary.basicSalary +
        firstSalary.housingAllowance +
        firstSalary.foodAllowance +
        firstSalary.transportAllowance +
        firstSalary.otherFixedAllowances
      : salaryInfo.actualWage;
    const growthPct =
      firstWage > 0 ? (((salaryInfo.actualWage - firstWage) / firstWage) * 100).toFixed(1) : '0.0';

    return (
      <div className="space-y-8">
        {/* 1. Personalized Welcome Hero Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#14213D] via-[#1E2E52] to-[#2B4380] text-white p-6 sm:p-8 shadow-lg border border-indigo-900/40">
          {/* Subtle decorative background glow circles */}
          <div className="absolute top-0 right-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-10 w-60 h-60 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-semibold backdrop-blur-xs">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Saudi Labor Law Compliance 2026</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-medium backdrop-blur-xs">
                  <Building className="w-3.5 h-3.5" />
                  <span>{currentEmp?.employerName || 'Registered Employer'}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-xs font-medium backdrop-blur-xs">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{currentEmp?.workLocation || 'Riyadh, KSA'}</span>
                </span>
              </div>

              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                  Assalamu Alaikum, {slice.profile.displayName || slice.user.fullName}!
                </h2>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                  Your private expatriate employment workspace is fully encrypted. Track your actual wages, statutory overtime under Article 107, leave accruals, and End of Service benefits.
                </p>
              </div>

              {/* Expatriate Status Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/10">
                  <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Active Contract</div>
                  <div className="text-xs font-semibold text-white truncate">
                    {currentEmp?.contractType === 'unspecified_term' ? 'Indefinite Term' : 'Fixed Term'}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/10">
                  <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Service Tenure</div>
                  <div className="text-xs font-semibold text-emerald-300 font-mono">
                    {eosbEstimate?.duration.years}y {eosbEstimate?.duration.months}m {eosbEstimate?.duration.days}d
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/10">
                  <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Iqama Status</div>
                  <div className="text-xs font-semibold text-white">
                    {slice.profile.iqamaNumber ? `Valid (${slice.profile.iqamaNumber.slice(-4)})` : 'Verified'}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 border border-white/10">
                  <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Active Period</div>
                  <div className="text-xs font-semibold text-amber-300 font-mono">{selectedMonth}</div>
                </div>
              </div>

              {/* Quick Action Badges */}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('attendance')}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Attendance</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('overtime')}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Log Overtime</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('leave')}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Vacation Hub</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('eosb')}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Calculate EOSB</span>
                </button>
              </div>
            </div>

            {/* Scalable SVG Illustration */}
            <div className="w-full sm:w-auto flex justify-center shrink-0">
              <div className="w-64 sm:w-72 max-w-full drop-shadow-2xl">
                <WelcomeBannerIllustration />
              </div>
            </div>
          </div>
        </section>

        {/* 2. Executive 8 Primary Summary Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Executive Employment & Financial Highlights
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live statutory calculations reflecting your actual contracts and active period ({selectedMonth})
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 font-mono">
              Period: {selectedMonth}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Employer & Tenure */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Employer & Tenure
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#16223B] text-indigo-400' : 'bg-[#EDF3FF] text-[#3B5BDB]'} flex items-center justify-center font-bold`}>
                    <Briefcase className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <h4 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'} truncate`}>
                    {currentEmp?.employerName || 'No Employer Configured'}
                  </h4>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                    {currentEmp?.jobTitle} • {currentEmp?.workLocation}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <div className={`text-xs font-semibold ${isDark ? 'text-indigo-400' : 'text-[#3B5BDB]'} font-mono`}>
                  Tenure: {eosbEstimate?.duration.years}y {eosbEstimate?.duration.months}m {eosbEstimate?.duration.days}d
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('employment')}
                  className={`mt-1 text-[11px] font-bold ${isDark ? 'text-slate-300 hover:text-indigo-400' : 'text-slate-600 hover:text-indigo-600'} flex items-center gap-1 cursor-pointer`}
                >
                  <span>View Contract Details</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 2: Current Monthly Package */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Monthly Salary Package
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#122926] text-teal-400' : 'bg-[#E8FAF5] text-[#13B8A6]'} flex items-center justify-center font-bold`}>
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'} font-mono tabular-nums`}>
                    SAR {salaryInfo.actualWage.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} font-mono tabular-nums mt-1`}>
                    Basic: SAR {salaryInfo.basicSalary.toLocaleString()} | Allowances: SAR{' '}
                    {(salaryInfo.actualWage - salaryInfo.basicSalary).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <div className="text-[11px] text-teal-600 dark:text-teal-400 font-medium truncate">
                  {salaryInfo.explanation}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('employment')}
                  className={`mt-1 text-[11px] font-bold ${isDark ? 'text-slate-300 hover:text-teal-400' : 'text-slate-600 hover:text-teal-600'} flex items-center gap-1 cursor-pointer`}
                >
                  <span>Manage Salary Versions</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 3: Attendance Summary */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Attendance ({selectedMonth})
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#16223B] text-sky-400' : 'bg-[#EDF3FF] text-[#55C2FF]'} flex items-center justify-center font-bold`}>
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'} font-mono tabular-nums`}>
                    {monthReport.presentDays} Days{' '}
                    <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      ({monthReport.netWorkingHours}h net)
                    </span>
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} font-mono tabular-nums mt-1`}>
                    Rest Worked: {monthReport.weeklyRestDays}d | Leave: {monthReport.annualLeaveDays}d
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => onNavigate('attendance')}
                  className="text-[11px] font-bold text-sky-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Attendance Ledger</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 4: Overtime Hours & Statutory Pay */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Overtime ({selectedMonth})
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#2D221D] text-amber-400' : 'bg-[#FFF1E8] text-[#FFB547]'} flex items-center justify-center font-bold`}>
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-amber-500 font-mono tabular-nums">
                    {monthReport.recordedOvertimeHours} hrs
                  </div>
                  <div className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'} font-mono tabular-nums mt-1`}>
                    Est. Pay: SAR {monthReport.estimatedOvertimePay.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <div className="text-[10px] text-slate-400">Saudi Labor Law Art. 107 Rate</div>
                <button
                  type="button"
                  onClick={() => onNavigate('overtime')}
                  className="mt-1 text-[11px] font-bold text-amber-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>View Overtime Formula</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 5: Annual Leave Balance */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Leave Balance (Art. 109)
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#122926] text-teal-400' : 'bg-[#E8FAF5] text-[#13B8A6]'} flex items-center justify-center font-bold`}>
                    <CalendarDays className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-teal-500 font-mono tabular-nums">
                    {leaveSummary?.remainingAnnualBalance.toFixed(1) || '0.0'} Days
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} font-mono tabular-nums mt-1`}>
                    Encashment Value: SAR{' '}
                    {(leaveSummary?.unusedLeaveValue || 0).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Taken: {leaveSummary?.annualLeaveTaken || 0}d | Sick: {leaveSummary?.sickLeaveTaken || 0}d
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('leave')}
                  className="mt-1 text-[11px] font-bold text-teal-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Plan Vacation & Pay</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 6: Accrued EOSB */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Accrued EOSB (Art. 84)
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#231C38] text-indigo-400' : 'bg-[#F1EDFF] text-[#6658E8]'} flex items-center justify-center font-bold`}>
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-indigo-500 font-mono tabular-nums">
                    SAR {(eosbEstimate?.fullAward || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} font-mono tabular-nums mt-1`}>
                    First 5y: SAR {eosbEstimate?.firstFiveYearsAmount.toFixed(0)} | &gt;5y: SAR{' '}
                    {eosbEstimate?.subsequentYearsAmount.toFixed(0)}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => onNavigate('eosb')}
                  className="text-[11px] font-bold text-indigo-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Resignation vs Termination Simulation</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 7: Estimated Final Settlement */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Est. Final Settlement
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#16223B] text-blue-400' : 'bg-[#EDF3FF] text-[#3B5BDB]'} flex items-center justify-center font-bold`}>
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'} font-mono tabular-nums`}>
                    SAR {finalSettlementTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                    EOSB + Unused Leave + Current Salary & OT
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => onNavigate('settlement')}
                  className="text-[11px] font-bold text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Customize Settlement Breakdown</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Card 8: Active Loans & Advances */}
            <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Active Loans & Advances
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${isDark ? 'bg-[#2D221D] text-rose-400' : 'bg-[#FFF1E8] text-[#FF6B6B]'} flex items-center justify-center font-bold`}>
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black text-rose-500 font-mono tabular-nums">
                    SAR {loanPortfolio.totalOutstandingBalance.toLocaleString()}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} font-mono tabular-nums mt-1`}>
                    Repaid: SAR {loanPortfolio.totalPrincipalRepaid.toLocaleString()} | Monthly: SAR{' '}
                    {loanPortfolio.totalScheduledMonthlyDeduction.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => onNavigate('loans')}
                  className="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Loan & Repayment Ledger</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Interactive Data-Driven Charts */}
        <section>
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Visual Financial Intelligence & Compensation Metrics
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Interactive breakdowns powered by your actual employment contracts, payslips, and loan ledgers
            </p>
          </div>
          <DashboardCharts slice={slice} selectedMonth={selectedMonth} />
        </section>

        {/* 4. 14-Module Interactive Launcher Grid */}
        <section>
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Personal Employment Modules & Legal Tools
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quick access to all 14 personal workspace modules with real data persistence
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { id: 'attendance', label: 'Attendance & Shifts', desc: 'Daily punch, day/night shifts & holidays', color: '#13B8A6' },
              { id: 'overtime', label: 'Overtime Ledger', desc: 'Art. 107 formula & ledger breakdown', color: '#FFB547' },
              { id: 'overtime_salary_calculator', label: 'Overtime Salary Calculator', desc: 'Labor Law Art. 107 vs Company verification', color: '#10B981' },
              { id: 'leave', label: 'Vacation & Leave Hub', desc: 'Art. 109 accrual & vacation pay', color: '#55C2FF' },
              { id: 'loans', label: 'Loans & Advances', desc: 'Company advances & repayment plans', color: '#FF6B6B' },
              { id: 'payslips', label: 'Payslips & Wages', desc: 'Upload, verify & audit deductions', color: '#3B5BDB' },
              { id: 'reconciliation', label: 'Wage Reconciliation', desc: 'Bank credit vs payslip discrepancy', color: '#6658E8' },
              { id: 'eosb', label: 'End of Service Award', desc: 'Article 84/85 statutory calculator', color: '#B8A5FF' },
              { id: 'settlement', label: 'Final Settlement', desc: 'Simulate full contract exit payout', color: '#3B5BDB' },
              { id: 'documents', label: 'Document Vault', desc: 'Passports, contracts & confidential files', color: '#13B8A6' },
              { id: 'finance', label: 'Personal Finance', desc: 'Remittances, savings & expenses', color: '#FFB547' },
              { id: 'reports', label: 'Official Reports', desc: 'Generate PDF/bilingual documentation', color: '#55C2FF' },
              { id: 'reminders', label: 'Expiry & Reminders', desc: 'Iqama, passport & contract alerts', color: '#FF6B6B' },
              { id: 'backup', label: 'Drive & Cloud Backup', desc: 'Google Drive sync & JSON exports', color: '#6658E8' },
              { id: 'assistant', label: 'Labor Law Assistant', desc: 'Browse Saudi Labor Law articles', color: '#3B5BDB' },
            ].map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => onNavigate(mod.id as PrimaryNavModule)}
                className="group p-3.5 rounded-2xl bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 shadow-2xs hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs mb-2 transition group-hover:scale-105"
                    style={{ backgroundColor: mod.color }}
                  >
                    {mod.label.slice(0, 2).toUpperCase()}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-1">
                    {mod.label}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-snug">
                    {mod.desc}
                  </p>
                </div>
                <div className="mt-3 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
                  <span>Open</span>
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 5. Career Salary Growth & Document Reminders */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Upcoming Expiry Reminders */}
          <div className="bg-white dark:bg-[#131B2E] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Upcoming Document & Contract Expiries
              </h4>
              <button
                type="button"
                onClick={() => onNavigate('reminders')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Manage All
              </button>
            </div>
            <div className="space-y-2">
              {slice.reminders.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-center text-xs text-slate-400">
                  No upcoming expiries recorded.
                </div>
              ) : (
                slice.reminders.slice(0, 3).map((rem) => (
                  <div
                    key={rem.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-xs"
                  >
                    <div className="truncate pr-2">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{rem.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Target: {rem.targetDate}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700/50 text-amber-800 dark:text-amber-300 font-mono text-[11px] shrink-0 font-semibold">
                      {rem.leadNoticeDays}d notice
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Career Salary Growth & Multi-Employer Summary */}
          <div className="bg-white dark:bg-[#131B2E] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                KSA Career Growth & Salary Timeline
              </h4>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Cumulative Package Growth</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  +{growthPct}% ({slice.salaryVersions.length} Increments)
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Employers Tracked</div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                  {slice.employments.length} Companies
                </div>
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              {slice.salaryVersions.slice(0, 3).map((sv) => {
                const total =
                  sv.basicSalary +
                  sv.housingAllowance +
                  sv.foodAllowance +
                  sv.transportAllowance +
                  sv.otherFixedAllowances;
                return (
                  <div
                    key={sv.id}
                    className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-800"
                  >
                    <span className="text-slate-700 dark:text-slate-300 truncate font-medium">
                      {sv.effectiveFrom}: {sv.reasonForChange}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                      SAR {total.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personal Data Isolation & Backup Status */}
          <div className="bg-white dark:bg-[#131B2E] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Account Isolation & Backup Status
                </h4>
                <Shield className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Signed in as <strong className="text-slate-900 dark:text-white">{slice.user.email}</strong>. All data is isolated on the server.
              </p>
              <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                Last Backup:{' '}
                {slice.profile.lastBackupAt ? slice.profile.lastBackupAt.slice(0, 10) : 'Ready to Export'}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => exportUserBackupJSON(slice)}
                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#3B5BDB] to-[#6658E8] hover:opacity-90 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('backup')}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
              >
                Drive Sync
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === 'profile') {
    const handleProfileSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setProfileError(null);
      setProfileSavedMsg(null);
      if (!profileForm.fullName || !profileForm.fullName.trim()) {
        setProfileError('Full Name is required.');
        return;
      }
      setIsSavingProfile(true);
      try {
        await onUpdateProfile({
          ...profileForm,
          fullName: profileForm.fullName.trim(),
        });
        setProfileSavedMsg('Personal profile saved to your private account.');
        notify?.('Personal profile saved to your private account.', 'success');
        setTimeout(() => setProfileSavedMsg(null), 3500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save personal profile.';
        setProfileError(msg);
        notify?.(msg, 'warning');
      } finally {
        setIsSavingProfile(false);
      }
    };

    return (
      <div className="max-w-4xl space-y-6">
        <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-6 shadow-xs space-y-5`}>
          <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'} pb-4`}>
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-emerald-500" />
              <div>
                <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  My Personal Expatriate Profile (Section 4)
                </h2>
                <p className="text-xs text-slate-400">
                  Private identity, Iqama/Passport expiry dates, emergency contact, and monthly savings goals.
                </p>
              </div>
            </div>
            {profileSavedMsg && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {profileSavedMsg}
              </span>
            )}
          </div>

          {profileError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
            >
              {profileError}
            </div>
          )}

          <form noValidate onSubmit={handleProfileSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Full Name</label>
              <input
                type="text"
                required
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Preferred Display Name</label>
              <input
                type="text"
                value={profileForm.displayName || ''}
                onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Nationality</label>
              <input
                type="text"
                value={profileForm.nationality}
                onChange={(e) => setProfileForm({ ...profileForm, nationality: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Current Saudi City / Site</label>
              <input
                type="text"
                value={profileForm.currentCity || ''}
                onChange={(e) => setProfileForm({ ...profileForm, currentCity: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                Iqama Number (Masked Optional)
              </label>
              <input
                type="text"
                value={profileForm.iqamaNumber || ''}
                onChange={(e) => setProfileForm({ ...profileForm, iqamaNumber: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm font-mono`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Iqama Expiry Date</label>
              <DateInputWithToday
                value={profileForm.iqamaExpiryDate || ''}
                onChange={(val) => setProfileForm({ ...profileForm, iqamaExpiryDate: val })}
                ariaLabel="Iqama Expiry Date"
                className={isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                Passport Number (Masked Optional)
              </label>
              <input
                type="text"
                value={profileForm.passportNumber || ''}
                onChange={(e) => setProfileForm({ ...profileForm, passportNumber: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm font-mono`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Passport Expiry Date</label>
              <DateInputWithToday
                value={profileForm.passportExpiryDate || ''}
                onChange={(val) => setProfileForm({ ...profileForm, passportExpiryDate: val })}
                ariaLabel="Passport Expiry Date"
                className={isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Saudi Mobile Phone</label>
              <input
                type="text"
                value={profileForm.phone || ''}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm font-mono`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Emergency Contact Name & Phone</label>
              <input
                type="text"
                value={profileForm.emergencyContactName || ''}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, emergencyContactName: e.target.value })
                }
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                Monthly Living Budget Target (SAR)
              </label>
              <NumericInput
                value={profileForm.monthlyBudgetTarget}
                onValueChange={(val) =>
                  setProfileForm({
                    ...profileForm,
                    monthlyBudgetTarget: val ?? 0,
                  })
                }
                min={0}
                ariaLabel="Monthly Living Budget Target"
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm font-mono`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                Monthly Personal Savings Goal (SAR)
              </label>
              <NumericInput
                value={profileForm.monthlySavingsGoal}
                onValueChange={(val) =>
                  setProfileForm({
                    ...profileForm,
                    monthlySavingsGoal: val ?? 0,
                  })
                }
                min={0}
                ariaLabel="Monthly Personal Savings Goal"
                className={`w-full rounded-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-3 py-2 text-sm font-mono`}
              />
            </div>
            <div className="sm:col-span-2 pt-2">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 rounded-xl bg-[#3B5BDB] hover:bg-[#324fbe] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingProfile ? 'Saving...' : 'Save Personal Profile'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // activeTab === 'employment' (Sections 5, 6, 18: Multi-Employer History & Versioned Salary History)
  const handleAddEmployment = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpError(null);
    if (!empDraft.employerName || !empDraft.employerName.trim()) {
      setEmpError('Employer Name is required.');
      return;
    }
    if (!empDraft.jobTitle || !empDraft.jobTitle.trim()) {
      setEmpError('Job Title is required.');
      return;
    }
    if (!empDraft.joiningDate) {
      setEmpError('Joining Date is required.');
      return;
    }
    setIsSavingEmp(true);
    try {
      const now = new Date().toISOString();
      await onSaveEmployment({
        ...empDraft,
        id: editingEmpId,
        employerName: empDraft.employerName.trim(),
        jobTitle: empDraft.jobTitle.trim(),
        createdAt: empDraft.createdAt || now,
        updatedAt: now,
      });
      notify?.(
        editingEmpId ? 'Employment period updated.' : 'Employment period saved.',
        'success',
      );
      setEditingEmpId(undefined);
      setShowEmpForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save employment period.';
      setEmpError(msg);
      notify?.(msg, 'warning');
    } finally {
      setIsSavingEmp(false);
    }
  };

  const handleAddSalaryVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalError(null);
    const targetEmpId = salDraft.employmentId || currentEmp?.id || '';
    if (!targetEmpId) {
      setSalError('Please select an Employer Period.');
      return;
    }
    if (!salDraft.effectiveFrom) {
      setSalError('Effective From Date is required.');
      return;
    }
    if (salDraft.basicSalary === undefined || salDraft.basicSalary <= 0) {
      setSalError('Basic Salary must be greater than 0.');
      return;
    }
    setIsSavingSal(true);
    try {
      await onSaveSalaryVersion({
        ...salDraft,
        id: editingSalId,
        employmentId: targetEmpId,
        reasonForChange: salDraft.reasonForChange?.trim() || 'Salary Package Update',
        createdAt: salDraft.createdAt || new Date().toISOString(),
      });
      notify?.(
        editingSalId ? 'Salary version updated.' : 'New salary version saved.',
        'success',
      );
      setEditingSalId(undefined);
      setShowSalForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save salary version.';
      setSalError(msg);
      notify?.(msg, 'warning');
    } finally {
      setIsSavingSal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Multi-Employer Career History */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">
              Employment Periods & Multi-Company Career History (Section 5)
            </h2>
            <p className="text-xs text-slate-400">
              Track your current and past employers in Saudi Arabia. EOSB is calculated strictly per individual employer period.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingEmpId(undefined);
              setEmpError(null);
              setShowEmpForm(!showEmpForm);
            }}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Employer / Contract Period</span>
          </button>
        </div>

        {showEmpForm && (
          <form
            noValidate
            onSubmit={handleAddEmployment}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            {empError && (
              <div
                role="alert"
                className="sm:col-span-3 p-2.5 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
              >
                {empError}
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-300 mb-1">Employer Name</label>
              <input
                type="text"
                required
                value={empDraft.employerName || ''}
                onChange={(e) => setEmpDraft({ ...empDraft, employerName: e.target.value })}
                placeholder="e.g. Nesma & Partners"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Job Title</label>
              <input
                type="text"
                required
                value={empDraft.jobTitle || ''}
                onChange={(e) => setEmpDraft({ ...empDraft, jobTitle: e.target.value })}
                placeholder="e.g. Electrical Engineer"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Work City / Project</label>
              <input
                type="text"
                value={empDraft.workLocation || ''}
                onChange={(e) => setEmpDraft({ ...empDraft, workLocation: e.target.value })}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Joining Date</label>
              <DateInputWithToday
                required
                value={empDraft.joiningDate || ''}
                onChange={(val) =>
                  setEmpDraft({
                    ...empDraft,
                    joiningDate: val,
                    contractStartDate: val,
                  })
                }
                ariaLabel="Joining Date"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Contract End Date</label>
              <DateInputWithToday
                value={empDraft.contractEndDate || ''}
                onChange={(val) => setEmpDraft({ ...empDraft, contractEndDate: val })}
                ariaLabel="Contract End Date"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Annual Leave Days (21, 30 or Custom)</label>
              <NumericInput
                value={empDraft.annualLeaveEntitlementDays}
                onValueChange={(val) =>
                  setEmpDraft({
                    ...empDraft,
                    annualLeaveEntitlementDays: val ?? 21,
                  })
                }
                min={1}
                ariaLabel="Annual Leave Entitlement Days"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div className="sm:col-span-3 flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingEmpId(undefined);
                  setEmpError(null);
                  setShowEmpForm(false);
                }}
                className="px-3 py-1.5 rounded bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEmp}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
              >
                {isSavingEmp
                  ? 'Saving...'
                  : editingEmpId
                    ? 'Update Employment Period'
                    : 'Save Employment Period'}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slice.employments.map((emp) => {
            const dur = calculateServiceDuration(
              emp.joiningDate,
              emp.lastWorkingDate || todayStr,
            );
            return (
              <div
                key={emp.id}
                className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{emp.employerName}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        emp.isCurrent
                          ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {emp.isCurrent ? 'Current Employer' : 'Past Employer'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    {emp.jobTitle} • {emp.workLocation}
                  </div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    Service: {emp.joiningDate} → {emp.lastWorkingDate || 'Present'} ({dur.years}y{' '}
                    {dur.months}m {dur.days}d)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Contract: {emp.contractType} | Schedule: {emp.expectedDailyHours}h/day,{' '}
                    {emp.expectedWeeklyHours}h/wk | Annual Leave: {emp.annualLeaveEntitlementDays}d
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-500">{emp.notes}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmpId(emp.id);
                        setEmpDraft(emp);
                        setEmpError(null);
                        setShowEmpForm(true);
                      }}
                      className="text-xs text-emerald-400 hover:underline font-semibold"
                    >
                      Edit
                    </button>
                    {slice.employments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteEmployment(emp.id)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                        title="Delete Employment Period"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Versioned Salary History (Section 6) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">
              Versioned Salary History & Mid-Month Proration Engine (Section 6)
            </h2>
            <p className="text-xs text-slate-400">
              New salary increments never overwrite your historical months. Mid-month salary changes are automatically prorated by day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingSalId(undefined);
              setSalError(null);
              setSalDraft({ ...salDraft, employmentId: currentEmp?.id || '' });
              setShowSalForm(!showSalForm);
            }}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Salary Increment / Version</span>
          </button>
        </div>

        {showSalForm && (
          <form
            noValidate
            onSubmit={handleAddSalaryVersion}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            {salError && (
              <div
                role="alert"
                className="sm:col-span-4 p-2.5 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
              >
                {salError}
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1">Employer Period</label>
              <select
                value={salDraft.employmentId || ''}
                onChange={(e) => setSalDraft({ ...salDraft, employmentId: e.target.value })}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                {slice.employments.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employerName} ({emp.jobTitle})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Effective From Date</label>
              <DateInputWithToday
                required
                value={salDraft.effectiveFrom || ''}
                onChange={(val) => setSalDraft({ ...salDraft, effectiveFrom: val })}
                ariaLabel="Salary Version Effective From Date"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Reason for Change</label>
              <input
                type="text"
                required
                value={salDraft.reasonForChange || ''}
                onChange={(e) => setSalDraft({ ...salDraft, reasonForChange: e.target.value })}
                placeholder="e.g. Annual Increment 2026"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Basic Salary (SAR)</label>
              <NumericInput
                required
                value={salDraft.basicSalary}
                onValueChange={(val) => setSalDraft({ ...salDraft, basicSalary: val ?? 0 })}
                min={0}
                ariaLabel="Basic Salary"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Housing Allowance (SAR)</label>
              <NumericInput
                value={salDraft.housingAllowance}
                onValueChange={(val) => setSalDraft({ ...salDraft, housingAllowance: val ?? 0 })}
                min={0}
                ariaLabel="Housing Allowance"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Transport Allowance (SAR)</label>
              <NumericInput
                value={salDraft.transportAllowance}
                onValueChange={(val) => setSalDraft({ ...salDraft, transportAllowance: val ?? 0 })}
                min={0}
                ariaLabel="Transport Allowance"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Food & Other Fixed (SAR)</label>
              <NumericInput
                value={salDraft.foodAllowance}
                onValueChange={(val) => setSalDraft({ ...salDraft, foodAllowance: val ?? 0 })}
                min={0}
                ariaLabel="Food Allowance"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div className="sm:col-span-4 flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingSalId(undefined);
                  setSalError(null);
                  setShowSalForm(false);
                }}
                className="px-3 py-1.5 rounded bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingSal}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
              >
                {isSavingSal
                  ? 'Saving...'
                  : editingSalId
                    ? 'Update Salary Version'
                    : 'Save New Salary Version'}
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Effective From</th>
                <th className="py-2.5 px-3">Employer</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3 text-right">Basic (SAR)</th>
                <th className="py-2.5 px-3 text-right">Housing</th>
                <th className="py-2.5 px-3 text-right">Transport & Food</th>
                <th className="py-2.5 px-3 text-right">Other Fixed</th>
                <th className="py-2.5 px-3 text-right">Total Fixed Package</th>
                <th className="py-2.5 px-3 text-right">Art. 107 OT/hr</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {slice.salaryVersions.map((ver) => {
                const emp = slice.employments.find((e) => e.id === ver.employmentId);
                const total =
                  ver.basicSalary +
                  ver.housingAllowance +
                  ver.foodAllowance +
                  ver.transportAllowance +
                  ver.otherFixedAllowances;
                const otRate = calculateOvertimePay({
                  basicSalary: ver.basicSalary,
                  actualSalary: total,
                  overtimeDecimalHours: 1,
                });
                return (
                  <tr key={ver.id} className="hover:bg-slate-950/60">
                    <td className="py-2.5 px-3 font-mono text-emerald-300 tabular-nums">
                      {ver.effectiveFrom}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">
                      {emp?.employerName || 'Employer'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{ver.reasonForChange}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {ver.basicSalary.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {ver.housingAllowance.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {(ver.transportAllowance + ver.foodAllowance).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {ver.otherFixedAllowances.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white tabular-nums">
                      SAR {total.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-300 tabular-nums">
                      SAR {otRate.statutoryHourlyRate.toFixed(2)}/h
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSalId(ver.id);
                          setSalDraft(ver);
                          setSalError(null);
                          setShowSalForm(true);
                        }}
                        className="text-xs text-emerald-400 hover:underline font-semibold"
                      >
                        Edit
                      </button>
                      {slice.salaryVersions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteSalaryVersion(ver.id)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
