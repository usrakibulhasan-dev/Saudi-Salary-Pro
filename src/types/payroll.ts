export type SupportedLanguage =
  | 'en'
  | 'ar'
  | 'bn'
  | 'ur'
  | 'hi'
  | 'tl'
  | 'ml'
  | 'ta'
  | 'ne';

export type PrimaryNavModule =
  | 'dashboard'
  | 'profile'
  | 'employment'
  | 'attendance'
  | 'overtime'
  | 'overtime_salary_calculator'
  | 'leave'
  | 'loans'
  | 'payslips'
  | 'reconciliation'
  | 'eosb'
  | 'settlement'
  | 'documents'
  | 'finance'
  | 'reports'
  | 'reminders'
  | 'backup'
  | 'assistant';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  preferredLanguage: SupportedLanguage;
  createdAt: string;
}

export interface PersonalProfile {
  userId: string;
  fullName: string;
  displayName?: string;
  nationality: string;
  dateOfBirth?: string;
  phone?: string;
  email: string;
  iqamaNumber?: string;
  iqamaExpiryDate?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  currentCity?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  preferredLanguage: SupportedLanguage;
  preferredCurrency: string;
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY';
  monthlyBudgetTarget: number;
  monthlySavingsGoal: number;
  lastBackupAt?: string;
  googleConnected?: boolean;
  googleEmail?: string;
  googlePhotoUrl?: string;
  googleDriveConnected?: boolean;
  googleDriveEmail?: string;
  googleDriveFolderId?: string;
  googleDriveFolderName?: string;
  autoBackupToDrive?: boolean;
  lastDriveBackupAt?: string;
  hasPassword?: boolean;
  updatedAt: string;
}

export interface EntitlementHistoryEntry {
  effectiveFrom: string;
  annualEntitlementDays: number;
  policyNote: string;
}

