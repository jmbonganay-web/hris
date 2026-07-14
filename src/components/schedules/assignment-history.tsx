import type { EmployeeScheduleAssignment } from "@/features/schedules/types";

function actorName(assignment: EmployeeScheduleAssignment) {
  const creator = assignment.creator;
  if (!creator) return "System / database operation";
  return creator.display_name || `${creator.first_name} ${creator.last_name}`;
}

function stateFor(assignment: EmployeeScheduleAssignment, companyDate: string) {
  if (assignment.is_superseded) return "Superseded";
  if (assignment.effective_start_date > companyDate) return "Upcoming";
  if (assignment.effective_end_date && assignment.effective_end_date < companyDate) return "Previous";
  return "Current";
}

export function AssignmentHistory({ assignments, companyDate, showReasons }: { assignments: EmployeeScheduleAssignment[]; companyDate: string; showReasons: boolean }) {
  if (assignments.length === 0) return <div className="empty"><h3>No schedule assignments</h3><p>This employee has not been assigned a work schedule.</p></div>;
  return <div className="assignment-card-grid">{assignments.map((assignment) => <article className="card schedule-template-card" key={assignment.id}><div className="section-heading-row"><div><span className="muted">{assignment.template?.code ?? "Unknown schedule"}</span><h2>{assignment.template?.name ?? "Schedule unavailable"}</h2></div><span className={`badge ${assignment.is_superseded ? "warning" : stateFor(assignment, companyDate) === "Current" ? "success" : "info"}`}>{stateFor(assignment, companyDate)}</span></div><dl className="detail-list"><div><dt>Effective start</dt><dd>{assignment.effective_start_date}</dd></div><div><dt>Effective end</dt><dd>{assignment.effective_end_date ?? "Ongoing"}</dd></div><div><dt>Assigned by</dt><dd>{actorName(assignment)}</dd></div>{showReasons && <div><dt>Reason</dt><dd>{assignment.assignment_reason || "Not provided"}</dd></div>}</dl></article>)}</div>;
}
