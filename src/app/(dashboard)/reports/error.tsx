"use client";

export default function ReportsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card report-error" role="alert">
      <h1>The report could not be loaded.</h1>
      <p className="muted">Your selected filters were preserved. Try loading the report again.</p>
      <button className="btn" type="button" onClick={reset}>Retry</button>
    </section>
  );
}
