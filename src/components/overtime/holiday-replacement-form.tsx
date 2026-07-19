"use client";

import { useActionState } from "react";
import type {
  HolidayActionState,
  HolidayCalendarVersion,
} from "@/features/overtime/holidays/types";

const initialState: HolidayActionState = {};

export function HolidayReplacementForm({
  action,
  activeVersion,
}: {
  action: (
    state: HolidayActionState,
    formData: FormData,
  ) => Promise<HolidayActionState>;
  activeVersion: HolidayCalendarVersion;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form
      action={formAction}
      className="card form-card"
      onSubmit={(event) => {
        if (!window.confirm(
          "Replace this holiday version?\n\nThe previous version will remain immutable in history.",
        )) event.preventDefault();
      }}
    >
      <input type="hidden" name="expected_active_version_id" value={activeVersion.id} />
      <div className="form-grid">
        <label>
          <span>Replacement date</span>
          <input className="field" type="date" name="holiday_date" defaultValue={state.values?.holidayDate ?? activeVersion.holiday_date} required />
          {state.fieldErrors?.holiday_date && <span className="form-error">{state.fieldErrors.holiday_date}</span>}
        </label>
        <label>
          <span>Status</span>
          <select className="field" name="is_active" defaultValue={state.values?.isActive ?? String(activeVersion.is_active)}>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </select>
          {state.fieldErrors?.is_active && <span className="form-error">{state.fieldErrors.is_active}</span>}
        </label>
        <label>
          <span>Replacement type</span>
          <select className="field" name="holiday_type" defaultValue={state.values?.holidayType ?? activeVersion.holiday_type}>
            <option value="regular_holiday">Regular Holiday</option>
            <option value="special_non_working_holiday">Special Non-Working Holiday</option>
            <option value="company_holiday">Company Holiday</option>
          </select>
          {state.fieldErrors?.holiday_type && <span className="form-error">{state.fieldErrors.holiday_type}</span>}
        </label>
        <label>
          <span>Holiday count</span>
          <select className="field" name="holiday_count" defaultValue={state.values?.holidayCount ?? String(activeVersion.holiday_count)}>
            <option value="1">Single holiday</option>
            <option value="2">Double regular holiday</option>
          </select>
          {state.fieldErrors?.holiday_count && <span className="form-error">{state.fieldErrors.holiday_count}</span>}
        </label>
        <label>
          <span>Replacement name</span>
          <input className="field" name="holiday_name" maxLength={160} defaultValue={state.values?.holidayName ?? activeVersion.holiday_name} required />
          {state.fieldErrors?.holiday_name && <span className="form-error">{state.fieldErrors.holiday_name}</span>}
        </label>
        <label className="full">
          <span>Change reason</span>
          <textarea className="field" name="change_reason" maxLength={1000} rows={4} />
          <small className="muted">Required when the replacement date is today or earlier.</small>
          {state.fieldErrors?.change_reason && <span className="form-error">{state.fieldErrors.change_reason}</span>}
        </label>
      </div>
      <p className="info-callout">
        Existing finalized attendance and overtime results will not change automatically.
        Use attendance recalculation to refresh holiday classification and overtime
        recalculation to refresh detection from unchanged attendance inputs.
      </p>
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Replacing…" : "Create replacement version"}
      </button>
    </form>
  );
}
