"use client";

export default function JobTitlesError({ reset }: { reset: () => void }) {
  return <div className="card error-state"><h1>Unable to load job titles</h1><p className="muted">Check your connection and confirm the Phase 3 Supabase migration has been applied.</p><button className="btn primary" onClick={reset}>Try again</button></div>;
}
