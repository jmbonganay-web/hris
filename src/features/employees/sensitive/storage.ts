import {
  encryptSensitiveValue,
  hashSensitiveValue,
  lastFourAlphanumeric,
} from "../../../lib/security/sensitive-data.ts";
import type {
  ProtectedFieldUpdate,
  SensitiveDetailsInput,
} from "./types.ts";

export type SensitiveStorageRow = {
  employee_id: string;
  sss_ciphertext: string | null;
  sss_hash: string | null;
  sss_last4: string | null;
  philhealth_ciphertext: string | null;
  philhealth_hash: string | null;
  philhealth_last4: string | null;
  pagibig_ciphertext: string | null;
  pagibig_hash: string | null;
  pagibig_last4: string | null;
  tin_ciphertext: string | null;
  tin_hash: string | null;
  tin_last4: string | null;
  bank_name: string | null;
  account_name_ciphertext: string | null;
  account_name_last4: string | null;
  account_number_ciphertext: string | null;
  account_number_last4: string | null;
  payroll_account_type: string | null;
};

export type SensitiveStoragePayload = SensitiveStorageRow & {
  updated_by: string;
  updated_at: string;
};

type GovernmentGroup = {
  ciphertext: string | null;
  hash: string | null;
  last4: string | null;
};

type ProtectedBankGroup = {
  ciphertext: string | null;
  last4: string | null;
};

function encrypt(value: string, key?: Buffer) {
  return key
    ? encryptSensitiveValue(value, key)
    : encryptSensitiveValue(value);
}

function hash(value: string, key?: Buffer) {
  return key
    ? hashSensitiveValue(value, key)
    : hashSensitiveValue(value);
}

function governmentGroup(
  update: ProtectedFieldUpdate,
  current: GovernmentGroup,
  encryptionKey?: Buffer,
  hashKey?: Buffer,
): GovernmentGroup {
  if (update.mode === "preserve") return current;
  if (update.mode === "clear") {
    return { ciphertext: null, hash: null, last4: null };
  }

  return {
    ciphertext: encrypt(update.value, encryptionKey),
    hash: hash(update.normalized, hashKey),
    last4: lastFourAlphanumeric(update.normalized),
  };
}

function protectedBankGroup(
  update: ProtectedFieldUpdate,
  current: ProtectedBankGroup,
  encryptionKey?: Buffer,
): ProtectedBankGroup {
  if (update.mode === "preserve") return current;
  if (update.mode === "clear") {
    return { ciphertext: null, last4: null };
  }

  return {
    ciphertext: encrypt(update.value, encryptionKey),
    last4: lastFourAlphanumeric(update.normalized),
  };
}

export function buildSensitiveStoragePayload(
  employeeId: string,
  existing: SensitiveStorageRow | null,
  input: SensitiveDetailsInput,
  actorProfileId: string,
  encryptionKey?: Buffer,
  hashKey?: Buffer,
): SensitiveStoragePayload {
  const sss = governmentGroup(
    input.sss_number,
    {
      ciphertext: existing?.sss_ciphertext ?? null,
      hash: existing?.sss_hash ?? null,
      last4: existing?.sss_last4 ?? null,
    },
    encryptionKey,
    hashKey,
  );
  const philhealth = governmentGroup(
    input.philhealth_number,
    {
      ciphertext: existing?.philhealth_ciphertext ?? null,
      hash: existing?.philhealth_hash ?? null,
      last4: existing?.philhealth_last4 ?? null,
    },
    encryptionKey,
    hashKey,
  );
  const pagibig = governmentGroup(
    input.pagibig_number,
    {
      ciphertext: existing?.pagibig_ciphertext ?? null,
      hash: existing?.pagibig_hash ?? null,
      last4: existing?.pagibig_last4 ?? null,
    },
    encryptionKey,
    hashKey,
  );
  const tin = governmentGroup(
    input.tin,
    {
      ciphertext: existing?.tin_ciphertext ?? null,
      hash: existing?.tin_hash ?? null,
      last4: existing?.tin_last4 ?? null,
    },
    encryptionKey,
    hashKey,
  );
  const accountName = protectedBankGroup(
    input.account_name,
    {
      ciphertext: existing?.account_name_ciphertext ?? null,
      last4: existing?.account_name_last4 ?? null,
    },
    encryptionKey,
  );
  const accountNumber = protectedBankGroup(
    input.account_number,
    {
      ciphertext: existing?.account_number_ciphertext ?? null,
      last4: existing?.account_number_last4 ?? null,
    },
    encryptionKey,
  );

  return {
    employee_id: employeeId,
    sss_ciphertext: sss.ciphertext,
    sss_hash: sss.hash,
    sss_last4: sss.last4,
    philhealth_ciphertext: philhealth.ciphertext,
    philhealth_hash: philhealth.hash,
    philhealth_last4: philhealth.last4,
    pagibig_ciphertext: pagibig.ciphertext,
    pagibig_hash: pagibig.hash,
    pagibig_last4: pagibig.last4,
    tin_ciphertext: tin.ciphertext,
    tin_hash: tin.hash,
    tin_last4: tin.last4,
    bank_name: input.bank_name,
    account_name_ciphertext: accountName.ciphertext,
    account_name_last4: accountName.last4,
    account_number_ciphertext: accountNumber.ciphertext,
    account_number_last4: accountNumber.last4,
    payroll_account_type: input.payroll_account_type,
    updated_by: actorProfileId,
    updated_at: new Date().toISOString(),
  };
}
