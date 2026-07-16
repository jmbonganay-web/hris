export type DocumentUploadStage = "idle" | "preparing" | "uploading" | "finalizing" | "complete" | "failed";
const labels: Record<DocumentUploadStage, string> = { idle: "Ready", preparing: "Preparing", uploading: "Uploading", finalizing: "Finalizing", complete: "Complete", failed: "Failed" };
export function DocumentUploadProgress({ stage, completed, total }: { stage: DocumentUploadStage; completed: number; total: number }) {
  if (stage === "idle") return null;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : stage === "complete" ? 100 : 0;
  return <div className="document-upload-progress" aria-live="polite"><div className="card-header-row"><strong>{labels[stage]}</strong><span>{completed} / {total}</span></div><progress max={100} value={percentage}>{percentage}%</progress></div>;
}
