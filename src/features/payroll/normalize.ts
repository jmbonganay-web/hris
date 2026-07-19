import {
  compensationEventTypeValues,
  compensationTypeValues,
  payrollBusinessDayAdjustmentValues,
  payrollPeriodEventTypeValues,
  payrollPeriodStatusValues,
  payrollRequestStatusValues,
  payrollScheduleTypeValues,
  payrollBasisRoundingModeValues,
  payrollCalculationRunStatusValues,
  payrollEmployeeEntryStatusValues,
  payrollExceptionSeverityValues,
  payrollExceptionStatusValues,
  payrollSourceTypeValues,
  premiumDayTypeValues,
  premiumRuleScopeTypeValues,
  premiumTimeRoundingModeValues,
  premiumTypeValues,
  type CompensationEventType,
  type CompensationType,
  type PayrollBusinessDayAdjustment,
  type PayrollPeriodEventType,
  type PayrollPeriodStatus,
  type PayrollRequestStatus,
  type PayrollScheduleType,
  type PayrollBasisRoundingMode,
  type PayrollCalculationRunStatus,
  type PayrollEmployeeEntryStatus,
  type PayrollExceptionSeverity,
  type PayrollExceptionStatus,
  type PayrollSourceType,
  type PremiumDayType,
  type PremiumRuleScopeType,
  type PremiumTimeRoundingMode,
  type PremiumType,
} from "./constants.ts";
import type {
  CompensationRecord,
  EmployeeCompensationAdminDetail,
  EmployeeIdentity,
  OwnCompensationDetail,
  PayrollApprovalAssignmentItem,
  PayrollApprovalCompensationItem,
  PayrollApprovalQueue,
  PayrollAuditEvent,
  PayrollOverview,
  PayrollPeriodDetail,
  PayrollPeriodListResult,
  PayrollPeriodPreview,
  PayrollPeriodSummary,
  PayrollScheduleAssignment,
  PayrollScheduleDetail,
  PayrollScheduleSummary,
  PayrollSettings,
  PayrollBasisRule,
  PayrollBasisRuleList,
  PayrollBasisPreset,
  PayrollCalculationRun,
  PayrollCalculationWorkspace,
  PayrollDailyBreakdown,
  PayrollEmployeeCalculationDetail,
  PayrollEmployeeEntry,
  PayrollEntryException,
  PayrollInputSnapshot,
  PayrollReadiness,
  AttendanceDeductionRule,
  PremiumApprovalQueue,
  PremiumCoveragePreview,
  PremiumRuleDay,
  PremiumRuleDayInput,
  PremiumRuleList,
  PremiumRulePreset,
  PremiumRuleSet,
  PayrollDayTypeResolution,
  PayrollPremiumEvent,
  PayrollPremiumLine,
} from "./types.ts";

const unavailable = () => new Error("Payroll data is unavailable.");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw unavailable();
  return value;
};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const booleanValue = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw unavailable();
  return value as T;
}

const scheduleType = (value: unknown): PayrollScheduleType =>
  enumValue(value, payrollScheduleTypeValues);
const periodStatus = (value: unknown): PayrollPeriodStatus =>
  enumValue(value, payrollPeriodStatusValues);
const compensationType = (value: unknown): CompensationType =>
  enumValue(value, compensationTypeValues);
const requestStatus = (value: unknown): PayrollRequestStatus =>
  enumValue(value, payrollRequestStatusValues);
const businessDayAdjustment = (value: unknown): PayrollBusinessDayAdjustment =>
  enumValue(value, payrollBusinessDayAdjustmentValues);

export function normalizePayrollSettings(value: unknown): PayrollSettings {
  const row = object(value);
  return {
    defaultCurrencyCode: text(row.default_currency_code, "PHP"),
    payrollTimezone: text(row.payroll_timezone, "Asia/Manila"),
    generationEnabled: booleanValue(row.generation_enabled, true),
    generationHorizonMonths: numberValue(row.generation_horizon_months, 12),
    version: numberValue(row.version, 1),
    updatedAt: text(row.updated_at),
  };
}

export function normalizeEmployeeIdentity(value: unknown): EmployeeIdentity {
  const row = object(value);
  return {
    id: text(row.id),
    employeeNumber: text(row.employee_number),
    fullName: text(row.full_name),
    workEmail: nullableText(row.work_email),
  };
}

export function normalizePayrollPeriodPreview(value: unknown): PayrollPeriodPreview {
  const row = object(value);
  return {
    periodCode: text(row.period_code),
    periodSequence: numberValue(row.period_sequence),
    periodStart: text(row.period_start),
    periodEnd: text(row.period_end),
    cutoffDate: text(row.cutoff_date),
    paymentDate: text(row.payment_date),
    originalCutoffDate: text(row.original_cutoff_date),
    originalPaymentDate: text(row.original_payment_date),
    cutoffAdjusted: booleanValue(row.cutoff_adjusted),
    paymentAdjusted: booleanValue(row.payment_adjusted),
  };
}

