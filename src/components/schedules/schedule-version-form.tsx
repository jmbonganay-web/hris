"use client";

import { useActionState } from "react";
import type { ScheduleActionState } from "@/features/schedules/types";
import { ScheduleVersionFields } from "./schedule-template-form";

export function ScheduleVersionForm({ action, companyDate }: { action: (state: ScheduleActionState, formData: FormData) => Promise<ScheduleActionState>; companyDate: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="card form-card schedule-form"><ScheduleVersionFields companyDate={companyDate} errors={state.fieldErrors} values={state.values} />{state.error && <p className="form-error">{state.error}</p>}<button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Create version"}</button></form>;
}
