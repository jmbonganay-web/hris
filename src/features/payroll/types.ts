import type {
  CompensationEventType,
  CompensationType,
  PayrollBusinessDayAdjustment,
  PayrollPeriodEventType,
  PayrollPeriodStatus,
  PayrollRequestStatus,
  PayrollScheduleType,
  PayrollBasisRoundingMode,
  PayrollCalculationRunStatus,
  PayrollEmployeeEntryStatus,
  PayrollExceptionSeverity,
  PayrollExceptionStatus,
  PayrollSourceType,
  PremiumDayType,
  PremiumRuleScopeType,
  PremiumTimeRoundingMode,
  PremiumType,
} from "./constants.ts";

export type PayrollActionState = {
  error?: string;
  success?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
};

export type PayrollScheduleInput = {
  name: string;
  code: string;
  scheduleType: PayrollScheduleType;
  anchorDate: string | null;
  firstPeriodEndDay: number | null;
  cutoffOffsetDays: number;
  paymentOffsetDays: number;
};

export type CompensationInput = {
  compensationType: CompensationType;
  monthlySalary: number | null;
  hourlyRate: number | null;
  standardHoursPerDay: number;
  standardHoursPerWeek: number;
  effectiveFrom: string;
  changeReason: string;
  expectedVersion?: number;
};

export type ScheduleAssignmentInput = {
  payrollScheduleId: string;
  effectiveFrom: string;
  changeReason: string;
  overrideMidPeriod: boolean;
  overrideReason: string | null;
  expectedVersion?: number;
};

export type PayrollSettings = {
  defaultCurrencyCode: string;
  payrollTimezone: string;
  generationEnabled: boolean;
  generationHorizonMonths: number;
  version: number;
  updatedAt: string;
};

export type PayrollScheduleSummary = {
  id: string;
  name: string;
  code: string;
  scheduleType: PayrollScheduleType;
  currencyCode: string;
  timezone: string;
  anchorDate: string | null;
  firstPeriodEndDay: number | null;
  cutoffOffsetDays: number;
  paymentOffsetDays: number;
  businessDayAdjustment: PayrollBusinessDayAdjustment;
  isActive: boolean;
  version: number;
  assignedEmployeeCount: number;
  nextPeriod: PayrollPeriodPreview | null;
};

export type PayrollScheduleDetail = PayrollScheduleSummary & {
  upcomingPeriods: PayrollPeriodPreview[];
  createdAt: string;
  updatedAt: string;
};

export type PayrollPeriodPreview = {
  periodCode: string;
  periodSequence: number;
  periodStart: string;
  periodEnd: string;
  cutoffDate: string;
  paymentDate: string;
  originalCutoffDate: string;
  originalPaymentDate: string;
  cutoffAdjusted: boolean;
  paymentAdjusted: boolean;
};

export type PayrollPeriodSummary = PayrollPeriodPreview & {
  id: string;
  payrollScheduleId: string;
  scheduleName: string;
  scheduleCode: string;
  status: PayrollPeriodStatus;
  requiresRecalculation: boolean;
  version: number;
};

export type PayrollPeriodFilters = {
  scheduleId?: string;
  status?: PayrollPeriodStatus;
  year?: number;
  from?: string;
  to?: string;
  page?: number;
};

