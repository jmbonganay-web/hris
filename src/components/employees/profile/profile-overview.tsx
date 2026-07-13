import type { ExpandedEmployeeProfile } from "@/features/employees/types";
import { ProfileSection } from "./profile-section";

function display(value: string | null | undefined) {
  return value || "Not provided";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(`${value}T00:00:00`));
}

export function ProfileOverview({ profile, canManage }: { profile: ExpandedEmployeeProfile; canManage: boolean }) {
  const { employee, personal, emergencyContacts } = profile;
  const primaryContact = emergencyContacts.find((contact) => contact.is_primary) ?? emergencyContacts[0];
  const fields = [
    personal?.preferred_name,
    personal?.date_of_birth,
    personal?.personal_email,
    personal?.phone,
    personal?.address_line_1,
    employee.department_id,
    employee.job_title_id,
    employee.manager_id,
    employee.work_location,
    primaryContact?.id,
  ];
  const completion = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  return (
    <div className="profile-overview-grid">
      <ProfileSection title="Contact details" editHref={`/employees/${employee.id}/personal/edit`} canManage={canManage}>
        <dl className="profile-summary-list">
          <div><dt>Work email</dt><dd>{employee.work_email}</dd></div>
          <div><dt>Personal email</dt><dd>{display(personal?.personal_email)}</dd></div>
          <div><dt>Phone</dt><dd>{display(personal?.phone)}</dd></div>
          <div><dt>Location</dt><dd>{display([personal?.city, personal?.country].filter(Boolean).join(", "))}</dd></div>
        </dl>
      </ProfileSection>

      <ProfileSection title="Employment summary" editHref={`/employees/${employee.id}/employment/edit`} canManage={canManage}>
        <dl className="profile-summary-list">
          <div><dt>Department</dt><dd>{display(employee.department?.name)}</dd></div>
          <div><dt>Job title</dt><dd>{display(employee.job_title?.title)}</dd></div>
          <div><dt>Employment type</dt><dd>{employee.employment_type.replaceAll("_", " ")}</dd></div>
          <div><dt>Work schedule</dt><dd>{display(employee.work_schedule)}</dd></div>
        </dl>
      </ProfileSection>

      <ProfileSection title="Manager" editHref={`/employees/${employee.id}/manager/edit`} canManage={canManage}>
        <p className="profile-primary-value">
          {employee.manager ? `${employee.manager.first_name} ${employee.manager.last_name}` : "No manager assigned"}
        </p>
        {employee.manager && <p className="muted">{employee.manager.employee_number}</p>}
      </ProfileSection>

      <ProfileSection title="Primary emergency contact" editHref={`/employees/${employee.id}?tab=emergency`} canManage={canManage}>
        {primaryContact ? (
          <dl className="profile-summary-list compact">
            <div><dt>Name</dt><dd>{primaryContact.full_name}</dd></div>
            <div><dt>Relationship</dt><dd>{primaryContact.relationship}</dd></div>
            <div><dt>Phone</dt><dd>{primaryContact.phone}</dd></div>
          </dl>
        ) : <p className="muted">No emergency contacts added.</p>}
      </ProfileSection>

      <ProfileSection title="Important dates" editHref={`/employees/${employee.id}/employment/edit`} canManage={canManage}>
        <dl className="profile-summary-list">
          <div><dt>Hire date</dt><dd>{formatDate(employee.hire_date)}</dd></div>
          <div><dt>Probation ends</dt><dd>{formatDate(employee.probation_end_date)}</dd></div>
          <div><dt>Regularization</dt><dd>{formatDate(employee.regularization_date)}</dd></div>
          <div><dt>Date of birth</dt><dd>{formatDate(personal?.date_of_birth)}</dd></div>
        </dl>
      </ProfileSection>

      <ProfileSection title="Profile completeness" description="Complete profiles make later attendance, leave, and document workflows more reliable.">
        <div className="profile-completeness" aria-label={`${completion}% profile complete`}>
          <div className="profile-completeness-bar"><span style={{ width: `${completion}%` }} /></div>
          <strong>{completion}%</strong>
        </div>
      </ProfileSection>
    </div>
  );
}
