"use client";

import Link from "next/link";

export default function EmployeeProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card error-state">
      <h1>Unable to load employee profile</h1>
      <p className="muted">The profile data could not be loaded. Check the Phase 4A migration and try again.</p>
      <div className="header-actions error-state-actions">
        <button className="btn primary" type="button" onClick={reset}>Try again</button>
        <Link className="btn" href="/employees">Return to employees</Link>
      </div>
    </div>
  );
}
