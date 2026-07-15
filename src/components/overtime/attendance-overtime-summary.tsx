import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import {
  overtimeApprovalStatusLabel,
  overtimeSegmentLabel,
} from "@/features/overtime/presentation";
import type { AttendanceOvertimeSummary } from "@/features/overtime/types";

export function AttendanceOvertimeSummary({
  items,
  compact = false,
}: {
  items: AttendanceOvertimeSummary[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`attendance-overtime-summary${compact ? " compact" : ""}`}>
      {items.map((item) => (
        <div key={`${item.segment_type}:${item.status}:${item.detected_minutes}`}>
          <span>{overtimeSegmentLabel(item.segment_type)}</span>
          <strong>
            {overtimeApprovalStatusLabel(item.status)} · {formatAttendanceMinutes(item.detected_minutes)}
          </strong>
        </div>
      ))}
    </div>
  );
}
