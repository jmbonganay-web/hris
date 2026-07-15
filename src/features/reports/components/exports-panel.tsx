import { serializeReportFilters } from "../filters";
import type { ReportExportDataset, ReportFilters } from "../types";

const csvExports: Array<{ dataset: ReportExportDataset; label: string; description: string }> = [
  { dataset: "daily", label: "Daily Attendance CSV", description: "One finalized attendance row per employee and date." },
  { dataset: "employee_summary", label: "Employee Summary CSV", description: "Payroll-preparation totals grouped by employee." },
  { dataset: "exceptions", label: "Exceptions CSV", description: "Finalized attendance exceptions for reconciliation." },
  { dataset: "overtime_holiday", label: "Overtime & Holiday Work CSV", description: "Detection and approval lifecycle rows." },
];

function exportHref(path: string, filters: ReportFilters, dataset?: ReportExportDataset) {
  const params = serializeReportFilters({ ...filters, mode: "payroll", page: 1 });
  params.delete("page");
  params.delete("page_size");
  params.delete("tab");
  if (dataset) params.set("dataset", dataset);
  return `${path}?${params.toString()}`;
}

export function ExportsPanel({ filters }: { filters: ReportFilters }) {
  if (filters.mode !== "payroll") {
    return <div className="card empty-state">Exports are available in Payroll mode only.</div>;
  }

  return (
    <section className="card">
      <h2 className="card-title">Payroll report exports</h2>
      <p className="muted">Exports use finalized attendance only and include the complete filtered dataset, up to 25,000 rows per dataset.</p>
      <div className="report-export-grid">
        {csvExports.map((item) => (
          <article className="report-export-card" key={item.dataset}>
            <div>
              <h3>{item.label}</h3>
              <p className="muted">{item.description}</p>
            </div>
            <a className="btn" href={exportHref("/api/reports/export/csv", filters, item.dataset)}>Download CSV</a>
          </article>
        ))}
        <article className="report-export-card">
          <div>
            <h3>Complete XLSX workbook</h3>
            <p className="muted">Four worksheets: Daily Attendance, Employee Summary, Exceptions, and Overtime &amp; Holiday Work.</p>
          </div>
          <a className="btn" href={exportHref("/api/reports/export/xlsx", filters)}>Download XLSX</a>
        </article>
      </div>
    </section>
  );
}
