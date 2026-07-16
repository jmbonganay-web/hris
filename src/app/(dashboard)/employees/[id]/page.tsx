import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveButton } from "@/components/employees/archive-button";
import { AvatarPanel } from "@/components/employees/profile/avatar-panel";
import { DeleteEmergencyContactButton } from "@/components/employees/profile/delete-emergency-contact-button";
import { ProfileOverview } from "@/components/employees/profile/profile-overview";
import { ProfileSection } from "@/components/employees/profile/profile-section";
import { ProfileTabs, type ProfileTab } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireEmployeeProfileAccess } from "@/features/employees/auth";
import { getExpandedEmployeeProfile } from "@/features/employees/profile-queries";
import { archiveEmployee } from "../actions";
import {
  deleteEmergencyContact,
  removeEmployeeAvatar,
  uploadEmployeeAvatar,
} from "./profile-actions";

const validTabs = new Set<ProfileTab>(["overview", "personal", "employment", "emergency"]);

function formatDate(value: string | null | undefined) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(`${value}T00:00:00`));
}

function display(value: string | null | undefined) {
  return value || "Not provided";
}

function successMessage(value: string) {
  const messages: Record<string, string> = {
    created: "Employee created successfully.",
    updated: "Employee updated successfully.",
    personal_updated: "Personal information updated.",
    employment_updated: "Employment information updated.",
    manager_updated: "Manager assignment updated.",
    contact_created: "Emergency contact added.",
    contact_updated: "Emergency contact updated.",
    contact_deleted: "Emergency contact deleted.",
    avatar_updated: "Profile photo updated.",
    avatar_removed: "Profile photo removed.",
  };
  return messages[value] ?? "Employee profile updated.";
}

