import Link from "next/link";
import { notFound } from "next/navigation";
import { HrNoteCard } from "@/components/employees/profile/hr-note-card";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { requireHrNoteManager } from "@/features/employees/hr-notes/auth";
import { getActiveHrNotes } from "@/features/employees/hr-notes/queries";
import {
  hrNoteCategories,
  type HrNoteCategory,
} from "@/features/employees/hr-notes/types";
import { getEmployee } from "@/features/employees/queries";
import { deleteHrNote } from "../hr-note-actions";

const filterLabels: Record<"all" | HrNoteCategory, string> = {
  all: "All",
  general: "General",
  performance: "Performance",
  disciplinary: "Disciplinary",
  medical: "Medical",
  payroll: "Payroll",
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmployeeHrNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const context = await requireHrNoteManager(id);
  const requestedCategory = firstQueryValue(query.category);
  const category = hrNoteCategories.includes(requestedCategory as HrNoteCategory)
    ? requestedCategory as HrNoteCategory
    : undefined;

  const [employee, notes] = await Promise.all([
    getEmployee(id),
    getActiveHrNotes(id, category),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="HR Notes"
        description={`Private, encrypted HR notes for ${employee.first_name} ${employee.last_name}.`}
        action={(
          <div className="header-actions">
            {context.role === "super_admin" && (
              <Link className="btn" href={`/employees/${id}/hr-notes/deleted`}>
                View deleted notes
              </Link>
            )}
            <Link className="btn primary" href={`/employees/${id}/hr-notes/new`}>
              New HR note
            </Link>
          </div>
        )}
      />

      {query.success === "note_created" && (
        <p className="form-success">HR note created.</p>
      )}
      {query.success === "note_updated" && (
        <p className="form-success">HR note updated.</p>
      )}
      {query.success === "note_deleted" && (
        <p className="form-success">HR note moved to the deleted archive.</p>
      )}
      {query.success === "note_restored" && (
        <p className="form-success">HR note restored.</p>
      )}
      {query.error && (
        <p className="form-error" role="alert">
          The requested HR note action could not be completed.
        </p>
      )}

      <ProfileTabs employeeId={id} active="hr_notes" canManage />

      <section className="card hr-note-toolbar" aria-label="Filter HR notes">
        {(["all", ...hrNoteCategories] as const).map((filter) => (
          <Link
            key={filter}
            className={`btn${(category ?? "all") === filter ? " primary" : ""}`}
            href={
              filter === "all"
                ? `/employees/${id}/hr-notes`
                : `/employees/${id}/hr-notes?category=${filter}`
            }
          >
            {filterLabels[filter]}
          </Link>
        ))}
      </section>

      {notes.length === 0 ? (
        <div className="card empty">
          No HR notes have been added for this employee.
        </div>
      ) : (
        <div className="hr-note-list">
          {notes.map((note) => {
            const canManageNote = context.role === "super_admin"
              || note.created_by === context.user.id;
            return (
              <HrNoteCard
                key={note.id}
                note={note}
                employeeId={id}
                canEdit={canManageNote && !note.contentUnavailable}
                canDelete={canManageNote}
                deleteAction={deleteHrNote.bind(null, id, note.id)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
