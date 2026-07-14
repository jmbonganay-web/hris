import type { AttendanceCalculationRevision } from "@/features/attendance/calculations/types";
import {
  attendanceBaseStatusLabel,
  attendanceCalculationFlags,
} from "@/features/attendance/calculations/presentation";

export function CalculationStatus({
  calculation,
  compact = false,
}: {
  calculation: AttendanceCalculationRevision;
  compact?: boolean;
}) {
  return (
    <div className={`calculation-status${compact ? " compact" : ""}`}>
      <span className="badge info">
        {attendanceBaseStatusLabel(calculation.base_status)}
      </span>
      {attendanceCalculationFlags(calculation).map((flag) => (
        <span className="badge warning" key={flag}>{flag}</span>
      ))}
      <span className={`badge ${calculation.is_provisional ? "warning" : "success"}`}>
        {calculation.is_provisional ? "Provisional" : "Finalized"}
      </span>
    </div>
  );
}
