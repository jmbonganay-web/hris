"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { EmployeeActionState, EmployeePersonalDetails } from "@/features/employees/types";

const initialState: EmployeeActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function PersonalDetailsForm({
  employeeId,
  details,
  action,
}: {
  employeeId: string;
  details: EmployeePersonalDetails | null;
  action: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card employee-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <section className="form-section">
        <div><h2>Identity</h2><p className="muted">Personal and demographic information used in the employee profile.</p></div>
        <div className="form-grid">
          <label><span>Middle name</span><input className="field" name="middle_name" defaultValue={details?.middle_name ?? ""} /></label>
          <label><span>Preferred name</span><input className="field" name="preferred_name" defaultValue={details?.preferred_name ?? ""} aria-invalid={Boolean(errors.preferred_name)} /><ErrorText message={errors.preferred_name} /></label>
          <label><span>Date of birth</span><input className="field" type="date" name="date_of_birth" defaultValue={details?.date_of_birth ?? ""} aria-invalid={Boolean(errors.date_of_birth)} /><ErrorText message={errors.date_of_birth} /></label>
          <label><span>Gender</span><select className="field" name="gender" defaultValue={details?.gender ?? ""}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="other">Other</option></select></label>
          <label><span>Civil status</span><select className="field" name="civil_status" defaultValue={details?.civil_status ?? ""}><option value="">Not provided</option><option value="single">Single</option><option value="married">Married</option><option value="separated">Separated</option><option value="widowed">Widowed</option><option value="other">Other</option></select></label>
          <label><span>Nationality</span><input className="field" name="nationality" defaultValue={details?.nationality ?? ""} /></label>
        </div>
      </section>

      <section className="form-section">
        <div><h2>Contact and address</h2><p className="muted">Private contact information visible only to the employee and HR.</p></div>
        <div className="form-grid">
          <label><span>Personal email</span><input className="field" type="email" name="personal_email" defaultValue={details?.personal_email ?? ""} aria-invalid={Boolean(errors.personal_email)} /><ErrorText message={errors.personal_email} /></label>
          <label><span>Phone</span><input className="field" name="phone" defaultValue={details?.phone ?? ""} /></label>
          <label className="form-field-wide"><span>Address line 1</span><input className="field" name="address_line_1" defaultValue={details?.address_line_1 ?? ""} /></label>
          <label className="form-field-wide"><span>Address line 2</span><input className="field" name="address_line_2" defaultValue={details?.address_line_2 ?? ""} /></label>
          <label><span>City</span><input className="field" name="city" defaultValue={details?.city ?? ""} /></label>
          <label><span>State / Province</span><input className="field" name="state_province" defaultValue={details?.state_province ?? ""} /></label>
          <label><span>Postal code</span><input className="field" name="postal_code" defaultValue={details?.postal_code ?? ""} /></label>
          <label><span>Country</span><input className="field" name="country" defaultValue={details?.country ?? ""} /></label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={`/employees/${employeeId}?tab=personal`}>Cancel</Link>
        <button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save personal information"}</button>
      </div>
    </form>
  );
}
