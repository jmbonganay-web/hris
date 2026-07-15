import test from "node:test";
import assert from "node:assert/strict";
import { describeAuditEntry } from "./presentation.ts";
import type { EmployeeAuditEntry } from "./types.ts";

function entry(overrides: Partial<EmployeeAuditEntry>): EmployeeAuditEntry {
  return {
    id: "audit-1",
    employee_id: "employee-1",
    actor_profile_id: "actor-1",
    action: "employment_details.updated",
    entity_type: "employment",
    entity_id: "employee-1",
    changed_fields: [],
    before_values: {},
    after_values: {},
    metadata: {},
    source: "database_trigger",
    created_at: "2026-07-14T00:00:00Z",
    actor: {
      id: "actor-1",
      display_name: "HR Admin",
      first_name: "HR",
      last_name: "Admin",
    },
    ...overrides,
  };
}

test("manager changes show safe snapshot labels", () => {
  const result = describeAuditEntry(entry({
    action: "manager.changed",
    entity_type: "manager",
    changed_fields: ["manager_id"],
    before_values: { manager_id: { id: "a", label: "Maria Santos" } },
    after_values: { manager_id: { id: "b", label: "Joel Reyes" } },
  }));

  assert.equal(result.title, "Manager changed");
  assert.equal(result.detail, "Manager: Maria Santos → Joel Reyes");
});

test("sensitive activity shows field names only", () => {
  const result = describeAuditEntry(entry({
    action: "sensitive_details.updated",
    entity_type: "sensitive_data",
    changed_fields: ["sss_number", "account_number"],
    metadata: { value: "DO_NOT_DISPLAY_SECRET" },
  }));

  assert.equal(result.detail, "SSS number, Account number");
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_DISPLAY_SECRET/);
});

test("HR note deletion has no note content detail", () => {
  const result = describeAuditEntry(entry({
    action: "hr_note.deleted",
    entity_type: "hr_note",
    changed_fields: [],
  }));
  assert.equal(result.title, "HR note deleted");
  assert.equal(result.detail, null);
});

test("missing actor is displayed as a system operation", () => {
  const result = describeAuditEntry(entry({
    actor_profile_id: null,
    actor: null,
  }));
  assert.equal(result.actorLabel, "System / database operation");
});

test("unknown actions have a readable fallback", () => {
  const result = describeAuditEntry(entry({ action: "custom.event_name" }));
  assert.equal(result.title, "custom event name");
});

test("attendance correction shows only safe timestamp changes", () => {
  const result = describeAuditEntry(entry({
    action: "attendance.corrected",
    entity_type: "attendance",
    changed_fields: ["clock_out_at", "is_corrected"],
    before_values: { clock_out_at: null, is_corrected: false },
    after_values: { clock_out_at: "2026-07-14T09:00:00.000Z", is_corrected: true },
  }));
  assert.equal(result.title, "Attendance corrected");
  assert.match(result.detail ?? "", /Clock out/);
  assert.doesNotMatch(result.detail ?? "", /reason|note/i);
});

test("correction request actions use readable titles", () => {
  for (const [action, title] of [
    ["attendance_correction.requested", "Attendance correction requested"],
    ["attendance_correction.approved", "Attendance correction approved"],
    ["attendance_correction.rejected", "Attendance correction rejected"],
    ["attendance_correction.cancelled", "Attendance correction cancelled"],
  ]) {
    assert.equal(describeAuditEntry(entry({ action })).title, title);
  }
});

test("schedule assignments use readable safe titles and dates", () => {
  const auditEntry: EmployeeAuditEntry = {
    id: "audit",
    employee_id: "employee",
    actor_profile_id: null,
    action: "schedule_assignment.created",
    entity_type: "schedule_assignment",
    entity_id: "assignment",
    changed_fields: ["schedule_template_id", "effective_start_date", "effective_end_date"],
    before_values: {},
    after_values: {
      schedule_template_id: "template",
      effective_start_date: "2026-08-01",
      effective_end_date: null,
    },
    metadata: {},
    source: "application",
    created_at: "2026-07-14T00:00:00Z",
    actor: null,
  };
  const result = describeAuditEntry(auditEntry);
  assert.equal(result.title, "Schedule assigned");
  assert.match(result.detail ?? "", /Effective start date/);
});

test("attendance calculation and finalization actions have safe readable titles", () => {
  for (const [action, title] of [
    ["attendance_policy.created", "Attendance policy created"],
    ["attendance_calculation.created", "Attendance calculation created"],
    ["attendance_calculation.recalculated", "Attendance recalculated"],
    ["attendance_calculation.finalized", "Attendance finalized"],
    ["attendance_finalization.started", "Attendance finalization started"],
    ["attendance_finalization.completed", "Attendance finalization completed"],
    ["attendance_finalization.failed", "Attendance finalization failed"],
  ]) {
    const result = describeAuditEntry(entry({
      action,
      entity_type: action.startsWith("attendance_policy")
        ? "attendance_policy"
        : action.startsWith("attendance_finalization")
          ? "attendance_finalization"
          : "attendance_calculation",
      changed_fields: ["base_status", "worked_minutes", "late_minutes"],
      after_values: { base_status: "present", worked_minutes: 480, late_minutes: 0 },
      metadata: { reason: "PRIVATE_REASON_MUST_NOT_RENDER" },
    }));
    assert.equal(result.title, title);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_REASON_MUST_NOT_RENDER/);
  }
});

test("Phase 5B-2B audit actions have safe user-facing titles", () => {
  const actions = [
    ["overtime_policy.created", "Overtime policy created"],
    ["holiday.created", "Holiday created"],
    ["holiday.replaced", "Holiday replaced"],
    ["holiday.deactivated", "Holiday deactivated"],
    ["overtime_detection.created", "Overtime detected"],
    ["overtime_detection.recalculated", "Overtime recalculated"],
    ["overtime_detection.superseded", "Overtime detection superseded"],
    ["overtime_approval.approved", "Overtime approved"],
    ["overtime_approval.rejected", "Overtime rejected"],
    ["overtime_approval.superseded", "Overtime approval superseded"],
  ] as const;
  for (const [action, expected] of actions) {
    assert.equal(describeAuditEntry(entry({ action })).title, expected);
  }
});

test("Phase 5B-2B safe audit fields have labels", () => {
  const auditEntry = entry({
    action: "overtime_detection.created",
    changed_fields: [
      "attendance_date",
      "segment_type",
      "holiday_type",
      "detected_minutes",
      "approved_minutes",
      "revision_number",
      "calculation_source",
    ],
  });
  const detail = describeAuditEntry(auditEntry).detail ?? "";
  assert.match(detail, /Attendance date/);
  assert.match(detail, /Segment type/);
  assert.match(detail, /Holiday type/);
  assert.match(detail, /Detected minutes/);
  assert.match(detail, /Approved minutes/);
  assert.match(detail, /Revision number/);
  assert.match(detail, /Calculation source/);
});
