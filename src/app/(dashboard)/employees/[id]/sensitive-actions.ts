"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  decryptSensitiveValue,
  hashSensitiveValue,
} from "@/lib/security/sensitive-data";
import { requireSensitiveEmployeeManager } from "@/features/employees/sensitive/auth";
import {
  buildSensitiveStoragePayload,
  type SensitiveStorageRow,
} from "@/features/employees/sensitive/storage";
import {
  sensitiveFieldNames,
  type RevealSensitiveValueResult,
  type SensitiveDetailsActionState,
  type SensitiveDetailsInput,
  type SensitiveFieldName,
} from "@/features/employees/sensitive/types";
import { validateSensitiveDetails } from "@/features/employees/sensitive/validation";

const encryptedColumns: Record<
  SensitiveFieldName,
  keyof SensitiveStorageRow
> = {
  sss_number: "sss_ciphertext",
  philhealth_number: "philhealth_ciphertext",
  pagibig_number: "pagibig_ciphertext",
  tin: "tin_ciphertext",
  account_name: "account_name_ciphertext",
  account_number: "account_number_ciphertext",
};

const duplicateConfig = {
  sss_number: {
    hashColumn: "sss_hash",
    indexName: "employee_sensitive_details_sss_hash_uidx",
    message: "This SSS number is already assigned to another employee.",
  },
  philhealth_number: {
    hashColumn: "philhealth_hash",
    indexName: "employee_sensitive_details_philhealth_hash_uidx",
    message: "This PhilHealth number is already assigned to another employee.",
  },
  pagibig_number: {
    hashColumn: "pagibig_hash",
    indexName: "employee_sensitive_details_pagibig_hash_uidx",
    message: "This Pag-IBIG number is already assigned to another employee.",
  },
  tin: {
    hashColumn: "tin_hash",
    indexName: "employee_sensitive_details_tin_hash_uidx",
    message: "This TIN is already assigned to another employee.",
  },
} as const;

type GovernmentField = keyof typeof duplicateConfig;

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
};

function retainedValues(input: SensitiveDetailsInput) {
  return {
    bank_name: input.bank_name ?? "",
    payroll_account_type: input.payroll_account_type ?? "",
  };
}

function duplicateState(
  field: GovernmentField,
  input?: SensitiveDetailsInput,
): SensitiveDetailsActionState {
  return {
    error: "Please correct the highlighted fields.",
    fieldErrors: { [field]: duplicateConfig[field].message },
    values: input ? retainedValues(input) : undefined,
  };
}

function duplicateStateFromDatabase(
  error: DatabaseError,
  input: SensitiveDetailsInput,
) {
  if (error.code !== "23505") return null;

  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  for (const field of Object.keys(duplicateConfig) as GovernmentField[]) {
    const config = duplicateConfig[field];
    if (
      text.includes(config.indexName)
      || text.includes(`(${config.hashColumn})`)
    ) {
      return duplicateState(field, input);
    }
  }

  return null;
}

async function preflightDuplicateCheck(
  supabase: SupabaseClient,
  employeeId: string,
  input: SensitiveDetailsInput,
): Promise<SensitiveDetailsActionState | null> {
  for (const field of Object.keys(duplicateConfig) as GovernmentField[]) {
    const update = input[field];
    if (update.mode !== "replace") continue;

    const config = duplicateConfig[field];
    const hash = hashSensitiveValue(update.normalized);
    const { data, error } = await supabase
      .from("employee_sensitive_details")
      .select("employee_id")
      .eq(config.hashColumn, hash)
      .neq("employee_id", employeeId)
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        error: "Unable to save sensitive employee details.",
        values: retainedValues(input),
      };
    }
    if (data) return duplicateState(field, input);
  }

  return null;
}

export async function updateSensitiveDetails(
  employeeId: string,
  _state: SensitiveDetailsActionState,
  formData: FormData,
): Promise<SensitiveDetailsActionState> {
  const { supabase, user } = await requireSensitiveEmployeeManager(employeeId);
  const validation = validateSensitiveDetails(formData);

  if (!validation.data) {
    return validation.state ?? {
      error: "Invalid sensitive employee details.",
    };
  }

  const input = validation.data;
  const { data: existing, error: readError } = await supabase
    .from("employee_sensitive_details")
    .select(
      "employee_id,sss_ciphertext,sss_hash,sss_last4,philhealth_ciphertext,philhealth_hash,philhealth_last4,pagibig_ciphertext,pagibig_hash,pagibig_last4,tin_ciphertext,tin_hash,tin_last4,bank_name,account_name_ciphertext,account_name_last4,account_number_ciphertext,account_number_last4,payroll_account_type",
    )
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (readError) {
    return {
      error: "Unable to save sensitive employee details.",
      values: retainedValues(input),
    };
  }

  try {
    const duplicate = await preflightDuplicateCheck(
      supabase,
      employeeId,
      input,
    );
    if (duplicate) return duplicate;

    const payload = buildSensitiveStoragePayload(
      employeeId,
      existing as SensitiveStorageRow | null,
      input,
      user.id,
    );

    const { error } = await supabase
      .from("employee_sensitive_details")
      .upsert(payload, { onConflict: "employee_id" });

    if (error) {
      return duplicateStateFromDatabase(error, input) ?? {
        error: "Unable to save sensitive employee details.",
        values: retainedValues(input),
      };
    }
  } catch {
    return {
      error: "Unable to save sensitive employee details.",
      values: retainedValues(input),
    };
  }

  revalidatePath(`/employees/${employeeId}/sensitive`);
  revalidatePath(`/employees/${employeeId}/sensitive/edit`);
  redirect(`/employees/${employeeId}/sensitive?success=sensitive_updated`);
}

export async function revealSensitiveValue(
  employeeId: string,
  fieldName: SensitiveFieldName,
): Promise<RevealSensitiveValueResult> {
  if (!sensitiveFieldNames.includes(fieldName)) {
    return { error: "Unable to reveal this value. Please try again." };
  }

  const { supabase, user } = await requireSensitiveEmployeeManager(employeeId);
  const column = encryptedColumns[fieldName];
  const { data, error } = await supabase
    .from("employee_sensitive_details")
    .select(String(column))
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error || !data) {
    return { error: "Unable to reveal this value. Please try again." };
  }

  const row = data as unknown as Record<string, string | null>;
  const ciphertext = row[String(column)] ?? null;
  if (!ciphertext) {
    return { error: "This value has not been provided." };
  }

  let plaintext: string;
  try {
    plaintext = decryptSensitiveValue(ciphertext);
  } catch {
    return { error: "Unable to reveal this value. Please try again." };
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim()
    .slice(0, 100) || null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) || null;

  const { error: logError } = await supabase
    .from("sensitive_data_access_logs")
    .insert({
      actor_profile_id: user.id,
      employee_id: employeeId,
      field_name: fieldName,
      action: "reveal",
      ip_address: forwardedFor,
      user_agent: userAgent,
    });

  if (logError) {
    return { error: "Unable to reveal this value. Please try again." };
  }

  return { value: plaintext, revealedAt: Date.now() };
}
