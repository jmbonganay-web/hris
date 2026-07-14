"use client";

import { useActionState } from "react";
import type { ScheduleActionState, ScheduleTemplateRecord } from "@/features/schedules/types";

const initialState: ScheduleActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="form-error">{message}</span> : null;
}

export function ScheduleTemplateForm({
  action,
  template,
  includeInitialVersion = false,
  companyDate,
}: {
  action: (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>;
  template?: ScheduleTemplateRecord | null;
  includeInitialVersion?: boolean;
  companyDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="card form-card schedule-form">
      <div className="form-grid">
        <label><span>Schedule code</span><input className="field" name="code" maxLength={30} defaultValue={state.values?.code ?? template?.code ?? ""} required /><ErrorText message={state.fieldErrors?.code} /></label>
        <label><span>Schedule name</span><input className="field" name="name" maxLength={100} defaultValue={state.values?.name ?? template?.name ?? ""} required /><ErrorText message={state.fieldErrors?.name} /></label>
        <label className="full"><span>Description</span><textarea className="field" name="description" maxLength={1000} defaultValue={template?.description ?? ""} rows={4} /><ErrorText message={state.fieldErrors?.description} /></label>
      </div>
      {includeInitialVersion && <ScheduleVersionFields companyDate={companyDate} errors={state.fieldErrors} values={state.values} />}
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" disabled={pending} type="submit">{pending ? "Saving…" : template ? "Save template" : "Create schedule"}</button>
    </form>
  );
}

export function ScheduleVersionFields({ companyDate, errors, values }: { companyDate: string; errors?: Record<string, string>; values?: Record<string, string> }) {
  const weekdays = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  return (
    <fieldset className="schedule-version-fields">
      <legend>Schedule rules</legend>
      <label><span>Effective date</span><input className="field" type="date" name="effective_date" defaultValue={values?.effective_date ?? companyDate} required /><ErrorText message={errors?.effective_date} /></label>
      <div><span className="field-label">Working days</span><div className="weekday-grid">{weekdays.map((day) => <label key={day} className="checkbox-row"><input type="checkbox" name="working_days" value={day} defaultChecked={!day.startsWith("s")} /> {day[0].toUpperCase() + day.slice(1)}</label>)}</div><ErrorText message={errors?.working_days} /></div>
      <div className="form-grid three"><label><span>Start time</span><input className="field" type="time" name="start_time" defaultValue={values?.start_time ?? "08:00"} required /><ErrorText message={errors?.start_time} /></label><label><span>End time</span><input className="field" type="time" name="end_time" defaultValue={values?.end_time ?? "17:00"} required /><ErrorText message={errors?.end_time} /></label><label><span>Break minutes</span><input className="field" type="number" min={0} name="break_minutes" defaultValue={values?.break_minutes ?? "60"} required /><ErrorText message={errors?.break_minutes} /></label></div>
      <label><span>Change reason <span className="muted">(required when backdated)</span></span><textarea className="field" name="change_reason" maxLength={1000} rows={3} /><ErrorText message={errors?.change_reason} /></label>
    </fieldset>
  );
}
