import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path: string) { return readFile(new URL(path, import.meta.url), "utf8"); }
const sidebar = await read("../../components/sidebar.tsx");
const overview = await read("../../components/payroll/payroll-summary-cards.tsx");
const scheduleForm = await read("../../components/payroll/payroll-schedule-form.tsx");
const preview = await read("../../components/payroll/payroll-schedule-preview.tsx");
const periodActions = await read("../../components/payroll/payroll-period-actions.tsx");
const selfSummary = await read("../../components/payroll/compensation-summary.tsx");
const compensationForm = await read("../../components/payroll/compensation-form.tsx");
const approvalCard = await read("../../components/payroll/payroll-approval-card.tsx");

test("navigation exposes own compensation to everyone and payroll administration to HR", () => {
  assert.match(sidebar, /\["\/me\/compensation", "My Compensation"/);
  assert.match(sidebar, /isHr[\s\S]*\["\/payroll", "Payroll"/);
  assert.match(sidebar, /WalletCards/);
});

test("administrative overview contains approved Phase 10A summaries", () => {
  for (const label of ["Active schedules", "Upcoming draft periods", "Periods requiring review", "Pending approvals", "Missing compensation", "Missing payroll schedule", "Backdated warnings", "Recently reopened"]) {
    assert.match(overview, new RegExp(label, "i"));
  }
});

test("schedule form conditionally renders schedule-specific configuration and read-only settings", () => {
  assert.match(scheduleForm, /type === "weekly" \|\| type === "biweekly"/);
  assert.match(scheduleForm, /type === "semi_monthly"/);
  assert.match(scheduleForm, /name="anchorDate"/);
  assert.match(scheduleForm, /name="firstPeriodEndDay"/);
  assert.match(scheduleForm, /Currency[\s\S]*readOnly/);
  assert.match(scheduleForm, /Timezone[\s\S]*readOnly/);
  assert.match(scheduleForm, /Preview dates/);
  for (const label of ["Period", "Range", "Cutoff", "Payment", "Adjusted from"]) assert.match(preview, new RegExp(label));
});

test("period controls mirror the database lifecycle", () => {
  assert.match(periodActions, /status === "draft"[\s\S]*"open"/);
  assert.match(periodActions, /status === "open"[\s\S]*"under_review"/);
  assert.match(periodActions, /status === "under_review"[\s\S]*"open"[\s\S]*"approved"/);
  assert.match(periodActions, /status === "approved"[\s\S]*"locked"/);
  assert.match(periodActions, /status === "locked" && canApprove/);
  assert.match(periodActions, /Reopening reason/);
});

test("compensation self-service is current-only and administration supports approved inputs", () => {
  for (const label of ["Current compensation", "Current rate", "Standard day", "Standard week", "Effective date", "Payroll schedule", "Next expected payment"]) assert.match(selfSummary, new RegExp(label, "i"));
  assert.match(compensationForm, /disabled={type !== "monthly"}/);
  assert.match(compensationForm, /disabled={type !== "hourly"}/);
  assert.match(compensationForm, /readOnly/);
  assert.match(compensationForm, /backdated change/i);
});

test("approval cards require reasons and exceptional confirmations without private hidden values", () => {
  assert.match(approvalCard, /Private HR reason/);
  assert.match(approvalCard, /name="reason" required/);
  assert.match(approvalCard, /confirmBackdated/);
  assert.match(approvalCard, /confirmMidPeriod/);
  assert.doesNotMatch(approvalCard, /type="hidden" name="(changeReason|overrideReason|rejectionReason)"/);
});
