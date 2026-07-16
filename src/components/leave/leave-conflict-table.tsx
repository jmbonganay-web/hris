import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import { leaveConflictLabel, leaveDurationLabel } from "@/features/leave/presentation";
import type { LeaveAttendanceConflict } from "@/features/leave/types";
import { ResolveLeaveConflictForm } from "./resolve-leave-conflict-form";
import type { LeaveActionState } from "@/features/leave/types";

export function LeaveConflictTable({
  conflicts,
  resolveAction,
}: {
  conflicts: LeaveAttendanceConflict[];
  resolveAction: (conflictId: string, state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  if (conflicts.length === 0) return <div className="empty-state"><p>No leave-attendance conflicts match these filters.</p></div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Date</th><th>Leave type</th><th>Duration</th><th>Conflict</th><th>Attendance</th><th>Balance action</th><th>Created</th><th>Status</th><th>Review</th></tr></thead>
        <tbody>
          {conflicts.map((conflict) => (
            <tr key={conflict.conflictId}>
              <td>{conflict.employeeName}<span className="muted">{conflict.employeeNumber ? ` · ${conflict.employeeNumber}` : ""}</span></td>
              <td>{formatCompanyDate(conflict.leaveDate)}</td>
              <td>{conflict.leaveTypeName}</td>
              <td>{leaveDurationLabel(conflict.durationMode)}</td>
              <td>{leaveConflictLabel(conflict.conflictType)}</td>
              <td>{conflict.attendanceBaseStatus ?? "—"}</td>
              <td>{conflict.automaticBalanceAction ?? "None"}</td>
              <td>{formatCompanyDateTime(conflict.createdAt)}</td>
              <td><span className={`badge ${conflict.status === "open" ? "warning" : "success"}`}>{conflict.status}</span></td>
              <td>{conflict.status === "open" ? <ResolveLeaveConflictForm action={resolveAction.bind(null, conflict.conflictId)} /> : "Reviewed"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
