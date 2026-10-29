import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AuthenticatedUser,
  PersonalProfile,
  EmploymentPeriod,
  SalaryVersion,
  DailyAttendanceRecord,
  OvertimeLedgerEntry,
  LeaveRecord,
  VacationPlanRecord,
  VacationAccrualPeriod,
  VacationPayCalculationRecord,
  EmployeeLoanRecord,
  LoanRepaymentRecord,
  PayslipRecord,
  PersonalDocument,
  PersonalReminder,
  FinanceTransaction,
  SavedOvertimeCalculationRecord,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';

export interface StoredAccount extends AuthenticatedUser {
  passwordHash?: string;
  passwordSalt?: string;
  googleId?: string;
  googleEmail?: string;
  googlePhotoUrl?: string;
  resetToken?: string;
  resetTokenExpires?: number;
}

export interface ServerDatabaseState {
  accounts: StoredAccount[];
  profiles: PersonalProfile[];
  employments: EmploymentPeriod[];
  salaryVersions: SalaryVersion[];
  attendance: DailyAttendanceRecord[];
  overtimeLedger: OvertimeLedgerEntry[];
  leaves: LeaveRecord[];
  vacationPlans: VacationPlanRecord[];
  vacationAccrualPeriods: VacationAccrualPeriod[];
  vacationPayCalculations: VacationPayCalculationRecord[];
  loans: EmployeeLoanRecord[];
  loanRepayments: LoanRepaymentRecord[];
  payslips: PayslipRecord[];
  documents: PersonalDocument[];
  reminders: PersonalReminder[];
  finance: FinanceTransaction[];
  overtimeCalculations: SavedOvertimeCalculationRecord[];
}

export type CollectionName =
  | 'employments'
  | 'salaryVersions'
  | 'attendance'
  | 'overtimeLedger'
  | 'leaves'
  | 'vacationPlans'
  | 'vacationAccrualPeriods'
  | 'vacationPayCalculations'
  | 'loans'
  | 'loanRepayments'
  | 'payslips'
  | 'documents'
  | 'reminders'
  | 'finance'
  | 'overtimeCalculations';

const SESSION_SECRET = process.env.SESSION_SECRET || 'saudi-salary-pro-v2-local-dev-secret-key-2026';

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

export function createSessionToken(user: AuthenticatedUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): { id: string; email: string; fullName: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (signature !== expectedSig) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.id || !decoded.exp || decoded.exp < Date.now()) return null;
    return { id: decoded.id, email: decoded.email, fullName: decoded.fullName };
  } catch {
    return null;
  }
}

