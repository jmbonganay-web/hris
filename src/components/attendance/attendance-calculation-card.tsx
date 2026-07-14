import type { ActiveAttendanceCalculation } from "@/features/attendance/calculations/types";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import { formatCompanyTime } from "@/features/attendance/time";
import { CalculationStatus } from "./calculation-status";

export function AttendanceCalculationCard({
  calculation,
}: {
  calculation: ActiveAttendanceCalculation;
}) {
  return (
    <div className="attendance-calculation-card">
      <CalculationStatus calculation={calculation} />
      <div className="calculation-metrics-grid">
        <div><span>Schedule</span><strong>{calculation.schedule_name ?? "Unassigned"}</strong></div>
        <div><span>Scheduled</span><strong>{calculation.scheduled_start_at ? `${formatCompanyTime(calculation.scheduled_start_at)}–${formatCompanyTime(calculation.scheduled_end_at)}` : "Unavailable"}</strong></div>
        <div><span>Worked</span><strong>{formatAttendanceMinutes(calculation.worked_minutes)}</strong></div>
        <div><span>Late</span><strong>{formatAttendanceMinutes(calculation.late_minutes)}</strong></div>
        <div><span>Undertime</span><strong>{formatAttendanceMinutes(calculation.undertime_minutes)}</strong></div>
      </div>
    </div>
  );
}
