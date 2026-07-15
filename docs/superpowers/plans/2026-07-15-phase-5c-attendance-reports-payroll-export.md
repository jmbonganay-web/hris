# Phase 5C Attendance Reports and Payroll Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure HR attendance reporting with Operational and Payroll modes, stable server-side pagination, finalized payroll-preparation datasets, CSV exports, and a four-sheet XLSX workbook.

**Architecture:** PostgreSQL remains the reporting authority. Protected `SECURITY DEFINER` functions resolve active attendance revisions, current organization fields, active overtime state, summary aggregates, pagination, and export limits; Next.js server-only modules parse filters, call those RPCs, normalize rows, render `/reports`, generate CSV/XLSX in memory, write safe export audit events, and return private no-store downloads. No report snapshot or generated file is persisted.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7, Supabase PostgreSQL/Auth/RLS, PostgreSQL PL/pgSQL, Node built-in test runner, `exceljs` server-only workbook generation, existing CSS system.

## Global Constraints

- Company timezone remains exactly `Asia/Manila`.
- `/reports` and report-export endpoints are restricted to HR Admin and Super Admin.
- Employee and manager roles receive no organization-wide reporting access.
- Operational mode may include active finalized and provisional attendance revisions.
- Payroll mode and every export use active finalized attendance revisions only.
- Operational mode accepts at most 31 inclusive calendar days.
- Payroll mode accepts at most 366 inclusive calendar days.
- Future report dates are rejected.
- Default dates are the first day of the current Asia/Manila month through the current Asia/Manila date.
- Current department, job title, and employment status are used; historical organization assignments are not reconstructed.
- Inactive employees with matching report rows remain reportable.
- Employees without records are excluded by default and may be included only in Employee Summary.
- Daily attendance has exactly one row per employee per date.
- Integer-minute fields are authoritative; `HH:MM` fields are derived presentation values.
- Missing clock-out keeps worked minutes blank.
- Absence and holiday without attendance use zero worked minutes.
- Pending, rejected, inactive, and superseded overtime contribute zero approved minutes.
- Active approved pre-shift, post-shift, rest-day, and holiday-work minutes are counted once.
- Approved holiday work is also separated by regular, special non-working, and company holiday type.
- Screen page sizes are exactly 25, 50, or 100; default is 25.
- Each CSV dataset and each XLSX worksheet is limited to 25,000 data rows.
- CSV and XLSX use the same normalized TypeScript row contracts as screen reports.
- CSV formula-like text beginning with `=`, `+`, `-`, or `@` is escaped.
- XLSX formula-like text is stored as plain text, never as a formula.
- Export files are generated in memory and are not stored.
- Successful exports create safe organization-level audit records; audit failure blocks the download.
- Audit JSON excludes report rows, employee names, clock timestamps, revision IDs, notes, reasons, sensitive identifiers, raw errors, and file bytes.
- Every public report RPC uses `SECURITY DEFINER` and `set search_path = pg_catalog, public`.
- Internal report helpers and source views are revoked from `public`, `anon`, and `authenticated`.
- Public report RPC execution is revoked from `public` and `anon`, granted to `authenticated`, and guarded by database role validation.
- No salary, pay multiplier, night differential, deduction, contribution, payslip, payroll locking, stored snapshot, scheduled export, leave-aware rate, or employee self-service report is added.
- Existing Phase 1 through Phase 5B-2B behavior must remain compatible.

---

## Baseline and scope decomposition

Verified repository baseline before planning:

```text
npm test: 342 passed, 0 failed
Current latest migration: supabase/migrations/202607150003_overtime_holidays_privilege_hardening.sql
New migration: supabase/migrations/202607150004_attendance_reports_payroll_export.sql
Current /reports page: static mock data that must be fully replaced
Current package dependencies: no spreadsheet library
```

Phase 5C remains one implementation plan because all outputs depend on one normalized reporting contract:

```text
active attendance revisions + current organization + active overtime state
  -> protected report RPCs
  -> one TypeScript normalization layer
  -> screens, CSV, XLSX, and export audit
```

## File map

### Create

```text
supabase/migrations/202607150004_attendance_reports_payroll_export.sql

src/features/reports/constants.ts
src/features/reports/types.ts
src/features/reports/filters.ts
src/features/reports/filters.test.ts
src/features/reports/formatters.ts
src/features/reports/formatters.test.ts
src/features/reports/auth.ts
src/features/reports/queries.ts
src/features/reports/queries.test.ts
src/features/reports/migration.test.ts
src/features/reports/security.test.ts
src/features/reports/csv.ts
src/features/reports/csv.test.ts
src/features/reports/xlsx.ts
src/features/reports/xlsx.test.ts
src/features/reports/audit.ts
src/features/reports/audit.test.ts
src/features/reports/ui.test.ts
src/features/reports/export-routes.test.ts

src/features/reports/components/report-filters.tsx
src/features/reports/components/report-tabs.tsx
src/features/reports/components/summary-cards.tsx
src/features/reports/components/daily-attendance-table.tsx
src/features/reports/components/employee-summary-table.tsx
src/features/reports/components/exceptions-table.tsx
src/features/reports/components/overtime-holiday-table.tsx
src/features/reports/components/exports-panel.tsx
src/features/reports/components/report-pagination.tsx

src/app/(dashboard)/reports/loading.tsx
src/app/(dashboard)/reports/error.tsx
src/app/api/reports/export/csv/route.ts
src/app/api/reports/export/xlsx/route.ts
```

### Modify

```text
package.json
package-lock.json
src/app/(dashboard)/reports/page.tsx
src/components/sidebar.tsx
src/app/(dashboard)/settings/page.tsx
src/app/globals.css
README.md
docs/superpowers/specs/2026-07-15-phase-5c-attendance-reports-payroll-export-design.md
```

## Shared TypeScript contracts

Create `src/features/reports/types.ts` with these exact public contracts before implementing queries or UI:

```ts
import type { AttendanceCalculationBaseStatus } from "@/features/attendance/calculations/types";
import type { HolidayType } from "@/features/overtime/holidays/types";
import type {
  OvertimeApprovalStatus,
  OvertimeSegmentType,
} from "@/features/overtime/types";

export type ReportMode = "operational" | "payroll";
export type ReportTab = "summary" | "daily" | "exceptions" | "overtime" | "exports";
export type ReportCalculationState = "finalized" | "provisional";
export type ReportPageSize = 25 | 50 | 100;
export type ReportExportDataset =
  | "daily"
  | "employee_summary"
  | "exceptions"
  | "overtime_holiday";
export type ReportExportFormat = "csv" | "xlsx";
export type AttendanceExceptionType =
  | "absent"
  | "missing_clock_out"
  | "provisional_or_incomplete"
  | "unscheduled_attendance"
  | "late"
  | "undertime";

export type ReportFilters = {
  mode: ReportMode;
  tab: ReportTab;
  startDate: string;
  endDate: string;
  departmentId: string | null;
  employeeId: string | null;
  employmentStatus: string | null;
  activeOnly: boolean;
  includeEmployeesWithoutRecords: boolean;
  attendanceStatus: AttendanceCalculationBaseStatus | null;
  calculationState: ReportCalculationState | null;
  exceptionType: AttendanceExceptionType | null;
  segmentType: OvertimeSegmentType | null;
  approvalStatus: OvertimeApprovalStatus | null;
  holidayType: HolidayType | null;
  page: number;
  pageSize: ReportPageSize;
};

export type ReportSummaryMetrics = {
  employee_day_records: number;
  scheduled_days: number;
  present_days: number;
  absent_days: number;
  holiday_days: number;
  missing_clock_out_days: number;
  rest_day_worked_days: number;
  unscheduled_attendance_days: number;
  worked_minutes: number;
  late_minutes: number;
  undertime_minutes: number;
  approved_overtime_minutes: number;
  finalized_employee_day_records: number;
  provisional_employee_day_records: number;
  finalized_worked_minutes: number;
  provisional_worked_minutes: number;
};

export type DailyAttendanceReportRow = {
  attendance_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  attendance_status: AttendanceCalculationBaseStatus;
  calculation_state: ReportCalculationState;
  is_provisional: boolean;
  is_holiday: boolean;
  holiday_name: string | null;
  holiday_type: HolidayType | null;
  is_scheduled_day: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  clock_in: string | null;
  clock_out: string | null;
  worked_minutes: number | null;
  worked_duration: string;
  late_minutes: number | null;
  late_duration: string;
  undertime_minutes: number | null;
  undertime_duration: string;
  is_late: boolean;
  is_undertime: boolean;
  is_corrected: boolean;
  is_recalculated: boolean;
  pre_shift_detected_minutes: number | null;
  pre_shift_approved_minutes: number | null;
  pre_shift_status: OvertimeApprovalStatus | null;
  post_shift_detected_minutes: number | null;
  post_shift_approved_minutes: number | null;
  post_shift_status: OvertimeApprovalStatus | null;
  rest_day_detected_minutes: number | null;
  rest_day_approved_minutes: number | null;
  rest_day_status: OvertimeApprovalStatus | null;
  holiday_work_detected_minutes: number | null;
  holiday_work_approved_minutes: number | null;
  holiday_work_status: OvertimeApprovalStatus | null;
  total_approved_overtime_minutes: number;
  total_approved_overtime_duration: string;
  attendance_record_id: string | null;
  attendance_calculation_revision_id: string;
  generated_at: string;
  timezone: "Asia/Manila";
  total_count: number;
};

export type EmployeeAttendanceSummaryRow = {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  report_start_date: string;
  report_end_date: string;
  employee_day_records: number;
  scheduled_days: number;
  present_days: number;
  absent_days: number;
  holiday_days: number;
  missing_clock_out_days: number;
  rest_day_worked_days: number;
  unscheduled_attendance_days: number;
  finalized_days: number;
  provisional_days: number;
  worked_minutes: number;
  worked_duration: string;
  late_minutes: number;
  late_duration: string;
  undertime_minutes: number;
  undertime_duration: string;
  approved_pre_shift_minutes: number;
  approved_pre_shift_duration: string;
  approved_post_shift_minutes: number;
  approved_post_shift_duration: string;
  approved_rest_day_minutes: number;
  approved_rest_day_duration: string;
  approved_holiday_work_minutes: number;
  approved_holiday_work_duration: string;
  total_approved_overtime_minutes: number;
  total_approved_overtime_duration: string;
  regular_holiday_work_minutes: number;
  regular_holiday_work_duration: string;
  special_non_working_holiday_work_minutes: number;
  special_non_working_holiday_work_duration: string;
  company_holiday_work_minutes: number;
  company_holiday_work_duration: string;
  generated_at: string;
  timezone: "Asia/Manila";
  total_count: number;
};

export type AttendanceExceptionReportRow = {
  attendance_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  exception_type: AttendanceExceptionType;
  attendance_status: AttendanceCalculationBaseStatus;
  calculation_state: ReportCalculationState;
  clock_in: string | null;
  clock_out: string | null;
  worked_minutes: number | null;
  worked_duration: string;
  late_minutes: number | null;
  late_duration: string;
  undertime_minutes: number | null;
  undertime_duration: string;
  is_corrected: boolean;
  is_recalculated: boolean;
  attendance_calculation_revision_id: string;
  total_count: number;
};

export type OvertimeHolidayReportRow = {
  attendance_date: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  employment_status: string;
  segment_type: OvertimeSegmentType;
  holiday_name: string | null;
  holiday_type: HolidayType | null;
  detected_start: string | null;
  detected_end: string | null;
  detected_minutes: number;
  detected_duration: string;
  approved_minutes: number;
  approved_duration: string;
  approval_status: OvertimeApprovalStatus | null;
  reviewed_at: string | null;
  is_active_detection: boolean;
  is_superseded: boolean;
  attendance_calculation_revision_id: string;
  detection_revision_id: string;
  approval_item_id: string | null;
  total_count: number;
};

export type PaginatedReport<T> = {
  rows: T[];
  page: number;
  pageSize: ReportPageSize;
  total: number;
  totalPages: number;
};

export type ReportFilterOptions = {
  departments: Array<{ id: string; name: string }>;
  employees: Array<{
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    employment_status: string;
  }>;
};
```

---

### Task 1: Report constants, filter parsing, and duration formatting

