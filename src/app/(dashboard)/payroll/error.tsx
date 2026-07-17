"use client";
export default function PayrollError({ reset }: { reset: () => void }) {
  return <div className="card empty-state"><h1>Payroll is unavailable</h1><p>Payroll information could not be loaded safely.</p><button className="btn primary" onClick={reset}>Try again</button></div>;
}
