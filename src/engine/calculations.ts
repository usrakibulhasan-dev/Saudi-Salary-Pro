import type {
  AttendanceStatus,
  DailyAttendanceRecord,
  LeaveRecord,
  OvertimeDeductionItem,
  PayslipRecord,
  SalaryVersion,
  ShiftType,
  TerminationReason,
} from '../types/payroll.ts';

export function getLocalTodayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Decimal-safe monetary rounding to 2 decimal places (Halalas).
 */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Converts hours and minutes into decimal hours (e.g. 44h 30m -> 44.5, NEVER 44.30).
 */
export function hoursAndMinutesToDecimal(hours: number, minutes: number): number {
  const safeH = Math.max(0, Number.isFinite(hours) ? hours : 0);
  const safeM = Math.max(0, Number.isFinite(minutes) ? minutes : 0);
  return Math.round(((safeH + safeM / 60) + Number.EPSILON) * 10000) / 10000;
}

export function decimalToHoursAndMinutes(decimalHours: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Number.isFinite(decimalHours) ? decimalHours : 0);
  const wholeHours = Math.floor(safe + 1e-9);
  const remainingMinutes = Math.round((safe - wholeHours) * 60);
  if (remainingMinutes >= 60) {
    return { hours: wholeHours + 1, minutes: 0 };
  }
  return { hours: wholeHours, minutes: remainingMinutes };
}

/**
 * Parses "HH:mm" into minutes since 00:00. Returns null if empty or invalid.
 */