**Files:**
- Create: `src/features/reports/constants.ts`
- Create: `src/features/reports/types.ts`
- Create: `src/features/reports/filters.ts`
- Create: `src/features/reports/filters.test.ts`
- Create: `src/features/reports/formatters.ts`
- Create: `src/features/reports/formatters.test.ts`

**Interfaces:**
- Consumes: `companyDateAt()` from `src/features/attendance/time.ts`.
- Produces: `parseReportFilters()`, `serializeReportFilters()`, `formatReportDuration()`, `formatReportTimestamp()`, `reportPageSizes`, `REPORT_EXPORT_ROW_LIMIT`.

- [ ] **Step 1: Write the failing filter and formatter tests**

```ts
// src/features/reports/filters.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseReportFilters, serializeReportFilters } from "./filters.ts";

test("defaults to current-month payroll filters", () => {
  const filters = parseReportFilters({}, "2026-07-15");
  assert.equal(filters.mode, "payroll");
  assert.equal(filters.tab, "summary");
  assert.equal(filters.startDate, "2026-07-01");
  assert.equal(filters.endDate, "2026-07-15");
  assert.equal(filters.page, 1);
  assert.equal(filters.pageSize, 25);
});

test("operational ranges are limited to 31 inclusive days", () => {
  assert.throws(
    () => parseReportFilters({ mode: "operational", start_date: "2026-06-01", end_date: "2026-07-15" }, "2026-07-15"),
    /Operational reports are limited to 31 days/,
  );
});

test("payroll ranges are limited to 366 inclusive days", () => {
  assert.throws(
    () => parseReportFilters({ mode: "payroll", start_date: "2025-01-01", end_date: "2026-07-15" }, "2026-07-15"),
    /Payroll reports are limited to 366 days/,
  );
});

test("future dates are rejected", () => {
  assert.throws(
    () => parseReportFilters({ end_date: "2026-07-16" }, "2026-07-15"),
    /Future report dates are not allowed/,
  );
});

test("serialization preserves stable filter names", () => {
  const filters = parseReportFilters({ mode: "payroll", tab: "daily", page_size: "50", active_only: "1" }, "2026-07-15");
  assert.equal(serializeReportFilters(filters).toString(), "mode=payroll&tab=daily&start_date=2026-07-01&end_date=2026-07-15&active_only=1&page=1&page_size=50");
});
```

```ts
// src/features/reports/formatters.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatReportDuration, formatReportTimestamp } from "./formatters.ts";

test("duration formatter preserves null, zero, and totals over 24 hours", () => {
  assert.equal(formatReportDuration(null), "");
  assert.equal(formatReportDuration(0), "00:00");
  assert.equal(formatReportDuration(65), "01:05");
  assert.equal(formatReportDuration(1505), "25:05");
});

test("timestamps are emitted with the Manila offset", () => {
  assert.equal(formatReportTimestamp("2026-07-15T08:00:00Z"), "2026-07-15T16:00:00+08:00");
});
```

- [ ] **Step 2: Run tests and verify the modules do not exist yet**

Run:

```bash
npm test -- src/features/reports/filters.test.ts src/features/reports/formatters.test.ts
```

Expected: FAIL with module-resolution errors for `./filters.ts` and `./formatters.ts`.

- [ ] **Step 3: Create constants and validation implementation**

```ts
// src/features/reports/constants.ts
export const COMPANY_REPORT_TIME_ZONE = "Asia/Manila" as const;
export const OPERATIONAL_MAX_DAYS = 31;
export const PAYROLL_MAX_DAYS = 366;
export const REPORT_EXPORT_ROW_LIMIT = 25_000;
export const reportPageSizes = [25, 50, 100] as const;
export const reportModes = ["operational", "payroll"] as const;
export const reportTabs = ["summary", "daily", "exceptions", "overtime", "exports"] as const;
export const reportCalculationStates = ["finalized", "provisional"] as const;
export const reportEmploymentStatuses = ["active", "probation", "on_leave", "inactive", "terminated"] as const;
export const attendanceExceptionTypes = [
  "absent",
  "missing_clock_out",
  "provisional_or_incomplete",
  "unscheduled_attendance",
  "late",
  "undertime",
] as const;
```

```ts
// src/features/reports/filters.ts
import { attendanceCalculationBaseStatuses } from "@/features/attendance/calculations/types";
import { holidayTypes } from "@/features/overtime/holidays/types";
import { overtimeApprovalStatuses, overtimeSegmentTypes } from "@/features/overtime/types";
import {
  OPERATIONAL_MAX_DAYS,
  PAYROLL_MAX_DAYS,
  attendanceExceptionTypes,
  reportCalculationStates,
  reportModes,
  reportPageSizes,
  reportEmploymentStatuses,
  reportTabs,
} from "./constants";
import type { ReportFilters } from "./types";

type RawSearch = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function optionalUuid(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error("The selected report filter is invalid.");
  }
  return normalized;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function inclusiveDays(startDate: string, endDate: string): number {
  return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

function accepted<T extends readonly string[]>(value: string, allowed: T): T[number] | null {
  return allowed.includes(value as T[number]) ? (value as T[number]) : null;
}

export function parseReportFilters(raw: RawSearch, today: string): ReportFilters {
  const defaultStart = `${today.slice(0, 7)}-01`;
  const mode = accepted(one(raw.mode), reportModes) ?? "payroll";
  const tab = accepted(one(raw.tab), reportTabs) ?? "summary";
  const startDate = one(raw.start_date) || defaultStart;
  const endDate = one(raw.end_date) || today;

  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    throw new Error("The selected date range is invalid.");
  }
  if (endDate > today) throw new Error("Future report dates are not allowed.");
  const days = inclusiveDays(startDate, endDate);
  if (mode === "operational" && days > OPERATIONAL_MAX_DAYS) {
    throw new Error("Operational reports are limited to 31 days.");
  }
  if (mode === "payroll" && days > PAYROLL_MAX_DAYS) {
    throw new Error("Payroll reports are limited to 366 days.");
  }

  const requestedPageSize = Number(one(raw.page_size) || "25");
  const pageSize = reportPageSizes.includes(requestedPageSize as 25 | 50 | 100)
    ? (requestedPageSize as 25 | 50 | 100)
    : 25;

  return {
    mode,
    tab,
    startDate,
    endDate,
    departmentId: optionalUuid(one(raw.department)),
    employeeId: optionalUuid(one(raw.employee)),
    employmentStatus: accepted(one(raw.employment_status), reportEmploymentStatuses),
    activeOnly: one(raw.active_only) === "1",
    includeEmployeesWithoutRecords: one(raw.include_without_records) === "1",
    attendanceStatus: accepted(one(raw.attendance_status), attendanceCalculationBaseStatuses),
    calculationState: accepted(one(raw.calculation_state), reportCalculationStates),
    exceptionType: accepted(one(raw.exception_type), attendanceExceptionTypes),
    segmentType: accepted(one(raw.segment_type), overtimeSegmentTypes),
    approvalStatus: accepted(one(raw.approval_status), overtimeApprovalStatuses),
    holidayType: accepted(one(raw.holiday_type), holidayTypes),
    page: Math.max(1, Number(one(raw.page) || "1") || 1),
    pageSize,
  };
}

export function serializeReportFilters(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({
    mode: filters.mode,
    tab: filters.tab,
    start_date: filters.startDate,
    end_date: filters.endDate,
  });
  if (filters.departmentId) params.set("department", filters.departmentId);
  if (filters.employeeId) params.set("employee", filters.employeeId);
  if (filters.employmentStatus) params.set("employment_status", filters.employmentStatus);
  if (filters.activeOnly) params.set("active_only", "1");
  if (filters.includeEmployeesWithoutRecords) params.set("include_without_records", "1");
  if (filters.attendanceStatus) params.set("attendance_status", filters.attendanceStatus);
  if (filters.calculationState) params.set("calculation_state", filters.calculationState);
  if (filters.exceptionType) params.set("exception_type", filters.exceptionType);
  if (filters.segmentType) params.set("segment_type", filters.segmentType);
  if (filters.approvalStatus) params.set("approval_status", filters.approvalStatus);
  if (filters.holidayType) params.set("holiday_type", filters.holidayType);
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.pageSize));
  return params;
}
```

```ts
// src/features/reports/formatters.ts
import { COMPANY_REPORT_TIME_ZONE } from "./constants";

export function formatReportDuration(minutes: number | null): string {
  if (minutes === null) return "";
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error("Invalid report duration.");
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatReportTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: COMPANY_REPORT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/features/reports/filters.test.ts src/features/reports/formatters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/features/reports/constants.ts src/features/reports/types.ts src/features/reports/filters.ts src/features/reports/filters.test.ts src/features/reports/formatters.ts src/features/reports/formatters.test.ts
git commit -m "feat: add attendance report filter contracts"
```

---

### Task 2: Reporting migration foundation, indexes, and protected source views

**Files:**
- Create: `supabase/migrations/202607150004_attendance_reports_payroll_export.sql`
- Create: `src/features/reports/migration.test.ts`
- Create: `src/features/reports/security.test.ts`

**Interfaces:**
- Consumes: `attendance_calculation_groups.active_revision_id`, Phase 5B-2B overtime tables, `public.is_hr_admin()`.
- Produces: internal views `report_attendance_source_v1`, `report_overtime_source_v1`; helper functions `report_require_hr()` and `report_validate_request()`.

- [ ] **Step 1: Write failing migration and security tests**

```ts
// src/features/reports/migration.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607150004_attendance_reports_payroll_export.sql", import.meta.url), "utf8");

test("migration is one transaction with one schema refresh", () => {
  assert.equal((sql.toLowerCase().match(/^begin;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/^commit;/gm) ?? []).length, 1);
  assert.equal((sql.toLowerCase().match(/notify pgrst, 'reload schema';/g) ?? []).length, 1);
});

test("report source views use active attendance and overtime pointers", () => {
  assert.match(sql, /create or replace view public\.report_attendance_source_v1/i);
  assert.match(sql, /revision\.id = group_row\.active_revision_id/i);
  assert.match(sql, /create or replace view public\.report_overtime_source_v1/i);
  assert.match(sql, /group_row\.active_revision_id = revision\.id/i);
});

test("report query indexes support date and active revision lookups", () => {
  assert.match(sql, /attendance_report_group_date_idx/i);
  assert.match(sql, /overtime_report_group_date_idx/i);
  assert.match(sql, /overtime_report_approval_active_idx/i);
});
```

```ts
// src/features/reports/security.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607150004_attendance_reports_payroll_export.sql", import.meta.url), "utf8");

test("internal report helpers and source views are inaccessible to client roles", () => {
  assert.match(sql, /revoke all on public\.report_attendance_source_v1 from public, anon, authenticated/i);
  assert.match(sql, /revoke all on public\.report_overtime_source_v1 from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.report_require_hr\(\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.report_validate_request[\s\S]+from public, anon, authenticated/i);
});

test("report helpers use fixed search paths and role validation", () => {
  assert.match(sql, /create or replace function public\.report_require_hr\(\)[\s\S]+security definer[\s\S]+set search_path = pg_catalog, public/i);
  assert.match(sql, /not public\.is_hr_admin\(\)/i);
});
```

- [ ] **Step 2: Run focused tests and verify the migration is absent**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts
```

Expected: FAIL because `202607150004_attendance_reports_payroll_export.sql` does not exist.

- [ ] **Step 3: Create the migration foundation**

Start `supabase/migrations/202607150004_attendance_reports_payroll_export.sql` with:

```sql
begin;

create index if not exists attendance_report_group_date_idx
  on public.attendance_calculation_groups(attendance_date desc, employee_id, active_revision_id);
create index if not exists attendance_report_revision_state_idx
  on public.attendance_calculation_revisions(is_provisional, base_status, id);
create index if not exists overtime_report_group_date_idx
  on public.overtime_detection_groups(attendance_date desc, employee_id, segment_type, active_revision_id);
create index if not exists overtime_report_approval_active_idx
  on public.overtime_approval_items(detection_revision_id, status, superseded_at)
  include (approved_minutes, detected_minutes, reviewed_at);

create or replace function public.report_require_hr()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'REPORT_UNAUTHORIZED';
  end if;
  return v_actor;
end;
$$;