export interface EmploymentPeriod {
  id: string;
  userId: string;
  employerName: string;
  jobTitle: string;
  department: string;
  employeeNumber?: string;
  workLocation: string;
  joiningDate: string;
  lastWorkingDate?: string;
  isCurrent: boolean;
  contractType: 'fixed_term' | 'indefinite';
  contractStartDate: string;
  contractEndDate?: string;
  probationDays: number;
  noticePeriodDays: number;
  weeklyRestDays: string[];
  expectedDailyHours: number;
  expectedWeeklyHours: number;
  annualLeaveEntitlementDays: number;
  entitlementHistory?: EntitlementHistoryEntry[];
  insuranceProvider?: string;
  insuranceExpiryDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryVersion {
  id: string;
  userId: string;
  employmentId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  basicSalary: number;
  housingAllowance: number;
  foodAllowance: number;
  transportAllowance: number;
  otherFixedAllowances: number;
  variableAllowances: number;
  payFrequency: 'monthly' | 'biweekly' | 'weekly';
  reasonForChange: string;
  contractualNotes?: string;
  linkedDocumentId?: string;
  createdAt: string;
}

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'sick_leave'
  | 'annual_leave'
  | 'emergency_leave'
  | 'unpaid_leave'
  | 'public_holiday'
  | 'weekly_off';

export type ShiftType = 'day' | 'night' | 'rotating' | 'custom';

export interface DailyAttendanceRecord {
  id: string;
  userId: string;
  employmentId: string;
  date: string;
  status: AttendanceStatus;
  shiftType: ShiftType;
  scheduledStart: string;
  scheduledEnd: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  elapsedHours: number;
  netWorkingHours: number;
  regularScheduledHours: number;
  userRecordedOvertimeHours: number;
  estimatedPayableOvertimeHours: number;
  isWeeklyRestDay: boolean;
  isPublicHoliday: boolean;
  isIncomplete: boolean;
  workLocation?: string;
  notes?: string;
  changeHistory: { timestamp: string; summary: string }[];
  createdAt: string;
  updatedAt: string;
}

export type OvertimeApprovalStatus = 'pending' | 'approved' | 'rejected' | 'not_applicable';

export interface OvertimeLedgerEntry {
  id: string;
  userId: string;
  employmentId: string;
  date: string;
  hours: number;
  minutes: number;
  decimalHours: number;
  overtimeType: 'regular_day' | 'weekly_rest' | 'public_holiday';
  approvalStatus: OvertimeApprovalStatus;
  estimatedAmount: number;
  notes?: string;
  linkedAttendanceId?: string;
  createdAt: string;
}

export type LeaveCategory =
  | 'annual_leave'
  | 'sick_leave'
  | 'absent'
  | 'emergency_leave'
  | 'unpaid_leave'
  | 'public_holiday'
  | 'weekly_off'
  | 'other_leave';

export type LeaveType = LeaveCategory;

/**
 * Unified Leave & Vacation Log Record (Sections 2 & 4).
 * Shared between the Leave Tracker and Vacation Log so vacations are never double-counted.
 */
export interface LeaveRecord {
  id: string;
  userId: string;
  employmentId: string;
  employerName?: string;
  contractRef?: string;
  startDate: string;
  endDate: string;
  actualDepartureDate?: string;
  expectedReturnDate?: string;
  actualReturnToWorkDate?: string;
  actualReturnDate?: string;
  returnConfirmed?: boolean;
  returnToWorkConfirmed?: boolean;
  calendarDaysAway?: number;
  durationType: 'full_day' | 'half_day' | 'hourly';
  totalDays: number; // leave days charged
  paidDays?: number;
  paidLeaveDays?: number;
  unpaidDays?: number;
  unpaidLeaveDays?: number;
  hoursCount?: number;
  leaveType: LeaveCategory;
  isPaid: boolean;
  approvalStatus: OvertimeApprovalStatus | 'completed';
  vacationPayReceived?: number;
  ticketAllowanceReceived?: number;
  medicalCertificateRef?: string;
  supportingDocumentName?: string;
  linkedPlanId?: string;
  reason?: string;
  linkedDocumentId?: string;
  createdAt: string;
}

/**
 * Section 3: Vacation Plan Record (Future/Planned Vacations).
 */
export type VacationPlanStatus =
  | 'draft'
  | 'planned'
  | 'approved'
  | 'started'
  | 'completed'
  | 'cancelled';

export interface VacationPlanRecord {
  id: string;
  userId: string;
  employmentId: string;
  employerName?: string;
  contractRef?: string;
  planName?: string;
  title?: string;
  plannedDepartureDate: string;
  plannedReturnDate: string;
  plannedVacationDays: number;
  vacationType: LeaveCategory;
  expectedVacationPay: number;
  travelTicketBudget?: number;
  status?: VacationPlanStatus;
  approvalStatus?: VacationPlanStatus;
  supportingDocumentName?: string;
  attachmentName?: string;
  convertedToLeaveId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Section 5 & 6: Annual Leave Accrual Period & Reset Rule Configuration.
 */
export type AccrualMethodType = 'daily' | 'monthly' | 'company_defined';
export type AccrualCalculationMethod = AccrualMethodType;
export type YearDayBasisType = '365_fixed' | 'leap_aware_365_366' | '360_contractual';
export type AccrualDayBasis = YearDayBasisType;
export type VacationYearViewMode =
  | 'calendar_year'
  | 'anniversary_year'
  | 'custom_accrual_period'
  | 'employer_leave_year';

export interface YearByYearVacationRow {
  leaveYear: string;
  leaveYearLabel: string;
  periodStart: string;
  periodEnd: string;
  annualEntitlement: number;
  openingBalance: number;
  earned: number;
  taken: number;
  adjustments: number;
  closingBalance: number;
}

export interface VacationAccrualPeriod {
  id: string;
  userId: string;
  employmentId: string;
  employerName?: string;
  periodLabel: string;
  employmentStartDate?: string;
  contractStartDate?: string;
  accrualStartDate?: string;
  accrualEndDate?: string;
  annualEntitlementDays: number;
  accrualMethod: AccrualMethodType;
  yearDayBasis?: YearDayBasisType;
  dayBasis?: YearDayBasisType;
  accrualYearStartDate?: string;
  lastVacationStartDate?: string;
  lastVacationEndDate?: string;
  returnToWorkDate?: string;
  lastVacationReturnDate?: string;
  returnedFromVacationDate?: string;
  newAccrualStartDate?: string; // Reset rule date (e.g., 2026-09-01)
  useReturnDateResetRule?: boolean;
  isPostVacationReset?: boolean;
  openingCarryoverDays?: number; // Kept strictly separate from current period earned leave
  openingCarryForwardDays?: number;
  leaveTakenInPeriodDays?: number;
  manualAdjustmentDays: number;
  manualAdjustmentReason?: string;
  employerPolicyNotes?: string;
  notes?: string;
  effectiveDateOfEntitlementChange?: string;
  isCurrentPeriod?: boolean;
  isActive?: boolean;
  editAuditLog?: { timestamp: string; summary: string }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Section 8: Vacation Money / Vacation Pay Calculator Record.
 */
export type VacationPayBasisType =
  | 'actual_wage'
  | 'basic_plus_housing'
  | 'basic_only'
  | 'custom_components';
export type VacationPayBasis = VacationPayBasisType;
export type VacationPayDivisorMethod =
  | '30_days'
  | '30_day_month'
  | 'actual_month_days'
  | '26_working_days';

export interface VacationPayCalculationRecord {
  id: string;
  userId: string;
  employmentId: string;
  calculationTitle?: string;
  title?: string;
  calculationDate?: string;
  basicSalary: number;
  housingAllowance: number;
  otherEligibleAllowances: number;
  leavePayBasis: VacationPayBasisType;
  payableVacationDays: number;
  dailyDivisorMethod?: VacationPayDivisorMethod;
  divisorMethod?: VacationPayDivisorMethod;
  expectedDepartureDate: string;
  expectedPaymentDate?: string;
  eligibleMonthlyBase?: number;
  dailySalaryBasis?: number;
  dailyLeaveSalaryRate?: number;
  estimatedVacationPay?: number;
  estimatedGrossVacationPay?: number;
  actualVacationPayReceived?: number;
  varianceAmount: number;
  formulaUsed?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Section 1: Employee Loan Management Module Types.
 */
export type EmployeeLoanType =
  | 'company_loan'
  | 'salary_advance'
  | 'personal_loan'
  | 'emergency_loan'
  | 'other';
export type LoanType = EmployeeLoanType;

export type EmployeeLoanStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type LoanStatus = EmployeeLoanStatus;

export interface EmployeeLoanRecord {
  id: string;
  userId: string;
  employmentId?: string;
  loanCode: string; // User-visible Loan ID (e.g. LN-2026-01)
  loanName: string;
  loanType: EmployeeLoanType;
  issueDate: string;
  originalAmount: number;
  currency: string;
  monthlyDeductionAmount: number;
  firstDeductionMonth: string; // YYYY-MM
  expectedFinalDeductionMonth: string; // YYYY-MM
  status: EmployeeLoanStatus;
  supportingDocumentName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanRepaymentRecord {
  id: string;
  userId: string;
  loanId: string;
  deductionDate: string;
  salaryMonth: string; // YYYY-MM
  scheduledDeduction: number;
  actualDeduction: number;
  amountAppliedToPrincipal: number;
  remainingBalanceAfter: number;
  payslipReference?: string;
  attachmentName?: string;
  isAdditionalConfirmedDeduction?: boolean;
  confirmedDuplicateMonth?: boolean;
  confirmedNegativeBalance?: boolean;
  notes?: string;
  createdAt: string;
}

export interface PayslipDeductionItem {
  label: string;
  amount: number;
  reason?: string;
}

export interface PayslipRecord {
  id: string;
  userId: string;
  employmentId: string;
  employerName: string;
  payPeriod: string;
  paymentDate: string;
  basicSalary: number;
  housingAllowance: number;
  foodAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimeHours: number;
  overtimeAmount: number;
  bonus: number;
  grossEarnings: number;
  itemizedDeductions: PayslipDeductionItem[];
  loanDeductionAmount?: number;
  totalDeductions: number;
  netSalary: number;
  bankCreditAmount?: number;
  bankCreditDate?: string;
  extractionSource: 'manual' | 'ai_ocr_verified';
  attachmentName?: string;
  attachmentDataUrl?: string;
  notes?: string;
  createdAt: string;
}

export type DocumentCategory =
  | 'employment_contract'
  | 'salary_slip'
  | 'offer_letter'
  | 'iqama_passport'
  | 'leave_approval'
  | 'salary_increment'
  | 'experience_certificate'
  | 'resignation_letter'
  | 'final_settlement'
  | 'insurance_card'
  | 'bank_statement'
  | 'loan_agreement'
  | 'other';

export interface PersonalDocument {
  id: string;
  userId: string;
  employmentId?: string;
  linkedPayslipId?: string;
  category: DocumentCategory;
  title: string;
  issueDate?: string;
  expiryDate?: string;
  tags: string[];
  fileName: string;
  fileSize: number;
  mimeType: string;
  dataUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReminderCategory =
  | 'iqama_expiry'
  | 'passport_expiry'
  | 'contract_expiry'
  | 'insurance_expiry'
  | 'probation_end'
  | 'notice_deadline'
  | 'planned_leave'
  | 'pending_vacation_approval'
  | 'expected_vacation_payment'
  | 'return_to_work_confirmation'
  | 'accrual_anniversary'
  | 'salary_payment'
  | 'claim_followup'
  | 'custom';

export interface PersonalReminder {
  id: string;
  userId: string;
  category: ReminderCategory;
  title: string;
  targetDate: string;
  leadNoticeDays: number;
  completed: boolean;
  notes?: string;
  createdAt: string;
}

export type FinanceCategory =
  | 'salary_income'
  | 'bonus'
  | 'family_remittance'
  | 'living_expenses'
  | 'transport_food'
  | 'loan_advance_received'
  | 'loan_repayment'
  | 'savings_deposit'
  | 'other';

export interface FinanceTransaction {
  id: string;
  userId: string;
  date: string;
  monthYear: string;
  category: FinanceCategory;
  flowType: 'income' | 'expense' | 'remittance' | 'loan_repayment' | 'savings';
  amount: number;
  description: string;
  createdAt: string;
}

export interface OvertimeDeductionItem {
  id: string;
  description: string;
  amount: number;
  appliesTo: 'overtime_only' | 'total_salary';
}

export interface SavedOvertimeCalculationRecord {
  id: string;
  userId: string;
  title: string;
  calculationDate: string;
  // Salary base components
  basicSalary: number;
  foodAllowance: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  totalMonthlySalary: number;
  dailyWorkingHours: number;
  monthlyHoursDivisor: number;
  // Overtime hours
  regularOtHours: number;
  restDayOtHours: number;
  holidayOtHours: number;
  totalOtHours: number;
  otHoursInputMode: 'decimal' | 'hours_minutes';
  rawHours: number;
  rawMinutes: number;
  // Method A: Saudi Labor Law Results (Art. 107)
  laborLawHourlyBasic: number;
  laborLawHourlyActual: number;
  laborLawOtRate: number;
  laborLawRestDayRate: number;
  laborLawGrossOt: number;
  laborLawNetOt: number;
  laborLawFinalSalary: number;
  // Method B: Company Payslip Results
  companyFormulaType: 'basic_1_5' | 'total_1_5' | 'basic_custom' | 'fixed_hourly';
  companyMultiplier: number;
  companyFixedHourlyRate: number;
  companyOtRate: number;
  companyGrossOt: number;
  companyNetOt: number;
  companyFinalSalary: number;
  isCompanyFormulaVerified: boolean;
  // Deductions
  deductions: OvertimeDeductionItem[];
  totalOtDeductions: number;
  totalSalaryDeductions: number;
  totalAllDeductions: number;
  // Comparison
  varianceGross: number; // laborLawGrossOt - companyGrossOt
  varianceNet: number;   // laborLawNetOt - companyNetOt
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserPrivateDatabaseSlice {
  user: AuthenticatedUser;
  profile: PersonalProfile;
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
  overtimeCalculations?: SavedOvertimeCalculationRecord[];
}

export type TerminationReason =
  | 'employer_termination'
  | 'contract_expiry'
  | 'resignation'
  | 'article_87_force_majeure_marriage_childbirth'
  | 'article_81_worker_right'
  | 'article_80_dismissal_for_cause'
  | 'retirement_or_disability';

export interface GoogleDriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size?: string;
  description?: string;
}

export interface BackupPackageMetadata {
  backupVersion: number;
  appName: string;
  exportedAt: string;
  userId: string;
  userEmail: string;
  checksum: string;
  recordCounts: Record<string, number>;
}

export interface FullBackupPackage {
  metadata: BackupPackageMetadata;
  slice: UserPrivateDatabaseSlice;
}