export function parseTimeHHMM(timeStr?: string): number | null {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
  const [hStr, mStr] = timeStr.trim().split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export interface AttendanceMetricsInput {
  status: AttendanceStatus;
  shiftType: ShiftType;
  scheduledStart: string;
  scheduledEnd: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  expectedDailyHours: number;
  userRecordedOvertimeHours?: number;
  isWeeklyRestDay: boolean;
  isPublicHoliday: boolean;
}

export interface AttendanceMetricsResult {
  elapsedHours: number;
  netWorkingHours: number;
  regularScheduledHours: number;
  userRecordedOvertimeHours: number;
  estimatedPayableOvertimeHours: number;
  isIncomplete: boolean;
  validationErrors: string[];
  calculationNotes: string[];
}

/**
 * Section 7: Daily Attendance & Working-Hours Engine.
 * Supports overnight shifts crossing midnight, break deductions, incomplete entry detection,
 * and separates A) Elapsed, B) Net Working, C) Regular Scheduled, D) User-Recorded OT, and E) Estimated Payable OT.
 */
export function calculateAttendanceMetrics(
  input: AttendanceMetricsInput
): AttendanceMetricsResult {
  const validationErrors: string[] = [];
  const calculationNotes: string[] = [];

  const nonWorkingStatuses: AttendanceStatus[] = [
    'absent',
    'sick_leave',
    'annual_leave',
    'emergency_leave',
    'unpaid_leave',
    'public_holiday',
    'weekly_off',
  ];

  const isPresent = input.status === 'present';
  const schedIn = parseTimeHHMM(input.scheduledStart);
  const schedOut = parseTimeHHMM(input.scheduledEnd);

  let regularScheduledHours = Math.max(0, Number(input.expectedDailyHours) || 8);
  if (schedIn !== null && schedOut !== null) {
    let schedDiff = schedOut - schedIn;
    if (schedDiff <= 0) schedDiff += 24 * 60; // Overnight scheduled shift
    regularScheduledHours = roundCurrency(schedDiff / 60);
  }

  if (input.isWeeklyRestDay || input.isPublicHoliday || nonWorkingStatuses.includes(input.status)) {
    if (!isPresent) {
      return {
        elapsedHours: 0,
        netWorkingHours: 0,
        regularScheduledHours: input.isWeeklyRestDay || input.isPublicHoliday ? 0 : regularScheduledHours,
        userRecordedOvertimeHours: 0,
        estimatedPayableOvertimeHours: 0,
        isIncomplete: false,
        validationErrors,
        calculationNotes: [`Non-working status (${input.status}) recorded.`],
      };
    }
  }

  const inMins = parseTimeHHMM(input.clockIn);
  const outMins = parseTimeHHMM(input.clockOut);

  // If Present but missing clockIn or clockOut, flag as incomplete rather than inventing times
  if (inMins === null || outMins === null) {
    return {
      elapsedHours: 0,
      netWorkingHours: 0,
      regularScheduledHours: input.isWeeklyRestDay || input.isPublicHoliday ? 0 : regularScheduledHours,
      userRecordedOvertimeHours: Math.max(0, Number(input.userRecordedOvertimeHours) || 0),
      estimatedPayableOvertimeHours: Math.max(0, Number(input.userRecordedOvertimeHours) || 0),
      isIncomplete: true,
      validationErrors,
      calculationNotes: [
        'Incomplete entry: Clock-in or clock-out time is missing. Times are not invented; complete the timestamps when available.',
      ],
    };
  }

  let elapsedMins = outMins - inMins;
  if (elapsedMins < 0) {
    // Overnight shift crossing midnight (e.g. 22:00 to 06:00)
    elapsedMins += 24 * 60;
    calculationNotes.push('Overnight shift crossing midnight detected (+24h boundary applied).');
  }

  if (elapsedMins === 0) {
    validationErrors.push('Clock-in and clock-out times cannot be identical for a worked shift.');
  }
  if (elapsedMins > 20 * 60) {
    validationErrors.push('Elapsed shift duration exceeds 20 hours in a single day; verify clock-in/out times.');
  }

  const breakMins = Math.max(0, Number(input.breakMinutes) || 0);
  if (breakMins >= elapsedMins && elapsedMins > 0) {
    validationErrors.push('Break duration cannot be equal to or greater than total elapsed shift time.');
  }

  const netMins = Math.max(0, elapsedMins - breakMins);
  const elapsedHours = roundCurrency(elapsedMins / 60);
  const netWorkingHours = roundCurrency(netMins / 60);

  // On a weekly rest day or public holiday, all worked net hours count toward estimated payable overtime under Art. 107
  const effectiveRegularCap =
    input.isWeeklyRestDay || input.isPublicHoliday
      ? 0
      : Math.max(0, Number(input.expectedDailyHours) || 8);

  const estimatedPayableOvertimeHours = roundCurrency(
    Math.max(0, netWorkingHours - effectiveRegularCap)
  );

  const userRecordedOvertimeHours =
    typeof input.userRecordedOvertimeHours === 'number' && input.userRecordedOvertimeHours >= 0
      ? roundCurrency(input.userRecordedOvertimeHours)
      : estimatedPayableOvertimeHours;

  calculationNotes.push(
    `Elapsed: ${elapsedHours}h − Break: ${(breakMins / 60).toFixed(2)}h = Net Working: ${netWorkingHours}h (Regular cap: ${effectiveRegularCap}h, Est. OT: ${estimatedPayableOvertimeHours}h)`
  );

  return {
    elapsedHours,
    netWorkingHours,
    regularScheduledHours: effectiveRegularCap,
    userRecordedOvertimeHours,
    estimatedPayableOvertimeHours,
    isIncomplete: false,
    validationErrors,
    calculationNotes,
  };
}

/**
 * Section 6: Resolves the effective salary for a given month (YYYY-MM) from versioned salary history.
 * Supports mid-month salary raises by prorating days before and after the effective date.
 */
export function resolveEffectiveSalaryForMonth(
  versions: SalaryVersion[],
  employmentId: string,
  monthYear: string // YYYY-MM
): {
  basicSalary: number;
  housingAllowance: number;
  foodAllowance: number;
  transportAllowance: number;
  otherFixedAllowances: number;
  variableAllowances: number;
  actualWage: number;
  usedVersions: SalaryVersion[];
  explanation: string;
} {
  const empVersions = versions
    .filter((v) => v.employmentId === employmentId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  if (empVersions.length === 0) {
    return {
      basicSalary: 0,
      housingAllowance: 0,
      foodAllowance: 0,
      transportAllowance: 0,
      otherFixedAllowances: 0,
      variableAllowances: 0,
      actualWage: 0,
      usedVersions: [],
      explanation: 'No salary version configured for this employment period.',
    };
  }

  const [yStr, mStr] = monthYear.split('-');
  const year = Number(yStr);
  const month = Number(mStr); // 1..12
  const monthStart = `${monthYear}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${monthYear}-${String(daysInMonth).padStart(2, '0')}`;

  // Check if a version starts mid-month inside this monthYear
  const midMonthVersion = empVersions.find(
    (v) => v.effectiveFrom > monthStart && v.effectiveFrom <= monthEnd
  );

  if (midMonthVersion) {
    const priorVersion = [...empVersions]
      .reverse()
      .find((v) => v.effectiveFrom <= monthStart);

    if (priorVersion) {
      const changeDay = Number(midMonthVersion.effectiveFrom.slice(8, 10));
      const priorDays = Math.max(0, changeDay - 1);
      const newDays = Math.max(0, daysInMonth - priorDays);
      const wPrior = priorDays / daysInMonth;
      const wNew = newDays / daysInMonth;

      const basicSalary = roundCurrency(
        priorVersion.basicSalary * wPrior + midMonthVersion.basicSalary * wNew
      );
      const housingAllowance = roundCurrency(
        priorVersion.housingAllowance * wPrior + midMonthVersion.housingAllowance * wNew
      );
      const foodAllowance = roundCurrency(
        priorVersion.foodAllowance * wPrior + midMonthVersion.foodAllowance * wNew
      );
      const transportAllowance = roundCurrency(
        priorVersion.transportAllowance * wPrior + midMonthVersion.transportAllowance * wNew
      );
      const otherFixedAllowances = roundCurrency(
        priorVersion.otherFixedAllowances * wPrior + midMonthVersion.otherFixedAllowances * wNew
      );
      const variableAllowances = roundCurrency(
        priorVersion.variableAllowances * wPrior + midMonthVersion.variableAllowances * wNew
      );
      const actualWage = roundCurrency(
        basicSalary + housingAllowance + foodAllowance + transportAllowance + otherFixedAllowances
      );

      return {
        basicSalary,
        housingAllowance,
        foodAllowance,
        transportAllowance,
        otherFixedAllowances,
        variableAllowances,
        actualWage,
        usedVersions: [priorVersion, midMonthVersion],
        explanation: `Prorated mid-month salary change in ${monthYear}: ${priorDays} days under version effective ${priorVersion.effectiveFrom} and ${newDays} days under version effective ${midMonthVersion.effectiveFrom}.`,
      };
    }
  }

  // Otherwise pick the latest version effective on or before monthEnd
  const active =
    [...empVersions].reverse().find((v) => v.effectiveFrom <= monthEnd) ||
    empVersions[empVersions.length - 1];

  const actualWage = roundCurrency(
    active.basicSalary +
      active.housingAllowance +
      active.foodAllowance +
      active.transportAllowance +
      active.otherFixedAllowances
  );

  return {
    basicSalary: active.basicSalary,
    housingAllowance: active.housingAllowance,
    foodAllowance: active.foodAllowance,
    transportAllowance: active.transportAllowance,
    otherFixedAllowances: active.otherFixedAllowances,
    variableAllowances: active.variableAllowances,
    actualWage,
    usedVersions: [active],
    explanation: `Using salary version effective from ${active.effectiveFrom} (${active.reasonForChange}).`,
  };
}

/**
 * Section 8: Saudi Labor Law Article 107 Overtime Calculator.
 * Formula: Actual Hourly Wage + 50% of Basic Hourly Wage.
 */
export function calculateOvertimePay(params: {
  basicSalary: number;
  actualSalary: number;
  overtimeDecimalHours: number;
  monthlyDaysDivisor?: number;
  dailyHoursDivisor?: number;
  basis?: 'saudi_art_107' | 'basic_150';
}) {
  const days = params.monthlyDaysDivisor && params.monthlyDaysDivisor > 0 ? params.monthlyDaysDivisor : 30;
  const dailyHours = params.dailyHoursDivisor && params.dailyHoursDivisor > 0 ? params.dailyHoursDivisor : 8;
  const divisor = days * dailyHours;

  const basicHourly = params.basicSalary / divisor;
  const actualHourly = params.actualSalary / divisor;
  const art107HourlyRate = actualHourly + 0.5 * basicHourly;
  const basic150HourlyRate = basicHourly * 1.5;

  const selectedRate = params.basis === 'basic_150' ? basic150HourlyRate : art107HourlyRate;
  const estimatedAmount = roundCurrency(params.overtimeDecimalHours * selectedRate);
  const statutoryArt107Amount = roundCurrency(params.overtimeDecimalHours * art107HourlyRate);
  const basic150Amount = roundCurrency(params.overtimeDecimalHours * basic150HourlyRate);

  return {
    divisorHours: divisor,
    basicHourlyWage: roundCurrency(basicHourly),
    actualHourlyWage: roundCurrency(actualHourly),
    statutoryHourlyRate: roundCurrency(art107HourlyRate),
    basic150HourlyRate: roundCurrency(basic150HourlyRate),
    estimatedAmount,
    statutoryArt107Amount,
    basic150Amount,
    formula: `Actual Hourly (SAR ${actualHourly.toFixed(4)}) + 50% Basic Hourly (SAR ${(0.5 * basicHourly).toFixed(4)}) = SAR ${art107HourlyRate.toFixed(4)}/hr × ${params.overtimeDecimalHours} hrs = SAR ${statutoryArt107Amount.toFixed(2)}`,
    source: 'Saudi Labor Law Article 107 (HRSD)',
  };
}

/**
 * Section 12: Salary Reconciliation & Bank Credit Discrepancy Analyzer.
 */
export function reconcileMonthlySalary(params: {
  monthYear: string;
  expectedBasic: number;
  expectedActualWage: number;
  recordedAttendanceOvertimeHours: number;
  payslip?: PayslipRecord;
}) {
  const otEstimate = calculateOvertimePay({
    basicSalary: params.expectedBasic,
    actualSalary: params.expectedActualWage,
    overtimeDecimalHours: params.recordedAttendanceOvertimeHours,
  });

  const expectedGross = roundCurrency(params.expectedActualWage + otEstimate.statutoryArt107Amount);

  if (!params.payslip) {
    return {
      hasPayslip: false,
      expectedActualWage: params.expectedActualWage,
      recordedOvertimeHours: params.recordedAttendanceOvertimeHours,
      expectedOvertimePay: otEstimate.statutoryArt107Amount,
      expectedGross,
      payslipGross: 0,
      payslipNet: 0,
      bankCreditAmount: 0,
      overtimeHoursDiff: 0,
      overtimePayDiff: 0,
      grossDiff: 0,
      netVsBankDiff: 0,
      possibleExplanations: [
        `No payslip recorded yet for ${params.monthYear}. Add a manual or OCR-extracted salary slip to reconcile.`,
      ],
    };
  }

  const slip = params.payslip;
  const overtimeHoursDiff = roundCurrency(slip.overtimeHours - params.recordedAttendanceOvertimeHours);
  const overtimePayDiff = roundCurrency(slip.overtimeAmount - otEstimate.statutoryArt107Amount);
  const grossDiff = roundCurrency(slip.grossEarnings - (expectedGross + slip.bonus));
  const bankCredit = typeof slip.bankCreditAmount === 'number' ? slip.bankCreditAmount : slip.netSalary;
  const netVsBankDiff = roundCurrency(bankCredit - slip.netSalary);

  const possibleExplanations: string[] = [];
  if (Math.abs(overtimeHoursDiff) > 0.01) {
    possibleExplanations.push(
      `Overtime hours variance (${Math.abs(overtimeHoursDiff).toFixed(2)} hrs): Payslip states ${slip.overtimeHours} hrs vs ${params.recordedAttendanceOvertimeHours} hrs recorded in your daily tracker. Possible causes: payroll cutoff date differences (e.g. 25th-to-25th cycle) or pending supervisor approval.`
    );
  }
  if (Math.abs(overtimePayDiff) > 0.5) {
    possibleExplanations.push(
      `Overtime amount variance (SAR ${Math.abs(overtimePayDiff).toFixed(2)}): Employer may be calculating overtime on 150% of Basic Wage (SAR ${otEstimate.basic150Amount.toFixed(2)}) instead of Article 107 Actual Hourly + 50% Basic Hourly (SAR ${otEstimate.statutoryArt107Amount.toFixed(2)}), or using a different monthly hours divisor.`
    );
  }
  if (Math.abs(netVsBankDiff) > 0.01) {
    possibleExplanations.push(
      `Bank credit vs Payslip Net variance (SAR ${Math.abs(netVsBankDiff).toFixed(2)}): Actual bank deposit (SAR ${bankCredit.toFixed(2)}) differs from payslip net (SAR ${slip.netSalary.toFixed(2)}). Check for halala integer rounding, loan deductions, or partial transfers.`
    );
  }
  if (possibleExplanations.length === 0) {
    possibleExplanations.push(
      'All reconciled figures (expected wage, recorded overtime, payslip net, and bank credit) match within SAR 0.50.'
    );
  }

  return {
    hasPayslip: true,
    expectedActualWage: params.expectedActualWage,
    recordedOvertimeHours: params.recordedAttendanceOvertimeHours,
    expectedOvertimePay: otEstimate.statutoryArt107Amount,
    expectedGross,
    payslipGross: slip.grossEarnings,
    payslipNet: slip.netSalary,
    bankCreditAmount: bankCredit,
    overtimeHoursDiff,
    overtimePayDiff,
    grossDiff,
    netVsBankDiff,
    possibleExplanations,
  };
}

/**
 * Exact service duration helper between two ISO dates (YYYY-MM-DD).
 */
export function calculateServiceDuration(
  startDateStr: string,
  endDateStr: string,
  excludedUnpaidDays = 0
) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalCalendarDays: 0,
      effectiveServiceDays: 0,
      decimalYears: 0,
      isValid: false,
    };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalCalendarDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay));
  const safeExcluded = Math.max(0, Math.min(totalCalendarDays, excludedUnpaidDays || 0));
  const effectiveServiceDays = Math.max(0, totalCalendarDays - safeExcluded);

  const adjustedEnd = new Date(end.getTime() - safeExcluded * msPerDay);
  let years = adjustedEnd.getUTCFullYear() - start.getUTCFullYear();
  let months = adjustedEnd.getUTCMonth() - start.getUTCMonth();
  let days = adjustedEnd.getUTCDate() - start.getUTCDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(Date.UTC(adjustedEnd.getUTCFullYear(), adjustedEnd.getUTCMonth(), 0));
    days += prevMonth.getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const decimalYears =
    Math.round(((years + months / 12 + days / 365) + Number.EPSILON) * 1000000) / 1000000;

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
    totalCalendarDays,
    effectiveServiceDays,
    decimalYears: Math.max(0, decimalYears),
    isValid: true,
  };
}

