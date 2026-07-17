export const dashboardPresetValues = [
  "current_month",
  "last_7_days",
  "last_30_days",
  "current_quarter",
  "custom",
] as const;

export type DashboardPreset = (typeof dashboardPresetValues)[number];

export type DashboardRange = {
  preset: DashboardPreset;
  startDate: string;
  endDate: string;
  label: string;
};

export type DashboardTrendPoint = {
  date: string;
  present: number;
  absent: number;
  exceptions: number;
};

export type DashboardBreakdownItem = {
  label: string;
  value: number;
};

export type DashboardActionItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "default" | "warning" | "danger";
};

export type DashboardLeaveItem = {
  id: string;
  employeeName: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
};

export type DashboardRecentHire = {
  id: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  hireDate: string;
  status: string;
};

export type DashboardLeaveBalance = {
  leaveType: string;
  availableUnits: number | null;
  pendingUnits: number;
  usedUnits: number;
};

export type DashboardScheduleSummary = {
  state: string;
  scheduleName: string | null;
  startTime: string | null;
  endTime: string | null;
  nextEffectiveDate: string | null;
};

type AttendanceAnalytics = {
  presentDays: number;
  absentDays: number;
  exceptionDays: number;
  lateDays: number;
  undertimeDays: number;
  trend: DashboardTrendPoint[];
};

export type HrDashboardAnalytics = {
  kind: "hr";
  range: DashboardRange;
  metrics: {
    activeEmployees: number;
    newHires: number;
    pendingLeave: number;
    pendingOvertime: number;
    documentIssues: number;
  };
  attendance: AttendanceAnalytics;
  workforceStatus: DashboardBreakdownItem[];
  upcomingLeave: DashboardLeaveItem[];
  recentHires: DashboardRecentHire[];
  actions: DashboardActionItem[];
};

export type ManagerDashboardAnalytics = {
  kind: "manager";
  range: DashboardRange;
  directReportCount: number;
  metrics: {
    presentDays: number;
    absentDays: number;
    pendingLeave: number;
    documentIssues: number;
  };
  attendance: AttendanceAnalytics;
  teamStatus: DashboardBreakdownItem[];
  upcomingLeave: DashboardLeaveItem[];
  actions: DashboardActionItem[];
};

export type EmployeeDashboardAnalytics = {
  kind: "employee";
  range: DashboardRange;
  metrics: {
    presentDays: number;
    lateDays: number;
    pendingLeave: number;
    documentIssues: number;
    unreadNotifications: number;
  };
  attendance: AttendanceAnalytics;
  leaveBalances: DashboardLeaveBalance[];
  recentLeave: DashboardLeaveItem[];
  schedule: DashboardScheduleSummary | null;
  actions: DashboardActionItem[];
};

export type DashboardAnalytics =
  | HrDashboardAnalytics
  | ManagerDashboardAnalytics
  | EmployeeDashboardAnalytics;
