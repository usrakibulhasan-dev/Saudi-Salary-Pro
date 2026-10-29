import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import type {
  AttendanceStatus,
  DailyAttendanceRecord,
  LeaveCategory,
  LeaveRecord,
  OvertimeApprovalStatus,
  OvertimeLedgerEntry,
  ShiftType,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';
import {
  calculateAttendanceMetrics,
  calculateLeaveSummary,
  calculateOvertimePay,
  generateMonthlyAttendanceReport,
  hoursAndMinutesToDecimal,
  resolveEffectiveSalaryForMonth,
} from '../engine/calculations.ts';
import {
  exportMonthlyAttendanceCSV,
  exportMonthlyAttendanceExcel,
  exportMonthlyAttendancePDF,
} from '../utils/exportUtils.ts';
import {
  DateInputWithToday,
  MonthInputWithToday,
  NumericInput,
} from './FormInputs.tsx';
import { EmptyStateIllustration } from './Illustrations.tsx';

interface AttendanceOvertimeLeaveProps {
  activeTab: 'attendance' | 'overtime' | 'leave' | 'reports';
  slice: UserPrivateDatabaseSlice;
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  notify?: (msg: string, type?: 'success' | 'warning') => void;
  onSaveAttendance: (rec: Partial<DailyAttendanceRecord>) => Promise<void>;
  onDeleteAttendance: (id: string) => Promise<void>;
  onSaveOvertime: (rec: Partial<OvertimeLedgerEntry>) => Promise<void>;
  onDeleteOvertime: (id: string) => Promise<void>;
  onSaveLeave: (rec: Partial<LeaveRecord>) => Promise<void>;
  onDeleteLeave: (id: string) => Promise<void>;
}

export const AttendanceOvertimeLeaveView: React.FC<AttendanceOvertimeLeaveProps> = ({
  activeTab,
  slice,
  selectedMonth,
  onMonthChange,
  notify,
  onSaveAttendance,
  onDeleteAttendance,
  onSaveOvertime,
  onDeleteOvertime,
  onSaveLeave,
  onDeleteLeave,
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

  // Attendance form state
  const [editingAttId, setEditingAttId] = useState<string | undefined>(undefined);
  const [isSavingAtt, setIsSavingAtt] = useState(false);
  const [attFilterMode, setAttFilterMode] = useState<'month' | 'week' | 'day'>('month');
  const [attDate, setAttDate] = useState(`${selectedMonth}-07`);
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('present');
  const [attShift, setAttShift] = useState<ShiftType>('day');
  const [schedStart, setSchedStart] = useState('07:00');
  const [schedEnd, setSchedEnd] = useState('16:00');
  const [clockIn, setClockIn] = useState('07:00');
  const [clockOut, setClockOut] = useState('17:30');
  const [breakMins, setBreakMins] = useState(60);
  const [isWeeklyRest, setIsWeeklyRest] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [attLocation, setAttLocation] = useState(currentEmp?.workLocation || 'Riyadh Site');
  const [attNotes, setAttNotes] = useState('');
  const [attWarning, setAttWarning] = useState<string | null>(null);

  // Overtime calculator & ledger state
  const [editingOtId, setEditingOtId] = useState<string | undefined>(undefined);
  const [isSavingOt, setIsSavingOt] = useState(false);
  const [otError, setOtError] = useState<string | null>(null);
  const [otDate, setOtDate] = useState(`${selectedMonth}-08`);
  const [otHours, setOtHours] = useState<number | undefined>(2);
  const [otMinutes, setOtMinutes] = useState<number | undefined>(30);
  const [otType, setOtType] = useState<'regular_day' | 'weekly_rest' | 'public_holiday'>('regular_day');
  const [otApproval, setOtApproval] = useState<OvertimeApprovalStatus>('approved');
  const [otDivisorDays, setOtDivisorDays] = useState(30);
  const [otDivisorHours, setOtDivisorHours] = useState(currentEmp?.expectedDailyHours || 8);
  const [otNotes, setOtNotes] = useState('');

  // Leave form state
  const [editingLvId, setEditingLvId] = useState<string | undefined>(undefined);
  const [isSavingLv, setIsSavingLv] = useState(false);
  const [lvError, setLvError] = useState<string | null>(null);
  const [lvStart, setLvStart] = useState('2026-04-10');
  const [lvEnd, setLvEnd] = useState('2026-04-14');
  const [lvDays, setLvDays] = useState<number | undefined>(5);
  const [lvType, setLvType] = useState<LeaveCategory>('annual_leave');
  const [lvApproval, setLvApproval] = useState<OvertimeApprovalStatus>('approved');
  const [lvReason, setLvReason] = useState('');

  const liveMetrics = calculateAttendanceMetrics({
    status: attStatus,
    shiftType: attShift,
    scheduledStart: schedStart,
    scheduledEnd: schedEnd,
    clockIn,
    clockOut,
    breakMinutes: breakMins,
    expectedDailyHours: currentEmp?.expectedDailyHours || 8,
    isWeeklyRestDay: isWeeklyRest,
    isPublicHoliday: isHoliday,
  });

  if (activeTab === 'attendance') {
    const handleAddAttendance = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSavingAtt) return;
      setAttWarning(null);

      if (!attDate || !/^\d{4}-\d{2}-\d{2}$/.test(attDate)) {
        const msg = 'Please select a valid Work Date before saving.';
        setAttWarning(msg);
        notify?.(msg, 'warning');
        return;
      }
      if (attStatus === 'present' && (!clockIn || !clockOut)) {
        const msg = 'Please enter both Clock-In and Clock-Out times for a Present shift.';
        setAttWarning(msg);
        notify?.(msg, 'warning');
        return;
      }
      if (liveMetrics.validationErrors.length > 0) {
        const msg = liveMetrics.validationErrors.join(' ');
        setAttWarning(msg);
        notify?.(msg, 'warning');
        return;
      }

      const existingTarget = editingAttId
        ? slice.attendance.find((r) => r.id === editingAttId)
        : slice.attendance.find(
            (r) => r.date === attDate && r.employmentId === (currentEmp?.id || ''),
          );
      const isUpdating = Boolean(existingTarget?.id);
      const now = new Date().toISOString();

      setIsSavingAtt(true);
      try {
        await onSaveAttendance({
          id: existingTarget?.id,
          employmentId: currentEmp?.id || 'emp-default',
          date: attDate,
          status: attStatus,
          shiftType: attShift,
          scheduledStart: schedStart,
          scheduledEnd: schedEnd,
          clockIn,
          clockOut,
          breakMinutes: breakMins,
          elapsedHours: liveMetrics.elapsedHours,
          netWorkingHours: liveMetrics.netWorkingHours,
          regularScheduledHours: liveMetrics.regularScheduledHours,
          userRecordedOvertimeHours: liveMetrics.userRecordedOvertimeHours,
          estimatedPayableOvertimeHours: liveMetrics.estimatedPayableOvertimeHours,
          isWeeklyRestDay: isWeeklyRest,
          isPublicHoliday: isHoliday,
          isIncomplete: liveMetrics.isIncomplete,
          workLocation: attLocation,
          notes: attNotes,
          changeHistory: [
            ...(existingTarget?.changeHistory || []),
            {
              timestamp: now,
              summary: isUpdating
                ? `Updated attendance for ${attDate} (${liveMetrics.netWorkingHours}h net)`
                : `Logged ${attStatus} (${liveMetrics.netWorkingHours}h net)`,
            },
          ],
          createdAt: existingTarget?.createdAt || now,
          updatedAt: now,
        });

        // Automatically sync selectedMonth if the saved record is in a different month so it is immediately visible
        const savedMonth = attDate.slice(0, 7);
        if (savedMonth && savedMonth !== selectedMonth) {
          onMonthChange(savedMonth);
        }

        setEditingAttId(undefined);
        setAttNotes('');
        notify?.(
          isUpdating
            ? `Attendance record for ${attDate} updated successfully.`
            : `Attendance record for ${attDate} saved successfully.`,
          'success',
        );
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Failed to save attendance record. Please try again.';
        setAttWarning(errMsg);
        notify?.(errMsg, 'warning');
      } finally {
        setIsSavingAtt(false);
      }
    };

    const filteredAttendance = slice.attendance
      .filter((r) => {
        if (attFilterMode === 'month') return r.date.startsWith(selectedMonth);
        if (attFilterMode === 'day') return r.date === attDate;
        // 'week': within 7 days of attDate
        const diff =
          Math.abs(new Date(r.date).getTime() - new Date(attDate).getTime()) /
          (1000 * 60 * 60 * 24);
        return diff <= 7;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return (
      <div className="space-y-6">
        {/* Daily Attendance Logger */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                {editingAttId
                  ? `Edit Attendance Record (${attDate})`
                  : 'Daily Attendance & Working-Hours Tracker (Section 7)'}
              </h2>
              <p className="text-xs text-slate-400">
                Supports day shifts, overnight shifts crossing midnight, break deductions, and separates Elapsed, Net Working, Regular, and Payable Overtime hours.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingAttId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAttId(undefined);
                    setAttNotes('');
                    setAttWarning(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  Cancel Edit
                </button>
              )}
              <label className="text-xs text-slate-400">Payroll Month:</label>
              <MonthInputWithToday
                value={selectedMonth}
                onChange={onMonthChange}
                ariaLabel="Attendance Payroll Month"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
          </div>

          {attWarning && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700/70 text-xs text-rose-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{attWarning}</span>
            </div>
          )}

          <form noValidate onSubmit={handleAddAttendance} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Work Date *</label>
                <DateInputWithToday
                  required
                  value={attDate}
                  onChange={setAttDate}
                  ariaLabel="Attendance Work Date"
                  className="bg-slate-950 border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Attendance Status</label>
                <select
                  value={attStatus}
                  onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="present">Present (Worked)</option>
                  <option value="weekly_off">Weekly Rest Day</option>
                  <option value="public_holiday">Official Public Holiday</option>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="sick_leave">Sick Leave</option>
                  <option value="emergency_leave">Emergency Leave</option>
                  <option value="unpaid_leave">Unpaid Leave</option>
                  <option value="absent">Unexcused Absence</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Shift Type</label>
                <select
                  value={attShift}
                  onChange={(e) => {
                    const s = e.target.value as ShiftType;
                    setAttShift(s);
                    if (s === 'night') {
                      setSchedStart('21:00');
                      setSchedEnd('06:00');
                      setClockIn('21:00');
                      setClockOut('07:00');
                    } else {
                      setSchedStart('07:00');
                      setSchedEnd('16:00');
                      setClockIn('07:00');
                      setClockOut('17:30');
                    }
                  }}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="day">Day Shift</option>
                  <option value="night">Night Shift (Overnight)</option>
                  <option value="rotating">Rotating Shift</option>
                  <option value="custom">Custom Schedule</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Actual Clock-In</label>
                <input
                  type="time"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Actual Clock-Out</label>
                <input
                  type="time"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Break (Minutes)</label>
                <NumericInput
                  min={0}
                  max={240}
                  value={breakMins}
                  onValueChange={(val) => setBreakMins(val ?? 0)}
                  ariaLabel="Break Minutes"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isWeeklyRest}
                    onChange={(e) => setIsWeeklyRest(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <span>Worked on Weekly Rest Day (Friday)</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHoliday}
                    onChange={(e) => setIsHoliday(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <span>Public Holiday</span>
                </label>
              </div>
              <input
                type="text"
                value={attLocation}
                onChange={(e) => setAttLocation(e.target.value)}
                placeholder="Work Location / Project Site"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={attNotes}
                onChange={(e) => setAttNotes(e.target.value)}
                placeholder="Task notes (e.g. Chiller testing after shift)"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>

            {/* Live 5-Part Working Hours Preview Strip (A-E from Section 7) */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 flex-1 text-xs">
                <div>
                  <span className="text-slate-400 block">A. Elapsed Clock Time</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {liveMetrics.elapsedHours.toFixed(2)} hrs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">B. Net Working Hours</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {liveMetrics.netWorkingHours.toFixed(2)} hrs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">C. Regular Scheduled</span>
                  <span className="font-mono font-bold text-slate-200 tabular-nums">
                    {liveMetrics.regularScheduledHours.toFixed(2)} hrs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">D. User-Recorded OT</span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {liveMetrics.userRecordedOvertimeHours.toFixed(2)} hrs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">E. Est. Payable OT</span>
                  <span className="font-mono font-bold text-amber-400 tabular-nums">
                    {liveMetrics.estimatedPayableOvertimeHours.toFixed(2)} hrs
                  </span>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSavingAtt}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isSavingAtt
                    ? 'Saving...'
                    : editingAttId
                      ? 'Update Attendance Entry'
                      : 'Save Attendance Entry'}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Daily / Weekly / Monthly Attendance Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white">
              Recorded Attendance Log ({filteredAttendance.length} entries shown)
            </h3>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {(['month', 'week', 'day'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAttFilterMode(mode)}
                  className={`px-3 py-1 rounded capitalize ${
                    attFilterMode === mode
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode} View
                </button>
              ))}
            </div>
          </div>

          {filteredAttendance.length === 0 ? (
            <EmptyStateIllustration
              type="attendance"
              title="No Attendance Entries Found"
              description="Log your daily clock-in/out, shift details, and break durations to track net working hours and calculate statutory overtime."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Shift</th>
                  <th className="py-2.5 px-3">Clock In / Out</th>
                  <th className="py-2.5 px-3 text-right">Break</th>
                  <th className="py-2.5 px-3 text-right">Elapsed</th>
                  <th className="py-2.5 px-3 text-right">Net Hrs</th>
                  <th className="py-2.5 px-3 text-right">Reg Hrs</th>
                  <th className="py-2.5 px-3 text-right">Payable OT</th>
                  <th className="py-2.5 px-3">Location & Notes</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredAttendance.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-950/60">
                    <td className="py-2.5 px-3 font-mono text-white tabular-nums">{r.date}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 capitalize">
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 capitalize text-slate-300">{r.shiftType}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 tabular-nums">
                      {r.clockIn || '--:--'} → {r.clockOut || '--:--'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {r.breakMinutes}m
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {r.elapsedHours.toFixed(2)}h
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400 tabular-nums">
                      {r.netWorkingHours.toFixed(2)}h
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {r.regularScheduledHours.toFixed(2)}h
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300 tabular-nums">
                      +{r.estimatedPayableOvertimeHours.toFixed(2)}h
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                      {r.workLocation} {r.notes ? `— ${r.notes}` : ''}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAttId(r.id);
                          setAttDate(r.date);
                          setAttStatus(r.status);
                          setAttShift(r.shiftType);
                          setSchedStart(r.scheduledStart || '07:00');
                          setSchedEnd(r.scheduledEnd || '16:00');
                          setClockIn(r.clockIn || '07:00');
                          setClockOut(r.clockOut || '16:00');
                          setBreakMins(r.breakMinutes ?? 60);
                          setIsWeeklyRest(Boolean(r.isWeeklyRestDay));
                          setIsHoliday(Boolean(r.isPublicHoliday));
                          setAttLocation(r.workLocation || '');
                          setAttNotes(r.notes || '');
                          setAttWarning(null);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold text-xs px-1.5 py-0.5"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onDeleteAttendance(r.id);
                            notify?.(`Deleted attendance record for ${r.date}.`, 'success');
                          } catch (err) {
                            notify?.(
                              err instanceof Error ? err.message : 'Failed to delete attendance.',
                              'warning',
                            );
                          }
                        }}
                        className="text-rose-400 hover:text-rose-300 p-1 inline-flex items-center"
                        aria-label={`Delete attendance ${r.date}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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

  if (activeTab === 'overtime') {
    const decimalHrs = hoursAndMinutesToDecimal(otHours ?? 0, otMinutes ?? 0);
    const otCalc = calculateOvertimePay({
      basicSalary: salaryInfo.basicSalary,
      actualSalary: salaryInfo.actualWage,
      overtimeDecimalHours: decimalHrs,
      monthlyDaysDivisor: otDivisorDays,
      dailyHoursDivisor: otDivisorHours,
      basis: 'saudi_art_107',
    });

    const handleAddOvertime = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSavingOt) return;
      setOtError(null);

      if (!otDate || !/^\d{4}-\d{2}-\d{2}$/.test(otDate)) {
        const msg = 'Please select a valid Overtime Date before saving.';
        setOtError(msg);
        notify?.(msg, 'warning');
        return;
      }
      if (decimalHrs <= 0) {
        const msg = 'Overtime duration must be greater than zero. Please enter hours or minutes.';
        setOtError(msg);
        notify?.(msg, 'warning');
        return;
      }

      setIsSavingOt(true);
      try {
        await onSaveOvertime({
          id: editingOtId,
          employmentId: currentEmp?.id || 'emp-default',
          date: otDate,
          hours: otHours ?? 0,
          minutes: otMinutes ?? 0,
          decimalHours: decimalHrs,
          overtimeType: otType,
          approvalStatus: otApproval,
          estimatedAmount: otCalc.statutoryArt107Amount,
          notes: otNotes,
          createdAt: new Date().toISOString(),
        });
        const wasEditing = Boolean(editingOtId);
        setEditingOtId(undefined);
        setOtNotes('');
        notify?.(
          wasEditing
            ? `Overtime entry for ${otDate} updated.`
            : `Saved ${decimalHrs.toFixed(2)}h overtime entry for ${otDate}.`,
          'success',
        );
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Failed to save overtime record. Please try again.';
        setOtError(errMsg);
        notify?.(errMsg, 'warning');
      } finally {
        setIsSavingOt(false);
      }
    };

    const totalApprovedOT = slice.overtimeLedger
      .filter((o) => o.approvalStatus === 'approved')
      .reduce((s, o) => s + o.decimalHours, 0);
    const totalPendingOT = slice.overtimeLedger
      .filter((o) => o.approvalStatus === 'pending')
      .reduce((s, o) => s + o.decimalHours, 0);

    return (
      <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                {editingOtId
                  ? `Edit Overtime Entry (${otDate})`
                  : 'Saudi Labor Law Article 107 Overtime Calculator & Daily Ledger (Section 8)'}
              </h2>
              <p className="text-xs text-slate-400">
                Official Formula: Actual Hourly Wage (SAR {otCalc.actualHourlyWage}/hr) + 50% of Basic Hourly Wage (SAR {(otCalc.basicHourlyWage * 0.5).toFixed(2)}/hr) = SAR {otCalc.statutoryHourlyRate}/hr. Minutes are converted accurately (e.g. 2h 30m = 2.50 decimal hours).
              </p>
            </div>
            {editingOtId && (
              <button
                type="button"
                onClick={() => {
                  setEditingOtId(undefined);
                  setOtNotes('');
                  setOtError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {otError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700/70 text-xs text-rose-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{otError}</span>
            </div>
          )}

          <form
            noValidate
            onSubmit={handleAddOvertime}
            className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          >
            <div>
              <label className="block text-xs text-slate-300 mb-1">Overtime Date *</label>
              <DateInputWithToday
                required
                value={otDate}
                onChange={setOtDate}
                ariaLabel="Overtime Date"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Hours</label>
              <NumericInput
                min={0}
                max={24}
                value={otHours}
                onValueChange={(val) => setOtHours(val)}
                ariaLabel="Overtime Hours"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Minutes (0–59)</label>
              <NumericInput
                min={0}
                max={59}
                value={otMinutes}
                onValueChange={(val) => setOtMinutes(val)}
                ariaLabel="Overtime Minutes"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Overtime Category</label>
              <select
                value={otType}
                onChange={(e) =>
                  setOtType(e.target.value as 'regular_day' | 'weekly_rest' | 'public_holiday')
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="regular_day">Regular Day Overtime</option>
                <option value="weekly_rest">Weekly Rest Day (Friday)</option>
                <option value="public_holiday">Eid / Official Holiday</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Approval Status</label>
              <select
                value={otApproval}
                onChange={(e) => setOtApproval(e.target.value as OvertimeApprovalStatus)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="approved">Approved by Supervisor</option>
                <option value="pending">Pending Sign-Off</option>
                <option value="rejected">Rejected / Disputed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Divisor (Days × Hrs)</label>
              <div className="flex items-center gap-1">
                <NumericInput
                  value={otDivisorDays}
                  onValueChange={(val) => setOtDivisorDays(val ?? 30)}
                  min={1}
                  ariaLabel="Monthly Days Divisor"
                  className="w-1/2 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-white font-mono"
                />
                <NumericInput
                  value={otDivisorHours}
                  onValueChange={(val) => setOtDivisorHours(val ?? 8)}
                  min={1}
                  ariaLabel="Daily Hours Divisor"
                  className="w-1/2 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
            <div className="sm:col-span-4">
              <input
                type="text"
                value={otNotes}
                onChange={(e) => setOtNotes(e.target.value)}
                placeholder="Work order / supervisor approval reference"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={isSavingOt}
                className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isSavingOt
                    ? 'Saving...'
                    : editingOtId
                      ? `Update Overtime (${decimalHrs.toFixed(2)}h)`
                      : `Save Overtime (${decimalHrs.toFixed(2)}h — SAR ${otCalc.statutoryArt107Amount.toFixed(2)})`}
                </span>
              </button>
            </div>
          </form>

          {/* Policy Comparison Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Saudi Labor Law Art. 107 (Statutory)</div>
              <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                SAR {otCalc.statutoryArt107Amount.toFixed(2)}{' '}
                <span className="text-xs text-slate-400">
                  ({decimalHrs.toFixed(2)}h × SAR {otCalc.statutoryHourlyRate}/h)
                </span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Alternative Basic-Only 150% Formula</div>
              <div className="text-lg font-bold text-amber-300 font-mono tabular-nums">
                SAR {otCalc.basic150Amount.toFixed(2)}{' '}
                <span className="text-xs text-slate-400">
                  ({decimalHrs.toFixed(2)}h × SAR {otCalc.basic150HourlyRate}/h)
                </span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-xs text-slate-400">Ledger Approved vs Pending Hours</div>
              <div className="text-lg font-bold text-white font-mono tabular-nums">
                {totalApprovedOT.toFixed(2)}h Approved{' '}
                <span className="text-xs text-amber-400">/ {totalPendingOT.toFixed(2)}h Pending</span>
              </div>
            </div>
          </div>
        </div>

        {/* Overtime Ledger Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Personal Overtime Ledger</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Hrs + Mins</th>
                  <th className="py-2.5 px-3 text-right">Decimal Hrs</th>
                  <th className="py-2.5 px-3">Approval Status</th>
                  <th className="py-2.5 px-3 text-right">Est. Payable (SAR)</th>
                  <th className="py-2.5 px-3">Notes</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {slice.overtimeLedger.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/60">
                    <td className="py-2.5 px-3 font-mono text-white tabular-nums">{item.date}</td>
                    <td className="py-2.5 px-3 capitalize text-slate-300">
                      {item.overtimeType.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {item.hours}h {item.minutes}m
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-white tabular-nums">
                      {item.decimalHours.toFixed(2)}h
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                          item.approvalStatus === 'approved'
                            ? 'bg-emerald-950/80 border border-emerald-700/50 text-emerald-300'
                            : 'bg-amber-950/80 border border-amber-700/50 text-amber-300'
                        }`}
                      >
                        {item.approvalStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 tabular-nums">
                      SAR {item.estimatedAmount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{item.notes}</td>
                    <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOtId(item.id);
                          setOtDate(item.date);
                          setOtHours(item.hours);
                          setOtMinutes(item.minutes);
                          setOtType(item.overtimeType);
                          setOtApproval(item.approvalStatus);
                          setOtNotes(item.notes || '');
                          setOtError(null);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold text-xs px-1.5 py-0.5"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteOvertime(item.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 inline-flex items-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'leave') {
    const leaveSummary = calculateLeaveSummary({
      joiningDate: currentEmp?.joiningDate || '2022-03-01',
      asOfDate: new Date().toISOString().slice(0, 10),
      configuredEntitlementDays: currentEmp?.annualLeaveEntitlementDays || 21,
      carryoverDays: 0,
      leaveRecords: slice.leaves,
      actualMonthlyWage: salaryInfo.actualWage,
    });

    const handleAddLeave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSavingLv) return;
      setLvError(null);

      if (!lvStart || !lvEnd) {
        const msg = 'Please select both Start Date and End Date before saving.';
        setLvError(msg);
        notify?.(msg, 'warning');
        return;
      }
      if (lvEnd < lvStart) {
        const msg = 'Return / end date cannot be earlier than departure / start date.';
        setLvError(msg);
        notify?.(msg, 'warning');
        return;
      }
      if (lvDays === undefined || lvDays <= 0) {
        const msg = 'Total leave days must be greater than zero.';
        setLvError(msg);
        notify?.(msg, 'warning');
        return;
      }

      setIsSavingLv(true);
      try {
        await onSaveLeave({
          id: editingLvId,
          employmentId: currentEmp?.id || 'emp-default',
          startDate: lvStart,
          endDate: lvEnd,
          durationType: 'full_day',
          totalDays: lvDays,
          leaveType: lvType,
          isPaid: lvType !== 'unpaid_leave' && lvType !== 'absent',
          approvalStatus: lvApproval,
          reason: lvReason,
          createdAt: new Date().toISOString(),
        });
        const wasEditing = Boolean(editingLvId);
        setEditingLvId(undefined);
        setLvReason('');
        notify?.(
          wasEditing ? 'Leave record updated.' : 'Leave record saved.',
          'success',
        );
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Failed to save leave record. Please try again.';
        setLvError(errMsg);
        notify?.(errMsg, 'warning');
      } finally {
        setIsSavingLv(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
            <div className="text-xs text-slate-400">Annual Leave Accrual (Art. 109)</div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums">
              {leaveSummary.remainingAnnualBalance.toFixed(1)} Days Left
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Accrued: {leaveSummary.totalAccruedAnnual.toFixed(1)}d ({leaveSummary.annualEntitlement}
              d/yr) | Taken: {leaveSummary.annualLeaveTaken}d
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
            <div className="text-xs text-slate-400">Unused Leave Encashment (Art. 111)</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
              SAR {leaveSummary.unusedLeaveValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Daily Actual Wage: SAR {leaveSummary.dailyWage.toFixed(2)}/day
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5">
            <div className="text-xs text-slate-400">Sick Leave Tiers Used (Art. 117)</div>
            <div className="text-2xl font-bold text-sky-400 font-mono tabular-nums">
              {leaveSummary.sickLeaveTaken} / 120 Days
            </div>
            <div className="text-xs text-slate-400 font-mono">
              100% Pay: {leaveSummary.sickFullPayDays}/30d | 75% Pay:{' '}
              {leaveSummary.sickThreeQuarterDays}/60d | Unpaid: {leaveSummary.sickUnpaidDays}/30d
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              {editingLvId ? 'Edit Leave Record' : 'Record Leave, Sick Leave or Absence'}
            </h2>
            {editingLvId && (
              <button
                type="button"
                onClick={() => {
                  setEditingLvId(undefined);
                  setLvReason('');
                  setLvError(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {lvError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-950/80 border border-rose-700/70 text-xs text-rose-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{lvError}</span>
            </div>
          )}

          <form
            noValidate
            onSubmit={handleAddLeave}
            className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          >
            <div>
              <label className="block text-xs text-slate-300 mb-1">Leave Category</label>
              <select
                value={lvType}
                onChange={(e) => setLvType(e.target.value as LeaveCategory)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="annual_leave">Annual Leave (Paid)</option>
                <option value="sick_leave">Sick Leave (Art. 117)</option>
                <option value="emergency_leave">Emergency Leave</option>
                <option value="unpaid_leave">Unpaid Leave</option>
                <option value="absent">Unexcused Absence</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Start Date *</label>
              <DateInputWithToday
                required
                value={lvStart}
                onChange={setLvStart}
                ariaLabel="Leave Start Date"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">End Date *</label>
              <DateInputWithToday
                required
                value={lvEnd}
                onChange={setLvEnd}
                ariaLabel="Leave End Date"
                className="bg-slate-950 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Total Days *</label>
              <NumericInput
                min={0.5}
                value={lvDays}
                onValueChange={(val) => setLvDays(val)}
                ariaLabel="Leave Total Days"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Reason / Sehhaty Ref</label>
              <input
                type="text"
                value={lvReason}
                onChange={(e) => setLvReason(e.target.value)}
                placeholder="e.g. Annual vacation / Medical cert"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isSavingLv}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-semibold text-white"
              >
                {isSavingLv
                  ? 'Saving...'
                  : editingLvId
                    ? 'Update Leave Record'
                    : '+ Save Leave Record'}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Start → End</th>
                  <th className="py-2 px-3 text-right">Days</th>
                  <th className="py-2 px-3">Paid Status</th>
                  <th className="py-2 px-3">Reason / Notes</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {slice.leaves.map((lv) => (
                  <tr key={lv.id}>
                    <td className="py-2.5 px-3 capitalize text-white">
                      {lv.leaveType.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 tabular-nums">
                      {lv.startDate} → {lv.endDate}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white tabular-nums">
                      {lv.totalDays}d
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400">
                      {lv.isPaid ? 'Paid' : 'Unpaid'} ({lv.approvalStatus})
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{lv.reason}</td>
                    <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLvId(lv.id);
                          setLvStart(lv.startDate);
                          setLvEnd(lv.endDate);
                          setLvDays(lv.totalDays);
                          setLvType(lv.leaveType as LeaveCategory);
                          setLvReason(lv.reason || '');
                          setLvError(null);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold text-xs px-1.5 py-0.5"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLeave(lv.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 inline-flex items-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // activeTab === 'reports' (Section 10: Monthly Attendance & Employment Report Generator)
  const monthDailyRecords = slice.attendance
    .filter((r) => r.date.startsWith(selectedMonth))
    .sort((a, b) => a.date.localeCompare(b.date));

  const report = generateMonthlyAttendanceReport({
    monthYear: selectedMonth,
    attendanceRecords: monthDailyRecords,
    leaveRecords: slice.leaves,
    salaryInfo,
    payslip: slice.payslips.find((p) => p.payPeriod === selectedMonth),
  });

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">
              Monthly Attendance, Overtime & Payable Report (Section 10)
            </h2>
            <p className="text-xs text-slate-400">
              Preview your complete monthly attendance sheet before downloading in PDF, Excel (.xlsx), or CSV format.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthInputWithToday
              value={selectedMonth}
              onChange={onMonthChange}
              ariaLabel="Report Payroll Month"
              className="bg-slate-950 border-slate-700 text-white"
            />
            <button
              type="button"
              onClick={() =>
                exportMonthlyAttendancePDF({
                  report,
                  dailyRecords: monthDailyRecords,
                  employeeName: slice.profile.fullName,
                  jobTitle: currentEmp?.jobTitle || 'Employee',
                  employerName: currentEmp?.employerName || 'Employer',
                })
              }
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white inline-flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>Export PDF Report</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportMonthlyAttendanceExcel({
                  report,
                  dailyRecords: monthDailyRecords,
                  employerName: currentEmp?.employerName || 'Employer',
                })
              }
              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => exportMonthlyAttendanceCSV(selectedMonth, monthDailyRecords)}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Report Preview Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">Days Present / Calendar Days</div>
            <div className="text-lg font-bold text-white font-mono tabular-nums">
              {report.presentDays} / {report.calendarDays} Days
            </div>
            <div className="text-[11px] text-slate-500">
              Rest Days Worked: {report.weeklyRestDays}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">Net Working / Scheduled Hours</div>
            <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
              {report.netWorkingHours.toFixed(2)}h / {report.scheduledHours.toFixed(2)}h
            </div>
            <div className="text-[11px] text-slate-500">
              Incomplete Punches: {report.incompleteEntries}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">Overtime Hours & Statutory Pay</div>
            <div className="text-lg font-bold text-amber-300 font-mono tabular-nums">
              {report.recordedOvertimeHours.toFixed(2)}h (SAR {report.estimatedOvertimePay.toFixed(2)})
            </div>
            <div className="text-[11px] text-slate-500">Saudi Labor Law Art. 107</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-xs text-slate-400">Est. Total Gross Payable</div>
            <div className="text-lg font-bold text-white font-mono tabular-nums">
              SAR {(report.expectedActualWage + report.estimatedOvertimePay).toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500">
              Base Package: SAR {report.expectedActualWage.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