/**
 * Section 13: EOSB Estimator (Saudi Labor Law Articles 84, 85, 86, 87).
 * Strictly per single employment period (never combines separate employers).
 */
export function calculateEOSB(input: {
  startDate: string;
  endDate: string;
  basicSalary: number;
  actualSalary: number;
  wageBasisType: 'actual_wage' | 'basic_only';
  contractType: 'fixed_term' | 'indefinite';
  terminationReason: TerminationReason;
  unpaidLeaveDaysToExclude?: number;
}) {
  const duration = calculateServiceDuration(
    input.startDate,
    input.endDate,
    input.unpaidLeaveDaysToExclude || 0
  );

  const wageBasisAmount = roundCurrency(
    input.wageBasisType === 'basic_only' ? input.basicSalary : input.actualSalary
  );

  const totalYears = duration.decimalYears;
  const firstFive = Math.min(5, totalYears);
  const subsequent = Math.max(0, totalYears - 5);

  const firstFiveYearsAmount = roundCurrency(firstFive * 0.5 * wageBasisAmount);
  const subsequentYearsAmount = roundCurrency(subsequent * 1.0 * wageBasisAmount);
  const fullAward = roundCurrency(firstFiveYearsAmount + subsequentYearsAmount);

  let entitlementFraction = 1;
  const notes: string[] = [];

  if (input.terminationReason === 'resignation') {
    if (totalYears < 2) {
      entitlementFraction = 0;
      notes.push('Under Article 85, resignation with less than 2 years of service yields 0% statutory EOSB.');
    } else if (totalYears < 5) {
      entitlementFraction = 1 / 3;
      notes.push('Under Article 85, resignation between 2 and 5 years yields 1/3 (33.33%) of the full EOSB award.');
    } else if (totalYears < 10) {
      entitlementFraction = 2 / 3;
      notes.push('Under Article 85, resignation between 5 and 10 years yields 2/3 (66.67%) of the full EOSB award.');
    } else {
      entitlementFraction = 1;
      notes.push('Under Article 85, resignation after 10 or more years yields 100% of the full EOSB award.');
    }
  } else if (input.terminationReason === 'article_80_dismissal_for_cause') {
    entitlementFraction = 0;
    notes.push('Article 80 termination for cause carries 0% statutory EOSB (requires strict legal proof under Saudi Labor Law).');
  } else if (input.terminationReason === 'article_87_force_majeure_marriage_childbirth') {
    entitlementFraction = 1;
    notes.push('Article 87 exception (force majeure, or female employee within 6m of marriage / 3m of childbirth) yields 100% full EOSB.');
  } else {
    notes.push('Article 84 full statutory entitlement (100%) applied.');
  }

  const estimatedEOSB = roundCurrency(fullAward * entitlementFraction);

  return {
    duration,
    wageBasisAmount,
    firstFiveYearsAmount,
    subsequentYearsAmount,
    fullAward,
    entitlementPercentage: roundCurrency(entitlementFraction * 100),
    resignationReduction: roundCurrency(fullAward - estimatedEOSB),
    estimatedEOSB,
    formula: `First 5 yrs (${firstFive.toFixed(3)} × 0.5 × SAR ${wageBasisAmount}) + Subsequent yrs (${subsequent.toFixed(3)} × 1.0 × SAR ${wageBasisAmount}) × ${(entitlementFraction * 100).toFixed(2)}% = SAR ${estimatedEOSB.toFixed(2)}`,
    officialSource: 'Saudi Labor Law Articles 84–87 (HRSD)',
    notes,
  };
}

/**
 * Section 9: Annual Leave & Sick Leave Balance Summary (Articles 109, 111 & 117).
 */
export function calculateLeaveSummary(params: {
  joiningDate: string;
  asOfDate: string;
  configuredEntitlementDays?: number;
  carryoverDays: number;
  leaveRecords: LeaveRecord[];
  actualMonthlyWage: number;
}) {
  const duration = calculateServiceDuration(params.joiningDate, params.asOfDate);
  const statutoryMin = duration.decimalYears >= 5 ? 30 : 21;
  const annualEntitlement =
    params.configuredEntitlementDays && params.configuredEntitlementDays >= statutoryMin
      ? params.configuredEntitlementDays
      : statutoryMin;

  const approvedOrTaken = params.leaveRecords.filter((r) => r.approvalStatus !== 'rejected');

  const sumByType = (t: LeaveRecord['leaveType']) =>
    roundCurrency(
      approvedOrTaken
        .filter((r) => r.leaveType === t)
        .reduce((acc, r) => acc + (Number(r.totalDays) || 0), 0)
    );

  const annualLeaveTaken = sumByType('annual_leave');
  const sickLeaveTaken = sumByType('sick_leave');
  const unpaidLeaveTaken = sumByType('unpaid_leave');
  const absentDays = sumByType('absent');
  const emergencyLeaveTaken = sumByType('emergency_leave');

  const totalAccruedAnnual = roundCurrency(duration.decimalYears * annualEntitlement);
  const remainingAnnualBalance = roundCurrency(
    Math.max(0, totalAccruedAnnual + (params.carryoverDays || 0) - annualLeaveTaken)
  );
  const dailyWage = roundCurrency(params.actualMonthlyWage / 30);
  const unusedLeaveValue = roundCurrency(remainingAnnualBalance * dailyWage);

  // Article 117 Sick Leave tier breakdown (30d full pay, 60d 75% pay, 30d unpaid)
  const sickFullPayDays = Math.min(30, sickLeaveTaken);
  const sickThreeQuarterDays = Math.max(0, Math.min(60, sickLeaveTaken - 30));
  const sickUnpaidDays = Math.max(0, Math.min(30, sickLeaveTaken - 90));

  return {
    serviceDecimalYears: duration.decimalYears,
    statutoryMinEntitlement: statutoryMin,
    annualEntitlement,
    totalAccruedAnnual,
    annualLeaveTaken,
    remainingAnnualBalance,
    unusedLeaveValue,
    sickLeaveTaken,
    sickFullPayDays,
    sickThreeQuarterDays,
    sickUnpaidDays,
    unpaidLeaveTaken,
    absentDays,
    emergencyLeaveTaken,
    dailyWage,
    source: 'Saudi Labor Law Articles 109, 111 (Annual Leave) & Article 117 (Sick Leave)',
  };
}

/**
 * Section 10: Monthly Attendance & Employment Report Aggregator.
 */
