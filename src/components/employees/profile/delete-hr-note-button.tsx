"use client";

import { useState } from "react";

export function DeleteHrNoteButton({
  action,
}: {
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className="btn danger-outline"
        type="button"
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <div className="archive-confirm hr-note-delete-confirm">
      <span>
        Delete this HR note? It will be hidden, and only a Super Admin can restore it.
      </span>
      <form action={action}>
        <button className="btn danger" type="submit">
          Confirm delete
        </button>
      </form>
      <button className="btn" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}
