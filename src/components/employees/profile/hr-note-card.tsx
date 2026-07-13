import Link from "next/link";
import type { HrNoteRecord } from "@/features/employees/hr-notes/types";
import { DeleteHrNoteButton } from "./delete-hr-note-button";
import { RestoreHrNoteButton } from "./restore-hr-note-button";

function personName(person: HrNoteRecord["author"]) {
  if (!person) return "Unknown HR user";
  return person.display_name?.trim()
    || [person.first_name, person.last_name].filter(Boolean).join(" ")
    || "HR user";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function HrNoteCard({
  note,
  employeeId,
  canEdit = false,
  canDelete = false,
  deleteAction,
  restoreAction,
  deleted = false,
}: {
  note: HrNoteRecord;
  employeeId: string;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteAction?: () => Promise<void>;
  restoreAction?: () => Promise<void>;
  deleted?: boolean;
}) {
  return (
    <article className="card hr-note-card">
      <div className="hr-note-card-heading">
        <div>
          <span className="hr-note-category">{note.category}</span>
          <div className="hr-note-meta">
            <span>By {personName(note.author)}</span>
            <span>Created {formatDateTime(note.created_at)}</span>
            {note.updated_at && (
              <span>Updated {formatDateTime(note.updated_at)}</span>
            )}
            {deleted && note.deleted_at && (
              <span>
                Deleted {formatDateTime(note.deleted_at)} by {personName(note.deleter)}
              </span>
            )}
          </div>
        </div>
      </div>

      {note.contentUnavailable ? (
        <p className="hr-note-unavailable" role="status">
          This note cannot be displayed because its encrypted content could not be verified.
        </p>
      ) : (
        <p className="hr-note-body">{note.content}</p>
      )}

      <div className="hr-note-actions">
        {canEdit && (
          <Link
            className="btn"
            href={`/employees/${employeeId}/hr-notes/${note.id}/edit`}
          >
            Edit
          </Link>
        )}
        {canDelete && deleteAction && (
          <DeleteHrNoteButton action={deleteAction} />
        )}
        {restoreAction && <RestoreHrNoteButton action={restoreAction} />}
      </div>
    </article>
  );
}
