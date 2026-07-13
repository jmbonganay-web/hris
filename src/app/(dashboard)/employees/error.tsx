"use client";
export default function EmployeesError({ reset }: { reset: () => void }) {
  return <div className="card error-state"><h1>Unable to load employees</h1><p className="muted">The employee directory could not be loaded. Check your connection and try again.</p><button className="btn primary" onClick={reset}>Try again</button></div>;
}
