import Link from "next/link";
import { LeaveBalanceCards } from "@/components/leave/leave-balance-cards";
import { LeaveCalendar } from "@/components/leave/leave-calendar";
import { LeaveRequestTable } from "@/components/leave/leave-request-table";
import { PageHeader } from "@/components/page-header";
import { companyDateAt } from "@/features/attendance/time";
import { requireLeaveEmployee } from "@/features/leave/auth";
import { getMyLeaveBalances } from "@/features/leave/balances/queries";
import { getMyLeaveRequests } from "@/features/leave/requests/queries";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input ?? "";
}

function selectedYear(valueText: string, fallback: number) {
  const valueNumber = Number(valueText);
  return Number.isInteger(valueNumber) && valueNumber >= 2000 && valueNumber <= 2200
    ? valueNumber
    : fallback;
}

function selectedMonth(valueText: string, fallback: number) {
  const valueNumber = Number(valueText);
  return Number.isInteger(valueNumber) && valueNumber >= 1 && valueNumber <= 12
    ? valueNumber
    : fallback;
}

export default async function EmployeeLeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireLeaveEmployee();
  const query = await searchParams;
  const today = companyDateAt();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const leaveYear = selectedYear(value(query.year), currentYear);
  const month = selectedMonth(value(query.month), currentMonth);
  const success = value(query.success);
  const error = value(query.error);

  const [balances, requestPage] = await Promise.all([
    getMyLeaveBalances(leaveYear),
    getMyLeaveRequests({ leaveYear, page: 1, pageSize: 100 }),
  ]);
  const requests = requestPage.items;

  return (
    <>
      <PageHeader
        title="My Leave"
        description="Review balances, plan leave, and track request decisions."
        action={<Link className="btn primary" href="/employee/leave/new">Request leave</Link>}
      />
      {success && <p className="form-success">Leave request updated successfully.</p>}
      {error && <p className="form-error">{error}</p>}
      <LeaveBalanceCards balances={balances} />
      <LeaveCalendar year={leaveYear} month={month} requests={requests} baseHref="/employee/leave" />
      <section className="card">
        <div className="section-heading-row">
          <div>
            <h2 className="card-title">Request history</h2>
            <p className="muted">All requests for {leaveYear}, including drafts and final outcomes.</p>
          </div>
          <form className="toolbar" method="get">
            <label>
              <span className="sr-only">Leave year</span>
              <input className="field" type="number" name="year" min="2000" max="2200" defaultValue={leaveYear} />
            </label>
            <input type="hidden" name="month" value={month} />
            <button className="btn" type="submit">Change year</button>
          </form>
        </div>
        <LeaveRequestTable requests={requests} />
      </section>
    </>
  );
}