create or replace function public.report_validate_request(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_page integer,
  p_page_size integer,
  p_export boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer;
begin
  perform public.report_require_hr();
  if p_mode not in ('operational', 'payroll') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_MODE';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_DATE_RANGE';
  end if;
  if p_end_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'REPORT_FUTURE_DATE';
  end if;
  v_days := (p_end_date - p_start_date) + 1;
  if p_mode = 'operational' and v_days > 31 then
    raise exception using errcode = 'P0001', message = 'REPORT_OPERATIONAL_RANGE_LIMIT';
  end if;
  if p_mode = 'payroll' and v_days > 366 then
    raise exception using errcode = 'P0001', message = 'REPORT_PAYROLL_RANGE_LIMIT';
  end if;
  if p_export and p_mode <> 'payroll' then
    raise exception using errcode = 'P0001', message = 'REPORT_EXPORT_REQUIRES_PAYROLL';
  end if;
  if not p_export and (p_page is null or p_page < 1) then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_PAGE';
  end if;
  if not p_export and p_page_size not in (25, 50, 100) then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_PAGE_SIZE';
  end if;
end;
$$;

create or replace view public.report_attendance_source_v1
with (security_barrier = true)
as
select
  group_row.attendance_date,
  employee.id as employee_id,
  employee.employee_number,
  trim(concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
  employee.department_id,
  department.name as department_name,
  employee.job_title_id,
  job_title.title as job_title_name,
  employee.employment_status::text as employment_status,
  employee.archived_at,
  revision.base_status as attendance_status,
  case when revision.is_provisional then 'provisional' else 'finalized' end as calculation_state,
  revision.is_provisional,
  revision.is_holiday,
  revision.holiday_name,
  revision.holiday_type,
  revision.scheduled_start_at is not null and revision.scheduled_end_at is not null as is_scheduled_day,
  revision.scheduled_start_at as scheduled_start,
  revision.scheduled_end_at as scheduled_end,
  revision.actual_clock_in_at as clock_in,
  revision.actual_clock_out_at as clock_out,
  revision.worked_minutes,
  revision.late_minutes,
  revision.undertime_minutes,
  revision.is_late,
  revision.is_undertime,
  revision.is_corrected,
  revision.is_recalculated,
  overtime.pre_shift_detected_minutes,
  overtime.pre_shift_approved_minutes,
  overtime.pre_shift_status,
  overtime.post_shift_detected_minutes,
  overtime.post_shift_approved_minutes,
  overtime.post_shift_status,
  overtime.rest_day_detected_minutes,
  overtime.rest_day_approved_minutes,
  overtime.rest_day_status,
  overtime.holiday_work_detected_minutes,
  overtime.holiday_work_approved_minutes,
  overtime.holiday_work_status,
  coalesce(overtime.total_approved_overtime_minutes, 0)::integer as total_approved_overtime_minutes,
  revision.attendance_record_id,
  revision.id as attendance_calculation_revision_id
from public.attendance_calculation_groups as group_row
join public.attendance_calculation_revisions as revision
  on revision.id = group_row.active_revision_id
join public.employees as employee
  on employee.id = group_row.employee_id
left join public.departments as department
  on department.id = employee.department_id
left join public.job_titles as job_title
  on job_title.id = employee.job_title_id
left join lateral (
  select
    max(detection.detected_minutes) filter (where detection.segment_type = 'pre_shift')::integer as pre_shift_detected_minutes,
    max(case when detection.segment_type = 'pre_shift' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'pre_shift')::integer as pre_shift_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'pre_shift') as pre_shift_status,
    max(detection.detected_minutes) filter (where detection.segment_type = 'post_shift')::integer as post_shift_detected_minutes,
    max(case when detection.segment_type = 'post_shift' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'post_shift')::integer as post_shift_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'post_shift') as post_shift_status,
    max(detection.detected_minutes) filter (where detection.segment_type = 'rest_day')::integer as rest_day_detected_minutes,
    max(case when detection.segment_type = 'rest_day' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'rest_day')::integer as rest_day_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'rest_day') as rest_day_status,
    max(detection.detected_minutes) filter (where detection.segment_type = 'holiday_work')::integer as holiday_work_detected_minutes,
    max(case when detection.segment_type = 'holiday_work' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'holiday_work')::integer as holiday_work_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'holiday_work') as holiday_work_status,
    sum(case when approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)::integer as total_approved_overtime_minutes
  from public.overtime_detection_groups as detection_group
  join public.overtime_detection_revisions as detection
    on detection.id = detection_group.active_revision_id
   and detection.is_active
  left join public.overtime_approval_items as approval
    on approval.detection_revision_id = detection.id
  where detection_group.employee_id = group_row.employee_id
    and detection_group.attendance_date = group_row.attendance_date
) as overtime on true;

create or replace view public.report_overtime_source_v1
with (security_barrier = true)
as
select
  group_row.attendance_date,
  employee.id as employee_id,
  employee.employee_number,
  trim(concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
  employee.department_id,
  department.name as department_name,
  employee.job_title_id,
  job_title.title as job_title_name,
  employee.employment_status::text as employment_status,
  employee.archived_at,
  revision.segment_type,
  holiday.holiday_name,
  holiday.holiday_type,
  revision.detected_start_at as detected_start,
  revision.detected_end_at as detected_end,
  revision.detected_minutes,
  coalesce(approval.approved_minutes, 0)::integer as approved_minutes,
  approval.status as approval_status,
  approval.reviewed_at,
  revision.is_active as is_active_detection,
  (not revision.is_active or approval.status = 'superseded' or approval.superseded_at is not null) as is_superseded,
  revision.attendance_calculation_revision_id,
  revision.id as detection_revision_id,
  approval.id as approval_item_id
from public.overtime_detection_revisions as revision
join public.overtime_detection_groups as group_row
  on group_row.id = revision.detection_group_id
join public.employees as employee
  on employee.id = group_row.employee_id
left join public.departments as department
  on department.id = employee.department_id
left join public.job_titles as job_title
  on job_title.id = employee.job_title_id
left join public.holiday_calendar_versions as holiday
  on holiday.id = revision.holiday_version_id
left join public.overtime_approval_items as approval
  on approval.detection_revision_id = revision.id;

revoke all on public.report_attendance_source_v1 from public, anon, authenticated;
revoke all on public.report_overtime_source_v1 from public, anon, authenticated;
revoke all on function public.report_require_hr() from public, anon, authenticated;
revoke all on function public.report_validate_request(text, date, date, integer, integer, boolean) from public, anon, authenticated;
```

- [ ] **Step 4: Run migration/security tests**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts
```

Expected: PASS for foundation assertions; later function assertions remain absent until their tasks add them.

- [ ] **Step 5: Commit the migration foundation**

```bash
git add supabase/migrations/202607150004_attendance_reports_payroll_export.sql src/features/reports/migration.test.ts src/features/reports/security.test.ts
git commit -m "feat: add protected attendance report sources"
```

---

### Task 3: Summary metrics and daily attendance report RPCs

**Files:**
- Modify: `supabase/migrations/202607150004_attendance_reports_payroll_export.sql`
- Modify: `src/features/reports/migration.test.ts`
- Modify: `src/features/reports/security.test.ts`

**Interfaces:**
- Consumes: `report_attendance_source_v1`, `report_validate_request()`.
- Produces: `get_attendance_report_summary(...)` and `get_attendance_daily_report(...)`.

- [ ] **Step 1: Add failing SQL-contract tests**

```ts
test("summary and daily RPCs enforce active finalized payroll data", () => {
  assert.match(sql, /create or replace function public\.get_attendance_report_summary/i);
  assert.match(sql, /create or replace function public\.get_attendance_daily_report/i);
  assert.match(sql, /p_mode = 'operational' or source\.is_provisional = false/i);
  assert.match(sql, /REPORT_ROW_LIMIT/i);
  assert.match(sql, /order by source\.attendance_date desc, source\.employee_number asc, source\.attendance_calculation_revision_id asc/i);
});
```

```ts
test("public report RPCs are security definer with fixed search paths", () => {
  for (const name of ["get_attendance_report_summary", "get_attendance_daily_report"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public/i);
    assert.match(body, /report_validate_request/i);
  }
});
```

- [ ] **Step 2: Run tests and verify missing RPC failures**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts
```

Expected: FAIL because both public functions are missing.

- [ ] **Step 3: Append the summary RPC before final grants**

```sql
create or replace function public.get_attendance_report_summary(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false
)
returns table (
  employee_day_records bigint,
  scheduled_days bigint,
  present_days bigint,
  absent_days bigint,
  holiday_days bigint,
  missing_clock_out_days bigint,
  rest_day_worked_days bigint,
  unscheduled_attendance_days bigint,
  worked_minutes bigint,
  late_minutes bigint,
  undertime_minutes bigint,
  approved_overtime_minutes bigint,
  finalized_employee_day_records bigint,
  provisional_employee_day_records bigint,
  finalized_worked_minutes bigint,
  provisional_worked_minutes bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, 1, 25, false);
  if p_employment_status is not null and p_employment_status not in ('active', 'probation', 'on_leave', 'inactive', 'terminated') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EMPLOYMENT_STATUS';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (where source.is_scheduled_day)::bigint,
    count(*) filter (where source.attendance_status = 'present')::bigint,
    count(*) filter (where source.attendance_status = 'absent')::bigint,
    count(*) filter (where source.is_holiday)::bigint,
    count(*) filter (where source.attendance_status = 'missing_clock_out')::bigint,
    count(*) filter (where source.attendance_status = 'rest_day_worked')::bigint,
    count(*) filter (where source.attendance_status = 'unscheduled_attendance')::bigint,
    coalesce(sum(source.worked_minutes), 0)::bigint,
    coalesce(sum(source.late_minutes), 0)::bigint,
    coalesce(sum(source.undertime_minutes), 0)::bigint,
    coalesce(sum(source.total_approved_overtime_minutes), 0)::bigint,
    count(*) filter (where not source.is_provisional)::bigint,
    count(*) filter (where source.is_provisional)::bigint,
    coalesce(sum(source.worked_minutes) filter (where not source.is_provisional), 0)::bigint,
    coalesce(sum(source.worked_minutes) filter (where source.is_provisional), 0)::bigint
  from public.report_attendance_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_mode = 'operational' or source.is_provisional = false)
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')));
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;
```

- [ ] **Step 4: Append the daily report RPC**

Use the exact return contract below. `p_export = true` returns the full filtered result after the database verifies `v_total <= 25000`; screen calls use validated pagination.

```sql
create or replace function public.get_attendance_daily_report(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_attendance_status text default null,
  p_calculation_state text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  attendance_date date,
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  job_title_id uuid,
  job_title_name text,
  employment_status text,
  attendance_status text,
  calculation_state text,
  is_provisional boolean,
  is_holiday boolean,
  holiday_name text,
  holiday_type text,
  is_scheduled_day boolean,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  clock_in timestamptz,
  clock_out timestamptz,
  worked_minutes integer,
  late_minutes integer,
  undertime_minutes integer,
  is_late boolean,
  is_undertime boolean,
  is_corrected boolean,
  is_recalculated boolean,
  pre_shift_detected_minutes integer,
  pre_shift_approved_minutes integer,
  pre_shift_status text,
  post_shift_detected_minutes integer,
  post_shift_approved_minutes integer,
  post_shift_status text,
  rest_day_detected_minutes integer,
  rest_day_approved_minutes integer,
  rest_day_status text,
  holiday_work_detected_minutes integer,
  holiday_work_approved_minutes integer,
  holiday_work_status text,
  total_approved_overtime_minutes integer,
  attendance_record_id uuid,
  attendance_calculation_revision_id uuid,
  generated_at timestamptz,
  timezone text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, p_page, p_page_size, p_export);
  if p_attendance_status is not null and p_attendance_status not in ('present', 'absent', 'holiday', 'missing_clock_out', 'rest_day_worked', 'unscheduled_attendance') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_ATTENDANCE_STATUS';
  end if;
  if p_calculation_state is not null and p_calculation_state not in ('finalized', 'provisional') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_CALCULATION_STATE';
  end if;

  select count(*) into v_total
  from public.report_attendance_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_mode = 'operational' or source.is_provisional = false)
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_attendance_status is null or source.attendance_status = p_attendance_status)
    and (p_calculation_state is null or source.calculation_state = p_calculation_state);

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  select
    source.attendance_date, source.employee_id, source.employee_number, source.employee_name,
    source.department_id, source.department_name, source.job_title_id, source.job_title_name,
    source.employment_status, source.attendance_status, source.calculation_state,
    source.is_provisional, source.is_holiday, source.holiday_name, source.holiday_type,
    source.is_scheduled_day, source.scheduled_start, source.scheduled_end, source.clock_in,
    source.clock_out, source.worked_minutes, source.late_minutes, source.undertime_minutes,
    source.is_late, source.is_undertime, source.is_corrected, source.is_recalculated,
    source.pre_shift_detected_minutes, source.pre_shift_approved_minutes, source.pre_shift_status,
    source.post_shift_detected_minutes, source.post_shift_approved_minutes, source.post_shift_status,
    source.rest_day_detected_minutes, source.rest_day_approved_minutes, source.rest_day_status,
    source.holiday_work_detected_minutes, source.holiday_work_approved_minutes, source.holiday_work_status,
    source.total_approved_overtime_minutes, source.attendance_record_id,
    source.attendance_calculation_revision_id, now(), 'Asia/Manila', v_total
  from public.report_attendance_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_mode = 'operational' or source.is_provisional = false)
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_attendance_status is null or source.attendance_status = p_attendance_status)
    and (p_calculation_state is null or source.calculation_state = p_calculation_state)
  order by source.attendance_date desc, source.employee_number asc, source.attendance_calculation_revision_id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;
