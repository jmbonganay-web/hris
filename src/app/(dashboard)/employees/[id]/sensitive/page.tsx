import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProfileTabs } from "@/components/employees/profile/profile-tabs";
import { SensitiveFieldReveal } from "@/components/employees/profile/sensitive-field-reveal";
import { requireSensitiveEmployeeManager } from "@/features/employees/sensitive/auth";
import { getMaskedSensitiveDetails } from "@/features/employees/sensitive/queries";
import { getEmployee } from "@/features/employees/queries";
import { revealSensitiveValue } from "../sensitive-actions";

const payrollLabels = {
  savings: "Savings",
  current: "Current",
  payroll: "Payroll",
  other: "Other",
} as const;

const governmentLabels = {
  sss_number: "SSS number",
  philhealth_number: "PhilHealth number",
  pagibig_number: "Pag-IBIG number",
  tin: "TIN",
} as const;

export default async function SensitiveEmployeeDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  await requireSensitiveEmployeeManager(id);
  const [employee, details] = await Promise.all([
    getEmployee(id),
    getMaskedSensitiveDetails(id),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="Government & Payroll"
        description={`Protected HR data for ${employee.first_name} ${employee.last_name}.`}
        action={(
          <div className="header-actions">
            <Link className="btn" href={`/employees/${id}`}>
              Back to profile
            </Link>
            <Link className="btn primary" href={`/employees/${id}/sensitive/edit`}>
              Edit details
            </Link>
          </div>
        )}
      />

      {query.success === "sensitive_updated" && (
        <p className="form-success">
          Government and payroll details updated.
        </p>
      )}

      <ProfileTabs employeeId={id} active="sensitive" canManage />

      <section className="card profile-section-card">
        <div className="profile-section-heading">
          <div>
            <h2>Government IDs</h2>
            <p className="muted">
              Values are masked by default. Every successful reveal is recorded.
            </p>
          </div>
        </div>

        <dl className="sensitive-list">
          {(
            [
              "sss_number",
              "philhealth_number",
              "pagibig_number",
              "tin",
            ] as const
          ).map((field) => (
            <SensitiveFieldReveal
              key={field}
              label={governmentLabels[field]}
              masked={details[field].masked}
              hasValue={details[field].hasValue}
              revealAction={revealSensitiveValue.bind(null, id, field)}
            />
          ))}
        </dl>
      </section>

      <section className="card profile-section-card">
        <div className="profile-section-heading">
          <div>
            <h2>Payroll and bank details</h2>
            <p className="muted">
              Only HR Admin and Super Admin can access these details.
            </p>
          </div>
        </div>

        <dl className="sensitive-list">
          <div className="sensitive-row">
            <div>
              <dt>Bank name</dt>
              <dd>{details.bank_name ?? "Not provided"}</dd>
            </div>
          </div>
          <SensitiveFieldReveal
            label="Account name"
            masked={details.account_name.masked}
            hasValue={details.account_name.hasValue}
            revealAction={revealSensitiveValue.bind(null, id, "account_name")}
          />
          <SensitiveFieldReveal
            label="Account number"
            masked={details.account_number.masked}
            hasValue={details.account_number.hasValue}
            revealAction={revealSensitiveValue.bind(null, id, "account_number")}
          />
          <div className="sensitive-row">
            <div>
              <dt>Payroll account type</dt>
              <dd>
                {details.payroll_account_type
                  ? payrollLabels[details.payroll_account_type]
                  : "Not provided"}
              </dd>
            </div>
          </div>
        </dl>
      </section>
    </>
  );
}
