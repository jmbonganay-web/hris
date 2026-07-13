import type { EmployeeAuditEntry } from "@/features/employees/audit/types";
import {
  auditFieldLabel,
  describeAuditEntry,
} from "@/features/employees/audit/presentation";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ActivityTimeline({
  entries,
}: {
  entries: EmployeeAuditEntry[];
}) {
  return (
    <div className="activity-list">
      {entries.map((entry) => {
        const presentation = describeAuditEntry(entry);
        return (
          <article className="activity-entry" key={entry.id}>
            <span className="activity-dot" aria-hidden="true" />
            <div className="activity-entry-content">
              <h3 className="activity-entry-title">{presentation.title}</h3>
              {presentation.detail && (
                <p className="activity-entry-detail">{presentation.detail}</p>
              )}
              {entry.changed_fields.length > 0 && (
                <div className="activity-field-list" aria-label="Changed fields">
                  {entry.changed_fields.map((field) => (
                    <span className="badge" key={field}>
                      {auditFieldLabel(field)}
                    </span>
                  ))}
                </div>
              )}
              <div className="activity-entry-meta">
                <span>{presentation.actorLabel}</span>
                <span>{formatDateTime(entry.created_at)}</span>
                <span>
                  {entry.source === "application" ? "Application" : "Database trigger"}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
