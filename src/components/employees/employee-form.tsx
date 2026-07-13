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

type Props = {
  action: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
  departments: DepartmentOption[];
  jobTitles: JobTitleOption[];
  employee?: EmployeeRecord;
};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function availabilitySuffix(item: { is_active: boolean; archived_at: string | null }) {
  if (item.archived_at) return " (Archived)";
  if (!item.is_active) return " (Inactive)";
  return "";
}

export function EmployeeForm({ action, departments, jobTitles, employee }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};
  const [departmentId, setDepartmentId] = useState(employee?.department_id ?? "");
  const [jobTitleId, setJobTitleId] = useState(employee?.job_title_id ?? "");

  const visibleJobTitles = useMemo(() => {
    return jobTitles.filter((jobTitle) => {
      if (jobTitle.id === employee?.job_title_id) {
        return !jobTitle.department_id || jobTitle.department_id === departmentId;
      }
      if (!jobTitle.is_active || jobTitle.archived_at) return false;
      if (!departmentId) return jobTitle.department_id === null;
      return jobTitle.department_id === null || jobTitle.department_id === departmentId;
    });
  }, [departmentId, employee?.job_title_id, jobTitles]);

  function handleDepartmentChange(nextDepartmentId: string) {
    setDepartmentId(nextDepartmentId);
    const selectedJobTitle = jobTitles.find((jobTitle) => jobTitle.id === jobTitleId);
    if (
      selectedJobTitle &&
      selectedJobTitle.department_id &&
      selectedJobTitle.department_id !== nextDepartmentId
    ) {
      setJobTitleId("");
    }
  }

  return (
    <form action={formAction} className="card employee-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <section className="form-section">
        <div><h2>Basic information</h2><p className="muted">Core identity and company contact details.</p></div>
        <div className="form-grid">
          <label><span>Employee ID *</span><input className="field" name="employee_number" defaultValue={employee?.employee_number} aria-invalid={Boolean(errors.employee_number)} /><ErrorText message={errors.employee_number} /></label>
          <label><span>Work email *</span><input className="field" type="email" name="work_email" defaultValue={employee?.work_email} aria-invalid={Boolean(errors.work_email)} /><ErrorText message={errors.work_email} /></label>
          <label><span>First name *</span><input className="field" name="first_name" defaultValue={employee?.first_name} aria-invalid={Boolean(errors.first_name)} /><ErrorText message={errors.first_name} /></label>
          <label><span>Last name *</span><input className="field" name="last_name" defaultValue={employee?.last_name} aria-invalid={Boolean(errors.last_name)} /><ErrorText message={errors.last_name} /></label>
          <label><span>Personal email</span><input className="field" type="email" name="personal_email" defaultValue={employee?.personal_email ?? ""} aria-invalid={Boolean(errors.personal_email)} /><ErrorText message={errors.personal_email} /></label>
          <label><span>Phone</span><input className="field" name="phone" defaultValue={employee?.phone ?? ""} /></label>
        </div>
      </section>

      <section className="form-section">
        <div><h2>Employment details</h2><p className="muted">Role, department, status, and work arrangement.</p></div>
        <div className="form-grid">
          <label>
            <span>Department</span>
            <select
              className="field"
              name="department_id"
              value={departmentId}
              onChange={(event) => handleDepartmentChange(event.target.value)}
              aria-invalid={Boolean(errors.department_id)}
            >
              <option value="">Unassigned</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}{availabilitySuffix(item)}</option>)}
            </select>
            <ErrorText message={errors.department_id} />
          </label>
          <label>
            <span>Job title</span>
            <select
              className="field"
              name="job_title_id"
              value={jobTitleId}
              onChange={(event) => setJobTitleId(event.target.value)}
              aria-invalid={Boolean(errors.job_title_id)}
            >
              <option value="">Unassigned</option>
              {visibleJobTitles.map((item) => <option key={item.id} value={item.id}>{item.title}{availabilitySuffix(item)}</option>)}
            </select>
            <small className="muted">Job titles are filtered by the selected department.</small>
            <ErrorText message={errors.job_title_id} />
          </label>
          <label><span>Employment type *</span><select className="field" name="employment_type" defaultValue={employee?.employment_type ?? "full_time"}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></label>
          <label><span>Status *</span><select className="field" name="employment_status" defaultValue={employee?.employment_status ?? "active"}><option value="active">Active</option><option value="probation">Probation</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select></label>
          <label><span>Hire date *</span><input className="field" type="date" name="hire_date" defaultValue={employee?.hire_date} aria-invalid={Boolean(errors.hire_date)} /><ErrorText message={errors.hire_date} /></label>
          <label><span>Work location</span><input className="field" name="work_location" defaultValue={employee?.work_location ?? ""} placeholder="e.g. Manila, Remote" /></label>
        </div>
      </section>

      <div className="form-actions"><Link className="btn" href={employee ? `/employees/${employee.id}` : "/employees"}>Cancel</Link><button className="btn primary" disabled={pending}>{pending ? "Saving…" : employee ? "Save changes" : "Create employee"}</button></div>
    </form>
  );
}
