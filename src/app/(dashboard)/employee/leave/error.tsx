"use client";

import Link from "next/link";

export default function EmployeeLeaveError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card empty-state" role="alert">
      <h1>Unable to load leave information</h1>
      <p>The request could not be completed. Retry, or return to the dashboard.</p>
      <div className="form-actions">
        <button className="btn primary" type="button" onClick={() => reset()}>Retry</button>
        <Link className="btn" href="/dashboard">Return to dashboard</Link>
      </div>
    </section>
  );
}
