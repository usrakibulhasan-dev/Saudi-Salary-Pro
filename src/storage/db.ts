import type {
  AuthenticatedUser,
  PersonalProfile,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';

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

const TOKEN_STORAGE_KEY = 'saudi_salary_pro_v2_auth_token';
const CACHED_SLICE_KEY = 'saudi_salary_pro_v2_cached_slice';

const memoryStorage = new Map<string, string>();

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memoryStorage.get(key) ?? null;
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function safeSetItem(key: string, value: string): void {
  memoryStorage.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore iframe storage restrictions
  }
}

function safeRemoveItem(key: string): void {
  memoryStorage.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore iframe storage restrictions
  }
}

export interface SystemCapabilitiesStatus {
  serverPersistence: string;
  geminiOcrAndAssistantConfigured: boolean;
  googleDriveOAuthConfigured: boolean;
  pushNotificationsConfigured: boolean;
}

export function createBrowserFallbackSlice(email = 'rahim.khan@example.sa'): UserPrivateDatabaseSlice {
  const now = new Date().toISOString();
  const isCarlo = email.toLowerCase().includes('carlo');

  if (isCarlo) {
    const user: AuthenticatedUser = {
      id: 'usr-carlo-02',
      email: 'carlo.reyes@example.sa',
      fullName: 'Carlo Dalisay Reyes',
      preferredLanguage: 'en',
      createdAt: '2023-06-15T08:00:00.000Z',
    };
    return {
      user,
      profile: {
        userId: user.id,
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
      employments: [
        {
          id: 'emp-carlo-curr',
          userId: user.id,
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
      ],
      salaryVersions: [
        {
          id: 'sal-carlo-v1',
          userId: user.id,
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
      ],
      attendance: [
        {
          id: 'att-carlo-01',
          userId: user.id,
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
      ],
      overtimeLedger: [
        {
          id: 'ot-carlo-01',
          userId: user.id,
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
      ],
      leaves: [],
      vacationPlans: [],
      vacationAccrualPeriods: [
        {
          id: 'vac-acc-carlo-01',
          userId: user.id,
          employmentId: 'emp-carlo-curr',
          periodLabel: '2026 Post-Vacation Reset Period (21-Day Statutory Example)',
          accrualStartDate: '2026-09-01',
          annualEntitlementDays: 21,
          accrualMethod: 'daily',
          dayBasis: '365_fixed',
          openingCarryForwardDays: 4.5,
          leaveTakenInPeriodDays: 0,
          manualAdjustmentDays: 0,
          manualAdjustmentReason: 'Carryover from 2025-2026 vacation settlement',
          isPostVacationReset: true,
          returnedFromVacationDate: '2026-09-01',
          isActive: true,
          notes: 'Post-vacation reset rule active from 1 Sep 2026.',
          createdAt: now,
          updatedAt: now,
        },
      ],
      vacationPayCalculations: [],
      loans: [
        {
          id: 'ln-carlo-01',
          userId: user.id,
          employmentId: 'emp-carlo-curr',
          loanCode: 'LN-RSCI-2026-01',
          loanName: 'Emergency Family Medical Advance',
          loanType: 'emergency_loan',
          issueDate: '2026-01-15',
          originalAmount: 4000,
          currency: 'SAR',
          monthlyDeductionAmount: 1000,
          firstDeductionMonth: '2026-02',
          expectedFinalDeductionMonth: '2026-05',
          status: 'active',
          notes: '4-month interest-free emergency advance.',
          createdAt: '2026-01-15T10:00:00.000Z',
          updatedAt: now,
        },
      ],
      loanRepayments: [
        {
          id: 'rep-carlo-01',
          userId: user.id,
          loanId: 'ln-carlo-01',
          deductionDate: '2026-03-01',
          salaryMonth: '2026-02',
          scheduledDeduction: 1000,
          actualDeduction: 1000,
          amountAppliedToPrincipal: 1000,
          remainingBalanceAfter: 3000,
          payslipReference: 'Slip-2026-02',
          notes: 'First installment deducted.',
          createdAt: '2026-03-01T10:00:00.000Z',
        },
      ],
      payslips: [
        {
          id: 'pay-carlo-2026-03',
          userId: user.id,
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
      ],
      documents: [],
      reminders: [],
      finance: [],
      overtimeCalculations: [],
    };
  }

  const user: AuthenticatedUser = {
    id: 'usr-rahim-01',
    email: 'rahim.khan@example.sa',
    fullName: 'Md. Rahim Ullah Khan',
    preferredLanguage: 'en',
    createdAt: '2022-03-01T08:00:00.000Z',
  };

  return {
    user,
    profile: {
      userId: user.id,
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
    employments: [
      {
        id: 'emp-rahim-prev',
        userId: user.id,
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
        insuranceProvider: 'Tawuniya',
        notes: 'Completed 2-year fixed contract and transferred via Qiwa (EOSB settled: SAR 4,950).',
        createdAt: '2020-02-01T08:00:00.000Z',
        updatedAt: '2022-02-28T08:00:00.000Z',
      },
      {
        id: 'emp-rahim-curr',
        userId: user.id,
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
        annualLeaveEntitlementDays: 30,
        insuranceProvider: 'Bupa Arabia Silver',
        insuranceExpiryDate: '2026-05-09',
        notes: 'Current employer under Qiwa authenticated contract #QW-992817.',
        createdAt: '2022-03-01T08:00:00.000Z',
        updatedAt: now,
      },
    ],
    salaryVersions: [
      {
        id: 'sal-rahim-v1',
        userId: user.id,
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
        createdAt: '2020-02-01T08:00:00.000Z',
      },
      {
        id: 'sal-rahim-v2',
        userId: user.id,
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
        createdAt: '2022-03-01T08:00:00.000Z',
      },
      {
        id: 'sal-rahim-v3',
        userId: user.id,
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
        createdAt: '2024-03-01T08:00:00.000Z',
      },
    ],
    attendance: [
      {
        id: 'att-rahim-01',
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
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
    ],
    overtimeLedger: [
      {
        id: 'ot-rahim-01',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        date: '2026-03-01',
        hours: 2,
        minutes: 30,
        decimalHours: 2.5,
        overtimeType: 'regular_day',
        approvalStatus: 'approved',
        estimatedAmount: 96.88,
        notes: 'Chiller commissioning approved by Project Manager.',
        createdAt: now,
      },
      {
        id: 'ot-rahim-02',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        date: '2026-03-03',
        hours: 2,
        minutes: 0,
        decimalHours: 2.0,
        overtimeType: 'regular_day',
        approvalStatus: 'approved',
        estimatedAmount: 77.5,
        notes: 'Night shift switchover.',
        createdAt: now,
      },
      {
        id: 'ot-rahim-03',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        date: '2026-03-06',
        hours: 6,
        minutes: 0,
        decimalHours: 6.0,
        overtimeType: 'weekly_rest',
        approvalStatus: 'pending',
        estimatedAmount: 232.5,
        notes: 'Friday emergency callout awaiting HR timesheet sign-off.',
        createdAt: now,
      },
    ],
    leaves: [
      {
        id: 'lv-rahim-01',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        startDate: '2025-11-10',
        endDate: '2025-11-24',
        actualDepartureDate: '2025-11-10',
        expectedReturnDate: '2025-11-24',
        actualReturnDate: '2025-11-25',
        returnToWorkConfirmed: true,
        durationType: 'full_day',
        calendarDaysAway: 15,
        totalDays: 15,
        paidLeaveDays: 15,
        unpaidLeaveDays: 0,
        leaveType: 'annual_leave',
        isPaid: true,
        approvalStatus: 'completed',
        vacationPayReceived: 3500,
        ticketAllowanceReceived: 1850,
        reason: 'Annual family vacation to Dhaka.',
        createdAt: '2025-11-01T10:00:00.000Z',
      },
      {
        id: 'lv-rahim-02',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        startDate: '2026-01-18',
        endDate: '2026-01-20',
        actualDepartureDate: '2026-01-18',
        expectedReturnDate: '2026-01-20',
        actualReturnDate: '2026-01-21',
        returnToWorkConfirmed: true,
        durationType: 'full_day',
        calendarDaysAway: 3,
        totalDays: 3,
        paidLeaveDays: 3,
        unpaidLeaveDays: 0,
        leaveType: 'sick_leave',
        isPaid: true,
        approvalStatus: 'completed',
        reason: 'Sehhaty medical certificate #SH-88210.',
        createdAt: '2026-01-18T10:00:00.000Z',
      },
    ],
    vacationPlans: [
      {
        id: 'vp-rahim-2026-aug',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        title: 'Summer Family Vacation to Dhaka 2026',
        plannedDepartureDate: '2026-08-01',
        plannedReturnDate: '2026-08-30',
        plannedVacationDays: 30,
        vacationType: 'annual_leave',
        expectedVacationPay: 7000,
        travelTicketBudget: 2200,
        approvalStatus: 'approved',
        notes: 'Exit/Re-Entry visa fee covered by employer per contract.',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: now,
      },
    ],
    vacationAccrualPeriods: [
      {
        id: 'vac-acc-rahim-reset',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        periodLabel: 'Post-Vacation Return Reset (1 Sep 2026 Policy)',
        accrualStartDate: '2026-09-01',
        annualEntitlementDays: 21,
        accrualMethod: 'daily',
        dayBasis: '365_fixed',
        openingCarryForwardDays: 5,
        leaveTakenInPeriodDays: 0,
        manualAdjustmentDays: 0,
        manualAdjustmentReason: '5 days unused leave carried forward prior to Sep 2026 reset',
        isPostVacationReset: true,
        returnedFromVacationDate: '2026-09-01',
        isActive: true,
        notes: 'Tracks post-vacation accrual from 1 Sep 2026 while preserving 5 carried-forward days separately.',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: now,
      },
    ],
    vacationPayCalculations: [
      {
        id: 'vpc-rahim-2026',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        title: 'August 2026 Annual Vacation Pay (30 Days)',
        calculationDate: '2026-03-20',
        expectedDepartureDate: '2026-08-01',
        expectedPaymentDate: '2026-07-28',
        basicSalary: 4600,
        housingAllowance: 1150,
        otherEligibleAllowances: 1250,
        leavePayBasis: 'actual_wage',
        payableVacationDays: 30,
        divisorMethod: '30_day_month',
        dailyLeaveSalaryRate: 233.33,
        estimatedGrossVacationPay: 7000,
        actualVacationPayReceived: 6850,
        varianceAmount: -150,
        notes: 'Article 109 requires full actual wage paid prior to leave departure.',
        createdAt: '2026-03-20T10:00:00.000Z',
      },
    ],
    loans: [
      {
        id: 'ln-rahim-01',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        loanCode: 'LN-ARMEC-2025-09',
        loanName: 'Company Housing & Car Repair Loan',
        loanType: 'company_loan',
        issueDate: '2025-12-01',
        originalAmount: 6000,
        currency: 'SAR',
        monthlyDeductionAmount: 750,
        firstDeductionMonth: '2026-01',
        expectedFinalDeductionMonth: '2026-08',
        status: 'active',
        notes: 'Approved 8-month interest-free company loan (SAR 750/month).',
        createdAt: '2025-12-01T10:00:00.000Z',
        updatedAt: now,
      },
      {
        id: 'ln-rahim-02',
        userId: user.id,
        employmentId: 'emp-rahim-curr',
        loanCode: 'ADV-ARMEC-2026-01',
        loanName: 'Ramadan Family Remittance Salary Advance',
        loanType: 'salary_advance',
        issueDate: '2026-02-10',
        originalAmount: 1500,
        currency: 'SAR',
        monthlyDeductionAmount: 500,
        firstDeductionMonth: '2026-02',
        expectedFinalDeductionMonth: '2026-04',
        status: 'active',
        notes: 'Short-term 3-month salary advance.',
        createdAt: '2026-02-10T10:00:00.000Z',
        updatedAt: now,
      },
    ],
    loanRepayments: [
      {
        id: 'rep-rahim-01',
        userId: user.id,
        loanId: 'ln-rahim-01',
        deductionDate: '2026-02-01',
        salaryMonth: '2026-01',
        scheduledDeduction: 750,
        actualDeduction: 750,
        amountAppliedToPrincipal: 750,
        remainingBalanceAfter: 5250,
        payslipReference: 'ARMEC-SLIP-2026-01',
        notes: 'January 2026 payroll deduction.',
        createdAt: '2026-02-01T10:00:00.000Z',
      },
      {
        id: 'rep-rahim-02',
        userId: user.id,
        loanId: 'ln-rahim-01',
        deductionDate: '2026-03-01',
        salaryMonth: '2026-02',
        scheduledDeduction: 750,
        actualDeduction: 750,
        amountAppliedToPrincipal: 750,
        remainingBalanceAfter: 4500,
        payslipReference: 'ARMEC-SLIP-2026-02',
        notes: 'February 2026 payroll deduction.',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'rep-rahim-03',
        userId: user.id,
        loanId: 'ln-rahim-02',
        deductionDate: '2026-03-01',
        salaryMonth: '2026-02',
        scheduledDeduction: 500,
        actualDeduction: 500,
        amountAppliedToPrincipal: 500,
        remainingBalanceAfter: 1000,
        payslipReference: 'ARMEC-SLIP-2026-02',
        notes: 'First advance installment deducted.',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
    ],
    payslips: [
      {
        id: 'pay-rahim-2026-03',
        userId: user.id,
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
        totalDeductions: 0,
        netSalary: 7174.38,
        bankCreditAmount: 7000.0,
        bankCreditDate: '2026-04-02',
        extractionSource: 'ai_ocr_verified',
        notes: 'Friday 6h OT from Mar 6 omitted from slip; bank transfer credited base SAR 7,000 only.',
        createdAt: '2026-04-02T12:00:00.000Z',
      },
    ],
    documents: [
      {
        id: 'doc-rahim-01',
        userId: user.id,
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
    ],
    reminders: [
      {
        id: 'rem-rahim-01',
        userId: user.id,
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
        userId: user.id,
        category: 'contract_expiry',
        title: 'Qiwa Contract Renewal Notice Window (60 Days)',
        targetDate: '2026-06-30',
        leadNoticeDays: 60,
        completed: false,
        notes: 'Article 75/76 notice period is 60 days prior to contract end.',
        createdAt: now,
      },
    ],
    finance: [
      {
        id: 'fin-rahim-01',
        userId: user.id,
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
        userId: user.id,
        date: '2026-03-05',
        monthYear: '2026-03',
        category: 'family_remittance',
        flowType: 'remittance',
        amount: 3500,
        description: 'Family Remittance to Dhaka via Tahweel Al Rajhi (111,475 BDT)',
        createdAt: now,
      },
    ],
    overtimeCalculations: [],
  };
}

export function getSavedToken(): string | null {
  return safeGetItem(TOKEN_STORAGE_KEY);
}

export function setSavedToken(token: string | null): void {
  if (token) {
    safeSetItem(TOKEN_STORAGE_KEY, token);
  } else {
    safeRemoveItem(TOKEN_STORAGE_KEY);
    safeRemoveItem(CACHED_SLICE_KEY);
  }
}

export function getCachedSlice(): UserPrivateDatabaseSlice | null {
  try {
    const raw = safeGetItem(CACHED_SLICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserPrivateDatabaseSlice;
    if (!parsed || !parsed.user || !parsed.profile || !Array.isArray(parsed.employments)) {
      return null;
    }
    return {
      ...parsed,
      vacationPlans: Array.isArray(parsed.vacationPlans) ? parsed.vacationPlans : [],
      vacationAccrualPeriods: Array.isArray(parsed.vacationAccrualPeriods)
        ? parsed.vacationAccrualPeriods
        : [],
      vacationPayCalculations: Array.isArray(parsed.vacationPayCalculations)
        ? parsed.vacationPayCalculations
        : [],
      loans: Array.isArray(parsed.loans) ? parsed.loans : [],
      loanRepayments: Array.isArray(parsed.loanRepayments) ? parsed.loanRepayments : [],
      overtimeCalculations: Array.isArray(parsed.overtimeCalculations) ? parsed.overtimeCalculations : [],
    };
  } catch {
    return null;
  }
}

export function setCachedSlice(slice: UserPrivateDatabaseSlice): void {
  safeSetItem(CACHED_SLICE_KEY, JSON.stringify(slice));
}

function isSimulatedFailureEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __SIMULATE_SAVE_FAILURE__?: boolean }).__SIMULATE_SAVE_FAILURE__,
  );
}

async function performRawFetch<T>(
  path: string,
  options: RequestInit = {},
  tokenOverride?: string | null,
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const token = tokenOverride !== undefined ? tokenOverride : getSavedToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (
    isSimulatedFailureEnabled() &&
    options.method &&
    ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase()) &&
    !path.startsWith('/api/auth/')
  ) {
    headers['x-simulate-save-failure'] = 'true';
  }
  const response = await fetch(path, {
    ...options,
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token = getSavedToken();

  // If token is a fallback local-token or missing while a demo user slice is active, auto-exchange for a real server session token
  if ((!token || token.startsWith('local-token-')) && !path.startsWith('/api/auth/')) {
    const cached = getCachedSlice();
    const email = cached?.user?.email;
    if (email === 'rahim.khan@example.sa' || email === 'carlo.reyes@example.sa') {
      const loginAttempt = await performRawFetch<{
        token: string;
        slice: UserPrivateDatabaseSlice;
      }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password: 'SaudiPro#2026' }),
        },
        null,
      );
      if (loginAttempt.ok && loginAttempt.data.token) {
        token = loginAttempt.data.token;
        setSavedToken(token);
      }
    }
  }

  let res = await performRawFetch<T>(path, options, token);

  // If 401 occurred because the server restarted or token expired for a demo account, re-authenticate once and retry
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const cached = getCachedSlice();
    const email = cached?.user?.email;
    if (email === 'rahim.khan@example.sa' || email === 'carlo.reyes@example.sa') {
      const reauth = await performRawFetch<{
        token: string;
        slice: UserPrivateDatabaseSlice;
      }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password: 'SaudiPro#2026' }),
        },
        null,
      );
      if (reauth.ok && reauth.data.token) {
        setSavedToken(reauth.data.token);
        res = await performRawFetch<T>(path, options, reauth.data.token);
      }
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      throw new Error(res.data.error || 'You must be signed in to save records.');
    }
    throw new Error(res.data.error || `Request failed with status ${res.status}`);
  }
  return res.data;
}

