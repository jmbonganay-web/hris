"use client";

export function ArchiveScheduleButton({ action, archived }: { action: () => Promise<void>; archived: boolean }) {
  return <form action={action} onSubmit={(event) => { if (!confirm(archived ? "Restore this schedule?" : "Archive this schedule? Existing assignments will remain valid.")) event.preventDefault(); }}><button className={`btn ${archived ? "primary" : "danger"}`} type="submit">{archived ? "Restore schedule" : "Archive schedule"}</button></form>;
}
