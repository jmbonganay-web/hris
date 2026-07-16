"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { submitLeaveRequest } from "@/app/(dashboard)/employee/leave/actions";
import type {
  LeaveActionState,
  LeaveAttachment,
  LeaveDraftValues,
  LeaveDurationMode,
  LeavePreviewResult,
  LeaveTypeOption,
} from "@/features/leave/types";
import { LeaveAttachmentUploader } from "./leave-attachment-uploader";
import { LeaveRequestPreview } from "./leave-request-preview";

const initialState: LeaveActionState = {};

export type LeaveRequestFormProps = {
  mode: "create" | "edit";
  employeeId: string;
  leaveTypes: LeaveTypeOption[];
  initialValues?: LeaveDraftValues;
  requestGroupId?: string;
  expectedRevisionId?: string;
  attachments?: LeaveAttachment[];
  action: (state: LeaveActionState, formData: FormData) => Promise<LeaveActionState>;
  previewAction: (formData: FormData) => Promise<LeavePreviewResult>;
  employeeOptions?: Array<{ id: string; first_name: string; last_name: string; employee_number: string }>;
};

function formDataFor(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  durationMode: LeaveDurationMode;
  employeeNote: string;
  replacesRequestGroupId: string | null;
  requestGroupId?: string;
}) {
  const data = new FormData();
  data.set("employee_id", input.employeeId);
  data.set("leave_type_id", input.leaveTypeId);
  data.set("start_date", input.startDate);
  data.set("end_date", input.endDate);
  data.set("duration_mode", input.durationMode);
  data.set("employee_note", input.employeeNote);
  data.set("replaces_request_group_id", input.replacesRequestGroupId ?? "");
  data.set("request_group_id", input.requestGroupId ?? "");
  return data;
}

