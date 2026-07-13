import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAttendanceForm } from "@/components/attendance/admin-attendance-form";
import { PageHeader } from "@/components/page-header";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { getActiveAttendanceEmployees } from "@/features/attendance/queries";
import { createAttendanceByHr } from "../../../attendance/actions";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

export default async function NewAdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAttendanceAdmin();
  const raw = await searchParams;
  const employeeId = value(raw.employee);
  const employees = await getActiveAttendanceEmployees();
  const selected = employeeId
    ? employees.find((employee) => employee.id === employeeId)
    : null;

  if (employeeId && !selected) notFound();

  return (
    <>
      <PageHeader
        title="Create attendance record"
        description="Add a missing official record with a required correction reason."
        action={<Link className="btn" href="/admin/attendance">Back to attendance</Link>}
      />

      <section className="card">
        <form className="toolbar" method="get">
          <label className="form-field-wide">
            <span className="sr-only">Employee</span>
            <select className="field" name="employee" defaultValue={employeeId} required>
              <option value="">Select an active employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.last_name}, {employee.first_name} · {employee.employee_number}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit">Continue</button>
        </form>
      </section>

      {selected ? (
        <>
          <p className="muted">Creating attendance for <strong>{selected.first_name} {selected.last_name}</strong>.</p>
          <AdminAttendanceForm
            employeeId={selected.id}
            action={createAttendanceByHr.bind(null, selected.id)}
            initialRecord={null}
            submitLabel="Create attendance"
          />
        </>
      ) : (
        <div className="empty">Select an employee to enter attendance details.</div>
      )}
    </>
  );
}