export function generateMonthlyAttendanceReport(params: {
  monthYear: string; // YYYY-MM
  attendanceRecords: DailyAttendanceRecord[];
  leaveRecords: LeaveRecord[];
  salaryInfo: ReturnType<typeof resolveEffectiveSalaryForMonth>;
  payslip?: PayslipRecord;
}) {
  const [yStr, mStr] = params.monthYear.split('-');
  const calendarDays = new Date(Date.UTC(Number(yStr), Number(mStr), 0)).getUTCDate();

  const monthAtt = params.attendanceRecords.filter((r) => r.date.startsWith(params.monthYear));

  const presentDays = monthAtt.filter((r) => r.status === 'present').length;
  const absenceDays = monthAtt.filter((r) => r.status === 'absent').length;
  const sickLeaveDays = monthAtt.filter((r) => r.status === 'sick_leave').length;
  const annualLeaveDays = monthAtt.filter((r) => r.status === 'annual_leave').length;
  const otherLeaveDays = monthAtt.filter(
    (r) => r.status === 'emergency_leave' || r.status === 'unpaid_leave'
  ).length;
  const weeklyRestDays = monthAtt.filter(
    (r) => r.isWeeklyRestDay || r.status === 'weekly_off'
  ).length;
  const publicHolidays = monthAtt.filter(
    (r) => r.isPublicHoliday || r.status === 'public_holiday'
  ).length;
  const incompleteEntries = monthAtt.filter((r) => r.isIncomplete).length;

  const scheduledHours = roundCurrency(
    monthAtt.reduce((s, r) => s + (r.regularScheduledHours || 0), 0)
  );
  const netWorkingHours = roundCurrency(
    monthAtt.reduce((s, r) => s + (r.netWorkingHours || 0), 0)
  );
  const recordedOvertimeHours = roundCurrency(
    monthAtt.reduce((s, r) => s + (r.userRecordedOvertimeHours || 0), 0)
  );
  const estimatedPayableOvertimeHours = roundCurrency(
    monthAtt.reduce((s, r) => s + (r.estimatedPayableOvertimeHours || 0), 0)
  );

  const overtimePayEstimate = calculateOvertimePay({
    basicSalary: params.salaryInfo.basicSalary,
    actualSalary: params.salaryInfo.actualWage,
    overtimeDecimalHours: recordedOvertimeHours,
  });

  return {
    monthYear: params.monthYear,
    generatedAt: new Date().toISOString(),
    calendarDays,
    recordedDaysCount: monthAtt.length,
    unrecordedDaysCount: Math.max(0, calendarDays - monthAtt.length),
    presentDays,
    absenceDays,
    sickLeaveDays,
    annualLeaveDays,
    otherLeaveDays,
    weeklyRestDays,
    publicHolidays,
    incompleteEntries,
    scheduledHours,
    netWorkingHours,
    recordedOvertimeHours,
    estimatedPayableOvertimeHours,
    estimatedOvertimePay: overtimePayEstimate.statutoryArt107Amount,
    overtimeFormula: overtimePayEstimate.formula,
    salaryVersionExplanation: params.salaryInfo.explanation,
    expectedActualWage: params.salaryInfo.actualWage,
    payslipNet: params.payslip?.netSalary,
    bankCreditAmount: params.payslip?.bankCreditAmount,
  };
}

/**
 * Checks whether a calendar year is a leap year (366 days).
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Counts inclusive calendar days between two YYYY-MM-DD dates (e.g. 2026-09-01 to 2026-12-31 = 122 days).
 */
