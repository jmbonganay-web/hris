import { createClient } from "@/lib/supabase/server";
import {
  emptyMaskedSensitiveDetails,
  maskedValue,
} from "./masking";
import type {
  MaskedSensitiveDetails,
  PayrollAccountType,
} from "./types";

export async function getMaskedSensitiveDetails(
  employeeId: string,
): Promise<MaskedSensitiveDetails> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_sensitive_details")
    .select(`
      employee_id,
      sss_last4,
      philhealth_last4,
      pagibig_last4,
      tin_last4,
      bank_name,
      account_name_last4,
      account_number_last4,
      payroll_account_type
    `)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) {
    console.error(
      [
        "[Supabase masked sensitive details]",
        `code=${error.code ?? "none"}`,
        `message=${error.message ?? "none"}`,
      ].join(" "),
    );
    throw new Error("Unable to load sensitive employee details.");
  }

  if (!data) return emptyMaskedSensitiveDetails(employeeId);

  return {
    employee_id: data.employee_id,
    sss_number: maskedValue("sss_number", data.sss_last4),
    philhealth_number: maskedValue(
      "philhealth_number",
      data.philhealth_last4,
    ),
    pagibig_number: maskedValue("pagibig_number", data.pagibig_last4),
    tin: maskedValue("tin", data.tin_last4),
    bank_name: data.bank_name,
    account_name: maskedValue("account_name", data.account_name_last4),
    account_number: maskedValue(
      "account_number",
      data.account_number_last4,
    ),
    payroll_account_type:
      data.payroll_account_type as PayrollAccountType | null,
  };
}
