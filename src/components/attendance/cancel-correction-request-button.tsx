"use client";

import { useState } from "react";
import { cancelCorrectionRequest } from "@/app/(dashboard)/attendance/actions";

export function CancelCorrectionRequestButton({ requestId }: { requestId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <button className="btn danger-outline" type="button" onClick={() => setConfirming(true)}>Cancel request</button>;
  }

  const action = cancelCorrectionRequest.bind(null, requestId);
  return (
    <div className="archive-confirm correction-cancel-confirm">
      <span>
        Cancel this pending correction request? The official attendance record will remain unchanged.
      </span>
      <form action={action}>
        <button className="btn danger" type="submit">Confirm cancellation</button>
      </form>
      <button className="btn" type="button" onClick={() => setConfirming(false)}>Keep request</button>
    </div>
  );
}
