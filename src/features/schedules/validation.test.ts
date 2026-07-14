import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeScheduleCode,
  scheduledMinutes,
  validateScheduleAssignment,
  validateScheduleTemplate,
  validateScheduleVersion,
} from "./validation.ts";

function templateForm() {
  const form = new FormData();
  form.set("code", " regular day ");
  form.set("name", "Regular Day Shift");
  form.set("description", "Weekday office schedule");
  return form;
}

function versionForm(date = "2026-08-01") {
  const form = new FormData();
  form.set("effective_date", date);
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    form.append("working_days", day);
  }
  form.set("start_time", "08:00");
  form.set("end_time", "17:00");
  form.set("break_minutes", "60");
  return form;
}

test("schedule codes normalize to uppercase hyphenated values", () => {
  assert.equal(normalizeScheduleCode(" regular day "), "REGULAR-DAY");
  assert.equal(normalizeScheduleCode("Morning__Shift"), "MORNING-SHIFT");
});

test("scheduled minutes subtract the unpaid break", () => {
  assert.equal(scheduledMinutes("08:00", "17:00", 60), 480);
});

test("template validation normalizes safe retry values", () => {
  const result = validateScheduleTemplate(templateForm());
  assert.deepEqual(result.data, {
    code: "REGULAR-DAY",
    name: "Regular Day Shift",
    description: "Weekday office schedule",
  });
});

test("version validation accepts one weekly pattern and rejects overnight shifts", () => {
  const valid = validateScheduleVersion(versionForm(), "2026-07-14");
  assert.equal(valid.data?.break_minutes, 60);
  assert.equal(valid.data?.working_days.length, 5);

  const invalid = versionForm();
  invalid.set("start_time", "22:00");
  invalid.set("end_time", "06:00");
  const result = validateScheduleVersion(invalid, "2026-07-14");
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.end_time, "End time must be later than start time.");
});

test("past-effective versions and assignments require private reasons", () => {
  const version = validateScheduleVersion(versionForm("2026-07-01"), "2026-07-14");
  assert.equal(version.state?.fieldErrors?.change_reason, "A reason is required for a backdated version.");

  const assignment = new FormData();
  assignment.set("schedule_template_id", "11111111-1111-4111-8111-111111111111");
  assignment.set("effective_start_date", "2026-07-01");
  assignment.append("employee_ids", "22222222-2222-4222-8222-222222222222");
  const assignmentResult = validateScheduleAssignment(assignment, "2026-07-14");
  assert.equal(
    assignmentResult.state?.fieldErrors?.assignment_reason,
    "A reason is required for a backdated assignment.",
  );
});

test("private reasons are never echoed into action state", () => {
  const sentinel = "DO_NOT_ECHO_SCHEDULE_REASON";
  const form = versionForm("2026-07-01");
  form.set("change_reason", sentinel.repeat(100));
  const result = validateScheduleVersion(form, "2026-07-14");
  assert.doesNotMatch(JSON.stringify(result.state), /DO_NOT_ECHO_SCHEDULE_REASON/);
});
