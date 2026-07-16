import Link from "next/link";
import { formatCompanyDate, formatCompanyDateTime } from "@/features/attendance/time";
import {
  formatLeaveUnits,
  leaveDurationLabel,
  leaveStatusLabel,
} from "@/features/leave/presentation";
import type { LeaveRequestListItem } from "@/features/leave/types";
import { WithdrawLeaveButton } from "./withdraw-leave-button";

export function LeaveRequestTable({ requests, baseHref = "/employee/leave" }: { requests: LeaveRequestListItem[]; baseHref?: "/employee/leave" | "/admin/leave" }) {
  if (requests.length === 0) {
    return <div className="empty-state"><p>No leave requests found for this year.</p></div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Leave type</th><th>Date range</th><th>Duration</th><th>Requested</th>
            <th>Chargeable</th><th>Status</th><th>Submitted</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.requestGroupId}>
              <td>{request.leaveTypeName}</td>
              <td>{formatCompanyDate(request.startDate)}{request.endDate !== request.startDate ? ` – ${formatCompanyDate(request.endDate)}` : ""}</td>
              <td>{leaveDurationLabel(request.durationMode)}</td>
              <td>{formatLeaveUnits(request.requestedUnits)}</td>
              <td>{formatLeaveUnits(request.chargeableUnits)}</td>
              <td><span className={`badge status-${request.status}`}>{leaveStatusLabel(request.status)}</span></td>
              <td>{formatCompanyDateTime(request.submittedAt)}</td>
              <td>
                <div className="table-actions">
                  {request.status === "draft" && baseHref === "/employee/leave" ? (
                    <Link className="btn" href={`${baseHref}/${request.requestGroupId}/edit`}>Edit</Link>
                  ) : (
                    <Link className="btn" href={`${baseHref}/${request.requestGroupId}`}>View</Link>
                  )}
                  {request.status === "pending" && baseHref === "/employee/leave" && (
                    <WithdrawLeaveButton
                      requestGroupId={request.requestGroupId}
                      expectedRevisionId={request.activeRevisionId}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
