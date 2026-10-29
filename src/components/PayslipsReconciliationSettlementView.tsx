import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  PayslipRecord,
  TerminationReason,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';
import {
  calculateEOSB,
  calculateLeaveSummary,
  calculateLoanPortfolioSummary,
  reconcileMonthlySalary,
  resolveEffectiveSalaryForMonth,
} from '../engine/calculations.ts';
import {
  exportEOSBAndSettlementPDF,
  exportPayslipPDF,
} from '../utils/exportUtils.ts';
import { apiExtractPayslipOcr } from '../storage/db.ts';
import {
  DateInputWithToday,
  getLocalTodayISO,
  MonthInputWithToday,
  NumericInput,
} from './FormInputs.tsx';

interface PayslipsReconciliationSettlementProps {
  activeTab: 'payslips' | 'reconciliation' | 'eosb' | 'settlement';
  slice: UserPrivateDatabaseSlice;
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  onSavePayslip: (slip: Partial<PayslipRecord>) => Promise<void>;
  onDeletePayslip: (id: string) => Promise<void>;
  notify?: (msg: string, type?: 'success' | 'warning') => void;
}

export const PayslipsReconciliationSettlementView: React.FC<
  PayslipsReconciliationSettlementProps
> = ({
  activeTab,
  slice,
  selectedMonth,
  onMonthChange,
  onSavePayslip,
  onDeletePayslip,
  notify,
}) => {
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
        explanation: 'Default package',
      };

  // Payslip manual & OCR review form state (Section 11)
  const [editingSlipId, setEditingSlipId] = useState<string | undefined>(undefined);
  const [slipPeriod, setSlipPeriod] = useState(selectedMonth);
  const [slipPayDate, setSlipPayDate] = useState(`${selectedMonth}-28`);
  const [slipBasic, setSlipBasic] = useState(salaryInfo.basicSalary);
  const [slipHousing, setSlipHousing] = useState(salaryInfo.housingAllowance);
  const [slipFood, setSlipFood] = useState(salaryInfo.foodAllowance);
  const [slipTransport, setSlipTransport] = useState(salaryInfo.transportAllowance);
  const [slipOther, setSlipOther] = useState(salaryInfo.otherFixedAllowances);
  const [slipOtHours, setSlipOtHours] = useState(8);
  const [slipOtAmount, setSlipOtAmount] = useState(310);
  const [slipBonus, setSlipBonus] = useState(0);
  const [slipDeductions, setSlipDeductions] = useState(0);
  const [slipBankCredit, setSlipBankCredit] = useState(7310);
  const [slipSource, setSlipSource] = useState<'manual' | 'ai_ocr_verified'>('manual');
  const [slipNotes, setSlipNotes] = useState('');
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [isSavingSlip, setIsSavingSlip] = useState(false);

  // EOSB & Final Settlement interactive state (Sections 13 & 14)
  const loanPortfolio = calculateLoanPortfolioSummary(
    slice.loans || [],
    slice.loanRepayments || [],
    selectedMonth,
  );
  const [selectedEmpIdForEosb, setSelectedEmpIdForEosb] = useState(currentEmp?.id || '');
  const [eosbEndDate, setEosbEndDate] = useState(getLocalTodayISO());
  const [eosbReason, setEosbReason] = useState<TerminationReason>('contract_expiry');
  const [eosbWageBasis, setEosbWageBasis] = useState<'actual_wage' | 'basic_only'>('actual_wage');
  const [eosbExcludedUnpaidDays, setEosbExcludedUnpaidDays] = useState(0);

  // Final Settlement checkboxes & amounts (Section 14)
  const [incEosb, setIncEosb] = useState(true);
  const [incUnpaidSalary, setIncUnpaidSalary] = useState(true);
  const [incUnpaidOt, setIncUnpaidOt] = useState(true);
  const [incLeaveEncash, setIncLeaveEncash] = useState(true);
  const [incBonusTicket, setIncBonusTicket] = useState(true);
  const [dedLoans, setDedLoans] = useState(loanPortfolio.totalOutstandingBalance);
  const [dedNotice, setDedNotice] = useState(0);
  const [repatriationTicketSAR, setRepatriationTicketSAR] = useState(1850);

  if (activeTab === 'payslips') {
    const grossCalc =
      slipBasic +
      slipHousing +
      slipFood +
      slipTransport +
      slipOther +
      slipOtAmount +
      slipBonus;
    const netCalc = grossCalc - slipDeductions;

    const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setOcrLoading(true);
      setOcrStatusMsg(null);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '');
          const res = await apiExtractPayslipOcr({
            fileDataUrl: dataUrl,
            fileName: file.name,
            mimeType: file.type || 'image/png',
          });
          const c = res.candidate || {};
          if (typeof c.month === 'string' && c.month.length === 7) setSlipPeriod(c.month);
          if (typeof c.basicSalary === 'number') setSlipBasic(c.basicSalary);
          if (typeof c.housingAllowance === 'number') setSlipHousing(c.housingAllowance);
          if (typeof c.foodAllowance === 'number') setSlipFood(c.foodAllowance);
          if (typeof c.transportAllowance === 'number') setSlipTransport(c.transportAllowance);
          if (typeof c.otherAllowances === 'number') setSlipOther(c.otherAllowances);
          if (typeof c.overtimeHours === 'number') setSlipOtHours(c.overtimeHours);
          if (typeof c.overtimePay === 'number') setSlipOtAmount(c.overtimePay);
          if (typeof c.netPayOnSlip === 'number') setSlipBankCredit(c.netPayOnSlip);
          if (typeof c.notes === 'string') setSlipNotes(c.notes);
          setSlipSource('ai_ocr_verified');
          setOcrStatusMsg(res.message);
          setOcrLoading(false);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setOcrStatusMsg(
          err instanceof Error ? err.message : 'Could not extract payslip fields.',
        );
        setOcrLoading(false);
      }
    };

    const handleSavePayslipForm = async (e: React.FormEvent) => {
      e.preventDefault();
      setSlipError(null);
      if (!slipPeriod || !/^\d{4}-\d{2}$/.test(slipPeriod)) {
        setSlipError('Please enter a valid Payroll Month (YYYY-MM).');
        return;
      }
      if (slipBasic <= 0) {
        setSlipError('Basic Salary on payslip must be greater than 0.');
        return;
      }
      setIsSavingSlip(true);
      try {
        await onSavePayslip({
          id: editingSlipId,
          employmentId: currentEmp?.id || 'emp-default',
          employerName: currentEmp?.employerName || 'Employer',
          payPeriod: slipPeriod,
          paymentDate: slipPayDate,
          basicSalary: slipBasic,
          housingAllowance: slipHousing,
          foodAllowance: slipFood,
          transportAllowance: slipTransport,
          otherAllowances: slipOther,
          overtimeHours: slipOtHours,
          overtimeAmount: slipOtAmount,
          bonus: slipBonus,
          grossEarnings: grossCalc,
          itemizedDeductions:
            slipDeductions > 0
              ? [{ label: 'Payslip Deductions', amount: slipDeductions }]
              : [],
          totalDeductions: slipDeductions,
          netSalary: netCalc,
          bankCreditAmount: slipBankCredit,
          bankCreditDate: slipPayDate,
          extractionSource: slipSource,
          notes: slipNotes,
          createdAt: new Date().toISOString(),
        });
        if (slipPeriod !== selectedMonth) {
          onMonthChange(slipPeriod);
        }
        notify?.(
          editingSlipId
            ? `Updated payslip for ${slipPeriod}.`
            : `Saved verified payslip for ${slipPeriod}.`,
          'success',
        );
        setEditingSlipId(undefined);
        setOcrStatusMsg(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save payslip record.';
        setSlipError(msg);
        notify?.(msg, 'warning');
      } finally {
        setIsSavingSlip(false);
      }
    };

    return (
      <div className="space-y-6">
        {/* Manual Entry + AI/OCR Candidate Review Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                {editingSlipId
                  ? `Edit Personal Payslip (${slipPeriod})`
                  : 'Salary Slips & Payroll History — Manual Entry & AI/OCR Review (Section 11)'}
              </h2>
              <p className="text-xs text-slate-400">
                Upload a PDF or image payslip to populate the candidate review fields below, or enter figures manually. Extracted values are never saved without your review.
              </p>
            </div>
            <label className="px-3.5 py-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition">
              <Upload className="w-4 h-4" />
              <span>{ocrLoading ? 'Extracting...' : 'Upload Payslip PDF/Image for OCR Review'}</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleOcrFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {ocrStatusMsg && (
            <div className="p-3.5 rounded-xl bg-sky-950/70 border border-sky-700/60 text-xs text-sky-200 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Candidate OCR Review Mode Active</div>
                <p>{ocrStatusMsg}</p>
              </div>
            </div>
          )}

          {slipError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
            >
              {slipError}
            </div>
          )}

          <form noValidate onSubmit={handleSavePayslipForm} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Payroll Month</label>
                <MonthInputWithToday
                  required
                  value={slipPeriod}
                  onChange={setSlipPeriod}
                  ariaLabel="Payslip Payroll Month"
                  className="bg-slate-950 border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Basic Salary (SAR)</label>
                <NumericInput
                  value={slipBasic}
                  onValueChange={(val) => setSlipBasic(val ?? 0)}
                  min={0}
                  ariaLabel="Payslip Basic Salary"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Housing (SAR)</label>
                <NumericInput
                  value={slipHousing}
                  onValueChange={(val) => setSlipHousing(val ?? 0)}
                  min={0}
                  ariaLabel="Payslip Housing Allowance"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Transport & Food</label>
                <NumericInput
                  value={slipTransport}
                  onValueChange={(val) => setSlipTransport(val ?? 0)}
                  min={0}
                  ariaLabel="Payslip Transport Allowance"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">OT Hours on Slip</label>
                <NumericInput
                  value={slipOtHours}
                  onValueChange={(val) => setSlipOtHours(val ?? 0)}
                  min={0}
                  ariaLabel="Payslip Overtime Hours"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">OT Amount (SAR)</label>
                <NumericInput
                  value={slipOtAmount}
                  onValueChange={(val) => setSlipOtAmount(val ?? 0)}
                  min={0}
                  ariaLabel="Payslip Overtime Amount"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Total Deductions (SAR)</label>
                <NumericInput
                  value={slipDeductions}
                  onValueChange={(val) => setSlipDeductions(val ?? 0)}
                  min={0}
                  ariaLabel="Payslip Total Deductions"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Actual Bank Credit (SAR)
                </label>
                <NumericInput
                  value={slipBankCredit}
                  onValueChange={(val) => setSlipBankCredit(val ?? 0)}
                  min={0}
                  ariaLabel="Actual Bank Credit"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Payment Date</label>
                <DateInputWithToday
                  value={slipPayDate}
                  onChange={setSlipPayDate}
                  ariaLabel="Payslip Payment Date"
                  className="bg-slate-950 border-slate-700 text-white"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs text-slate-300 mb-1">Notes / Discrepancy Memo</label>
                <input
                  type="text"
                  value={slipNotes}
                  onChange={(e) => setSlipNotes(e.target.value)}
                  placeholder="e.g. Mudad WPS transfer; 4h overtime carried to next month"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex flex-wrap items-center gap-6 text-xs font-mono tabular-nums">
                <span>
                  Gross Pay: <strong className="text-white">SAR {grossCalc.toFixed(2)}</strong>
                </span>
                <span>
                  Slip Net Pay: <strong className="text-emerald-400">SAR {netCalc.toFixed(2)}</strong>
                </span>
                <span>
                  Bank Credit:{' '}
                  <strong className="text-sky-400">SAR {slipBankCredit.toFixed(2)}</strong>
                </span>
                <span>
                  Bank Variance:{' '}
                  <strong
                    className={
                      slipBankCredit - netCalc < -0.5 ? 'text-rose-400' : 'text-emerald-400'
                    }
                  >
                    SAR {(slipBankCredit - netCalc).toFixed(2)}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {editingSlipId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSlipId(undefined);
                      setSlipError(null);
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-xs text-slate-300"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingSlip}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {isSavingSlip
                      ? 'Saving...'
                      : editingSlipId
                        ? 'Update Verified Payslip'
                        : 'Confirm & Save Verified Payslip'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Saved Payslips Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">
            Saved Personal Payslips ({slice.payslips.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Month</th>
                  <th className="py-2.5 px-3">Employer</th>
                  <th className="py-2.5 px-3 text-right">Basic + Allow.</th>
                  <th className="py-2.5 px-3 text-right">OT on Slip</th>
                  <th className="py-2.5 px-3 text-right">Deductions</th>
                  <th className="py-2.5 px-3 text-right">Net on Slip</th>
                  <th className="py-2.5 px-3 text-right">Bank Credit</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {slice.payslips.map((p) => {
                  const fixed =
                    p.basicSalary +
                    p.housingAllowance +
                    p.foodAllowance +
                    p.transportAllowance +
                    p.otherAllowances;
                  const bank = typeof p.bankCreditAmount === 'number' ? p.bankCreditAmount : p.netSalary;
                  const short = bank < p.netSalary - 0.5;
                  return (
                    <tr key={p.id} className="hover:bg-slate-950/60">
                      <td className="py-2.5 px-3 font-mono font-bold text-white tabular-nums">
                        {p.payPeriod}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        <div>{p.employerName}</div>
                        {p.notes && <div className="text-[11px] text-slate-400">{p.notes}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        SAR {fixed.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-300 tabular-nums">
                        {p.overtimeHours}h (SAR {p.overtimeAmount.toFixed(2)})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-300 tabular-nums">
                        -SAR {p.totalDeductions.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-white tabular-nums">
                        SAR {p.netSalary.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${
                          short ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        SAR {bank.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300">
                          {p.extractionSource}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSlipId(p.id);
                            setSlipPeriod(p.payPeriod);
                            setSlipPayDate(p.paymentDate);
                            setSlipBasic(p.basicSalary);
                            setSlipHousing(p.housingAllowance);
                            setSlipFood(p.foodAllowance);
                            setSlipTransport(p.transportAllowance);
                            setSlipOther(p.otherAllowances);
                            setSlipOtHours(p.overtimeHours);
                            setSlipOtAmount(p.overtimeAmount);
                            setSlipBonus(p.bonus);
                            setSlipDeductions(p.totalDeductions);
                            setSlipBankCredit(
                              typeof p.bankCreditAmount === 'number'
                                ? p.bankCreditAmount
                                : p.netSalary,
                            );
                            setSlipNotes(p.notes || '');
                            setSlipError(null);
                          }}
                          className="text-xs text-emerald-400 hover:underline font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => exportPayslipPDF(p, slice.profile.fullName)}
                          className="text-emerald-400 hover:text-emerald-300 p-1"
                          title="Export Payslip PDF"
                        >
                          <Download className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePayslip(p.id)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                          title="Delete Payslip"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
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
  }

  if (activeTab === 'reconciliation') {
    const monthAtt = slice.attendance.filter((a) => a.date.startsWith(selectedMonth));
    const loggedOtHours = monthAtt.reduce(
      (s, a) => s + (a.userRecordedOvertimeHours || 0),
      0,
    );
    const slip = slice.payslips.find((p) => p.payPeriod === selectedMonth);
    const rec = reconcileMonthlySalary({
      monthYear: selectedMonth,
      expectedBasic: salaryInfo.basicSalary,
      expectedActualWage: salaryInfo.actualWage,
      recordedAttendanceOvertimeHours: loggedOtHours,
      payslip: slip,
    });

    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                Salary Reconciliation & Bank Credit Discrepancy Analyzer (Section 12)
              </h2>
              <p className="text-xs text-slate-400">
                Compares your Expected Contractual Wage + Logged Daily Overtime against your Employer Payslip and Actual Bank Deposit.
              </p>
            </div>
            <MonthInputWithToday
              value={selectedMonth}
              onChange={onMonthChange}
              ariaLabel="Reconciliation Month"
              className="bg-slate-950 border-slate-700 text-white"
            />
          </div>

          {/* Monthly Loan Deduction & Outstanding Balance Integration Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block">Gross Expected Salary</span>
              <span className="font-mono font-bold text-white">SAR {rec.expectedGross.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Confirmed Loan Deduction ({selectedMonth})</span>
              <span className="font-mono font-bold text-rose-400">
                -SAR {loanPortfolio.totalActualMonthlyDeduction.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Expected Net After Loan</span>
              <span className="font-mono font-bold text-emerald-400">
                SAR {(rec.expectedGross - loanPortfolio.totalActualMonthlyDeduction).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Outstanding Loan Balance After Deduction</span>
              <span className="font-mono font-bold text-amber-300">
                SAR {loanPortfolio.totalOutstandingBalance.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400">1. Expected Gross (Contract + Tracker OT)</div>
              <div className="text-xl font-bold text-white font-mono tabular-nums">
                SAR {rec.expectedGross.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Fixed: SAR {rec.expectedActualWage.toFixed(2)} + OT ({rec.recordedOvertimeHours}h): SAR{' '}
                {rec.expectedOvertimePay.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400">2. Stated on Employer Payslip</div>
              <div className="text-xl font-bold text-sky-400 font-mono tabular-nums">
                SAR {rec.payslipNet.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Gross on Slip: SAR {rec.payslipGross.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400">3. Actual Bank Transfer Received</div>
              <div className="text-xl font-bold text-emerald-400 font-mono tabular-nums">
                SAR {rec.bankCreditAmount.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Slip vs Bank Diff: SAR {rec.netVsBankDiff.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-xs text-slate-400">4. Overtime Hours Variance</div>
              <div
                className={`text-xl font-bold font-mono tabular-nums ${
                  Math.abs(rec.overtimeHoursDiff) > 0.1 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {rec.overtimeHoursDiff > 0 ? `+${rec.overtimeHoursDiff}` : rec.overtimeHoursDiff} hrs
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                OT Pay Diff: SAR {rec.overtimePayDiff.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Automated Reconciliation Findings & Possible Payroll Explanations</span>
            </h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {rec.possibleExplanations.map((exp, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{exp}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // EOSB & Final Settlement shared calculation per selected employment period
  const targetEmp =
    slice.employments.find((e) => e.id === selectedEmpIdForEosb) || currentEmp;
  const targetSal = targetEmp
    ? resolveEffectiveSalaryForMonth(slice.salaryVersions, targetEmp.id, selectedMonth)
    : salaryInfo;

  const eosbResult = calculateEOSB({
    startDate: targetEmp?.joiningDate || '2022-03-01',
    endDate: eosbEndDate,
    basicSalary: targetSal.basicSalary,
    actualSalary: targetSal.actualWage,
    wageBasisType: eosbWageBasis,
    contractType: targetEmp?.contractType || 'fixed_term',
    terminationReason: eosbReason,
    unpaidLeaveDaysToExclude: eosbExcludedUnpaidDays,
  });

  if (activeTab === 'eosb') {
    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-bold text-white">
              Saudi Labor Law End of Service Benefit (EOSB) Estimator (Section 13 — Articles 84–87)
            </h2>
            <p className="text-xs text-slate-400">
              EOSB is calculated strictly per individual employer service period—never combining separate employers unless legally transferred under continuous service.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Select Employer Period</label>
              <select
                value={targetEmp?.id || ''}
                onChange={(e) => setSelectedEmpIdForEosb(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-white"
              >
                {slice.employments.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employerName} ({emp.joiningDate})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Last Working Date</label>
              <DateInputWithToday
                value={eosbEndDate}
                onChange={setEosbEndDate}
                ariaLabel="EOSB Last Working Date"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Separation Scenario</label>
              <select
                value={eosbReason}
                onChange={(e) => setEosbReason(e.target.value as TerminationReason)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-white"
              >
                <option value="contract_expiry">Contract Expiry / Completion (100%)</option>
                <option value="employer_termination">Employer Termination (Art. 84 — 100%)</option>
                <option value="resignation">Employee Resignation (Art. 85 Tiers)</option>
                <option value="article_87_force_majeure_marriage_childbirth">
                  Art. 87 Force Majeure / Marriage / Childbirth (100%)
                </option>
                <option value="article_81_worker_right">Art. 81 Worker Right to Leave (100%)</option>
                <option value="article_80_dismissal_for_cause">Art. 80 Dismissal for Cause (0%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Wage Basis</label>
              <select
                value={eosbWageBasis}
                onChange={(e) =>
                  setEosbWageBasis(e.target.value as 'actual_wage' | 'basic_only')
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-white"
              >
                <option value="actual_wage">Last Actual Wage (SAR {targetSal.actualWage})</option>
                <option value="basic_only">Basic Salary Only (SAR {targetSal.basicSalary})</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Unpaid Leave Days Excluded
              </label>
              <NumericInput
                min={0}
                step="1"
                value={eosbExcludedUnpaidDays}
                onValueChange={(val) => setEosbExcludedUnpaidDays(val ?? 0)}
                ariaLabel="Unpaid Leave Days Excluded"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Exact Service Duration</div>
              <div className="text-lg font-bold text-white font-mono tabular-nums">
                {eosbResult.duration.years}y {eosbResult.duration.months}m {eosbResult.duration.days}d
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {eosbResult.duration.decimalYears.toFixed(4)} decimal years
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">First 5 Years + Subsequent Years</div>
              <div className="text-lg font-bold text-slate-200 font-mono tabular-nums">
                SAR {eosbResult.firstFiveYearsAmount.toFixed(2)} + SAR{' '}
                {eosbResult.subsequentYearsAmount.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Full Gross Award: SAR {eosbResult.fullAward.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Statutory Multiplier Applied</div>
              <div className="text-lg font-bold text-amber-300 font-mono tabular-nums">
                {eosbResult.entitlementPercentage.toFixed(2)}%
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Resignation Reduction: -SAR {eosbResult.resignationReduction.toFixed(2)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-700/50">
              <div className="text-xs text-emerald-300">Estimated Net Payable EOSB</div>
              <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                SAR {eosbResult.estimatedEOSB.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-emerald-300/80">{eosbResult.officialSource}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="font-mono text-emerald-300">{eosbResult.formula}</div>
            {eosbResult.notes.map((n, idx) => (
              <div key={idx} className="text-slate-400">
                • {n}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // activeTab === 'settlement' (Section 14: Interactive Final Settlement Estimator)
  const leaveSum = calculateLeaveSummary({
    joiningDate: targetEmp?.joiningDate || '2022-03-01',
    asOfDate: eosbEndDate,
    configuredEntitlementDays: targetEmp?.annualLeaveEntitlementDays || 21,
    carryoverDays: 0,
    leaveRecords: slice.leaves,
    actualMonthlyWage: targetSal.actualWage,
  });

  const monthAtt = slice.attendance.filter((a) => a.date.startsWith(selectedMonth));
  const loggedOtHrs = monthAtt.reduce((s, a) => s + (a.userRecordedOvertimeHours || 0), 0);
  const rec = reconcileMonthlySalary({
    monthYear: selectedMonth,
    expectedBasic: targetSal.basicSalary,
    expectedActualWage: targetSal.actualWage,
    recordedAttendanceOvertimeHours: loggedOtHrs,
  });

  const valEosb = incEosb ? eosbResult.estimatedEOSB : 0;
  const valSalary = incUnpaidSalary ? targetSal.actualWage : 0;
  const valOt = incUnpaidOt ? rec.expectedOvertimePay : 0;
  const valLeave = incLeaveEncash ? leaveSum.unusedLeaveValue : 0;
  const valTicket = incBonusTicket ? repatriationTicketSAR : 0;
  const totalAdditions = valEosb + valSalary + valOt + valLeave + valTicket;
  const totalDeductions = dedLoans + dedNotice;
  const finalNetSettlement = totalAdditions - totalDeductions;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">
              Interactive Final Settlement Simulator & Statement Generator (Section 14)
            </h2>
            <p className="text-xs text-slate-400">
              Toggle individual components to simulate your exact Mukhalasa (Final Settlement) before signing any clearance document.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              exportEOSBAndSettlementPDF({
                employeeName: slice.profile.fullName,
                employerName: targetEmp?.employerName || 'Employer',
                eosb: eosbResult,
                unpaidSalary: valSalary,
                unpaidOvertime: valOt,
                unusedLeaveEncashment: valLeave,
                bonusOrTicket: valTicket,
                totalDeductions,
                finalNetSettlement,
              })
            }
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            <span>Export Final Settlement Statement (PDF)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Include / Exclude Settlement Additions
            </h3>
            {[
              {
                checked: incEosb,
                set: setIncEosb,
                label: `1. End of Service Benefit (EOSB — ${eosbResult.entitlementPercentage.toFixed(0)}%)`,
                amount: eosbResult.estimatedEOSB,
              },
              {
                checked: incUnpaidSalary,
                set: setIncUnpaidSalary,
                label: `2. Current Month Unpaid Salary (${selectedMonth})`,
                amount: targetSal.actualWage,
              },
              {
                checked: incUnpaidOt,
                set: setIncUnpaidOt,
                label: `3. Unpaid Overtime Arrears (${loggedOtHrs}h logged)`,
                amount: rec.expectedOvertimePay,
              },
              {
                checked: incLeaveEncash,
                set: setIncLeaveEncash,
                label: `4. Unused Annual Leave Encashment (${leaveSum.remainingAnnualBalance.toFixed(1)} days)`,
                amount: leaveSum.unusedLeaveValue,
              },
              {
                checked: incBonusTicket,
                set: setIncBonusTicket,
                label: `5. Repatriation Exit Air Ticket Allowance (Art. 40)`,
                amount: repatriationTicketSAR,
              },
            ].map((row) => (
              <label
                key={row.label}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-3 text-xs text-white">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => row.set(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <span>{row.label}</span>
                </div>
                <span className="font-mono font-bold text-emerald-400 text-xs tabular-nums">
                  +SAR {row.amount.toFixed(2)}
                </span>
              </label>
            ))}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Custom Allowances & Deductions (SAR)
              </h3>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Repatriation Ticket Value (SAR)
                </label>
                <NumericInput
                  value={repatriationTicketSAR}
                  onValueChange={(val) => setRepatriationTicketSAR(val ?? 0)}
                  min={0}
                  ariaLabel="Repatriation Ticket Value"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Outstanding Salary Advance / Loan Balance (-SAR)
                </label>
                <NumericInput
                  value={dedLoans}
                  onValueChange={(val) => setDedLoans(val ?? 0)}
                  min={0}
                  ariaLabel="Outstanding Loan Balance Deduction"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Unserved Notice Period Deduction (-SAR)
                </label>
                <NumericInput
                  value={dedNotice}
                  onValueChange={(val) => setDedNotice(val ?? 0)}
                  min={0}
                  ariaLabel="Unserved Notice Period Deduction"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 space-y-2">
              <div className="flex justify-between text-xs text-slate-300 font-mono">
                <span>Total Gross Entitlements:</span>
                <span>SAR {totalAdditions.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-rose-300 font-mono">
                <span>Total Deductions:</span>
                <span>-SAR {totalDeductions.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-emerald-800/60 flex justify-between items-baseline">
                <span className="text-xs font-bold uppercase text-emerald-300">
                  Final Net Settlement
                </span>
                <span className="text-2xl font-bold text-white font-mono tabular-nums">
                  SAR {finalNetSettlement.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
