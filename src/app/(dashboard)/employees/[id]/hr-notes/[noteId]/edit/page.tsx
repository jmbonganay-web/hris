import { notFound, redirect } from "next/navigation";
import { HrNoteForm } from "@/components/employees/profile/hr-note-form";
import { PageHeader } from "@/components/page-header";
import { requireHrNoteManager } from "@/features/employees/hr-notes/auth";
import { getHrNoteForEdit } from "@/features/employees/hr-notes/queries";
import { getEmployee } from "@/features/employees/queries";
import { updateHrNote } from "../../../hr-note-actions";

export default async function EditEmployeeHrNotePage({
  params,
}: {
  params: Promise<{ id: string; noteId: string }>;
}) {
  const { id, noteId } = await params;
  const context = await requireHrNoteManager(id);
  const [employee, note] = await Promise.all([
    getEmployee(id),
    getHrNoteForEdit(id, noteId),
  ]);
  if (!employee || !note) notFound();

  if (context.role !== "super_admin" && note.created_by !== context.user.id) {
    redirect(`/employees/${id}/hr-notes?error=unauthorized`);
  }
  if (note.contentUnavailable || note.content === null) {
    redirect(`/employees/${id}/hr-notes?error=note_unavailable`);
  }

  return (
    <>
      <PageHeader
        title="Edit HR note"
        description={`Update a private note for ${employee.first_name} ${employee.last_name}.`}
      />
      <HrNoteForm
        employeeId={id}
        action={updateHrNote.bind(null, id, noteId)}
        initialCategory={note.category}
        initialContent={note.content}
        submitLabel="Update HR note"
      />
    </>
  );
}
