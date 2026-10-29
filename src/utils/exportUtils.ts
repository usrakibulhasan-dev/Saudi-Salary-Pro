import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type {
  DailyAttendanceRecord,
  EmployeeLoanRecord,
  LeaveRecord,
  LoanRepaymentRecord,
  PayslipRecord,
  UserPrivateDatabaseSlice,
  VacationPayCalculationRecord,
  VacationPlanRecord,
  YearByYearVacationRow,
} from '../types/payroll.ts';
import type {
  calculateAnnualLeaveAccrual,
  calculateEOSB,
  calculateLoanPortfolioSummary,
  generateMonthlyAttendanceReport,
} from '../engine/calculations.ts';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportMonthlyAttendancePDF(params: {
  report: ReturnType<typeof generateMonthlyAttendanceReport>;
  dailyRecords: DailyAttendanceRecord[];
  employeeName: string;
  jobTitle: string;
  employerName: string;
}): void {
  const { report, dailyRecords, employeeName, jobTitle, employerName } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text('SAUDI SALARY PRO — MONTHLY ATTENDANCE & PAYABLE SUMMARY', 14, 16);
  doc.setFontSize(10);
  doc.text(`Employee: ${employeeName} | Role: ${jobTitle}`, 14, 23);
  doc.text(`Employer: ${employerName} | Period: ${report.monthYear}`, 14, 29);

  doc.setDrawColor(180);
  doc.line(14, 33, 196, 33);

  doc.setFontSize(11);
  doc.text('1. Attendance & Hours Summary', 14, 40);
  doc.setFontSize(9.5);
  const summaryLines = [
    `Calendar Days: ${report.calendarDays}   |   Recorded Days: ${report.recordedDaysCount}   |   Unrecorded Days: ${report.unrecordedDaysCount}`,
    `Days Present: ${report.presentDays}   |   Weekly Rest Days: ${report.weeklyRestDays}   |   Public Holidays: ${report.publicHolidays}`,
    `Annual Leave Days: ${report.annualLeaveDays}   |   Sick Leave Days: ${report.sickLeaveDays}   |   Absences: ${report.absenceDays}`,
    `Scheduled Hours: ${report.scheduledHours.toFixed(2)} hrs   |   Net Working Hours: ${report.netWorkingHours.toFixed(2)} hrs`,
    `User-Recorded Overtime: ${report.recordedOvertimeHours.toFixed(2)} hrs   |   Estimated Payable OT: ${report.estimatedPayableOvertimeHours.toFixed(2)} hrs`,
  ];
  summaryLines.forEach((line, idx) => {
    doc.text(line, 14, 46 + idx * 5.5);
  });

  doc.setFontSize(11);
  doc.text('2. Estimated Monthly Salary & Overtime Breakdown (SAR)', 14, 78);
  doc.setFontSize(9.5);
  doc.text(`Effective Fixed Package: SAR ${report.expectedActualWage.toFixed(2)} (${report.salaryVersionExplanation})`, 14, 84);
  doc.text(`Estimated Overtime Pay (Saudi Labor Law Art. 107): SAR ${report.estimatedOvertimePay.toFixed(2)}`, 14, 90);
  doc.text(`Overtime Formula: ${report.overtimeFormula}`, 14, 96);
  doc.setFontSize(11);
  doc.text(
    `Estimated Gross Payable for ${report.monthYear}: SAR ${(report.expectedActualWage + report.estimatedOvertimePay).toFixed(2)}`,
    14,
    104,
  );

  doc.setFontSize(10.5);
  doc.text('3. Daily Attendance Log', 14, 114);
  doc.setFontSize(8);
  let y = 120;
  doc.text('Date          Status          Shift    In      Out     Break   Net Hrs   Reg Hrs   OT Hrs', 14, y);
  y += 4;
  doc.line(14, y - 2.5, 196, y - 2.5);

  dailyRecords.slice(0, 31).forEach((r) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    const rowStr = `${r.date}   ${r.status.padEnd(13, ' ').slice(0, 13)}   ${r.shiftType.padEnd(6, ' ').slice(0, 6)}   ${(r.clockIn || '--:--').padEnd(5, ' ')}   ${(r.clockOut || '--:--').padEnd(5, ' ')}   ${String(r.breakMinutes).padStart(3, ' ')}m    ${r.netWorkingHours.toFixed(2).padStart(6, ' ')}    ${r.regularScheduledHours.toFixed(2).padStart(6, ' ')}    ${r.estimatedPayableOvertimeHours.toFixed(2).padStart(5, ' ')}`;
    doc.text(rowStr, 14, y);
    y += 4.8;
  });

  doc.save(`SaudiSalaryPro_Attendance_${report.monthYear}.pdf`);
}