function errorMessage(value: string) {
  const messages: Record<string, string> = {
    archive_failed: "The employee could not be archived.",
    primary_required: "Assign another primary contact before deleting the current primary contact.",
    contact_delete_failed: "The emergency contact could not be deleted.",
    contact_not_found: "The emergency contact was not found.",
    avatar_remove_failed: "The profile photo could not be removed.",
  };
  return messages[value] ?? "The requested action could not be completed.";
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const access = await requireEmployeeProfileAccess(id);
  const profile = await getExpandedEmployeeProfile(id);
  if (!profile) notFound();

  const { employee, personal, emergencyContacts, avatarUrl } = profile;
  const requestedTab = typeof query.tab === "string" ? query.tab : "overview";
  const activeTab = validTabs.has(requestedTab as ProfileTab) ? requestedTab as ProfileTab : "overview";
  const success = typeof query.success === "string" ? query.success : "";
  const error = typeof query.error === "string" ? query.error : "";
  const legalName = `${employee.first_name} ${employee.last_name}`.trim();
  const displayName = personal?.preferred_name || legalName;
  const archiveAction = archiveEmployee.bind(null, employee.id);
  const uploadAction = uploadEmployeeAvatar.bind(null, employee.id);
  const removeAction = removeEmployeeAvatar.bind(null, employee.id);

  return (
    <>
      <PageHeader
        title={displayName}
        description={`${employee.employee_number} · ${employee.job_title?.title ?? "Unassigned role"}`}
        action={<div className="header-actions"><Link className="btn" href="/employees">Back</Link>{access.canManage && <Link className="btn" href={`/admin/documents/employees/${employee.id}`}>Documents</Link>}{access.canManage && <Link className="btn primary" href={`/employees/${employee.id}/employment/edit`}>Edit employment</Link>}</div>}
      />
      {success && <p className="form-success">{successMessage(success)}</p>}
      {error && <p className="form-error">{errorMessage(error)}</p>}

      <section className="card profile-hero">
        <AvatarPanel name={displayName} avatarUrl={avatarUrl} canManage={access.canManage} uploadAction={uploadAction} removeAction={removeAction} />
        <div className="profile-hero-copy">
          <div className="profile-title-row"><div><p className="profile-eyebrow">Employee profile</p><h2>{displayName}</h2>{personal?.preferred_name && <p className="muted">Legal name: {legalName}</p>}</div><StatusBadge value={employee.employment_status.replaceAll("_", " ")} /></div>
          <div className="profile-hero-meta"><span>{employee.job_title?.title ?? "Unassigned role"}</span><span>{employee.department?.name ?? "Unassigned department"}</span><span>{employee.work_email}</span></div>
        </div>
      </section>

      <ProfileTabs employeeId={employee.id} active={activeTab} canManage={access.canManage} />

      {activeTab === "overview" && <ProfileOverview profile={profile} canManage={access.canManage} />}

      {activeTab === "personal" && (
        <ProfileSection title="Personal information" description="Private personal and contact information." editHref={`/employees/${employee.id}/personal/edit`} canManage={access.canManage}>
          <dl className="detail-list profile-detail-list">
            <div><dt>Legal first name</dt><dd>{employee.first_name}</dd></div>
            <div><dt>Middle name</dt><dd>{display(personal?.middle_name)}</dd></div>
            <div><dt>Legal last name</dt><dd>{employee.last_name}</dd></div>
            <div><dt>Preferred name</dt><dd>{display(personal?.preferred_name)}</dd></div>
            <div><dt>Date of birth</dt><dd>{formatDate(personal?.date_of_birth)}</dd></div>
            <div><dt>Gender</dt><dd>{display(personal?.gender).replaceAll("_", " ")}</dd></div>
            <div><dt>Civil status</dt><dd>{display(personal?.civil_status).replaceAll("_", " ")}</dd></div>
            <div><dt>Nationality</dt><dd>{display(personal?.nationality)}</dd></div>
            <div><dt>Personal email</dt><dd>{display(personal?.personal_email)}</dd></div>
            <div><dt>Phone</dt><dd>{display(personal?.phone)}</dd></div>
            <div className="detail-span"><dt>Address</dt><dd>{display([personal?.address_line_1, personal?.address_line_2, personal?.city, personal?.state_province, personal?.postal_code, personal?.country].filter(Boolean).join(", "))}</dd></div>
          </dl>
        </ProfileSection>
      )}

      {activeTab === "employment" && (
        <div className="profile-section-stack">
          <ProfileSection title="Employment information" description="Role, status, dates, and work arrangement." editHref={`/employees/${employee.id}/employment/edit`} canManage={access.canManage}>
            <dl className="detail-list profile-detail-list">
              <div><dt>Employee ID</dt><dd>{employee.employee_number}</dd></div>
              <div><dt>Work email</dt><dd>{employee.work_email}</dd></div>
              <div><dt>Department</dt><dd>{display(employee.department?.name)}</dd></div>
              <div><dt>Job title</dt><dd>{display(employee.job_title?.title)}</dd></div>
              <div><dt>Employment type</dt><dd>{employee.employment_type.replaceAll("_", " ")}</dd></div>
              <div><dt>Status</dt><dd>{employee.employment_status.replaceAll("_", " ")}</dd></div>
              <div><dt>Hire date</dt><dd>{formatDate(employee.hire_date)}</dd></div>
              <div><dt>Probation end date</dt><dd>{formatDate(employee.probation_end_date)}</dd></div>
              <div><dt>Regularization date</dt><dd>{formatDate(employee.regularization_date)}</dd></div>
              <div><dt>Work location</dt><dd>{display(employee.work_location)}</dd></div>
              <div className="detail-span"><dt>Work schedule</dt><dd>{display(employee.work_schedule)}</dd></div>
            </dl>
          </ProfileSection>
          <ProfileSection title="Reporting manager" description="Only active employees can be newly assigned as managers." editHref={`/employees/${employee.id}/manager/edit`} canManage={access.canManage}>
            {employee.manager ? <div className="manager-summary"><div className="avatar">{employee.manager.first_name[0]}{employee.manager.last_name[0]}</div><div><strong>{employee.manager.first_name} {employee.manager.last_name}</strong><p className="muted">{employee.manager.employee_number}</p></div></div> : <p className="muted">No manager assigned.</p>}
          </ProfileSection>
        </div>
      )}

      {activeTab === "emergency" && (
        <ProfileSection title="Emergency contacts" description="Multiple contacts are supported; one contact must be marked primary." canManage={false}>
          {access.canManage && <div className="profile-section-action-row"><Link className="btn primary" href={`/employees/${employee.id}/emergency-contacts/new`}>Add contact</Link></div>}
          {emergencyContacts.length === 0 ? <div className="empty">No emergency contacts have been added.</div> : <div className="emergency-contact-grid">{emergencyContacts.map((contact) => <article className="emergency-contact-card" key={contact.id}><div className="emergency-contact-heading"><div><h3>{contact.full_name}</h3><p className="muted">{contact.relationship}</p></div>{contact.is_primary && <span className="badge info">Primary</span>}</div><dl className="profile-summary-list compact"><div><dt>Phone</dt><dd>{contact.phone}</dd></div><div><dt>Email</dt><dd>{display(contact.email)}</dd></div></dl>{access.canManage && <div className="emergency-contact-actions"><Link className="btn" href={`/employees/${employee.id}/emergency-contacts/${contact.id}/edit`}>Edit</Link><DeleteEmergencyContactButton action={deleteEmergencyContact.bind(null, employee.id, contact.id)} isPrimary={contact.is_primary} /></div>}</article>)}</div>}
        </ProfileSection>
      )}

      {access.canManage && (
        <div className="card danger-zone profile-danger-zone"><div><h2>Archive employee</h2><p className="muted">Removes this employee from the active directory without permanently deleting the record.</p></div><ArchiveButton action={archiveAction} /></div>
      )}
    </>
  );
}
