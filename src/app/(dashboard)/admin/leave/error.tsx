"use client";
import Link from "next/link";
export default function AdminLeaveError({ reset }: { error: Error; reset: () => void }) { return <section className="card error-state" role="alert"><h1>Unable to load leave administration</h1><p>Retry the request or return to the dashboard.</p><div className="form-actions"><button className="btn primary" type="button" onClick={() => reset()}>Retry</button><Link className="btn" href="/dashboard">Dashboard</Link></div></section>; }