export function exportMonthlyAttendanceExcel(params: {
  report: ReturnType<typeof generateMonthlyAttendanceReport>;
  dailyRecords: DailyAttendanceRecord[];
  employerName: string;
}): void {
  const { report, dailyRecords, employerName } = params;
  const rows = dailyRecords.map((r) => ({
    Date: r.date,
    Status: r.status,
    Shift: r.shiftType,
    ScheduledStart: r.scheduledStart,
    ScheduledEnd: r.scheduledEnd,
    ClockIn: r.clockIn,
    ClockOut: r.clockOut,
    BreakMinutes: r.breakMinutes,
    ElapsedHours: r.elapsedHours,
    NetWorkingHours: r.netWorkingHours,
    RegularScheduledHours: r.regularScheduledHours,
    UserRecordedOTHours: r.userRecordedOvertimeHours,
    EstimatedPayableOTHours: r.estimatedPayableOvertimeHours,
    WeeklyRestDay: r.isWeeklyRestDay ? 'Yes' : 'No',
    PublicHoliday: r.isPublicHoliday ? 'Yes' : 'No',
    Location: r.workLocation || '',
    Notes: r.notes || '',
  }));

  const summarySheet = [
    { Metric: 'Month', Value: report.monthYear },
    { Metric: 'Employer', Value: employerName },
    { Metric: 'Days Present', Value: report.presentDays },
    { Metric: 'Weekly Rest Days', Value: report.weeklyRestDays },
    { Metric: 'Public Holidays', Value: report.publicHolidays },
    { Metric: 'Net Working Hours', Value: report.netWorkingHours },
    { Metric: 'Scheduled Regular Hours', Value: report.scheduledHours },
    { Metric: 'Recorded Overtime Hours', Value: report.recordedOvertimeHours },
    { Metric: 'Estimated Payable Overtime Hours', Value: report.estimatedPayableOvertimeHours },
    { Metric: 'Effective Fixed Wage (SAR)', Value: report.expectedActualWage },
    { Metric: 'Estimated Overtime Pay Art. 107 (SAR)', Value: report.estimatedOvertimePay },
    { Metric: 'Estimated Total Gross (SAR)', Value: report.expectedActualWage + report.estimatedOvertimePay },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'Monthly Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Daily Attendance');
  XLSX.writeFile(wb, `SaudiSalaryPro_MonthlyReport_${report.monthYear}.xlsx`);
}

