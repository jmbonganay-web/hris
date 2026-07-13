"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { EmployeeActionState, EmployeeEmergencyContact } from "@/features/employees/types";

const initialState: EmployeeActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function EmergencyContactForm({
  employeeId,
  contact,
  action,
}: {
  employeeId: string;
  contact?: EmployeeEmergencyContact;
  action: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="card employee-form compact-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="form-grid">
        <label><span>Contact name *</span><input className="field" name="full_name" defaultValue={contact?.full_name ?? ""} aria-invalid={Boolean(errors.full_name)} /><ErrorText message={errors.full_name} /></label>
        <label><span>Relationship *</span><input className="field" name="relationship" defaultValue={contact?.relationship ?? ""} placeholder="e.g. Spouse, Parent" aria-invalid={Boolean(errors.relationship)} /><ErrorText message={errors.relationship} /></label>
        <label><span>Phone *</span><input className="field" name="phone" defaultValue={contact?.phone ?? ""} aria-invalid={Boolean(errors.phone)} /><ErrorText message={errors.phone} /></label>
        <label><span>Email</span><input className="field" type="email" name="email" defaultValue={contact?.email ?? ""} aria-invalid={Boolean(errors.email)} /><ErrorText message={errors.email} /></label>
        <label className="checkbox-field form-field-wide"><input type="checkbox" name="is_primary" defaultChecked={contact?.is_primary ?? false} /><span>Primary emergency contact</span></label>
        <ErrorText message={errors.is_primary} />
      </div>
      <div className="form-actions"><Link className="btn" href={`/employees/${employeeId}?tab=emergency`}>Cancel</Link><button className="btn primary" disabled={pending}>{pending ? "Saving…" : contact ? "Save contact" : "Add contact"}</button></div>
    </form>
  );
}
