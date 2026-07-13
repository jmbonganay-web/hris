"use client";

import { useState } from "react";

export function ArchiveOrganizationButton({
  action,
  label,
  assignedCount,
}: {
  action: () => Promise<void>;
  label: string;
  assignedCount: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="btn danger-outline" onClick={() => setConfirming(true)}>
        Archive {label}
      </button>
    );
  }

  return (
    <div className="archive-confirm organization-archive-confirm">
      <span>
        {assignedCount > 0
          ? `${assignedCount} active employee${assignedCount === 1 ? " is" : "s are"} assigned. Existing records will be preserved.`
          : `Archive this ${label}?`}
      </span>
      <button type="button" className="btn" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      <form action={action}>
        <button className="btn danger">Confirm archive</button>
      </form>
    </div>
  );
}
