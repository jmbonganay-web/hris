import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AttendancePolicyForm } from "@/components/attendance/attendance-policy-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { companyDateAt } from "@/features/attendance/time";
import { createAttendancePolicyVersion } from "../actions";

export default async function NewAttendancePolicyPage() {
  await requireAttendanceAdmin();
  return (
    <>
      <PageHeader
        title="Create attendance policy version"
        description="Set an effective-dated company late-grace rule. Existing versions remain immutable."
        action={<Link className="btn" href="/settings/attendance-policy">Back to policy</Link>}
      />
      <AttendancePolicyForm action={createAttendancePolicyVersion} companyDate={companyDateAt()} />
    </>
  );
}
