import {
  normalizeAccountName,
  normalizeAccountNumber,
  normalizeGovernmentId,
} from "../../../lib/security/sensitive-data.ts";
import type {
  PayrollAccountType,
  ProtectedFieldUpdate,
  SensitiveDetailsActionState,
  SensitiveDetailsInput,
} from "./types.ts";

const governmentPattern = /^[\d\s-]+$/;
const accountNumberPattern = /^[a-z0-9\s-]+$/i;
const payrollTypes: PayrollAccountType[] = [
  "savings",
  "current",
  "payroll",
  "other",
];

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function invalidState(
  fieldErrors: Record<string, string>,
  bankName: string,
  payrollAccountType: string,
): SensitiveDetailsActionState {
  return {
    error: "Please correct the highlighted fields.",
    fieldErrors,
    values: {
      bank_name: bankName,
      payroll_account_type: payrollAccountType,
    },
  };
}

function governmentUpdate(
  formData: FormData,
  name: "sss_number" | "philhealth_number" | "pagibig_number" | "tin",
  label: string,
  minDigits: number,
  maxDigits: number,
  fieldErrors: Record<string, string>,
): ProtectedFieldUpdate {
  const raw = value(formData, name);
  const clear = formData.get(`clear_${name}`) === "on";

  if (clear && raw) {
    fieldErrors[name] = "Choose either a replacement value or Clear, not both.";
    return { mode: "preserve" };
  }
  if (clear) return { mode: "clear" };
  if (!raw) return { mode: "preserve" };

  if (!governmentPattern.test(raw)) {
    fieldErrors[name] = `${label} may contain only digits, spaces, and hyphens.`;
    return { mode: "preserve" };
  }

  const normalized = normalizeGovernmentId(raw);
  if (normalized.length < minDigits || normalized.length > maxDigits) {
    fieldErrors[name] = minDigits === maxDigits
      ? `${label} must contain exactly ${minDigits} digits.`
      : `${label} must contain ${minDigits} to ${maxDigits} digits.`;
    return { mode: "preserve" };
  }

  return { mode: "replace", value: normalized, normalized };
}

function protectedBankUpdate(
  formData: FormData,
  name: "account_name" | "account_number",
  normalize: (input: string) => string,
  maxLength: number,
  fieldErrors: Record<string, string>,
): ProtectedFieldUpdate {
  const raw = value(formData, name);
  const clear = formData.get(`clear_${name}`) === "on";

  if (clear && raw) {
    fieldErrors[name] = "Choose either a replacement value or Clear, not both.";
    return { mode: "preserve" };
  }
  if (clear) return { mode: "clear" };
  if (!raw) return { mode: "preserve" };

  const normalized = normalize(raw);
  const label = name === "account_name" ? "Account name" : "Account number";
  if (normalized.length > maxLength) {
    fieldErrors[name] = `${label} must be ${maxLength} characters or fewer.`;
    return { mode: "preserve" };
  }

  if (name === "account_number" && !accountNumberPattern.test(normalized)) {
    fieldErrors.account_number =
      "Account number may contain only letters, digits, spaces, and hyphens.";
    return { mode: "preserve" };
  }

  return { mode: "replace", value: normalized, normalized };
}

export function validateSensitiveDetails(formData: FormData): {
  data?: SensitiveDetailsInput;
  state?: SensitiveDetailsActionState;
} {
  const fieldErrors: Record<string, string> = {};
  const bankName = value(formData, "bank_name");
  const payrollAccountType = value(formData, "payroll_account_type");

  if (bankName.length > 100) {
    fieldErrors.bank_name = "Bank name must be 100 characters or fewer.";
  }
  if (
    payrollAccountType
    && !payrollTypes.includes(payrollAccountType as PayrollAccountType)
  ) {
    fieldErrors.payroll_account_type = "Select a valid payroll account type.";
  }

  const data: SensitiveDetailsInput = {
    sss_number: governmentUpdate(
      formData,
      "sss_number",
      "SSS number",
      10,
      10,
      fieldErrors,
    ),
    philhealth_number: governmentUpdate(
      formData,
      "philhealth_number",
      "PhilHealth number",
      12,
      12,
      fieldErrors,
    ),
    pagibig_number: governmentUpdate(
      formData,
      "pagibig_number",
      "Pag-IBIG number",
      12,
      12,
      fieldErrors,
    ),
    tin: governmentUpdate(
      formData,
      "tin",
      "TIN",
      9,
      12,
      fieldErrors,
    ),
    bank_name: bankName || null,
    account_name: protectedBankUpdate(
      formData,
      "account_name",
      normalizeAccountName,
      150,
      fieldErrors,
    ),
    account_number: protectedBankUpdate(
      formData,
      "account_number",
      normalizeAccountNumber,
      50,
      fieldErrors,
    ),
    payroll_account_type: payrollAccountType
      ? payrollAccountType as PayrollAccountType
      : null,
  };

  return Object.keys(fieldErrors).length
    ? { state: invalidState(fieldErrors, bankName, payrollAccountType) }
    : { data };
}
