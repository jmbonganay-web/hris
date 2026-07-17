import type {
  DashboardActionItem,
  DashboardAnalytics,
  DashboardBreakdownItem,
  DashboardLeaveBalance,
  DashboardLeaveItem,
  DashboardRange,
  DashboardRecentHire,
  DashboardScheduleSummary,
  DashboardTrendPoint,
} from "./types.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeTrend(value: unknown): DashboardTrendPoint[] {
  return array(value).map((item) => {
    const row = record(item);
    return {
      date: string(row.date),
      present: number(row.present),
      absent: number(row.absent),
      exceptions: number(row.exceptions),
    };
  }).filter((item) => item.date);
}

function normalizeBreakdown(value: unknown): DashboardBreakdownItem[] {
  return array(value).map((item) => {
    const row = record(item);
    return { label: string(row.label), value: number(row.value) };
  }).filter((item) => item.label);
}

function normalizeActions(value: unknown): DashboardActionItem[] {
  return array(value).map((item) => {
    const row = record(item);
    const tone: DashboardActionItem["tone"] = row.tone === "warning" || row.tone === "danger" ? row.tone : "default";
    return {
      key: string(row.key),
      label: string(row.label),
      count: number(row.count),
      href: string(row.href, "/dashboard"),
      tone,
    };
  }).filter((item) => item.key && item.label);
}

function normalizeLeave(value: unknown): DashboardLeaveItem[] {
  return array(value).map((item) => {
    const row = record(item);
    return {
      id: string(row.id),
      employeeName: nullableString(row.employeeName),
      leaveType: string(row.leaveType, "Leave"),
      startDate: string(row.startDate),
      endDate: string(row.endDate),
      status: string(row.status),
    };
  }).filter((item) => item.id && item.startDate && item.endDate);
}

function normalizeAttendance(payload: Record<string, unknown>) {
  const attendance = record(payload.attendance);
  return {
    presentDays: number(attendance.presentDays),
    absentDays: number(attendance.absentDays),
    exceptionDays: number(attendance.exceptionDays),
    lateDays: number(attendance.lateDays),
    undertimeDays: number(attendance.undertimeDays),
    trend: normalizeTrend(attendance.trend),
  };
}

export function normalizeDashboardPayload(
  kind: "hr" | "manager" | "employee",
  raw: unknown,
  range: DashboardRange,
): DashboardAnalytics {
  const payload = record(raw);
  const metrics = record(payload.metrics);
  const attendance = normalizeAttendance(payload);

  if (kind === "hr") {
    const recentHires: DashboardRecentHire[] = array(payload.recentHires).map((item) => {
      const row = record(item);
      return {
        id: string(row.id),
        name: string(row.name),
        department: nullableString(row.department),
        jobTitle: nullableString(row.jobTitle),
        hireDate: string(row.hireDate),
        status: string(row.status),
      };
    }).filter((item) => item.id && item.name);
    return {
      kind,
      range,
      metrics: {
        activeEmployees: number(metrics.activeEmployees),
        newHires: number(metrics.newHires),
        pendingLeave: number(metrics.pendingLeave),
        pendingOvertime: number(metrics.pendingOvertime),
        documentIssues: number(metrics.documentIssues),
      },
      attendance,
      workforceStatus: normalizeBreakdown(payload.workforceStatus),
      upcomingLeave: normalizeLeave(payload.upcomingLeave),
      recentHires,
      actions: normalizeActions(payload.actions),
    };
  }

  if (kind === "manager") {
    return {
      kind,
      range,
      directReportCount: number(payload.directReportCount),
      metrics: {
        presentDays: number(metrics.presentDays),
        absentDays: number(metrics.absentDays),
        pendingLeave: number(metrics.pendingLeave),
        documentIssues: number(metrics.documentIssues),
      },
      attendance,
      teamStatus: normalizeBreakdown(payload.teamStatus),
      upcomingLeave: normalizeLeave(payload.upcomingLeave),
      actions: normalizeActions(payload.actions),
    };
  }

  const leaveBalances: DashboardLeaveBalance[] = array(payload.leaveBalances).map((item) => {
    const row = record(item);
    return {
      leaveType: string(row.leaveType),
      availableUnits: nullableNumber(row.availableUnits),
      pendingUnits: number(row.pendingUnits),
      usedUnits: number(row.usedUnits),
    };
  }).filter((item) => item.leaveType);
  const scheduleRow = record(payload.schedule);
  const schedule: DashboardScheduleSummary | null = Object.keys(scheduleRow).length === 0 ? null : {
    state: string(scheduleRow.state),
    scheduleName: nullableString(scheduleRow.scheduleName),
    startTime: nullableString(scheduleRow.startTime),
    endTime: nullableString(scheduleRow.endTime),
    nextEffectiveDate: nullableString(scheduleRow.nextEffectiveDate),
  };
  return {
    kind,
    range,
    metrics: {
      presentDays: number(metrics.presentDays),
      lateDays: number(metrics.lateDays),
      pendingLeave: number(metrics.pendingLeave),
      documentIssues: number(metrics.documentIssues),
      unreadNotifications: number(metrics.unreadNotifications),
    },
    attendance,
    leaveBalances,
    recentLeave: normalizeLeave(payload.recentLeave),
    schedule,
    actions: normalizeActions(payload.actions),
  };
}
