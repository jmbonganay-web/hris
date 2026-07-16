import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { DocumentAccessButton } from "@/components/documents/document-access-button";
import { DocumentReviewForm } from "@/components/documents/document-review-form";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { PageHeader } from "@/components/page-header";
import { requireDocumentReviewer } from "@/features/documents/auth";
import { getDocumentReviewDetail } from "@/features/documents/reviews/queries";
import type { DocumentReviewStatus } from "@/features/documents/types";

type ReviewVersion = {
  id: string; versionNumber: number; reviewStatus: DocumentReviewStatus; title: string; referenceNumber: string | null;
  issueDate: string | null; expirationDate: string | null; issuingOrganization: string | null; notes: string | null;
  tags: string[]; customMetadata: Record<string, unknown>; mimeType: string; submittedAt: string | null; createdAt: string;
  updatedAt: string; employeeMessage: string | null; internalReason: string | null; reviewDecision: string | null; reviewedAt: string | null; canAccessFile: boolean;
};
type ReviewDetail = { id: string; employeeId: string; categoryName: string; visibility: string; activeVersionId: string | null; categoryVersionSnapshot: { versionNumber: number; cardinality: string; employeeUploadEnabled: boolean; expirationMode: string; defaultValidityMonths: number | null; expiringSoonDays: number; allowedMimeTypes: string[]; fields: Array<{ fieldKey: string; label: string; fieldType: string; isRequired: boolean }> }; versions: ReviewVersion[]; auditHistory: Array<{ id: string; action: string; createdAt: string }>; compliance: Record<string, unknown> };

export default async function DocumentReviewDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  await requireDocumentReviewer();
  const { documentId } = await params;
  let detail: ReviewDetail;
  try { detail = await getDocumentReviewDetail(documentId) as ReviewDetail; }
  catch (error) { if (error instanceof Error && error.message.includes("DOCUMENT_NOT_FOUND")) notFound(); throw error; }
  const version = detail.versions.find((item) => item.reviewStatus === "pending_review") ?? detail.versions[0];
  if (!version) notFound();
  return <>
    <PageHeader title={version.title} description={`${detail.categoryName} submission review.`} />
    <div className="document-review-layout">
      <section className="card"><div className="card-header-row"><div><h2>Submitted document</h2><p>Version {version.versionNumber} · {detail.visibility.replaceAll("_", " ")}</p></div><DocumentStatusBadge value={version.reviewStatus} /></div><dl className="profile-summary-list"><div><dt>Reference</dt><dd>{version.referenceNumber || "Not provided"}</dd></div><div><dt>Issue date</dt><dd>{version.issueDate || "Not provided"}</dd></div><div><dt>Expiration</dt><dd>{version.expirationDate || "No expiration"}</dd></div><div><dt>Issuer</dt><dd>{version.issuingOrganization || "Not provided"}</dd></div></dl>{version.notes && <p>{version.notes}</p>}{Object.keys(version.customMetadata ?? {}).length > 0 && <dl className="profile-summary-list">{Object.entries(version.customMetadata).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl>}<div className="button-row"><DocumentAccessButton versionId={version.id} mimeType={version.mimeType} disposition="preview" /><DocumentAccessButton versionId={version.id} mimeType={version.mimeType} disposition="download" /></div></section>
      {version.reviewStatus === "pending_review" && <DocumentReviewForm documentId={detail.id} versionId={version.id} employeeId={detail.employeeId} expectedUpdatedAt={version.updatedAt} requestId={randomUUID()} />}
      <section className="card"><h2>Version and review history</h2><div className="document-version-list">{detail.versions.map((item) => <article className="document-version-item" key={item.id}><div><strong>Version {item.versionNumber}</strong><span className="muted block">{item.submittedAt ?? item.createdAt}</span></div><DocumentStatusBadge value={item.reviewStatus} />{item.internalReason && <p><strong>Internal reason:</strong> {item.internalReason}</p>}{item.employeeMessage && <p><strong>Employee message:</strong> {item.employeeMessage}</p>}</article>)}</div></section>
      <section className="card"><h2>Category rule snapshot</h2><dl className="profile-summary-list"><div><dt>Configuration version</dt><dd>{detail.categoryVersionSnapshot.versionNumber}</dd></div><div><dt>Cardinality</dt><dd>{detail.categoryVersionSnapshot.cardinality}</dd></div><div><dt>Employee upload</dt><dd>{detail.categoryVersionSnapshot.employeeUploadEnabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Expiration</dt><dd>{detail.categoryVersionSnapshot.expirationMode}</dd></div><div><dt>Expiring-soon threshold</dt><dd>{detail.categoryVersionSnapshot.expiringSoonDays} days</dd></div></dl>{detail.categoryVersionSnapshot.fields.length > 0 && <ul>{detail.categoryVersionSnapshot.fields.map((field) => <li key={field.fieldKey}>{field.label} · {field.fieldType}{field.isRequired ? " · required" : ""}</li>)}</ul>}</section>
      <section className="card"><h2>Requirement context</h2><pre className="data-preview">{JSON.stringify(detail.compliance, null, 2)}</pre></section>
    </div>
  </>;
}
