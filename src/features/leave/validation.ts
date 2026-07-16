import {
  leaveDurationModes,
  type LeaveActionState,
  type LeaveDurationMode,
  type LeaveReviewInput,
} from "./types.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
function checked(formData: FormData, key: string) {
  return ["true", "on", "1"].includes(text(formData, key));
}
function halfIncrement(value: number) {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value * 2);
}
function invalid(fieldErrors: Record<string, string>, values: Record<string, string> = {}) {
  return { data: undefined, state: { error: "Please correct the highlighted fields.", fieldErrors, values } satisfies LeaveActionState };
}

export function validateLeaveTypeVersion(formData: FormData, companyDate: string) {
  const leaveTypeId = text(formData, "leave_type_id") || null;
  const code = text(formData, "code").toUpperCase();
  const effectiveFrom = text(formData, "effective_from");
  const name = text(formData, "name");
  const description = text(formData, "description") || null;
  const isActive = checked(formData, "is_active");
  const isPaid = checked(formData, "is_paid");
  const isBalanceTracked = checked(formData, "is_balance_tracked");
  const defaultUnitsText = text(formData, "default_annual_units") || "0";
  const defaultAnnualUnits = Number(defaultUnitsText);
  const carryoverEnabled = checked(formData, "carryover_enabled");
  const capText = text(formData, "carryover_cap_units");
  const carryoverCapUnits = capText ? Number(capText) : null;
  const employeeNoteRequired = checked(formData, "employee_note_required");
  const documentRequired = checked(formData, "document_required");
  const thresholdText = text(formData, "document_required_min_units");
  const documentRequiredMinUnits = thresholdText ? Number(thresholdText) : null;
  const changeReason = text(formData, "change_reason") || null;
  const fieldErrors: Record<string, string> = {};

  if (leaveTypeId && !uuidPattern.test(leaveTypeId)) fieldErrors.leave_type_id = "Invalid leave type.";
  if (!leaveTypeId && !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) fieldErrors.code = "Code is required and may contain letters, numbers, and hyphens.";
  if (!datePattern.test(effectiveFrom)) fieldErrors.effective_from = "Effective date is required.";
  if (!name) fieldErrors.name = "Name is required.";
  else if (name.length > 100) fieldErrors.name = "Name must be 100 characters or fewer.";
  if (description && description.length > 1000) fieldErrors.description = "Description must be 1,000 characters or fewer.";
  if (!halfIncrement(defaultAnnualUnits)) fieldErrors.default_annual_units = "Annual units must use 0.5-day increments.";
  if (isPaid && !isBalanceTracked) fieldErrors.is_balance_tracked = "Paid leave must track a balance.";
  if (!isBalanceTracked && defaultAnnualUnits !== 0) fieldErrors.default_annual_units = "Balance-exempt leave must use 0 annual units.";
  if (!isBalanceTracked && carryoverEnabled) fieldErrors.carryover_enabled = "Balance-exempt leave cannot carry over units.";
  if (carryoverCapUnits !== null && (!halfIncrement(carryoverCapUnits) || carryoverCapUnits <= 0)) fieldErrors.carryover_cap_units = "Carryover cap must be a positive 0.5-day increment.";
  if (!carryoverEnabled && carryoverCapUnits !== null) fieldErrors.carryover_cap_units = "Enable carryover before setting a cap.";
  if (documentRequiredMinUnits !== null && (!documentRequired || !halfIncrement(documentRequiredMinUnits) || documentRequiredMinUnits <= 0)) fieldErrors.document_required_min_units = "Document threshold requires documents and a positive 0.5-day increment.";
  if (effectiveFrom && effectiveFrom <= companyDate && !changeReason && leaveTypeId) fieldErrors.change_reason = "A reason is required for a current or backdated version.";
  if (changeReason && changeReason.length > 1000) fieldErrors.change_reason = "Reason must be 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, {
    effective_from: effectiveFrom,
    name,
    description: description ?? "",
    default_annual_units: defaultUnitsText,
    carryover_cap_units: capText,
    document_required_min_units: thresholdText,
  });

  return { state: undefined, data: {
    leaveTypeId,
    code,
    effectiveFrom,
    name,
    description,
    isActive,
    isPaid,
    isBalanceTracked,
    defaultAnnualUnits,
    carryoverEnabled,
    carryoverCapUnits,
    employeeNoteRequired,
    documentRequired,
    documentRequiredMinUnits,
    changeReason,
  } };
}