export function countInclusiveDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  if (Number.isNaN(startUtc) || Number.isNaN(endUtc) || endUtc < startUtc) return 0;
  return Math.round((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
}

import type {
  AccrualDayBasis,
  AccrualMethodType,
  EmployeeLoanRecord,
  EmploymentPeriod,
  LoanRepaymentRecord,
  VacationAccrualPeriod,
  VacationPayBasisType,
  VacationPayDivisorMethod,
  VacationPlanRecord,
  VacationYearViewMode,
  YearByYearVacationRow,
} from '../types/payroll.ts';

/**
 * Helper to get the active SalaryVersion for a given employment and date (YYYY-MM-DD or YYYY-MM).
 */
export function getEffectiveSalaryVersion(
  versions: SalaryVersion[],
  employmentId: string,
  asOfDate: string,
): SalaryVersion | undefined {
  const empVersions = versions
    .filter((v) => v.employmentId === employmentId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (empVersions.length === 0) return versions[0];
  const dateStr = asOfDate.length === 7 ? `${asOfDate}-15` : asOfDate;
  return (
    [...empVersions].reverse().find((v) => v.effectiveFrom <= dateStr) ||
    empVersions[empVersions.length - 1]
  );
}

/**
 * Helper for career leave balances from an EmploymentPeriod and LeaveRecord list.
 */
export function calculateLeaveBalances(
  employment: EmploymentPeriod,
  leaveRecords: LeaveRecord[],
  asOfDate: string,
) {
  return calculateLeaveSummary({
    joiningDate: employment.joiningDate,
    asOfDate,
    configuredEntitlementDays: employment.annualLeaveEntitlementDays,
    carryoverDays: 0,
    leaveRecords,
    actualMonthlyWage: 7000,
  });
}

/**
 * LOAN MANAGEMENT ENGINE (Section 1: B, C, D)
 * Outstanding Balance = Original Loan Amount - Total Principal Repaid (strictly from saved repayment records).
 * Supports both calculateLoanPortfolioSummary(loans, repayments, selectedMonth) and
 * calculateLoanPortfolioSummary({ loans, repayments, selectedMonth }).
 */
export function calculateLoanPortfolioSummary(
  loansOrParams:
    | EmployeeLoanRecord[]
    | {
        loans: EmployeeLoanRecord[];
        repayments: LoanRepaymentRecord[];
        selectedMonth: string;
      },
  repaymentsArg?: LoanRepaymentRecord[],
  selectedMonthArg?: string,
) {
  const loans = Array.isArray(loansOrParams) ? loansOrParams : loansOrParams.loans || [];
  const repayments = Array.isArray(loansOrParams)
    ? repaymentsArg || []
    : loansOrParams.repayments || [];
  const selectedMonth = Array.isArray(loansOrParams)
    ? selectedMonthArg || '2026-03'
    : loansOrParams.selectedMonth || '2026-03';

  const perLoanBreakdown = loans.map((loan) => {
    const loanReps = repayments
      .filter((r) => r.loanId === loan.id)
      .sort((a, b) => a.deductionDate.localeCompare(b.deductionDate));

    const totalPrincipalRepaid = roundCurrency(
      loanReps.reduce((sum, r) => sum + (Number(r.amountAppliedToPrincipal) || 0), 0),
    );
    const outstandingBalance = roundCurrency(loan.originalAmount - totalPrincipalRepaid);
    const progressPercentage =
      loan.originalAmount > 0
        ? roundCurrency(Math.min(100, Math.max(0, (totalPrincipalRepaid / loan.originalAmount) * 100)))
        : 0;

    // Is this loan scheduled for a deduction in selectedMonth?
    const isScheduledForMonth =
      loan.status === 'active' &&
      outstandingBalance > 0 &&
      selectedMonth >= loan.firstDeductionMonth &&
      (!loan.expectedFinalDeductionMonth || selectedMonth <= loan.expectedFinalDeductionMonth);

    const scheduledForSelectedMonth = isScheduledForMonth
      ? roundCurrency(Math.min(loan.monthlyDeductionAmount, outstandingBalance))
      : 0;

    const monthRepayments = loanReps.filter((r) => r.salaryMonth === selectedMonth);
    const actualConfirmedDeductionForMonth = roundCurrency(
      monthRepayments.reduce((sum, r) => sum + (Number(r.actualDeduction) || 0), 0),
    );
    const principalAppliedForMonth = roundCurrency(
      monthRepayments.reduce((sum, r) => sum + (Number(r.amountAppliedToPrincipal) || 0), 0),
    );

    return {
      loan,
      repayments: loanReps,
      totalPrincipalRepaid,
      principalRepaid: totalPrincipalRepaid,
      outstandingBalance,
      progressPercentage,
      scheduledForSelectedMonth,
      actualConfirmedDeductionForMonth,
      principalAppliedForMonth,
      hasConfirmedRepaymentForMonth: monthRepayments.length > 0,
    };
  });

  const totalLoansTaken = loans.length;
  const totalOriginalLoanAmount = roundCurrency(
    loans.reduce((sum, l) => sum + (Number(l.originalAmount) || 0), 0),
  );
  const totalLoanAmountRepaid = roundCurrency(
    perLoanBreakdown.reduce((sum, b) => sum + b.totalPrincipalRepaid, 0),
  );
  const totalOutstandingLoanBalance = roundCurrency(
    perLoanBreakdown.reduce((sum, b) => sum + Math.max(0, b.outstandingBalance), 0),
  );
  const totalScheduledMonthlyDeduction = roundCurrency(
    perLoanBreakdown.reduce((sum, b) => sum + b.scheduledForSelectedMonth, 0),
  );
  const totalConfirmedMonthlyDeduction = roundCurrency(
    perLoanBreakdown.reduce((sum, b) => sum + b.actualConfirmedDeductionForMonth, 0),
  );
  const activeLoansCount = loans.filter(
    (l) =>
      l.status === 'active' &&
      (perLoanBreakdown.find((b) => b.loan.id === l.id)?.outstandingBalance ?? 0) > 0,
  ).length;

  return {
    selectedMonth,
    totalLoansTaken,
    totalOriginalLoanAmount,
    totalOriginalAmount: totalOriginalLoanAmount,
    totalLoanAmountRepaid,
    totalPrincipalRepaid: totalLoanAmountRepaid,
    totalScheduledMonthlyDeduction,
    totalConfirmedMonthlyDeduction,
    totalActualMonthlyDeduction: totalConfirmedMonthlyDeduction,
    totalOutstandingLoanBalance,
    totalOutstandingBalance: totalOutstandingLoanBalance,
    activeLoansCount,
    perLoanBreakdown,
    loanBreakdown: perLoanBreakdown,
  };
}

/**
 * Validates a candidate loan repayment before saving:
 * 1) Blocks duplicate deduction for the same loan + salaryMonth unless confirmed.
 * 2) Blocks negative remaining balance unless confirmed.
 */
export function validateLoanRepaymentCandidate(params: {
  loan: EmployeeLoanRecord;
  existingRepayments: LoanRepaymentRecord[];
  salaryMonth: string;
  actualDeduction?: number;
  amountAppliedToPrincipal: number;
  editingRepaymentId?: string;
  confirmDuplicateForMonth?: boolean;
  allowDuplicateMonth?: boolean;
  confirmNegativeBalance?: boolean;
  allowNegativeBalance?: boolean;
}) {
  const otherReps = params.existingRepayments.filter(
    (r) => r.loanId === params.loan.id && r.id !== params.editingRepaymentId,
  );
  const alreadyRepaid = roundCurrency(
    otherReps.reduce((s, r) => s + (Number(r.amountAppliedToPrincipal) || 0), 0),
  );
  const currentBalanceBefore = roundCurrency(params.loan.originalAmount - alreadyRepaid);
  const remainingBalanceAfter = roundCurrency(
    currentBalanceBefore - (Number(params.amountAppliedToPrincipal) || 0),
  );

  const duplicateInMonth = otherReps.some((r) => r.salaryMonth === params.salaryMonth);
  const dupConfirmed = Boolean(params.confirmDuplicateForMonth || params.allowDuplicateMonth);
  const negConfirmed = Boolean(params.confirmNegativeBalance || params.allowNegativeBalance);

  const requiresDuplicateConfirmation = duplicateInMonth && !dupConfirmed;
  const requiresNegativeBalanceConfirmation = remainingBalanceAfter < 0 && !negConfirmed;

  const duplicateMonthWarning = duplicateInMonth
    ? `A deduction is already recorded for Loan ${params.loan.loanCode} in salary month ${params.salaryMonth}. Confirm explicitly if this is an intentional additional deduction.`
    : null;
  const negativeBalanceWarning =
    remainingBalanceAfter < 0
      ? `Applying SAR ${params.amountAppliedToPrincipal.toFixed(2)} to principal would make the remaining balance negative (SAR ${remainingBalanceAfter.toFixed(2)}). Confirm explicitly or reduce the principal amount.`
      : null;

  const warnings: string[] = [];
  if (requiresDuplicateConfirmation && duplicateMonthWarning) warnings.push(duplicateMonthWarning);
  if (requiresNegativeBalanceConfirmation && negativeBalanceWarning) warnings.push(negativeBalanceWarning);

  const isValid = !requiresDuplicateConfirmation && !requiresNegativeBalanceConfirmation;

  return {
    isValid,
    canSave: isValid,
    hasDuplicateMonth: duplicateInMonth,
    requiresDuplicateConfirmation,
    wouldBecomeNegative: remainingBalanceAfter < 0,
    requiresNegativeBalanceConfirmation,
    currentBalanceBefore,
    currentOutstandingBalance: currentBalanceBefore,
    remainingBalanceAfter,
    projectedRemainingBalance: remainingBalanceAfter,
    duplicateMonthWarning,
    negativeBalanceWarning,
    warnings,
  };
}

/**
 * VACATION & ANNUAL LEAVE ACCRUAL CALCULATOR (Sections 5, 6, 7)
 * Supports user-defined accrual start dates (Post-Vacation Return-to-Work Reset Rule),
 * keeps carryover, current period earned, taken, and manual adjustments strictly separate,
 * and computes full internal precision + display rounded values.
 */
export function calculateAnnualLeaveAccrual(params: {
  accrualPeriod?: VacationAccrualPeriod;
  asOfDate?: string;
  leaveRecords?: LeaveRecord[];
  vacationPlans?: VacationPlanRecord[];
  // Flat call properties
  accrualStartDate?: string;
  targetCalculationDate?: string;
  annualEntitlementDays?: number;
  accrualMethod?: AccrualMethodType;
  dayBasis?: AccrualDayBasis;
  carriedForwardDays?: number;
  leaveTakenInPeriod?: number;
  manualAdjustmentDays?: number;
  joiningDate?: string;
  isPostVacationReset?: boolean;
}) {
  const ap = params.accrualPeriod;
  const entitlement = Math.max(
    0,
    Number(params.annualEntitlementDays ?? ap?.annualEntitlementDays) || 21,
  );

  const effectiveStartDate =
    params.accrualStartDate ||
    ((ap?.useReturnDateResetRule || ap?.isPostVacationReset) &&
    (ap?.newAccrualStartDate || ap?.accrualStartDate)
      ? ap.newAccrualStartDate || ap.accrualStartDate!
      : ap?.accrualStartDate || ap?.accrualYearStartDate || ap?.employmentStartDate || '2026-09-01');

  const asOfDate = params.targetCalculationDate || params.asOfDate || '2026-12-31';
  const dayBasis = params.dayBasis || ap?.yearDayBasis || ap?.dayBasis || '365_fixed';
  const accrualMethod = params.accrualMethod || ap?.accrualMethod || 'daily';

  const targetYear = Number((asOfDate || '2026-12-31').slice(0, 4)) || 2026;
  const daysInYearDivisor =
    dayBasis === '360_contractual'
      ? 360
      : dayBasis === 'leap_aware_365_366' && isLeapYear(targetYear)
        ? 366
        : 365;

  const eligibleAccrualDays = countInclusiveDays(effectiveStartDate, asOfDate);

  // Full internal precision
  const dailyAccrualRate = entitlement / daysInYearDivisor;
  const monthlyAccrualRate = entitlement / 12;

  let accruedCurrentPeriodExact = 0;
  if (accrualMethod === 'monthly') {
    const monthsElapsed = eligibleAccrualDays / (daysInYearDivisor / 12);
    accruedCurrentPeriodExact = monthsElapsed * monthlyAccrualRate;
  } else {
    accruedCurrentPeriodExact = eligibleAccrualDays * dailyAccrualRate;
  }

  // Also compute Leave Earned in current calendar year (Jan 1 of targetYear -> asOfDate)
  const calYearStart =
    effectiveStartDate > `${targetYear}-01-01` ? effectiveStartDate : `${targetYear}-01-01`;
  const calYearDays = countInclusiveDays(calYearStart, asOfDate);
  const leaveEarnedThisYearExact = calYearDays * dailyAccrualRate;

  const leaveRecords = params.leaveRecords || [];
  const vacationPlans = params.vacationPlans || [];

  const empAnnualLeaves = leaveRecords.filter(
    (r) =>
      (!ap?.employmentId || r.employmentId === ap.employmentId) &&
      r.leaveType === 'annual_leave' &&
      r.approvalStatus !== 'rejected',
  );

  const leaveTakenInCurrentPeriod =
    params.leaveTakenInPeriod !== undefined
      ? roundCurrency(Number(params.leaveTakenInPeriod) || 0)
      : roundCurrency(
          empAnnualLeaves
            .filter((r) => r.startDate >= effectiveStartDate && r.startDate <= asOfDate)
            .reduce((s, r) => s + (Number(r.totalDays) || 0), 0),
        );

  const openingBalance = roundCurrency(
    Number(
      params.carriedForwardDays ??
        ap?.openingCarryoverDays ??
        ap?.openingCarryForwardDays ??
        0,
    ) || 0,
  );
  const manualAdjustments = roundCurrency(
    Number(params.manualAdjustmentDays ?? ap?.manualAdjustmentDays ?? 0) || 0,
  );

  const accruedDisplay = roundCurrency(accruedCurrentPeriodExact);
  const estimatedAvailableExact =
    openingBalance + accruedCurrentPeriodExact + manualAdjustments - leaveTakenInCurrentPeriod;
  const estimatedAvailableDisplay = roundCurrency(estimatedAvailableExact);

  // Year-end projection (31 December of targetYear)
  const yearEndStr = `${targetYear}-12-31`;
  const daysToYearEnd = countInclusiveDays(effectiveStartDate, yearEndStr);
  const accruedByYearEndExact = daysToYearEnd * dailyAccrualRate;
  const estimatedYearEndBalance = roundCurrency(
    openingBalance + accruedByYearEndExact + manualAdjustments - leaveTakenInCurrentPeriod,
  );

  // Next 12 months earned
  const earnedInNext12Months = roundCurrency(entitlement);

  // Future approved & pending vacation plans
  const empPlans = vacationPlans.filter(
    (p) =>
      (!ap?.employmentId || p.employmentId === ap.employmentId) &&
      p.vacationType === 'annual_leave' &&
      (p.status || p.approvalStatus) !== 'cancelled' &&
      (p.status || p.approvalStatus) !== 'completed',
  );

  const approvedFutureLeaveDays = roundCurrency(
    empPlans
      .filter((p) => {
        const st = p.status || p.approvalStatus;
        return st === 'approved' || st === 'started';
      })
      .reduce((s, p) => s + (Number(p.plannedVacationDays) || 0), 0),
  );
  const pendingLeaveRequestDays = roundCurrency(
    empPlans
      .filter((p) => {
        const st = p.status || p.approvalStatus;
        return st === 'planned' || st === 'draft';
      })
      .reduce((s, p) => s + (Number(p.plannedVacationDays) || 0), 0),
  );

  const [sy, sm, sd] = effectiveStartDate.split('-').map(Number);
  const nextAnnivYear = sy < targetYear ? targetYear + 1 : sy + 1;
  const nextAccrualAnniversary = `${nextAnnivYear}-${String(sm || 1).padStart(2, '0')}-${String(sd || 1).padStart(2, '0')}`;

  const originalJoiningDate =
    params.joiningDate || ap?.employmentStartDate || '2022-03-01';
  const isResetActive = Boolean(
    params.isPostVacationReset ?? ap?.useReturnDateResetRule ?? ap?.isPostVacationReset,
  );

  const resetRuleLegalWarning =
    isResetActive && effectiveStartDate !== originalJoiningDate
      ? `Custom Post-Vacation Accrual Reset Active (${effectiveStartDate}): Under Saudi Labor Law Article 109, statutory service tenure is anchored to your original joining date (${originalJoiningDate}). Ensure this post-vacation accrual reset aligns with your company's HR policy and Qiwa contract without erasing prior unused leave.`
      : null;

  const formulaStr = `${eligibleAccrualDays} days × (${entitlement} ÷ ${daysInYearDivisor}) = ${accruedDisplay.toFixed(2)} days`;

  return {
    asOfDate,
    targetCalculationDate: asOfDate,
    effectiveStartDate,
    accrualStartDate: effectiveStartDate,
    daysInYearDivisor,
    divisorDays: daysInYearDivisor,
    eligibleAccrualDays,
    daysElapsed: eligibleAccrualDays,
    annualEntitlementDays: entitlement,
    dailyAccrualRateExact: dailyAccrualRate,
    dailyAccrualRateDisplay: Math.round((dailyAccrualRate + Number.EPSILON) * 1000000) / 1000000,
    dailyAccrualRate: Math.round((dailyAccrualRate + Number.EPSILON) * 1000000) / 1000000,
    // 5 Required Separated Figures (Section 5):
    openingCarryoverDays: openingBalance,
    carriedForwardDays: openingBalance,
    accruedCurrentPeriodExact,
    accruedCurrentPeriodDisplay: accruedDisplay,
    accruedInCurrentPeriod: accruedDisplay,
    leaveTakenDays: leaveTakenInCurrentPeriod,
    leaveTakenInPeriod: leaveTakenInCurrentPeriod,
    manualAdjustmentDays: manualAdjustments,
    estimatedAvailableLeaveExact: estimatedAvailableExact,
    estimatedAvailableLeaveDisplay: estimatedAvailableDisplay,
    totalEstimatedAvailableDays: estimatedAvailableDisplay,
    // Dashboard extras (Section 7):
    leaveEarnedThisYearDisplay: roundCurrency(leaveEarnedThisYearExact),
    approvedFutureLeaveDays,
    pendingLeaveRequestDays,
    remainingAfterApprovedFuture: roundCurrency(
      estimatedAvailableExact - approvedFutureLeaveDays,
    ),
    estimatedYearEndBalance,
    earnedInNext12Months,
    nextAccrualAnniversary,
    resetRuleLegalWarning,
    resetRuleWarning: resetRuleLegalWarning,
    formula: formulaStr,
    formulaDisclosure: `${eligibleAccrualDays} eligible days × (${entitlement} days ÷ ${daysInYearDivisor}) = ${accruedCurrentPeriodExact.toFixed(4)} accrued days (displayed as ${accruedDisplay.toFixed(2)}d). Available = Opening (${openingBalance.toFixed(2)}d) + Accrued (${accruedDisplay.toFixed(2)}d) + Adjustments (${manualAdjustments.toFixed(2)}d) − Taken (${leaveTakenInCurrentPeriod.toFixed(2)}d) = ${estimatedAvailableDisplay.toFixed(2)} days.`,
  };
}

/**
 * Generates Year-by-Year Vacation Balance Table from the user's saved employment & leave records (Section 7).
 */
export function generateYearByYearVacationTable(params: {
  joiningDate: string;
  asOfDate: string;
  annualEntitlementDays: number;
  entitlementHistory?: { effectiveFrom: string; annualEntitlementDays: number }[];
  leaveRecords?: LeaveRecord[];
  leaves?: LeaveRecord[];
  accrualPeriods?: VacationAccrualPeriod[];
  manualAdjustmentDays?: number;
  viewMode: VacationYearViewMode;
  dayBasis?: AccrualDayBasis;
  customPeriodStartDate?: string;
}): YearByYearVacationRow[] {
  const leaveList = params.leaveRecords || params.leaves || [];
  const startYear = Math.max(2018, Number((params.joiningDate || '2022-01-01').slice(0, 4)));
  const currentYear = Math.max(startYear, Number((params.asOfDate || '2026-12-31').slice(0, 4)));
  const endYear = currentYear + 1;

  const rows: YearByYearVacationRow[] = [];

  let runningBalance = 0;
  const [, jm, jd] = (params.joiningDate || '2022-03-01').split('-');
  const activePeriod = (params.accrualPeriods || [])[0];
  const customRef =
    params.customPeriodStartDate ||
    activePeriod?.accrualStartDate ||
    activePeriod?.newAccrualStartDate ||
    params.joiningDate ||
    '2026-09-01';
  const [, cm, cd] = customRef.split('-');

  for (let y = startYear; y <= endYear; y++) {
    let periodStart = `${y}-01-01`;
    let periodEnd = `${y}-12-31`;

    if (params.viewMode === 'anniversary_year') {
      periodStart = `${y}-${jm}-${jd}`;
      periodEnd = `${y + 1}-${jm}-${jd}`;
    } else if (params.viewMode === 'custom_accrual_period') {
      periodStart = `${y}-${cm}-${cd}`;
      periodEnd = `${y + 1}-${cm}-${cd}`;
    }

    const effectiveStart =
      periodStart < params.joiningDate ? params.joiningDate : periodStart;
    const effectiveEnd =
      y === currentYear && params.asOfDate > effectiveStart && params.asOfDate < periodEnd
        ? params.asOfDate
        : periodEnd;

    let yearEntitlement = params.annualEntitlementDays || 21;
    if (params.entitlementHistory && params.entitlementHistory.length > 0) {
      const match = [...params.entitlementHistory]
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
        .reverse()
        .find((h) => h.effectiveFrom <= periodEnd);
      if (match) yearEntitlement = match.annualEntitlementDays;
    }

    const daysInPeriod =
      effectiveEnd >= effectiveStart ? countInclusiveDays(effectiveStart, effectiveEnd) : 0;
    const divisor =
      params.dayBasis === '360_contractual'
        ? 360
        : params.dayBasis === 'leap_aware_365_366' && isLeapYear(y)
          ? 366
          : 365;
    const earned = roundCurrency(Math.min(yearEntitlement, (daysInPeriod * yearEntitlement) / divisor));

    const taken = roundCurrency(
      leaveList
        .filter(
          (r) =>
            r.leaveType === 'annual_leave' &&
            r.approvalStatus !== 'rejected' &&
            r.startDate >= periodStart &&
            r.startDate <= periodEnd,
        )
        .reduce((s, r) => s + (Number(r.totalDays) || 0), 0),
    );

    const adjustments =
      y === currentYear
        ? roundCurrency(
            Number(params.manualAdjustmentDays ?? activePeriod?.manualAdjustmentDays ?? 0) || 0,
          )
        : 0;
    const openingBalance = roundCurrency(runningBalance);
    const closingBalance = roundCurrency(openingBalance + earned + adjustments - taken);
    runningBalance = closingBalance;

    const label =
      params.viewMode === 'calendar_year' ? String(y) : `${y}/${String(y + 1).slice(2)}`;

    rows.push({
      leaveYear: label,
      leaveYearLabel: label,
      periodStart: effectiveStart,
      periodEnd: effectiveEnd,
      annualEntitlement: yearEntitlement,
      openingBalance,
      earned,
      taken,
      adjustments,
      closingBalance,
    });
  }

  return rows;
}

/**
 * VACATION MONEY / VACATION PAY CALCULATOR (Section 8)
 * Kept strictly separate from monthly salary, loan deductions, EOSB, final settlement, and tickets.
 */
export function calculateVacationPay(params: {
  basicSalary: number;
  housingAllowance: number;
  otherEligibleAllowances: number;
  leavePayBasis: VacationPayBasisType;
  payableVacationDays: number;
  dailyDivisorMethod?: VacationPayDivisorMethod | string;
  divisorMethod?: VacationPayDivisorMethod | string;
  expectedDepartureDate?: string;
  referenceMonth?: string;
  actualVacationPayReceived?: number;
}) {
  const basic = Math.max(0, Number(params.basicSalary) || 0);
  const housing = Math.max(0, Number(params.housingAllowance) || 0);
  const other = Math.max(0, Number(params.otherEligibleAllowances) || 0);

  let monthlyWageBasis = basic + housing + other;
  let includedComponentsDescription =
    'Basic Salary + Housing Allowance + Other Fixed Eligible Allowances (Actual Wage under Saudi Labor Law Art. 109)';

  if (params.leavePayBasis === 'basic_only') {
    monthlyWageBasis = basic;
    includedComponentsDescription = 'Basic Salary Only (Employer-specific contractual calculation)';
  } else if (params.leavePayBasis === 'basic_plus_housing') {
    monthlyWageBasis = basic + housing;
    includedComponentsDescription = 'Basic Salary + Housing Allowance';
  }

  const divMethod = params.dailyDivisorMethod || params.divisorMethod || '30_days';
  let divisor = 30;
  if (divMethod === '26_working_days') {
    divisor = 26;
  } else if (divMethod === 'daily_contract_365') {
    divisor = 365 / 12;
  } else if (
    (divMethod === 'actual_month_days' || divMethod === 'actual_days_in_month') &&
    (params.expectedDepartureDate || params.referenceMonth)
  ) {
    const ref = params.expectedDepartureDate || params.referenceMonth || '2026-08';
    const [y, m] = ref.split('-').map(Number);
    if (y && m) {
      divisor = new Date(Date.UTC(y, m, 0)).getUTCDate();
    }
  }

  const dailySalaryBasis = roundCurrency(monthlyWageBasis / divisor);
  const days = Math.max(0, Number(params.payableVacationDays) || 0);
  const estimatedVacationPay = roundCurrency((monthlyWageBasis / divisor) * days);
  const hasActual = params.actualVacationPayReceived !== undefined;
  const actualReceived = roundCurrency(Number(params.actualVacationPayReceived) || 0);
  const differenceAmount = hasActual ? roundCurrency(actualReceived - estimatedVacationPay) : 0;
  const formulaStr = `(SAR ${monthlyWageBasis.toFixed(2)} ÷ ${roundCurrency(divisor)} days) × ${days} vacation days = SAR ${estimatedVacationPay.toFixed(2)}`;

  const legalCitation = 'Saudi Labor Law Articles 109 & 111 (HRSD — Last Verified: 2026-03)';
  const assumptions = [
    `Wage Basis: ${includedComponentsDescription}`,
    `Daily Rate Formula: SAR ${monthlyWageBasis.toFixed(2)} ÷ ${roundCurrency(divisor)} days = SAR ${dailySalaryBasis.toFixed(2)} / day`,
    'Kept strictly separate from regular monthly salary, loan deductions, EOSB, and travel ticket budgets.',
  ];

  return {
    monthlyWageBasis: roundCurrency(monthlyWageBasis),
    eligibleMonthlyBase: roundCurrency(monthlyWageBasis),
    divisor: roundCurrency(divisor),
    dailySalaryBasis,
    dailyLeaveSalaryRate: dailySalaryBasis,
    payableVacationDays: days,
    estimatedVacationPay,
    estimatedGrossVacationPay: estimatedVacationPay,
    actualVacationPayReceived: actualReceived,
    differenceAmount,
    varianceAmount: differenceAmount,
    includedComponentsDescription,
    formula: formulaStr,
    legalSource: legalCitation,
    legalCitation,
    assumptions,
  };
}

export interface VacationOverlapResult extends Array<string> {
  hasOverlap: boolean;
  overlappingLabels: string[];
}

/**
 * Detects overlapping date ranges across existing leave records and planned vacations (Section 10).
 * Returns an array of overlap messages that also carries `.hasOverlap` and `.overlappingLabels`.
 */
export function detectVacationOverlap(params: {
  startDate: string;
  endDate: string;
  leaveRecords?: LeaveRecord[];
  existingLeaves?: LeaveRecord[];
  vacationPlans?: VacationPlanRecord[];
  existingPlans?: VacationPlanRecord[];
  excludeId?: string;
}): VacationOverlapResult {
  const { startDate, endDate, excludeId } = params;
  const leaveList = params.leaveRecords || params.existingLeaves || [];
  const planList = params.vacationPlans || params.existingPlans || [];
  const overlaps: string[] = [];

  if (startDate && endDate && endDate >= startDate) {
    for (const lv of leaveList) {
      if (lv.id === excludeId || lv.approvalStatus === 'rejected') continue;
      if (startDate <= lv.endDate && endDate >= lv.startDate) {
        overlaps.push(
          `recorded ${lv.leaveType.replace(/_/g, ' ')} (${lv.startDate} to ${lv.endDate})`,
        );
      }
    }

    for (const pl of planList) {
      const status = pl.status || pl.approvalStatus;
      if (pl.id === excludeId || status === 'cancelled') continue;
      if (startDate <= pl.plannedReturnDate && endDate >= pl.plannedDepartureDate) {
        overlaps.push(
          `vacation plan "${pl.title || pl.planName || 'Plan'}" (${pl.plannedDepartureDate} to ${pl.plannedReturnDate})`,
        );
      }
    }
  }

  const result = Object.assign([...overlaps], {
    hasOverlap: overlaps.length > 0,
    overlappingLabels: overlaps,
  });
  return result;
}

export interface OvertimeComparisonInput {
  basicSalary: number;
  foodAllowance?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  otherAllowances?: number;
  dailyWorkingHours?: number; // default 8
  monthlyDaysDivisor?: number; // default 30 -> 240 hrs
  monthlyHoursDivisorOverride?: number; // custom divisor (e.g. 240, 208, 192)

  // Overtime Hours
  regularOtHours: number;
  restDayOtHours?: number;
  holidayOtHours?: number;

  // Company Payslip Method Config
  companyFormulaType: 'basic_1_5' | 'total_1_5' | 'basic_custom' | 'fixed_hourly';
  companyMultiplier?: number; // default 1.5
  companyFixedHourlyRate?: number; // SAR/hr
  companyDivisorOverride?: number; // custom company divisor (default 240)

  // Deductions
  deductions?: OvertimeDeductionItem[];
}

export interface OvertimeComparisonResult {
  totalMonthlySalary: number;
  effectiveDivisor: number;
  totalOtHours: number;
  regularOtHours: number;
  restDayOtHours: number;
  holidayOtHours: number;

  // Method A: Saudi Labor Law (Art. 107)
  laborLawHourlyBasic: number;
  laborLawHourlyActual: number;
  laborLawOtRate: number;
  laborLawRegularOtPay: number;
  laborLawRestDayOtPay: number;
  laborLawHolidayOtPay: number;
  laborLawGrossOt: number;
  laborLawNetOt: number;
  laborLawFinalSalary: number;

  // Method B: Company Payslip Method
  companyDivisor: number;
  companyOtRate: number;
  companyRegularOtPay: number;
  companyRestDayOtPay: number;
  companyHolidayOtPay: number;
  companyGrossOt: number;
  companyNetOt: number;
  companyFinalSalary: number;

  // Deductions
  totalOtDeductions: number;
  totalSalaryDeductions: number;
  totalAllDeductions: number;

  // Variances & Comparison
  hourlyRateDiff: number; // laborLawOtRate - companyOtRate
  varianceGross: number; // laborLawGrossOt - companyGrossOt (positive = underpaid by company)
  varianceNet: number; // laborLawNetOt - companyNetOt
  variancePercentage: number;
  hasDiscrepancy: boolean;
  isUnderpaid: boolean;
  formulaExplanationLaborLaw: string;
  formulaExplanationCompany: string;
}

/**
 * Calculates dual-method overtime comparison between statutory Saudi Labor Law (Art. 107)
 * and employer company payslip practices, handling deductions and variance analysis.
 */
export function calculateOvertimeSalaryComparison(
  input: OvertimeComparisonInput,
): OvertimeComparisonResult {
  const basic = Math.max(0, Number(input.basicSalary) || 0);
  const food = Math.max(0, Number(input.foodAllowance) || 0);
  const housing = Math.max(0, Number(input.housingAllowance) || 0);
  const transport = Math.max(0, Number(input.transportAllowance) || 0);
  const other = Math.max(0, Number(input.otherAllowances) || 0);
  const totalMonthlySalary = roundCurrency(basic + food + housing + transport + other);

  const dailyHours = Math.max(1, Number(input.dailyWorkingHours) || 8);
  const daysDivisor = Math.max(1, Number(input.monthlyDaysDivisor) || 30);
  const effectiveDivisor = Math.max(
    1,
    Number(input.monthlyHoursDivisorOverride) || dailyHours * daysDivisor,
  );

  const regularOt = Math.max(0, Number(input.regularOtHours) || 0);
  const restDayOt = Math.max(0, Number(input.restDayOtHours) || 0);
  const holidayOt = Math.max(0, Number(input.holidayOtHours) || 0);
  const totalOtHours = roundCurrency(regularOt + restDayOt + holidayOt);

  // Method A: Labor Law Article 107
  // Basic Hourly Wage = Basic Salary / Divisor
  // Actual Hourly Wage = (Basic + Fixed Allowances) / Divisor
  // Statutory Overtime Rate = Actual Hourly Wage + 50% of Basic Hourly Wage
  const laborLawHourlyBasic = basic / effectiveDivisor;
  const laborLawHourlyActual = totalMonthlySalary / effectiveDivisor;
  const laborLawOtRate = laborLawHourlyActual + 0.5 * laborLawHourlyBasic;

  const laborLawRegularOtPay = roundCurrency(regularOt * laborLawOtRate);
  const laborLawRestDayOtPay = roundCurrency(restDayOt * laborLawOtRate);
  const laborLawHolidayOtPay = roundCurrency(holidayOt * laborLawOtRate);
  const laborLawGrossOt = roundCurrency(totalOtHours * laborLawOtRate);

  // Method B: Company Payslip Method
  const companyDivisor = Math.max(
    1,
    Number(input.companyDivisorOverride) || effectiveDivisor,
  );
  let companyOtRate = 0;
  let formulaExplanationCompany = '';

  const companyMultiplier = Number(input.companyMultiplier) || 1.5;
  switch (input.companyFormulaType) {
    case 'basic_1_5': {
      companyOtRate = (basic / companyDivisor) * 1.5;
      formulaExplanationCompany = `(Basic Salary SAR ${basic.toFixed(2)} ÷ ${companyDivisor} hrs) × 1.5 = SAR ${companyOtRate.toFixed(4)}/hr`;
      break;
    }
    case 'total_1_5': {
      companyOtRate = (totalMonthlySalary / companyDivisor) * 1.5;
      formulaExplanationCompany = `(Total Salary SAR ${totalMonthlySalary.toFixed(2)} ÷ ${companyDivisor} hrs) × 1.5 = SAR ${companyOtRate.toFixed(4)}/hr`;
      break;
    }
    case 'basic_custom': {
      companyOtRate = (basic / companyDivisor) * companyMultiplier;
      formulaExplanationCompany = `(Basic Salary SAR ${basic.toFixed(2)} ÷ ${companyDivisor} hrs) × ${companyMultiplier}x = SAR ${companyOtRate.toFixed(4)}/hr`;
      break;
    }
    case 'fixed_hourly': {
      companyOtRate = Math.max(0, Number(input.companyFixedHourlyRate) || 0);
      formulaExplanationCompany = `Fixed Company Rate: SAR ${companyOtRate.toFixed(2)}/hr`;
      break;
    }
    default: {
      companyOtRate = (basic / companyDivisor) * 1.5;
      formulaExplanationCompany = `(Basic SAR ${basic.toFixed(2)} ÷ ${companyDivisor}) × 1.5 = SAR ${companyOtRate.toFixed(4)}/hr`;
    }
  }

  const companyRegularOtPay = roundCurrency(regularOt * companyOtRate);
  const companyRestDayOtPay = roundCurrency(restDayOt * companyOtRate);
  const companyHolidayOtPay = roundCurrency(holidayOt * companyOtRate);
  const companyGrossOt = roundCurrency(totalOtHours * companyOtRate);

  // Deductions
  const deductionsList = input.deductions || [];
  let totalOtDeductions = 0;
  let totalSalaryDeductions = 0;

  for (const d of deductionsList) {
    const amt = Math.max(0, Number(d.amount) || 0);
    if (d.appliesTo === 'overtime_only') {
      totalOtDeductions += amt;
    } else {
      totalSalaryDeductions += amt;
    }
  }

  totalOtDeductions = roundCurrency(totalOtDeductions);
  totalSalaryDeductions = roundCurrency(totalSalaryDeductions);
  const totalAllDeductions = roundCurrency(totalOtDeductions + totalSalaryDeductions);

  const laborLawNetOt = roundCurrency(Math.max(0, laborLawGrossOt - totalOtDeductions));
  const companyNetOt = roundCurrency(Math.max(0, companyGrossOt - totalOtDeductions));

  const laborLawFinalSalary = roundCurrency(
    Math.max(0, totalMonthlySalary + laborLawGrossOt - totalAllDeductions),
  );
  const companyFinalSalary = roundCurrency(
    Math.max(0, totalMonthlySalary + companyGrossOt - totalAllDeductions),
  );

  // Variance & Discrepancies
  const hourlyRateDiff = roundCurrency(laborLawOtRate - companyOtRate);
  const varianceGross = roundCurrency(laborLawGrossOt - companyGrossOt);
  const varianceNet = roundCurrency(laborLawNetOt - companyNetOt);
  const variancePercentage =
    laborLawGrossOt > 0 ? roundCurrency((varianceGross / laborLawGrossOt) * 100) : 0;
  const hasDiscrepancy = Math.abs(varianceGross) > 0.05;
  const isUnderpaid = varianceGross > 0.05;

  const formulaExplanationLaborLaw = `Actual Hourly (SAR ${laborLawHourlyActual.toFixed(4)}) + 50% Basic Hourly (SAR ${(0.5 * laborLawHourlyBasic).toFixed(4)}) = SAR ${laborLawOtRate.toFixed(4)}/hr (Labor Law Art. 107)`;

  return {
    totalMonthlySalary,
    effectiveDivisor,
    totalOtHours,
    regularOtHours: regularOt,
    restDayOtHours: restDayOt,
    holidayOtHours: holidayOt,
    laborLawHourlyBasic: roundCurrency(laborLawHourlyBasic),
    laborLawHourlyActual: roundCurrency(laborLawHourlyActual),
    laborLawOtRate: roundCurrency(laborLawOtRate),
    laborLawRegularOtPay,
    laborLawRestDayOtPay,
    laborLawHolidayOtPay,
    laborLawGrossOt,
    laborLawNetOt,
    laborLawFinalSalary,
    companyDivisor,
    companyOtRate: roundCurrency(companyOtRate),
    companyRegularOtPay,
    companyRestDayOtPay,
    companyHolidayOtPay,
    companyGrossOt,
    companyNetOt,
    companyFinalSalary,
    totalOtDeductions,
    totalSalaryDeductions,
    totalAllDeductions,
    hourlyRateDiff,
    varianceGross,
    varianceNet,
    variancePercentage,
    hasDiscrepancy,
    isUnderpaid,
    formulaExplanationLaborLaw,
    formulaExplanationCompany,
  };
}



