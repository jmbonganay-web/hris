"use client";

import { useState } from "react";

export function ArchiveButton({ action }: { action: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button type="button" className="btn danger-outline" onClick={() => setConfirming(true)}>Archive employee</button>;
  return <div className="archive-confirm"><span>Archive this employee?</span><button type="button" className="btn" onClick={() => setConfirming(false)}>Cancel</button><form action={action}><button className="btn danger">Confirm archive</button></form></div>;
}