export function validateLeaveDraft(formData: FormData) {
  const employeeId = text(formData, "employee_id");
  const leaveTypeId = text(formData, "leave_type_id");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const durationMode = text(formData, "duration_mode") as LeaveDurationMode;
  const employeeNote = text(formData, "employee_note") || null;
  const replacesRequestGroupId = text(formData, "replaces_request_group_id") || null;
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(employeeId)) fieldErrors.employee_id = "Select a valid employee.";
  if (!uuidPattern.test(leaveTypeId)) fieldErrors.leave_type_id = "Select a valid leave type.";
  if (!datePattern.test(startDate)) fieldErrors.start_date = "Start date is required.";
  if (!datePattern.test(endDate)) fieldErrors.end_date = "End date is required.";
  else if (startDate && endDate < startDate) fieldErrors.end_date = "End date must be on or after the start date.";
  else if (startDate.slice(0, 4) !== endDate.slice(0, 4)) fieldErrors.end_date = "A request cannot cross calendar years.";
  if (!leaveDurationModes.includes(durationMode)) fieldErrors.duration_mode = "Choose full day, first half, or second half.";
  else if (durationMode !== "full_day" && startDate !== endDate) fieldErrors.duration_mode = "Half-day leave must use one calendar date.";
  if (employeeNote && employeeNote.length > 1000) fieldErrors.employee_note = "Note must be 1,000 characters or fewer.";
  if (replacesRequestGroupId && !uuidPattern.test(replacesRequestGroupId)) fieldErrors.replaces_request_group_id = "Invalid replacement request.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    duration_mode: durationMode,
  });
  return { state: undefined, data: { employeeId, leaveTypeId, startDate, endDate, durationMode, employeeNote, replacesRequestGroupId } };
}

export function validateLeaveReview(formData: FormData): { data?: LeaveReviewInput; state?: LeaveActionState } {
  const requestGroupId = text(formData, "request_group_id");
  const expectedRequestRevisionId = text(formData, "expected_request_revision_id");
  const expectedStatus = text(formData, "expected_status");
  const expectedDayFingerprint = text(formData, "expected_day_fingerprint");
  const unitsText = text(formData, "expected_chargeable_units");
  const expectedChargeableUnits = Number(unitsText);
  const decision = text(formData, "decision");
  const reviewText = text(formData, "review_text") || null;
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(requestGroupId)) fieldErrors.request_group_id = "Invalid leave request.";
  if (!uuidPattern.test(expectedRequestRevisionId)) fieldErrors.expected_request_revision_id = "Invalid request revision.";
  if (expectedStatus !== "pending") fieldErrors.expected_status = "This request is no longer pending.";
  if (!expectedDayFingerprint) fieldErrors.expected_day_fingerprint = "Reload the current request details.";
  if (!halfIncrement(expectedChargeableUnits) || expectedChargeableUnits <= 0) fieldErrors.expected_chargeable_units = "Reload the current request totals.";
  if (decision !== "approve" && decision !== "reject") fieldErrors.decision = "Choose approve or reject.";
  if (decision === "reject" && !reviewText) fieldErrors.review_text = "A rejection reason is required.";
  if (reviewText && reviewText.length > 1000) fieldErrors.review_text = "Review text must be 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { data: {
    requestGroupId,
    expectedRequestRevisionId,
    expectedStatus: "pending",
    expectedDayFingerprint,
    expectedChargeableUnits,
    decision: decision as "approve" | "reject",
    reviewText,
  } };
}

export function validateLeaveCancellation(formData: FormData) {
  const requestGroupId = text(formData, "request_group_id");
  const expectedStatus = text(formData, "expected_status");
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};
  if (!uuidPattern.test(requestGroupId)) fieldErrors.request_group_id = "Invalid leave request.";
  if (expectedStatus !== "approved") fieldErrors.expected_status = "Only approved leave can be cancelled.";
  if (!reason) fieldErrors.reason = "A cancellation reason is required.";
  else if (reason.length > 1000) fieldErrors.reason = "Reason must be 1,000 characters or fewer.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);
  return { state: undefined, data: { requestGroupId, expectedStatus: "approved" as const, reason } };
}

export function validateLeaveAdjustment(formData: FormData, currentYear: number) {
  const employeeId = text(formData, "employee_id");
  const leaveTypeId = text(formData, "leave_type_id");
  const leaveYear = Number(text(formData, "leave_year"));
  const units = Number(text(formData, "units"));
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};
  if (!uuidPattern.test(employeeId)) fieldErrors.employee_id = "Select a valid employee.";
  if (!uuidPattern.test(leaveTypeId)) fieldErrors.leave_type_id = "Select a valid leave type.";
  if (!Number.isInteger(leaveYear) || leaveYear < currentYear - 1 || leaveYear > currentYear + 1) fieldErrors.leave_year = "Choose the prior, current, or next leave year.";
  if (!Number.isFinite(units) || units === 0 || !Number.isInteger(units * 2)) fieldErrors.units = "Units must use 0.5-day increments.";
  if (!reason) fieldErrors.reason = "An adjustment reason is required.";
  else if (reason.length > 1000) fieldErrors.reason = "Reason must be 1,000 characters or fewer.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, { employee_id: employeeId, leave_type_id: leaveTypeId, leave_year: String(leaveYear), units: String(units) });
  return { state: undefined, data: { employeeId, leaveTypeId, leaveYear, units, reason } };
}

export function validateLeaveYearOpening(formData: FormData, currentYear: number) {
  const leaveYear = Number(text(formData, "leave_year"));
  const fieldErrors: Record<string, string> = {};
  if (!Number.isInteger(leaveYear) || ![currentYear, currentYear + 1].includes(leaveYear)) fieldErrors.leave_year = "Choose the current or next leave year.";
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors, { leave_year: String(leaveYear) });
  return { state: undefined, data: { leaveYear } };
}
