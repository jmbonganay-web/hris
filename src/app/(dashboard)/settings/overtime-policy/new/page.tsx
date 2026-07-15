import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OvertimePolicyForm } from "@/components/overtime/overtime-policy-form";
import { requireAttendanceAdmin } from "@/features/attendance/auth";
import { companyDateAt } from "@/features/attendance/time";
import { createOvertimePolicyVersion } from "../actions";

export default async function NewOvertimePolicyPage() {
  await requireAttendanceAdmin();
  return (
    <>
      <PageHeader
        title="Create overtime policy version"
        description="Set an immutable minimum qualifying threshold."
        action={<Link className="btn" href="/settings/overtime-policy">Back to policy</Link>}
      />
      <OvertimePolicyForm
        action={createOvertimePolicyVersion}
        companyDate={companyDateAt()}
      />
    </>
  );
}
