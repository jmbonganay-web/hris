"use client";

import { useActionState, useEffect, useState } from "react";
import type { EmployeeActionState } from "@/features/employees/types";

const initialState: EmployeeActionState = {};

export function AvatarUploadForm({
  action,
  hasAvatar,
  removeAction,
}: {
  action: (state: EmployeeActionState, formData: FormData) => Promise<EmployeeActionState>;
  hasAvatar: boolean;
  removeAction: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState("");

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function handleFile(file?: File) {
    setClientError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setClientError("Upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setClientError("Profile photos must be 5 MB or smaller.");
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="avatar-management">
      {preview && <img className="avatar-preview" src={preview} alt="Selected profile photo preview" />}
      <form action={formAction} className="avatar-upload-form">
        <label className="btn avatar-file-button">
          Choose photo
          <input
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </label>
        <button className="btn primary" disabled={pending || Boolean(clientError)}>
          {pending ? "Uploading…" : hasAvatar ? "Replace photo" : "Upload photo"}
        </button>
      </form>
      {(clientError || state.error) && <p className="field-error" role="alert">{clientError || state.error}</p>}
      <p className="muted">JPG, PNG, or WebP. Maximum 5 MB.</p>
      {hasAvatar && (
        <form action={removeAction}>
          <button className="btn danger-outline" type="submit">Remove photo</button>
        </form>
      )}
    </div>
  );
}
