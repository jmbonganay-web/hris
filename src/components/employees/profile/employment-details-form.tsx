"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type {
  DepartmentOption,
  EmployeeActionState,
  EmployeeRecord,
  JobTitleOption,
} from "@/features/employees/types";

const initialState: EmployeeActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function availabilitySuffix(item: { is_active: boolean; archived_at: string | null }) {
  if (item.archived_at) return " (Archived)";
  if (!item.is_active) return " (Inactive)";
  return "";
}

export function EmploymentDetailsForm({
  employee,
  departments,
  jobTitles,
  action,
}: {
  employee: EmployeeRecord;
  departments: DepartmentOption[];
  jobTitles: JobTitleOption[];
  action: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};
  const [departmentId, setDepartmentId] = useState(employee.department_id ?? "");
  const [jobTitleId, setJobTitleId] = useState(employee.job_title_id ?? "");

  const visibleJobTitles = useMemo(() => jobTitles.filter((jobTitle) => {
    if (jobTitle.id === employee.job_title_id) return !jobTitle.department_id || jobTitle.department_id === departmentId;
    if (!jobTitle.is_active || jobTitle.archived_at) return false;
    if (!departmentId) return jobTitle.department_id === null;
    return jobTitle.department_id === null || jobTitle.department_id === departmentId;
  }), [departmentId, employee.job_title_id, jobTitles]);

  function updateDepartment(next: string) {
    setDepartmentId(next);
    const currentJob = jobTitles.find((jobTitle) => jobTitle.id === jobTitleId);
    if (currentJob?.department_id && currentJob.department_id !== next) setJobTitleId("");
  }

  return (
    <form action={formAction} className="card employee-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <section className="form-section">
        <div><h2>Employee record</h2><p className="muted">Company identity and employment status.</p></div>
        <div className="form-grid">
          <label><span>Employee ID *</span><input className="field" name="employee_number" defaultValue={employee.employee_number} aria-invalid={Boolean(errors.employee_number)} /><ErrorText message={errors.employee_number} /></label>
          <label><span>Work email *</span><input className="field" type="email" name="work_email" defaultValue={employee.work_email} aria-invalid={Boolean(errors.work_email)} /><ErrorText message={errors.work_email} /></label>
          <label><span>First name *</span><input className="field" name="first_name" defaultValue={employee.first_name} aria-invalid={Boolean(errors.first_name)} /><ErrorText message={errors.first_name} /></label>
          <label><span>Last name *</span><input className="field" name="last_name" defaultValue={employee.last_name} aria-invalid={Boolean(errors.last_name)} /><ErrorText message={errors.last_name} /></label>
          <label><span>Employment type *</span><select className="field" name="employment_type" defaultValue={employee.employment_type}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></label>
          <label><span>Status *</span><select className="field" name="employment_status" defaultValue={employee.employment_status}><option value="active">Active</option><option value="probation">Probation</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select></label>
        </div>
      </section>

      <section className="form-section">
        <div><h2>Organization</h2><p className="muted">Department and role assignments from Organization Management.</p></div>
        <div className="form-grid">
          <label><span>Department</span><select className="field" name="department_id" value={departmentId} onChange={(event) => updateDepartment(event.target.value)} aria-invalid={Boolean(errors.department_id)}><option value="">Unassigned</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}{availabilitySuffix(item)}</option>)}</select><ErrorText message={errors.department_id} /></label>
          <label><span>Job title</span><select className="field" name="job_title_id" value={jobTitleId} onChange={(event) => setJobTitleId(event.target.value)} aria-invalid={Boolean(errors.job_title_id)}><option value="">Unassigned</option>{visibleJobTitles.map((item) => <option key={item.id} value={item.id}>{item.title}{availabilitySuffix(item)}</option>)}</select><small className="muted">Job titles are filtered by department.</small><ErrorText message={errors.job_title_id} /></label>
        </div>
      </section>

      <section className="form-section">
        <div><h2>Dates and work arrangement</h2><p className="muted">Employment milestones and regular working arrangement.</p></div>
        <div className="form-grid">
          <label><span>Hire date *</span><input className="field" type="date" name="hire_date" defaultValue={employee.hire_date} aria-invalid={Boolean(errors.hire_date)} /><ErrorText message={errors.hire_date} /></label>
          <label><span>Probation end date</span><input className="field" type="date" name="probation_end_date" defaultValue={employee.probation_end_date ?? ""} aria-invalid={Boolean(errors.probation_end_date)} /><ErrorText message={errors.probation_end_date} /></label>
          <label><span>Regularization date</span><input className="field" type="date" name="regularization_date" defaultValue={employee.regularization_date ?? ""} aria-invalid={Boolean(errors.regularization_date)} /><ErrorText message={errors.regularization_date} /></label>
          <label><span>Work location</span><input className="field" name="work_location" defaultValue={employee.work_location ?? ""} placeholder="e.g. Manila, Remote" /></label>
          <label className="form-field-wide"><span>Work schedule</span><input className="field" name="work_schedule" defaultValue={employee.work_schedule ?? ""} placeholder="e.g. Monday–Friday, 8:00 AM–5:00 PM" /></label>
        </div>
      </section>

      <div className="form-actions"><Link className="btn" href={`/employees/${employee.id}?tab=employment`}>Cancel</Link><button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save employment information"}</button></div>
    </form>
  );
}
