"use client";

export default function DocumentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="card empty-state" role="alert"><strong>Documents could not be loaded</strong><span>Try again. Contact your administrator if the problem continues.</span>{error.digest && <span className="muted">Reference: {error.digest}</span>}<button className="btn primary" type="button" onClick={reset}>Try again</button></section>;
}
