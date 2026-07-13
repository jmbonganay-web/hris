import Link from "next/link";
import { notFound } from "next/navigation";
import { HrNoteCard } from "@/components/employees/profile/hr-note-card";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { PageHeader } from "@/components/page-header";
import { requireDeletedHrNoteManager } from "@/features/employees/hr-notes/auth";
import { getDeletedHrNotes } from "@/features/employees/hr-notes/queries";
import { getEmployee } from "@/features/employees/queries";
import { restoreHrNote } from "../../hr-note-actions";

export default async function DeletedEmployeeHrNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const context = await requireDeletedHrNoteManager(id);
  if (!context.employeeExists) notFound();

  const [employee, notes] = await Promise.all([
    getEmployee(id),
    getDeletedHrNotes(id),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="Deleted HR notes"
        description={`Super Admin recovery archive for ${employee.first_name} ${employee.last_name}.`}
        action={(
          <Link className="btn" href={`/employees/${id}/hr-notes`}>
            Back to active notes
          </Link>
        )}
      />

      {query.error && (
        <p className="form-error" role="alert">
          The note could not be restored.
        </p>
      )}

      <ProfileTabs employeeId={id} active="hr_notes" canManage />

      {notes.length === 0 ? (
        <div className="card empty">No deleted HR notes.</div>
      ) : (
        <div className="hr-note-list">
          {notes.map((note) => (
            <HrNoteCard
              key={note.id}
              note={note}
              employeeId={id}
              deleted
              restoreAction={restoreHrNote.bind(null, id, note.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
