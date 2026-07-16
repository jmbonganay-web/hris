import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { previewLeaveDraft, updateLeaveDraft } from "@/app/(dashboard)/employee/leave/actions";
import { DeleteLeaveDraftButton } from "@/components/leave/delete-leave-draft-button";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { PageHeader } from "@/components/page-header";
import { requireLeaveEmployee } from "@/features/leave/auth";
import { getActiveLeaveTypeOptions } from "@/features/leave/policy/queries";
import { LeaveRequestNotFoundError, getLeaveRequestDetail } from "@/features/leave/requests/queries";

export default async function EditLeaveRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestGroupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireLeaveEmployee();
  const { requestGroupId } = await params;
  const query = await searchParams;
  let detail;
  try {
    detail = await getLeaveRequestDetail(requestGroupId);
  } catch (error) {
    if (error instanceof LeaveRequestNotFoundError) notFound();
    throw error;
  }
  if (detail.status !== "draft") redirect(`/employee/leave/${requestGroupId}`);

  const leaveTypes = await getActiveLeaveTypeOptions(detail.startDate);
  const updateAction = updateLeaveDraft.bind(null, requestGroupId, detail.activeRevisionId);
  const success = Array.isArray(query.success) ? query.success[0] : query.success;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <>
      <PageHeader
        title="Edit Leave Draft"
        description="Update the draft, attach supporting documents, and submit only when the calculation is correct."
        action={(
          <div className="header-actions">
            <DeleteLeaveDraftButton requestGroupId={requestGroupId} expectedRevisionId={detail.activeRevisionId} />
            <Link className="btn" href={`/employee/leave/${requestGroupId}`}>View request</Link>
          </div>
        )}
      />
      {success && <p className="form-success">Draft updated successfully.</p>}
      {error && <p className="form-error">{error}</p>}
      <LeaveRequestForm
        mode="edit"
        employeeId={detail.employeeId}
        leaveTypes={leaveTypes}
        initialValues={{
          employeeId: detail.employeeId,
          leaveTypeId: detail.leaveTypeId,
          startDate: detail.startDate,
          endDate: detail.endDate,
          durationMode: detail.durationMode,
          employeeNote: detail.employeeNote ?? "",
          replacesRequestGroupId: detail.replacesRequestGroupId,
        }}
        requestGroupId={requestGroupId}
        expectedRevisionId={detail.activeRevisionId}
        attachments={detail.attachments}
        action={updateAction}
        previewAction={previewLeaveDraft}
      />
    </>
  );
}
