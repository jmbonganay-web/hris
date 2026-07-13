import type {
  MaskedProtectedValue,
  MaskedSensitiveDetails,
  SensitiveFieldName,
} from "./types.ts";

const maskLengths: Record<SensitiveFieldName, number> = {
  sss_number: 6,
  philhealth_number: 8,
  pagibig_number: 8,
  tin: 5,
  account_name: 8,
  account_number: 8,
};

export function maskSensitiveField(
  field: SensitiveFieldName,
  last4: string | null,
) {
  if (!last4) return "Not provided";
  return `${"•".repeat(maskLengths[field])}${last4}`;
}

export function maskedValue(
  field: SensitiveFieldName,
  last4: string | null,
): MaskedProtectedValue {
  return {
    hasValue: Boolean(last4),
    last4,
    masked: maskSensitiveField(field, last4),
  };
}

export function emptyMaskedSensitiveDetails(
  employeeId: string,
): MaskedSensitiveDetails {
  return {
    employee_id: employeeId,
    sss_number: maskedValue("sss_number", null),
    philhealth_number: maskedValue("philhealth_number", null),
    pagibig_number: maskedValue("pagibig_number", null),
    tin: maskedValue("tin", null),
    bank_name: null,
    account_name: maskedValue("account_name", null),
    account_number: maskedValue("account_number", null),
    payroll_account_type: null,
  };
}