```

- [ ] **Step 5: Run focused migration/security tests**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit summary and daily RPCs**

```bash
git add supabase/migrations/202607150004_attendance_reports_payroll_export.sql src/features/reports/migration.test.ts src/features/reports/security.test.ts
git commit -m "feat: add attendance summary and daily report RPCs"
```

---

### Task 4: Employee summary report RPC

**Files:**
- Modify: `supabase/migrations/202607150004_attendance_reports_payroll_export.sql`
- Modify: `src/features/reports/migration.test.ts`

**Interfaces:**
- Consumes: `report_attendance_source_v1`.
- Produces: `get_employee_attendance_summary(...)`, including optional zero-record employees.

- [ ] **Step 1: Add failing summary-contract tests**

```ts
test("employee summary supports zero-record reconciliation and overtime breakdowns", () => {
  assert.match(sql, /create or replace function public\.get_employee_attendance_summary/i);
  assert.match(sql, /p_include_employees_without_records boolean/i);
  for (const field of [
    "approved_pre_shift_minutes",
    "approved_post_shift_minutes",
    "approved_rest_day_minutes",
    "approved_holiday_work_minutes",
    "regular_holiday_work_minutes",
    "special_non_working_holiday_work_minutes",
    "company_holiday_work_minutes",
  ]) assert.match(sql, new RegExp(field, "i"));
  assert.doesNotMatch(sql, /attendance_rate/i);
});
```

- [ ] **Step 2: Run test and verify the function is missing**

Run:

```bash
npm test -- src/features/reports/migration.test.ts
```

Expected: FAIL at `get_employee_attendance_summary`.

- [ ] **Step 3: Append the employee-summary RPC**

Implement the public function with this signature and aggregation contract:

```sql
create or replace function public.get_employee_attendance_summary(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_include_employees_without_records boolean default false,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  job_title_id uuid,
  job_title_name text,
  employment_status text,
  report_start_date date,
  report_end_date date,
  employee_day_records bigint,
  scheduled_days bigint,
  present_days bigint,
  absent_days bigint,
  holiday_days bigint,
  missing_clock_out_days bigint,
  rest_day_worked_days bigint,
  unscheduled_attendance_days bigint,
  finalized_days bigint,
  provisional_days bigint,
  worked_minutes bigint,
  late_minutes bigint,
  undertime_minutes bigint,
  approved_pre_shift_minutes bigint,
  approved_post_shift_minutes bigint,
  approved_rest_day_minutes bigint,
  approved_holiday_work_minutes bigint,
  total_approved_overtime_minutes bigint,
  regular_holiday_work_minutes bigint,
  special_non_working_holiday_work_minutes bigint,
  company_holiday_work_minutes bigint,
  generated_at timestamptz,
  timezone text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, p_page, p_page_size, p_export);

  with filtered_source as (
    select *
    from public.report_attendance_source_v1 as source
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
  ), employee_scope as (
    select employee.id as employee_id
    from public.employees as employee
    where p_include_employees_without_records
      and (p_department_id is null or employee.department_id = p_department_id)
      and (p_employee_id is null or employee.id = p_employee_id)
      and (p_employment_status is null or employee.employment_status::text = p_employment_status)
      and (not p_active_only or (employee.archived_at is null and employee.employment_status in ('active', 'probation', 'on_leave')))
    union
    select distinct employee_id from filtered_source
  )
  select count(*) into v_total from employee_scope;

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  with filtered_source as (
    select *
    from public.report_attendance_source_v1 as source
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
  ), employee_scope as (
    select employee.id as employee_id
    from public.employees as employee
    where p_include_employees_without_records
      and (p_department_id is null or employee.department_id = p_department_id)
      and (p_employee_id is null or employee.id = p_employee_id)
      and (p_employment_status is null or employee.employment_status::text = p_employment_status)
      and (not p_active_only or (employee.archived_at is null and employee.employment_status in ('active', 'probation', 'on_leave')))
    union
    select distinct employee_id from filtered_source
  )
  select
    employee.id, employee.employee_number,
    trim(concat_ws(' ', employee.first_name, employee.last_name)),
    employee.department_id, department.name, employee.job_title_id, job_title.title,
    employee.employment_status::text, p_start_date, p_end_date,
    count(source.attendance_calculation_revision_id)::bigint,
    count(*) filter (where source.is_scheduled_day)::bigint,
    count(*) filter (where source.attendance_status = 'present')::bigint,
    count(*) filter (where source.attendance_status = 'absent')::bigint,
    count(*) filter (where source.is_holiday)::bigint,
    count(*) filter (where source.attendance_status = 'missing_clock_out')::bigint,
    count(*) filter (where source.attendance_status = 'rest_day_worked')::bigint,
    count(*) filter (where source.attendance_status = 'unscheduled_attendance')::bigint,
    count(*) filter (where source.attendance_calculation_revision_id is not null and not source.is_provisional)::bigint,
    count(*) filter (where source.is_provisional)::bigint,
    coalesce(sum(source.worked_minutes), 0)::bigint,
    coalesce(sum(source.late_minutes), 0)::bigint,
    coalesce(sum(source.undertime_minutes), 0)::bigint,
    coalesce(sum(source.pre_shift_approved_minutes), 0)::bigint,
    coalesce(sum(source.post_shift_approved_minutes), 0)::bigint,
    coalesce(sum(source.rest_day_approved_minutes), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes), 0)::bigint,
    coalesce(sum(source.total_approved_overtime_minutes), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes) filter (where source.holiday_type = 'regular_holiday'), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes) filter (where source.holiday_type = 'special_non_working_holiday'), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes) filter (where source.holiday_type = 'company_holiday'), 0)::bigint,
    now(), 'Asia/Manila', v_total
  from employee_scope as scope
  join public.employees as employee on employee.id = scope.employee_id
  left join public.departments as department on department.id = employee.department_id
  left join public.job_titles as job_title on job_title.id = employee.job_title_id
  left join filtered_source as source on source.employee_id = employee.id
  group by employee.id, employee.employee_number, employee.first_name, employee.last_name,
    employee.department_id, department.name, employee.job_title_id, job_title.title,
    employee.employment_status
  order by employee.employee_number asc, employee.id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;
```

- [ ] **Step 4: Run migration tests**

Run:

```bash
npm test -- src/features/reports/migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the employee summary RPC**

```bash
git add supabase/migrations/202607150004_attendance_reports_payroll_export.sql src/features/reports/migration.test.ts
git commit -m "feat: add employee attendance summary report"
```

---

### Task 5: Exceptions and overtime/holiday report RPCs

**Files:**
- Modify: `supabase/migrations/202607150004_attendance_reports_payroll_export.sql`
- Modify: `src/features/reports/migration.test.ts`
- Modify: `src/features/reports/security.test.ts`

**Interfaces:**
- Produces: `get_attendance_exception_report(...)`, `get_overtime_holiday_report(...)`.

- [ ] **Step 1: Add failing exception/overtime tests**

```ts
test("exceptions expand one attendance day into independent exception rows", () => {
  assert.match(sql, /create or replace function public\.get_attendance_exception_report/i);
  for (const value of ["absent", "missing_clock_out", "provisional_or_incomplete", "unscheduled_attendance", "late", "undertime"]) {
    assert.match(sql, new RegExp(`'${value}'`, "i"));
  }
  assert.match(sql, /cross join lateral/i);
});

test("overtime report exposes lifecycle facts but excludes protected review text", () => {
  const body = sql.match(/create or replace function public\.get_overtime_holiday_report[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /is_active_detection/i);
  assert.match(body, /is_superseded/i);
  assert.doesNotMatch(body, /approval_note|rejection_reason|reviewed_by|recalculation_reason|change_reason/i);
});
```

- [ ] **Step 2: Run tests and verify both functions are missing**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Append the exception RPC**

```sql
create or replace function public.get_attendance_exception_report(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_exception_type text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  attendance_date date, employee_id uuid, employee_number text, employee_name text,
  department_id uuid, department_name text, job_title_id uuid, job_title_name text,
  employment_status text, exception_type text, attendance_status text,
  calculation_state text, clock_in timestamptz, clock_out timestamptz,
  worked_minutes integer, late_minutes integer, undertime_minutes integer,
  is_corrected boolean, is_recalculated boolean,
  attendance_calculation_revision_id uuid, total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, p_page, p_page_size, p_export);
  if p_exception_type is not null and p_exception_type not in ('absent', 'missing_clock_out', 'provisional_or_incomplete', 'unscheduled_attendance', 'late', 'undertime') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EXCEPTION_TYPE';
  end if;

  with exception_rows as (
    select source.*, exception.exception_type
    from public.report_attendance_source_v1 as source
    cross join lateral (
      select 'absent'::text as exception_type where source.attendance_status = 'absent'
      union all select 'missing_clock_out' where source.attendance_status = 'missing_clock_out'
      union all select 'provisional_or_incomplete' where source.is_provisional
      union all select 'unscheduled_attendance' where source.attendance_status = 'unscheduled_attendance'
      union all select 'late' where source.is_late or coalesce(source.late_minutes, 0) > 0
      union all select 'undertime' where source.is_undertime or coalesce(source.undertime_minutes, 0) > 0
    ) as exception
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
      and (p_exception_type is null or exception.exception_type = p_exception_type)
  )
  select count(*) into v_total from exception_rows;

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  with exception_rows as (
    select source.*, exception.exception_type
    from public.report_attendance_source_v1 as source
    cross join lateral (
      select 'absent'::text as exception_type where source.attendance_status = 'absent'
      union all select 'missing_clock_out' where source.attendance_status = 'missing_clock_out'
      union all select 'provisional_or_incomplete' where source.is_provisional
      union all select 'unscheduled_attendance' where source.attendance_status = 'unscheduled_attendance'
      union all select 'late' where source.is_late or coalesce(source.late_minutes, 0) > 0
      union all select 'undertime' where source.is_undertime or coalesce(source.undertime_minutes, 0) > 0
    ) as exception
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
      and (p_exception_type is null or exception.exception_type = p_exception_type)
  )
  select attendance_date, employee_id, employee_number, employee_name, department_id,
    department_name, job_title_id, job_title_name, employment_status, exception_type,
    attendance_status, calculation_state, clock_in, clock_out, worked_minutes,
    late_minutes, undertime_minutes, is_corrected, is_recalculated,
    attendance_calculation_revision_id, v_total
  from exception_rows
  order by attendance_date desc, employee_number asc, exception_type asc, attendance_calculation_revision_id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;
```

- [ ] **Step 4: Append the overtime/holiday RPC**