export function normalizePayrollScheduleSummary(value: unknown): PayrollScheduleSummary {
  const row = object(value);
  return {
    id: text(row.id),
    name: text(row.name),
    code: text(row.code),
    scheduleType: scheduleType(row.schedule_type),
    currencyCode: text(row.currency_code, "PHP"),
    timezone: text(row.timezone, "Asia/Manila"),
    anchorDate: nullableText(row.anchor_date),
    firstPeriodEndDay: nullableNumber(row.first_period_end_day),
    cutoffOffsetDays: numberValue(row.cutoff_offset_days),
    paymentOffsetDays: numberValue(row.payment_offset_days),
    businessDayAdjustment: businessDayAdjustment(row.business_day_adjustment ?? "previous"),
    isActive: booleanValue(row.is_active),
    version: numberValue(row.version, 1),
    assignedEmployeeCount: numberValue(row.assigned_employee_count),
    nextPeriod: row.next_period ? normalizePayrollPeriodPreview(row.next_period) : null,
  };
}

export function normalizePayrollScheduleDetail(value: unknown): PayrollScheduleDetail {
  const row = object(value);
  return {
    ...normalizePayrollScheduleSummary(row),
    upcomingPeriods: array(row.upcoming_periods).map(normalizePayrollPeriodPreview),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function normalizePayrollPeriodSummary(value: unknown): PayrollPeriodSummary {
  const row = object(value);
  return {
    ...normalizePayrollPeriodPreview(row),
    id: text(row.id),
    payrollScheduleId: text(row.payroll_schedule_id),
    scheduleName: text(row.schedule_name),
    scheduleCode: text(row.schedule_code),
    status: periodStatus(row.status),
    requiresRecalculation: booleanValue(row.requires_recalculation),
    version: numberValue(row.version, 1),
  };
}

export function normalizePayrollAuditEvent(value: unknown): PayrollAuditEvent {
  const row = object(value);
  const event = text(row.event_type);
  if (![...payrollPeriodEventTypeValues, ...compensationEventTypeValues].includes(event as PayrollPeriodEventType | CompensationEventType)) {
    throw unavailable();
  }
  return {
    id: text(row.id),
    eventType: event as PayrollPeriodEventType | CompensationEventType,
    fromStatus: nullableText(row.from_status),
    toStatus: nullableText(row.to_status),
    actorUserId: nullableText(row.actor_user_id),
    actorName: nullableText(row.actor_name),
    reason: nullableText(row.reason),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: text(row.created_at),
  };
}

export function normalizePayrollPeriodDetail(value: unknown): PayrollPeriodDetail {
  const row = object(value);
  return {
    ...normalizePayrollPeriodSummary(row),
    openedAt: nullableText(row.opened_at),
    submittedForReviewAt: nullableText(row.submitted_for_review_at),
    approvedAt: nullableText(row.approved_at),
    approvedBy: nullableText(row.approved_by),
    lockedAt: nullableText(row.locked_at),
    lockedBy: nullableText(row.locked_by),
    reopenedAt: nullableText(row.reopened_at),
    reopenedBy: nullableText(row.reopened_by),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    events: array(row.events).map(normalizePayrollAuditEvent),
  };
}

export function normalizeCompensationRecord(value: unknown): CompensationRecord {
  const row = object(value);
  return {
    id: text(row.id),
    employeeId: text(row.employee_id),
    compensationType: compensationType(row.compensation_type),
    monthlySalary: nullableNumber(row.monthly_salary),
    hourlyRate: nullableNumber(row.hourly_rate),
    currencyCode: text(row.currency_code, "PHP"),
    standardHoursPerDay: numberValue(row.standard_hours_per_day),
    standardHoursPerWeek: numberValue(row.standard_hours_per_week),
    effectiveFrom: text(row.effective_from),
    effectiveTo: nullableText(row.effective_to),
    status: requestStatus(row.status),
    changeReason: nullableText(row.change_reason),
    isBackdated: booleanValue(row.is_backdated),
    version: numberValue(row.version, 1),
    submittedAt: nullableText(row.submitted_at),
    approvedAt: nullableText(row.approved_at),
    rejectedAt: nullableText(row.rejected_at),
    rejectionReason: nullableText(row.rejection_reason),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function normalizePayrollScheduleAssignment(value: unknown): PayrollScheduleAssignment {
  const row = object(value);
  return {
    id: text(row.id),
    employeeId: text(row.employee_id),
    payrollScheduleId: text(row.payroll_schedule_id),
    payrollScheduleName: text(row.payroll_schedule_name),
    payrollScheduleType: scheduleType(row.payroll_schedule_type),
    effectiveFrom: text(row.effective_from),
    effectiveTo: nullableText(row.effective_to),
    status: requestStatus(row.status),
    changeReason: nullableText(row.change_reason),
    overrideMidPeriod: booleanValue(row.override_mid_period),
    overrideReason: nullableText(row.override_reason),
    version: numberValue(row.version, 1),
    submittedAt: nullableText(row.submitted_at),
    approvedAt: nullableText(row.approved_at),
    rejectedAt: nullableText(row.rejected_at),
    rejectionReason: nullableText(row.rejection_reason),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function normalizeOwnCompensation(value: unknown): OwnCompensationDetail {
  const row = object(value);
  const compensation = isRecord(row.current_compensation) ? row.current_compensation : null;
  const schedule = isRecord(row.current_schedule) ? row.current_schedule : null;
  return {
    companyDate: text(row.company_date),
    currentCompensation: compensation ? {
      compensationType: compensationType(compensation.compensation_type),
      monthlySalary: nullableNumber(compensation.monthly_salary),
      hourlyRate: nullableNumber(compensation.hourly_rate),
      currencyCode: text(compensation.currency_code, "PHP"),
      standardHoursPerDay: numberValue(compensation.standard_hours_per_day),
      standardHoursPerWeek: numberValue(compensation.standard_hours_per_week),
      effectiveFrom: text(compensation.effective_from),
    } : null,
    currentSchedule: schedule ? {
      payrollScheduleName: text(schedule.payroll_schedule_name),
      payrollScheduleType: scheduleType(schedule.payroll_schedule_type),
      effectiveFrom: text(schedule.effective_from),
    } : null,
    nextPaymentDate: nullableText(row.next_payment_date),
  };
}

export function normalizePayrollOverview(value: unknown): PayrollOverview {
  const row = object(value);
  const role = enumValue(row.role, ["employee", "hr_admin", "super_admin"] as const);
  return {
    role,
    settings: normalizePayrollSettings(row.settings),
    activeScheduleCount: numberValue(row.active_schedule_count),
    upcomingDraftPeriodCount: numberValue(row.upcoming_draft_period_count),
    periodsRequiringReviewCount: numberValue(row.periods_requiring_review_count),
    pendingApprovalCount: numberValue(row.pending_approval_count),
    employeesMissingCompensationCount: numberValue(row.employees_missing_compensation_count),
    employeesMissingScheduleCount: numberValue(row.employees_missing_schedule_count),
    backdatedWarningCount: numberValue(row.backdated_warning_count),
    recentlyReopenedCount: numberValue(row.recently_reopened_count),
    ownCompensation: row.own_compensation ? normalizeOwnCompensation(row.own_compensation) : null,
    missingEmployees: array(row.missing_employees).map(normalizeEmployeeIdentity),
  };
}

export function normalizePayrollPeriodList(value: unknown): PayrollPeriodListResult {
  const row = object(value);
  return {
    items: array(row.items).map(normalizePayrollPeriodSummary),
    total: numberValue(row.total),
    page: numberValue(row.page, 1),
    pageSize: numberValue(row.page_size, 25),
  };
}

export function normalizeEmployeeCompensationAdmin(value: unknown): EmployeeCompensationAdminDetail {
  const row = object(value);
  return {
    employee: normalizeEmployeeIdentity(row.employee),
    currencyCode: text(row.currency_code, "PHP"),
    companyDate: text(row.company_date),
    currentCompensation: row.current_compensation ? normalizeCompensationRecord(row.current_compensation) : null,
    currentAssignment: row.current_assignment ? normalizePayrollScheduleAssignment(row.current_assignment) : null,
    futureCompensation: array(row.future_compensation).map(normalizeCompensationRecord),
    requests: array(row.requests).map(normalizeCompensationRecord),
    compensationHistory: array(row.compensation_history).map(normalizeCompensationRecord),
    assignmentRequests: array(row.assignment_requests).map(normalizePayrollScheduleAssignment),
    assignmentHistory: array(row.assignment_history).map(normalizePayrollScheduleAssignment),
    auditEvents: array(row.audit_events).map(normalizePayrollAuditEvent),
    activeSchedules: array(row.active_schedules).map(normalizePayrollScheduleSummary),
    suggestedNextEffectiveDate: nullableText(row.suggested_next_effective_date),
  };
}

function normalizeCompensationApproval(value: unknown): PayrollApprovalCompensationItem {
  const row = object(value);
  if (row.kind !== "compensation") throw unavailable();
  return {
    kind: "compensation",
    id: text(row.id),
    employee: normalizeEmployeeIdentity(row.employee),
    currentRecord: row.current_record ? normalizeCompensationRecord(row.current_record) : null,
    proposedRecord: normalizeCompensationRecord(row.proposed_record),
    affectedPeriodCount: numberValue(row.affected_period_count),
  };
}

function normalizeAssignmentApproval(value: unknown): PayrollApprovalAssignmentItem {
  const row = object(value);
  if (row.kind !== "schedule_assignment") throw unavailable();
  return {
    kind: "schedule_assignment",
    id: text(row.id),
    employee: normalizeEmployeeIdentity(row.employee),
    currentAssignment: row.current_assignment ? normalizePayrollScheduleAssignment(row.current_assignment) : null,
    proposedAssignment: normalizePayrollScheduleAssignment(row.proposed_assignment),
    affectedPeriodCount: numberValue(row.affected_period_count),
    midPeriodConflict: booleanValue(row.mid_period_conflict),
  };
}

export function normalizePayrollApprovalQueue(value: unknown): PayrollApprovalQueue {
  const row = object(value);
  return {
    compensation: array(row.compensation).map(normalizeCompensationApproval),
    assignments: array(row.assignments).map(normalizeAssignmentApproval),
  };
}

const basisRoundingMode = (value: unknown): PayrollBasisRoundingMode =>
  enumValue(value, payrollBasisRoundingModeValues);
const calculationRunStatus = (value: unknown): PayrollCalculationRunStatus =>
  enumValue(value, payrollCalculationRunStatusValues);
const employeeEntryStatus = (value: unknown): PayrollEmployeeEntryStatus =>
  enumValue(value, payrollEmployeeEntryStatusValues);
const exceptionSeverity = (value: unknown): PayrollExceptionSeverity =>
  enumValue(value, payrollExceptionSeverityValues);
const exceptionStatus = (value: unknown): PayrollExceptionStatus =>
  enumValue(value, payrollExceptionStatusValues);
const sourceType = (value: unknown): PayrollSourceType =>
  enumValue(value, payrollSourceTypeValues);
const premiumRuleScopeType = (value: unknown): PremiumRuleScopeType =>
  enumValue(value, premiumRuleScopeTypeValues);
const premiumDayType = (value: unknown): PremiumDayType =>
  enumValue(value, premiumDayTypeValues);
const premiumTimeRoundingMode = (value: unknown): PremiumTimeRoundingMode =>
  enumValue(value, premiumTimeRoundingModeValues);
const premiumType = (value: unknown): PremiumType =>
  enumValue(value, premiumTypeValues);

function normalizePayrollBasisRule(value: unknown): PayrollBasisRule {
  const row = object(value);
  return {
    id: text(row.id),
    name: text(row.name),
    annualDivisor: numberValue(row.annual_divisor),
    standardHoursPerDay: numberValue(row.standard_hours_per_day),
    roundingMode: basisRoundingMode(row.rounding_mode),
    effectiveFrom: text(row.effective_from),
    effectiveTo: nullableText(row.effective_to),
    status: requestStatus(row.status),
    changeReason: nullableText(row.change_reason),
    version: numberValue(row.version, 1),
    submittedAt: nullableText(row.submitted_at),
    approvedAt: nullableText(row.approved_at),
    rejectedAt: nullableText(row.rejected_at),
    rejectionReason: nullableText(row.rejection_reason),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function normalizePayrollBasisPreset(value: unknown): PayrollBasisPreset {
  const row = object(value);
  return {
    code: text(row.code),
    name: text(row.name),
    annualDivisor: numberValue(row.annual_divisor),
    standardHoursPerDay: numberValue(row.standard_hours_per_day),
  };
}

export function normalizePayrollBasisRuleList(value: unknown): PayrollBasisRuleList {
  const row = object(value);
  return {
    rules: array(row.rules).map(normalizePayrollBasisRule),
    presets: array(row.presets).map(normalizePayrollBasisPreset),
  };
}

function normalizePayrollCalculationRun(value: unknown): PayrollCalculationRun {
  const row = object(value);
  return {
    id: text(row.id),
    payrollPeriodId: text(row.payroll_period_id),
    mode: text(row.mode, "all"),
    status: calculationRunStatus(row.status),
    startedBy: nullableText(row.started_by),
    startedAt: nullableText(row.started_at),
    completedAt: nullableText(row.completed_at),
    eligibleEmployeeCount: numberValue(row.eligible_employee_count),
    calculatedCount: numberValue(row.calculated_count),
    exceptionCount: numberValue(row.exception_count),
    excludedCount: numberValue(row.excluded_count),
    staleCount: numberValue(row.stale_count),
    errorCode: nullableText(row.error_code),
    safeErrorMessage: nullableText(row.safe_error_message),
    createdAt: text(row.created_at),
  };
}

function normalizePayrollReadiness(value: unknown): PayrollReadiness {
  const row = object(value);
  return {
    ready: booleanValue(row.ready),
    activeRunCount: numberValue(row.activeRunCount ?? row.active_run_count),
    blockingExceptionCount: numberValue(row.blockingExceptionCount ?? row.blocking_exception_count),
    staleEntryCount: numberValue(row.staleEntryCount ?? row.stale_entry_count),
    missingEmployeeCount: numberValue(row.missingEmployeeCount ?? row.missing_employee_count),
    missingPremiumEntryCount: numberValue(row.missingPremiumEntryCount ?? row.missing_premium_entry_count),
  };
}

export function normalizePayrollEmployeeEntry(value: unknown): PayrollEmployeeEntry {
  const row = object(value);
  const rawCompensationType = nullableText(row.compensation_type);
  return {
    id: text(row.id),
    payrollPeriodId: text(row.payroll_period_id),
    employeeId: text(row.employee_id),
    calculationRunId: text(row.calculation_run_id),
    versionNumber: numberValue(row.version_number, 1),
    previousEntryId: nullableText(row.previous_entry_id),
    isCurrent: booleanValue(row.is_current),
    status: employeeEntryStatus(row.status),
    compensationType: rawCompensationType ? compensationType(rawCompensationType) : null,
    currencyCode: text(row.currency_code, "PHP"),
    periodStart: text(row.period_start),
    periodEnd: text(row.period_end),
    employmentStart: nullableText(row.employment_start),
    employmentEnd: nullableText(row.employment_end),
    eligibleStart: nullableText(row.eligible_start),
    eligibleEnd: nullableText(row.eligible_end),
    monthlySalary: nullableNumber(row.monthly_salary),
    hourlyRate: nullableNumber(row.hourly_rate),
    annualDivisor: nullableNumber(row.annual_divisor),
    standardHoursPerDay: nullableNumber(row.standard_hours_per_day),
    standardHoursPerWeek: nullableNumber(row.standard_hours_per_week),
    eligibleWorkdays: numberValue(row.eligible_workdays),
    eligibleMinutes: numberValue(row.eligible_minutes),
    payableMinutes: numberValue(row.payable_minutes),
    approvedOvertimeMinutes: numberValue(row.approved_overtime_minutes),
    regularEarningsRaw: numberValue(row.regular_earnings_raw),
    regularEarningsRounded: numberValue(row.regular_earnings_rounded),
    absenceDeductionRaw: numberValue(row.absence_deduction_raw),
    absenceDeductionRounded: numberValue(row.absence_deduction_rounded),
    lateDeductionRaw: numberValue(row.late_deduction_raw),
    lateDeductionRounded: numberValue(row.late_deduction_rounded),
    undertimeDeductionRaw: numberValue(row.undertime_deduction_raw),
    undertimeDeductionRounded: numberValue(row.undertime_deduction_rounded),
    overtimeInputAmount: numberValue(row.overtime_input_amount),
    paidLeaveAmount: numberValue(row.paid_leave_amount),
    unpaidLeaveDeduction: numberValue(row.unpaid_leave_deduction),
    grossPayRaw: numberValue(row.gross_pay_raw),
    grossPayRounded: numberValue(row.gross_pay_rounded),
    premiumEarningsRaw: numberValue(row.premium_earnings_raw),
    premiumEarningsRounded: numberValue(row.premium_earnings_rounded),
    nightDifferentialRaw: numberValue(row.night_differential_raw),
    nightDifferentialRounded: numberValue(row.night_differential_rounded),
    revisedGrossPayRaw: numberValue(row.revised_gross_pay_raw, numberValue(row.gross_pay_raw)),
    revisedGrossPayRounded: numberValue(row.revised_gross_pay_rounded, numberValue(row.gross_pay_rounded)),
    premiumCalculatedAt: nullableText(row.premium_calculated_at),
    isStale: booleanValue(row.is_stale),
    staleReason: nullableText(row.stale_reason),
    calculatedAt: nullableText(row.calculated_at),
    createdAt: text(row.created_at),
    employee: row.employee ? normalizeEmployeeIdentity(row.employee) : {
      id: text(row.employee_id),
      employeeNumber: "",
      fullName: "",
      workEmail: null,
    },
    openExceptionCount: numberValue(row.open_exception_count),
    blockingExceptionCount: numberValue(row.blocking_exception_count),
    activeExclusionId: nullableText(row.active_exclusion_id),
  };
}

export function normalizePayrollCalculationWorkspace(value: unknown): PayrollCalculationWorkspace {
  const row = object(value);
  const period = object(row.period);
  const summary = object(row.summary);
  return {
    period: {
      id: text(period.id),
      periodCode: text(period.period_code),
      periodStart: text(period.period_start),
      periodEnd: text(period.period_end),
      cutoffDate: text(period.cutoff_date),
      paymentDate: text(period.payment_date),
      status: periodStatus(period.status),
      version: numberValue(period.version, 1),
      requiresRecalculation: booleanValue(period.requires_recalculation),
      payrollScheduleId: text(period.payroll_schedule_id),
      scheduleName: text(period.schedule_name),
      scheduleCode: text(period.schedule_code),
      currencyCode: text(period.currency_code, "PHP"),
    },
    latestRun: row.latest_run ? normalizePayrollCalculationRun(row.latest_run) : null,
    runs: array(row.runs).map(normalizePayrollCalculationRun),
    entries: array(row.entries).map(normalizePayrollEmployeeEntry),
    readiness: normalizePayrollReadiness(row.readiness),
    summary: {
      entryCount: numberValue(summary.entry_count),
      exceptionCount: numberValue(summary.exception_count),
      staleCount: numberValue(summary.stale_count),
      excludedCount: numberValue(summary.excluded_count),
      premiumEarnings: numberValue(summary.premium_earnings),
      nightDifferential: numberValue(summary.night_differential),
      revisedGrossPay: numberValue(summary.revised_gross_pay),
      premiumPendingCount: numberValue(summary.premium_pending_count),
      premiumExceptionCount: numberValue(summary.premium_exception_count),
    },
  };
}

function normalizePayrollDailyBreakdown(value: unknown): PayrollDailyBreakdown {
  const row = object(value);
  return {
    id: text(row.id),
    workDate: text(row.work_date),
    employmentEligible: booleanValue(row.employment_eligible),
    scheduledWorkday: booleanValue(row.scheduled_workday),
    scheduledMinutes: numberValue(row.scheduled_minutes),
    attendanceMinutes: numberValue(row.attendance_minutes),
    paidLeaveMinutes: numberValue(row.paid_leave_minutes),
    unpaidLeaveMinutes: numberValue(row.unpaid_leave_minutes),
    absenceMinutes: numberValue(row.absence_minutes),
    lateMinutes: numberValue(row.late_minutes),
    undertimeMinutes: numberValue(row.undertime_minutes),
    approvedOvertimeMinutes: numberValue(row.approved_overtime_minutes),
    attendanceDeductionRuleId: nullableText(row.attendance_deduction_rule_id),
    lateGraceMinutes: numberValue(row.late_grace_minutes),
    lateDeductibleMinutes: numberValue(row.late_deductible_minutes, numberValue(row.late_minutes)),
    undertimeGraceMinutes: numberValue(row.undertime_grace_minutes),
    undertimeDeductibleMinutes: numberValue(row.undertime_deductible_minutes, numberValue(row.undertime_minutes)),
    dailyRateRaw: numberValue(row.daily_rate_raw),
    hourlyRateRaw: numberValue(row.hourly_rate_raw),
    regularEarningsRaw: numberValue(row.regular_earnings_raw),
    absenceDeductionRaw: numberValue(row.absence_deduction_raw),
    lateDeductionRaw: numberValue(row.late_deduction_raw),
    undertimeDeductionRaw: numberValue(row.undertime_deduction_raw),
    unpaidLeaveDeductionRaw: numberValue(row.unpaid_leave_deduction_raw),
    calculationDetails: isRecord(row.calculation_details) ? row.calculation_details : {},
  };
}

function normalizePayrollInputSnapshot(value: unknown): PayrollInputSnapshot {
  const row = object(value);
  return {
    id: text(row.id),
    sourceType: sourceType(row.source_type),
    sourceTable: text(row.source_table),
    sourceRecordId: nullableText(row.source_record_id),
    sourceUpdatedAt: nullableText(row.source_updated_at),
    effectiveDate: nullableText(row.effective_date),
    snapshotHash: text(row.snapshot_hash),
    snapshotData: isRecord(row.snapshot_data) ? row.snapshot_data : {},
    createdAt: text(row.created_at),
  };
}

function normalizePayrollEntryException(value: unknown): PayrollEntryException {
  const row = object(value);
  const rawSourceType = nullableText(row.source_type);
  return {
    id: text(row.id),
    payrollPeriodId: text(row.payroll_period_id),
    employeeId: text(row.employee_id),
    employee: row.employee ? normalizeEmployeeIdentity(row.employee) : {
      id: text(row.employee_id),
      employeeNumber: "",
      fullName: "",
      workEmail: null,
    },
    calculationRunId: nullableText(row.calculation_run_id),
    payrollEmployeeEntryId: nullableText(row.payroll_employee_entry_id),
    exceptionCode: text(row.exception_code),
    severity: exceptionSeverity(row.severity),
    message: text(row.message),
    sourceType: rawSourceType ? sourceType(rawSourceType) : null,
    sourceRecordId: nullableText(row.source_record_id),
    status: exceptionStatus(row.status),
    resolutionNote: nullableText(row.resolution_note),
    resolvedAt: nullableText(row.resolved_at),
    createdAt: text(row.created_at),
  };
}

export function normalizePayrollExceptionList(value: unknown): PayrollEntryException[] {
  const row = object(value);
  return array(row.items).map(normalizePayrollEntryException);
}

export function normalizePayrollEmployeeCalculationDetail(value: unknown): PayrollEmployeeCalculationDetail {
  const row = object(value);
  const employee = normalizeEmployeeIdentity(row.employee);
  const attachEmployee = (entry: PayrollEmployeeEntry): PayrollEmployeeEntry => ({ ...entry, employee });
  return {
    employee,
    currentEntry: row.current_entry ? attachEmployee(normalizePayrollEmployeeEntry(row.current_entry)) : null,
    versions: array(row.versions).map(normalizePayrollEmployeeEntry).map(attachEmployee),
    dailyBreakdowns: array(row.daily_breakdowns).map(normalizePayrollDailyBreakdown),
    snapshots: array(row.snapshots).map(normalizePayrollInputSnapshot),
    exceptions: array(row.exceptions).map((item) => ({ ...normalizePayrollEntryException({ ...object(item), employee }), employee })),
    dayTypeResolutions: array(row.day_type_resolutions).map(normalizePayrollDayTypeResolution),
    premiumLines: array(row.premium_lines).map(normalizePayrollPremiumLine),
    premiumEvents: array(row.premium_events).map(normalizePayrollPremiumEvent),
  };
}



function normalizePremiumRuleDayInput(value: unknown): PremiumRuleDayInput {
  const row = object(value);
  return {
    dayType: premiumDayType(row.day_type ?? row.dayType),
    regularTimeMultiplier: numberValue(row.regular_time_multiplier ?? row.regularTimeMultiplier),
    overtimeMultiplier: numberValue(row.overtime_multiplier ?? row.overtimeMultiplier),
    additionalPremiumOnly: booleanValue(row.additional_premium_only ?? row.additionalPremiumOnly),
    nightDifferentialPercentage: numberValue(row.night_differential_percentage ?? row.nightDifferentialPercentage),
    nightWindowStart: text(row.night_window_start ?? row.nightWindowStart),
    nightWindowEnd: text(row.night_window_end ?? row.nightWindowEnd),
    overtimeRoundingMode: premiumTimeRoundingMode(row.overtime_rounding_mode ?? row.overtimeRoundingMode),
    overtimeRoundingIncrementMinutes: nullableNumber(row.overtime_rounding_increment_minutes ?? row.overtimeRoundingIncrementMinutes),
    nightRoundingMode: premiumTimeRoundingMode(row.night_rounding_mode ?? row.nightRoundingMode),
    nightRoundingIncrementMinutes: nullableNumber(row.night_rounding_increment_minutes ?? row.nightRoundingIncrementMinutes),
  };
}

function normalizePremiumRuleDay(value: unknown): PremiumRuleDay {
  const row = object(value);
  return {
    ...normalizePremiumRuleDayInput(row),
    id: text(row.id),
    versionNumber: numberValue(row.version_number ?? row.versionNumber, 1),
  };
}

function normalizePremiumRuleSetItem(value: unknown): PremiumRuleSet {
  const row = object(value);
  return {
    id: text(row.id),
    supersedesRuleSetId: nullableText(row.supersedes_rule_set_id ?? row.supersedesRuleSetId),
    name: text(row.name),
    scopeType: premiumRuleScopeType(row.scope_type ?? row.scopeType),
    scopeLabel: text(row.scope_label ?? row.scopeLabel),
    employmentType: nullableText(row.employment_type ?? row.employmentType),
    departmentId: nullableText(row.department_id ?? row.departmentId),
    positionId: nullableText(row.position_id ?? row.positionId),
    payrollGroupId: nullableText(row.payroll_group_id ?? row.payrollGroupId),
    effectiveFrom: text(row.effective_from ?? row.effectiveFrom),
    effectiveTo: nullableText(row.effective_to ?? row.effectiveTo),
    status: requestStatus(row.status),
    changeReason: nullableText(row.change_reason ?? row.changeReason),
    version: numberValue(row.version, 1),
    sourceAgency: text(row.source_agency ?? row.sourceAgency),
    sourceReference: text(row.source_reference ?? row.sourceReference),
    sourcePublicationDate: text(row.source_publication_date ?? row.sourcePublicationDate),
    sourceUrl: text(row.source_url ?? row.sourceUrl),
    submittedAt: nullableText(row.submitted_at ?? row.submittedAt),
    approvedAt: nullableText(row.approved_at ?? row.approvedAt),
    rejectedAt: nullableText(row.rejected_at ?? row.rejectedAt),
    rejectionReason: nullableText(row.rejection_reason ?? row.rejectionReason),
    createdAt: text(row.created_at ?? row.createdAt),
    updatedAt: text(row.updated_at ?? row.updatedAt),
    dayRules: array(row.day_rules ?? row.dayRules).map(normalizePremiumRuleDay),
  };
}

function normalizePremiumRulePresetItem(value: unknown): PremiumRulePreset {
  const row = object(value);
  return {
    code: text(row.code),
    name: text(row.name),
    countryCode: text(row.country_code ?? row.countryCode, "PH") === "PH" ? "PH" : "PH",
    sourceAgency: text(row.source_agency ?? row.sourceAgency),
    sourceReference: text(row.source_reference ?? row.sourceReference),
    sourcePublicationDate: text(row.source_publication_date ?? row.sourcePublicationDate),
    sourceUrl: text(row.source_url ?? row.sourceUrl),
    dayRules: array(row.day_rules ?? row.dayRules).map(normalizePremiumRuleDayInput),
  };
}

export function normalizePremiumRuleList(value: unknown): PremiumRuleList {
  const row = object(value);
  return {
    rules: array(row.rules).map(normalizePremiumRuleSetItem),
    presets: array(row.presets).map(normalizePremiumRulePresetItem),
    departments: array(row.departments).map((item) => {
      const entry = object(item);
      return { id: text(entry.id), name: text(entry.name) };
    }),
    positions: array(row.positions).map((item) => {
      const entry = object(item);
      return { id: text(entry.id), name: text(entry.name ?? entry.title) };
    }),
    payrollGroups: array(row.payroll_groups ?? row.payrollGroups).map((item) => {
      const entry = object(item);
      return { id: text(entry.id), code: text(entry.code), name: text(entry.name) };
    }),
  };
}

export function normalizePremiumRuleSet(value: unknown): PremiumRuleSet | null {
  return value === null || value === undefined ? null : normalizePremiumRuleSetItem(value);
}

function normalizeAttendanceDeductionRuleItem(value: unknown): AttendanceDeductionRule {
  const row = object(value);
  return {
    id: text(row.id),
    supersedesRuleId: nullableText(row.supersedes_rule_id ?? row.supersedesRuleId),
    scopeType: premiumRuleScopeType(row.scope_type ?? row.scopeType),
    scopeLabel: text(row.scope_label ?? row.scopeLabel),
    employmentType: nullableText(row.employment_type ?? row.employmentType),
    departmentId: nullableText(row.department_id ?? row.departmentId),
    positionId: nullableText(row.position_id ?? row.positionId),
    payrollGroupId: nullableText(row.payroll_group_id ?? row.payrollGroupId),
    lateGraceMinutes: numberValue(row.late_grace_minutes ?? row.lateGraceMinutes),
    undertimeGraceMinutes: numberValue(row.undertime_grace_minutes ?? row.undertimeGraceMinutes),
    lateRoundingMode: premiumTimeRoundingMode(row.late_rounding_mode ?? row.lateRoundingMode),
    lateRoundingIncrementMinutes: nullableNumber(row.late_rounding_increment_minutes ?? row.lateRoundingIncrementMinutes),
    undertimeRoundingMode: premiumTimeRoundingMode(row.undertime_rounding_mode ?? row.undertimeRoundingMode),
    undertimeRoundingIncrementMinutes: nullableNumber(row.undertime_rounding_increment_minutes ?? row.undertimeRoundingIncrementMinutes),
    effectiveFrom: text(row.effective_from ?? row.effectiveFrom),
    effectiveTo: nullableText(row.effective_to ?? row.effectiveTo),
    changeReason: text(row.change_reason ?? row.changeReason),
    status: requestStatus(row.status),
    version: numberValue(row.version, 1),
    submittedAt: nullableText(row.submitted_at ?? row.submittedAt),
    approvedAt: nullableText(row.approved_at ?? row.approvedAt),
    rejectedAt: nullableText(row.rejected_at ?? row.rejectedAt),
    rejectionReason: nullableText(row.rejection_reason ?? row.rejectionReason),
    createdAt: text(row.created_at ?? row.createdAt),
    updatedAt: text(row.updated_at ?? row.updatedAt),
  };
}

export function normalizeAttendanceDeductionRuleList(value: unknown): AttendanceDeductionRule[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(normalizeAttendanceDeductionRuleItem);
  const row = object(value);
  return array(row.rules ?? row.items).map(normalizeAttendanceDeductionRuleItem);
}

export function normalizePremiumApprovalQueue(value: unknown): PremiumApprovalQueue {
  const row = object(value);
  return {
    premiumRules: array(row.premium_rules ?? row.premiumRules).map(normalizePremiumRuleSetItem),
    attendanceDeductionRules: array(row.attendance_deduction_rules ?? row.attendanceDeductionRules).map(normalizeAttendanceDeductionRuleItem),
  };
}

export function normalizePremiumCoveragePreview(value: unknown): PremiumCoveragePreview {
  const row = object(value);
  return {
    affectedEmployeeCount: numberValue(row.affected_employee_count ?? row.affectedEmployeeCount),
    affectedOpenPeriodCount: numberValue(row.affected_open_period_count ?? row.affectedOpenPeriodCount),
    staleEntryCount: numberValue(row.stale_entry_count ?? row.staleEntryCount),
    conflictingRuleIds: array(row.conflicting_rule_ids ?? row.conflictingRuleIds).map((item) => text(item)).filter(Boolean),
    missingDayTypes: array(row.missing_day_types ?? row.missingDayTypes).map(premiumDayType),
  };
}

function normalizePayrollDayTypeResolution(value: unknown): PayrollDayTypeResolution {
  const row = object(value);
  return {
    id: text(row.id),
    workDate: text(row.work_date ?? row.workDate),
    baseDayType: premiumDayType(row.base_day_type ?? row.baseDayType),
    isRestDay: booleanValue(row.is_rest_day ?? row.isRestDay),
    holidayVersionId: nullableText(row.holiday_version_id ?? row.holidayVersionId),
    holidayType: nullableText(row.holiday_type ?? row.holidayType),
    holidayCount: numberValue(row.holiday_count ?? row.holidayCount, 1),
    combinedDayType: premiumDayType(row.combined_day_type ?? row.combinedDayType),
    resolutionSource: isRecord(row.resolution_source ?? row.resolutionSource) ? (row.resolution_source ?? row.resolutionSource) as Record<string, unknown> : {},
    premiumRuleSetId: text(row.premium_rule_set_id ?? row.premiumRuleSetId),
    premiumRuleVersionId: text(row.premium_rule_version_id ?? row.premiumRuleVersionId),
  };
}

function normalizePayrollPremiumLine(value: unknown): PayrollPremiumLine {
  const row = object(value);
  return {
    id: text(row.id),
    dailyBreakdownId: text(row.payroll_entry_daily_breakdown_id ?? row.daily_breakdown_id ?? row.dailyBreakdownId),
    workDate: text(row.work_date ?? row.workDate),
    premiumType: premiumType(row.premium_type ?? row.premiumType),
    dayType: premiumDayType(row.day_type ?? row.dayType),
    premiumRuleSetId: text(row.premium_rule_set_id ?? row.premiumRuleSetId),
    premiumRuleVersionId: text(row.premium_rule_version_id ?? row.premiumRuleVersionId),
    baseHourlyRateRaw: numberValue(row.base_hourly_rate_raw ?? row.baseHourlyRateRaw),
    rawMinutes: numberValue(row.raw_minutes ?? row.rawMinutes),
    roundedMinutes: numberValue(row.rounded_minutes ?? row.roundedMinutes),
    dayMultiplier: numberValue(row.day_multiplier ?? row.dayMultiplier),
    overtimeMultiplier: numberValue(row.overtime_multiplier ?? row.overtimeMultiplier),
    nightPercentage: numberValue(row.night_percentage ?? row.nightPercentage),
    baseAmountRaw: numberValue(row.base_amount_raw ?? row.baseAmountRaw),
    premiumAmountRaw: numberValue(row.premium_amount_raw ?? row.premiumAmountRaw),
    premiumAmountRounded: numberValue(row.premium_amount_rounded ?? row.premiumAmountRounded),
    isAdditionalOnly: booleanValue(row.is_additional_only ?? row.isAdditionalOnly),
    calculationDetails: isRecord(row.calculation_details ?? row.calculationDetails) ? (row.calculation_details ?? row.calculationDetails) as Record<string, unknown> : {},
    createdAt: text(row.created_at ?? row.createdAt),
  };
}

function normalizePayrollPremiumEvent(value: unknown): PayrollPremiumEvent {
  const row = object(value);
  return {
    id: text(row.id),
    eventType: text(row.event_type ?? row.eventType),
    reason: nullableText(row.reason),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: text(row.created_at ?? row.createdAt),
  };
}