export type PayrollPeriodListResult = {
  items: PayrollPeriodSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type PayrollAuditEvent = {
  id: string;
  eventType: PayrollPeriodEventType | CompensationEventType;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  actorName: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PayrollPeriodDetail = PayrollPeriodSummary & {
  openedAt: string | null;
  submittedForReviewAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  createdAt: string;
  updatedAt: string;
  events: PayrollAuditEvent[];
};

export type EmployeeIdentity = {
  id: string;
  employeeNumber: string;
  fullName: string;
  workEmail: string | null;
};

export type CompensationRecord = {
  id: string;
  employeeId: string;
  compensationType: CompensationType;
  monthlySalary: number | null;
  hourlyRate: number | null;
  currencyCode: string;
  standardHoursPerDay: number;
  standardHoursPerWeek: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PayrollRequestStatus;
  changeReason: string | null;
  isBackdated: boolean;
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollScheduleAssignment = {
  id: string;
  employeeId: string;
  payrollScheduleId: string;
  payrollScheduleName: string;
  payrollScheduleType: PayrollScheduleType;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PayrollRequestStatus;
  changeReason: string | null;
  overrideMidPeriod: boolean;
  overrideReason: string | null;
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeCompensationAdminDetail = {
  employee: EmployeeIdentity;
  currencyCode: string;
  companyDate: string;
  currentCompensation: CompensationRecord | null;
  currentAssignment: PayrollScheduleAssignment | null;
  futureCompensation: CompensationRecord[];
  requests: CompensationRecord[];
  compensationHistory: CompensationRecord[];
  assignmentRequests: PayrollScheduleAssignment[];
  assignmentHistory: PayrollScheduleAssignment[];
  auditEvents: PayrollAuditEvent[];
  activeSchedules: PayrollScheduleSummary[];
  suggestedNextEffectiveDate: string | null;
};

export type OwnCompensationDetail = {
  companyDate: string;
  currentCompensation: Pick<
    CompensationRecord,
    | "compensationType"
    | "monthlySalary"
    | "hourlyRate"
    | "currencyCode"
    | "standardHoursPerDay"
    | "standardHoursPerWeek"
    | "effectiveFrom"
  > | null;
  currentSchedule: Pick<
    PayrollScheduleAssignment,
    "payrollScheduleName" | "payrollScheduleType" | "effectiveFrom"
  > | null;
  nextPaymentDate: string | null;
};

export type PayrollApprovalCompensationItem = {
  kind: "compensation";
  id: string;
  employee: EmployeeIdentity;
  currentRecord: CompensationRecord | null;
  proposedRecord: CompensationRecord;
  affectedPeriodCount: number;
};

export type PayrollApprovalAssignmentItem = {
  kind: "schedule_assignment";
  id: string;
  employee: EmployeeIdentity;
  currentAssignment: PayrollScheduleAssignment | null;
  proposedAssignment: PayrollScheduleAssignment;
  affectedPeriodCount: number;
  midPeriodConflict: boolean;
};

export type PayrollApprovalQueue = {
  compensation: PayrollApprovalCompensationItem[];
  assignments: PayrollApprovalAssignmentItem[];
};

export type PayrollOverview = {
  role: "employee" | "hr_admin" | "super_admin";
  settings: PayrollSettings;
  activeScheduleCount: number;
  upcomingDraftPeriodCount: number;
  periodsRequiringReviewCount: number;
  pendingApprovalCount: number;
  employeesMissingCompensationCount: number;
  employeesMissingScheduleCount: number;
  backdatedWarningCount: number;
  recentlyReopenedCount: number;
  ownCompensation: OwnCompensationDetail | null;
  missingEmployees: EmployeeIdentity[];
};

export type PayrollBasisRuleInput = {
  name: string;
  annualDivisor: number;
  standardHoursPerDay: number;
  roundingMode: PayrollBasisRoundingMode;
  effectiveFrom: string;
  changeReason: string;
};

export type PayrollBasisRule = {
  id: string;
  name: string;
  annualDivisor: number;
  standardHoursPerDay: number;
  roundingMode: PayrollBasisRoundingMode;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PayrollRequestStatus;
  changeReason: string | null;
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollBasisPreset = {
  code: string;
  name: string;
  annualDivisor: number;
  standardHoursPerDay: number;
};

export type PayrollBasisRuleList = {
  rules: PayrollBasisRule[];
  presets: PayrollBasisPreset[];
};

export type PayrollCalculationRun = {
  id: string;
  payrollPeriodId: string;
  mode: string;
  status: PayrollCalculationRunStatus;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  eligibleEmployeeCount: number;
  calculatedCount: number;
  exceptionCount: number;
  excludedCount: number;
  staleCount: number;
  errorCode: string | null;
  safeErrorMessage: string | null;
  createdAt: string;
};

export type PayrollCalculationPeriod = {
  id: string;
  periodCode: string;
  periodStart: string;
  periodEnd: string;
  cutoffDate: string;
  paymentDate: string;
  status: PayrollPeriodStatus;
  version: number;
  requiresRecalculation: boolean;
  payrollScheduleId: string;
  scheduleName: string;
  scheduleCode: string;
  currencyCode: string;
};

export type PayrollReadiness = {
  ready: boolean;
  activeRunCount: number;
  blockingExceptionCount: number;
  staleEntryCount: number;
  missingEmployeeCount: number;
  missingPremiumEntryCount: number;
};

export type PayrollEmployeeEntry = {
  id: string;
  payrollPeriodId: string;
  employeeId: string;
  calculationRunId: string;
  versionNumber: number;
  previousEntryId: string | null;
  isCurrent: boolean;
  status: PayrollEmployeeEntryStatus;
  compensationType: CompensationType | null;
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  employmentStart: string | null;
  employmentEnd: string | null;
  eligibleStart: string | null;
  eligibleEnd: string | null;
  monthlySalary: number | null;
  hourlyRate: number | null;
  annualDivisor: number | null;
  standardHoursPerDay: number | null;
  standardHoursPerWeek: number | null;
  eligibleWorkdays: number;
  eligibleMinutes: number;
  payableMinutes: number;
  approvedOvertimeMinutes: number;
  regularEarningsRaw: number;
  regularEarningsRounded: number;
  absenceDeductionRaw: number;
  absenceDeductionRounded: number;
  lateDeductionRaw: number;
  lateDeductionRounded: number;
  undertimeDeductionRaw: number;
  undertimeDeductionRounded: number;
  overtimeInputAmount: number;
  paidLeaveAmount: number;
  unpaidLeaveDeduction: number;
  grossPayRaw: number;
  grossPayRounded: number;
  premiumEarningsRaw: number;
  premiumEarningsRounded: number;
  nightDifferentialRaw: number;
  nightDifferentialRounded: number;
  revisedGrossPayRaw: number;
  revisedGrossPayRounded: number;
  premiumCalculatedAt: string | null;
  isStale: boolean;
  staleReason: string | null;
  calculatedAt: string | null;
  createdAt: string;
  employee: EmployeeIdentity;
  openExceptionCount: number;
  blockingExceptionCount: number;
  activeExclusionId: string | null;
};

export type PayrollCalculationWorkspace = {
  period: PayrollCalculationPeriod;
  latestRun: PayrollCalculationRun | null;
  runs: PayrollCalculationRun[];
  entries: PayrollEmployeeEntry[];
  readiness: PayrollReadiness;
  summary: {
    entryCount: number;
    exceptionCount: number;
    staleCount: number;
    excludedCount: number;
    premiumEarnings: number;
    nightDifferential: number;
    revisedGrossPay: number;
    premiumPendingCount: number;
    premiumExceptionCount: number;
  };
};

export type PayrollDailyBreakdown = {
  id: string;
  workDate: string;
  employmentEligible: boolean;
  scheduledWorkday: boolean;
  scheduledMinutes: number;
  attendanceMinutes: number;
  paidLeaveMinutes: number;
  unpaidLeaveMinutes: number;
  absenceMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  approvedOvertimeMinutes: number;
  attendanceDeductionRuleId: string | null;
  lateGraceMinutes: number;
  lateDeductibleMinutes: number;
  undertimeGraceMinutes: number;
  undertimeDeductibleMinutes: number;
  dailyRateRaw: number;
  hourlyRateRaw: number;
  regularEarningsRaw: number;
  absenceDeductionRaw: number;
  lateDeductionRaw: number;
  undertimeDeductionRaw: number;
  unpaidLeaveDeductionRaw: number;
  calculationDetails: Record<string, unknown>;
};

export type PayrollInputSnapshot = {
  id: string;
  sourceType: PayrollSourceType;
  sourceTable: string;
  sourceRecordId: string | null;
  sourceUpdatedAt: string | null;
  effectiveDate: string | null;
  snapshotHash: string;
  snapshotData: Record<string, unknown>;
  createdAt: string;
};

export type PayrollEntryException = {
  id: string;
  payrollPeriodId: string;
  employeeId: string;
  employee: EmployeeIdentity;
  calculationRunId: string | null;
  payrollEmployeeEntryId: string | null;
  exceptionCode: string;
  severity: PayrollExceptionSeverity;
  message: string;
  sourceType: PayrollSourceType | null;
  sourceRecordId: string | null;
  status: PayrollExceptionStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type PayrollEmployeeCalculationDetail = {
  employee: EmployeeIdentity;
  currentEntry: PayrollEmployeeEntry | null;
  versions: PayrollEmployeeEntry[];
  dailyBreakdowns: PayrollDailyBreakdown[];
  snapshots: PayrollInputSnapshot[];
  exceptions: PayrollEntryException[];
  dayTypeResolutions: PayrollDayTypeResolution[];
  premiumLines: PayrollPremiumLine[];
  premiumEvents: PayrollPremiumEvent[];
};

export type PayrollCalculationRunInput = {
  payrollPeriodId: string;
  mode: "all" | "uncalculated" | "selected" | "recalculate";
  employeeIds: string[];
};

export type PayrollReasonActionInput = {
  id: string;
  reason: string;
};



export type PremiumRuleDayInput = {
  dayType: PremiumDayType;
  regularTimeMultiplier: number;
  overtimeMultiplier: number;
  additionalPremiumOnly: boolean;
  nightDifferentialPercentage: number;
  nightWindowStart: string;
  nightWindowEnd: string;
  overtimeRoundingMode: PremiumTimeRoundingMode;
  overtimeRoundingIncrementMinutes: number | null;
  nightRoundingMode: PremiumTimeRoundingMode;
  nightRoundingIncrementMinutes: number | null;
};

export type PremiumRuleSetInput = {
  name: string;
  scopeType: PremiumRuleScopeType;
  employmentType: string | null;
  departmentId: string | null;
  positionId: string | null;
  payrollGroupId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string;
  sourceAgency: string;
  sourceReference: string;
  sourcePublicationDate: string;
  sourceUrl: string;
  dayRules: PremiumRuleDayInput[];
};

export type PremiumRuleDay = PremiumRuleDayInput & {
  id: string;
  versionNumber: number;
};

export type PremiumRuleSet = {
  id: string;
  supersedesRuleSetId: string | null;
  name: string;
  scopeType: PremiumRuleScopeType;
  scopeLabel: string;
  employmentType: string | null;
  departmentId: string | null;
  positionId: string | null;
  payrollGroupId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PayrollRequestStatus;
  changeReason: string | null;
  version: number;
  sourceAgency: string;
  sourceReference: string;
  sourcePublicationDate: string;
  sourceUrl: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  dayRules: PremiumRuleDay[];
};

export type PremiumRulePreset = {
  code: string;
  name: string;
  countryCode: "PH";
  sourceAgency: string;
  sourceReference: string;
  sourcePublicationDate: string;
  sourceUrl: string;
  dayRules: PremiumRuleDayInput[];
};

export type PremiumRuleList = {
  rules: PremiumRuleSet[];
  presets: PremiumRulePreset[];
  departments: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string }>;
  payrollGroups: Array<{ id: string; code: string; name: string }>;
};

export type AttendanceDeductionRuleInput = {
  scopeType: PremiumRuleScopeType;
  employmentType: string | null;
  departmentId: string | null;
  positionId: string | null;
  payrollGroupId: string | null;
  lateGraceMinutes: number;
  undertimeGraceMinutes: number;
  lateRoundingMode: PremiumTimeRoundingMode;
  lateRoundingIncrementMinutes: number | null;
  undertimeRoundingMode: PremiumTimeRoundingMode;
  undertimeRoundingIncrementMinutes: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string;
};

export type AttendanceDeductionRule = AttendanceDeductionRuleInput & {
  id: string;
  supersedesRuleId: string | null;
  scopeLabel: string;
  status: PayrollRequestStatus;
  version: number;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PremiumCoveragePreview = {
  affectedEmployeeCount: number;
  affectedOpenPeriodCount: number;
  staleEntryCount: number;
  conflictingRuleIds: string[];
  missingDayTypes: PremiumDayType[];
};

export type PayrollDayTypeResolution = {
  id: string;
  workDate: string;
  baseDayType: PremiumDayType;
  isRestDay: boolean;
  holidayVersionId: string | null;
  holidayType: string | null;
  holidayCount: number;
  combinedDayType: PremiumDayType;
  resolutionSource: Record<string, unknown>;
  premiumRuleSetId: string;
  premiumRuleVersionId: string;
};

export type PayrollPremiumLine = {
  id: string;
  dailyBreakdownId: string;
  workDate: string;
  premiumType: PremiumType;
  dayType: PremiumDayType;
  premiumRuleSetId: string;
  premiumRuleVersionId: string;
  baseHourlyRateRaw: number;
  rawMinutes: number;
  roundedMinutes: number;
  dayMultiplier: number;
  overtimeMultiplier: number;
  nightPercentage: number;
  baseAmountRaw: number;
  premiumAmountRaw: number;
  premiumAmountRounded: number;
  isAdditionalOnly: boolean;
  calculationDetails: Record<string, unknown>;
  createdAt: string;
};

export type PayrollPremiumEvent = {
  id: string;
  eventType: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PremiumApprovalQueue = {
  premiumRules: PremiumRuleSet[];
  attendanceDeductionRules: AttendanceDeductionRule[];
};