export function exportMonthlyAttendanceCSV(
  monthYear: string,
  dailyRecords: DailyAttendanceRecord[],
): void {
  const rows = dailyRecords.map((r) => ({
    Date: r.date,
    Status: r.status,
    Shift: r.shiftType,
    ClockIn: r.clockIn,
    ClockOut: r.clockOut,
    BreakMinutes: r.breakMinutes,
    NetWorkingHours: r.netWorkingHours,
    RegularHours: r.regularScheduledHours,
    PayableOTHours: r.estimatedPayableOvertimeHours,
    Location: r.workLocation || '',
    Notes: r.notes || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `SaudiSalaryPro_Attendance_${monthYear}.csv`);
}

export function exportPayslipPDF(
  slip: PayslipRecord,
  employeeName: string,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text('SAUDI SALARY PRO — PERSONAL PAYSLIP & BANK RECORD', 14, 18);
  doc.setFontSize(10);
  doc.text(`Employee: ${employeeName}   |   Employer: ${slip.employerName}`, 14, 26);
  doc.text(`Payroll Month: ${slip.payPeriod}   |   Payment Date: ${slip.paymentDate}`, 14, 32);
  doc.line(14, 36, 196, 36);

  const bankReceived = typeof slip.bankCreditAmount === 'number' ? slip.bankCreditAmount : slip.netSalary;
  const lines = [
    `Basic Salary: SAR ${slip.basicSalary.toFixed(2)}`,
    `Housing Allowance: SAR ${slip.housingAllowance.toFixed(2)}`,
    `Transport Allowance: SAR ${slip.transportAllowance.toFixed(2)}`,
    `Food Allowance: SAR ${slip.foodAllowance.toFixed(2)}`,
    `Other Allowances: SAR ${slip.otherAllowances.toFixed(2)}`,
    `Overtime Pay (${slip.overtimeHours} hrs): SAR ${slip.overtimeAmount.toFixed(2)}`,
    `Bonuses / Commissions: SAR ${slip.bonus.toFixed(2)}`,
    `--------------------------------------------------------------`,
    `Gross Earnings: SAR ${slip.grossEarnings.toFixed(2)}`,
    `Total Deductions: -SAR ${slip.totalDeductions.toFixed(2)}`,
    `Net Pay Stated on Slip: SAR ${slip.netSalary.toFixed(2)}`,
    `Actual Amount Received in Bank: SAR ${bankReceived.toFixed(2)}`,
    `Bank Shortfall / Variance: SAR ${(bankReceived - slip.netSalary).toFixed(2)}`,
    `Extraction / Entry Source: ${slip.extractionSource}`,
  ];

  let y = 44;
  lines.forEach((l) => {
    doc.text(l, 14, y);
    y += 7;
  });

  if (slip.notes) {
    doc.text(`Notes: ${slip.notes}`, 14, y + 4);
  }
  doc.save(`SaudiSalaryPro_Payslip_${slip.payPeriod}.pdf`);
}

export function exportEOSBAndSettlementPDF(params: {
  employeeName: string;
  employerName: string;
  eosb: ReturnType<typeof calculateEOSB>;
  unpaidSalary: number;
  unpaidOvertime: number;
  unusedLeaveEncashment: number;
  bonusOrTicket: number;
  totalDeductions: number;
  finalNetSettlement: number;
}): void {
  const {
    employeeName,
    employerName,
    eosb,
    unpaidSalary,
    unpaidOvertime,
    unusedLeaveEncashment,
    bonusOrTicket,
    totalDeductions,
    finalNetSettlement,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text('SAUDI LABOR LAW EOSB & FINAL SETTLEMENT STATEMENT', 14, 18);
  doc.setFontSize(10);
  doc.text(`Employee: ${employeeName}   |   Employer: ${employerName}`, 14, 26);
  doc.text(
    `Service Duration: ${eosb.duration.years}y ${eosb.duration.months}m ${eosb.duration.days}d (${eosb.duration.decimalYears.toFixed(4)} yrs)`,
    14,
    32,
  );
  doc.line(14, 36, 196, 36);

  doc.setFontSize(11);
  doc.text('1. End of Service Benefit (EOSB) Breakdown', 14, 44);
  doc.setFontSize(9.5);
  doc.text(`First 5 Years Award (0.5 month/yr): SAR ${eosb.firstFiveYearsAmount.toFixed(2)}`, 14, 51);
  doc.text(`After 5 Years Award (1.0 month/yr): SAR ${eosb.subsequentYearsAmount.toFixed(2)}`, 14, 57);
  doc.text(`Full Gross EOSB Award (Art. 84): SAR ${eosb.fullAward.toFixed(2)}`, 14, 63);
  doc.text(`Entitlement Percentage: ${eosb.entitlementPercentage.toFixed(2)}% (${eosb.officialSource})`, 14, 69);
  doc.setFontSize(10.5);
  doc.text(`Estimated Net Payable EOSB: SAR ${eosb.estimatedEOSB.toFixed(2)}`, 14, 76);

  doc.setFontSize(11);
  doc.text('2. Final Settlement Additions & Deductions', 14, 88);
  doc.setFontSize(9.5);
  doc.text(`Unpaid Salary for Current Month: SAR ${unpaidSalary.toFixed(2)}`, 14, 95);
  doc.text(`Unpaid Overtime Arrears: SAR ${unpaidOvertime.toFixed(2)}`, 14, 101);
  doc.text(`Unused Annual Leave Encashment: SAR ${unusedLeaveEncashment.toFixed(2)}`, 14, 107);
  doc.text(`Pending Bonuses & Repatriation Ticket: SAR ${bonusOrTicket.toFixed(2)}`, 14, 113);
  doc.text(`Total Deductions (Loans/Notice/Other): -SAR ${totalDeductions.toFixed(2)}`, 14, 119);

  doc.setFontSize(12);
  doc.text(`FINAL NET SETTLEMENT PAYABLE: SAR ${finalNetSettlement.toFixed(2)}`, 14, 130);

  doc.save(`SaudiSalaryPro_FinalSettlement_${employerName.replace(/\s+/g, '_')}.pdf`);
}

export function exportLoanPortfolioPDF(params: {
  employeeName: string;
  employerName: string;
  selectedMonth: string;
  portfolio: ReturnType<typeof calculateLoanPortfolioSummary>;
}): void {
  const { employeeName, employerName, selectedMonth, portfolio } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('SAUDI SALARY PRO — EMPLOYEE LOAN & REPAYMENT STATEMENT', 14, 16);
  doc.setFontSize(9.5);
  doc.text(`Employee: ${employeeName}   |   Employer: ${employerName}   |   Selected Month: ${selectedMonth}`, 14, 23);
  doc.line(14, 27, 196, 27);

  doc.setFontSize(11);
  doc.text('1. Loan Portfolio Summary', 14, 34);
  doc.setFontSize(9);
  const summaryLines = [
    `Total Loans Taken: ${portfolio.totalLoansTaken}   |   Active Loans: ${portfolio.activeLoansCount}`,
    `Total Original Loan Amount: SAR ${portfolio.totalOriginalAmount.toFixed(2)}`,
    `Total Principal Repaid (Saved Repayments): SAR ${portfolio.totalPrincipalRepaid.toFixed(2)}`,
    `Total Outstanding Loan Balance: SAR ${portfolio.totalOutstandingBalance.toFixed(2)}`,
    `Scheduled Deduction (${selectedMonth}): SAR ${portfolio.totalScheduledMonthlyDeduction.toFixed(2)}   |   Confirmed Deduction (${selectedMonth}): SAR ${portfolio.totalActualMonthlyDeduction.toFixed(2)}`,
  ];
  summaryLines.forEach((l, i) => doc.text(l, 14, 40 + i * 5.5));

  doc.setFontSize(11);
  doc.text('2. Individual Loan Balances & Repayment Ledgers', 14, 72);
  let y = 79;
  portfolio.loanBreakdown.forEach((b) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(9.5);
    doc.text(
      `[${b.loan.loanCode}] ${b.loan.loanName} (${b.loan.loanType}) — Status: ${b.loan.status.toUpperCase()}`,
      14,
      y,
    );
    y += 5;
    doc.setFontSize(8.5);
    doc.text(
      `Original: SAR ${b.loan.originalAmount.toFixed(2)} | Principal Repaid: SAR ${b.principalRepaid.toFixed(2)} (${b.progressPercentage.toFixed(1)}%) | Remaining Balance: SAR ${b.outstandingBalance.toFixed(2)}`,
      14,
      y,
    );
    y += 5;
    b.repayments.forEach((rep) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(
        `   • ${rep.salaryMonth} (${rep.deductionDate}): Scheduled SAR ${rep.scheduledDeduction.toFixed(2)} | Actual SAR ${rep.actualDeduction.toFixed(2)} | Principal SAR ${rep.amountAppliedToPrincipal.toFixed(2)} | Bal After: SAR ${rep.remainingBalanceAfter.toFixed(2)}`,
        14,
        y,
      );
      y += 4.5;
    });
    y += 3;
  });

  doc.save(`SaudiSalaryPro_Loans_${selectedMonth}.pdf`);
}

export function exportLoanPortfolioExcelAndCSV(params: {
  selectedMonth: string;
  loans: EmployeeLoanRecord[];
  repayments: LoanRepaymentRecord[];
  format: 'xlsx' | 'csv';
}): void {
  const { selectedMonth, loans, repayments, format } = params;
  const loanRows = loans.map((l) => {
    const repaid = repayments
      .filter((r) => r.loanId === l.id)
      .reduce((acc, r) => acc + r.amountAppliedToPrincipal, 0);
    return {
      LoanCode: l.loanCode,
      LoanName: l.loanName,
      LoanType: l.loanType,
      IssueDate: l.issueDate,
      OriginalAmountSAR: l.originalAmount,
      PrincipalRepaidSAR: repaid,
      OutstandingBalanceSAR: Math.round((l.originalAmount - repaid) * 100) / 100,
      MonthlyScheduledSAR: l.monthlyDeductionAmount,
      FirstDeductionMonth: l.firstDeductionMonth,
      ExpectedFinalMonth: l.expectedFinalDeductionMonth,
      Status: l.status,
      Notes: l.notes || '',
    };
  });

  const repaymentRows = repayments.map((r) => {
    const loan = loans.find((l) => l.id === r.loanId);
    return {
      LoanCode: loan?.loanCode || r.loanId,
      LoanName: loan?.loanName || '',
      SalaryMonth: r.salaryMonth,
      DeductionDate: r.deductionDate,
      ScheduledDeductionSAR: r.scheduledDeduction,
      ActualDeductionSAR: r.actualDeduction,
      PrincipalAppliedSAR: r.amountAppliedToPrincipal,
      RemainingBalanceAfterSAR: r.remainingBalanceAfter,
      PayslipRef: r.payslipReference || '',
      Notes: r.notes || '',
    };
  });

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(loanRows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `SaudiSalaryPro_Loans_${selectedMonth}.csv`,
    );
    return;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loanRows), 'Loan Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repaymentRows), 'Repayment History');
  XLSX.writeFile(wb, `SaudiSalaryPro_Loans_${selectedMonth}.xlsx`);
}

