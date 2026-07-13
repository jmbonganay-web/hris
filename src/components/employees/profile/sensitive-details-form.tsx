"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  MaskedSensitiveDetails,
  SensitiveDetailsActionState,
  SensitiveFieldName,
} from "@/features/employees/sensitive/types";

const initialState: SensitiveDetailsActionState = {};

function ErrorText({
  id,
  message,
}: {
  id?: string;
  message?: string;
}) {
  return message ? (
    <span id={id} className="field-error">
      {message}
    </span>
  ) : null;
}

function ProtectedField({
  name,
  label,
  masked,
  hasValue,
  error,
  inputMode,
  placeholder,
}: {
  name: SensitiveFieldName;
  label: string;
  masked: string;
  hasValue: boolean;
  error?: string;
  inputMode?: "numeric" | "text";
  placeholder?: string;
}) {
  const helpId = `${name}-help`;
  const errorId = `${name}-error`;

  return (
    <div className="sensitive-form-field">
      <label htmlFor={name}>
        <span>{label}</span>
      </label>
      <input
        id={name}
        className="field"
        name={name}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
      />
      <small id={helpId} className="muted">
        Current value: {masked}. Leave blank to keep unchanged.
      </small>
      {hasValue && (
        <label className="clear-sensitive-control">
          <input type="checkbox" name={`clear_${name}`} />
          <span>
            I confirm that the current {label.toLowerCase()} should be cleared.
          </span>
        </label>
      )}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function SensitiveDetailsForm({
  employeeId,
  details,
  action,
}: {
  employeeId: string;
  details: MaskedSensitiveDetails;
  action: (
    state: SensitiveDetailsActionState,
    formData: FormData,
  ) => Promise<SensitiveDetailsActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card employee-form sensitive-form">
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <section className="form-section">
        <div>
          <h2>Government IDs</h2>
          <p className="muted">
            Protected values are encrypted before database storage.
          </p>
        </div>
        <div className="form-grid">
          <ProtectedField
            name="sss_number"
            label="SSS number"
            masked={details.sss_number.masked}
            hasValue={details.sss_number.hasValue}
            error={errors.sss_number}
            inputMode="numeric"
            placeholder="12-3456789-0"
          />
          <ProtectedField
            name="philhealth_number"
            label="PhilHealth number"
            masked={details.philhealth_number.masked}
            hasValue={details.philhealth_number.hasValue}
            error={errors.philhealth_number}
            inputMode="numeric"
            placeholder="12-345678901-2"
          />
          <ProtectedField
            name="pagibig_number"
            label="Pag-IBIG number"
            masked={details.pagibig_number.masked}
            hasValue={details.pagibig_number.hasValue}
            error={errors.pagibig_number}
            inputMode="numeric"
            placeholder="1234-5678-9012"
          />
          <ProtectedField
            name="tin"
            label="TIN"
            masked={details.tin.masked}
            hasValue={details.tin.hasValue}
            error={errors.tin}
            inputMode="numeric"
            placeholder="123-456-789-000"
          />
        </div>
      </section>

      <section className="form-section">
        <div>
          <h2>Payroll and bank details</h2>
          <p className="muted">
            Clearing removes the stored value permanently. Entering a replacement
            and selecting Clear is not allowed.
          </p>
        </div>
        <div className="form-grid">
          <label>
            <span>Bank name</span>
            <input
              className="field"
              name="bank_name"
              defaultValue={state.values?.bank_name ?? details.bank_name ?? ""}
              aria-invalid={Boolean(errors.bank_name)}
              aria-describedby={errors.bank_name ? "bank-name-error" : undefined}
              maxLength={100}
            />
            <ErrorText id="bank-name-error" message={errors.bank_name} />
          </label>

          <ProtectedField
            name="account_name"
            label="Account name"
            masked={details.account_name.masked}
            hasValue={details.account_name.hasValue}
            error={errors.account_name}
            inputMode="text"
            placeholder="Juan Dela Cruz"
          />

          <ProtectedField
            name="account_number"
            label="Account number"
            masked={details.account_number.masked}
            hasValue={details.account_number.hasValue}
            error={errors.account_number}
            inputMode="text"
            placeholder="1234-5678-9012"
          />

          <label>
            <span>Payroll account type</span>
            <select
              className="field"
              name="payroll_account_type"
              defaultValue={
                state.values?.payroll_account_type
                ?? details.payroll_account_type
                ?? ""
              }
              aria-invalid={Boolean(errors.payroll_account_type)}
              aria-describedby={
                errors.payroll_account_type
                  ? "payroll-account-type-error"
                  : undefined
              }
            >
              <option value="">Not provided</option>
              <option value="savings">Savings</option>
              <option value="current">Current</option>
              <option value="payroll">Payroll</option>
              <option value="other">Other</option>
            </select>
            <ErrorText
              id="payroll-account-type-error"
              message={errors.payroll_account_type}
            />
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={`/employees/${employeeId}/sensitive`}>
          Cancel
        </Link>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save government & payroll details"}
        </button>
      </div>
    </form>
  );
}