```sql
create or replace function public.get_overtime_holiday_report(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_segment_type text default null,
  p_approval_status text default null,
  p_holiday_type text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  attendance_date date, employee_id uuid, employee_number text, employee_name text,
  department_id uuid, department_name text, job_title_id uuid, job_title_name text,
  employment_status text, segment_type text, holiday_name text, holiday_type text,
  detected_start timestamptz, detected_end timestamptz, detected_minutes integer,
  approved_minutes integer, approval_status text, reviewed_at timestamptz,
  is_active_detection boolean, is_superseded boolean,
  attendance_calculation_revision_id uuid, detection_revision_id uuid,
  approval_item_id uuid, total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, p_page, p_page_size, p_export);
  if p_segment_type is not null and p_segment_type not in ('pre_shift', 'post_shift', 'rest_day', 'holiday_work') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_SEGMENT_TYPE';
  end if;
  if p_approval_status is not null and p_approval_status not in ('pending', 'approved', 'rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_APPROVAL_STATUS';
  end if;
  if p_holiday_type is not null and p_holiday_type not in ('regular_holiday', 'special_non_working_holiday', 'company_holiday') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_HOLIDAY_TYPE';
  end if;

  select count(*) into v_total
  from public.report_overtime_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_segment_type is null or source.segment_type = p_segment_type)
    and (p_approval_status is null or source.approval_status = p_approval_status)
    and (p_holiday_type is null or source.holiday_type = p_holiday_type);

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  select source.attendance_date, source.employee_id, source.employee_number,
    source.employee_name, source.department_id, source.department_name,
    source.job_title_id, source.job_title_name, source.employment_status,
    source.segment_type, source.holiday_name, source.holiday_type,
    source.detected_start, source.detected_end, source.detected_minutes,
    case when source.approval_status = 'approved' and source.is_active_detection and not source.is_superseded
      then source.approved_minutes else 0 end,
    source.approval_status, source.reviewed_at, source.is_active_detection,
    source.is_superseded, source.attendance_calculation_revision_id,
    source.detection_revision_id, source.approval_item_id, v_total
  from public.report_overtime_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_segment_type is null or source.segment_type = p_segment_type)
    and (p_approval_status is null or source.approval_status = p_approval_status)
    and (p_holiday_type is null or source.holiday_type = p_holiday_type)
  order by source.attendance_date desc, source.employee_number asc, source.segment_type asc, source.detection_revision_id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit exception and overtime RPCs**

```bash
git add supabase/migrations/202607150004_attendance_reports_payroll_export.sql src/features/reports/migration.test.ts src/features/reports/security.test.ts
git commit -m "feat: add exception and overtime report RPCs"
```

---

### Task 6: Export audit RPC, grants, revocations, and migration completion

**Files:**
- Modify: `supabase/migrations/202607150004_attendance_reports_payroll_export.sql`
- Modify: `src/features/reports/security.test.ts`
- Create: `src/features/reports/audit.test.ts`

**Interfaces:**
- Produces: `record_attendance_report_export(...)`.

- [ ] **Step 1: Write failing audit and grant tests**

```ts
// src/features/reports/audit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../../supabase/migrations/202607150004_attendance_reports_payroll_export.sql", import.meta.url), "utf8");

test("export audit is organization-level and stores safe metadata only", () => {
  const body = sql.match(/create or replace function public\.record_attendance_report_export[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(body, /insert into public\.employee_audit_logs/i);
  assert.match(body, /employee_id[\s\S]+null/i);
  assert.match(body, /attendance_report\.(csv|xlsx)_exported/i);
  for (const safe of ["export_dataset", "export_format", "report_mode", "start_date", "end_date", "row_count", "timezone"]) assert.match(body, new RegExp(safe, "i"));
  for (const protectedName of ["employee_name", "clock_in", "clock_out", "revision_id", "approval_note", "rejection_reason", "file_bytes"]) assert.doesNotMatch(body, new RegExp(protectedName, "i"));
});
```

Add to `security.test.ts`:

```ts
test("only authenticated callers may invoke public report functions", () => {
  for (const signature of [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
    "get_overtime_holiday_report",
    "record_attendance_report_export",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]+from public, anon`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]+to authenticated`, "i"));
  }
});
```

- [ ] **Step 2: Run tests and verify audit/grant failures**

Run:

```bash
npm test -- src/features/reports/audit.test.ts src/features/reports/security.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Append the audit RPC**

```sql
create or replace function public.record_attendance_report_export(
  p_export_dataset text,
  p_export_format text,
  p_report_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id_filter uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_include_employees_without_records boolean default false,
  p_row_count integer default 0,
  p_sheet_row_counts jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.report_require_hr();
  v_id uuid;
  v_action text;
  v_metadata jsonb;
begin
  if p_export_format not in ('csv', 'xlsx') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EXPORT_FORMAT';
  end if;
  if p_export_dataset not in ('daily', 'employee_summary', 'exceptions', 'overtime_holiday', 'workbook') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EXPORT_DATASET';
  end if;
  if p_report_mode <> 'payroll' then
    raise exception using errcode = 'P0001', message = 'REPORT_EXPORT_REQUIRES_PAYROLL';
  end if;
  if p_row_count < 0
    or (p_export_format = 'csv' and p_row_count > 25000)
    or (p_export_format = 'xlsx' and p_row_count > 100000) then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;
  if p_sheet_row_counts is not null and jsonb_typeof(p_sheet_row_counts) <> 'object' then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_AUDIT_PAYLOAD';
  end if;
  if p_sheet_row_counts is not null and exists (
    select 1
    from jsonb_each_text(p_sheet_row_counts) as item
    where item.value !~ '^\d+$'
      or item.value::integer > 25000
  ) then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  v_action := case p_export_format
    when 'csv' then 'attendance_report.csv_exported'
    else 'attendance_report.xlsx_exported'
  end;
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'export_dataset', p_export_dataset,
    'export_format', p_export_format,
    'report_mode', p_report_mode,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'department_id', p_department_id,
    'employee_id_filter', p_employee_id_filter,
    'employment_status', p_employment_status,
    'active_only', p_active_only,
    'include_employees_without_records', p_include_employees_without_records,
    'row_count', p_row_count,
    'sheet_row_counts', p_sheet_row_counts,
    'timezone', 'Asia/Manila'
  ));

  insert into public.employee_audit_logs (
    employee_id, actor_profile_id, action, entity_type, entity_id,
    changed_fields, before_values, after_values, metadata, source
  ) values (
    null, v_actor, v_action, 'attendance_report', null,
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, v_metadata, 'application'
  ) returning id into v_id;
  return v_id;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_AUDIT_FAILED';
end;
$$;
```

- [ ] **Step 4: Finish migration grants and transaction**

Append exact revokes/grants for all public function signatures, then one schema refresh and commit:

```sql
revoke all on function public.get_attendance_report_summary(text, date, date, uuid, uuid, text, boolean) from public, anon;
revoke all on function public.get_attendance_daily_report(text, date, date, uuid, uuid, text, boolean, text, text, integer, integer, boolean) from public, anon;
revoke all on function public.get_employee_attendance_summary(text, date, date, uuid, uuid, text, boolean, boolean, integer, integer, boolean) from public, anon;
revoke all on function public.get_attendance_exception_report(text, date, date, uuid, uuid, text, boolean, text, integer, integer, boolean) from public, anon;
revoke all on function public.get_overtime_holiday_report(text, date, date, uuid, uuid, text, boolean, text, text, text, integer, integer, boolean) from public, anon;
revoke all on function public.record_attendance_report_export(text, text, text, date, date, uuid, uuid, text, boolean, boolean, integer, jsonb) from public, anon;

grant execute on function public.get_attendance_report_summary(text, date, date, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.get_attendance_daily_report(text, date, date, uuid, uuid, text, boolean, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.get_employee_attendance_summary(text, date, date, uuid, uuid, text, boolean, boolean, integer, integer, boolean) to authenticated;
grant execute on function public.get_attendance_exception_report(text, date, date, uuid, uuid, text, boolean, text, integer, integer, boolean) to authenticated;
grant execute on function public.get_overtime_holiday_report(text, date, date, uuid, uuid, text, boolean, text, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.record_attendance_report_export(text, text, text, date, date, uuid, uuid, text, boolean, boolean, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
```

- [ ] **Step 5: Run all migration, audit, and security tests**

Run:

```bash
npm test -- src/features/reports/migration.test.ts src/features/reports/security.test.ts src/features/reports/audit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit migration completion**

```bash
git add supabase/migrations/202607150004_attendance_reports_payroll_export.sql src/features/reports/security.test.ts src/features/reports/audit.test.ts
git commit -m "feat: secure report exports and audit metadata"
```

---

### Task 7: Server-only report authorization, RPC adapters, and normalized rows

**Files:**
- Create: `src/features/reports/auth.ts`
- Create: `src/features/reports/queries.ts`
- Create: `src/features/reports/queries.test.ts`

**Interfaces:**
- Produces: `requireReportAdmin()`, `requireReportApiAdmin()`, `getReportFilterOptions()`, `getReportSummary()`, `getDailyAttendanceReport()`, `getEmployeeAttendanceSummary()`, `getAttendanceExceptionReport()`, `getOvertimeHolidayReport()`.

- [ ] **Step 1: Write failing source-contract tests**

```ts
// src/features/reports/queries.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("./auth.ts", import.meta.url), "utf8");

test("report queries are server-only and call protected RPCs", () => {
  assert.match(source, /^import "server-only";/);
  for (const rpc of [
    "get_attendance_report_summary",
    "get_attendance_daily_report",
    "get_employee_attendance_summary",
    "get_attendance_exception_report",
    "get_overtime_holiday_report",
  ]) assert.match(source, new RegExp(`\\.rpc\\("${rpc}"`));
});

test("report authorization reuses HR role enforcement", () => {
  assert.match(auth, /requireHrAdmin/);
  assert.match(auth, /requireReportAdmin/);
  assert.match(auth, /requireReportApiAdmin/);
  assert.match(auth, /ReportAccessError/);
});

test("query mapping derives durations from integer minutes", () => {
  assert.match(source, /formatReportDuration/);
  assert.match(source, /total_approved_overtime_duration/);
});
```

- [ ] **Step 2: Run tests and verify modules are absent**

Run:

```bash
npm test -- src/features/reports/queries.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement report authorization**

```ts
// src/features/reports/auth.ts
import "server-only";
import { requireHrAdmin } from "@/features/employees/auth";
import { createClient } from "@/lib/supabase/server";

export async function requireReportAdmin() {
  return requireHrAdmin();
}

export class ReportAccessError extends Error {}

export async function requireReportApiAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ReportAccessError("REPORT_UNAUTHORIZED");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "hr_admin" && profile?.role !== "super_admin") {
    throw new ReportAccessError("REPORT_UNAUTHORIZED");
  }
  return { supabase, user, role: profile.role };
}
```

- [ ] **Step 4: Implement RPC argument mapping and safe error mapping**

Create `queries.ts` with `import "server-only";`. Use one shared argument mapper:

```ts
function commonRpcArgs(filters: ReportFilters, exportMode: boolean) {
  return {
    p_mode: filters.mode,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
    p_employment_status: filters.employmentStatus,
    p_active_only: filters.activeOnly,
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_export: exportMode,
  };
}

function reportError(error: { message?: string | null } | null): Error {
  const code = error?.message ?? "REPORT_LOAD_FAILED";
  const messages: Record<string, string> = {
    REPORT_UNAUTHORIZED: "You do not have permission to access attendance reports.",
    REPORT_INVALID_DATE_RANGE: "The selected date range is invalid.",
    REPORT_OPERATIONAL_RANGE_LIMIT: "Operational reports are limited to 31 days.",
    REPORT_PAYROLL_RANGE_LIMIT: "Payroll reports are limited to 366 days.",
    REPORT_FUTURE_DATE: "Future report dates are not allowed.",
    REPORT_ROW_LIMIT: "The report contains more than 25,000 rows. Narrow the selected filters.",
    REPORT_EXPORT_REQUIRES_PAYROLL: "Exports are available in Payroll mode only.",
  };
  return new Error(messages[code] ?? "The report could not be loaded.");
}
```

Implement each exported query by calling the named RPC, throwing `reportError(error)`, mapping numbers with `Number`, booleans with `Boolean`, nullable timestamps with `String` only when present, and deriving every `*_duration` with `formatReportDuration()`.