export function exportVacationAndAccrualPDF(params: {
  employeeName: string;
  employerName: string;
  accrual: ReturnType<typeof calculateAnnualLeaveAccrual>;
  plans: VacationPlanRecord[];
  leaveHistory: LeaveRecord[];
  yearlyRows: YearByYearVacationRow[];
  payCalculations: VacationPayCalculationRecord[];
}): void {
  const { employeeName, employerName, accrual, plans, leaveHistory, yearlyRows, payCalculations } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('SAUDI SALARY PRO — ANNUAL LEAVE ACCRUAL & VACATION REPORT', 14, 16);
  doc.setFontSize(9.5);
  doc.text(`Employee: ${employeeName}   |   Employer: ${employerName}`, 14, 23);
  doc.text(
    `Accrual Window: ${accrual.accrualStartDate} to ${accrual.targetCalculationDate} (${accrual.daysElapsed} days / ${accrual.divisorDays} divisor)`,
    14,
    29,
  );
  doc.line(14, 33, 196, 33);

  doc.setFontSize(11);
  doc.text('1. Annual Leave Accrual Breakdown (Saudi Labor Law Art. 109)', 14, 40);
  doc.setFontSize(9);
  const accrualLines = [
    `Annual Entitlement: ${accrual.annualEntitlementDays} days/year   |   Daily Accrual Rate: ${accrual.dailyAccrualRate.toFixed(6)} days/day`,
    `1. Leave Balance Carried Forward (Prior to Period): ${accrual.carriedForwardDays.toFixed(2)} days`,
    `2. Leave Accrued in Current Period: ${accrual.accruedInCurrentPeriod.toFixed(2)} days (${accrual.formula})`,
    `3. Leave Already Taken in Period: -${accrual.leaveTakenInPeriod.toFixed(2)} days`,
    `4. Manual Adjustments: ${accrual.manualAdjustmentDays >= 0 ? '+' : ''}${accrual.manualAdjustmentDays.toFixed(2)} days`,
    `5. Total Estimated Available Leave Balance: ${accrual.totalEstimatedAvailableDays.toFixed(2)} days`,
  ];
  accrualLines.forEach((line, idx) => doc.text(line, 14, 46 + idx * 5.2));

  let y = 82;
  doc.setFontSize(11);
  doc.text('2. Year-by-Year Vacation Balance Table', 14, y);
  y += 6;
  doc.setFontSize(8.5);
  doc.text('Period             Entitlement   Opening   Earned    Taken     Adjust    Closing', 14, y);
  y += 4;
  yearlyRows.slice(0, 8).forEach((row) => {
    doc.text(
      `${row.leaveYearLabel.padEnd(18, ' ').slice(0, 18)} ${String(row.annualEntitlement).padStart(8, ' ')}   ${row.openingBalance.toFixed(2).padStart(7, ' ')}   ${row.earned.toFixed(2).padStart(6, ' ')}   ${row.taken.toFixed(2).padStart(6, ' ')}   ${row.adjustments.toFixed(2).padStart(6, ' ')}   ${row.closingBalance.toFixed(2).padStart(7, ' ')}`,
      14,
      y,
    );
    y += 4.8;
  });

  y += 4;
  doc.setFontSize(11);
  doc.text('3. Planned Vacations & Actual Leave History', 14, y);
  y += 6;
  doc.setFontSize(8.5);
  plans.slice(0, 5).forEach((p) => {
    doc.text(
      `[PLAN - ${(p.approvalStatus || p.status || 'planned').toUpperCase()}] ${p.title || p.planName || 'Vacation Plan'}: ${p.plannedDepartureDate} to ${p.plannedReturnDate} (${p.plannedVacationDays}d) | Est. Pay: SAR ${p.expectedVacationPay.toFixed(2)}`,
      14,
      y,
    );
    y += 4.8;
  });
  leaveHistory.slice(0, 8).forEach((lv) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(
      `[LOG - ${lv.approvalStatus.toUpperCase()}] ${lv.leaveType}: ${lv.startDate} to ${lv.endDate} (${lv.totalDays}d) | Actual Return: ${lv.actualReturnDate || 'Pending'}`,
      14,
      y,
    );
    y += 4.8;
  });

  if (payCalculations.length > 0) {
    y += 4;
    doc.setFontSize(11);
    doc.text('4. Saved Vacation Pay Calculations', 14, y);
    y += 6;
    doc.setFontSize(8.5);
    payCalculations.slice(0, 5).forEach((vp) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(
        `${vp.title || vp.calculationTitle || 'Vacation Pay'} (${vp.payableVacationDays}d @ SAR ${(vp.dailyLeaveSalaryRate ?? vp.dailySalaryBasis ?? 0).toFixed(2)}/d): Est. SAR ${(vp.estimatedGrossVacationPay ?? vp.estimatedVacationPay ?? 0).toFixed(2)} | Received: SAR ${(vp.actualVacationPayReceived ?? 0).toFixed(2)}`,
        14,
        y,
      );
      y += 4.8;
    });
  }

  doc.save(`SaudiSalaryPro_Vacation_Accrual_${accrual.targetCalculationDate}.pdf`);
}

