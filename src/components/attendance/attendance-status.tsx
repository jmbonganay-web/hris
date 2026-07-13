import type { AttendanceEffectiveStatus } from "@/features/attendance/types";

const labels: Record<AttendanceEffectiveStatus, string> = {
  clocked_in: "Clocked in",
  completed: "Completed",
  missing_clock_out: "Missing clock-out",
};

export function AttendanceStatus({
  status,
  corrected = false,
}: {
  status: AttendanceEffectiveStatus;
  corrected?: boolean;
}) {
  const tone = status === "completed"
    ? "success"
    : status === "missing_clock_out"
      ? "warning"
      : "info";

  return (
    <span className="attendance-badges">
      <span className={`badge ${tone}`}>{labels[status]}</span>
      {corrected && <span className="badge info">Corrected</span>}
    </span>
  );
}
