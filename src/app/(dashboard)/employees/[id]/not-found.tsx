import Link from "next/link";
export default function EmployeeNotFound() { return <div className="card error-state"><h1>Employee not found</h1><p className="muted">This employee record may have been removed or you may not have access to it.</p><Link className="btn primary" href="/employees">Return to employees</Link></div>; }