export function exportVacationExcelAndCSV(params: {
  accrual: ReturnType<typeof calculateAnnualLeaveAccrual>;
  plans: VacationPlanRecord[];
  leaveHistory: LeaveRecord[];
  yearlyRows: YearByYearVacationRow[];
  payCalculations: VacationPayCalculationRecord[];
  format: 'xlsx' | 'csv';
}): void {
  const { accrual, plans, leaveHistory, yearlyRows, payCalculations, format } = params;
  const yearlySheet = yearlyRows.map((r) => ({
    LeaveYear: r.leaveYearLabel,
    PeriodStart: r.periodStart,
    PeriodEnd: r.periodEnd,
    AnnualEntitlementDays: r.annualEntitlement,
    OpeningBalanceDays: r.openingBalance,
    EarnedDays: r.earned,
    TakenDays: r.taken,
    AdjustmentsDays: r.adjustments,
    ClosingBalanceDays: r.closingBalance,
  }));

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(yearlySheet);
    const csv = XLSX.utils.sheet_to_csv(ws);
    triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `SaudiSalaryPro_VacationBalance_${accrual.targetCalculationDate}.csv`,
    );
    return;
  }

  const accrualSheet = [
    { Metric: 'Accrual Start Date', Value: accrual.accrualStartDate },
    { Metric: 'Target Calculation Date', Value: accrual.targetCalculationDate },
    { Metric: 'Days Elapsed (Inclusive)', Value: accrual.daysElapsed },
    { Metric: 'Annual Entitlement Days', Value: accrual.annualEntitlementDays },
    { Metric: 'Divisor Days', Value: accrual.divisorDays },
    { Metric: 'Daily Accrual Rate', Value: accrual.dailyAccrualRate },
    { Metric: '1. Carried Forward Balance', Value: accrual.carriedForwardDays },
    { Metric: '2. Accrued in Current Period', Value: accrual.accruedInCurrentPeriod },
    { Metric: '3. Leave Taken in Period', Value: accrual.leaveTakenInPeriod },
    { Metric: '4. Manual Adjustments', Value: accrual.manualAdjustmentDays },
    { Metric: '5. Total Estimated Available Days', Value: accrual.totalEstimatedAvailableDays },
    { Metric: 'Formula', Value: accrual.formula },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accrualSheet), 'Accrual Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(yearlySheet), 'Year By Year Balance');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plans), 'Vacation Plans');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaveHistory), 'Vacation Log');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payCalculations), 'Vacation Pay');
  XLSX.writeFile(wb, `SaudiSalaryPro_VacationReport_${accrual.targetCalculationDate}.xlsx`);
}

export function exportUserBackupJSON(slice: UserPrivateDatabaseSlice): void {
  const payload = {
    schemaVersion: '2.0.0',
    exportedAt: new Date().toISOString(),
    app: 'Saudi Salary Pro v2.0 Personal Employment Platform',
    slice,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  triggerDownload(
    blob,
    `SaudiSalaryPro_PersonalBackup_${slice.user.email.split('@')[0]}_${new Date().toISOString().slice(0, 10)}.json`,
  );
}

