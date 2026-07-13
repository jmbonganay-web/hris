"use client";

import { useState } from "react";

export function DeleteEmergencyContactButton({ action, isPrimary }: { action: () => Promise<void>; isPrimary: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button className="btn danger-outline" type="button" onClick={() => setConfirming(true)}>Delete</button>;
  return (
    <div className="archive-confirm emergency-delete-confirm">
      <span>{isPrimary ? "Primary contact deletion may be blocked." : "Delete this contact?"}</span>
      <form action={action}><button className="btn danger" type="submit">Confirm delete</button></form>
      <button className="btn" type="button" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  );
}
