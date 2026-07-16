import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function file(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const employeePage = file("../../app/(dashboard)/employee/leave/page.tsx");
const newPage = file("../../app/(dashboard)/employee/leave/new/page.tsx");
const detailPage = file("../../app/(dashboard)/employee/leave/[requestGroupId]/page.tsx");
const editPage = file("../../app/(dashboard)/employee/leave/[requestGroupId]/edit/page.tsx");
const legacyPage = file("../../app/(dashboard)/leave/page.tsx");
const form = file("../../components/leave/leave-request-form.tsx");
const uploader = file("../../components/leave/leave-attachment-uploader.tsx");


test("legacy leave route redirects by HR role", () => {
  assert.match(legacyPage, /redirect\("\/admin\/leave"\)/);
  assert.match(legacyPage, /redirect\("\/employee\/leave"\)/);
});

test("employee leave page loads balances calendar and history", () => {
  assert.match(employeePage, /LeaveBalanceCards/);
  assert.match(employeePage, /LeaveCalendar/);
  assert.match(employeePage, /LeaveRequestTable/);
  assert.match(employeePage, /requireLeaveEmployee/);
});

test("request form exposes only whole and half-day options", () => {
  assert.match(form, /full_day/);
  assert.match(form, /first_half/);
  assert.match(form, /second_half/);
  assert.doesNotMatch(form, /hourly|quarter_day/);
});

test("edit and submit controls are draft-only", () => {
  assert.match(editPage, /status !== "draft"/);
  assert.match(detailPage, /WithdrawLeaveButton/);
});

test("attachment uploader accepts only approved types and limits count", () => {
  assert.match(uploader, /application\/pdf,image\/jpeg,image\/png/);
  assert.match(uploader, /MAX_LEAVE_ATTACHMENTS/);
  assert.match(uploader, /MAX_LEAVE_ATTACHMENT_BYTES/);
});

test("new page authenticates and uses live leave type options", () => {
  assert.match(newPage, /requireLeaveEmployee/);
  assert.match(newPage, /getActiveLeaveTypeOptions/);
});

const adminPage = file("../../app/(dashboard)/admin/leave/page.tsx");
const adminDetail = file("../../app/(dashboard)/admin/leave/[requestGroupId]/page.tsx");
const conflictsPage = file("../../app/(dashboard)/admin/leave/conflicts/page.tsx");
const balancesPage = file("../../app/(dashboard)/admin/leave/balances/page.tsx");
const yearOpeningPage = file("../../app/(dashboard)/admin/leave/year-opening/page.tsx");
const leaveTypesPage = file("../../app/(dashboard)/settings/leave-types/page.tsx");
const yearOpeningForm = file("../../components/leave/leave-year-opening-form.tsx");

test("all HR leave pages require leave admin", () => {
  for (const source of [adminPage, adminDetail, conflictsPage, balancesPage, yearOpeningPage, leaveTypesPage]) {
    assert.match(source, /requireLeaveAdmin/);
  }
});

test("review detail exposes approve reject and cancellation but no edit form", () => {
  assert.match(adminDetail, /LeaveReviewForm/);
  assert.match(adminDetail, /CancelApprovedLeaveForm/);
  assert.doesNotMatch(adminDetail, /UpdateLeaveDraft|name="start_date"/);
});

test("HR workspace links to conflicts balances year opening and policy settings", () => {
  assert.match(adminPage, /\/admin\/leave\/conflicts/);
  assert.match(adminPage, /\/admin\/leave\/balances/);
  assert.match(adminPage, /\/admin\/leave\/year-opening/);
  assert.match(adminPage, /\/settings\/leave-types/);
});


test("HR request conflict filter is applied to the request list", () => {
  assert.match(adminPage, /leave_attendance_conflicts/);
  assert.match(adminPage, /conflictRequestGroupIds/);
  assert.match(adminPage, /conflictState === "open"/);
});

test("year opening confirmation is bound to the previewed year", () => {
  assert.match(yearOpeningForm, /previewedYear/);
  assert.match(yearOpeningForm, /previewedYear === year/);
});

const sidebar = file("../../components/sidebar.tsx");
const settingsPage = file("../../app/(dashboard)/settings/page.tsx");

test("sidebar separates employee leave from HR leave administration", () => {
  assert.match(sidebar, /\/employee\/leave/);
  assert.match(sidebar, /\/admin\/leave/);
  assert.match(sidebar, /\/settings\/leave-types/);
  assert.doesNotMatch(sidebar, /\["\/leave",\s*"Leave"/);
});

test("settings hub links to leave types for HR", () => {
  assert.match(settingsPage, /\/settings\/leave-types/);
  assert.match(settingsPage, /Leave types/);
});
