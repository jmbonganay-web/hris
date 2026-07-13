import { PageHeader } from "@/components/page-header";
export default function LoadingEmployees() {
  return <><PageHeader title="Employees" description="Loading employee records…" /><div className="card"><div className="skeleton skeleton-toolbar" /><div className="skeleton skeleton-table" /></div></>;
}
