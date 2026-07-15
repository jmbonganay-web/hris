import { PageHeader } from "@/components/page-header";

export default function ReportsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading attendance reports">
      <PageHeader title="Attendance reports" description="Loading operational and payroll-preparation data." />
      <div className="card skeleton report-loading-filters" />
      <div className="report-summary-grid report-loading-summary">
        {Array.from({ length: 8 }, (_, index) => <div className="card skeleton report-loading-card" key={index} />)}
      </div>
      <div className="card skeleton skeleton-table" />
    </div>
  );
}
