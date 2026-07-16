"use client";

import { useState, useTransition } from "react";
import { archiveDocumentCategory, restoreDocumentCategory } from "@/app/(dashboard)/admin/documents/actions";
import type { DocumentActionState } from "@/features/documents/types";

export function DocumentCategoryVersionList({ categoryId, archivedAt, versions }: { categoryId: string; archivedAt: string | null; versions: Array<Record<string, unknown>> }) {
  const [state, setState] = useState<DocumentActionState>({});
  const [pending, startTransition] = useTransition();
  return <section className="card"><div className="card-header-row"><div><h2>Immutable version history</h2><p>Previously used configurations remain unchanged.</p></div><button className={`btn ${archivedAt ? "secondary" : "danger"}`} type="button" disabled={pending} onClick={() => startTransition(async () => setState(archivedAt ? await restoreDocumentCategory(categoryId) : await archiveDocumentCategory(categoryId)))}>{pending ? "Updating…" : archivedAt ? "Restore category" : "Archive category"}</button></div>{state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}<div className="document-version-list">{versions.map((version) => <article className="document-version-item" key={String(version.id)}><div><strong>Version {String(version.version_number)}</strong><span className="muted block">{String(version.created_at)}</span></div><dl className="profile-summary-list compact"><div><dt>Name</dt><dd>{String(version.name)}</dd></div><div><dt>Visibility</dt><dd>{String(version.default_visibility).replaceAll("_", " ")}</dd></div><div><dt>Cardinality</dt><dd>{String(version.cardinality)}</dd></div><div><dt>Expiration</dt><dd>{String(version.expiration_mode)}</dd></div><div><dt>Change reason</dt><dd>{String(version.change_reason ?? "Not recorded")}</dd></div></dl>{Array.isArray(version.fields) && version.fields.length > 0 && <ul>{(version.fields as Array<Record<string, unknown>>).map((field) => <li key={String(field.id)}>{String(field.label)} · {String(field.fieldType ?? field.field_type)}</li>)}</ul>}</article>)}</div></section>;
}
