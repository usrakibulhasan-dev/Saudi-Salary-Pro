import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAnnualLeaveAccrual,
  calculateAttendanceMetrics,
  calculateEOSB,
  calculateLeaveSummary,
  calculateLoanPortfolioSummary,
  calculateOvertimePay,
  calculateOvertimeSalaryComparison,
  calculateVacationPay,
  decimalToHoursAndMinutes,
  detectVacationOverlap,
  generateMonthlyAttendanceReport,
  generateYearByYearVacationTable,
  getLocalTodayISO,
  hoursAndMinutesToDecimal,
  reconcileMonthlySalary,
  resolveEffectiveSalaryForMonth,
  validateLoanRepaymentCandidate,
} from './calculations.ts';
import { UserIsolatedDataStore } from '../server/store.ts';
import { LANGUAGE_OPTIONS, TRANSLATIONS } from '../i18n/translations.ts';
import type {
  EmployeeLoanRecord,
  LeaveRecord,
  LoanRepaymentRecord,
  PayslipRecord,
  SalaryVersion,
} from '../types/payroll.ts';

describe('Saudi Salary Pro v2.0 — Core Calculations & Multi-User Isolation Suite', () => {
  it('1. Enforces strict server-side cross-user data isolation (User B cannot access, modify, or delete User A records)', () => {
    const store = new UserIsolatedDataStore(); // in-memory seed state
    const rahimLogin = store.loginUser('rahim.khan@example.sa', 'SaudiPro#2026');
    const carloLogin = store.loginUser('carlo.reyes@example.sa', 'SaudiPro#2026');

    assert.notEqual(rahimLogin.user.id, carloLogin.user.id);

    const rahimSlice = store.getUserSlice(rahimLogin.user.id);
    const carloSlice = store.getUserSlice(carloLogin.user.id);

    // Verify slices only contain records belonging to the authenticated user
    assert.ok(rahimSlice.employments.every((e) => e.userId === rahimLogin.user.id));
    assert.ok(carloSlice.employments.every((e) => e.userId === carloLogin.user.id));
    assert.ok(rahimSlice.loans.every((l) => l.userId === rahimLogin.user.id));
    assert.ok(carloSlice.loans.every((l) => l.userId === carloLogin.user.id));

    const rahimSalaryId = rahimSlice.salaryVersions[0].id;

    // Carlo attempts to read Rahim's salary version by ID -> must throw Unauthorized
    assert.throws(
      () => store.getRecordById(carloLogin.user.id, 'salaryVersions', rahimSalaryId),
      /Unauthorized: Cross-user access denied/,
    );

    // Carlo attempts to overwrite Rahim's salary version by ID -> must throw Unauthorized
    assert.throws(
      () =>
        store.upsertRecord(carloLogin.user.id, 'salaryVersions', {
          ...rahimSlice.salaryVersions[0],
          basicSalary: 99999,
        }),
      /Unauthorized: Cannot modify a record belonging to another user/,
    );

    // Carlo attempts to delete Rahim's loan record by ID -> must throw Unauthorized
    const rahimLoanId = rahimSlice.loans[0].id;
    assert.throws(
      () => store.deleteRecord(carloLogin.user.id, 'loans', rahimLoanId),
      /Unauthorized: Cannot delete a record belonging to another user/,
    );

    // Carlo attempts to delete Rahim's vacation plan by ID -> must throw Unauthorized
    const rahimPlanId = rahimSlice.vacationPlans[0].id;
    assert.throws(
      () => store.deleteRecord(carloLogin.user.id, 'vacationPlans', rahimPlanId),
      /Unauthorized: Cannot delete a record belonging to another user/,
    );
  });

  it('2. Supports new user registration, login, and profile ownership protection', () => {
    const store = new UserIsolatedDataStore();
    const reg = store.registerUser({
      email: 'naveed.ahmed@example.sa',
      password: 'SecurePassword#123',
      fullName: 'Naveed Ahmed',
      nationality: 'Pakistani',
      jobTitle: 'HVAC Commissioning Engineer',
      preferredLanguage: 'ur',
    });

    assert.equal(reg.user.email, 'naveed.ahmed@example.sa');
    const slice = store.getUserSlice(reg.user.id);
    assert.equal(slice.profile.fullName, 'Naveed Ahmed');
    assert.equal(slice.employments.length, 0);
    assert.equal(slice.loans.length, 0);
    assert.equal(slice.vacationPlans.length, 0);
  });

  it('3. Calculates daily attendance hours accurately for day shifts, overnight shifts crossing midnight, and incomplete punches', () => {
    const mDay = calculateAttendanceMetrics({
      status: 'present',
      shiftType: 'day',
      scheduledStart: '07:00',
      scheduledEnd: '16:00',
      clockIn: '07:00',
      clockOut: '18:30',
      breakMinutes: 60,
      expectedDailyHours: 8,
      userRecordedOvertimeHours: 2.5,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
    });
    assert.equal(mDay.isIncomplete, false);
    assert.equal(mDay.elapsedHours, 11.5);
    assert.equal(mDay.netWorkingHours, 10.5);
    assert.equal(mDay.regularScheduledHours, 8);
    assert.equal(mDay.estimatedPayableOvertimeHours, 2.5);

    // Overnight shift crossing midnight: 21:00 to 08:00 next morning (11h elapsed - 1h break = 10h net -> 8h regular + 2h OT)
    const mNight = calculateAttendanceMetrics({
      status: 'present',
      shiftType: 'night',
      scheduledStart: '21:00',
      scheduledEnd: '06:00',
      clockIn: '21:00',
      clockOut: '08:00',
      breakMinutes: 60,
      expectedDailyHours: 8,
      userRecordedOvertimeHours: 2,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
    });
    assert.equal(mNight.elapsedHours, 11);
    assert.equal(mNight.netWorkingHours, 10);
    assert.equal(mNight.regularScheduledHours, 8);
    assert.equal(mNight.estimatedPayableOvertimeHours, 2);

    // Incomplete entry (missing clock-out)
    const mInc = calculateAttendanceMetrics({
      status: 'present',
      shiftType: 'day',
      scheduledStart: '07:00',
      scheduledEnd: '16:00',
      clockIn: '07:00',
      clockOut: '',
      breakMinutes: 60,
      expectedDailyHours: 8,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
    });
    assert.equal(mInc.isIncomplete, true);
    assert.equal(mInc.netWorkingHours, 0);
  });

  it('4. Prorates versioned salary history accurately when a salary raise happens mid-month', () => {
    const v1: SalaryVersion = {
      id: 'sv-1',
      userId: 'usr-1',
      employmentId: 'emp-1',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-04-15',
      basicSalary: 4000,
      housingAllowance: 1000,
      foodAllowance: 0,
      transportAllowance: 400,
      otherFixedAllowances: 0,
      variableAllowances: 0,
      payFrequency: 'monthly',
      reasonForChange: 'Joining',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const v2: SalaryVersion = {
      ...v1,
      id: 'sv-2',
      effectiveFrom: '2026-04-16',
      effectiveTo: undefined,
      basicSalary: 5000,
      housingAllowance: 1250,
      transportAllowance: 500,
      reasonForChange: 'Promotion',
    };

    // April 2026 has 30 days: 15 days at 4000 basic + 15 days at 5000 basic = 4500 basic
    const resolved = resolveEffectiveSalaryForMonth([v1, v2], 'emp-1', '2026-04');
    assert.equal(resolved.usedVersions.length, 2);
    assert.equal(resolved.basicSalary, 4500);
    assert.equal(resolved.actualWage, 6075);
  });

  it('5. Computes Saudi Labor Law Art. 107 overtime pay (actual hourly wage + 50% basic hourly wage) and alternative policies', () => {
    const ot = calculateOvertimePay({
      basicSalary: 4800,
      actualSalary: 7200,
      overtimeDecimalHours: 10,
      monthlyDaysDivisor: 30,
      dailyHoursDivisor: 8,
      basis: 'saudi_art_107',
    });
    assert.equal(ot.basicHourlyWage, 20);
    assert.equal(ot.actualHourlyWage, 30);
    assert.equal(ot.statutoryHourlyRate, 40);
    assert.equal(ot.statutoryArt107Amount, 400);
  });

  it('6. Reconciles expected salary vs payslip vs bank credit and flags short-paid discrepancies', () => {
    const slip: PayslipRecord = {
      id: 'pay-1',
      userId: 'usr-1',
      employmentId: 'emp-1',
      employerName: 'ARMEC',
      payPeriod: '2026-03',
      paymentDate: '2026-04-02',
      basicSalary: 4600,
      housingAllowance: 1150,
      foodAllowance: 350,
      transportAllowance: 500,
      otherAllowances: 400,
      overtimeHours: 5,
      overtimeAmount: 200,
      bonus: 0,
      grossEarnings: 7200,
      itemizedDeductions: [],
      totalDeductions: 0,
      netSalary: 7200,
      bankCreditAmount: 7000,
      extractionSource: 'manual',
      createdAt: '2026-04-02T00:00:00Z',
    };

    const rec = reconcileMonthlySalary({
      monthYear: '2026-03',
      expectedBasic: 4600,
      expectedActualWage: 7000,
      recordedAttendanceOvertimeHours: 10.5,
      payslip: slip,
    });

    assert.equal(rec.hasPayslip, true);
    assert.equal(rec.overtimeHoursDiff, -5.5);
    assert.equal(rec.netVsBankDiff, -200);
    assert.ok(rec.possibleExplanations.length >= 2);
  });

  it('7. Calculates EOSB accurately across resignation tiers (Art. 85) and full entitlement (Art. 84)', () => {
    const res4Yr = calculateEOSB({
      startDate: '2022-01-01',
      endDate: '2026-01-01',
      basicSalary: 4500,
      actualSalary: 6000,
      wageBasisType: 'actual_wage',
      contractType: 'fixed_term',
      terminationReason: 'resignation',
    });
    assert.equal(res4Yr.fullAward, 12000);
    assert.equal(res4Yr.estimatedEOSB, 4000);

    const end7Yr = calculateEOSB({
      startDate: '2019-01-01',
      endDate: '2026-01-01',
      basicSalary: 4500,
      actualSalary: 6000,
      wageBasisType: 'actual_wage',
      contractType: 'fixed_term',
      terminationReason: 'contract_expiry',
    });
    assert.equal(end7Yr.fullAward, 27000);
    assert.equal(end7Yr.estimatedEOSB, 27000);
  });

  it('8. Computes Annual Leave (Art. 109) and Sick Leave tiers (Art. 117: 30 full, 60 at 75%, 30 unpaid)', () => {
    const leaves: LeaveRecord[] = [
      {
        id: 'l1',
        userId: 'usr-1',
        employmentId: 'emp-lv',
        startDate: '2026-01-01',
        endDate: '2026-02-14',
        durationType: 'full_day',
        totalDays: 45,
        leaveType: 'sick_leave',
        isPaid: true,
        approvalStatus: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    const summary = calculateLeaveSummary({
      joiningDate: '2020-01-01',
      asOfDate: '2026-03-01',
      configuredEntitlementDays: 30,
      carryoverDays: 0,
      leaveRecords: leaves,
      actualMonthlyWage: 6000,
    });
    assert.equal(summary.statutoryMinEntitlement, 30);
    assert.equal(summary.sickLeaveTaken, 45);
    assert.equal(summary.sickFullPayDays, 30);
    assert.equal(summary.sickThreeQuarterDays, 15);
    assert.equal(summary.sickUnpaidDays, 0);
  });

  it('9. Generates Monthly Attendance Report totals and verifies all 9 language translations + RTL metadata', () => {
    const store = new UserIsolatedDataStore();
    const rahimSlice = store.getUserSlice('usr-rahim-01');
    const salaryInfo = resolveEffectiveSalaryForMonth(
      rahimSlice.salaryVersions,
      'emp-rahim-curr',
      '2026-03',
    );
    const report = generateMonthlyAttendanceReport({
      monthYear: '2026-03',
      attendanceRecords: rahimSlice.attendance,
      leaveRecords: rahimSlice.leaves,
      salaryInfo,
      payslip: rahimSlice.payslips.find((p) => p.payPeriod === '2026-03'),
    });

    assert.equal(report.presentDays, 4);
    assert.equal(report.weeklyRestDays, 1);
    assert.equal(report.recordedOvertimeHours, 10.5);
    assert.ok(report.estimatedOvertimePay > 400);

    // Check all 9 languages and RTL direction for Arabic & Urdu
    assert.equal(LANGUAGE_OPTIONS.length, 9);
    const ar = LANGUAGE_OPTIONS.find((l) => l.code === 'ar')!;
    const ur = LANGUAGE_OPTIONS.find((l) => l.code === 'ur')!;
    assert.equal(ar.dir, 'rtl');
    assert.equal(ur.dir, 'rtl');
    for (const opt of LANGUAGE_OPTIONS) {
      assert.ok(TRANSLATIONS[opt.code].appName.length > 0);
      assert.ok(TRANSLATIONS[opt.code].navLoans.length > 0);
    }
  });

  it('10. Loan Management: Calculates Outstanding Balance strictly from saved repayments, prevents duplicate month deductions, and warns on negative balance', () => {
    const loans: EmployeeLoanRecord[] = [
      {
        id: 'ln-1',
        userId: 'usr-1',
        employmentId: 'emp-1',
        loanCode: 'LN-01',
        loanName: 'Company Loan',
        loanType: 'company_loan',
        issueDate: '2026-01-01',
        originalAmount: 6000,
        currency: 'SAR',
        monthlyDeductionAmount: 750,
        firstDeductionMonth: '2026-01',
        expectedFinalDeductionMonth: '2026-08',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ln-2',
        userId: 'usr-1',
        employmentId: 'emp-1',
        loanCode: 'ADV-02',
        loanName: 'Salary Advance',
        loanType: 'salary_advance',
        issueDate: '2026-02-01',
        originalAmount: 1500,
        currency: 'SAR',
        monthlyDeductionAmount: 500,
        firstDeductionMonth: '2026-02',
        expectedFinalDeductionMonth: '2026-04',
        status: 'active',
        createdAt: '2026-02-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
      },
    ];

    const repayments: LoanRepaymentRecord[] = [
      {
        id: 'rep-1',
        userId: 'usr-1',
        loanId: 'ln-1',
        deductionDate: '2026-02-01',
        salaryMonth: '2026-01',
        scheduledDeduction: 750,
        actualDeduction: 750,
        amountAppliedToPrincipal: 750,
        remainingBalanceAfter: 5250,
        createdAt: '2026-02-01T00:00:00Z',
      },
      {
        id: 'rep-2',
        userId: 'usr-1',
        loanId: 'ln-1',
        deductionDate: '2026-03-01',
        salaryMonth: '2026-02',
        scheduledDeduction: 750,
        actualDeduction: 750,
        amountAppliedToPrincipal: 750,
        remainingBalanceAfter: 4500,
        createdAt: '2026-03-01T00:00:00Z',
      },
      {
        id: 'rep-3',
        userId: 'usr-1',
        loanId: 'ln-2',
        deductionDate: '2026-03-01',
        salaryMonth: '2026-02',
        scheduledDeduction: 500,
        actualDeduction: 500,
        amountAppliedToPrincipal: 500,
        remainingBalanceAfter: 1000,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ];

    const portfolio = calculateLoanPortfolioSummary({
      loans,
      repayments,
      selectedMonth: '2026-02',
    });
    assert.equal(portfolio.totalLoansTaken, 2);
    assert.equal(portfolio.activeLoansCount, 2);
    assert.equal(portfolio.totalOriginalLoanAmount, 7500);
    assert.equal(portfolio.totalLoanAmountRepaid, 2000);
    assert.equal(portfolio.totalOutstandingLoanBalance, 5500);
    assert.equal(portfolio.totalScheduledMonthlyDeduction, 1250);
    assert.equal(portfolio.totalConfirmedMonthlyDeduction, 1250);

    // Duplicate month check without confirmation must block save
    const dupCheck = validateLoanRepaymentCandidate({
      loan: loans[0],
      existingRepayments: repayments,
      salaryMonth: '2026-02',
      actualDeduction: 750,
      amountAppliedToPrincipal: 750,
      confirmDuplicateForMonth: false,
    });
    assert.equal(dupCheck.requiresDuplicateConfirmation, true);
    assert.equal(dupCheck.isValid, false);

    // Duplicate month check WITH confirmation allows save
    const dupAllowed = validateLoanRepaymentCandidate({
      loan: loans[0],
      existingRepayments: repayments,
      salaryMonth: '2026-02',
      actualDeduction: 750,
      amountAppliedToPrincipal: 750,
      confirmDuplicateForMonth: true,
    });
    assert.equal(dupAllowed.isValid, true);

    // Negative balance check without confirmation blocks save
    const negCheck = validateLoanRepaymentCandidate({
      loan: loans[1],
      existingRepayments: repayments,
      salaryMonth: '2026-03',
      actualDeduction: 1500,
      amountAppliedToPrincipal: 1500, // exceeds 1000 remaining
      confirmNegativeBalance: false,
    });
    assert.equal(negCheck.requiresNegativeBalanceConfirmation, true);
    assert.equal(negCheck.remainingBalanceAfter, -500);
    assert.equal(negCheck.isValid, false);
  });

  it('11. Vacation Accrual & Post-Vacation Reset Rule: 1 Sep 2026 -> 31 Dec 2026 (122 days * 21 / 365 = 7.02 days) while preserving carryover leave', () => {
    const accrual = calculateAnnualLeaveAccrual({
      accrualPeriod: {
        id: 'acc-1',
        userId: 'usr-1',
        employmentId: 'emp-1',
        periodLabel: '2026 Post-Vacation Reset',
        employmentStartDate: '2022-03-01',
        accrualYearStartDate: '2026-03-01',
        lastVacationStartDate: '2026-08-01',
        lastVacationEndDate: '2026-08-31',
        returnToWorkDate: '2026-09-01',
        newAccrualStartDate: '2026-09-01',
        useReturnDateResetRule: true,
        annualEntitlementDays: 21,
        accrualMethod: 'daily',
        yearDayBasis: '365_fixed',
        openingCarryoverDays: 5,
        manualAdjustmentDays: 0,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      asOfDate: '2026-12-31',
      leaveRecords: [],
      vacationPlans: [],
    });

    assert.equal(accrual.eligibleAccrualDays, 122); // Sep (30) + Oct (31) + Nov (30) + Dec (31) = 122
    assert.equal(accrual.openingCarryoverDays, 5);
    assert.equal(accrual.accruedCurrentPeriodDisplay, 7.02);
    assert.equal(accrual.estimatedAvailableLeaveDisplay, 12.02);
    assert.ok(accrual.resetRuleLegalWarning && accrual.resetRuleLegalWarning.includes('Article 109'));

    // Leap year boundary test (2024 is leap year = 366 days)
    const leapAccrual = calculateAnnualLeaveAccrual({
      accrualPeriod: {
        id: 'acc-2',
        userId: 'usr-1',
        employmentId: 'emp-1',
        periodLabel: '2024 Leap Year',
        employmentStartDate: '2024-01-01',
        accrualYearStartDate: '2024-01-01',
        newAccrualStartDate: '2024-01-01',
        useReturnDateResetRule: false,
        annualEntitlementDays: 21,
        accrualMethod: 'daily',
        yearDayBasis: 'leap_aware_365_366',
        openingCarryoverDays: 0,
        manualAdjustmentDays: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      asOfDate: '2024-12-31',
      leaveRecords: [],
      vacationPlans: [],
    });
    assert.equal(leapAccrual.eligibleAccrualDays, 366);
    assert.equal(leapAccrual.daysInYearDivisor, 366);
    assert.equal(leapAccrual.accruedCurrentPeriodDisplay, 21);
  });

  it('12. Year-by-Year Vacation Balance Table, Vacation Pay Calculator (Art. 109), Overlap Detection & Local Today ISO helper', () => {
    const rows = generateYearByYearVacationTable({
      joiningDate: '2024-01-01',
      asOfDate: '2026-06-30',
      annualEntitlementDays: 21,
      leaveRecords: [
        {
          id: 'lv-2025',
          userId: 'usr-1',
          employmentId: 'emp-1',
          startDate: '2025-07-01',
          endDate: '2025-07-15',
          durationType: 'full_day',
          totalDays: 15,
          leaveType: 'annual_leave',
          isPaid: true,
          approvalStatus: 'completed',
          createdAt: '2025-07-01T00:00:00Z',
        },
      ],
      manualAdjustmentDays: 0,
      viewMode: 'calendar_year',
    });

    assert.equal(rows.length, 4); // 2024, 2025, 2026, 2027 projection
    assert.equal(rows[1].taken, 15);
    assert.equal(rows[2].openingBalance, rows[1].closingBalance);

    // Vacation Pay Calculator
    const vPay = calculateVacationPay({
      basicSalary: 4600,
      housingAllowance: 1150,
      otherEligibleAllowances: 1250,
      leavePayBasis: 'actual_wage',
      payableVacationDays: 30,
      dailyDivisorMethod: '30_days',
      actualVacationPayReceived: 6800,
    });
    assert.equal(vPay.monthlyWageBasis, 7000);
    assert.equal(vPay.estimatedVacationPay, 7000);
    assert.equal(vPay.differenceAmount, -200);

    // Overlap detector
    const overlaps = detectVacationOverlap({
      startDate: '2025-07-10',
      endDate: '2025-07-20',
      leaveRecords: [
        {
          id: 'lv-2025',
          userId: 'usr-1',
          employmentId: 'emp-1',
          startDate: '2025-07-01',
          endDate: '2025-07-15',
          durationType: 'full_day',
          totalDays: 15,
          leaveType: 'annual_leave',
          isPaid: true,
          approvalStatus: 'completed',
          createdAt: '2025-07-01T00:00:00Z',
        },
      ],
      vacationPlans: [],
    });
    assert.equal(overlaps.length, 1);

    // Local Today ISO format check
    const todayIso = getLocalTodayISO();
    assert.match(todayIso, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('13. Verifies Create vs. Update by ID (no duplicate records, preserves createdAt) and Server Validation across all collections', () => {
    const store = new UserIsolatedDataStore();
    const { user } = store.loginUser('rahim.khan@example.sa', 'SaudiPro#2026');
    const initialSlice = store.getUserSlice(user.id);
    const initialAttCount = initialSlice.attendance.length;

    // 1. Create a new attendance record
    const createdAtt = store.upsertRecord(user.id, 'attendance', {
      employmentId: initialSlice.employments[0].id,
      date: '2026-03-25',
      dayCategory: 'normal',
      status: 'present',
      scheduledCheckIn: '08:00',
      scheduledCheckOut: '17:00',
      actualCheckIn: '08:00',
      actualCheckOut: '19:30',
      breakMinutes: 60,
      scheduledHours: 8,
      actualWorkedHours: 10.5,
      regularHours: 8,
      overtimeHours: 2.5,
      userRecordedOvertimeHours: 2.5,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      notes: 'Initial attendance note',
      createdAt: '2026-03-25T10:00:00.000Z',
      updatedAt: '2026-03-25T10:00:00.000Z',
    });

    assert.ok(createdAtt.id);
    assert.equal(createdAtt.userId, user.id);
    const afterCreateSlice = store.getUserSlice(user.id);
    assert.equal(afterCreateSlice.attendance.length, initialAttCount + 1);

    // 2. Update the same attendance record by ID — must NOT create a duplicate and must preserve createdAt
    const updatedAtt = store.upsertRecord<Record<string, any> & { id: string; userId: string }>(
      user.id,
      'attendance',
      {
        id: createdAtt.id,
        date: '2026-03-25',
        overtimeHours: 4.0,
        userRecordedOvertimeHours: 4.0,
        notes: 'Updated attendance note',
      },
    );

    assert.equal(updatedAtt.id, createdAtt.id);
    assert.equal(updatedAtt.createdAt, '2026-03-25T10:00:00.000Z');
    assert.equal(updatedAtt.userRecordedOvertimeHours, 4.0);
    assert.equal(updatedAtt.notes, 'Updated attendance note');
    const afterUpdateSlice = store.getUserSlice(user.id);
    assert.equal(afterUpdateSlice.attendance.length, initialAttCount + 1);

    // 3. Server-side validation rejects invalid records with actionable messages
    assert.throws(
      () => store.upsertRecord(user.id, 'loans', { loanCode: '', loanName: '', originalAmount: 0 }),
      /Please enter both Loan ID and Loan Name before saving/i,
    );
    assert.throws(
      () => store.upsertRecord(user.id, 'vacationPlans', { title: '', plannedDepartureDate: '2026-08-01', plannedReturnDate: '2026-08-10', plannedVacationDays: 10 }),
      /Please enter a Vacation Plan title before saving/i,
    );
    assert.throws(
      () => store.updateProfile(user.id, { fullName: '   ' }),
      /Full Name is required/i,
    );
  });

  it('19. Accurately converts hours and minutes to decimal hours (44h 30m = 44.5h, NEVER 44.30)', () => {
    assert.equal(hoursAndMinutesToDecimal(44, 30), 44.5);
    assert.equal(hoursAndMinutesToDecimal(10, 15), 10.25);
    assert.equal(hoursAndMinutesToDecimal(10, 45), 10.75);
    assert.equal(hoursAndMinutesToDecimal(0, 0), 0);

    const backConversion = decimalToHoursAndMinutes(44.5);
    assert.equal(backConversion.hours, 44);
    assert.equal(backConversion.minutes, 30);
  });

  it('20. Evaluates Saudi Labor Law Article 107 vs Company Payslip Overtime Calculator', () => {
    // Benchmark: Basic SAR 2,050, Food SAR 200, Overtime 44.5 hrs (44h 30m)
    const result = calculateOvertimeSalaryComparison({
      basicSalary: 2050,
      foodAllowance: 200,
      housingAllowance: 0,
      transportAllowance: 0,
      otherAllowances: 0,
      dailyWorkingHours: 8,
      regularOtHours: 44.5,
      restDayOtHours: 0,
      holidayOtHours: 0,
      companyFormulaType: 'basic_1_5',
      companyDivisorOverride: 240,
    });

    // Effective divisor = 30 * 8 = 240 hours
    assert.equal(result.effectiveDivisor, 240);
    assert.equal(result.totalMonthlySalary, 2250);
    assert.equal(result.totalOtHours, 44.5);

    // Basic hourly = 2050 / 240 = 8.541666... -> rounded to 8.54
    assert.equal(result.laborLawHourlyBasic, 8.54);
    // Actual hourly = 2250 / 240 = 9.375 -> rounded to 9.38
    assert.equal(result.laborLawHourlyActual, 9.38);
    // Statutory OT rate = 9.375 + 0.5 * 8.541666... = 13.645833... -> rounded to 13.65
    assert.equal(result.laborLawOtRate, 13.65);

    // Statutory Gross Overtime = 44.5 * 13.645833... = SAR 607.24
    assert.equal(result.laborLawGrossOt, 607.24);

    // Company formula: (Basic / 240) * 1.5 = 8.541666... * 1.5 = 12.8125 -> rounded to 12.81
    assert.equal(result.companyOtRate, 12.81);
    // Company Gross Overtime = 44.5 * 12.8125 = SAR 570.16
    assert.equal(result.companyGrossOt, 570.16);

    // Variance = 607.24 - 570.16 = SAR 37.08 underpayment
    assert.equal(result.varianceGross, 37.08);
    assert.equal(result.isUnderpaid, true);
    assert.equal(result.hasDiscrepancy, true);
  });

  it('21. Properly isolates deductions between Overtime-only and Total Monthly Salary', () => {
    const result = calculateOvertimeSalaryComparison({
      basicSalary: 2050,
      foodAllowance: 200,
      regularOtHours: 44.5,
      companyFormulaType: 'basic_1_5',
      deductions: [
        { id: 'd1', description: 'OT Late Penalty', amount: 50, appliesTo: 'overtime_only' },
        { id: 'd2', description: 'GOSI Employee Contribution', amount: 200, appliesTo: 'total_salary' },
      ],
    });

    assert.equal(result.totalOtDeductions, 50);
    assert.equal(result.totalSalaryDeductions, 200);
    assert.equal(result.totalAllDeductions, 250);

    // Labor Law Gross = 607.24 -> Net OT = 607.24 - 50 = 557.24
    assert.equal(result.laborLawNetOt, 557.24);

    // Total Monthly Final = 2250 + 607.24 - 250 = 2607.24
    assert.equal(result.laborLawFinalSalary, 2607.24);

    // Company Gross = 570.16 -> Net OT = 570.16 - 50 = 520.16
    assert.equal(result.companyNetOt, 520.16);
    // Company Final = 2250 + 570.16 - 250 = 2570.16
    assert.equal(result.companyFinalSalary, 2570.16);
  });

  it('22. Persists and isolates Saved Overtime Calculation records per authenticated user in store', () => {
    const store = new UserIsolatedDataStore();
    const userA = store.loginUser('rahim.khan@example.sa', 'SaudiPro#2026').user;
    const userB = store.loginUser('carlo.reyes@example.sa', 'SaudiPro#2026').user;

    const savedRecord = store.upsertRecord(userA.id, 'overtimeCalculations', {
      title: 'April 2026 Shift Overtime Check',
      calculationDate: '2026-04-15',
      basicSalary: 2050,
      foodAllowance: 200,
      housingAllowance: 0,
      transportAllowance: 0,
      otherAllowances: 0,
      totalMonthlySalary: 2250,
      dailyWorkingHours: 8,
      monthlyHoursDivisor: 240,
      regularOtHours: 44.5,
      restDayOtHours: 0,
      holidayOtHours: 0,
      totalOtHours: 44.5,
      otHoursInputMode: 'decimal',
      rawHours: 44,
      rawMinutes: 30,
      laborLawHourlyBasic: 8.54,
      laborLawHourlyActual: 9.38,
      laborLawOtRate: 13.65,
      laborLawRestDayRate: 13.65,
      laborLawGrossOt: 607.24,
      laborLawNetOt: 607.24,
      laborLawFinalSalary: 2857.24,
      companyFormulaType: 'basic_1_5',
      companyMultiplier: 1.5,
      companyFixedHourlyRate: 10,
      companyOtRate: 12.81,
      companyGrossOt: 570.16,
      companyNetOt: 570.16,
      companyFinalSalary: 2820.16,
      isCompanyFormulaVerified: false,
      deductions: [],
      totalOtDeductions: 0,
      totalSalaryDeductions: 0,
      totalAllDeductions: 0,
      varianceGross: 37.08,
      varianceNet: 37.08,
      notes: 'Initial verification',
      createdAt: new Date().toISOString(),
    });

    assert.ok(savedRecord.id);
    assert.equal(savedRecord.userId, userA.id);

    // User A can read their own saved calculation
    const sliceA = store.getUserSlice(userA.id);
    assert.equal(sliceA.overtimeCalculations?.length, 1);
    assert.equal(sliceA.overtimeCalculations[0].title, 'April 2026 Shift Overtime Check');

    // User B slice must NOT see User A's calculation
    const sliceB = store.getUserSlice(userB.id);
    assert.equal(sliceB.overtimeCalculations?.length, 0);

    // User B cannot access User A's calculation by ID
    assert.throws(
      () => store.getRecordById(userB.id, 'overtimeCalculations', savedRecord.id),
      /Unauthorized: Cross-user access denied/,
    );
  });
});