The daily mapper must use this exact overtime total rule:

```ts
const totalApproved = Number(row.total_approved_overtime_minutes ?? 0);
return {
  ...mappedFields,
  worked_duration: formatReportDuration(row.worked_minutes === null ? null : Number(row.worked_minutes)),
  late_duration: formatReportDuration(row.late_minutes === null ? null : Number(row.late_minutes)),
  undertime_duration: formatReportDuration(row.undertime_minutes === null ? null : Number(row.undertime_minutes)),
  total_approved_overtime_minutes: totalApproved,
  total_approved_overtime_duration: formatReportDuration(totalApproved),
  timezone: "Asia/Manila",
};
```

The pagination helper must derive totals from the first row:

```ts
function paginate<T extends { total_count: number }>(rows: T[], filters: ReportFilters): PaginatedReport<T> {
  const total = rows[0]?.total_count ?? 0;
  return {
    rows,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}
```

Implement `getReportFilterOptions()` with HR-readable base tables:

```ts
export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  const supabase = await createClient();
  const [{ data: departments, error: departmentError }, { data: employees, error: employeeError }] = await Promise.all([
    supabase.from("departments").select("id,name").order("name"),
    supabase.from("employees").select("id,employee_number,first_name,last_name,employment_status").order("employee_number"),
  ]);
  if (departmentError || employeeError) throw new Error("The report filters could not be loaded.");
  return { departments: departments ?? [], employees: employees ?? [] };
}
```

- [ ] **Step 5: Run query tests and TypeScript**

Run:

```bash
npm test -- src/features/reports/queries.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit report query adapters**

```bash
git add src/features/reports/auth.ts src/features/reports/queries.ts src/features/reports/queries.test.ts
git commit -m "feat: add server-only attendance report queries"
```

---

### Task 8: Unified reports page, shared filters, tabs, summary, and daily table

**Files:**
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/features/reports/components/report-filters.tsx`
- Create: `src/features/reports/components/report-tabs.tsx`
- Create: `src/features/reports/components/summary-cards.tsx`
- Create: `src/features/reports/components/daily-attendance-table.tsx`
- Create: `src/features/reports/components/employee-summary-table.tsx`
- Create: `src/features/reports/components/report-pagination.tsx`
- Create: `src/features/reports/ui.test.ts`

**Interfaces:**
- Consumes: Task 7 query functions.
- Produces: HR-only `/reports` with URL-based filters and stable pagination.

- [ ] **Step 1: Write failing UI source tests**

```ts
// src/features/reports/ui.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../../app/(dashboard)/reports/page.tsx", import.meta.url), "utf8");
const filters = await readFile(new URL("./components/report-filters.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("./components/report-tabs.tsx", import.meta.url), "utf8");

test("reports page authorizes before loading data", () => {
  assert.match(page, /requireReportAdmin\(\)/);
  assert.ok(page.indexOf("requireReportAdmin()") < page.indexOf("getReportSummary"));
});

test("unified page exposes all approved tabs and modes", () => {
  for (const label of ["Summary", "Daily Attendance", "Exceptions", "Overtime & Holiday Work", "Exports"]) assert.match(tabs, new RegExp(label));
  assert.match(filters, /Operational/);
  assert.match(filters, /Payroll/);
});

test("page contains no mock headcount or attendance-rate values", () => {
  assert.doesNotMatch(page, /Headcount|Attendance rate|94%|128/);
});
```

- [ ] **Step 2: Run UI tests and verify missing components**

Run:

```bash
npm test -- src/features/reports/ui.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement URL-driven filters and tabs**

`report-filters.tsx` must render a GET form with exact names consumed by `parseReportFilters()`:

```tsx
<form className="report-filter-form" method="get">
  <input type="hidden" name="tab" value={filters.tab} />
  <select className="field" name="mode" defaultValue={filters.mode} aria-label="Report mode">
    <option value="operational">Operational</option>
    <option value="payroll">Payroll</option>
  </select>
  <input className="field" type="date" name="start_date" defaultValue={filters.startDate} max={today} aria-label="Start date" />
  <input className="field" type="date" name="end_date" defaultValue={filters.endDate} max={today} aria-label="End date" />
  <select className="field" name="department" defaultValue={filters.departmentId ?? ""} aria-label="Department">
    <option value="">All departments</option>
    {options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
  </select>
  <select className="field" name="employee" defaultValue={filters.employeeId ?? ""} aria-label="Employee">
    <option value="">All employees</option>
    {options.employees.map((item) => <option key={item.id} value={item.id}>{item.employee_number} · {item.first_name} {item.last_name}</option>)}
  </select>
  <select className="field" name="employment_status" defaultValue={filters.employmentStatus ?? ""} aria-label="Employment status">
    <option value="">All employment statuses</option>
    <option value="active">Active</option><option value="probation">Probation</option>
    <option value="on_leave">On leave</option><option value="inactive">Inactive</option>
    <option value="terminated">Terminated</option>
  </select>
  <label className="checkbox-row"><input type="checkbox" name="active_only" value="1" defaultChecked={filters.activeOnly} /> Active employees only</label>
  <button className="btn" type="submit">Apply filters</button>
  <Link className="btn" href="/reports">Reset</Link>
</form>
```

The same form conditionally renders the tab-specific controls:

```tsx
{filters.tab === "summary" && (
  <label className="checkbox-row"><input type="checkbox" name="include_without_records" value="1" defaultChecked={filters.includeEmployeesWithoutRecords} /> Include employees with no records</label>
)}
{filters.tab === "daily" && <><select className="field" name="attendance_status" defaultValue={filters.attendanceStatus ?? ""} aria-label="Attendance status"><option value="">All attendance statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="holiday">Holiday</option><option value="missing_clock_out">Missing clock-out</option><option value="rest_day_worked">Rest day worked</option><option value="unscheduled_attendance">Unscheduled attendance</option></select><select className="field" name="calculation_state" defaultValue={filters.calculationState ?? ""} aria-label="Calculation state"><option value="">All calculation states</option><option value="finalized">Finalized</option><option value="provisional">Provisional</option></select></>}
{filters.tab === "exceptions" && <select className="field" name="exception_type" defaultValue={filters.exceptionType ?? ""} aria-label="Exception type"><option value="">All exception types</option><option value="absent">Absent</option><option value="missing_clock_out">Missing clock-out</option><option value="provisional_or_incomplete">Provisional or incomplete</option><option value="unscheduled_attendance">Unscheduled attendance</option><option value="late">Late</option><option value="undertime">Undertime</option></select>}
{filters.tab === "overtime" && <><select className="field" name="segment_type" defaultValue={filters.segmentType ?? ""} aria-label="Segment type"><option value="">All segment types</option><option value="pre_shift">Pre-shift</option><option value="post_shift">Post-shift</option><option value="rest_day">Rest-day overtime</option><option value="holiday_work">Holiday work</option></select><select className="field" name="approval_status" defaultValue={filters.approvalStatus ?? ""} aria-label="Approval status"><option value="">All approval statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="superseded">Superseded</option></select><select className="field" name="holiday_type" defaultValue={filters.holidayType ?? ""} aria-label="Holiday type"><option value="">All holiday types</option><option value="regular_holiday">Regular Holiday</option><option value="special_non_working_holiday">Special Non-Working Holiday</option><option value="company_holiday">Company Holiday</option></select></>}
```

`report-tabs.tsx` builds links by cloning filters, changing `tab`, and resetting `page = 1`.

- [ ] **Step 4: Implement summary cards, employee summary table, and daily table**

Summary cards must use direct counts and minutes only. Do not render an attendance-rate percentage. Operational mode must visibly separate finalized and provisional counts/minutes.

`employee-summary-table.tsx` must show identity plus direct count/minute totals, including separate overtime segments and holiday types. It must render an all-zero row with a visible “No reportable records” label when `employee_day_records === 0`.

Daily table columns must include employee/date/status, schedule/clock values, worked/late/undertime, holiday context, and four overtime segment cells. Use existing `formatCompanyDate`, `formatCompanyTime`, and `StatusBadge` patterns.

- [ ] **Step 5: Replace `/reports/page.tsx`**

The page sequence must be:

```tsx
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireReportAdmin();
  const raw = await searchParams;
  const today = companyDateAt();
  const filters = parseReportFilters(raw, today);
  const [options, summary] = await Promise.all([
    getReportFilterOptions(),
    getReportSummary(filters),
  ]);

  const activeData = filters.tab === "daily"
    ? await getDailyAttendanceReport(filters)
    : filters.tab === "summary"
      ? await getEmployeeAttendanceSummary(filters)
      : null;

  return (
    <>
      <PageHeader title="Attendance reports" description="Review operational attendance and finalized payroll-preparation totals." />
      <ReportFilters filters={filters} options={options} today={today} />
      <ReportTabs filters={filters} />
      <SummaryCards mode={filters.mode} metrics={summary} />
      {filters.tab === "summary" && activeData && <EmployeeSummaryTable result={activeData} />}
      {filters.tab === "daily" && activeData && <DailyAttendanceTable result={activeData} />}
    </>
  );
}
```

The Summary tab renders `SummaryCards`, `EmployeeSummaryTable`, and `ReportPagination` from the first implementation of the page.

- [ ] **Step 6: Run UI tests and TypeScript**

Run:

```bash
npm test -- src/features/reports/ui.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit the report page shell**

```bash
git add 'src/app/(dashboard)/reports/page.tsx' src/features/reports/components/report-filters.tsx src/features/reports/components/report-tabs.tsx src/features/reports/components/summary-cards.tsx src/features/reports/components/daily-attendance-table.tsx src/features/reports/components/employee-summary-table.tsx src/features/reports/components/report-pagination.tsx src/features/reports/ui.test.ts
git commit -m "feat: replace reports mock with live attendance reports"
```

---

### Task 9: Exceptions, overtime table, and export panel

**Files:**
- Create: `src/features/reports/components/exceptions-table.tsx`
- Create: `src/features/reports/components/overtime-holiday-table.tsx`
- Create: `src/features/reports/components/exports-panel.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/features/reports/ui.test.ts`

**Interfaces:**
- Completes all five `/reports` tabs.

- [ ] **Step 1: Extend failing UI tests**

```ts
test("tab-specific filters and tables stay in their own report sections", async () => {
  const filtersSource = await readFile(new URL("./components/report-filters.tsx", import.meta.url), "utf8");
  const exceptions = await readFile(new URL("./components/exceptions-table.tsx", import.meta.url), "utf8");
  const overtime = await readFile(new URL("./components/overtime-holiday-table.tsx", import.meta.url), "utf8");
  const exportsPanel = await readFile(new URL("./components/exports-panel.tsx", import.meta.url), "utf8");
  assert.match(filtersSource, /Exception type/);
  assert.match(filtersSource, /Segment type/);
  assert.match(filtersSource, /Approval status/);
  assert.match(exceptions, /exception_type/);
  assert.match(overtime, /segment_type/);
  assert.match(exportsPanel, /CSV/);
  assert.match(exportsPanel, /XLSX/);
  assert.match(exportsPanel, /Payroll mode/);
});
```

- [ ] **Step 2: Run the UI test and verify missing files**

Run:

```bash
npm test -- src/features/reports/ui.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the three components**

`exceptions-table.tsx` must show one row per exception and allow duplicate employee/date pairs when exception types differ.

`overtime-holiday-table.tsx` must show lifecycle badges for active/superseded state and must not render reviewer identity, notes, or reasons.

`exports-panel.tsx` must:

```tsx
if (filters.mode !== "payroll") {
  return <div className="empty-state">Exports are available in Payroll mode only.</div>;
}
```

For CSV buttons, construct `/api/reports/export/csv` with shared filters plus one controlled `dataset` value. For XLSX, construct `/api/reports/export/xlsx` with shared filters and no user-provided filename.

- [ ] **Step 4: Wire all tabs in the page**

Use one switch with one query per selected tab:

```ts
const activeData = filters.tab === "summary"
  ? await getEmployeeAttendanceSummary(filters)
  : filters.tab === "daily"
    ? await getDailyAttendanceReport(filters)
    : filters.tab === "exceptions"
      ? await getAttendanceExceptionReport(filters)
      : filters.tab === "overtime"
        ? await getOvertimeHolidayReport(filters)
        : null;
