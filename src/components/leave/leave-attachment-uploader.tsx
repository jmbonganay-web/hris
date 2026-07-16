"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLeaveDraftAttachment } from "@/app/(dashboard)/employee/leave/actions";
import {
  LEAVE_ATTACHMENT_MAX_BYTES,
  LEAVE_ATTACHMENT_MAX_COUNT,
  LEAVE_ATTACHMENT_MIME_TYPES,
} from "@/features/leave/constants";
import type { LeaveAttachment } from "@/features/leave/types";

const MAX_LEAVE_ATTACHMENTS = LEAVE_ATTACHMENT_MAX_COUNT;
const MAX_LEAVE_ATTACHMENT_BYTES = LEAVE_ATTACHMENT_MAX_BYTES;
const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png";

function readableBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => ({}));
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function LeaveAttachmentUploader({
  requestGroupId,
  expectedRevisionId,
  attachments,
  deleteAction = deleteLeaveDraftAttachment,
}: {
  requestGroupId: string;
  expectedRevisionId: string;
  attachments: LeaveAttachment[];
  deleteAction?: (requestGroupId: string, attachmentId: string, expectedRevisionId: string) => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    if (attachments.length >= MAX_LEAVE_ATTACHMENTS) {
      setError(`You can upload up to ${MAX_LEAVE_ATTACHMENTS} files.`);
      return;
    }
    if (!LEAVE_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof LEAVE_ATTACHMENT_MIME_TYPES)[number]) || file.size < 1 || file.size > MAX_LEAVE_ATTACHMENT_BYTES) {
      setError("Choose a PDF, JPG, or PNG file no larger than 10 MB.");
      return;
    }

    setUploading(true);
    try {
      const prepared = await fetch("/api/leave/attachments/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestGroupId,
          expectedRevisionId,
          name: file.name,
          type: file.type,
          size: file.size,
        }),
      });
      const preparedBody = await responseJson(prepared);
      if (!prepared.ok) throw new Error(String(preparedBody.error ?? "Unable to prepare upload."));
      const signedUploadUrl = String(preparedBody.signedUploadUrl ?? "");
      const finalizeToken = String(preparedBody.finalizeToken ?? "");
      if (!signedUploadUrl || !finalizeToken) throw new Error("Unable to prepare upload.");

      const uploadBody = new FormData();
      uploadBody.append("cacheControl", "3600");
      uploadBody.append("", file);
      const uploaded = await fetch(signedUploadUrl, {
        method: "PUT",
        headers: { "x-upsert": "false" },
        body: uploadBody,
      });
      if (!uploaded.ok) throw new Error("The document upload failed.");

      const finalized = await fetch("/api/leave/attachments/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalizeToken }),
      });
      const finalizedBody = await responseJson(finalized);
      if (!finalized.ok) throw new Error(String(finalizedBody.error ?? "Unable to finalize upload."));
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload the document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card leave-attachment-uploader">
      <div className="split-row">
        <div>
          <h2>Supporting documents</h2>
          <p className="muted">PDF, JPG, or PNG. Up to {MAX_LEAVE_ATTACHMENTS} files, 10 MB each.</p>
        </div>
        <label className={`btn${uploading || attachments.length >= MAX_LEAVE_ATTACHMENTS ? " disabled" : ""}`}>
          {uploading ? "Uploading…" : "Add document"}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept={ACCEPTED_TYPES}
            disabled={uploading || attachments.length >= MAX_LEAVE_ATTACHMENTS}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {attachments.length === 0 ? (
        <p className="muted">No documents uploaded.</p>
      ) : (
        <ul className="attachment-list">
          {attachments.map((attachment) => (
            <li className="split-row" key={attachment.id}>
              <div>
                <a href={`/api/leave/attachments/${encodeURIComponent(attachment.id)}/download`}>{attachment.originalFilename}</a>
                <p className="muted">{readableBytes(attachment.sizeBytes)}</p>
              </div>
              <form action={deleteAction.bind(null, requestGroupId, attachment.id, expectedRevisionId)}>
                <button className="btn danger" type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
