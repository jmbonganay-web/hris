"use client";
import { useState } from "react";

export function DocumentAccessButton({ versionId, mimeType, disposition }: { versionId: string; mimeType: string | null; disposition: "preview" | "download" }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (disposition === "preview" && mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return null;
  async function access() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/documents/versions/${versionId}/access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ disposition }) });
      const result = await response.json() as { url?: string; filename?: string; message?: string };
      if (!response.ok || !result.url) throw new Error(result.message ?? "File access is unavailable.");
      if (disposition === "preview") window.open(result.url, "_blank", "noopener,noreferrer");
      else { const anchor = document.createElement("a"); anchor.href = result.url; anchor.download = result.filename ?? "document"; anchor.rel = "noopener"; document.body.append(anchor); anchor.click(); anchor.remove(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "File access is unavailable."); }
    finally { setBusy(false); }
  }
  return <span><button className="btn secondary" type="button" onClick={access} disabled={busy}>{busy ? "Opening…" : disposition === "preview" ? "Preview" : "Download"}</button>{error && <span className="form-error" role="alert">{error}</span>}</span>;
}
