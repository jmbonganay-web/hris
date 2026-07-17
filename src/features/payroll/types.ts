import type {
  CompensationEventType,
  CompensationType,
  PayrollBusinessDayAdjustment,
  PayrollPeriodEventType,
  PayrollPeriodStatus,
  PayrollRequestStatus,
  PayrollScheduleType,
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
