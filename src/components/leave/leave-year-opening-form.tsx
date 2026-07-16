"use client";

import { useActionState, useState } from "react";
import type { LeaveActionState } from "@/features/leave/types";

function ResultRows({ data }: { data: unknown }) {
  if (!Array.isArray(data) || data.length === 0) return null;
  return (
    <div className="table-wrap">
      <table><thead><tr><th>Employee</th><th>Leave type</th><th>Result</th><th>Units</th></tr></thead><tbody>{data.map((row, index) => {
        const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
        return <tr key={`${String(item.employee_id ?? "row")}-${index}`}><td>{String(item.employee_name ?? item.employee_id ?? "—")}</td><td>{String(item.leave_type_name ?? item.leave_type_id ?? "—")}</td><td>{String(item.result ?? item.status ?? "Processed")}</td><td>{String(item.units ?? item.allocation_units ?? "—")}</td></tr>;
      })}</tbody></table>
    </div>
  );
}

export function LeaveYearOpeningForm({
  defaultYear,
  previewAction,
  generateAction,
}: {
  defaultYear: number;
  previewAction: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
  generateAction: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
}) {
  const [year, setYear] = useState(defaultYear);
  const [previewState, previewFormAction, previewPending] = useActionState(previewAction, {});
  const [generateState, generateFormAction, generatePending] = useActionState(generateAction, {});
  const previewedYear = Number(previewState.values?.leave_year);
  const hasPreview = Array.isArray(previewState.data) && previewedYear === year;
  return (
    <section className="grid leave-year-opening-grid">
      <form action={previewFormAction} className="card form-card">
        <h2 className="card-title">1. Preview year opening</h2>
        <label><span>Leave year</span><input className="field" type="number" name="leave_year" min={defaultYear} max={defaultYear + 1} value={year} onChange={(event) => setYear(Number(event.target.value))} required /></label>
        {previewState.error && <p className="form-error">{previewState.error}</p>}
        <button className="btn" type="submit" disabled={previewPending}>{previewPending ? "Loading…" : "Preview generation"}</button>
        <ResultRows data={previewState.data} />
      </form>
      <form action={generateFormAction} className="card form-card">
        <h2 className="card-title">2. Confirm generation</h2>
        <input type="hidden" name="leave_year" value={year} />
        <label className="checkbox-row"><input type="checkbox" name="confirmed" value="true" required disabled={!hasPreview} /> I reviewed the preview and confirm generation for {year}.</label>
        <p className="muted">The process is idempotent. Existing allocations are reported as already generated and are not duplicated.</p>
        {generateState.error && <p className="form-error">{generateState.error}</p>}
        {generateState.success && <p className="form-success">{generateState.success}</p>}
        <button className="btn primary" type="submit" disabled={generatePending || !hasPreview}>{generatePending ? "Generating…" : "Generate leave year"}</button>
        <ResultRows data={generateState.data} />
      </form>
    </section>
  );
}
