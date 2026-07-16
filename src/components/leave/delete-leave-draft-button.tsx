"use client";

import { deleteLeaveDraft } from "@/app/(dashboard)/employee/leave/actions";

export function DeleteLeaveDraftButton({
  requestGroupId,
  expectedRevisionId,
}: {
  requestGroupId: string;
  expectedRevisionId: string;
}) {
  return (
    <form
      action={deleteLeaveDraft.bind(null, requestGroupId, expectedRevisionId)}
      onSubmit={(event) => {
        if (!window.confirm("Delete this leave draft and its supporting documents?")) {
          event.preventDefault();
        }
      }}
    >
      <button className="btn danger" type="submit">Delete draft</button>
    </form>
  );
}
