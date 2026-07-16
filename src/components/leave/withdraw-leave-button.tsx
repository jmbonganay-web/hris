"use client";

import { withdrawLeaveRequest } from "@/app/(dashboard)/employee/leave/actions";

export function WithdrawLeaveButton({
  requestGroupId,
  expectedRevisionId,
}: {
  requestGroupId: string;
  expectedRevisionId: string;
}) {
  return (
    <form
      action={withdrawLeaveRequest.bind(null, requestGroupId, expectedRevisionId)}
      onSubmit={(event) => {
        if (!window.confirm("Withdraw this pending leave request?")) event.preventDefault();
      }}
    >
      <button className="btn danger" type="submit">Withdraw</button>
    </form>
  );
}
