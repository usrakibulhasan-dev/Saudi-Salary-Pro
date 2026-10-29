import React, { useState } from 'react';
import type { UserPrivateDatabaseSlice } from '../types/payroll.ts';
import { resolveEffectiveSalaryForMonth } from '../engine/calculations.ts';

interface DashboardChartsProps {
  slice: UserPrivateDatabaseSlice;
  selectedMonth: string;
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ slice, selectedMonth }) => {
  const currentEmp =
    slice.employments.find((e) => e.isCurrent) || slice.employments[slice.employments.length - 1];

  const salaryInfo = currentEmp
    ? resolveEffectiveSalaryForMonth(slice.salaryVersions, currentEmp.id, selectedMonth)
    : {
        basicSalary: 4600,
        housingAllowance: 1150,
        foodAllowance: 350,
        transportAllowance: 500,
        otherFixedAllowances: 400,
        variableAllowances: 0,
        actualWage: 7000,
        usedVersions: [],
        explanation: '',
      };

  const totalPackage = Math.max(salaryInfo.actualWage, 1);
  const items = [
    { label: 'Basic Salary', amount: salaryInfo.basicSalary, color: '#3B5BDB', bg: 'bg-[#3B5BDB]' },
    { label: 'Housing Allowance', amount: salaryInfo.housingAllowance, color: '#13B8A6', bg: 'bg-[#13B8A6]' },
    { label: 'Food Allowance', amount: salaryInfo.foodAllowance, color: '#FFB547', bg: 'bg-[#FFB547]' },
    { label: 'Transport Allowance', amount: salaryInfo.transportAllowance, color: '#55C2FF', bg: 'bg-[#55C2FF]' },
    { label: 'Other Allowances', amount: salaryInfo.otherFixedAllowances, color: '#B8A5FF', bg: 'bg-[#B8A5FF]' },
  ].filter((i) => i.amount > 0);

  // Loan calculation
  const totalOriginalLoan = (slice.loans || []).reduce((acc, l) => acc + l.originalAmount, 0);
  const totalRepaid = (slice.loanRepayments || []).reduce(
    (acc, r) => acc + (r.amountAppliedToPrincipal || r.actualDeduction || 0),
    0,
  );
  const loanBalance = Math.max(0, totalOriginalLoan - totalRepaid);
  const loanProgressPct = totalOriginalLoan > 0 ? Math.min(100, (totalRepaid / totalOriginalLoan) * 100) : 0;

  // Active Payslip History for 4-6 past periods (aggregated by payPeriod so monthly trend bars are unique)
  const payslipsByPeriod = (slice.payslips || []).reduce<
    Record<string, { id: string; payPeriod: string; grossEarnings: number; bankCreditAmount: number }>
  >((acc, s) => {
    const period = s.payPeriod || 'Unknown';
    if (!acc[period]) {
      acc[period] = {
        id: s.id || `period-${period}`,
        payPeriod: period,
        grossEarnings: Number(s.grossEarnings || s.netSalary || 0),
        bankCreditAmount: Number(s.bankCreditAmount || s.netSalary || 0),
      };
    } else {
      acc[period].grossEarnings += Number(s.grossEarnings || s.netSalary || 0);
      acc[period].bankCreditAmount += Number(s.bankCreditAmount || s.netSalary || 0);
    }
    return acc;
  }, {});

  const recentPayslips = Object.values(payslipsByPeriod)
    .sort((a, b) => a.payPeriod.localeCompare(b.payPeriod))
    .slice(-6);

  const [activeDonutIdx, setActiveDonutIdx] = useState<number | null>(null);

  // SVG Donut calculation
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Chart 1: Salary Package Composition (Donut + Interactive Legend) */}
      <div className="lg:col-span-6 bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Monthly Salary Package Composition
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Contractual wage breakdown for {selectedMonth}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300">
            SAR {totalPackage.toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
          {/* Donut Graphic */}
          <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="18"
                className="text-slate-100 dark:text-slate-800"
              />
              {items.map((item, idx) => {
                const pct = item.amount / totalPackage;
                const dashLength = pct * circumference;
                const strokeDasharray = `${dashLength} ${circumference}`;
                const strokeDashoffset = -accumulatedOffset;
                accumulatedOffset += dashLength;
                const isHovered = activeDonutIdx === idx;

                return (
                  <circle
                    key={item.label}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={isHovered ? 22 : 18}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setActiveDonutIdx(idx)}
                    onMouseLeave={() => setActiveDonutIdx(null)}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Wage</span>
              <span className="text-xs font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                SAR {(totalPackage / 1000).toFixed(1)}k
              </span>
            </div>
          </div>

          {/* Interactive Legend with Bars */}
          <div className="flex-1 w-full space-y-2">
            {items.map((item, idx) => {
              const pct = ((item.amount / totalPackage) * 100).toFixed(1);
              const isHovered = activeDonutIdx === idx;

              return (
                <div
                  key={item.label}
                  onMouseEnter={() => setActiveDonutIdx(idx)}
                  onMouseLeave={() => setActiveDonutIdx(null)}
                  className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs ${
                    isHovered
                      ? 'bg-slate-100 dark:bg-slate-800/80 shadow-xs'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-md shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                      {pct}%
                    </span>
                    <span className="font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                      SAR {item.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart 2: 6-Month Payslip & Earnings History */}
      <div className="lg:col-span-6 bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Recent Payroll & Net Bank Trend
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gross earnings vs net credited bank transfers
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Gross
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Bank Credit
            </span>
          </div>
        </div>

        {recentPayslips.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400 space-y-1">
            <span>No previous monthly payslips logged yet.</span>
            <span className="text-slate-500">
              As you record payslips, your multi-month salary history chart appears here automatically.
            </span>
          </div>
        ) : (
          <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2">
            {recentPayslips.map((slip, idx) => {
              const maxScale = Math.max(...recentPayslips.map((s) => s.grossEarnings || s.bankCreditAmount), 8500);
              const grossH = Math.min(100, Math.round(((slip.grossEarnings) / maxScale) * 100));
              const netH = Math.min(100, Math.round(((slip.bankCreditAmount) / maxScale) * 100));

              return (
                <div key={`payslip-bar-${slip.payPeriod}-${slip.id || idx}`} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full flex items-end justify-center gap-1.5 h-32 relative">
                    {/* Tooltip */}
                    <div className="absolute -top-10 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10 shadow-lg">
                      Gross: SAR {slip.grossEarnings?.toLocaleString()} | Bank: SAR{' '}
                      {slip.bankCreditAmount?.toLocaleString()}
                    </div>
                    {/* Gross Bar */}
                    <div
                      style={{ height: `${grossH}%` }}
                      className="w-3 sm:w-4 rounded-t-md bg-gradient-to-t from-blue-700 to-blue-500 transition-all duration-300 group-hover:brightness-110"
                    />
                    {/* Net Bank Bar */}
                    <div
                      style={{ height: `${netH}%` }}
                      className="w-3 sm:w-4 rounded-t-md bg-gradient-to-t from-emerald-600 to-teal-400 transition-all duration-300 group-hover:brightness-110"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate w-full text-center">
                    {slip.payPeriod}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart 3: Loan Portfolio & Repayment Progress */}
      <div className="lg:col-span-6 bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Employee Loan & Advance Repayment Status
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tracking scheduled vs actual principal deductions
            </p>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              loanBalance > 0
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
            }`}
          >
            {loanBalance > 0 ? `${(slice.loans || []).length} Active Loans` : 'Zero Loan Debt'}
          </span>
        </div>

        {totalOriginalLoan === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 space-y-1">
            <span className="text-slate-300 dark:text-slate-200 font-semibold block">
              No Active Company Loans or Advances
            </span>
            <span>You have no outstanding loan liabilities registered.</span>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Total Borrowed:</span>
              <span className="font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                SAR {totalOriginalLoan.toLocaleString()}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-emerald-600 dark:text-emerald-400">
                  Repaid: SAR {totalRepaid.toLocaleString()} ({loanProgressPct.toFixed(0)}%)
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  Remaining: SAR {loanBalance.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                <div
                  style={{ width: `${loanProgressPct}%` }}
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                />
                <div
                  style={{ width: `${100 - loanProgressPct}%` }}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-400 block">Total Principal Repaid</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs tabular-nums">
                  SAR {totalRepaid.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-400 block">Current Outstanding Balance</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 font-mono text-xs tabular-nums">
                  SAR {loanBalance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart 4: Annual Leave & Encashment Value */}
      <div className="lg:col-span-6 bg-white dark:bg-[#131B2E] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Annual Leave Balance & Vacation Encashment
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Statutory Art. 109 entitlements & cashout value
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            Art. 109 & 111
          </span>
        </div>

        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Available Unused Vacation Days
              </span>
              <span className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 tabular-nums">
                {(
                  (currentEmp?.annualLeaveEntitlementDays || 21) * 2 -
                  (slice.leaves || []).filter((l) => l.leaveType === 'annual').length
                ).toFixed(1)}{' '}
                Days
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Statutory Encashment Value
              </span>
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                SAR{' '}
                {(
                  (((currentEmp?.annualLeaveEntitlementDays || 21) * 2 -
                    (slice.leaves || []).filter((l) => l.leaveType === 'annual').length) *
                    salaryInfo.actualWage) /
                  30
                ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">
              Statutory Basis: <strong>{currentEmp?.annualLeaveEntitlementDays || 21} days/year</strong>
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
              Daily Wage Basis: SAR {(salaryInfo.actualWage / 30).toFixed(2)}/day
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
