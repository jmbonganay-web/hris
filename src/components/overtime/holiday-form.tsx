"use client";

import { useActionState } from "react";
import type { HolidayActionState } from "@/features/overtime/holidays/types";

const initialState: HolidayActionState = {};

export function HolidayForm({
  action,
  companyDate,
}: {
  action: (
    state: HolidayActionState,
    formData: FormData,
  ) => Promise<HolidayActionState>;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="card form-card">
      <div className="form-grid">
        <label>
          <span>Holiday date</span>
          <input className="field" type="date" name="holiday_date" defaultValue={state.values?.holidayDate ?? companyDate} required />
          {state.fieldErrors?.holiday_date && <span className="form-error">{state.fieldErrors.holiday_date}</span>}
        </label>
        <label>
          <span>Holiday type</span>
          <select className="field" name="holiday_type" defaultValue={state.values?.holidayType ?? "regular_holiday"}>
            <option value="regular_holiday">Regular Holiday</option>
            <option value="special_non_working_holiday">Special Non-Working Holiday</option>
            <option value="company_holiday">Company Holiday</option>
          </select>
          {state.fieldErrors?.holiday_type && <span className="form-error">{state.fieldErrors.holiday_type}</span>}
        </label>
        <label className="full">
          <span>Holiday name</span>
          <input className="field" name="holiday_name" maxLength={160} defaultValue={state.values?.holidayName ?? ""} required />
          {state.fieldErrors?.holiday_name && <span className="form-error">{state.fieldErrors.holiday_name}</span>}
        </label>
        <label className="full">
          <span>Change reason <span className="muted">(required for today or a past date)</span></span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          {state.fieldErrors?.change_reason && <span className="form-error">{state.fieldErrors.change_reason}</span>}
        </label>
      </div>
      <p className="info-callout">
        Existing finalized attendance and overtime results will not change automatically.
        Recalculate affected dates after saving.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create holiday"}
      </button>
    </form>
  );
}
