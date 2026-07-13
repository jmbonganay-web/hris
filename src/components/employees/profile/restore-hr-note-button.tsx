"use client";

import { useState } from "react";

export function RestoreHrNoteButton({
  action,
}: {
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className="btn" type="button" onClick={() => setConfirming(true)}>
        Restore
      </button>
    );
  }

  return (
    <div className="archive-confirm hr-note-delete-confirm">
      <span>Restore this note to the active HR Notes list?</span>
      <form action={action}>
        <button className="btn primary" type="submit">
          Confirm restore
        </button>
      </form>
      <button className="btn" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}
