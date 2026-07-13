import { notFound } from "next/navigation";
import { HrNoteForm } from "@/components/employees/profile/hr-note-form";
import { PageHeader } from "@/components/page-header";
import { requireHrNoteManager } from "@/features/employees/hr-notes/auth";
import { getEmployee } from "@/features/employees/queries";
import { createHrNote } from "../../hr-note-actions";

export default async function NewEmployeeHrNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireHrNoteManager(id);
  const employee = await getEmployee(id);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="New HR note"
        description={`Add a private note for ${employee.first_name} ${employee.last_name}.`}
      />
      <HrNoteForm
        employeeId={id}
        action={createHrNote.bind(null, id)}
        submitLabel="Save HR note"
      />
    </>
  );
}
