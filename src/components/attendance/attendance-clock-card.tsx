"use client";

import Link from "next/link";
import { useActionState } from "react";
import { clockIn, clockOut } from "@/app/(dashboard)/attendance/actions";
import { formatCompanyDate, formatCompanyTime } from "@/features/attendance/time";
import type { AttendanceActionState, TodayAttendanceContext } from "@/features/attendance/types";
import { AttendanceStatus } from "./attendance-status";
import { AttendanceCalculationCard } from "./attendance-calculation-card";

const initialState: AttendanceActionState = {};

function ClockForm({ mode }: { mode: "in" | "out" }) {
  const action = mode === "in" ? clockIn : clockOut;
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="attendance-clock-form">
      <label>
        <span>{mode === "in" ? "Clock-in note" : "Clock-out note"} <span className="muted">(optional)</span></span>
        <textarea name="note" maxLength={1000} rows={3} />
      </label>
      {state.fieldErrors?.note && <p className="field-error">{state.fieldErrors.note}</p>}
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "in" ? "Clock in" : "Clock out"}
      </button>
    </form>
  );
}

export function AttendanceClockCard({ context }: { context: TodayAttendanceContext }) {
  const { companyDate, todayRecord, previousOpenRecord } = context;

  if (previousOpenRecord) {
    return (
      <section className="card attendance-clock-card attendance-warning-card">
        <div>
          <p className="eyebrow">Attendance action required</p>
          <h2>Missing clock-out</h2>
          <p>
            Your attendance for {formatCompanyDate(previousOpenRecord.attendance_date)}{" "}
            is still open. Resolve it before clocking in again.
          </p>
        </div>
        <Link
          className="btn primary"
          href={`/attendance/corrections/new?record=${previousOpenRecord.id}`}
        >
          Request correction
        </Link>
      </section>
    );
  }

  return (
    <section className="card attendance-clock-card">
      <div className="attendance-clock-heading">
        <div>
          <p className="eyebrow">Today’s attendance</p>
          <h2>{formatCompanyDate(companyDate)}</h2>
          <p className="muted">Company timezone: Asia/Manila</p>
          <div className="attendance-schedule-summary">
            {context.schedule.state === "scheduled_workday" && context.schedule.version && (
              <p><strong>Scheduled today:</strong> {context.schedule.version.start_time.slice(0, 5)}–{context.schedule.version.end_time.slice(0, 5)}</p>
            )}
            {context.schedule.state === "rest_day" && <p><strong>Rest day</strong> under your assigned schedule.</p>}
            {context.schedule.state === "unassigned" && <p><strong>Unassigned schedule.</strong> You may still clock in and out.</p>}
            {context.schedule.state === "unavailable" && <p className="form-error">Schedule information is temporarily unavailable.</p>}
            <Link href="/my-schedule">View my schedule</Link>
          </div>
        </div>
        {todayRecord
          ? <AttendanceStatus status={todayRecord.effective_status} corrected={todayRecord.is_corrected} />
          : <span className="badge info">Not clocked in</span>}
      </div>

      {todayRecord?.calculation && (
        <AttendanceCalculationCard calculation={todayRecord.calculation} />
      )}

      {!todayRecord && <ClockForm mode="in" />}
      {todayRecord?.effective_status === "clocked_in" && (
        <>
          <div className="attendance-time-grid">
            <div><span>Clock in</span><strong>{formatCompanyTime(todayRecord.clock_in_at)}</strong></div>
          </div>
          <ClockForm mode="out" />
        </>
      )}
      {todayRecord?.effective_status === "completed" && (
        <div className="attendance-time-grid">
          <div><span>Clock in</span><strong>{formatCompanyTime(todayRecord.clock_in_at)}</strong></div>
          <div><span>Clock out</span><strong>{formatCompanyTime(todayRecord.clock_out_at)}</strong></div>
        </div>
      )}
    </section>
  );
}
