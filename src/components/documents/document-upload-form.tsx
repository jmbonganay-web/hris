"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DocumentMetadataFields } from "./document-metadata-fields";
import { DocumentUploadProgress, type DocumentUploadStage } from "./document-upload-progress";
import type { DocumentCategorySummary } from "@/features/documents/categories/queries";
import type { DocumentCoreMetadata, DocumentVisibility } from "@/features/documents/types";
import { uploadDocumentBatch } from "@/features/documents/uploads/client";
import { validateUploadBatch } from "@/features/documents/validation";

const accessLabels: Record<DocumentVisibility, string> = {
  employee_hr: "Employee and HR",
  hr_only: "HR only",
  super_admin_only: "Super Admin only",
};
const visibilityRank: Record<DocumentVisibility, number> = { employee_hr: 0, hr_only: 1, super_admin_only: 2 };

type SelectedFile = { clientFileKey: string; file: File };

type PrepareResponse = {
  sessionId?: string;
  tickets?: Array<{ clientFileKey: string; path: string; token: string }>;
  message?: string;
  code?: string;
};

export function DocumentUploadForm({
  employeeId,
  categories,
  source = "employee",
  defaultCategoryId,
  replacementDocumentId = null,
  supersedesVersionId = null,
  allowVisibilityOverride = false,
  allowImmediateApproval = false,
  canUseSuperAdminVisibility = false,
}: {
  employeeId: string;
  categories: DocumentCategorySummary[];
  source?: "employee" | "hr";
  defaultCategoryId?: string;
  replacementDocumentId?: string | null;
  supersedesVersionId?: string | null;
  allowVisibilityOverride?: boolean;
  allowImmediateApproval?: boolean;
  canUseSuperAdminVisibility?: boolean;
}) {
  const router = useRouter();
  const availableCategories = useMemo(
    () => source === "employee" ? categories.filter((category) => category.currentVersion.employeeUploadEnabled) : categories,
    [categories, source],
  );
  const initialCategoryId = availableCategories.some((category) => category.id === defaultCategoryId)
    ? defaultCategoryId!
    : availableCategories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [stage, setStage] = useState<DocumentUploadStage>("idle");
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const category = availableCategories.find((item) => item.id === categoryId) ?? null;
  const busy = stage === "preparing" || stage === "uploading" || stage === "finalizing";

  function chooseFiles(files: FileList | null) {
    setError("");
    const next = Array.from(files ?? []).map((file) => ({ clientFileKey: crypto.randomUUID(), file }));
    if (!category) {
      setSelectedFiles([]);
      return;
    }
    const validation = validateUploadBatch(next.map(({ clientFileKey, file }) => ({
      clientFileKey,
      name: file.name,
      type: file.type,
      size: file.size,
    })), {
      cardinality: category.currentVersion.cardinality,
      allowedMimeTypes: category.currentVersion.allowedMimeTypes,
    });
    if (validation.error) {
      setSelectedFiles([]);
      setError(validation.error);
      setFileInputKey((value) => value + 1);
      return;
    }
    setSelectedFiles(next);
  }

  function buildMetadata(formData: FormData): DocumentCoreMetadata {
    const customMetadata: Record<string, unknown> = {};
    for (const field of category?.currentVersion.fields ?? []) {
      if (source === "employee" && !field.employeeVisible) continue;
      const raw = String(formData.get(`custom_${field.fieldKey}`) ?? "");
      if (!raw) continue;
      if (field.fieldType === "number") customMetadata[field.fieldKey] = Number(raw);
      else if (field.fieldType === "boolean") customMetadata[field.fieldKey] = raw === "true";
      else customMetadata[field.fieldKey] = raw;
    }
    return {
      title: String(formData.get("title") ?? ""),
      referenceNumber: String(formData.get("reference_number") ?? ""),
      issueDate: String(formData.get("issue_date") ?? ""),
      expirationDate: String(formData.get("expiration_date") ?? ""),
      issuingOrganization: String(formData.get("issuing_organization") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      tags: String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      customMetadata,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category || selectedFiles.length === 0 || busy) return;
    setError("");
    setSuccess("");
    setCompleted(0);
    setStage("preparing");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch("/api/documents/uploads/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId,
          categoryId: category.id,
          categoryVersionId: category.currentVersion.id,
          source,
          saveAsDraft: formData.get("save_as_draft") === "on"
            || (allowImmediateApproval && formData.get("approve_immediately") !== "on"),
          replacementDocumentId,
          supersedesVersionId,
          visibilityOverride: allowVisibilityOverride
            ? (String(formData.get("visibility_override") ?? "") || null)
            : null,
          commonMetadata: buildMetadata(formData),
          files: selectedFiles.map(({ clientFileKey, file }) => ({
            clientFileKey,
            name: file.name,
            type: file.type,
            size: file.size,
          })),
          idempotencyKey,
        }),
      });
      const prepared = await response.json() as PrepareResponse;
      if (!response.ok || !prepared.sessionId || !prepared.tickets) {
        throw new Error(prepared.message ?? "The upload session could not be prepared.");
      }
      setStage("uploading");
      await uploadDocumentBatch({
        sessionId: prepared.sessionId,
        files: selectedFiles,
        tickets: prepared.tickets,
        onProgress: (nextCompleted, total) => {
          setCompleted(nextCompleted);
          if (nextCompleted === total) setStage("finalizing");
        },
      });
      setCompleted(selectedFiles.length);
      setStage("complete");
      setSuccess(replacementDocumentId ? "Replacement submitted successfully." : "Document upload completed successfully.");
      setSelectedFiles([]);
      setFileInputKey((value) => value + 1);
      form.reset();
      setCategoryId(initialCategoryId);
      router.refresh();
    } catch (caught) {
      setStage("failed");
      setError(caught instanceof Error ? caught.message : "The document could not be uploaded.");
    }
  }

  return (
    <section className="card">
      <div className="card-header-row">
        <div>
          <h2>{replacementDocumentId ? "Upload replacement" : source === "hr" ? "Add employee document" : "Upload document"}</h2>
          <p>{source === "hr" ? "Upload a document on behalf of this employee." : "Submit a document for review or save it as a draft."}</p>
        </div>
      </div>
      {availableCategories.length === 0 ? (
        <div className="empty-state"><strong>No upload categories available</strong><span>HR has not enabled employee uploads for any active category.</span></div>
      ) : (
        <form className="document-upload-form" onSubmit={submit}>
          <label>
            <span>Category *</span>
            <select
              className="field"
              name="category_id"
              value={categoryId}
              disabled={Boolean(replacementDocumentId) || busy}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setSelectedFiles([]);
                setFileInputKey((value) => value + 1);
                setError("");
              }}
              required
            >
              {availableCategories.map((item) => <option key={item.id} value={item.id}>{item.currentVersion.name}</option>)}
            </select>
          </label>

          {category && <DocumentMetadataFields fields={category.currentVersion.fields} employeeMode={source === "employee"} />}

          {allowVisibilityOverride && category && (
            <label>
              <span>Visibility</span>
              <select className="field" name="visibility_override" defaultValue={category.currentVersion.defaultVisibility}>
                {(["employee_hr", "hr_only", ...(canUseSuperAdminVisibility ? ["super_admin_only" as const] : [])] as const)
                  .filter((visibility) => visibilityRank[visibility] >= visibilityRank[category.currentVersion.defaultVisibility])
                  .map((visibility) => <option key={visibility} value={visibility}>{accessLabels[visibility]}</option>)}
              </select>
            </label>
          )}

          <label>
            <span>File{category?.currentVersion.cardinality === "multiple" ? "s" : ""} *</span>
            <input
              key={fileInputKey}
              className="field"
              type="file"
              accept={category?.currentVersion.allowedMimeTypes.join(",")}
              multiple={category?.currentVersion.cardinality === "multiple"}
              disabled={!category || busy}
              onChange={(event) => chooseFiles(event.target.files)}
              required
            />
            <small className="muted">PDF, JPG, PNG, or DOCX as allowed by this category. Maximum 15 MB per file.</small>
          </label>

          {selectedFiles.length > 0 && (
            <ul className="document-selected-files">
              {selectedFiles.map(({ clientFileKey, file }) => <li key={clientFileKey}>{file.name}</li>)}
            </ul>
          )}

          <label className="checkbox-row">
            <input type="checkbox" name="save_as_draft" disabled={busy} />
            <span>Save as draft</span>
          </label>
          {allowImmediateApproval && (
            <label className="checkbox-row">
              <input type="checkbox" name="approve_immediately" defaultChecked disabled={busy} />
              <span>Approve immediately</span>
            </label>
          )}

          <DocumentUploadProgress stage={stage} completed={completed} total={selectedFiles.length} />
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="btn primary" type="submit" disabled={!category || selectedFiles.length === 0 || busy}>
            {busy ? "Uploading…" : replacementDocumentId ? "Submit replacement" : "Upload document"}
          </button>
        </form>
      )}
    </section>
  );
}
