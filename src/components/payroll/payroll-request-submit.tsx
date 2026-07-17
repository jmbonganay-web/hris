"use client";
import { useActionState } from "react";
import { submitCompensationAction, submitScheduleAssignmentAction } from "@/app/(dashboard)/employees/[id]/compensation/actions";
import type { PayrollActionState } from "@/features/payroll/types";
const initial: PayrollActionState = {};
export function PayrollRequestSubmit({ employeeId, id, version, kind }: { employeeId: string; id: string; version: number; kind: "compensation" | "assignment" }) {
  const [state, action, pending] = useActionState(async (_: PayrollActionState, data: FormData) => kind === "compensation" ? submitCompensationAction(employeeId, data) : submitScheduleAssignmentAction(employeeId, data), initial);
  return <form action={action} className="table-actions">{kind === "compensation" ? <input type="hidden" name="recordId" value={id}/> : <input type="hidden" name="assignmentId" value={id}/>}<input type="hidden" name="expectedVersion" value={version}/><button className="btn primary" disabled={pending}>{pending ? "Submitting…" : "Submit for approval"}</button>{state.error ? <span className="form-error">{state.error}</span> : null}{state.success ? <span className="form-success">{state.success}</span> : null}</form>;
}