export function createSeedDatabaseState(): ServerDatabaseState {
  const now = new Date().toISOString();
  const user1Pass = hashPassword('SaudiPro#2026', 'seed_salt_user_1');
  const user2Pass = hashPassword('SaudiPro#2026', 'seed_salt_user_2');

  const accounts: StoredAccount[] = [
    {
      id: 'usr-rahim-01',
      email: 'rahim.khan@example.sa',
      fullName: 'Md. Rahim Ullah Khan',
      preferredLanguage: 'en',
      createdAt: '2022-03-01T08:00:00.000Z',
      passwordHash: user1Pass.hash,
      passwordSalt: user1Pass.salt,
    },
    {
      id: 'usr-carlo-02',
      email: 'carlo.reyes@example.sa',
      fullName: 'Carlo Dalisay Reyes',
      preferredLanguage: 'en',
      createdAt: '2023-06-15T08:00:00.000Z',
      passwordHash: user2Pass.hash,
      passwordSalt: user2Pass.salt,
    },
  ];

  const profiles: PersonalProfile[] = [
    {
      userId: 'usr-rahim-01',
      fullName: 'Md. Rahim Ullah Khan',
      displayName: 'Rahim Khan',
      nationality: 'Bangladeshi',
      dateOfBirth: '1989-05-14',
      phone: '+966 55 019 4821',
      email: 'rahim.khan@example.sa',
      iqamaNumber: '2489 •••• 7312',
      iqamaExpiryDate: '2026-08-14',
      passportNumber: 'B049 •••• 88',
      passportExpiryDate: '2028-11-20',
      currentCity: 'Riyadh — King Abdullah Financial District',
      emergencyContactName: 'Farhana Begum (Spouse)',
      emergencyContactPhone: '+880 1711 004912',
      preferredLanguage: 'en',
      preferredCurrency: 'SAR',
      dateFormat: 'YYYY-MM-DD',
      monthlyBudgetTarget: 2200,
      monthlySavingsGoal: 1500,
      lastBackupAt: '2026-03-28T18:00:00.000Z',
      updatedAt: now,
    },
    {
      userId: 'usr-carlo-02',
      fullName: 'Carlo Dalisay Reyes',
      displayName: 'Carlo Reyes',
      nationality: 'Filipino',
      dateOfBirth: '1991-09-22',
      phone: '+966 50 882 1930',
      email: 'carlo.reyes@example.sa',
      iqamaNumber: '2517 •••• 9904',
      iqamaExpiryDate: '2026-06-30',
      passportNumber: 'P812 •••• 41A',
      passportExpiryDate: '2029-04-10',
      currentCity: 'Jeddah — North Obhur Project',
      emergencyContactName: 'Maria Clara Reyes',
      emergencyContactPhone: '+63 917 550 8821',
      preferredLanguage: 'en',
      preferredCurrency: 'SAR',
      dateFormat: 'YYYY-MM-DD',
      monthlyBudgetTarget: 2800,
      monthlySavingsGoal: 2000,
      updatedAt: now,
    },
  ];

  const employments: EmploymentPeriod[] = [
    {
      id: 'emp-rahim-prev',
      userId: 'usr-rahim-01',
      employerName: 'Al-Baha Industrial Contracting Est.',
      jobTitle: 'Electrical Foreman',
      department: 'Industrial Maintenance',
      employeeNumber: 'ABIC-1104',
      workLocation: 'Dammam Second Industrial City',
      joiningDate: '2020-02-01',
      lastWorkingDate: '2022-02-28',
      isCurrent: false,
      contractType: 'fixed_term',
      contractStartDate: '2020-02-01',
      contractEndDate: '2022-02-28',
      probationDays: 90,
      noticePeriodDays: 60,
      weeklyRestDays: ['Friday'],
      expectedDailyHours: 8,
      expectedWeeklyHours: 48,
      annualLeaveEntitlementDays: 21,
      entitlementHistory: [
        { effectiveFrom: '2020-02-01', annualEntitlementDays: 21, policyNote: 'Standard 21 days' },
      ],
      insuranceProvider: 'Tawuniya',
      notes: 'Completed 2-year fixed contract and transferred via Qiwa (EOSB settled: SAR 4,950).',
      createdAt: '2020-02-01T08:00:00.000Z',
      updatedAt: '2022-02-28T08:00:00.000Z',
    },
    {
      id: 'emp-rahim-curr',
      userId: 'usr-rahim-01',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      jobTitle: 'Senior MEP Site Supervisor',
      department: 'Facilities & Electromechanical',
      employeeNumber: 'ARC-40918',
      workLocation: 'Riyadh — KAFD Parcel 4.02',
      joiningDate: '2022-03-01',
      isCurrent: true,
      contractType: 'fixed_term',
      contractStartDate: '2024-03-01',
      contractEndDate: '2026-06-30',
      probationDays: 90,
      noticePeriodDays: 60,
      weeklyRestDays: ['Friday'],
      expectedDailyHours: 8,
      expectedWeeklyHours: 48,
      annualLeaveEntitlementDays: 21,
      entitlementHistory: [
        { effectiveFrom: '2022-03-01', annualEntitlementDays: 21, policyNote: 'Joining 21 days/yr' },
      ],
      insuranceProvider: 'Bupa Arabia Silver',
      insuranceExpiryDate: '2026-05-09',
      notes: 'Current employer under Qiwa authenticated contract #QW-992817.',
      createdAt: '2022-03-01T08:00:00.000Z',
      updatedAt: now,
    },
    {
      id: 'emp-carlo-curr',
      userId: 'usr-carlo-02',
      employerName: 'Red Sea Coastal Infrastructure LLC',
      jobTitle: 'QA/QC Civil Inspector',
      department: 'Quality Assurance',
      employeeNumber: 'RSCI-8821',
      workLocation: 'Jeddah Regional Office',
      joiningDate: '2023-06-15',
      isCurrent: true,
      contractType: 'fixed_term',
      contractStartDate: '2023-06-15',
      contractEndDate: '2026-06-14',
      probationDays: 90,
      noticePeriodDays: 60,
      weeklyRestDays: ['Friday'],
      expectedDailyHours: 8,
      expectedWeeklyHours: 48,
      annualLeaveEntitlementDays: 21,
      insuranceProvider: 'Medgulf',
      insuranceExpiryDate: '2026-09-15',
      notes: 'Current Qiwa contract.',
      createdAt: '2023-06-15T08:00:00.000Z',
      updatedAt: now,
    },
  ];

  const salaryVersions: SalaryVersion[] = [
    {
      id: 'sal-rahim-v1',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-prev',
      effectiveFrom: '2020-02-01',
      effectiveTo: '2022-02-28',
      basicSalary: 2800,
      housingAllowance: 700,
      foodAllowance: 250,
      transportAllowance: 300,
      otherFixedAllowances: 100,
      variableAllowances: 0,
      payFrequency: 'monthly',
      reasonForChange: 'Initial Joining Offer (Dammam)',
      contractualNotes: 'Standard 6-day week technician package.',
      createdAt: '2020-02-01T08:00:00.000Z',
    },
    {
      id: 'sal-rahim-v2',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      effectiveFrom: '2022-03-01',
      effectiveTo: '2024-02-29',
      basicSalary: 3800,
      housingAllowance: 950,
      foodAllowance: 300,
      transportAllowance: 400,
      otherFixedAllowances: 150,
      variableAllowances: 0,
      payFrequency: 'monthly',
      reasonForChange: 'Joining Offer at ARMEC Riyadh',
      contractualNotes: 'Qiwa transfer package.',
      createdAt: '2022-03-01T08:00:00.000Z',
    },
    {
      id: 'sal-rahim-v3',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      effectiveFrom: '2024-03-01',
      basicSalary: 4600,
      housingAllowance: 1150,
      foodAllowance: 350,
      transportAllowance: 500,
      otherFixedAllowances: 400,
      variableAllowances: 0,
      payFrequency: 'monthly',
      reasonForChange: 'Promotion to Senior MEP Site Supervisor',
      contractualNotes: 'Includes SAR 250 site responsibility + SAR 150 mobile allowance.',
      createdAt: '2024-03-01T08:00:00.000Z',
    },
    {
      id: 'sal-carlo-v1',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      effectiveFrom: '2023-06-15',
      basicSalary: 5400,
      housingAllowance: 1350,
      foodAllowance: 400,
      transportAllowance: 550,
      otherFixedAllowances: 300,
      variableAllowances: 0,
      payFrequency: 'monthly',
      reasonForChange: 'Initial QA/QC Inspector Contract',
      createdAt: '2023-06-15T08:00:00.000Z',
    },
  ];

  const attendance: DailyAttendanceRecord[] = [
    {
      id: 'att-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-01',
      status: 'present',
      shiftType: 'day',
      scheduledStart: '07:00',
      scheduledEnd: '16:00',
      clockIn: '07:00',
      clockOut: '18:30',
      breakMinutes: 60,
      elapsedHours: 11.5,
      netWorkingHours: 10.5,
      regularScheduledHours: 8,
      userRecordedOvertimeHours: 2.5,
      estimatedPayableOvertimeHours: 2.5,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
      isIncomplete: false,
      workLocation: 'KAFD Parcel 4.02',
      notes: 'Chiller commissioning testing after regular shift.',
      changeHistory: [{ timestamp: now, summary: 'Logged day shift + 2.5h OT' }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'att-rahim-02',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-02',
      status: 'present',
      shiftType: 'day',
      scheduledStart: '07:00',
      scheduledEnd: '16:00',
      clockIn: '07:00',
      clockOut: '16:00',
      breakMinutes: 60,
      elapsedHours: 9,
      netWorkingHours: 8,
      regularScheduledHours: 8,
      userRecordedOvertimeHours: 0,
      estimatedPayableOvertimeHours: 0,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
      isIncomplete: false,
      workLocation: 'KAFD Parcel 4.02',
      changeHistory: [{ timestamp: now, summary: 'Regular 8h shift' }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'att-rahim-03',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-03',
      status: 'present',
      shiftType: 'night',
      scheduledStart: '21:00',
      scheduledEnd: '06:00',
      clockIn: '21:00',
      clockOut: '08:00',
      breakMinutes: 60,
      elapsedHours: 11,
      netWorkingHours: 10,
      regularScheduledHours: 8,
      userRecordedOvertimeHours: 2,
      estimatedPayableOvertimeHours: 2,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
      isIncomplete: false,
      workLocation: 'KAFD Substation B',
      notes: 'Overnight power shutdown switchover crossing midnight.',
      changeHistory: [{ timestamp: now, summary: 'Night shift + 2h OT' }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'att-rahim-04',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-06',
      status: 'present',
      shiftType: 'day',
      scheduledStart: '08:00',
      scheduledEnd: '14:30',
      clockIn: '08:00',
      clockOut: '14:30',
      breakMinutes: 30,
      elapsedHours: 6.5,
      netWorkingHours: 6,
      regularScheduledHours: 0,
      userRecordedOvertimeHours: 6,
      estimatedPayableOvertimeHours: 6,
      isWeeklyRestDay: true,
      isPublicHoliday: false,
      isIncomplete: false,
      workLocation: 'KAFD Parcel 4.02',
      notes: 'Friday weekly rest day emergency pump inspection.',
      changeHistory: [{ timestamp: now, summary: 'Friday rest-day callout 6h OT' }],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'att-carlo-01',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      date: '2026-03-01',
      status: 'present',
      shiftType: 'day',
      scheduledStart: '07:30',
      scheduledEnd: '16:30',
      clockIn: '07:30',
      clockOut: '18:30',
      breakMinutes: 60,
      elapsedHours: 11,
      netWorkingHours: 10,
      regularScheduledHours: 8,
      userRecordedOvertimeHours: 2,
      estimatedPayableOvertimeHours: 2,
      isWeeklyRestDay: false,
      isPublicHoliday: false,
      isIncomplete: false,
      workLocation: 'Jeddah North Obhur Site',
      notes: 'Concrete pour inspection.',
      changeHistory: [{ timestamp: now, summary: 'Logged 2h OT' }],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const overtimeLedger: OvertimeLedgerEntry[] = [
    {
      id: 'ot-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-01',
      hours: 2,
      minutes: 30,
      decimalHours: 2.5,
      overtimeType: 'regular_day',
      approvalStatus: 'approved',
      estimatedAmount: 96.88,
      notes: 'Chiller commissioning approved by Project Manager.',
      linkedAttendanceId: 'att-rahim-01',
      createdAt: now,
    },
    {
      id: 'ot-rahim-02',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-03',
      hours: 2,
      minutes: 0,
      decimalHours: 2.0,
      overtimeType: 'regular_day',
      approvalStatus: 'approved',
      estimatedAmount: 77.5,
      notes: 'Night shift switchover.',
      linkedAttendanceId: 'att-rahim-03',
      createdAt: now,
    },
    {
      id: 'ot-rahim-03',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      date: '2026-03-06',
      hours: 6,
      minutes: 0,
      decimalHours: 6.0,
      overtimeType: 'weekly_rest',
      approvalStatus: 'pending',
      estimatedAmount: 232.5,
      notes: 'Friday emergency callout awaiting HR timesheet sign-off.',
      linkedAttendanceId: 'att-rahim-04',
      createdAt: now,
    },
    {
      id: 'ot-carlo-01',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      date: '2026-03-01',
      hours: 2,
      minutes: 0,
      decimalHours: 2.0,
      overtimeType: 'regular_day',
      approvalStatus: 'approved',
      estimatedAmount: 89.17,
      notes: 'Concrete slab pour OT.',
      linkedAttendanceId: 'att-carlo-01',
      createdAt: now,
    },
  ];

  const leaves: LeaveRecord[] = [
    {
      id: 'lv-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      contractRef: 'QW-992817',
      startDate: '2025-11-10',
      endDate: '2025-11-24',
      actualReturnToWorkDate: '2025-11-25',
      returnConfirmed: true,
      calendarDaysAway: 15,
      durationType: 'full_day',
      totalDays: 15,
      paidDays: 15,
      unpaidDays: 0,
      leaveType: 'annual_leave',
      isPaid: true,
      approvalStatus: 'approved',
      vacationPayReceived: 3500,
      ticketAllowanceReceived: 1800,
      reason: 'Annual family vacation to Dhaka.',
      createdAt: '2025-11-01T10:00:00.000Z',
    },
    {
      id: 'lv-rahim-02',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      contractRef: 'QW-992817',
      startDate: '2026-01-18',
      endDate: '2026-01-20',
      actualReturnToWorkDate: '2026-01-21',
      returnConfirmed: true,
      calendarDaysAway: 3,
      durationType: 'full_day',
      totalDays: 3,
      paidDays: 3,
      unpaidDays: 0,
      leaveType: 'sick_leave',
      isPaid: true,
      approvalStatus: 'approved',
      reason: 'Sehhaty medical certificate #SH-88210.',
      createdAt: '2026-01-18T10:00:00.000Z',
    },
  ];

  const vacationPlans: VacationPlanRecord[] = [
    {
      id: 'vp-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      contractRef: 'QW-992817',
      planName: 'Winter Family Visit to Dhaka 2026',
      plannedDepartureDate: '2026-12-10',
      plannedReturnDate: '2026-12-30',
      plannedVacationDays: 21,
      vacationType: 'annual_leave',
      expectedVacationPay: 4900,
      travelTicketBudget: 2100,
      status: 'planned',
      notes: 'Planning 21-day annual leave after completing peak autumn project handover.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'vp-carlo-01',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      employerName: 'Red Sea Coastal Infrastructure LLC',
      contractRef: 'RSCI-8821',
      planName: 'Manila Summer Vacation',
      plannedDepartureDate: '2026-08-01',
      plannedReturnDate: '2026-08-21',
      plannedVacationDays: 21,
      vacationType: 'annual_leave',
      expectedVacationPay: 5600,
      travelTicketBudget: 2400,
      status: 'approved',
      notes: 'Approved by QA/QC Manager.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const vacationAccrualPeriods: VacationAccrualPeriod[] = [
    {
      id: 'vap-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      periodLabel: '2026 Post-Vacation Accrual Period (Reset 1 Sep 2026)',
      employmentStartDate: '2022-03-01',
      contractStartDate: '2024-03-01',
      annualEntitlementDays: 21,
      accrualMethod: 'daily',
      yearDayBasis: '365_fixed',
      accrualYearStartDate: '2026-01-01',
      lastVacationReturnDate: '2026-09-01',
      newAccrualStartDate: '2026-09-01',
      useReturnDateResetRule: true,
      openingCarryoverDays: 6.5,
      manualAdjustmentDays: 0,
      manualAdjustmentReason: 'Verified carryover from prior cycle',
      employerPolicyNotes: 'Company calculates new annual leave cycle from return-to-work date while preserving unused prior balance.',
      effectiveDateOfEntitlementChange: '2022-03-01',
      isCurrentPeriod: true,
      editAuditLog: [
        {
          timestamp: now,
          summary: 'Configured 21 days/yr with post-vacation reset start date 2026-09-01 and 6.5d carryover.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'vap-carlo-01',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      employerName: 'Red Sea Coastal Infrastructure LLC',
      periodLabel: '2026 Standard Anniversary Accrual Period',
      employmentStartDate: '2023-06-15',
      contractStartDate: '2023-06-15',
      annualEntitlementDays: 21,
      accrualMethod: 'daily',
      yearDayBasis: '365_fixed',
      accrualYearStartDate: '2026-01-01',
      newAccrualStartDate: '2026-01-01',
      useReturnDateResetRule: false,
      openingCarryoverDays: 12,
      manualAdjustmentDays: 0,
      isCurrentPeriod: true,
      editAuditLog: [{ timestamp: now, summary: 'Initialized standard 21 days/yr accrual.' }],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const vacationPayCalculations: VacationPayCalculationRecord[] = [
    {
      id: 'vpc-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      calculationTitle: '2026 Annual Vacation Pay Estimate (21 Days)',
      basicSalary: 4600,
      housingAllowance: 1150,
      otherEligibleAllowances: 1250,
      leavePayBasis: 'actual_wage',
      payableVacationDays: 21,
      dailyDivisorMethod: '30_days',
      expectedDepartureDate: '2026-12-10',
      expectedPaymentDate: '2026-12-05',
      dailySalaryBasis: 233.33,
      estimatedVacationPay: 4900,
      actualVacationPayReceived: 4900,
      varianceAmount: 0,
      notes: 'Full actual wage basis under Saudi Labor Law Art. 109.',
      createdAt: now,
    },
  ];

  const loans: EmployeeLoanRecord[] = [
    {
      id: 'loan-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      loanCode: 'LN-2025-104',
      loanName: 'Company Housing & Furniture Advance',
      loanType: 'company_loan',
      issueDate: '2025-11-01',
      originalAmount: 6000,
      currency: 'SAR',
      monthlyDeductionAmount: 1000,
      firstDeductionMonth: '2025-12',
      expectedFinalDeductionMonth: '2026-05',
      status: 'active',
      supportingDocumentName: 'ARMEC_Loan_Agreement_104.pdf',
      notes: 'Interest-free 6-month company loan deducted at SAR 1,000/month.',
      createdAt: '2025-11-01T08:00:00.000Z',
      updatedAt: now,
    },
    {
      id: 'loan-rahim-02',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      loanCode: 'LN-2026-019',
      loanName: 'Emergency Medical Salary Advance',
      loanType: 'salary_advance',
      issueDate: '2026-02-10',
      originalAmount: 1500,
      currency: 'SAR',
      monthlyDeductionAmount: 500,
      firstDeductionMonth: '2026-02',
      expectedFinalDeductionMonth: '2026-04',
      status: 'active',
      notes: '3-month salary advance.',
      createdAt: '2026-02-10T08:00:00.000Z',
      updatedAt: now,
    },
    {
      id: 'loan-carlo-01',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      loanCode: 'LN-RSCI-08',
      loanName: 'Car Purchase Company Loan',
      loanType: 'company_loan',
      issueDate: '2026-01-15',
      originalAmount: 9000,
      currency: 'SAR',
      monthlyDeductionAmount: 1500,
      firstDeductionMonth: '2026-02',
      expectedFinalDeductionMonth: '2026-07',
      status: 'active',
      notes: '6-month installment loan.',
      createdAt: '2026-01-15T08:00:00.000Z',
      updatedAt: now,
    },
  ];

  const loanRepayments: LoanRepaymentRecord[] = [
    {
      id: 'rep-rahim-01',
      userId: 'usr-rahim-01',
      loanId: 'loan-rahim-01',
      deductionDate: '2025-12-28',
      salaryMonth: '2025-12',
      scheduledDeduction: 1000,
      actualDeduction: 1000,
      amountAppliedToPrincipal: 1000,
      remainingBalanceAfter: 5000,
      payslipReference: 'DEC-2025-SLIP',
      notes: 'Installment 1 of 6 deducted on December payroll.',
      createdAt: '2025-12-28T10:00:00.000Z',
    },
    {
      id: 'rep-rahim-02',
      userId: 'usr-rahim-01',
      loanId: 'loan-rahim-01',
      deductionDate: '2026-01-28',
      salaryMonth: '2026-01',
      scheduledDeduction: 1000,
      actualDeduction: 1000,
      amountAppliedToPrincipal: 1000,
      remainingBalanceAfter: 4000,
      payslipReference: 'pay-rahim-2026-01',
      notes: 'Installment 2 of 6 deducted on January payroll.',
      createdAt: '2026-01-28T10:00:00.000Z',
    },
    {
      id: 'rep-rahim-03',
      userId: 'usr-rahim-01',
      loanId: 'loan-rahim-01',
      deductionDate: '2026-02-28',
      salaryMonth: '2026-02',
      scheduledDeduction: 1000,
      actualDeduction: 1000,
      amountAppliedToPrincipal: 1000,
      remainingBalanceAfter: 3000,
      payslipReference: 'pay-rahim-2026-02',
      notes: 'Installment 3 of 6 deducted on February payroll.',
      createdAt: '2026-02-28T10:00:00.000Z',
    },
    {
      id: 'rep-rahim-04',
      userId: 'usr-rahim-01',
      loanId: 'loan-rahim-02',
      deductionDate: '2026-02-28',
      salaryMonth: '2026-02',
      scheduledDeduction: 500,
      actualDeduction: 500,
      amountAppliedToPrincipal: 500,
      remainingBalanceAfter: 1000,
      payslipReference: 'pay-rahim-2026-02',
      notes: 'Advance installment 1 of 3.',
      createdAt: '2026-02-28T10:00:00.000Z',
    },
    {
      id: 'rep-carlo-01',
      userId: 'usr-carlo-02',
      loanId: 'loan-carlo-01',
      deductionDate: '2026-02-28',
      salaryMonth: '2026-02',
      scheduledDeduction: 1500,
      actualDeduction: 1500,
      amountAppliedToPrincipal: 1500,
      remainingBalanceAfter: 7500,
      notes: 'First installment.',
      createdAt: '2026-02-28T10:00:00.000Z',
    },
  ];

  const payslips: PayslipRecord[] = [
    {
      id: 'pay-rahim-2026-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      payPeriod: '2026-01',
      paymentDate: '2026-02-02',
      basicSalary: 4600,
      housingAllowance: 1150,
      foodAllowance: 350,
      transportAllowance: 500,
      otherAllowances: 400,
      overtimeHours: 14,
      overtimeAmount: 542.5,
      bonus: 0,
      grossEarnings: 7542.5,
      itemizedDeductions: [{ label: 'Loan LN-2025-104 Installment', amount: 1000 }],
      loanDeductionAmount: 1000,
      totalDeductions: 1000,
      netSalary: 6542.5,
      bankCreditAmount: 6542.5,
      bankCreditDate: '2026-02-02',
      extractionSource: 'manual',
      notes: 'Full salary + 14h overtime minus SAR 1,000 loan installment credited via Al Rajhi Mudad WPS.',
      createdAt: '2026-02-02T12:00:00.000Z',
    },
    {
      id: 'pay-rahim-2026-02',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      payPeriod: '2026-02',
      paymentDate: '2026-03-03',
      basicSalary: 4600,
      housingAllowance: 1150,
      foodAllowance: 350,
      transportAllowance: 500,
      otherAllowances: 400,
      overtimeHours: 12,
      overtimeAmount: 465.0,
      bonus: 0,
      grossEarnings: 7465.0,
      itemizedDeductions: [
        { label: 'Safety Boots Replacement Deduction', amount: 150, reason: 'PPE deduction' },
        { label: 'Loan & Advance Deductions', amount: 1500, reason: 'LN-2025-104 + LN-2026-019' },
      ],
      loanDeductionAmount: 1500,
      totalDeductions: 1650,
      netSalary: 5815.0,
      bankCreditAmount: 5650.0,
      bankCreditDate: '2026-03-03',
      extractionSource: 'manual',
      notes: 'Bank credit short by SAR 165.00 compared to payslip net.',
      createdAt: '2026-03-03T12:00:00.000Z',
    },
    {
      id: 'pay-rahim-2026-03',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      employerName: 'Al-Riyadh Modern Engineering Co. (ARMEC)',
      payPeriod: '2026-03',
      paymentDate: '2026-04-02',
      basicSalary: 4600,
      housingAllowance: 1150,
      foodAllowance: 350,
      transportAllowance: 500,
      otherAllowances: 400,
      overtimeHours: 4.5,
      overtimeAmount: 174.38,
      bonus: 0,
      grossEarnings: 7174.38,
      itemizedDeductions: [],
      loanDeductionAmount: 0,
      totalDeductions: 0,
      netSalary: 7174.38,
      bankCreditAmount: 7000.0,
      bankCreditDate: '2026-04-02',
      extractionSource: 'ai_ocr_verified',
      notes: 'Friday 6h OT from Mar 6 omitted from slip; bank transfer credited base SAR 7,000 only.',
      createdAt: '2026-04-02T12:00:00.000Z',
    },
    {
      id: 'pay-carlo-2026-03',
      userId: 'usr-carlo-02',
      employmentId: 'emp-carlo-curr',
      employerName: 'Red Sea Coastal Infrastructure LLC',
      payPeriod: '2026-03',
      paymentDate: '2026-04-01',
      basicSalary: 5400,
      housingAllowance: 1350,
      foodAllowance: 400,
      transportAllowance: 550,
      otherAllowances: 300,
      overtimeHours: 2,
      overtimeAmount: 89.17,
      bonus: 0,
      grossEarnings: 8089.17,
      itemizedDeductions: [],
      totalDeductions: 0,
      netSalary: 8089.17,
      bankCreditAmount: 8089.17,
      bankCreditDate: '2026-04-01',
      extractionSource: 'manual',
      notes: 'Paid in full via SNB WPS.',
      createdAt: '2026-04-01T12:00:00.000Z',
    },
  ];

  const documents: PersonalDocument[] = [
    {
      id: 'doc-rahim-01',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      category: 'employment_contract',
      title: 'Qiwa Authenticated Employment Contract (ARMEC)',
      issueDate: '2024-03-01',
      expiryDate: '2026-06-30',
      tags: ['Qiwa', 'Contract', 'Riyadh'],
      fileName: 'Qiwa_Contract_ARMEC_2024.pdf',
      fileSize: 248120,
      mimeType: 'application/pdf',
      notes: 'Includes SAR 4,600 basic salary promotion addendum.',
      createdAt: '2024-03-02T10:00:00.000Z',
      updatedAt: '2024-03-02T10:00:00.000Z',
    },
    {
      id: 'doc-rahim-02',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      category: 'iqama_passport',
      title: 'Saudi Iqama Digital Copy (Absher)',
      issueDate: '2025-08-14',
      expiryDate: '2026-08-14',
      tags: ['Iqama', 'Absher', 'Identity'],
      fileName: 'Iqama_Absher_2026.pdf',
      fileSize: 184200,
      mimeType: 'application/pdf',
      notes: 'Sponsor ID: 7001928310.',
      createdAt: '2025-08-15T10:00:00.000Z',
      updatedAt: '2025-08-15T10:00:00.000Z',
    },
    {
      id: 'doc-rahim-03',
      userId: 'usr-rahim-01',
      employmentId: 'emp-rahim-curr',
      category: 'insurance_card',
      title: 'CHI Cooperative Health Insurance Card (Bupa Silver)',
      issueDate: '2025-05-10',
      expiryDate: '2026-05-09',
      tags: ['Medical', 'Insurance', 'Bupa'],
      fileName: 'Bupa_Health_Card_2026.pdf',
      fileSize: 142000,
      mimeType: 'application/pdf',
      notes: 'Renewal required 30 days before expiry.',
      createdAt: '2025-05-10T10:00:00.000Z',
      updatedAt: '2025-05-10T10:00:00.000Z',
    },
  ];

  const reminders: PersonalReminder[] = [
    {
      id: 'rem-rahim-01',
      userId: 'usr-rahim-01',
      category: 'insurance_expiry',
      title: 'Medical Insurance Policy Renewal (Bupa Silver)',
      targetDate: '2026-05-09',
      leadNoticeDays: 30,
      completed: false,
      notes: 'Remind HR to renew CHI health insurance before May 9.',
      createdAt: now,
    },
    {
      id: 'rem-rahim-02',
      userId: 'usr-rahim-01',
      category: 'contract_expiry',
      title: 'Qiwa Contract Renewal Notice Window (60 Days)',
      targetDate: '2026-06-30',
      leadNoticeDays: 60,
      completed: false,
      notes: 'Article 75/76 notice period is 60 days prior to contract end.',
      createdAt: now,
    },
    {
      id: 'rem-rahim-03',
      userId: 'usr-rahim-01',
      category: 'iqama_expiry',
      title: 'Iqama Expiry Renewal',
      targetDate: '2026-08-14',
      leadNoticeDays: 45,
      completed: false,
      notes: 'Verify Muqeem renewal status with PRO.',
      createdAt: now,
    },
    {
      id: 'rem-rahim-04',
      userId: 'usr-rahim-01',
      category: 'planned_leave',
      title: 'Upcoming Planned Vacation Departure (Dhaka)',
      targetDate: '2026-12-10',
      leadNoticeDays: 30,
      completed: false,
      notes: 'Confirm exit/re-entry visa and vacation pay disbursement 14 days before departure.',
      createdAt: now,
    },
  ];

  const finance: FinanceTransaction[] = [
    {
      id: 'fin-rahim-01',
      userId: 'usr-rahim-01',
      date: '2026-03-03',
      monthYear: '2026-03',
      category: 'salary_income',
      flowType: 'income',
      amount: 7150,
      description: 'February salary credited via Al Rajhi WPS',
      createdAt: now,
    },
    {
      id: 'fin-rahim-02',
      userId: 'usr-rahim-01',
      date: '2026-03-05',
      monthYear: '2026-03',
      category: 'family_remittance',
      flowType: 'remittance',
      amount: 3500,
      description: 'Family Remittance to Dhaka via Tahweel Al Rajhi (111,475 BDT)',
      createdAt: now,
    },
    {
      id: 'fin-rahim-03',
      userId: 'usr-rahim-01',
      date: '2026-03-10',
      monthYear: '2026-03',
      category: 'living_expenses',
      flowType: 'expense',
      amount: 850,
      description: 'Monthly groceries, mess & household supplies in Riyadh',
      createdAt: now,
    },
    {
      id: 'fin-rahim-04',
      userId: 'usr-rahim-01',
      date: '2026-03-15',
      monthYear: '2026-03',
      category: 'savings_deposit',
      flowType: 'savings',
      amount: 1500,
      description: 'Personal emergency savings reserve transfer',
      createdAt: now,
    },
  ];

  return {
    accounts,
    profiles,
    employments,
    salaryVersions,
    attendance,
    overtimeLedger,
    leaves,
    vacationPlans,
    vacationAccrualPeriods,
    vacationPayCalculations,
    loans,
    loanRepayments,
    payslips,
    documents,
    reminders,
    finance,
    overtimeCalculations: [],
  };
}

export class UserIsolatedDataStore {
  private state: ServerDatabaseState;
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
    if (persistPath && fs.existsSync(persistPath)) {
      try {
        const raw = fs.readFileSync(persistPath, 'utf8');
        const loaded = JSON.parse(raw) as Partial<ServerDatabaseState>;
        const seed = createSeedDatabaseState();
        this.state = {
          accounts: loaded.accounts || seed.accounts,
          profiles: loaded.profiles || seed.profiles,
          employments: loaded.employments || seed.employments,
          salaryVersions: loaded.salaryVersions || seed.salaryVersions,
          attendance: loaded.attendance || seed.attendance,
          overtimeLedger: loaded.overtimeLedger || seed.overtimeLedger,
          leaves: loaded.leaves || seed.leaves,
          vacationPlans: loaded.vacationPlans || seed.vacationPlans,
          vacationAccrualPeriods: loaded.vacationAccrualPeriods || seed.vacationAccrualPeriods,
          vacationPayCalculations: loaded.vacationPayCalculations || seed.vacationPayCalculations,
          loans: loaded.loans || seed.loans,
          loanRepayments: loaded.loanRepayments || seed.loanRepayments,
          payslips: loaded.payslips || seed.payslips,
          documents: loaded.documents || seed.documents,
          reminders: loaded.reminders || seed.reminders,
          finance: loaded.finance || seed.finance,
          overtimeCalculations: loaded.overtimeCalculations || seed.overtimeCalculations || [],
        };
        return;
      } catch {
        // Fallback to seed state
      }
    }
    this.state = createSeedDatabaseState();
    this.saveToDisk();
  }

  private saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.persistPath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Ignore disk write errors in restricted environments
    }
  }

  public registerUser(params: {
    email: string;
    password: string;
    fullName: string;
    nationality?: string;
    jobTitle?: string;
    preferredLanguage?: AuthenticatedUser['preferredLanguage'];
  }): { user: AuthenticatedUser; token: string } {
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('A valid email address is required.');
    }
    if (!params.password || params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (this.state.accounts.some((a) => a.email.toLowerCase() === cleanEmail)) {
      throw new Error('An account with this email already exists.');
    }

    const now = new Date().toISOString();
    const userId = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const { hash, salt } = hashPassword(params.password);
    const lang = params.preferredLanguage || 'en';

    const newAccount: StoredAccount = {
      id: userId,
      email: cleanEmail,
      fullName: params.fullName.trim(),
      preferredLanguage: lang,
      createdAt: now,
      passwordHash: hash,
      passwordSalt: salt,
    };

    const newProfile: PersonalProfile = {
      userId,
      fullName: params.fullName.trim(),
      displayName: params.fullName.trim().split(' ')[0] || params.fullName.trim(),
      nationality: params.nationality || 'Expatriate',
      email: cleanEmail,
      currentCity: 'Riyadh, Saudi Arabia',
      preferredLanguage: lang,
      preferredCurrency: 'SAR',
      dateFormat: 'YYYY-MM-DD',
      monthlyBudgetTarget: 2500,
      monthlySavingsGoal: 1500,
      updatedAt: now,
    };

    this.state.accounts.push(newAccount);
    this.state.profiles.push(newProfile);
    this.saveToDisk();

    const { passwordHash: _ph, passwordSalt: _ps, ...publicUser } = newAccount;
    return {
      user: publicUser,
      token: createSessionToken(publicUser),
    };
  }

  public loginUser(email: string, password: string): { user: AuthenticatedUser; token: string } {
    const cleanEmail = email.trim().toLowerCase();
    const account = this.state.accounts.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!account) {
      throw new Error('Invalid email or password.');
    }
    if (!account.passwordHash || !account.passwordSalt) {
      throw new Error(
        'This account was created with Google. Please click "Continue with Google" or set a password using Reset Password.',
      );
    }
    if (!verifyPassword(password, account.passwordHash, account.passwordSalt)) {
      throw new Error('Invalid email or password.');
    }
    const { passwordHash: _ph, passwordSalt: _ps, ...publicUser } = account;
    return {
      user: publicUser,
      token: createSessionToken(publicUser),
    };
  }

  public loginOrRegisterGoogleUser(params: {
    email: string;
    fullName: string;
    photoUrl?: string;
    googleId?: string;
    preferredLanguage?: AuthenticatedUser['preferredLanguage'];
  }): { user: AuthenticatedUser; token: string } {
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('A valid email address is required from Google account.');
    }
    const now = new Date().toISOString();

    // Check if user already exists with this email or googleId
    let account = this.state.accounts.find(
      (a) =>
        (params.googleId && a.googleId === params.googleId) ||
        a.email.toLowerCase() === cleanEmail,
    );

    if (account) {
      // Link Google ID if not already linked
      if (params.googleId && !account.googleId) {
        account.googleId = params.googleId;
      }
      account.googleEmail = cleanEmail;
      if (params.photoUrl) {
        account.googlePhotoUrl = params.photoUrl;
      }
      // Update profile
      const prof = this.state.profiles.find((p) => p.userId === account.id);
      if (prof) {
        prof.googleConnected = true;
        prof.googleEmail = cleanEmail;
        if (params.photoUrl) prof.googlePhotoUrl = params.photoUrl;
        prof.updatedAt = now;
      }
      this.saveToDisk();
      const { passwordHash: _ph, passwordSalt: _ps, ...publicUser } = account;
      return {
        user: publicUser,
        token: createSessionToken(publicUser),
      };
    }

    // New Google user registration
    const userId = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const lang = params.preferredLanguage || 'en';
    const cleanName = params.fullName?.trim() || cleanEmail.split('@')[0] || 'Employee User';

    const newAccount: StoredAccount = {
      id: userId,
      email: cleanEmail,
      fullName: cleanName,
      preferredLanguage: lang,
      createdAt: now,
      googleId: params.googleId,
      googleEmail: cleanEmail,
      googlePhotoUrl: params.photoUrl,
    };

    const newProfile: PersonalProfile = {
      userId,
      fullName: cleanName,
      displayName: cleanName.split(' ')[0] || cleanName,
      nationality: 'Expatriate',
      email: cleanEmail,
      currentCity: 'Riyadh, Saudi Arabia',
      preferredLanguage: lang,
      preferredCurrency: 'SAR',
      dateFormat: 'YYYY-MM-DD',
      monthlyBudgetTarget: 2500,
      monthlySavingsGoal: 1500,
      googleConnected: true,
      googleEmail: cleanEmail,
      googlePhotoUrl: params.photoUrl,
      hasPassword: false,
      updatedAt: now,
    };

    // Create a starter active employment period so the user can immediately calculate salary/loans/vacations
    const initialEmployment: EmploymentPeriod = {
      id: `emp-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      employerName: 'Kingdom Industrial Group Ltd.',
      jobTitle: 'Professional Specialist',
      department: 'Operations',
      workLocation: 'Riyadh, Saudi Arabia',
      joiningDate: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
      isCurrent: true,
      contractType: 'fixed_term',
      contractStartDate: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
      contractEndDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
      probationDays: 90,
      noticePeriodDays: 60,
      weeklyRestDays: ['Friday'],
      expectedDailyHours: 8,
      expectedWeeklyHours: 48,
      annualLeaveEntitlementDays: 21,
      createdAt: now,
      updatedAt: now,
    };

    const initialSalary: SalaryVersion = {
      id: `sal-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      employmentId: initialEmployment.id,
      effectiveFrom: initialEmployment.joiningDate,
      basicSalary: 5000,
      housingAllowance: 1250,
      transportAllowance: 500,
      foodAllowance: 400,
      otherFixedAllowances: 250,
      variableAllowances: 0,
      payFrequency: 'monthly',
      reasonForChange: 'Initial employment contract package',
      contractualNotes: 'Registered and authenticated contract structure.',
      createdAt: now,
    };

    this.state.accounts.push(newAccount);
    this.state.profiles.push(newProfile);
    this.state.employments.push(initialEmployment);
    this.state.salaryVersions.push(initialSalary);
    this.saveToDisk();

    const { passwordHash: _ph, passwordSalt: _ps, ...publicUser } = newAccount;
    return {
      user: publicUser,
      token: createSessionToken(publicUser),
    };
  }

  public requestPasswordReset(email: string): { resetToken: string; email: string } {
    const cleanEmail = email.trim().toLowerCase();
    const account = this.state.accounts.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!account) {
      throw new Error('No account found with this email address.');
    }
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    account.resetToken = token;
    account.resetTokenExpires = Date.now() + 3600 * 1000;
    this.saveToDisk();
    return { resetToken: token, email: cleanEmail };
  }

  public resetPasswordWithToken(
    email: string,
    token: string,
    newPassword: string,
  ): { user: AuthenticatedUser; sessionToken: string } {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim().toUpperCase();
    const account = this.state.accounts.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!account) {
      throw new Error('No account found with this email address.');
    }
    if (!account.resetToken || account.resetToken.toUpperCase() !== cleanToken) {
      throw new Error('Invalid or unrecognized reset code.');
    }
    if (!account.resetTokenExpires || account.resetTokenExpires < Date.now()) {
      throw new Error('Reset code has expired. Please request a new one.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const { hash, salt } = hashPassword(newPassword);
    account.passwordHash = hash;
    account.passwordSalt = salt;
    delete account.resetToken;
    delete account.resetTokenExpires;

    const prof = this.state.profiles.find((p) => p.userId === account.id);
    if (prof) {
      prof.hasPassword = true;
      prof.updatedAt = new Date().toISOString();
    }

    this.saveToDisk();
    const { passwordHash: _ph, passwordSalt: _ps, ...publicUser } = account;
    return {
      user: publicUser,
      sessionToken: createSessionToken(publicUser),
    };
  }

  public setPasswordForUser(userId: string, newPassword: string): void {
    const account = this.state.accounts.find((a) => a.id === userId);
    if (!account) {
      throw new Error('Account not found.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const { hash, salt } = hashPassword(newPassword);
    account.passwordHash = hash;
    account.passwordSalt = salt;

    const prof = this.state.profiles.find((p) => p.userId === userId);
    if (prof) {
      prof.hasPassword = true;
      prof.updatedAt = new Date().toISOString();
    }
    this.saveToDisk();
  }

  public linkGoogleAccountToUser(
    userId: string,
    params: { email: string; googleId?: string; photoUrl?: string },
  ): void {
    const account = this.state.accounts.find((a) => a.id === userId);
    if (!account) {
      throw new Error('Account not found.');
    }
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('A valid Google email address is required.');
    }

    // Check if another user account already claimed this Google ID
    if (params.googleId) {
      const conflict = this.state.accounts.find(
        (a) => a.id !== userId && a.googleId === params.googleId,
      );
      if (conflict) {
        throw new Error(
          `This Google account (${cleanEmail}) is already linked to another user account.`,
        );
      }
    }

    account.googleId = params.googleId || account.googleId || cleanEmail;
    account.googleEmail = cleanEmail;
    if (params.photoUrl) {
      account.googlePhotoUrl = params.photoUrl;
    }

    const prof = this.state.profiles.find((p) => p.userId === userId);
    if (prof) {
      prof.googleConnected = true;
      prof.googleEmail = cleanEmail;
      if (params.photoUrl) {
        prof.googlePhotoUrl = params.photoUrl;
      }
      prof.updatedAt = new Date().toISOString();
    }
    this.saveToDisk();
  }

  public unlinkGoogleAccount(userId: string): void {
    const account = this.state.accounts.find((a) => a.id === userId);
    if (!account) {
      throw new Error('Account not found.');
    }
    if (!account.passwordHash || !account.passwordSalt) {
      throw new Error(
        'Cannot disconnect Google account without setting a password first. Please create a password in Account Settings.',
      );
    }
    delete account.googleId;
    delete account.googleEmail;
    delete account.googlePhotoUrl;

    const prof = this.state.profiles.find((p) => p.userId === userId);
    if (prof) {
      prof.googleConnected = false;
      delete prof.googleEmail;
      delete prof.googlePhotoUrl;
      prof.updatedAt = new Date().toISOString();
    }
    this.saveToDisk();
  }

  public getUserSlice(authenticatedUserId: string): UserPrivateDatabaseSlice {
    const account = this.state.accounts.find((a) => a.id === authenticatedUserId);
    if (!account) {
      throw new Error('Unauthorized: Account not found.');
    }
    const { passwordHash: _ph, passwordSalt: _ps, ...publicUser } = account;

    let profile = this.state.profiles.find((p) => p.userId === authenticatedUserId);
    if (!profile) {
      profile = {
        userId: authenticatedUserId,
        fullName: account.fullName,
        displayName: account.fullName,
        nationality: 'Expatriate',
        email: account.email,
        preferredLanguage: account.preferredLanguage,
        preferredCurrency: 'SAR',
        dateFormat: 'YYYY-MM-DD',
        monthlyBudgetTarget: 2500,
        monthlySavingsGoal: 1500,
        googleConnected: Boolean(account.googleId),
        googleEmail: account.googleEmail,
        googlePhotoUrl: account.googlePhotoUrl,
        hasPassword: Boolean(account.passwordHash && account.passwordSalt),
        updatedAt: new Date().toISOString(),
      };
      this.state.profiles.push(profile);
    } else {
      profile.hasPassword = Boolean(account.passwordHash && account.passwordSalt);
      profile.googleConnected = Boolean(account.googleId || profile.googleConnected);
      if (account.googleEmail && !profile.googleEmail) profile.googleEmail = account.googleEmail;
      if (account.googlePhotoUrl && !profile.googlePhotoUrl) profile.googlePhotoUrl = account.googlePhotoUrl;
    }

    return {
      user: publicUser,
      profile,
      employments: this.state.employments.filter((r) => r.userId === authenticatedUserId),
      salaryVersions: this.state.salaryVersions.filter((r) => r.userId === authenticatedUserId),
      attendance: this.state.attendance.filter((r) => r.userId === authenticatedUserId),
      overtimeLedger: this.state.overtimeLedger.filter((r) => r.userId === authenticatedUserId),
      leaves: this.state.leaves.filter((r) => r.userId === authenticatedUserId),
      vacationPlans: this.state.vacationPlans.filter((r) => r.userId === authenticatedUserId),
      vacationAccrualPeriods: this.state.vacationAccrualPeriods.filter(
        (r) => r.userId === authenticatedUserId,
      ),
      vacationPayCalculations: this.state.vacationPayCalculations.filter(
        (r) => r.userId === authenticatedUserId,
      ),
      loans: this.state.loans.filter((r) => r.userId === authenticatedUserId),
      loanRepayments: this.state.loanRepayments.filter((r) => r.userId === authenticatedUserId),
      payslips: this.state.payslips.filter((r) => r.userId === authenticatedUserId),
      documents: this.state.documents.filter((r) => r.userId === authenticatedUserId),
      reminders: this.state.reminders.filter((r) => r.userId === authenticatedUserId),
      finance: this.state.finance.filter((r) => r.userId === authenticatedUserId),
      overtimeCalculations: (this.state.overtimeCalculations || []).filter(
        (r) => r.userId === authenticatedUserId,
      ),
    };
  }

  public updateProfile(authenticatedUserId: string, updates: Partial<PersonalProfile>): PersonalProfile {
    const idx = this.state.profiles.findIndex((p) => p.userId === authenticatedUserId);
    if (idx === -1) {
      throw new Error('Unauthorized: Profile not found for user.');
    }
    if (updates.fullName !== undefined && !String(updates.fullName).trim()) {
      throw new Error('Full Name is required to save your profile.');
    }
    const updated: PersonalProfile = {
      ...this.state.profiles[idx],
      ...updates,
      fullName:
        updates.fullName !== undefined
          ? String(updates.fullName).trim()
          : this.state.profiles[idx].fullName,
      userId: authenticatedUserId,
      updatedAt: new Date().toISOString(),
    };
    this.state.profiles[idx] = updated;

    const accIdx = this.state.accounts.findIndex((a) => a.id === authenticatedUserId);
    if (accIdx !== -1 && updated.fullName) {
      this.state.accounts[accIdx].fullName = updated.fullName;
    }
    if (accIdx !== -1 && updates.preferredLanguage) {
      this.state.accounts[accIdx].preferredLanguage = updates.preferredLanguage;
    }
    this.saveToDisk();
    return updated;
  }

  public getRecordById<T extends { id: string; userId: string }>(
    authenticatedUserId: string,
    collection: CollectionName,
    recordId: string,
  ): T {
    const list = this.state[collection] as unknown as T[];
    const found = list.find((r) => r.id === recordId);
    if (!found) {
      throw new Error('Record not found.');
    }
    if (found.userId !== authenticatedUserId) {
      throw new Error('Unauthorized: Cross-user access denied.');
    }
    return found;
  }

  private validateRecordPayload(
    collection: CollectionName,
    payload: Record<string, unknown>,
  ): void {
    if (payload.__simulateFailure === true) {
      throw new Error('Failed to save record. Database write rejected (simulated failure).');
    }
    switch (collection) {
      case 'attendance': {
        if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date))) {
          throw new Error('Please select a valid Work Date (YYYY-MM-DD) before saving.');
        }
        break;
      }
      case 'overtimeLedger': {
        if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date))) {
          throw new Error('Please select a valid Overtime Date (YYYY-MM-DD) before saving.');
        }
        if (typeof payload.decimalHours === 'number' && payload.decimalHours <= 0) {
          throw new Error('Overtime duration must be greater than zero.');
        }
        break;
      }
      case 'loans': {
        if (!String(payload.loanCode || '').trim() || !String(payload.loanName || '').trim()) {
          throw new Error('Please enter both Loan ID and Loan Name before saving.');
        }
        if (typeof payload.originalAmount !== 'number' || payload.originalAmount <= 0) {
          throw new Error('Loan amount must be greater than zero.');
        }
        if (typeof payload.monthlyDeductionAmount !== 'number' || payload.monthlyDeductionAmount < 0) {
          throw new Error('Scheduled monthly deduction cannot be negative.');
        }
        break;
      }
      case 'loanRepayments': {
        if (!String(payload.loanId || '').trim()) {
          throw new Error('Please select a valid loan before recording a repayment.');
        }
        if (!String(payload.salaryMonth || '').trim()) {
          throw new Error('Salary month is required for loan repayment.');
        }
        if (typeof payload.actualDeduction !== 'number' || payload.actualDeduction < 0) {
          throw new Error('Actual deduction amount must be a valid non-negative number.');
        }
        break;
      }
      case 'vacationPlans': {
        if (!String(payload.title || '').trim()) {
          throw new Error('Please enter a Vacation Plan title before saving.');
        }
        const dep = String(payload.plannedDepartureDate || '');
        const ret = String(payload.plannedReturnDate || '');
        if (!dep || !ret) {
          throw new Error('Please enter both planned departure and return dates.');
        }
        if (ret < dep) {
          throw new Error('Return date cannot be earlier than departure date.');
        }
        break;
      }
      case 'leaves': {
        const start = String(payload.startDate || '');
        const end = String(payload.endDate || '');
        if (!start || !end) {
          throw new Error('Please enter both leave start and end dates.');
        }
        if (end < start) {
          throw new Error('Return date cannot be earlier than departure date.');
        }
        if (typeof payload.totalDays === 'number' && payload.totalDays <= 0) {
          throw new Error('Total leave days must be greater than zero.');
        }
        break;
      }
      case 'employments': {
        if (!String(payload.employerName || '').trim()) {
          throw new Error('Please enter the Employer Name before saving.');
        }
        if (!String(payload.joiningDate || '').trim()) {
          throw new Error('Please enter the Joining Date before saving.');
        }
        break;
      }
      case 'salaryVersions': {
        if (!String(payload.effectiveFrom || '').trim()) {
          throw new Error('Please enter the Effective From date before saving.');
        }
        if (typeof payload.basicSalary !== 'number' || payload.basicSalary <= 0) {
          throw new Error('Basic salary must be greater than zero.');
        }
        break;
      }
      case 'payslips': {
        if (!String(payload.payPeriod || '').trim()) {
          throw new Error('Please select a Payroll Month before saving.');
        }
        break;
      }
      case 'documents': {
        if (!String(payload.title || '').trim()) {
          throw new Error('Please enter a Document Title before saving.');
        }
        break;
      }
      case 'finance': {
        if (!String(payload.date || '').trim()) {
          throw new Error('Please select a Transaction Date before saving.');
        }
        if (typeof payload.amount !== 'number' || payload.amount <= 0) {
          throw new Error('Transaction amount must be greater than zero.');
        }
        break;
      }
      case 'reminders': {
        if (!String(payload.title || '').trim()) {
          throw new Error('Please enter a Reminder Title before saving.');
        }
        if (!String(payload.targetDate || '').trim()) {
          throw new Error('Please select a Target Due Date before saving.');
        }
        break;
      }
      case 'overtimeCalculations': {
        if (!String(payload.title || '').trim()) {
          throw new Error('Please enter a Title for this overtime calculation before saving.');
        }
        if (typeof payload.totalOtHours === 'number' && payload.totalOtHours < 0) {
          throw new Error('Overtime hours cannot be negative.');
        }
        break;
      }
      default:
        break;
    }
  }

  public upsertRecord<
    T extends { id: string; userId: string } = Record<string, any> & { id: string; userId: string },
  >(
    authenticatedUserId: string,
    collection: CollectionName,
    record: Partial<T> & Record<string, unknown>,
  ): T {
    const account = this.state.accounts.find((a) => a.id === authenticatedUserId);
    if (!account) {
      throw new Error('Unauthorized: Account not found.');
    }

    const list = this.state[collection] as unknown as T[];
    const now = new Date().toISOString();
    const recordId =
      record.id && String(record.id).trim().length > 0
        ? String(record.id).trim()
        : `${collection.slice(0, 3)}-${crypto.randomUUID().slice(0, 8)}`;

    const existingIdx = list.findIndex((r) => r.id === recordId);
    if (existingIdx !== -1) {
      const existing = list[existingIdx] as unknown as Record<string, unknown>;
      if (existing.userId !== authenticatedUserId) {
        throw new Error('Unauthorized: Cannot modify a record belonging to another user.');
      }
      const merged = {
        ...existing,
        ...record,
        id: recordId,
        userId: authenticatedUserId,
        createdAt: existing.createdAt || (record as Record<string, unknown>).createdAt || now,
        updatedAt: now,
      };
      this.validateRecordPayload(collection, merged);
      const updated = merged as unknown as T;
      list[existingIdx] = updated;
      this.saveToDisk();
      return updated;
    }

    const createdPayload: Record<string, unknown> = {
      ...record,
      id: recordId,
      userId: authenticatedUserId,
      createdAt: (record as Record<string, unknown>).createdAt || now,
      updatedAt: now,
    };
    this.validateRecordPayload(collection, createdPayload);
    const created = createdPayload as unknown as T;
    list.push(created);
    this.saveToDisk();
    return created;
  }

  public deleteRecord(authenticatedUserId: string, collection: CollectionName, recordId: string): void {
    const list = this.state[collection] as unknown as Array<{ id: string; userId: string }>;
    const existingIdx = list.findIndex((r) => r.id === recordId);
    if (existingIdx === -1) {
      throw new Error('Record not found.');
    }
    if (list[existingIdx].userId !== authenticatedUserId) {
      throw new Error('Unauthorized: Cannot delete a record belonging to another user.');
    }
    list.splice(existingIdx, 1);
    this.saveToDisk();
  }

  public restoreUserBackup(authenticatedUserId: string, backupSlice: Partial<UserPrivateDatabaseSlice>): UserPrivateDatabaseSlice {
    if (backupSlice.profile) {
      this.updateProfile(authenticatedUserId, backupSlice.profile);
    }

    const collections: CollectionName[] = [
      'employments',
      'salaryVersions',
      'attendance',
      'overtimeLedger',
      'leaves',
      'vacationPlans',
      'vacationAccrualPeriods',
      'vacationPayCalculations',
      'loans',
      'loanRepayments',
      'payslips',
      'documents',
      'reminders',
      'finance',
      'overtimeCalculations',
    ];

    for (const col of collections) {
      const incoming = backupSlice[col] as Array<{ id: string; userId: string }> | undefined;
      if (Array.isArray(incoming)) {
        const currentList = this.state[col] as unknown as Array<{ id: string; userId: string }>;
        const otherUsersRecords = currentList.filter((r) => r.userId !== authenticatedUserId);
        const sanitizedIncoming = incoming.map((item) => ({
          ...item,
          id: item.id || `${col.slice(0, 3)}-${crypto.randomUUID().slice(0, 8)}`,
          userId: authenticatedUserId,
        }));
        (this.state[col] as unknown) = [...otherUsersRecords, ...sanitizedIncoming];
      }
    }

    this.saveToDisk();
    return this.getUserSlice(authenticatedUserId);
  }
}