```

Render `ReportPagination` only for paginated datasets. Reset page to 1 when filters or tabs change.

- [ ] **Step 5: Run UI tests and TypeScript**

Run:

```bash
npm test -- src/features/reports/ui.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit the completed report tabs**

```bash
git add src/features/reports/components/exceptions-table.tsx src/features/reports/components/overtime-holiday-table.tsx src/features/reports/components/exports-panel.tsx 'src/app/(dashboard)/reports/page.tsx' src/features/reports/ui.test.ts
git commit -m "feat: add report detail and export tabs"
```

---

### Task 10: CSV normalization and serialization

**Files:**
- Create: `src/features/reports/csv.ts`
- Create: `src/features/reports/csv.test.ts`

**Interfaces:**
- Produces: `buildReportCsv()`, `csvFilename()`, and typed adapters for all four CSV datasets.

- [ ] **Step 1: Write failing CSV tests**

```ts
// src/features/reports/csv.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildReportCsv, csvFilename } from "./csv.ts";

test("CSV quotes delimiters and escapes formula-like text", () => {
  const csv = buildReportCsv(["name", "minutes"], [["=SUM(A1:A2), test", 60]]);
  assert.equal(csv, 'name,minutes\r\n"\'=SUM(A1:A2), test",60\r\n');
});

test("CSV preserves empty null fields and zero numeric fields", () => {
  assert.equal(buildReportCsv(["unknown", "zero"], [[null, 0]]), "unknown,zero\r\n,0\r\n");
});

test("filenames are controlled by dataset and dates", () => {
  assert.equal(csvFilename("daily", "2026-07-01", "2026-07-15"), "attendance-daily-2026-07-01-to-2026-07-15.csv");
});
```

- [ ] **Step 2: Run CSV tests and verify the module is absent**

Run:

```bash
npm test -- src/features/reports/csv.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the serializer and controlled filenames**

```ts
// src/features/reports/csv.ts
import type {
  AttendanceExceptionReportRow,
  DailyAttendanceReportRow,
  EmployeeAttendanceSummaryRow,
  OvertimeHolidayReportRow,
  ReportExportDataset,
} from "./types";

type CsvValue = string | number | boolean | null;

function safeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: CsvValue): string {
  if (value === null) return "";
  const raw = typeof value === "string" ? safeText(value) : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function buildReportCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvFilename(dataset: ReportExportDataset, startDate: string, endDate: string): string {
  const prefix: Record<ReportExportDataset, string> = {
    daily: "attendance-daily",
    employee_summary: "attendance-employee-summary",
    exceptions: "attendance-exceptions",
    overtime_holiday: "overtime-holiday-work",
  };
  return `${prefix[dataset]}-${startDate}-to-${endDate}.csv`;
}

export function dailyCsv(rows: DailyAttendanceReportRow[]): string {
  const headers = [
    "attendance_date", "employee_number", "employee_name", "department_name",
    "job_title_name", "employment_status", "attendance_status", "calculation_state",
    "is_holiday", "holiday_name", "holiday_type", "is_scheduled_day",
    "scheduled_start", "scheduled_end", "clock_in", "clock_out",
    "worked_minutes", "worked_duration", "late_minutes", "late_duration",
    "undertime_minutes", "undertime_duration", "pre_shift_detected_minutes",
    "pre_shift_approved_minutes", "pre_shift_status", "post_shift_detected_minutes",
    "post_shift_approved_minutes", "post_shift_status", "rest_day_detected_minutes",
    "rest_day_approved_minutes", "rest_day_status", "holiday_work_detected_minutes",
    "holiday_work_approved_minutes", "holiday_work_status",
    "total_approved_overtime_minutes", "total_approved_overtime_duration",
    "attendance_calculation_revision_id", "generated_at", "timezone",
  ];
  return buildReportCsv(headers, rows.map((row) => headers.map((key) => row[key as keyof DailyAttendanceReportRow] as CsvValue)));
}

export function employeeSummaryCsv(rows: EmployeeAttendanceSummaryRow[]): string {
  const headers = [
    "employee_number", "employee_name", "department_name", "job_title_name",
    "employment_status", "report_start_date", "report_end_date", "employee_day_records",
    "scheduled_days", "present_days", "absent_days", "holiday_days",
    "missing_clock_out_days", "rest_day_worked_days", "unscheduled_attendance_days",
    "finalized_days", "provisional_days", "worked_minutes", "worked_duration",
    "late_minutes", "late_duration", "undertime_minutes", "undertime_duration",
    "approved_pre_shift_minutes", "approved_pre_shift_duration",
    "approved_post_shift_minutes", "approved_post_shift_duration",
    "approved_rest_day_minutes", "approved_rest_day_duration",
    "approved_holiday_work_minutes", "approved_holiday_work_duration",
    "total_approved_overtime_minutes", "total_approved_overtime_duration",
    "regular_holiday_work_minutes", "regular_holiday_work_duration",
    "special_non_working_holiday_work_minutes", "special_non_working_holiday_work_duration",
    "company_holiday_work_minutes", "company_holiday_work_duration", "generated_at", "timezone",
  ];
  return buildReportCsv(headers, rows.map((row) => headers.map((key) => row[key as keyof EmployeeAttendanceSummaryRow] as CsvValue)));
}

export function exceptionsCsv(rows: AttendanceExceptionReportRow[]): string {
  const headers = [
    "attendance_date", "employee_number", "employee_name", "department_name",
    "job_title_name", "employment_status", "exception_type", "attendance_status",
    "calculation_state", "clock_in", "clock_out", "worked_minutes", "worked_duration",
    "late_minutes", "late_duration", "undertime_minutes", "undertime_duration",
    "is_corrected", "is_recalculated", "attendance_calculation_revision_id",
  ];
  return buildReportCsv(headers, rows.map((row) => headers.map((key) => row[key as keyof AttendanceExceptionReportRow] as CsvValue)));
}

export function overtimeHolidayCsv(rows: OvertimeHolidayReportRow[]): string {
  const headers = [
    "attendance_date", "employee_number", "employee_name", "department_name",
    "job_title_name", "employment_status", "segment_type", "holiday_name",
    "holiday_type", "detected_start", "detected_end", "detected_minutes",
    "detected_duration", "approved_minutes", "approved_duration", "approval_status",
    "reviewed_at", "is_active_detection", "is_superseded",
    "attendance_calculation_revision_id", "detection_revision_id", "approval_item_id",
  ];
  return buildReportCsv(headers, rows.map((row) => headers.map((key) => row[key as keyof OvertimeHolidayReportRow] as CsvValue)));
}
```

- [ ] **Step 4: Extend tests for every dataset header contract and formula escaping**

Add one row fixture per dataset and assert:

- Integer minutes serialize without quotes.
- Null timestamps serialize as empty fields.
- `HH:MM` columns remain text.
- Protected notes and reasons are absent from headers.
- Every string beginning with `=`, `+`, `-`, or `@` gains a leading apostrophe.

- [ ] **Step 5: Run CSV tests and TypeScript**

Run:

```bash
npm test -- src/features/reports/csv.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit CSV serialization**

```bash
git add src/features/reports/csv.ts src/features/reports/csv.test.ts
git commit -m "feat: add attendance CSV serialization"
```

---

### Task 11: XLSX workbook generation with four worksheets

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/reports/xlsx.ts`
- Create: `src/features/reports/xlsx.test.ts`

**Interfaces:**
- Produces: `buildAttendanceWorkbook()` and `xlsxFilename()`.

- [ ] **Step 1: Install the server-route-only spreadsheet dependency**

Run:

```bash
npm install exceljs@4.4.0
```

Expected: `exceljs` appears in `dependencies` and lockfile changes are limited to its transitive graph.

- [ ] **Step 2: Write failing workbook tests**

```ts
// src/features/reports/xlsx.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildAttendanceWorkbook, xlsxFilename } from "./xlsx.ts";

test("workbook has four visible worksheets with frozen filtered headers", async () => {
  const bytes = await buildAttendanceWorkbook({ daily: [], employeeSummary: [], exceptions: [], overtime: [] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Daily Attendance", "Employee Summary", "Exceptions", "Overtime & Holiday Work"]);
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.state, "visible");
    assert.equal(sheet.views[0]?.state, "frozen");
    assert.equal(sheet.views[0]?.ySplit, 1);
    assert.ok(sheet.autoFilter);
  }
});

test("formula-like values remain plain strings", async () => {
  const bytes = await buildAttendanceWorkbook({ daily: [{ employee_name: "=1+1" } as never], employeeSummary: [], exceptions: [], overtime: [] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.equal(workbook.getWorksheet("Daily Attendance")?.getCell("C2").value, "'=1+1");
});

test("XLSX filename is controlled", () => {
  assert.equal(xlsxFilename("2026-07-01", "2026-07-15"), "attendance-report-2026-07-01-to-2026-07-15.xlsx");
});
```

- [ ] **Step 3: Run tests and verify missing implementation**

Run:

```bash
npm test -- src/features/reports/xlsx.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement the workbook module**

`xlsx.ts` is imported only by the server route and begins with:

```ts
import ExcelJS from "exceljs";
import { REPORT_EXPORT_ROW_LIMIT } from "./constants";
import type {
  AttendanceExceptionReportRow,
  DailyAttendanceReportRow,
  EmployeeAttendanceSummaryRow,
  OvertimeHolidayReportRow,
} from "./types";
```

Use one worksheet builder:

```ts
function safeWorkbookValue(value: string | number | boolean | null) {
  return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width: number }>,
  rows: Array<Record<string, string | number | boolean | null>>,
) {
  if (rows.length > REPORT_EXPORT_ROW_LIMIT) {
    throw new Error("The report contains more than 25,000 rows. Narrow the selected filters.");
  }
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeWorkbookValue(value)])));
  }
  sheet.getRow(1).font = { bold: true };
  return sheet;
}
```

`buildAttendanceWorkbook()` must add exactly four worksheets in the approved order, use the same field order as the CSV adapters, retain minute values as numbers, and return `Buffer.from(await workbook.xlsx.writeBuffer())`.

- [ ] **Step 5: Run workbook tests and TypeScript**

Run:

```bash
npm test -- src/features/reports/xlsx.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit XLSX generation**

```bash
git add package.json package-lock.json src/features/reports/xlsx.ts src/features/reports/xlsx.test.ts
git commit -m "feat: add attendance XLSX workbook generation"
```

---

### Task 12: Export audit adapter and protected CSV/XLSX route handlers

**Files:**
- Create: `src/features/reports/audit.ts`
- Modify: `src/features/reports/audit.test.ts`
- Create: `src/app/api/reports/export/csv/route.ts`
- Create: `src/app/api/reports/export/xlsx/route.ts`
- Create: `src/features/reports/export-routes.test.ts`

**Interfaces:**
- Produces: `recordReportExportAudit()`, protected CSV route, protected XLSX route.

- [ ] **Step 1: Extend failing audit tests for the server adapter**

```ts
const source = await readFile(new URL("./audit.ts", import.meta.url), "utf8");

test("audit adapter uses only the protected RPC and safe metadata", () => {
  assert.match(source, /^import "server-only";/);
  assert.match(source, /\.rpc\("record_attendance_report_export"/);
  assert.doesNotMatch(source, /rows|fileBytes|employee_name|clock_in|clock_out|revision_id/);
});
```

Create route source tests:

```ts
// src/features/reports/export-routes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const csvRoute = await readFile(new URL("../../app/api/reports/export/csv/route.ts", import.meta.url), "utf8");
const xlsxRoute = await readFile(new URL("../../app/api/reports/export/xlsx/route.ts", import.meta.url), "utf8");

test("export routes use API authorization and private download headers", () => {
  for (const source of [csvRoute, xlsxRoute]) {
    assert.match(source, /requireReportApiAdmin/);
    assert.match(source, /ReportAccessError/);
    assert.match(source, /private, no-store, max-age=0/);
    assert.match(source, /X-Content-Type-Options/);
  }
});

test("generation completes before audit and response", () => {
  for (const source of [csvRoute, xlsxRoute]) {
    const generation = Math.max(source.indexOf("dailyCsv"), source.indexOf("buildAttendanceWorkbook"));
    const audit = source.indexOf("recordReportExportAudit");
    const response = source.lastIndexOf("new Response");
    assert.ok(generation >= 0 && audit > generation && response > audit);
  }
});
```

- [ ] **Step 2: Run audit/route tests and verify missing modules**

Run:

```bash
npm test -- src/features/reports/audit.test.ts src/features/reports/export-routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the audit adapter**

```ts
// src/features/reports/audit.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportExportDataset, ReportFilters } from "./types";

export async function recordReportExportAudit(params: {
  dataset: ReportExportDataset | "workbook";
  format: "csv" | "xlsx";
  filters: ReportFilters;
  rowCount: number;
  sheetRowCounts?: Record<string, number>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance_report_export", {
    p_export_dataset: params.dataset,
    p_export_format: params.format,
    p_report_mode: params.filters.mode,
    p_start_date: params.filters.startDate,
    p_end_date: params.filters.endDate,
    p_department_id: params.filters.departmentId,
    p_employee_id_filter: params.filters.employeeId,
    p_employment_status: params.filters.employmentStatus,
    p_active_only: params.filters.activeOnly,
    p_include_employees_without_records: params.filters.includeEmployeesWithoutRecords,
    p_row_count: params.rowCount,
    p_sheet_row_counts: params.sheetRowCounts ?? null,
  });
  if (error) throw new Error("The export could not be audited.");
}
```

- [ ] **Step 4: Implement the CSV route**

The route must:

1. Call `requireReportApiAdmin()` and return HTTP 403 for `ReportAccessError`.
2. Parse search parameters with `parseReportFilters()` and `companyDateAt()`.
3. Reject `filters.mode !== "payroll"` with HTTP 400.
4. Accept only `daily`, `employee_summary`, `exceptions`, or `overtime_holiday`.
5. Load the full export dataset through the matching query with `p_export = true`.
6. Generate the complete CSV string with the matching adapter.
7. Call `recordReportExportAudit()` after generation.
8. Return the file with:

```ts
return new Response(csv, {
  status: 200,
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  },
});
```

Return safe JSON error messages for every failure and never include raw Supabase error fields.

- [ ] **Step 5: Implement the XLSX route**

Authenticate and validate exactly like CSV. Load all four complete finalized datasets before generating the workbook. Generate the buffer, then audit with:

```ts
await recordReportExportAudit({
  dataset: "workbook",
  format: "xlsx",
  filters,
  rowCount: daily.length + employeeSummary.length + exceptions.length + overtime.length,
  sheetRowCounts: {
    "Daily Attendance": daily.length,
    "Employee Summary": employeeSummary.length,
    Exceptions: exceptions.length,
    "Overtime & Holiday Work": overtime.length,
  },
});
```

Return `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and the same private no-store headers.

- [ ] **Step 6: Run audit, route, and TypeScript tests**

Run:

```bash
npm test -- src/features/reports/audit.test.ts src/features/reports/export-routes.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit protected export delivery**

```bash
git add src/features/reports/audit.ts src/features/reports/audit.test.ts src/app/api/reports/export/csv/route.ts src/app/api/reports/export/xlsx/route.ts src/features/reports/export-routes.test.ts
git commit -m "feat: deliver and audit protected attendance exports"
```

---

### Task 13: Loading, error handling, navigation, responsive styles, and documentation

**Files:**
- Create: `src/app/(dashboard)/reports/loading.tsx`
- Create: `src/app/(dashboard)/reports/error.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `README.md`
- Modify: `src/features/reports/ui.test.ts`
- Modify: `src/features/reports/export-routes.test.ts`

**Interfaces:**
- Completes role-aware navigation, retryable error UI, responsive tables, and deployment guidance.

- [ ] **Step 1: Add failing navigation/documentation assertions**

```ts
test("reports navigation is HR-only", async () => {
  const sidebar = await readFile(new URL("../../components/sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /role === "hr_admin" \|\| role === "super_admin"/);
  assert.match(sidebar, /\["\/reports", "Reports", BarChart3\]/);
});

test("README documents Phase 5C migration, routes, limits, and exports", async () => {
  const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
  for (const value of ["202607150004_attendance_reports_payroll_export.sql", "/reports", "/api/reports/export/csv", "/api/reports/export/xlsx", "25,000", "Asia/Manila"]) assert.match(readme, new RegExp(value.replaceAll("/", "\\/")));
});
```

- [ ] **Step 2: Run UI tests and verify failures**

Run:

```bash
npm test -- src/features/reports/ui.test.ts src/features/reports/export-routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add loading and retryable error files**

`loading.tsx` renders a `PageHeader` plus skeleton cards and table rows with `aria-busy="true"`.

`error.tsx` must be a client component:

```tsx
"use client";

export default function ReportsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card report-error" role="alert">
      <h1>The report could not be loaded.</h1>
      <p className="muted">Your selected filters were preserved. Try loading the report again.</p>
      <button className="btn" type="button" onClick={reset}>Retry</button>
    </section>
  );
}
```

- [ ] **Step 4: Restrict sidebar Reports link to HR roles**

Move `Reports` into an HR-only navigation array. Employees retain My Attendance and My Overtime but do not receive the Reports link.

- [ ] **Step 5: Add responsive report CSS**

Add focused classes for:

```text
.report-filter-form
.report-tabs
.report-summary-grid
.report-table-wrap
.report-table
.report-overtime-cells
.report-export-grid
.report-pagination
.report-mode-note
.report-error
```

At widths below 900px, filter controls stack, tabs horizontally scroll, and tables remain inside an overflow container. Do not reduce touch targets below 44px.

- [ ] **Step 6: Update settings status and README**

Change the settings backend-status text so reports are connected while leave, documents, notifications, and payroll remain future phases. Document:

- Migration application order.
- Both report modes and date limits.
- Four CSV datasets.
- Four-sheet workbook.
- HR-only access.
- No salary or payroll computation.
- Manual verification commands.

- [ ] **Step 7: Run UI and documentation tests**

Run:

```bash
npm test -- src/features/reports/ui.test.ts src/features/reports/export-routes.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit presentation and documentation**

```bash
git add 'src/app/(dashboard)/reports/loading.tsx' 'src/app/(dashboard)/reports/error.tsx' src/components/sidebar.tsx 'src/app/(dashboard)/settings/page.tsx' src/app/globals.css README.md src/features/reports/ui.test.ts src/features/reports/export-routes.test.ts
git commit -m "feat: finish attendance report experience"
```

---

### Task 14: Integration, query-plan, security, and final acceptance verification

**Files:**
- Modify: `src/features/reports/migration.test.ts`
- Modify: `src/features/reports/security.test.ts`
- Modify: `src/features/reports/queries.test.ts`
- Modify: `src/features/reports/csv.test.ts`
- Modify: `src/features/reports/xlsx.test.ts`
- Modify: `src/features/reports/ui.test.ts`
- Modify: `src/features/reports/export-routes.test.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies the complete Phase 5C contract and leaves deployment commands for Supabase and Vercel.

- [ ] **Step 1: Add final acceptance source tests**

Add explicit assertions for:

```ts
const forbidden = [
  "government", "bank", "salary", "approval_note", "rejection_reason",
  "recalculation_reason", "change_reason", "reviewed_by", "attendance_note",
];
for (const name of forbidden) assert.doesNotMatch(reportFunctionBodies, new RegExp(name, "i"));
```

Add tests confirming:

- Payroll RPC predicates exclude provisional rows.
- Operational RPCs allow provisional rows.
- Summary SQL has no attendance-rate field.
- Approved overtime checks active detection and no supersession.
- Daily rows pivot pre-shift and post-shift without duplicate attendance rows.
- Exception rows use a lateral expansion.
- All five report RPCs return stable secondary sort keys.
- CSV and XLSX column lists contain the same authoritative minute fields.
- Export routes do not import `exceljs` into client components.
- No generated file is written with `writeFile`, Supabase Storage, or a temporary path.

- [ ] **Step 2: Run the complete automated test suite**

Run:

```bash
npm test
```

Expected: all existing 342 tests plus Phase 5C tests pass with zero failures.

- [ ] **Step 3: Run TypeScript and production build**

Run:

```bash
npx tsc --noEmit
npm run build
```

Expected: both commands exit 0; build output includes `/reports`, `/api/reports/export/csv`, and `/api/reports/export/xlsx`.

- [ ] **Step 4: Apply the migration in a preview Supabase project**

Apply only:

```text
supabase/migrations/202607150004_attendance_reports_payroll_export.sql
```

Verify functions:

```sql
select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_attendance_report_summary',
    'get_attendance_daily_report',
    'get_employee_attendance_summary',
    'get_attendance_exception_report',
    'get_overtime_holiday_report',
    'record_attendance_report_export'
  )
order by p.proname;
```

Expected: six rows and every `prosecdef` is `true`.

Verify client roles cannot access internal views:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('report_attendance_source_v1', 'report_overtime_source_v1')
  and grantee in ('anon', 'authenticated');
```

Expected: zero rows.

- [ ] **Step 5: Run role and functional acceptance checks**

Verify:

1. HR Admin and Super Admin can open `/reports`.
2. Employee accounts are redirected away and have no Reports sidebar link.
3. Current-month Payroll mode loads by default.
4. Operational mode displays finalized and provisional totals separately.
5. A 32-day operational range is rejected.
6. A 367-day payroll range is rejected.
7. Future end dates are rejected.
8. Missing clock-out rows export blank worked minutes.
9. Absence and holiday-without-attendance rows export zero worked minutes.
10. One date with pre-shift and post-shift overtime remains one daily row.
11. Pending, rejected, and superseded overtime contribute zero approved minutes.
12. The summary separates three holiday-work types.
13. CSV formula-like employee text is prefixed with an apostrophe.
14. XLSX contains exactly four visible sheets.
15. Successful exports add one `attendance_report` audit row with safe metadata.
16. A forced audit failure returns no file.

- [ ] **Step 6: Review query plans**

In the preview database, run `EXPLAIN (ANALYZE, BUFFERS)` for representative daily, employee summary, and overtime report calls over a 366-day range. Confirm the report date and active-pointer indexes are used and there is no unbounded sequential scan over all attendance revisions or all overtime approvals. Record the reviewed commands in README without copying employee data or timing values from production.

- [ ] **Step 7: Commit final verification updates**

```bash
git add src/features/reports README.md
git commit -m "test: verify attendance reporting and exports"
```

---

## Self-review results

### Specification coverage

Every approved requirement maps to a task:

- Database authority, active revision resolution, security, and limits: Tasks 2–6.
- Operational and Payroll modes: Tasks 1, 3, 7–9.
- Daily, summary, exception, and overtime datasets: Tasks 3–5, 7–9.
- Stable pagination and current organization filters: Tasks 3–5, 7–9.
- CSV and XLSX exports: Tasks 10–11.
- Safe export audit and ordered failure behavior: Tasks 6 and 12.
- HR-only authorization, navigation, and safe errors: Tasks 6–9 and 13.
- Performance, security, and acceptance verification: Task 14.
- Phase boundaries and forward compatibility: Global Constraints and README work.

### Placeholder scan

The plan contains no unfinished markers, deferred implementation markers, or unspecified test requests. Every created module has an exact path, exported interface, failing-test command, implementation contract, passing-test command, and commit command.

### Type and signature consistency

- TypeScript names use `startDate`/`endDate`; RPC arguments use `p_start_date`/`p_end_date` only at the adapter boundary.
- Every paginated row includes `total_count` and maps to `PaginatedReport<T>`.
- Export datasets use exactly `daily`, `employee_summary`, `exceptions`, and `overtime_holiday`.
- Public SQL function signatures in grants match their declarations.
- CSV and XLSX consume the same normalized row types returned by `queries.ts`.
- Audit uses `employee_id = null` and direct insertion because the existing generic audit writer validates a non-null employee.
- The XLSX dependency remains server-only and is never imported by a client component.

## Execution handoff

Plan complete and saved to:

```text
docs/superpowers/plans/2026-07-15-phase-5c-attendance-reports-payroll-export.md
```

Execution options:

1. **Subagent-Driven (recommended)** — execute one task at a time with fresh review gates.
2. **Inline Execution** — execute in this session using the executing-plans workflow with checkpoints.
