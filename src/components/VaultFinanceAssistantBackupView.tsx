import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  FileText,
  FolderLock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
  AlertCircle,
  HardDrive,
  Eye,
  Check,
  X,
  Lock,
} from 'lucide-react';
import type {
  DocumentCategory,
  FinanceCategory,
  FinanceTransaction,
  FullBackupPackage,
  GoogleDriveBackupFile,
  PersonalDocument,
  PersonalReminder,
  ReminderCategory,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';
import { apiUpdateProfile, type SystemCapabilitiesStatus } from '../storage/db.ts';
import { exportUserBackupJSON } from '../utils/exportUtils.ts';
import { resolveEffectiveSalaryForMonth } from '../engine/calculations.ts';
import { DateInputWithToday, NumericInput } from './FormInputs.tsx';
import { EmptyStateIllustration } from './Illustrations.tsx';
import { useTheme } from '../theme/ThemeContext.tsx';
import {
  authorizeGoogleDrive,
  buildBackupPackage,
  clearCachedDriveToken,
  downloadAndVerifyDriveBackup,
  getCachedDriveAccessToken,
  getCachedDriveEmail,
  getOrCreateDriveBackupsFolder,
  listBackupsFromDrive,
  uploadBackupToDrive,
} from '../services/googleAuthAndDrive.ts';

interface VaultFinanceAssistantBackupProps {
  activeTab: 'documents' | 'finance' | 'reminders' | 'backup' | 'assistant';
  slice: UserPrivateDatabaseSlice;
  selectedMonth: string;
  systemStatus: SystemCapabilitiesStatus | null;
  onSaveDocument: (doc: Partial<PersonalDocument>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onSaveReminder: (rem: Partial<PersonalReminder>) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
  onSaveFinance: (fin: Partial<FinanceTransaction>) => Promise<void>;
  onDeleteFinance: (id: string) => Promise<void>;
  onRestoreBackup: (backupSlice: Partial<UserPrivateDatabaseSlice>) => Promise<void>;
  onProfileUpdated?: () => Promise<void> | void;
  notify?: (msg: string, type?: 'success' | 'warning') => void;
}

export const VaultFinanceAssistantBackupView: React.FC<VaultFinanceAssistantBackupProps> = ({
  activeTab,
  slice,
  selectedMonth,
  systemStatus,
  onSaveDocument,
  onDeleteDocument,
  onSaveReminder,
  onDeleteReminder,
  onSaveFinance,
  onDeleteFinance,
  onRestoreBackup,
  onProfileUpdated,
  notify,
}) => {
  const { isDark } = useTheme();
  const currentEmp =
    slice.employments.find((e) => e.isCurrent) || slice.employments[slice.employments.length - 1];
  const salaryInfo = currentEmp
    ? resolveEffectiveSalaryForMonth(slice.salaryVersions, currentEmp.id, selectedMonth)
    : { basicSalary: 4600, actualWage: 7000 };

  // Document Vault state (Section 15)
  const [editingDocId, setEditingDocId] = useState<string | undefined>(undefined);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<DocumentCategory>('employment_contract');
  const [docIssueDate, setDocIssueDate] = useState('2025-01-01');
  const [docExpiryDate, setDocExpiryDate] = useState('2027-01-01');
  const [docTags, setDocTags] = useState('Qiwa, Official');
  const [docNotes, setDocNotes] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [docFileSize, setDocFileSize] = useState(0);
  const [docMime, setDocMime] = useState('application/pdf');
  const [docDataUrl, setDocDataUrl] = useState<string | undefined>(undefined);
  const [docError, setDocError] = useState<string | null>(null);
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  // Finance state (Section 17)
  const [editingFinId, setEditingFinId] = useState<string | undefined>(undefined);
  const [finDate, setFinDate] = useState(`${selectedMonth}-05`);
  const [finFlow, setFinFlow] = useState<FinanceTransaction['flowType']>('remittance');
  const [finCat, setFinCat] = useState<FinanceCategory>('family_remittance');
  const [finAmount, setFinAmount] = useState(3000);
  const [finDesc, setFinDesc] = useState('');
  const [finError, setFinError] = useState<string | null>(null);
  const [isSavingFin, setIsSavingFin] = useState(false);

  // Reminders state (Section 16)
  const [editingRemId, setEditingRemId] = useState<string | undefined>(undefined);
  const [remTitle, setRemTitle] = useState('');
  const [remCategory, setRemCategory] = useState<ReminderCategory>('iqama_expiry');
  const [remDate, setRemDate] = useState('2026-08-14');
  const [remLeadDays, setRemLeadDays] = useState(30);
  const [remNotes, setRemNotes] = useState('');
  const [remError, setRemError] = useState<string | null>(null);
  const [isSavingRem, setIsSavingRem] = useState(false);

  // Backup restore status
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  // Letter Generator state (Section 19)
  const [letterType, setLetterType] = useState<
    | 'salary_arrears'
    | 'overtime_claim'
    | 'leave_request'
    | 'resignation'
    | 'final_settlement'
    | 'salary_certificate'
    | 'experience_certificate'
  >('salary_arrears');
  const [copiedLetter, setCopiedLetter] = useState(false);

  if (activeTab === 'documents') {
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setDocFileName(f.name);
      setDocFileSize(f.size);
      setDocMime(f.type || 'application/octet-stream');
      if (!docTitle) setDocTitle(f.name.replace(/\.[^.]+$/, ''));
      const reader = new FileReader();
      reader.onload = () => setDocDataUrl(String(reader.result || ''));
      reader.readAsDataURL(f);
    };

    const handleAddDoc = async (e: React.FormEvent) => {
      e.preventDefault();
      setDocError(null);
      if (!docTitle.trim()) {
        setDocError('Document Title is required.');
        return;
      }
      setIsSavingDoc(true);
      try {
        const now = new Date().toISOString();
        const isEditing = Boolean(editingDocId);
        await onSaveDocument({
          id: editingDocId,
          employmentId: currentEmp?.id,
          category: docCategory,
          title: docTitle.trim(),
          issueDate: docIssueDate,
          expiryDate: docExpiryDate,
          tags: docTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          fileName: docFileName || `${docTitle.trim().replace(/\s+/g, '_')}.pdf`,
          fileSize: docFileSize || 125000,
          mimeType: docMime,
          dataUrl: docDataUrl,
          notes: docNotes,
          createdAt: now,
          updatedAt: now,
        });
        notify?.(
          isEditing ? `Updated document "${docTitle.trim()}".` : `Saved "${docTitle.trim()}" to Vault.`,
          'success',
        );
        setEditingDocId(undefined);
        setDocTitle('');
        setDocNotes('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save document.';
        setDocError(msg);
        notify?.(msg, 'warning');
      } finally {
        setIsSavingDoc(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">
                {editingDocId
                  ? 'Edit Personal Employment Document'
                  : 'Personal Employment Document Vault (Section 15)'}
              </h2>
              <p className="text-xs text-slate-400">
                Privately store your Qiwa contracts, Iqama/Passport copies, salary increment letters, Sehhaty medical certificates, and final settlement clearances.
              </p>
            </div>
            {editingDocId && (
              <button
                type="button"
                onClick={() => {
                  setEditingDocId(undefined);
                  setDocTitle('');
                  setDocNotes('');
                  setDocError(null);
                }}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {docError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
            >
              {docError}
            </div>
          )}

          <form noValidate onSubmit={handleAddDoc} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1">Document Title</label>
              <input
                type="text"
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Qiwa Contract Addendum 2026"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Category</label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value as DocumentCategory)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="employment_contract">Employment Contract (Qiwa)</option>
                <option value="salary_slip">Salary Slip</option>
                <option value="iqama_passport">Iqama / Passport Copy</option>
                <option value="salary_increment">Salary Increment / Promotion</option>
                <option value="leave_approval">Leave / Medical Certificate</option>
                <option value="insurance_card">Medical Insurance Card</option>
                <option value="experience_certificate">Experience Certificate</option>
                <option value="final_settlement">Final Settlement Clearance</option>
                <option value="bank_statement">Bank Statement / WPS Receipt</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Issue Date</label>
              <DateInputWithToday
                value={docIssueDate}
                onChange={setDocIssueDate}
                ariaLabel="Document Issue Date"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Expiry Date (Optional)</label>
              <DateInputWithToday
                value={docExpiryDate}
                onChange={setDocExpiryDate}
                ariaLabel="Document Expiry Date"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Attach File</label>
              <label className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-emerald-400 flex items-center justify-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span className="truncate">{docFileName || 'Choose PDF/Image'}</span>
                <input type="file" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
            <div className="sm:col-span-2">
              <input
                type="text"
                value={docTags}
                onChange={(e) => setDocTags(e.target.value)}
                placeholder="Tags (comma separated, e.g. Qiwa, Absher)"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div className="sm:col-span-3">
              <input
                type="text"
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                placeholder="Document notes or reference number"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingDoc}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
              >
                {isSavingDoc ? 'Saving...' : editingDocId ? 'Update Document' : '+ Save to Vault'}
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {slice.documents.length === 0 ? (
              <div className="col-span-full">
                <EmptyStateIllustration
                  type="documents"
                  title="No Vault Documents Saved"
                  description="Store confidential copies of your Qiwa contracts, salary increments, medical insurance cards, and Iqama/Passport copies securely."
                />
              </div>
            ) : (
              slice.documents.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <FolderLock className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{d.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocId(d.id);
                          setDocTitle(d.title);
                          setDocCategory(d.category);
                          setDocIssueDate(d.issueDate || '2025-01-01');
                          setDocExpiryDate(d.expiryDate || '');
                          setDocTags(d.tags.join(', '));
                          setDocNotes(d.notes || '');
                          setDocFileName(d.fileName);
                          setDocFileSize(d.fileSize);
                          setDocMime(d.mimeType);
                          setDocDataUrl(d.dataUrl);
                          setDocError(null);
                        }}
                        className="text-xs text-emerald-400 hover:underline font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDocument(d.id)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    File: {d.fileName} ({(d.fileSize / 1024).toFixed(0)} KB)
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Issued: {d.issueDate || 'N/A'} | Expires: {d.expiryDate || 'N/A'}
                  </div>
                  {d.notes && <p className="text-xs text-slate-300">{d.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap gap-1">
                    {d.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-emerald-300"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                  {d.dataUrl && (
                    <a
                      href={d.dataUrl}
                      download={d.fileName}
                      className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  )}
                </div>
              </div>
            )))}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'finance') {
    const handleAddFin = async (e: React.FormEvent) => {
      e.preventDefault();
      setFinError(null);
      if (!finDate) {
        setFinError('Transaction Date is required.');
        return;
      }
      if (!finAmount || finAmount <= 0) {
        setFinError('Transaction Amount must be greater than 0.');
        return;
      }
      setIsSavingFin(true);
      try {
        const isEditing = Boolean(editingFinId);
        await onSaveFinance({
          id: editingFinId,
          date: finDate,
          monthYear: finDate.slice(0, 7),
          category: finCat,
          flowType: finFlow,
          amount: finAmount,
          description: finDesc.trim() || finCat.replace('_', ' '),
          createdAt: new Date().toISOString(),
        });
        notify?.(
          isEditing
            ? 'Finance transaction updated.'
            : `Recorded SAR ${finAmount.toLocaleString()} (${finFlow}).`,
          'success',
        );
        setEditingFinId(undefined);
        setFinDesc('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save finance transaction.';
        setFinError(msg);
        notify?.(msg, 'warning');
      } finally {
        setIsSavingFin(false);
      }
    };

    const sumFlow = (ft: FinanceTransaction['flowType']) =>
      slice.finance.filter((f) => f.flowType === ft).reduce((s, f) => s + f.amount, 0);

    const totalIncome = sumFlow('income');
    const totalRemittance = sumFlow('remittance');
    const totalExpense = sumFlow('expense');
    const totalSavings = sumFlow('savings');

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-4 shadow-xs`}>
            <div className="text-xs text-slate-400">Salary & Bonus Income</div>
            <div className="text-xl font-bold text-emerald-500 font-mono tabular-nums mt-1">
              SAR {totalIncome.toLocaleString()}
            </div>
          </div>
          <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-4 shadow-xs`}>
            <div className="text-xs text-slate-400">Family Remittances Sent Home</div>
            <div className="text-xl font-bold text-sky-500 font-mono tabular-nums mt-1">
              SAR {totalRemittance.toLocaleString()}
            </div>
          </div>
          <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-4 shadow-xs`}>
            <div className="text-xs text-slate-400">Saudi Living Expenses</div>
            <div className="text-xl font-bold text-amber-500 font-mono tabular-nums mt-1">
              SAR {totalExpense.toLocaleString()}
            </div>
          </div>
          <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-4 shadow-xs`}>
            <div className="text-xs text-slate-400">Personal Savings Reserve</div>
            <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'} font-mono tabular-nums mt-1`}>
              SAR {totalSavings.toLocaleString()}
            </div>
          </div>
        </div>

        <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-6 shadow-xs space-y-4`}>
          <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'} pb-3`}>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {editingFinId
                  ? 'Edit Finance Transaction'
                  : 'Personal Finance, Family Remittance & Savings Ledger (Section 17)'}
              </h2>
            </div>
            {editingFinId && (
              <button
                type="button"
                onClick={() => {
                  setEditingFinId(undefined);
                  setFinDesc('');
                  setFinError(null);
                }}
                className="text-xs text-slate-400 hover:text-emerald-500 underline cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {finError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
            >
              {finError}
            </div>
          )}

          <form noValidate onSubmit={handleAddFin} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Date</label>
              <DateInputWithToday
                required
                value={finDate}
                onChange={setFinDate}
                ariaLabel="Finance Transaction Date"
                className={isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Transaction Type</label>
              <select
                value={finFlow}
                onChange={(e) => {
                  const ft = e.target.value as FinanceTransaction['flowType'];
                  setFinFlow(ft);
                  if (ft === 'remittance') setFinCat('family_remittance');
                  else if (ft === 'income') setFinCat('salary_income');
                  else if (ft === 'savings') setFinCat('savings_deposit');
                  else setFinCat('living_expenses');
                }}
                className={`w-full rounded-lg ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-2.5 py-1.5 text-xs`}
              >
                <option value="remittance">Family Remittance (Home Country)</option>
                <option value="expense">KSA Living Expense</option>
                <option value="savings">Personal Savings Deposit</option>
                <option value="income">Salary / Bonus Credit</option>
                <option value="loan_repayment">Loan / Advance Repayment</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Amount (SAR)</label>
              <NumericInput
                required
                value={finAmount}
                onValueChange={(val) => setFinAmount(val ?? 0)}
                min={0}
                ariaLabel="Finance Transaction Amount"
                className={`w-full rounded-lg ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-2.5 py-1.5 text-xs font-mono`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Description / Exchange Info</label>
              <input
                type="text"
                value={finDesc}
                onChange={(e) => setFinDesc(e.target.value)}
                placeholder="e.g. Sent via STC Pay / Tahweel Al Rajhi"
                className={`w-full rounded-lg ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-2.5 py-1.5 text-xs`}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isSavingFin}
                className="w-full py-2 px-3 rounded-xl bg-[#3B5BDB] hover:bg-[#324fbe] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer shadow-xs"
              >
                {isSavingFin ? 'Saving...' : editingFinId ? 'Update Entry' : '+ Add Entry'}
              </button>
            </div>
          </form>

          {slice.finance.length === 0 ? (
            <div className="py-4">
              <EmptyStateIllustration
                type="finance"
                title="No Financial Transactions Recorded"
                description="Track family remittances, STC Pay/Tahweel transfers, living expenses, and personal savings alongside your monthly salary."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Flow Type</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Amount (SAR)</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-slate-800/70' : 'divide-slate-200'}`}>
                  {slice.finance.map((f) => (
                    <tr key={f.id} className={isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50'}>
                      <td className={`py-2.5 px-3 font-mono ${isDark ? 'text-white' : 'text-slate-900'} tabular-nums`}>{f.date}</td>
                      <td className={`py-2.5 px-3 uppercase text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {f.flowType}
                      </td>
                      <td className={`py-2.5 px-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{f.description}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'} tabular-nums`}>
                        SAR {f.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFinId(f.id);
                            setFinDate(f.date);
                            setFinFlow(f.flowType);
                            setFinCat(f.category);
                            setFinAmount(f.amount);
                            setFinDesc(f.description);
                            setFinError(null);
                          }}
                          className="text-xs text-blue-500 hover:underline font-semibold cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteFinance(f.id)}
                          className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer"
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
      </div>
    );
  }

  if (activeTab === 'reminders') {
    const handleAddRem = async (e: React.FormEvent) => {
      e.preventDefault();
      setRemError(null);
      if (!remTitle.trim()) {
        setRemError('Reminder Title is required.');
        return;
      }
      if (!remDate) {
        setRemError('Target Due Date is required.');
        return;
      }
      setIsSavingRem(true);
      try {
        const isEditing = Boolean(editingRemId);
        await onSaveReminder({
          id: editingRemId,
          category: remCategory,
          title: remTitle.trim(),
          targetDate: remDate,
          leadNoticeDays: remLeadDays,
          completed: false,
          notes: remNotes,
          createdAt: new Date().toISOString(),
        });
        notify?.(
          isEditing ? `Updated reminder "${remTitle.trim()}".` : `Reminder "${remTitle.trim()}" saved.`,
          'success',
        );
        setEditingRemId(undefined);
        setRemTitle('');
        setRemNotes('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save reminder.';
        setRemError(msg);
        notify?.(msg, 'warning');
      } finally {
        setIsSavingRem(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className={`${isDark ? 'bg-[#131B2E] border-slate-800 text-white' : 'bg-white border-slate-200/90 text-slate-900'} border rounded-2xl p-6 shadow-xs space-y-5`}>
          <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'} pb-3`}>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              <div>
                <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {editingRemId
                    ? 'Edit Personal Expiry / Deadline Reminder'
                    : 'Personal Expiry & Deadline Reminders (Section 16)'}
                </h2>
                <p className="text-xs text-slate-400">
                  Track Iqama renewal, Passport expiry, 60-day Qiwa contract notice windows, medical insurance, and unpaid overtime follow-ups.
                </p>
              </div>
            </div>
            {editingRemId && (
              <button
                type="button"
                onClick={() => {
                  setEditingRemId(undefined);
                  setRemTitle('');
                  setRemNotes('');
                  setRemError(null);
                }}
                className="text-xs text-slate-400 hover:text-amber-500 underline cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {remError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium"
            >
              {remError}
            </div>
          )}

          <form noValidate onSubmit={handleAddRem} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-2">
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Reminder Title</label>
              <input
                type="text"
                required
                value={remTitle}
                onChange={(e) => setRemTitle(e.target.value)}
                placeholder="e.g. Renew Iqama 45 days before expiry"
                className={`w-full rounded-lg ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-2.5 py-1.5 text-xs`}
              />
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Category</label>
              <select
                value={remCategory}
                onChange={(e) => setRemCategory(e.target.value as ReminderCategory)}
                className={`w-full rounded-lg ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} px-2.5 py-1.5 text-xs`}
              >
                <option value="iqama_expiry">Iqama Expiry</option>
                <option value="passport_expiry">Passport Expiry</option>
                <option value="contract_expiry">Qiwa Contract Notice Deadline</option>
                <option value="insurance_expiry">Medical Insurance Renewal</option>
                <option value="claim_followup">Overtime / Arrears Follow-Up</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-1`}>Target Due Date</label>
              <DateInputWithToday
                required
                value={remDate}
                onChange={setRemDate}
                ariaLabel="Reminder Target Due Date"
                className={isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isSavingRem}
                className="w-full py-2 px-3 rounded-xl bg-[#3B5BDB] hover:bg-[#324fbe] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer shadow-xs"
              >
                {isSavingRem ? 'Saving...' : editingRemId ? 'Update Reminder' : '+ Add Reminder'}
              </button>
            </div>
          </form>

          {slice.reminders.length === 0 ? (
            <div className="py-4">
              <EmptyStateIllustration
                type="search"
                title="No Expiry Reminders Set"
                description="Add reminders for Iqama renewal deadlines, passport expiration, or Qiwa 60-day non-renewal notification windows."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {slice.reminders.map((r) => (
                <div
                  key={r.id}
                  className={`p-4 rounded-xl ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'} border flex items-center justify-between gap-3`}
                >
                  <div className="space-y-1">
                    <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.title}</div>
                    <div className="text-[11px] text-amber-500 font-mono">
                      Due Date: {r.targetDate} ({r.leadNoticeDays} days advance warning)
                    </div>
                    {r.notes && <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{r.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRemId(r.id);
                        setRemTitle(r.title);
                        setRemCategory(r.category);
                        setRemDate(r.targetDate);
                        setRemLeadDays(r.leadNoticeDays);
                        setRemNotes(r.notes || '');
                        setRemError(null);
                      }}
                      className="text-xs text-amber-500 hover:underline font-semibold cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReminder(r.id)}
                      className="text-rose-500 hover:text-rose-600 p-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeTab === 'assistant') {
    const empName = slice.profile.fullName;
    const empId = currentEmp?.employeeNumber || 'ARC-40918';
    const iqama = slice.profile.iqamaNumber || '2489 •••• 7312';
    const company = currentEmp?.employerName || 'Al-Riyadh Modern Engineering Co.';
    const role = currentEmp?.jobTitle || 'Senior MEP Supervisor';

    const generateBilingualLetter = (): { en: string; ar: string } => {
      switch (letterType) {
        case 'salary_arrears':
          return {
            en: `Date: ${new Date().toISOString().slice(0, 10)}\nTo: HR & Payroll Department, ${company}\nSubject: Request for Settlement of Pending Salary / Overtime Difference\n\nDear HR Manager,\nI, ${empName} (Employee ID: ${empId}, Iqama: ${iqama}, Position: ${role}), respectfully request a review of my recent payroll transfer for ${selectedMonth}. According to my employment contract (Monthly Package: SAR ${salaryInfo.actualWage.toFixed(2)}) and approved attendance/overtime sheet, there remains an unpaid balance in my bank transfer.\n\nKindly review the attached attendance and payslip reconciliation statement and credit the remaining balance in the upcoming Mudad WPS cycle.\n\nSincerely,\n${empName}`,
            ar: `التاريخ: ${new Date().toISOString().slice(0, 10)}\nإلى: إدارة الموارد البشرية والرواتب — ${company}\nالموضوع: طلب تسوية وصرف فروقات الراتب والعمل الإضافي لشهر ${selectedMonth}\n\nسعادة مدير الموارد البشرية المحترم،\nأتقدم إليكم أنا الموظف / ${empName} (الرقم الوظيفي: ${empId}، رقم الإقامة: ${iqama}، المسمى الوظيفي: ${role}) بطلب مراجعة الحوالة البنكية الخاصة براتب شهر ${selectedMonth}، حيث تبين وجود فرق غير مصروف مقارنة براتبي التعاقدي وساعات العمل الإضافي المعتمدة وفق المادة 107 من نظام العمل السعودي.\n\nأرجو التكرم بمراجعة كشف المطابقة المرفق وصرف الفروقات المستحقة. وتفضلوا بقبول فائق الاحترام.\n\nمقدمه / ${empName}`,
          };
        case 'overtime_claim':
          return {
            en: `Date: ${new Date().toISOString().slice(0, 10)}\nTo: Project Manager & HR Department, ${company}\nSubject: Overtime Hours Claim under Saudi Labor Law Article 107 (${selectedMonth})\n\nDear Management,\nPlease find attached my verified daily attendance and overtime log for ${selectedMonth}. Under Article 107 of the Saudi Labor Law, overtime hours are compensated at Actual Hourly Wage plus 50% of Basic Hourly Wage.\n\nKindly approve and include these hours in my payroll disbursement.\n\nRespectfully,\n${empName} (${empId})`,
            ar: `التاريخ: ${new Date().toISOString().slice(0, 10)}\nإلى: إدارة المشروع والموارد البشرية — ${company}\nالموضوع: مطالبة بصرف ساعات العمل الإضافي لشهر ${selectedMonth} وفق المادة 107\n\nتحية طيبة وبعد،\nمرفق لكم كشف الحضور وساعات العمل الإضافي الفعلية لشهر ${selectedMonth} للموظف ${empName} (${empId}). نأمل اعتماد الساعات وصرفها وفق المادة 107 من نظام العمل السعودي (أجر الساعة الفعلي مضافاً إليه 50% من الأجر الأساسي).\n\nمع خالص التقدير،\n${empName}`,
          };
        case 'leave_request':
          return {
            en: `Date: ${new Date().toISOString().slice(0, 10)}\nTo: HR Department, ${company}\nSubject: Official Annual Leave Application (Saudi Labor Law Article 109)\n\nDear Sir/Madam,\nI, ${empName} (${empId}), request approval for my accrued paid annual leave under Article 109 of the Saudi Labor Law, along with exit/re-entry visa issuance prior to travel.\n\nThank you,\n${empName}`,
            ar: `التاريخ: ${new Date().toISOString().slice(0, 10)}\nإلى: إدارة الموارد البشرية — ${company}\nالموضوع: طلب إجازة سنوية مدفوعة الأجر (المادة 109 من نظام العمل)\n\nأرجو الموافقة على منحي إجازتي السنوية المستحقة مدفوعة الأجر وإصدار تأشيرة الخروج والعودة.\n\nالموظف / ${empName} (${empId})`,
          };
        default:
          return {
            en: `Date: ${new Date().toISOString().slice(0, 10)}\nTo: HR & Personnel Department, ${company}\nSubject: Official Employment Request (${letterType.replace('_', ' ').toUpperCase()})\n\nI, ${empName} (Employee ID: ${empId}, Iqama: ${iqama}, Role: ${role}), hereby submit this formal request regarding my employment record and statutory entitlements under the Saudi Labor Law.\n\nSincerely,\n${empName}`,
            ar: `التاريخ: ${new Date().toISOString().slice(0, 10)}\nإلى: إدارة الموارد البشرية — ${company}\nالموضوع: طلب رسمي (${letterType.replace('_', ' ')})\n\nأتقدم أنا الموظف ${empName} (الرقم الوظيفي: ${empId}، رقم الإقامة: ${iqama}) بهذا الطلب الرسمي وفق أحكام نظام العمل السعودي.\n\nالموظف / ${empName}`,
          };
      }
    };

    const letters = generateBilingualLetter();

    return (
      <div className="space-y-6">
        {/* Bilingual Letter Generator (Section 19) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-emerald-400" />
              <div>
                <h2 className="text-base font-bold text-white">
                  Bilingual Employment Letter Generator (English + Arabic Side-by-Side)
                </h2>
                <p className="text-xs text-slate-400">
                  Auto-fills your personal profile, employer, contract salary, and Saudi Labor Law citations.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={letterType}
                onChange={(e) => setLetterType(e.target.value as typeof letterType)}
                className="w-full sm:w-auto rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
              >
                <option value="salary_arrears">1. Unpaid Salary / Arrears Request</option>
                <option value="overtime_claim">2. Overtime Claim Letter (Art. 107)</option>
                <option value="leave_request">3. Annual Leave Application (Art. 109)</option>
                <option value="final_settlement">4. Final Settlement & EOSB Request</option>
                <option value="resignation">5. Resignation / Non-Renewal Notice</option>
                <option value="salary_certificate">6. Salary Certificate Request</option>
                <option value="experience_certificate">7. Experience Certificate Request (Art. 64)</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${letters.en}\n\n---\n\n${letters.ar}`);
                  setCopiedLetter(true);
                  setTimeout(() => setCopiedLetter(false), 2500);
                }}
                className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>{copiedLetter ? 'Copied Both!' : 'Copy Bilingual Letter'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-emerald-400">English Draft</div>
              <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                {letters.en}
              </pre>
            </div>
            <div
              dir="rtl"
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-right"
            >
              <div className="text-xs font-semibold text-emerald-400">النص العربي الرسمي</div>
              <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                {letters.ar}
              </pre>
            </div>
          </div>
        </div>

        {/* Verified Saudi Labor Law Reference Guide (Section 19) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">
              Verified Saudi Labor Law Reference Guide (HRSD & Qiwa Statutory Rules)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {[
              {
                art: 'Articles 98 & 107 — Working Hours & Overtime Formula',
                body: 'Standard work is max 8 hours/day or 48 hours/week (reduced to 6h/day or 36h/week for Muslim workers during Ramadan). Overtime is paid at Actual Hourly Wage + 50% of Basic Hourly Wage. All hours worked on Friday weekly rest days or official Eid holidays count as overtime.',
              },
              {
                art: 'Articles 84, 85, 86 & 87 — End of Service Benefit (EOSB)',
                body: 'Full Award (Art. 84): 0.5 month actual wage for each of the first 5 years + 1.0 month for each subsequent year. Resignation (Art. 85): <2 years = 0%; 2 to <5 years = 1/3; 5 to <10 years = 2/3; ≥10 years = 100%. Force majeure or female worker marriage/childbirth within statutory windows (Art. 87) = 100%.',
              },
              {
                art: 'Articles 109 & 111 — Paid Annual Leave & Encashment',
                body: 'Minimum 21 paid days per year during the first 5 years of service, increasing to 30 paid days per year after completing 5 continuous years. Upon leaving employment (Art. 111), the worker is entitled to full cash payment for all accrued unused annual leave days.',
              },
              {
                art: 'Article 117 — Sick Leave Entitlement Tiers',
                body: 'With a valid medical certificate (Sehhaty), an employee is entitled up to 120 sick days in a single service year: first 30 days at 100% full pay, next 60 days at 75% pay, and final 30 days unpaid.',
              },
            ].map((item) => (
              <div
                key={item.art}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
              >
                <div className="font-bold text-emerald-400">{item.art}</div>
                <p className="text-slate-300 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // activeTab === 'backup' (Sections 21, 22, 25: Backup, Restore & Google Drive Storage)
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveBackingUp, setDriveBackingUp] = useState(false);
  const [driveBackupStep, setDriveBackupStep] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveBackupFile[] | null>(null);
  const [driveLoadingFiles, setDriveLoadingFiles] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<FullBackupPackage | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewIntegrity, setPreviewIntegrity] = useState<boolean | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [autoBackupPref, setAutoBackupPref] = useState(
    Boolean(slice.profile.autoBackupToDrive),
  );

  const activeDriveToken = getCachedDriveAccessToken();
  const isDriveAuthorized = Boolean(
    activeDriveToken || slice.profile.googleDriveConnected,
  );
  // Strictly separate Google Drive authorized email from basic Google Sign-In email
  const connectedDriveEmail =
    getCachedDriveEmail() ||
    (slice.profile.googleDriveConnected ? slice.profile.googleDriveEmail || null : null);

  const handleConnectDrive = async () => {
    setRestoreMsg(null);
    setDriveConnecting(true);
    try {
      const hintEmail =
        slice.profile.googleDriveEmail || slice.profile.googleEmail || undefined;
      const { accessToken, email } = await authorizeGoogleDrive(hintEmail);
      await apiUpdateProfile({
        googleDriveConnected: true,
        googleDriveEmail: email,
        googleDriveFolderName: 'Saudi Salary Pro Backups',
      });
      await onProfileUpdated?.();
      notify?.(`Connected to Google Drive as ${email} (drive.file scope).`, 'success');
      // Auto list files
      try {
        const files = await listBackupsFromDrive(accessToken);
        setDriveFiles(files);
      } catch {
        // Ignore listing error on first connect
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Drive connection failed.';
      setRestoreMsg(msg);
      notify?.(msg, 'warning');
    } finally {
      setDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    clearCachedDriveToken();
    try {
      await apiUpdateProfile({
        googleDriveConnected: false,
        googleDriveEmail: '',
      });
      await onProfileUpdated?.();
      setShowDisconnectModal(false);
      setDriveFiles(null);
      notify?.('Google Drive disconnected. Your local application data remains safe.', 'success');
    } catch (err) {
      notify?.(err instanceof Error ? err.message : 'Failed to disconnect.', 'warning');
    }
  };

  const handleBackupNowToDrive = async () => {
    setRestoreMsg(null);
    setDriveBackingUp(true);
    setDriveBackupStep('1. Authorizing Google Drive...');
    try {
      let token = getCachedDriveAccessToken();
      let authorizedEmail = getCachedDriveEmail() || slice.profile.googleDriveEmail;
      if (!token) {
        const hintEmail =
          slice.profile.googleDriveEmail || slice.profile.googleEmail || undefined;
        const authRes = await authorizeGoogleDrive(hintEmail);
        token = authRes.accessToken;
        authorizedEmail = authRes.email;
      }

      setDriveBackupStep('2. Compiling and sealing private records...');
      const { packageData, checksum } = await buildBackupPackage(slice);

      setDriveBackupStep('3. Locating "Saudi Salary Pro Backups" folder...');
      const folderId = await getOrCreateDriveBackupsFolder(token);

      setDriveBackupStep('4. Uploading multipart JSON backup...');
      const uploadRes = await uploadBackupToDrive(token, folderId, packageData);

      const now = new Date().toISOString();
      await apiUpdateProfile({
        lastDriveBackupAt: now,
        lastBackupAt: now,
        googleDriveFolderId: folderId,
        googleDriveFolderName: 'Saudi Salary Pro Backups',
        googleDriveConnected: true,
        ...(authorizedEmail ? { googleDriveEmail: authorizedEmail } : {}),
      });
      await onProfileUpdated?.();

      setDriveBackupStep('5. Verification complete!');
      notify?.(
        `Backup "${uploadRes.fileName}" (${(uploadRes.size / 1024).toFixed(1)} KB) saved to Google Drive. SHA-256: ${checksum.slice(0, 10)}...`,
        'success',
      );
      setRestoreMsg(`Successfully backed up to Google Drive at ${new Date().toLocaleTimeString()}!`);

      // Refresh file list if open
      try {
        const files = await listBackupsFromDrive(token);
        setDriveFiles(files);
      } catch {
        // Ignore
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to backup to Google Drive.';
      setRestoreMsg(msg);
      notify?.(msg, 'warning');
    } finally {
      setDriveBackingUp(false);
      setTimeout(() => setDriveBackupStep(null), 3000);
    }
  };

  const handleFetchDriveFiles = async () => {
    setDriveLoadingFiles(true);
    try {
      let token = getCachedDriveAccessToken();
      if (!token) {
        const hintEmail =
          slice.profile.googleDriveEmail || slice.profile.googleEmail || undefined;
        const authRes = await authorizeGoogleDrive(hintEmail);
        token = authRes.accessToken;
        await apiUpdateProfile({
          googleDriveConnected: true,
          googleDriveEmail: authRes.email,
          googleDriveFolderName: 'Saudi Salary Pro Backups',
        });
        await onProfileUpdated?.();
      }
      const files = await listBackupsFromDrive(token);
      setDriveFiles(files);
      if (files.length === 0) {
        notify?.('No previous backups found in your Google Drive folder yet.', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch Google Drive backups.';
      setRestoreMsg(msg);
      notify?.(msg, 'warning');
    } finally {
      setDriveLoadingFiles(false);
    }
  };

  const handleInspectDriveBackup = async (fileId: string) => {
    setPreviewLoading(true);
    setPreviewFileId(fileId);
    try {
      let token = getCachedDriveAccessToken();
      if (!token) {
        const hintEmail =
          slice.profile.googleDriveEmail || slice.profile.googleEmail || undefined;
        const authRes = await authorizeGoogleDrive(hintEmail);
        token = authRes.accessToken;
        await apiUpdateProfile({
          googleDriveConnected: true,
          googleDriveEmail: authRes.email,
          googleDriveFolderName: 'Saudi Salary Pro Backups',
        });
        await onProfileUpdated?.();
      }
      const { packageData, integrityPassed } = await downloadAndVerifyDriveBackup(token, fileId);
      setPreviewBackup(packageData);
      setPreviewIntegrity(integrityPassed);
    } catch (err) {
      notify?.(err instanceof Error ? err.message : 'Failed to download backup for preview.', 'warning');
      setPreviewBackup(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmRestoreFromDrive = async () => {
    if (!previewBackup) return;
    try {
      await onRestoreBackup(previewBackup.slice);
      setRestoreMsg('Personal records successfully restored from Google Drive backup!');
      notify?.('Backup restored successfully!', 'success');
      setPreviewBackup(null);
      setPreviewFileId(null);
    } catch (err) {
      notify?.(err instanceof Error ? err.message : 'Restore failed.', 'warning');
    }
  };

  const handleToggleAutoBackup = async (enabled: boolean) => {
    setAutoBackupPref(enabled);
    try {
      await apiUpdateProfile({ autoBackupToDrive: enabled });
      notify?.(
        enabled
          ? 'Auto-backup preference enabled.'
          : 'Auto-backup preference disabled.',
        'success',
      );
    } catch {
      // Ignore
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const candidateSlice = parsed.slice || parsed;
        await onRestoreBackup(candidateSlice);
        setRestoreMsg('Personal backup successfully restored into your isolated account!');
        notify?.('Local backup restored successfully!', 'success');
      } catch (err) {
        setRestoreMsg(err instanceof Error ? err.message : 'Invalid JSON backup file.');
        notify?.('Failed to restore JSON file.', 'warning');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Google Drive Personal Storage Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-950 border border-sky-600/40 flex items-center justify-center text-sky-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Personal Google Drive Cloud Storage
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                    isDriveAuthorized
                      ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{isDriveAuthorized ? 'CONNECTED' : 'DISCONNECTED'}</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Uses the least-privilege <code className="text-sky-300">drive.file</code> scope. The app can ONLY access its own backup folder and cannot view any of your other private Google Drive files.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isDriveAuthorized ? (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={driveConnecting}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-2 transition shadow-sm"
              >
                <HardDrive className="w-4 h-4" />
                <span>{driveConnecting ? 'Connecting...' : 'Connect Google Drive'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 text-xs text-slate-300 hover:text-rose-200 transition"
              >
                Disconnect Drive
              </button>
            )}
          </div>
        </div>

        {/* Status Banner */}
        {restoreMsg && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{restoreMsg}</span>
          </div>
        )}

        {/* Drive Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              Authorized Google Account
            </div>
            <div className="font-semibold text-white truncate">
              {connectedDriveEmail || 'Not authorized yet'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              Storage Location
            </div>
            <div className="font-semibold text-sky-300">
              Folder: Saudi Salary Pro Backups
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              Last Cloud Backup
            </div>
            <div className="font-semibold text-emerald-400">
              {slice.profile.lastDriveBackupAt
                ? new Date(slice.profile.lastDriveBackupAt).toLocaleString()
                : 'No backup uploaded yet'}
            </div>
          </div>
        </div>

        {/* Drive Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBackupNowToDrive}
              disabled={driveBackingUp}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-2 transition shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>
                {driveBackingUp
                  ? driveBackupStep || 'Backing up...'
                  : 'Back Up Now to Google Drive'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleFetchDriveFiles}
              disabled={driveLoadingFiles}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${driveLoadingFiles ? 'animate-spin' : ''}`} />
              <span>{driveLoadingFiles ? 'Searching Drive...' : 'Browse Backups in Drive'}</span>
            </button>
          </div>

          {/* Auto Backup Toggle */}
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoBackupPref}
              onChange={(e) => handleToggleAutoBackup(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span>Auto-backup reminder on major updates</span>
          </label>
        </div>

        {/* Google Drive Backup Files List */}
        {driveFiles && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-sky-400" />
                <span>Found Backups in Google Drive ({driveFiles.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setDriveFiles(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Hide List
              </button>
            </div>

            {driveFiles.length === 0 ? (
              <div className="py-4">
                <EmptyStateIllustration
                  type="backup"
                  title="No Drive Backups Found"
                  description="No backup files currently exist in your 'Saudi Salary Pro Backups' Google Drive folder. Click 'Back Up Now to Google Drive' to create your first encrypted backup."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 px-3">File Name</th>
                      <th className="py-2 px-3">Created Date</th>
                      <th className="py-2 px-3">Size</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {driveFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-mono text-white font-medium">{file.name}</td>
                        <td className="py-2 px-3 text-slate-400">
                          {new Date(file.createdTime).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-300 font-mono">
                          {file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : 'JSON file'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectDriveBackup(file.id)}
                            disabled={previewLoading && previewFileId === file.id}
                            className="px-2.5 py-1 rounded bg-sky-600/20 hover:bg-sky-600 border border-sky-500/40 text-sky-300 hover:text-white font-semibold text-[11px] inline-flex items-center gap-1 transition"
                          >
                            <Eye className="w-3 h-3" />
                            <span>
                              {previewLoading && previewFileId === file.id
                                ? 'Downloading...'
                                : 'Inspect & Restore'}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pre-Restore Preview Modal */}
      {previewBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Google Drive Backup Integrity & Preview
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBackup(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Export Timestamp:</span>
                <span className="font-mono text-white">
                  {new Date(previewBackup.metadata.exportedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Account Email:</span>
                <span className="font-semibold text-white">{previewBackup.metadata.userEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Format Version:</span>
                <span className="font-mono text-emerald-400">
                  Version {previewBackup.metadata.backupVersion}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">SHA-256 Checksum:</span>
                <span className="font-mono text-[11px] text-sky-300 truncate max-w-[280px]">
                  {previewBackup.metadata.checksum}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {previewIntegrity ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-semibold text-[11px] flex items-center gap-1">
                    <Check className="w-3 h-3" /> Checksum Verified — Zero Data Corruption
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-semibold text-[11px]">
                    Checksum check skipped
                  </span>
                )}
              </div>
            </div>

            {/* Record Breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Records Contained in this Snapshot:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {Object.entries(previewBackup.metadata.recordCounts || {}).map(([key, val]) => (
                  <div
                    key={key}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                    <span className="font-bold text-white font-mono">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning Callout */}
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-700/60 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                Restoring will replace your current active records with this backup snapshot. Your records will be saved into your isolated server database.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPreviewBackup(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreFromDrive}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Restore Snapshot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Google Drive Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950 border border-rose-600/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Disconnect Google Drive?</h3>
                <p className="text-xs text-slate-400">
                  Are you sure you want to disconnect Google Drive?
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Disconnecting clears the authorization token from this session. <strong>None of your existing Saudi Salary Pro data or existing Google Drive backup files will be deleted.</strong> You can reconnect at any time.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
              >
                Yes, Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Manual JSON Backup & Restore (Offline Support) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-base font-bold text-white">
            Local JSON Backup & Restore (Offline File Export)
          </h2>
          <p className="text-xs text-slate-400">
            Export a portable, human-readable JSON backup directly to your device. Ideal for offline archival, air-gapped computers, or transferring records between devices.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export Complete Personal Backup (JSON)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Downloads all your employment periods, salary versions, daily attendance, overtime ledger, leaves, payslips, documents, reminders, and finance logs into a single file.
            </p>
            <button
              type="button"
              onClick={() => exportUserBackupJSON(slice)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Personal JSON Backup</span>
            </button>
          </div>

          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-sky-400" />
              <span>Restore Personal Backup File</span>
            </h3>
            <p className="text-xs text-slate-400">
              Select a previously exported Saudi Salary Pro v2.0 JSON backup file. All records will be validated and bound to your private user ID ({slice.user.id}).
            </p>
            <label className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Select JSON Backup to Restore</span>
              <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
            </label>
          </div>
        </div>

        {/* Honest External Configuration & Integration Disclosure */}
        <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Cloud className="w-4 h-4 text-emerald-400" />
            <span>Environment & External Integration Status (Honest Disclosure)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-white">Server-Side User Isolation Store</div>
                <p className="text-slate-400 text-[11px]">
                  Active Express server-side store (.data/saudi_salary_pro_v2.json) with scrypt password hashing & HMAC bearer session verification.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 text-[10px] font-semibold shrink-0">
                ACTIVE
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-white">Google Drive Personal Backup Sync</div>
                <p className="text-slate-400 text-[11px]">
                  Configured with least-privilege <code className="text-sky-300">drive.file</code> scope. Uses in-memory OAuth token caching.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 text-[10px] font-semibold shrink-0">
                CONFIGURED
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-white">Gemini Vision Payslip OCR (/api/ocr/payslip)</div>
                <p className="text-slate-400 text-[11px]">
                  {systemStatus?.geminiOcrAndAssistantConfigured
                    ? 'Server-side GEMINI_API_KEY is configured and active.'
                    : 'Requires GEMINI_API_KEY in server environment; falls back to manual candidate review form when unconfigured.'}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                  systemStatus?.geminiOcrAndAssistantConfigured
                    ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                    : 'bg-amber-950 border border-amber-700 text-amber-300'
                }`}
              >
                {systemStatus?.geminiOcrAndAssistantConfigured ? 'CONFIGURED' : 'MANUAL REVIEW MODE'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-white">Email / Push Expiry Notifications</div>
                <p className="text-slate-400 text-[11px]">
                  In-app expiry reminders are active. Background email/push alerts require external SMTP/VAPID worker setup.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold shrink-0">
                IN-APP ONLY
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
