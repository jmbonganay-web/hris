import type { DocumentReviewStatus } from "@/features/documents/types";
import { DocumentAccessButton } from "./document-access-button";
import { DocumentStatusBadge } from "./document-status-badge";
export type EmployeeDocumentVersion = { id: string; versionNumber: number; reviewStatus: DocumentReviewStatus; submittedAt?: string | null; createdAt: string; employeeMessage?: string | null; mimeType?: string | null; canAccessFile: boolean };
export function DocumentVersionHistory({ versions }: { versions: EmployeeDocumentVersion[] }) {
  return <section className="card"><div className="card-header-row"><div><h2>Version history</h2><p>Previous submissions remain available according to access rules.</p></div></div><div className="document-version-list">
    {versions.map((version) => <article className="document-version-item" key={version.id}><div><strong>Version {version.versionNumber}</strong><span className="muted block">{version.submittedAt ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.submittedAt)) : "Draft"}</span></div><DocumentStatusBadge value={version.reviewStatus} />
      {version.employeeMessage && <p>{version.employeeMessage}</p>}{version.canAccessFile && <div className="button-row"><DocumentAccessButton versionId={version.id} mimeType={version.mimeType ?? null} disposition="preview" /><DocumentAccessButton versionId={version.id} mimeType={version.mimeType ?? null} disposition="download" /></div>}
    </article>)}
  </div></section>;
}
