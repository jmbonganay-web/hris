"use client";

import { useActionState, useMemo, useState } from "react";
import { createCorrectionRequest } from "@/app/(dashboard)/attendance/actions";
import type {
  AttendanceActionState,
  AttendanceRecord,
  CorrectionRequestType,
} from "@/features/attendance/types";

const initialState: AttendanceActionState = {};

const labels: Record<CorrectionRequestType, string> = {
  add_missing_clock_in: "Add missing clock-in",
  add_missing_clock_out: "Add missing clock-out",
  change_clock_in: "Change clock-in time",
  change_clock_out: "Change clock-out time",
};

function toManilaLocal(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const item = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${item.year}-${item.month}-${item.day}T${item.hour}:${item.minute}`;
}

export function CorrectionRequestForm({
  initialDate,
  initialRecord,
}: {
  initialDate: string;
  initialRecord: AttendanceRecord | null;
}) {
  const options = useMemo<CorrectionRequestType[]>(() => {
    if (!initialRecord) return ["add_missing_clock_in"];
    if (!initialRecord.clock_out_at) {
      return ["add_missing_clock_out", "change_clock_in"];
    }
    return ["change_clock_in", "change_clock_out"];
  }, [initialRecord]);

  const [requestType, setRequestType] = useState<CorrectionRequestType>(options[0]);
  const [state, action, pending] = useActionState(createCorrectionRequest, initialState);
  const needsClockIn = requestType === "add_missing_clock_in" || requestType === "change_clock_in";
  const needsClockOut = requestType === "add_missing_clock_out" || requestType === "change_clock_out";

  return (
    <form action={action} className="card form-card correction-request-form">
      <div className="form-grid">
        <label>
          <span>Attendance date</span>
          <input
            className="field"
            type="date"
            name="attendance_date"
            defaultValue={state.values?.attendance_date || initialDate}
            required
          />
          {state.fieldErrors?.attendance_date && <small className="field-error">{state.fieldErrors.attendance_date}</small>}
        </label>

        <label>
          <span>Correction type</span>
          <select
            className="field"
            name="request_type"
            value={requestType}
            onChange={(event) => setRequestType(event.target.value as CorrectionRequestType)}
          >
            {options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
          </select>
          {state.fieldErrors?.request_type && <small className="field-error">{state.fieldErrors.request_type}</small>}
        </label>

        {needsClockIn && (
          <label>
            <span>Requested clock-in <span className="muted">(Asia/Manila)</span></span>
            <input
              className="field"
              type="datetime-local"
              name="requested_clock_in_local"
              defaultValue={requestType === "change_clock_in" ? toManilaLocal(initialRecord?.clock_in_at ?? null) : ""}
              required
            />
            {state.fieldErrors?.requested_clock_in_local && <small className="field-error">{state.fieldErrors.requested_clock_in_local}</small>}
          </label>
        )}

        {needsClockOut && (
          <label>
            <span>Requested clock-out <span className="muted">(Asia/Manila)</span></span>
            <input
              className="field"
              type="datetime-local"
              name="requested_clock_out_local"
              defaultValue={requestType === "change_clock_out" ? toManilaLocal(initialRecord?.clock_out_at ?? null) : ""}
              required
            />
            {state.fieldErrors?.requested_clock_out_local && <small className="field-error">{state.fieldErrors.requested_clock_out_local}</small>}
          </label>
        )}
      </div>

      <label>
        <span>Reason</span>
        <textarea className="field" name="reason" rows={4} maxLength={1000} required />
        {state.fieldErrors?.reason && <small className="field-error">{state.fieldErrors.reason}</small>}
      </label>

      <label>
        <span>Additional note <span className="muted">(optional)</span></span>
        <textarea className="field" name="employee_note" rows={3} maxLength={1000} />
        {state.fieldErrors?.employee_note && <small className="field-error">{state.fieldErrors.employee_note}</small>}
      </label>

      {state.error && <p className="form-error">{state.error}</p>}
      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit correction request"}
        </button>
      </div>
    </form>
  );
}
