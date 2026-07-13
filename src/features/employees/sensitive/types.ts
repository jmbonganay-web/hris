import type { EmployeeActionState } from "../types.ts";

export const sensitiveFieldNames = [
  "sss_number",
  "philhealth_number",
  "pagibig_number",
  "tin",
  "account_name",
  "account_number",
] as const;

export type SensitiveFieldName = typeof sensitiveFieldNames[number];
export type PayrollAccountType =
  | "savings"
  | "current"
  | "payroll"
  | "other";

export type MaskedProtectedValue = {
  hasValue: boolean;
  last4: string | null;
  masked: string;
};

export type MaskedSensitiveDetails = {
  employee_id: string;
  sss_number: MaskedProtectedValue;
  philhealth_number: MaskedProtectedValue;
  pagibig_number: MaskedProtectedValue;
  tin: MaskedProtectedValue;
  bank_name: string | null;
  account_name: MaskedProtectedValue;
  account_number: MaskedProtectedValue;
  payroll_account_type: PayrollAccountType | null;
};

export type ProtectedFieldUpdate =
  | { mode: "preserve" }
  | { mode: "clear" }
  | { mode: "replace"; value: string; normalized: string };

export type SensitiveDetailsInput = {
  sss_number: ProtectedFieldUpdate;
  philhealth_number: ProtectedFieldUpdate;
  pagibig_number: ProtectedFieldUpdate;
  tin: ProtectedFieldUpdate;
  bank_name: string | null;
  account_name: ProtectedFieldUpdate;
  account_number: ProtectedFieldUpdate;
  payroll_account_type: PayrollAccountType | null;
};

export type SensitiveDetailsActionState = EmployeeActionState & {
  values?: {
    bank_name: string;
    payroll_account_type: string;
  };
};

export type RevealSensitiveValueResult =
  | { value: string; revealedAt: number }
  | { error: string };
