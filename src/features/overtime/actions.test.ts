import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateOvertimeRecalculation, validateOvertimeReview } from "./validation.ts";

const migration = await readFile(
  new URL("../../../supabase/migrations/202607150002_overtime_holidays.sql", import.meta.url),
  "utf8",
);
const action = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/recalculate/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");
const formSource = await readFile(
  new URL("../../components/overtime/overtime-recalculation-form.tsx", import.meta.url),
  "utf8",
).catch(() => "");

const employeeId = "11111111-1111-4111-8111-111111111111";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("overtime recalculation validation supports one employee and all active employees", () => {
  const one = validateOvertimeRecalculation(
    form({
      scope: "one_employee",
      employee_id: employeeId,
      start_date: "2026-07-01",
      end_date: "2026-07-15",
      reason: "Apply approved holiday calendar",
    }),
    "2026-07-15",
  );
  assert.deepEqual(one.data?.employeeIds, [employeeId]);

  const all = validateOvertimeRecalculation(
    form({
      scope: "all_active",
      employee_id: "",
      start_date: "2026-07-01",
      end_date: "2026-07-15",
      reason: "Apply approved overtime policy",
    }),
    "2026-07-15",
  );
  assert.equal(all.data?.employeeIds, null);
});

test("overtime recalculation rejects future dates and never echoes its reason", () => {
  const result = validateOvertimeRecalculation(
    form({
      scope: "one_employee",
      employee_id: employeeId,
      start_date: "2026-07-16",
      end_date: "2026-07-16",
      reason: "PROTECTED_RECALCULATION_REASON",
    }),
    "2026-07-15",
  );
  assert.equal(result.data, undefined);
  assert.doesNotMatch(JSON.stringify(result.state), /PROTECTED_RECALCULATION_REASON/);
});

test("overtime recalculation RPC is HR-only and calls only the overtime detector", () => {
  assert.match(migration, /create or replace function public\.recalculate_overtime_range/i);
  assert.match(migration, /if not public\.is_hr_admin\(\) then/i);
  assert.match(migration, /p_end_date > public\.company_attendance_date\(now\(\)\)/i);
  assert.match(migration, /perform public\.calculate_overtime_for_attendance_day\(/i);
  assert.match(migration, /'overtime_recalculation'/i);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.recalculate_overtime_range[\s\S]*?\$\$;/i)?.[0] ?? "",
    /calculate_attendance_day_internal/i,
  );
});

test("overtime recalculation action calls one protected RPC and keeps reason out of retry values", () => {
  assert.match(action, /\.rpc\("recalculate_overtime_range"/);
  assert.match(action, /requireAttendanceAdmin\(\)/);
  assert.doesNotMatch(action, /values:\s*\{[\s\S]*?reason/);
  assert.doesNotMatch(action, /console\.(log|error|warn)/);
});

test("recalculation form warns about supersession and immutable history", () => {
  assert.match(formSource, /Previous detections and approval items remain in history/);
  assert.match(formSource, /changed results supersede active items/i);
  assert.match(formSource, /maxLength=\{1000\}/);
});

const reviewAction = await readFile(
  new URL("../../app/(dashboard)/admin/overtime/actions.ts", import.meta.url),
  "utf8",
).catch(() => "");
const reviewForm = await readFile(
  new URL("../../components/overtime/overtime-review-form.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("review validation requires rejection reason but permits empty approval note", () => {
  const approve = form({
    approval_item_id: employeeId,
    expected_status: "pending",
    decision: "approve",
    review_text: "",
  });
  assert.equal(validateOvertimeReview(approve).data?.reviewText, null);

  const reject = form({
    approval_item_id: employeeId,
    expected_status: "pending",
    decision: "reject",
    review_text: "",
  });
  assert.equal(validateOvertimeReview(reject).data, undefined);
  assert.equal(
    validateOvertimeReview(reject).state?.fieldErrors?.review_text,
    "A rejection reason is required.",
  );
});

test("review action calls protected RPC without supporting partial minutes", () => {
  assert.match(reviewAction, /\.rpc\("review_overtime_approval_item"/);
  assert.match(reviewAction, /p_expected_status:/);
  assert.match(reviewAction, /p_decision:/);
  assert.match(reviewAction, /p_review_text:/);
  assert.doesNotMatch(reviewAction, /approved_minutes\s*:/);
  assert.doesNotMatch(reviewAction, /console\.(log|error|warn)/);
});

test("review action maps stale and validation errors to safe copy", () => {
  assert.match(reviewAction, /OVERTIME_ITEM_STALE/);
  assert.match(reviewAction, /This overtime item changed while you were reviewing it\./);
  assert.match(reviewAction, /OVERTIME_REJECTION_REASON_REQUIRED/);
  assert.doesNotMatch(reviewAction, /SQLSTATE|constraint|stack/i);
});

test("review form exposes only full approve and full reject decisions", () => {
  assert.match(reviewForm, /value="approve"/);
  assert.match(reviewForm, /value="reject"/);
  assert.match(reviewForm, /name="review_text"/);
  assert.doesNotMatch(reviewForm, /name="approved_minutes"/);
});


test("overtime actions expose no raw database text or protected input in logs and retry state", () => {
  const allActions = `${action}\n${reviewAction}`;
  assert.doesNotMatch(allActions, /console\.(log|error|warn)/);
  assert.doesNotMatch(allActions, /stack|sqlstate|constraint/i);
  const retryValueBlocks = allActions.match(/values:\s*\{[\s\S]*?\n\s{6}\},/g) ?? [];
  for (const values of retryValueBlocks) {
    assert.doesNotMatch(values, /reason|reviewText|review_text/);
  }
});
