import { CalculationStatus } from "./calculation-status";
import { formatAttendanceMinutes } from "@/features/attendance/calculations/presentation";
import type { HrAttendanceCalculationRevision } from "@/features/attendance/calculations/types";
import { formatCompanyDateTime, formatCompanyTime } from "@/features/attendance/time";

function actorName(item: HrAttendanceCalculationRevision) {
  return item.calculator?.display_name
    || [item.calculator?.first_name, item.calculator?.last_name].filter(Boolean).join(" ")
    || "System / database operation";
}

function Metrics({ revision }: { revision: HrAttendanceCalculationRevision }) {
  return (
    <div className="calculation-metrics-grid calculation-detail-grid">
      <div><span>Scheduled</span><strong>{revision.scheduled_start_at ? `${formatCompanyTime(revision.scheduled_start_at)}–${formatCompanyTime(revision.scheduled_end_at)}` : "Unavailable"}</strong></div>
      <div><span>Scheduled minutes</span><strong>{formatAttendanceMinutes(revision.scheduled_minutes)}</strong></div>
      <div><span>Worked</span><strong>{formatAttendanceMinutes(revision.worked_minutes)}</strong></div>
      <div><span>Late</span><strong>{formatAttendanceMinutes(revision.late_minutes)}</strong></div>
      <div><span>Undertime</span><strong>{formatAttendanceMinutes(revision.undertime_minutes)}</strong></div>
      <div><span>Clock in</span><strong>{formatCompanyTime(revision.actual_clock_in_at)}</strong></div>
      <div><span>Clock out</span><strong>{formatCompanyTime(revision.actual_clock_out_at)}</strong></div>
      <div><span>Source</span><strong>{revision.calculation_source.replaceAll("_", " ")}</strong></div>
    </div>
  );
}

export function AttendanceCalculationDetails({
  active,
  history,
}: {
  active: HrAttendanceCalculationRevision;
  history: HrAttendanceCalculationRevision[];
}) {
  return (
    <>
      <section className="card">
        <div className="section-heading-row"><div><h2 className="card-title">Active calculation</h2><p className="muted">Revision {active.revision_number}</p></div><CalculationStatus calculation={active} /></div>
        <Metrics revision={active} />
        <dl className="detail-grid">
          <div><dt>Attendance record</dt><dd>{active.attendance_record_id ?? "None"}</dd></div>
          <div><dt>Schedule assignment</dt><dd>{active.schedule_assignment_id ?? "None"}</dd></div>
          <div><dt>Schedule version</dt><dd>{active.schedule_version_id ?? "None"}</dd></div>
          <div><dt>Policy version</dt><dd>{active.policy_version_id ?? "Implicit 0-minute grace"}</dd></div>
          <div><dt>Calculated by</dt><dd>{actorName(active)}</dd></div>
          <div><dt>Calculated at</dt><dd>{formatCompanyDateTime(active.calculated_at)}</dd></div>
        </dl>
      </section>
      <section className="card">
        <h2 className="card-title">Revision history</h2>
        <div className="revision-timeline">
          {history.map((revision) => (
            <article className="revision-entry" key={revision.id}>
              <div className="section-heading-row"><strong>Revision {revision.revision_number}</strong><CalculationStatus calculation={revision} compact /></div>
              <Metrics revision={revision} />
              <p className="muted">{actorName(revision)} · {formatCompanyDateTime(revision.calculated_at)}</p>
              {revision.recalculation_reason && <p className="private-reason"><strong>Recalculation reason:</strong> {revision.recalculation_reason}</p>}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
