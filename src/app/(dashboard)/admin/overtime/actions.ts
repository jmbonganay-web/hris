"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import type { OvertimeReviewActionState } from "@/features/overtime/types";
import { validateOvertimeReview } from "@/features/overtime/validation";

function reviewError(message: string) {
  if (message.includes("OVERTIME_ITEM_STALE")) {
    return "This overtime item changed while you were reviewing it.";
  }
  if (message.includes("OVERTIME_REJECTION_REASON_REQUIRED")) {
    return "A rejection reason is required.";
  }
  if (message.includes("OVERTIME_DECISION_INVALID")) {
    return "Choose approve or reject.";
  }
  if (message.includes("PRIVATE_TEXT_TOO_LONG")) {
    return "Review text must be 1,000 characters or fewer.";
  }
  return "The overtime item could not be reviewed.";
}

export async function reviewOvertimeApproval(
  _state: OvertimeReviewActionState,
  formData: FormData,
): Promise<OvertimeReviewActionState> {
  const { supabase } = await requireAttendanceAdmin();
  const validation = validateOvertimeReview(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid overtime review." };
  }

  const { error } = await supabase.rpc("review_overtime_approval_item", {
    p_approval_item_id: validation.data.approvalItemId,
    p_expected_status: validation.data.expectedStatus,
    p_decision: validation.data.decision,
    p_review_text: validation.data.reviewText,
  });
  if (error) return { error: reviewError(error.message) };

  revalidatePath("/admin/overtime");
  revalidatePath(`/admin/overtime/${validation.data.approvalItemId}`);
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  revalidatePath("/overtime");
  redirect(`/admin/overtime/${validation.data.approvalItemId}?success=reviewed`);
}