export function LeaveRequestForm({
  mode,
  employeeId,
  leaveTypes,
  initialValues,
  requestGroupId,
  expectedRevisionId,
  attachments = [],
  action,
  previewAction,
  employeeOptions,
}: LeaveRequestFormProps) {
  const [state, formAction, saving] = useActionState(action, initialState);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId);
  const [leaveTypeId, setLeaveTypeId] = useState(initialValues?.leaveTypeId ?? leaveTypes[0]?.leaveTypeId ?? "");
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialValues?.endDate ?? "");
  const [durationMode, setDurationMode] = useState<LeaveDurationMode>(initialValues?.durationMode ?? "full_day");
  const [employeeNote, setEmployeeNote] = useState(initialValues?.employeeNote ?? "");
  const [preview, setPreview] = useState<LeavePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, startPreviewTransition] = useTransition();
  const [submitPending, startSubmitTransition] = useTransition();
  const submitAfterSaveRef = useRef(false);
  const wasSavingRef = useRef(false);
  const selectedType = useMemo(
    () => leaveTypes.find((leaveType) => leaveType.leaveTypeId === leaveTypeId) ?? null,
    [leaveTypeId, leaveTypes],
  );
  const isSingleDay = Boolean(startDate && endDate && startDate === endDate);

  useEffect(() => {
    if (!isSingleDay && durationMode !== "full_day") setDurationMode("full_day");
  }, [durationMode, isSingleDay]);

  function refreshPreview() {
    if (!leaveTypeId || !startDate || !endDate) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    const data = formDataFor({
      employeeId: selectedEmployeeId,
      leaveTypeId,
      startDate,
      endDate,
      durationMode,
      employeeNote,
      replacesRequestGroupId: initialValues?.replacesRequestGroupId ?? null,
      requestGroupId,
    });
    startPreviewTransition(() => {
      void previewAction(data)
        .then((result) => {
          setPreview(result);
          setPreviewError("");
        })
        .catch((error: unknown) => {
          setPreview(null);
          setPreviewError(error instanceof Error ? error.message : "Unable to calculate leave dates.");
        });
    });
  }

  useEffect(() => {
    if (!leaveTypeId || !startDate || !endDate) return;
    const timer = window.setTimeout(refreshPreview, 250);
    return () => window.clearTimeout(timer);
    // The controlled request fields are the intended preview dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, leaveTypeId, startDate, endDate, durationMode]);

  useEffect(() => {
    const finishedSaving = wasSavingRef.current && !saving;
    wasSavingRef.current = saving;
    if (!finishedSaving || !submitAfterSaveRef.current) return;
    if (state.success && requestGroupId && expectedRevisionId) {
      submitAfterSaveRef.current = false;
      startSubmitTransition(() => {
        void submitLeaveRequest(requestGroupId, expectedRevisionId);
      });
    } else if (state.error || state.fieldErrors) {
      submitAfterSaveRef.current = false;
    }
  }, [expectedRevisionId, requestGroupId, saving, state.error, state.fieldErrors, state.success]);

  const busy = saving || previewPending || submitPending;

  return (
    <div className="leave-request-workspace">
      <form action={formAction} className="card form-card leave-request-form">
        {employeeOptions ? (
          <label>
            <span>Employee</span>
            <select
              className="field"
              name="employee_id"
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              required
            >
              <option value="">Select employee</option>
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.last_name}, {employee.first_name} · {employee.employee_number}
                </option>
              ))}
            </select>
            {state.fieldErrors?.employee_id && <small className="field-error">{state.fieldErrors.employee_id}</small>}
          </label>
        ) : (
          <input type="hidden" name="employee_id" value={selectedEmployeeId} />
        )}
        <input type="hidden" name="request_group_id" value={requestGroupId ?? ""} />
        <input type="hidden" name="replaces_request_group_id" value={initialValues?.replacesRequestGroupId ?? ""} />

        <div className="form-grid">
          <label>
            <span>Leave type</span>
            <select
              className="field"
              name="leave_type_id"
              value={leaveTypeId}
              onChange={(event) => setLeaveTypeId(event.target.value)}
              required
            >
              {leaveTypes.length === 0 && <option value="">No leave types available</option>}
              {leaveTypes.map((leaveType) => (
                <option key={leaveType.leaveTypeId} value={leaveType.leaveTypeId}>
                  {leaveType.name} · {leaveType.isPaid ? "Paid" : "Unpaid"}
                </option>
              ))}
            </select>
            {state.fieldErrors?.leave_type_id && <small className="field-error">{state.fieldErrors.leave_type_id}</small>}
          </label>

          <label>
            <span>Start date</span>
            <input
              className="field"
              type="date"
              name="start_date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
            {state.fieldErrors?.start_date && <small className="field-error">{state.fieldErrors.start_date}</small>}
          </label>

          <label>
            <span>End date</span>
            <input
              className="field"
              type="date"
              name="end_date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
            {state.fieldErrors?.end_date && <small className="field-error">{state.fieldErrors.end_date}</small>}
          </label>

          <label>
            <span>Duration</span>
            <select
              className="field"
              name="duration_mode"
              value={durationMode}
              onChange={(event) => setDurationMode(event.target.value as LeaveDurationMode)}
            >
              <option value="full_day">Full day</option>
              <option value="first_half" disabled={!isSingleDay}>First half</option>
              <option value="second_half" disabled={!isSingleDay}>Second half</option>
            </select>
            {!isSingleDay && <small className="muted">Half-day leave is available for one date only.</small>}
            {state.fieldErrors?.duration_mode && <small className="field-error">{state.fieldErrors.duration_mode}</small>}
          </label>
        </div>

        <label>
          <span>
            Employee note {selectedType?.employeeNoteRequired ? "(required)" : "(optional)"}
          </span>
          <textarea
            className="field"
            name="employee_note"
            rows={4}
            maxLength={1000}
            required={selectedType?.employeeNoteRequired ?? false}
            value={employeeNote}
            onChange={(event) => setEmployeeNote(event.target.value)}
          />
          <small className="muted">{employeeNote.length}/1,000 characters. Visible only to you and authorized HR users.</small>
          {state.fieldErrors?.employee_note && <small className="field-error">{state.fieldErrors.employee_note}</small>}
        </label>

        {previewError && <p className="form-error" role="alert">{previewError}</p>}
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        {state.success && <p className="form-success">{state.success}</p>}

        <div className="form-actions">
          <button className="btn" type="button" disabled={busy} onClick={refreshPreview}>
            {previewPending ? "Calculating…" : "Refresh calculation"}
          </button>
          <button
            className="btn"
            type="submit"
            disabled={saving || leaveTypes.length === 0}
            onClick={() => { submitAfterSaveRef.current = false; }}
          >
            {saving && !submitAfterSaveRef.current ? "Saving…" : "Save draft"}
          </button>
          <button
            className="btn primary"
            type="submit"
            disabled={mode === "create" || !requestGroupId || !expectedRevisionId || saving || submitPending || leaveTypes.length === 0}
            onClick={() => { submitAfterSaveRef.current = true; }}
          >
            {submitPending || (saving && submitAfterSaveRef.current) ? "Submitting…" : "Submit request"}
          </button>
        </div>
        {mode === "create" && (
          <p className="muted">Save the draft first to upload documents and submit the request.</p>
        )}
      </form>

      <LeaveRequestPreview preview={preview} />

      {requestGroupId && expectedRevisionId && (
        <LeaveAttachmentUploader
          requestGroupId={requestGroupId}
          expectedRevisionId={expectedRevisionId}
          attachments={attachments}
        />
      )}
    </div>
  );
}
