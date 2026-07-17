"use client";
import { useActionState } from "react";
import { setPayrollScheduleActiveAction } from "@/app/(dashboard)/payroll/schedules/actions";
import type { PayrollActionState, PayrollScheduleDetail } from "@/features/payroll/types";
const initial: PayrollActionState = {};
export function ScheduleActiveForm({ schedule }: { schedule: PayrollScheduleDetail }) {
  const [state, action, pending] = useActionState(async (_: PayrollActionState, data: FormData) => setPayrollScheduleActiveAction(data), initial);
  return <form className="card content-stack" action={action}><div className="section-heading"><div><h2>{schedule.isActive ? "Deactivate schedule" : "Activate schedule"}</h2><p>{schedule.isActive ? "Employees must be reassigned before an in-use schedule can be deactivated." : "Activation makes this schedule available for new assignments and generation."}</p></div></div><input type="hidden" name="scheduleId" value={schedule.id}/><input type="hidden" name="expectedVersion" value={schedule.version}/><input type="hidden" name="isActive" value={String(!schedule.isActive)}/>{schedule.isActive ? <label className="checkbox-row"><input type="checkbox" required/>Confirm schedule deactivation</label> : null}{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}<button className={`btn ${schedule.isActive ? "danger-outline" : "primary"}`} disabled={pending}>{pending ? "Updating…" : schedule.isActive ? "Deactivate" : "Activate"}</button></form>;
}