export async function fetchSystemStatus(): Promise<SystemCapabilitiesStatus> {
  try {
    return await apiRequest<SystemCapabilitiesStatus>('/api/system/status');
  } catch {
    return {
      serverPersistence: 'ACTIVE_BROWSER_AND_SERVER_STORE',
      geminiOcrAndAssistantConfigured: false,
      googleDriveOAuthConfigured: false,
      pushNotificationsConfigured: false,
    };
  }
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ token: string; slice: UserPrivateDatabaseSlice }> {
  const res = await apiRequest<{ token: string; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  );
  setSavedToken(res.token);
  setCachedSlice(res.slice);
  return res;
}

export async function apiRegister(params: {
  email: string;
  password: string;
  fullName: string;
  nationality?: string;
  jobTitle?: string;
  preferredLanguage?: UserPrivateDatabaseSlice['user']['preferredLanguage'];
}): Promise<{ token: string; slice: UserPrivateDatabaseSlice }> {
  const res = await apiRequest<{ token: string; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  );
  setSavedToken(res.token);
  setCachedSlice(res.slice);
  return res;
}

export async function apiGoogleAuth(params: {
  email: string;
  fullName: string;
  photoUrl?: string;
  googleId: string;
  preferredLanguage?: UserPrivateDatabaseSlice['user']['preferredLanguage'];
}): Promise<{ token: string; slice: UserPrivateDatabaseSlice }> {
  const res = await apiRequest<{ token: string; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/google',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  );
  setSavedToken(res.token);
  setCachedSlice(res.slice);
  return res;
}

export async function apiForgotPassword(
  email: string,
): Promise<{ message: string; resetToken: string; email: string }> {
  return apiRequest<{ message: string; resetToken: string; email: string }>(
    '/api/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}

export async function apiResetPassword(
  email: string,
  token: string,
  newPassword: string,
): Promise<{ token: string; slice: UserPrivateDatabaseSlice }> {
  const res = await apiRequest<{ token: string; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/reset-password',
    {
      method: 'POST',
      body: JSON.stringify({ email, token, newPassword }),
    },
  );
  setSavedToken(res.token);
  setCachedSlice(res.slice);
  return res;
}

export async function apiSetPassword(newPassword: string): Promise<UserPrivateDatabaseSlice> {
  const res = await apiRequest<{ success: boolean; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/set-password',
    {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    },
  );
  setCachedSlice(res.slice);
  return res.slice;
}

export async function apiLinkGoogle(params: {
  email: string;
  googleId: string;
  photoUrl?: string;
}): Promise<UserPrivateDatabaseSlice> {
  const res = await apiRequest<{ success: boolean; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/link-google',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  );
  setCachedSlice(res.slice);
  return res.slice;
}

export async function apiUnlinkGoogle(): Promise<UserPrivateDatabaseSlice> {
  const res = await apiRequest<{ success: boolean; slice: UserPrivateDatabaseSlice }>(
    '/api/auth/unlink-google',
    {
      method: 'POST',
    },
  );
  setCachedSlice(res.slice);
  return res.slice;
}

export function apiLogout(): void {
  setSavedToken(null);
}

export async function apiFetchUserSlice(): Promise<UserPrivateDatabaseSlice> {
  const res = await apiRequest<{ slice: UserPrivateDatabaseSlice }>('/api/user-data');
  setCachedSlice(res.slice);
  return res.slice;
}

export async function apiUpdateProfile(
  updates: Partial<PersonalProfile>,
): Promise<PersonalProfile> {
  const res = await apiRequest<{ profile: PersonalProfile }>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  const current = getCachedSlice();
  if (current) {
    setCachedSlice({
      ...current,
      profile: res.profile,
      user: {
        ...current.user,
        fullName: res.profile.fullName || current.user.fullName,
        preferredLanguage: res.profile.preferredLanguage || current.user.preferredLanguage,
      },
    });
  }
  return res.profile;
}

export async function apiUpsertRecord<T extends { id: string; userId: string }>(
  collection: CollectionName,
  record: Omit<T, 'id' | 'userId'> & { id?: string; userId?: string },
): Promise<T> {
  const hasExistingId = Boolean(record.id && String(record.id).trim().length > 0);
  const endpoint = hasExistingId
    ? `/api/record/${collection}/${encodeURIComponent(String(record.id).trim())}`
    : `/api/record/${collection}`;
  const method = hasExistingId ? 'PUT' : 'POST';

  const res = await apiRequest<{ record: T }>(endpoint, {
    method,
    body: JSON.stringify(record),
  });

  const current = getCachedSlice();
  if (current) {
    const list = [...((current[collection] as unknown as T[]) || [])];
    const idx = list.findIndex((i) => i.id === res.record.id);
    if (idx >= 0) {
      list[idx] = res.record;
    } else {
      list.push(res.record);
    }
    setCachedSlice({ ...current, [collection]: list });
  }
  return res.record;
}

export async function apiDeleteRecord(collection: CollectionName, id: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>(
    `/api/record/${collection}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
  const current = getCachedSlice();
  if (current) {
    const list = ((current[collection] as unknown as Array<{ id: string }>) || []).filter(
      (i) => i.id !== id,
    );
    setCachedSlice({ ...current, [collection]: list });
  }
}

export async function apiRestoreBackup(
  slice: Partial<UserPrivateDatabaseSlice>,
): Promise<UserPrivateDatabaseSlice> {
  const res = await apiRequest<{ slice: UserPrivateDatabaseSlice }>('/api/backup/restore', {
    method: 'POST',
    body: JSON.stringify({ slice }),
  });
  setCachedSlice(res.slice);
  return res.slice;
}

export async function apiExtractPayslipOcr(params: {
  fileDataUrl: string;
  fileName: string;
  mimeType: string;
}): Promise<{
  configured: boolean;
  message: string;
  candidate: Record<string, unknown>;
}> {
  return apiRequest('/api/ocr/payslip', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
