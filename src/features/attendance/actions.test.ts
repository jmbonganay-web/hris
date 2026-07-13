import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../../app/(dashboard)/attendance/actions.ts", import.meta.url),
  "utf8",
);

test("employee clock actions invoke protected RPCs and never accept timestamps", () => {
  assert.match(source, /\.rpc\("clock_in_attendance"/);
  assert.match(source, /\.rpc\("clock_out_attendance"/);
  assert.doesNotMatch(source, /p_clock_(in|out)_at|formData\.get\(["'`]clock_(in|out)_at|datetime-local/);
});

test("clock actions validate private notes without logging them", () => {
  assert.match(source, /validateClockNote/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*note/);
});

test("attendance paths are revalidated after successful clock actions", () => {
  assert.match(source, /revalidatePath\("\/attendance"\)/);
  assert.match(source, /revalidatePath\("\/dashboard"\)/);
});

test("employee correction actions use protected request RPCs", () => {
  assert.match(source, /\.rpc\("create_attendance_correction_request"/);
  assert.match(source, /\.rpc\("cancel_attendance_correction_request"/);
  assert.match(source, /validateCorrectionRequest/);
});

test("correction action state never echoes private reason or employee note", () => {
  assert.doesNotMatch(source, /values\s*:\s*\{[\s\S]*?\b(reason|employee_note)\b/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*(reason|employeeNote)/);
});

test("HR actions require attendance admin authorization and protected RPCs", () => {
  assert.match(source, /requireAttendanceAdmin/);
  assert.match(source, /\.rpc\("hr_create_attendance"/);
  assert.match(source, /\.rpc\("hr_correct_attendance"/);
  assert.match(source, /validateHrAttendance/);
});

test("HR correction reasons are never logged or returned in retry values", () => {
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*reason/);
  assert.doesNotMatch(source, /values:[\s\S]+reason/);
});

test("review action invokes one atomic review RPC", () => {
  assert.match(source, /\.rpc\("review_attendance_correction_request"/);
  assert.match(source, /validateReviewDecision/);
  assert.doesNotMatch(source, /\.from\("attendance_records"\)[\s\S]+\.update/);
});

test("review action explains stale official attendance state", () => {
  assert.match(source, /REQUEST_STATE_CHANGED/);
  assert.match(source, /Attendance changed after this request was submitted/);
});
