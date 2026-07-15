import { companyDateAt } from "../attendance/time.ts";
import type {
  OvertimeRecalculationActionState,
  OvertimeReviewActionState,
} from "./types.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function validateOvertimeRecalculation(
  formData: FormData,
  companyDate = companyDateAt(),
): {
  data?: {
    scope: "one_employee" | "all_active";
    employeeIds: string[] | null;
    startDate: string;
    endDate: string;
    reason: string;
  };
  state?: OvertimeRecalculationActionState;
} {
  const scope = text(formData, "scope");
  const employeeId = text(formData, "employee_id");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const reason = text(formData, "reason");
  const fieldErrors: Record<string, string> = {};

  if (scope !== "one_employee" && scope !== "all_active") {
    fieldErrors.scope = "Choose an employee scope.";
  }
  if (scope === "one_employee" && !uuidPattern.test(employeeId)) {
    fieldErrors.employee_id = "Select a valid employee.";
  }
  if (!datePattern.test(startDate)) {
    fieldErrors.start_date = "Start date is required.";
  }
  if (!datePattern.test(endDate)) {
    fieldErrors.end_date = "End date is required.";
  } else if (startDate && endDate < startDate) {
    fieldErrors.end_date = "End date must be on or after the start date.";
  }
  if ((startDate && startDate > companyDate) || (endDate && endDate > companyDate)) {
    fieldErrors.end_date = "Future dates cannot be recalculated.";
  }
  if (!reason) {
    fieldErrors.reason = "A recalculation reason is required.";
  } else if (reason.length > 1000) {
    fieldErrors.reason = "Reason must be 1,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: {
          scope: scope === "all_active" ? "all_active" : "one_employee",
          employeeId,
          startDate,
          endDate,
        },
      },
    };
  }

  return {
    data: {
      scope: scope as "one_employee" | "all_active",
      employeeIds: scope === "one_employee" ? [employeeId] : null,
      startDate,
      endDate,
      reason,
    },
  };
}

export function validateOvertimeReview(
  formData: FormData,
): {
  data?: {
    approvalItemId: string;
    expectedStatus: "pending";
    decision: "approve" | "reject";
    reviewText: string | null;
  };
  state?: OvertimeReviewActionState;
} {
  const approvalItemId = text(formData, "approval_item_id");
  const expectedStatus = text(formData, "expected_status");
  const decision = text(formData, "decision");
  const reviewText = text(formData, "review_text");
  const fieldErrors: Record<string, string> = {};

  if (!uuidPattern.test(approvalItemId)) fieldErrors.approval_item_id = "Invalid overtime item.";
  if (expectedStatus !== "pending") fieldErrors.expected_status = "This item is no longer pending.";
  if (decision !== "approve" && decision !== "reject") fieldErrors.decision = "Choose approve or reject.";
  if (decision === "reject" && !reviewText) fieldErrors.review_text = "A rejection reason is required.";
  if (reviewText.length > 1000) fieldErrors.review_text = "Review text must be 1,000 characters or fewer.";

  if (Object.keys(fieldErrors).length > 0) {
    return { state: { error: "Please correct the highlighted fields.", fieldErrors } };
  }
  return {
    data: {
      approvalItemId,
      expectedStatus: "pending",
      decision: decision as "approve" | "reject",
      reviewText: reviewText || null,
    },
  };
}
