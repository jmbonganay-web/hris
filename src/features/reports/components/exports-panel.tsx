import { serializeReportFilters } from "../filters";
import type { ReportExportDataset, ReportFilters } from "../types";

const exports: Array<{ dataset: ReportExportDataset; label: string; description: string; xlsx: boolean }> = [
  { dataset: "daily", label: "Daily Attendance", description: "One finalized attendance row per employee and date.", xlsx: false },
  { dataset: "employee_summary", label: "Employee Summary", description: "Payroll-preparation totals grouped by employee.", xlsx: false },
  { dataset: "exceptions", label: "Exceptions", description: "Finalized attendance exceptions for reconciliation.", xlsx: false },
  { dataset: "overtime_holiday", label: "Overtime & Holiday Work", description: "Detection and approval lifecycle rows.", xlsx: false },
  { dataset: "leave_balances", label: "Leave Balances", description: "Allocation, carryover, adjustment, usage, pending, and available units.", xlsx: true },
  { dataset: "leave_usage", label: "Leave Usage", description: "Request status, paid state, dates, and chargeable units.", xlsx: true },
  { dataset: "leave_conflicts", label: "Leave Conflicts", description: "Attendance and recalculation conflicts without confidential notes.", xlsx: true },
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
      <p className="muted">Exports contain the complete filtered dataset up to 25,000 rows. Confidential leave notes, reasons, filenames, and storage paths are excluded.</p>
      <div className="report-export-grid">
        {exports.map((item) => (
          <article className="report-export-card" key={item.dataset}>
            <div><h3>{item.label}</h3><p className="muted">{item.description}</p></div>
            <div className="report-filter-actions">
              <a className="btn" href={exportHref("/api/reports/export/csv", filters, item.dataset)}>Download CSV</a>
              {item.xlsx && <a className="btn" href={exportHref("/api/reports/export/xlsx", filters, item.dataset)}>Download XLSX</a>}
            </div>
          </article>
        ))}
        <article className="report-export-card">
          <div><h3>Complete attendance XLSX workbook</h3><p className="muted">Daily Attendance, Employee Summary, Exceptions, and Overtime &amp; Holiday Work.</p></div>
          <a className="btn" href={exportHref("/api/reports/export/xlsx", filters)}>Download XLSX</a>
        </article>
      </div>
    </section>
  );
}
