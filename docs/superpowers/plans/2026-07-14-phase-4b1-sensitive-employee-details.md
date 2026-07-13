# Phase 4B-1 Sensitive Employee Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HR-only Government & Payroll area that encrypts protected employee values before storage, masks them by default, reveals one field for 30 seconds, logs every successful reveal, and prevents duplicate government identifiers.

**Architecture:** Store ciphertext, keyed duplicate hashes, and last-four metadata in a dedicated one-row-per-employee table. Keep all encryption/decryption in Node server code, expose only masked metadata during normal page loads, and use narrowly scoped Server Actions for updates and single-field reveals. Enforce Super Admin/HR Admin authorization in both application code and Supabase RLS.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7, Node.js `crypto`, Supabase PostgreSQL/Auth/RLS, CSS, Node built-in test runner.

## Global Constraints

- Super Admin and HR Admin can view masked values, reveal values, edit values, and explicitly clear values.
- Employees have no access to the tab, routes, Server Actions, or database rows.
- SSS, PhilHealth, Pag-IBIG, TIN, account name, and account number are encrypted with AES-256-GCM before storage.
- SSS, PhilHealth, Pag-IBIG, and TIN use HMAC-SHA256 duplicate hashes and unique partial indexes.
- Bank account numbers are not unique.
- Normal profile reads never select ciphertext or hashes.
- A reveal returns exactly one field, creates an immutable access-log row, and fails closed if logging fails.
- Revealed plaintext is held only in component state for 30 seconds and is never placed in URLs, browser storage, logs, or initial server-rendered HTML.
- Blank protected inputs preserve current values; explicit clear controls remove ciphertext, hash, and last-four columns together.
- `HRIS_DATA_ENCRYPTION_KEY` and `HRIS_DATA_HASH_KEY` are independent 32-byte base64url secrets and never use the `NEXT_PUBLIC_` prefix.
- No new runtime dependencies.
- Existing Phase 4A profile, organization, role, avatar, manager, and emergency-contact behavior must remain unchanged.

---

## File map

### Create

- `supabase/migrations/202607140001_sensitive_employee_details.sql` — tables, constraints, indexes, and RLS.
- `src/lib/security/sensitive-data.ts` — key parsing, AES-256-GCM, HMAC, and normalization.
- `src/lib/security/sensitive-data.test.ts` — cryptography and normalization tests.
- `src/features/employees/sensitive/types.ts` — feature-specific types and field maps.
- `src/features/employees/sensitive/masking.ts` — masked-display generation.
- `src/features/employees/sensitive/masking.test.ts` — masking tests.
- `src/features/employees/sensitive/validation.ts` — form parsing and update semantics.
- `src/features/employees/sensitive/validation.test.ts` — validation tests.
- `src/features/employees/sensitive/auth.ts` — explicit HR-only sensitive-route authorization.
- `src/features/employees/sensitive/queries.ts` — masked-only normal queries.
- `src/features/employees/sensitive/queries.test.ts` — source guard against ciphertext/hash selection.
- `src/features/employees/sensitive/storage.ts` — pure helpers for preserve/replace/clear column groups.
- `src/features/employees/sensitive/storage.test.ts` — update-semantics tests.
- `src/features/employees/sensitive/migration.test.ts` — SQL source assertions for RLS and uniqueness.
- `src/app/(dashboard)/employees/[id]/sensitive-actions.ts` — update and reveal Server Actions.
- `src/app/(dashboard)/employees/[id]/sensitive/page.tsx` — masked read-only page.
- `src/app/(dashboard)/employees/[id]/sensitive/edit/page.tsx` — HR-only edit page.
- `src/components/employees/profile/sensitive-field-reveal.tsx` — 30-second reveal client state.
- `src/components/employees/profile/sensitive-details-form.tsx` — protected edit form.

### Modify

- `.env.example` — add server-only secret placeholders and generation commands.
- `src/components/employees/profile/profile-tabs.tsx` — authorized Government & Payroll tab.
- `src/app/(dashboard)/employees/[id]/page.tsx` — pass `canManage` to profile tabs.
- `src/app/globals.css` — responsive sensitive-page, reveal, and clear-control styles.
- `README.md` — migration, environment, route, QA, and key-backup instructions.

---

### Task 1: Add the sensitive-data database migration and SQL safety tests

**Files:**
- Create: `supabase/migrations/202607140001_sensitive_employee_details.sql`
- Create: `src/features/employees/sensitive/migration.test.ts`

**Interfaces:**
- Produces table `public.employee_sensitive_details` with one row per employee.
- Produces append-only table `public.sensitive_data_access_logs`.
- Produces unique partial indexes named `employee_sensitive_details_sss_hash_uidx`, `employee_sensitive_details_philhealth_hash_uidx`, `employee_sensitive_details_pagibig_hash_uidx`, and `employee_sensitive_details_tin_hash_uidx`.
- Uses existing `public.is_hr_admin()` from the foundation migration.

- [ ] **Step 1: Write the failing migration-source test**

Create `src/features/employees/sensitive/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140001_sensitive_employee_details.sql",
    import.meta.url,
  ),
  "utf8",
);

test("sensitive details migration creates one row per employee", () => {
  assert.match(sql, /create table if not exists public\.employee_sensitive_details/i);
  assert.match(sql, /employee_id uuid not null unique references public\.employees\(id\) on delete cascade/i);
});

test("government hashes use unique partial indexes", () => {
  for (const column of ["sss_hash", "philhealth_hash", "pagibig_hash", "tin_hash"]) {
    assert.match(sql, new RegExp(`unique index[^;]+${column}[^;]+where ${column} is not null`, "i"));
  }
});

test("employee role receives no sensitive table policy", () => {
  assert.match(sql, /alter table public\.employee_sensitive_details enable row level security/i);
  assert.match(sql, /using \(public\.is_hr_admin\(\)\)/i);
  assert.doesNotMatch(sql, /current_employee_id\(\)/i);
});

test("reveal logs are append-only", () => {
  assert.match(sql, /alter table public\.sensitive_data_access_logs enable row level security/i);
  assert.match(sql, /for insert to authenticated[\s\S]+with check \(public\.is_hr_admin\(\)\)/i);
  assert.doesNotMatch(sql, /create policy[^;]+on public\.sensitive_data_access_logs[^;]+for update/i);
  assert.doesNotMatch(sql, /create policy[^;]+on public\.sensitive_data_access_logs[^;]+for delete/i);
});
```

- [ ] **Step 2: Run the test and verify it fails because the migration does not exist**

Run:

```bash
npm test -- src/features/employees/sensitive/migration.test.ts
```

Expected: FAIL with `ENOENT` for `202607140001_sensitive_employee_details.sql`.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/202607140001_sensitive_employee_details.sql`:

```sql
-- Phase 4B-1: encrypted government and payroll details.

create table if not exists public.employee_sensitive_details (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  sss_ciphertext text,
  sss_hash text,
  sss_last4 text,
  philhealth_ciphertext text,
  philhealth_hash text,
  philhealth_last4 text,
  pagibig_ciphertext text,
  pagibig_hash text,
  pagibig_last4 text,
  tin_ciphertext text,
  tin_hash text,
  tin_last4 text,
  bank_name text,
  account_name_ciphertext text,
  account_name_last4 text,
  account_number_ciphertext text,
  account_number_last4 text,
  payroll_account_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint employee_sensitive_details_payroll_type_check
    check (
      payroll_account_type is null
      or payroll_account_type in ('savings', 'current', 'payroll', 'other')
    ),
  constraint employee_sensitive_details_sss_group_check
    check ((sss_ciphertext is null and sss_hash is null and sss_last4 is null)
      or (sss_ciphertext is not null and sss_hash is not null and sss_last4 is not null)),
  constraint employee_sensitive_details_philhealth_group_check
    check ((philhealth_ciphertext is null and philhealth_hash is null and philhealth_last4 is null)
      or (philhealth_ciphertext is not null and philhealth_hash is not null and philhealth_last4 is not null)),
  constraint employee_sensitive_details_pagibig_group_check
    check ((pagibig_ciphertext is null and pagibig_hash is null and pagibig_last4 is null)
      or (pagibig_ciphertext is not null and pagibig_hash is not null and pagibig_last4 is not null)),
  constraint employee_sensitive_details_tin_group_check
    check ((tin_ciphertext is null and tin_hash is null and tin_last4 is null)
      or (tin_ciphertext is not null and tin_hash is not null and tin_last4 is not null)),
  constraint employee_sensitive_details_account_name_group_check
    check ((account_name_ciphertext is null and account_name_last4 is null)
      or (account_name_ciphertext is not null and account_name_last4 is not null)),
  constraint employee_sensitive_details_account_number_group_check
    check ((account_number_ciphertext is null and account_number_last4 is null)
      or (account_number_ciphertext is not null and account_number_last4 is not null))
);

create unique index if not exists employee_sensitive_details_sss_hash_uidx
  on public.employee_sensitive_details(sss_hash)
  where sss_hash is not null;
create unique index if not exists employee_sensitive_details_philhealth_hash_uidx
  on public.employee_sensitive_details(philhealth_hash)
  where philhealth_hash is not null;
create unique index if not exists employee_sensitive_details_pagibig_hash_uidx
  on public.employee_sensitive_details(pagibig_hash)
  where pagibig_hash is not null;
create unique index if not exists employee_sensitive_details_tin_hash_uidx
  on public.employee_sensitive_details(tin_hash)
  where tin_hash is not null;
create index if not exists employee_sensitive_details_employee_id_idx
  on public.employee_sensitive_details(employee_id);

create table if not exists public.sensitive_data_access_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete cascade,
  field_name text not null,
  action text not null default 'reveal',
  accessed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  constraint sensitive_data_access_logs_field_check
    check (field_name in (
      'sss_number',
      'philhealth_number',
      'pagibig_number',
      'tin',
      'account_name',
      'account_number'
    )),
  constraint sensitive_data_access_logs_action_check
    check (action = 'reveal')
);

create index if not exists sensitive_data_access_logs_employee_idx
  on public.sensitive_data_access_logs(employee_id, accessed_at desc);
create index if not exists sensitive_data_access_logs_actor_idx
  on public.sensitive_data_access_logs(actor_profile_id, accessed_at desc);

create or replace function public.touch_employee_sensitive_details_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_employee_sensitive_details_updated_at
  on public.employee_sensitive_details;
create trigger touch_employee_sensitive_details_updated_at
before update on public.employee_sensitive_details
for each row execute function public.touch_employee_sensitive_details_updated_at();

alter table public.employee_sensitive_details enable row level security;
alter table public.sensitive_data_access_logs enable row level security;

drop policy if exists "HR can view sensitive employee details"
  on public.employee_sensitive_details;
create policy "HR can view sensitive employee details"
on public.employee_sensitive_details
for select to authenticated
using (public.is_hr_admin());

drop policy if exists "HR can insert sensitive employee details"
  on public.employee_sensitive_details;
create policy "HR can insert sensitive employee details"
on public.employee_sensitive_details
for insert to authenticated
with check (public.is_hr_admin());

drop policy if exists "HR can update sensitive employee details"
  on public.employee_sensitive_details;
create policy "HR can update sensitive employee details"
on public.employee_sensitive_details
for update to authenticated
using (public.is_hr_admin())
with check (public.is_hr_admin());

drop policy if exists "HR can clear sensitive employee details"
  on public.employee_sensitive_details;
create policy "HR can clear sensitive employee details"
on public.employee_sensitive_details
for delete to authenticated
using (public.is_hr_admin());

drop policy if exists "HR can view sensitive access logs"
  on public.sensitive_data_access_logs;
create policy "HR can view sensitive access logs"
on public.sensitive_data_access_logs
for select to authenticated
using (public.is_hr_admin());

drop policy if exists "HR can insert sensitive access logs"
  on public.sensitive_data_access_logs;
create policy "HR can insert sensitive access logs"
on public.sensitive_data_access_logs
for insert to authenticated
with check (public.is_hr_admin());

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the migration-source test**

Run:

```bash
npm test -- src/features/employees/sensitive/migration.test.ts
```

Expected: all migration tests PASS.

- [ ] **Step 5: Apply the migration in Supabase SQL Editor and verify schema**

Run this verification query after applying the migration:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('employee_sensitive_details', 'sensitive_data_access_logs');

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'employee_sensitive_details'
order by indexname;
```

Expected: both tables report `rowsecurity = true`, and all four government hash unique indexes are present.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202607140001_sensitive_employee_details.sql src/features/employees/sensitive/migration.test.ts
git commit -m "feat: add sensitive employee data schema"
```

---

### Task 2: Add server-side encryption, hashing, normalization, and key validation

**Files:**
- Create: `src/lib/security/sensitive-data.ts`
- Create: `src/lib/security/sensitive-data.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces `encryptSensitiveValue(value: string, key?: Buffer): string`.
- Produces `decryptSensitiveValue(payload: string, key?: Buffer): string`.
- Produces `hashSensitiveValue(value: string, key?: Buffer): string`.
- Produces `normalizeGovernmentId(value: string): string`.
- Produces `normalizeAccountName(value: string): string`.
- Produces `normalizeAccountNumber(value: string): string`.
- Produces `lastFourAlphanumeric(value: string): string`.
- Stored payload format is `v1.<iv>.<ciphertext>.<authTag>` with base64url segments.

- [ ] **Step 1: Write failing cryptography tests**

Create `src/lib/security/sensitive-data.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  hashSensitiveValue,
  lastFourAlphanumeric,
  normalizeAccountName,
  normalizeAccountNumber,
  normalizeGovernmentId,
} from "./sensitive-data.ts";

const encryptionKey = randomBytes(32);
const hashKey = randomBytes(32);

test("AES-GCM encrypts and decrypts a protected value", () => {
  const encrypted = encryptSensitiveValue("12-3456789-0", encryptionKey);
  assert.equal(decryptSensitiveValue(encrypted, encryptionKey), "12-3456789-0");
  assert.doesNotMatch(encrypted, /12-3456789-0/);
});

test("a fresh IV produces different ciphertext", () => {
  const first = encryptSensitiveValue("1234567890", encryptionKey);
  const second = encryptSensitiveValue("1234567890", encryptionKey);
  assert.notEqual(first, second);
});

test("tampered ciphertext fails authentication", () => {
  const encrypted = encryptSensitiveValue("1234567890", encryptionKey);
  const parts = encrypted.split(".");
  parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decryptSensitiveValue(parts.join("."), encryptionKey), /Unable to decrypt sensitive value/);
});

test("unknown payload versions are rejected", () => {
  assert.throws(() => decryptSensitiveValue("v2.a.b.c", encryptionKey), /Unsupported sensitive data version/);
});

test("HMAC is stable for normalized identifiers", () => {
  const formatted = hashSensitiveValue(normalizeGovernmentId("12-3456789-0"), hashKey);
  const plain = hashSensitiveValue(normalizeGovernmentId("1234567890"), hashKey);
  assert.equal(formatted, plain);
  assert.match(formatted, /^[a-f0-9]{64}$/);
});

test("normalizers preserve approved bank characters and collapse spaces", () => {
  assert.equal(normalizeGovernmentId("12-345 6789-0"), "1234567890");
  assert.equal(normalizeAccountName("  Juan   Dela Cruz "), "Juan Dela Cruz");
  assert.equal(normalizeAccountNumber("  AB-12   345  "), "AB-12 345");
  assert.equal(lastFourAlphanumeric("Juan Dela Cruz"), "Cruz");
});
```

- [ ] **Step 2: Run the tests and verify missing exports fail**

```bash
npm test -- src/lib/security/sensitive-data.test.ts
```

Expected: FAIL because `sensitive-data.ts` does not exist.

- [ ] **Step 3: Implement the security utility**

Create `src/lib/security/sensitive-data.ts`:

```ts
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function decodeEnvironmentKey(name: "HRIS_DATA_ENCRYPTION_KEY" | "HRIS_DATA_HASH_KEY") {
  const encoded = process.env[name]?.trim();
  if (!encoded) {
    throw new Error(`${name} is not configured.`);
  }

  const key = Buffer.from(encoded, "base64url");
  if (key.length !== KEY_BYTES || key.toString("base64url") !== encoded.replace(/=+$/, "")) {
    throw new Error(`${name} must be a canonical 32-byte base64url value.`);
  }
  return key;
}

function encryptionKey() {
  return decodeEnvironmentKey("HRIS_DATA_ENCRYPTION_KEY");
}

function hashKey() {
  return decodeEnvironmentKey("HRIS_DATA_HASH_KEY");
}

export function encryptSensitiveValue(value: string, key: Buffer = encryptionKey()) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), authTag.toString("base64url")].join(".");
}

export function decryptSensitiveValue(payload: string, key: Buffer = encryptionKey()) {
  const [version, ivPart, ciphertextPart, tagPart, extra] = payload.split(".");
  if (version !== VERSION) throw new Error("Unsupported sensitive data version.");
  if (!ivPart || !ciphertextPart || !tagPart || extra) throw new Error("Malformed sensitive data payload.");

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    const authTag = Buffer.from(tagPart, "base64url");
    if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
      throw new Error("Invalid payload length.");
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt sensitive value.");
  }
}

export function hashSensitiveValue(value: string, key: Buffer = hashKey()) {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function normalizeGovernmentId(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeAccountName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeAccountNumber(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function lastFourAlphanumeric(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(-4);
}
```

- [ ] **Step 4: Add environment placeholders and generation guidance**

Append to `.env.example`:

```env
# Generate each value independently:
# node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
HRIS_DATA_ENCRYPTION_KEY=
HRIS_DATA_HASH_KEY=
```

Generate two different local keys and place them only in `.env.local`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

- [ ] **Step 5: Run the security tests**

```bash
npm test -- src/lib/security/sensitive-data.test.ts
```

Expected: all security utility tests PASS.

- [ ] **Step 6: Commit**

```bash
git add .env.example src/lib/security/sensitive-data.ts src/lib/security/sensitive-data.test.ts
git commit -m "feat: add sensitive data encryption utilities"
```

---

### Task 3: Add feature types, masking, and sensitive-form validation

**Files:**
- Create: `src/features/employees/sensitive/types.ts`
- Create: `src/features/employees/sensitive/masking.ts`
- Create: `src/features/employees/sensitive/masking.test.ts`
- Create: `src/features/employees/sensitive/validation.ts`
- Create: `src/features/employees/sensitive/validation.test.ts`

**Interfaces:**
- Produces `SensitiveFieldName`, `PayrollAccountType`, `MaskedSensitiveDetails`, `SensitiveDetailsActionState`, `ProtectedFieldUpdate`, and `SensitiveDetailsInput`.
- Produces `maskSensitiveField(field, last4)` and `emptyMaskedSensitiveDetails(employeeId)`.
- Produces `validateSensitiveDetails(formData)` with preserve/replace/clear semantics.
- Validation state never returns protected plaintext.

- [ ] **Step 1: Create the shared types**

Create `src/features/employees/sensitive/types.ts`:

```ts
import type { EmployeeActionState } from "../types";

export const sensitiveFieldNames = [
  "sss_number",
  "philhealth_number",
  "pagibig_number",
  "tin",
  "account_name",
  "account_number",
] as const;

export type SensitiveFieldName = typeof sensitiveFieldNames[number];
export type PayrollAccountType = "savings" | "current" | "payroll" | "other";

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
```

- [ ] **Step 2: Write failing masking tests**

Create `src/features/employees/sensitive/masking.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { emptyMaskedSensitiveDetails, maskSensitiveField } from "./masking.ts";

test("government masks expose only the final four characters", () => {
  assert.equal(maskSensitiveField("sss_number", "7890"), "••••••7890");
  assert.equal(maskSensitiveField("philhealth_number", "9012"), "••••••••9012");
  assert.equal(maskSensitiveField("pagibig_number", "9012"), "••••••••9012");
  assert.equal(maskSensitiveField("tin", "9000"), "•••••9000");
});

test("bank protected values use a fixed safe mask", () => {
  assert.equal(maskSensitiveField("account_name", "Cruz"), "••••••••Cruz");
  assert.equal(maskSensitiveField("account_number", "1234"), "••••••••1234");
});

test("missing values display Not provided", () => {
  assert.equal(maskSensitiveField("sss_number", null), "Not provided");
  assert.equal(emptyMaskedSensitiveDetails("employee-1").sss_number.hasValue, false);
});
```

- [ ] **Step 3: Implement masking**

Create `src/features/employees/sensitive/masking.ts`:

```ts
import type {
  MaskedProtectedValue,
  MaskedSensitiveDetails,
  SensitiveFieldName,
} from "./types";

const maskLengths: Record<SensitiveFieldName, number> = {
  sss_number: 6,
  philhealth_number: 8,
  pagibig_number: 8,
  tin: 5,
  account_name: 8,
  account_number: 8,
};

export function maskSensitiveField(field: SensitiveFieldName, last4: string | null) {
  if (!last4) return "Not provided";
  return `${"•".repeat(maskLengths[field])}${last4}`;
}

export function maskedValue(field: SensitiveFieldName, last4: string | null): MaskedProtectedValue {
  return {
    hasValue: Boolean(last4),
    last4,
    masked: maskSensitiveField(field, last4),
  };
}

export function emptyMaskedSensitiveDetails(employeeId: string): MaskedSensitiveDetails {
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
```

- [ ] **Step 4: Write failing validation tests**

Create `src/features/employees/sensitive/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { validateSensitiveDetails } from "./validation.ts";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("formatted government identifiers normalize correctly", () => {
  const result = validateSensitiveDetails(form({
    sss_number: "12-3456789-0",
    philhealth_number: "12-345678901-2",
    pagibig_number: "1234-5678-9012",
    tin: "123-456-789-000",
  }));
  assert.equal(result.data?.sss_number.mode, "replace");
  assert.deepEqual(result.data?.sss_number, { mode: "replace", value: "1234567890", normalized: "1234567890" });
  assert.equal(result.data?.tin.mode, "replace");
});

test("blank protected fields preserve current values", () => {
  const result = validateSensitiveDetails(form({}));
  assert.equal(result.data?.sss_number.mode, "preserve");
  assert.equal(result.data?.account_number.mode, "preserve");
});

test("explicit clear is separate from replacement", () => {
  const clear = validateSensitiveDetails(form({ clear_sss_number: "on" }));
  assert.equal(clear.data?.sss_number.mode, "clear");

  const conflict = validateSensitiveDetails(form({
    sss_number: "12-3456789-0",
    clear_sss_number: "on",
  }));
  assert.equal(conflict.state?.fieldErrors?.sss_number, "Choose either a replacement value or Clear, not both.");
});

test("government identifiers reject letters and incorrect lengths", () => {
  const letters = validateSensitiveDetails(form({ sss_number: "12-ABC6789-0" }));
  assert.equal(letters.state?.fieldErrors?.sss_number, "SSS number may contain only digits, spaces, and hyphens.");

  const length = validateSensitiveDetails(form({ philhealth_number: "123" }));
  assert.equal(length.state?.fieldErrors?.philhealth_number, "PhilHealth number must contain exactly 12 digits.");
});

test("bank limits and payroll account type are enforced", () => {
  const result = validateSensitiveDetails(form({
    account_number: "1234/5678",
    payroll_account_type: "investment",
  }));
  assert.equal(result.state?.fieldErrors?.account_number, "Account number may contain only letters, digits, spaces, and hyphens.");
  assert.equal(result.state?.fieldErrors?.payroll_account_type, "Select a valid payroll account type.");
});

test("validation state never echoes protected plaintext", () => {
  const secret = "12-ABC6789-0";
  const result = validateSensitiveDetails(form({ sss_number: secret, bank_name: "Test Bank" }));
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(secret));
  assert.equal(result.state?.values?.bank_name, "Test Bank");
});
```

- [ ] **Step 5: Implement validation**

Create `src/features/employees/sensitive/validation.ts`:

```ts
import {
  normalizeAccountName,
  normalizeAccountNumber,
  normalizeGovernmentId,
} from "@/lib/security/sensitive-data";
import type {
  PayrollAccountType,
  ProtectedFieldUpdate,
  SensitiveDetailsActionState,
  SensitiveDetailsInput,
} from "./types";

const governmentPattern = /^[\d\s-]+$/;
const accountNumberPattern = /^[a-z0-9\s-]+$/i;
const payrollTypes: PayrollAccountType[] = ["savings", "current", "payroll", "other"];

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
    values: { bank_name: bankName, payroll_account_type: payrollAccountType },
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
  if (normalized.length > maxLength) {
    fieldErrors[name] = `${name === "account_name" ? "Account name" : "Account number"} must be ${maxLength} characters or fewer.`;
    return { mode: "preserve" };
  }
  if (name === "account_number" && !accountNumberPattern.test(normalized)) {
    fieldErrors.account_number = "Account number may contain only letters, digits, spaces, and hyphens.";
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

  if (bankName.length > 100) fieldErrors.bank_name = "Bank name must be 100 characters or fewer.";
  if (payrollAccountType && !payrollTypes.includes(payrollAccountType as PayrollAccountType)) {
    fieldErrors.payroll_account_type = "Select a valid payroll account type.";
  }

  const data: SensitiveDetailsInput = {
    sss_number: governmentUpdate(formData, "sss_number", "SSS number", 10, 10, fieldErrors),
    philhealth_number: governmentUpdate(formData, "philhealth_number", "PhilHealth number", 12, 12, fieldErrors),
    pagibig_number: governmentUpdate(formData, "pagibig_number", "Pag-IBIG number", 12, 12, fieldErrors),
    tin: governmentUpdate(formData, "tin", "TIN", 9, 12, fieldErrors),
    bank_name: bankName || null,
    account_name: protectedBankUpdate(formData, "account_name", normalizeAccountName, 150, fieldErrors),
    account_number: protectedBankUpdate(formData, "account_number", normalizeAccountNumber, 50, fieldErrors),
    payroll_account_type: payrollAccountType ? payrollAccountType as PayrollAccountType : null,
  };

  return Object.keys(fieldErrors).length
    ? { state: invalidState(fieldErrors, bankName, payrollAccountType) }
    : { data };
}
```

- [ ] **Step 6: Run masking and validation tests**

```bash
npm test -- src/features/employees/sensitive/masking.test.ts src/features/employees/sensitive/validation.test.ts
```

Expected: all masking and validation tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/employees/sensitive src/lib/security/sensitive-data.ts
git commit -m "feat: add sensitive detail validation and masking"
```

---

### Task 4: Add storage-column helpers and preserve/replace/clear tests

**Files:**
- Create: `src/features/employees/sensitive/storage.ts`
- Create: `src/features/employees/sensitive/storage.test.ts`

**Interfaces:**
- Produces `SensitiveStorageRow` matching encrypted database columns.
- Produces `protectedGroup(update, current, options)` for consistent column mutations.
- Produces `buildSensitiveStoragePayload(employeeId, existing, input, actorProfileId, encryptionKey?, hashKey?)`.

- [ ] **Step 1: Write failing storage tests**

Create `src/features/employees/sensitive/storage.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { buildSensitiveStoragePayload, type SensitiveStorageRow } from "./storage.ts";
import type { SensitiveDetailsInput } from "./types.ts";

const encryptionKey = randomBytes(32);
const hashKey = randomBytes(32);

const existing: SensitiveStorageRow = {
  employee_id: "employee-1",
  sss_ciphertext: "old-sss",
  sss_hash: "old-hash",
  sss_last4: "7890",
  philhealth_ciphertext: null,
  philhealth_hash: null,
  philhealth_last4: null,
  pagibig_ciphertext: null,
  pagibig_hash: null,
  pagibig_last4: null,
  tin_ciphertext: null,
  tin_hash: null,
  tin_last4: null,
  bank_name: "Old Bank",
  account_name_ciphertext: "old-name",
  account_name_last4: "Cruz",
  account_number_ciphertext: "old-account",
  account_number_last4: "1234",
  payroll_account_type: "payroll",
};

function baseInput(): SensitiveDetailsInput {
  return {
    sss_number: { mode: "preserve" },
    philhealth_number: { mode: "preserve" },
    pagibig_number: { mode: "preserve" },
    tin: { mode: "preserve" },
    bank_name: "New Bank",
    account_name: { mode: "preserve" },
    account_number: { mode: "preserve" },
    payroll_account_type: "savings",
  };
}

test("preserve keeps the complete existing protected group", () => {
  const payload = buildSensitiveStoragePayload("employee-1", existing, baseInput(), "actor-1", encryptionKey, hashKey);
  assert.equal(payload.sss_ciphertext, "old-sss");
  assert.equal(payload.sss_hash, "old-hash");
  assert.equal(payload.sss_last4, "7890");
});

test("clear nulls the complete protected group", () => {
  const input = baseInput();
  input.sss_number = { mode: "clear" };
  const payload = buildSensitiveStoragePayload("employee-1", existing, input, "actor-1", encryptionKey, hashKey);
  assert.equal(payload.sss_ciphertext, null);
  assert.equal(payload.sss_hash, null);
  assert.equal(payload.sss_last4, null);
});

test("replace encrypts with a fresh payload and writes hash and last four", () => {
  const input = baseInput();
  input.sss_number = { mode: "replace", value: "1234567890", normalized: "1234567890" };
  const payload = buildSensitiveStoragePayload("employee-1", existing, input, "actor-1", encryptionKey, hashKey);
  assert.match(String(payload.sss_ciphertext), /^v1\./);
  assert.notEqual(payload.sss_ciphertext, "old-sss");
  assert.match(String(payload.sss_hash), /^[a-f0-9]{64}$/);
  assert.equal(payload.sss_last4, "7890");
});

test("bank account replacement has no uniqueness hash", () => {
  const input = baseInput();
  input.account_number = { mode: "replace", value: "AB-1234", normalized: "AB-1234" };
  const payload = buildSensitiveStoragePayload("employee-1", existing, input, "actor-1", encryptionKey, hashKey);
  assert.match(String(payload.account_number_ciphertext), /^v1\./);
  assert.equal(payload.account_number_last4, "1234");
  assert.equal("account_number_hash" in payload, false);
});
```

- [ ] **Step 2: Implement storage helpers**

Create `src/features/employees/sensitive/storage.ts`:

```ts
import {
  encryptSensitiveValue,
  hashSensitiveValue,
  lastFourAlphanumeric,
} from "@/lib/security/sensitive-data";
import type { ProtectedFieldUpdate, SensitiveDetailsInput } from "./types";

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
  return key ? encryptSensitiveValue(value, key) : encryptSensitiveValue(value);
}

function hash(value: string, key?: Buffer) {
  return key ? hashSensitiveValue(value, key) : hashSensitiveValue(value);
}

function governmentGroup(
  update: ProtectedFieldUpdate,
  current: GovernmentGroup,
  encryptionKey?: Buffer,
  hashKey?: Buffer,
): GovernmentGroup {
  if (update.mode === "preserve") return current;
  if (update.mode === "clear") return { ciphertext: null, hash: null, last4: null };
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
  if (update.mode === "clear") return { ciphertext: null, last4: null };
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
  const sss = governmentGroup(input.sss_number, {
    ciphertext: existing?.sss_ciphertext ?? null,
    hash: existing?.sss_hash ?? null,
    last4: existing?.sss_last4 ?? null,
  }, encryptionKey, hashKey);
  const philhealth = governmentGroup(input.philhealth_number, {
    ciphertext: existing?.philhealth_ciphertext ?? null,
    hash: existing?.philhealth_hash ?? null,
    last4: existing?.philhealth_last4 ?? null,
  }, encryptionKey, hashKey);
  const pagibig = governmentGroup(input.pagibig_number, {
    ciphertext: existing?.pagibig_ciphertext ?? null,
    hash: existing?.pagibig_hash ?? null,
    last4: existing?.pagibig_last4 ?? null,
  }, encryptionKey, hashKey);
  const tin = governmentGroup(input.tin, {
    ciphertext: existing?.tin_ciphertext ?? null,
    hash: existing?.tin_hash ?? null,
    last4: existing?.tin_last4 ?? null,
  }, encryptionKey, hashKey);
  const accountName = protectedBankGroup(input.account_name, {
    ciphertext: existing?.account_name_ciphertext ?? null,
    last4: existing?.account_name_last4 ?? null,
  }, encryptionKey);
  const accountNumber = protectedBankGroup(input.account_number, {
    ciphertext: existing?.account_number_ciphertext ?? null,
    last4: existing?.account_number_last4 ?? null,
  }, encryptionKey);

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
```

- [ ] **Step 3: Run the storage tests**

```bash
npm test -- src/features/employees/sensitive/storage.test.ts
```

Expected: all storage semantics tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/employees/sensitive/storage.ts src/features/employees/sensitive/storage.test.ts
git commit -m "feat: add sensitive storage mutation helpers"
```

---

### Task 5: Add explicit authorization and masked-only query layer

**Files:**
- Create: `src/features/employees/sensitive/auth.ts`
- Create: `src/features/employees/sensitive/queries.ts`
- Create: `src/features/employees/sensitive/queries.test.ts`

**Interfaces:**
- Produces `requireSensitiveEmployeeManager(employeeId)` returning `{ supabase, user, role }`.
- Produces `getMaskedSensitiveDetails(employeeId): Promise<MaskedSensitiveDetails>`.
- Normal query selects only `employee_id`, last-four columns, `bank_name`, and `payroll_account_type`.

- [ ] **Step 1: Implement the explicit authorization wrapper**

Create `src/features/employees/sensitive/auth.ts`:

```ts
import { requireEmployeeProfileManager } from "@/features/employees/auth";

export async function requireSensitiveEmployeeManager(employeeId: string) {
  return requireEmployeeProfileManager(employeeId);
}
```

The separate name makes security-sensitive routes and actions visibly auditable while reusing the existing tested HR-role and employee-existence behavior.

- [ ] **Step 2: Write the query source guard before the query implementation**

Create `src/features/employees/sensitive/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("normal sensitive queries never select ciphertext or hashes", () => {
  assert.doesNotMatch(source, /_ciphertext/);
  assert.doesNotMatch(source, /_hash/);
  assert.match(source, /sss_last4/);
  assert.match(source, /account_number_last4/);
});
```

- [ ] **Step 3: Implement the masked query**

Create `src/features/employees/sensitive/queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import {
  emptyMaskedSensitiveDetails,
  maskedValue,
} from "./masking";
import type { MaskedSensitiveDetails, PayrollAccountType } from "./types";

export async function getMaskedSensitiveDetails(employeeId: string): Promise<MaskedSensitiveDetails> {
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
    console.error(`[Supabase masked sensitive details] code=${error.code ?? "none"} message=${error.message ?? "none"}`);
    throw new Error("Unable to load sensitive employee details.");
  }
  if (!data) return emptyMaskedSensitiveDetails(employeeId);

  return {
    employee_id: data.employee_id,
    sss_number: maskedValue("sss_number", data.sss_last4),
    philhealth_number: maskedValue("philhealth_number", data.philhealth_last4),
    pagibig_number: maskedValue("pagibig_number", data.pagibig_last4),
    tin: maskedValue("tin", data.tin_last4),
    bank_name: data.bank_name,
    account_name: maskedValue("account_name", data.account_name_last4),
    account_number: maskedValue("account_number", data.account_number_last4),
    payroll_account_type: data.payroll_account_type as PayrollAccountType | null,
  };
}
```

- [ ] **Step 4: Run the query source guard**

```bash
npm test -- src/features/employees/sensitive/queries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/employees/sensitive/auth.ts src/features/employees/sensitive/queries.ts src/features/employees/sensitive/queries.test.ts
git commit -m "feat: add masked sensitive detail queries"
```

---

### Task 6: Implement update and single-field reveal Server Actions

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/sensitive-actions.ts`
- Create: `src/features/employees/sensitive/actions.test.ts`

**Interfaces:**
- Produces `updateSensitiveDetails(employeeId, state, formData): Promise<SensitiveDetailsActionState>`.
- Produces `revealSensitiveValue(employeeId, fieldName): Promise<RevealSensitiveValueResult>`.
- Reveal uses `await headers()` to read optional `x-forwarded-for` and `user-agent` metadata.
- Database error code `23505` is mapped to the named government field whenever the index name is present.

- [ ] **Step 1: Write the failing source-level security test**

Create `src/features/employees/sensitive/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/sensitive-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("reveal logging succeeds before plaintext is returned", () => {
  assert.match(source, /if \(logError\) return \{ error:/);
  assert.match(source, /return \{ value: plaintext, revealedAt: Date\.now\(\) \}/);
  assert.ok(source.indexOf("if (logError)") < source.indexOf("value: plaintext"));
});

test("sensitive actions do not log plaintext or use persistent browser storage", () => {
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*plaintext/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("update action handles duplicate government identifiers", () => {
  assert.match(source, /23505/);
  assert.match(source, /employee_sensitive_details_sss_hash_uidx/);
  assert.match(source, /employee_sensitive_details_tin_hash_uidx/);
});
```

- [ ] **Step 2: Run the test and verify the action file is missing**

```bash
npm test -- src/features/employees/sensitive/actions.test.ts
```

Expected: FAIL with `ENOENT` for `sensitive-actions.ts`.

- [ ] **Step 3: Implement the complete Server Action module**

Create `src/app/(dashboard)/employees/[id]/sensitive-actions.ts`:

```ts
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

const encryptedColumns: Record<SensitiveFieldName, keyof SensitiveStorageRow> = {
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

function duplicateState(field: GovernmentField): SensitiveDetailsActionState {
  return {
    error: "Please correct the highlighted fields.",
    fieldErrors: { [field]: duplicateConfig[field].message },
  };
}

function duplicateStateFromDatabase(error: DatabaseError) {
  if (error.code !== "23505") return null;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  for (const field of Object.keys(duplicateConfig) as GovernmentField[]) {
    if (text.includes(duplicateConfig[field].indexName)) return duplicateState(field);
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

    if (error) return { error: "Unable to save sensitive employee details." };
    if (data) return duplicateState(field);
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
    return validation.state ?? { error: "Invalid sensitive employee details." };
  }

  const { data: existing, error: readError } = await supabase
    .from("employee_sensitive_details")
    .select(
      "employee_id,sss_ciphertext,sss_hash,sss_last4,philhealth_ciphertext,philhealth_hash,philhealth_last4,pagibig_ciphertext,pagibig_hash,pagibig_last4,tin_ciphertext,tin_hash,tin_last4,bank_name,account_name_ciphertext,account_name_last4,account_number_ciphertext,account_number_last4,payroll_account_type",
    )
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (readError) return { error: "Unable to save sensitive employee details." };

  try {
    const duplicate = await preflightDuplicateCheck(
      supabase,
      employeeId,
      validation.data,
    );
    if (duplicate) return duplicate;

    const payload = buildSensitiveStoragePayload(
      employeeId,
      existing as SensitiveStorageRow | null,
      validation.data,
      user.id,
    );

    const { error } = await supabase
      .from("employee_sensitive_details")
      .upsert(payload, { onConflict: "employee_id" });

    if (error) {
      return duplicateStateFromDatabase(error)
        ?? { error: "Unable to save sensitive employee details." };
    }
  } catch {
    return { error: "Unable to save sensitive employee details." };
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

  const row = data as Record<string, string | null>;
  const ciphertext = row[String(column)] ?? null;
  if (!ciphertext) return { error: "This value has not been provided." };

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
    ?.trim() || null;
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

  if (logError) return { error: "Unable to reveal this value. Please try again." };
  return { value: plaintext, revealedAt: Date.now() };
}
```

- [ ] **Step 4: Run action security tests and TypeScript**

```bash
npm test -- src/features/employees/sensitive/actions.test.ts
npx tsc --noEmit
```

Expected: the action source tests PASS and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/sensitive-actions.ts' src/features/employees/sensitive/actions.test.ts
git commit -m "feat: add protected sensitive detail actions"
```

---

### Task 7: Build the masked sensitive page and 30-second reveal component

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/sensitive/page.tsx`
- Create: `src/components/employees/profile/sensitive-field-reveal.tsx`

**Interfaces:**
- Page authorizes before querying employee or sensitive metadata.
- Component consumes `revealAction: () => Promise<RevealSensitiveValueResult>`.
- Component clears plaintext after 30,000 ms, on Hide now, and on unmount.

- [ ] **Step 1: Create the reveal component**

Create `src/components/employees/profile/sensitive-field-reveal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RevealSensitiveValueResult } from "@/features/employees/sensitive/types";

export function SensitiveFieldReveal({
  label,
  masked,
  hasValue,
  revealAction,
}: {
  label: string;
  masked: string;
  hasValue: boolean;
  revealAction: () => Promise<RevealSensitiveValueResult>;
}) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaintext(null);
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealAction();
      if ("error" in result) {
        hide();
        setError(result.error);
        return;
      }
      hide();
      setPlaintext(result.value);
      timerRef.current = setTimeout(() => {
        setPlaintext(null);
        timerRef.current = null;
      }, 30_000);
    });
  }

  return (
    <div className="sensitive-row">
      <div>
        <dt>{label}</dt>
        <dd aria-live="polite">{plaintext ?? masked}</dd>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      {hasValue && (
        plaintext
          ? <button type="button" className="btn" onClick={hide}>Hide now</button>
          : <button type="button" className="btn" onClick={reveal} disabled={isPending}>{isPending ? "Revealing…" : "Reveal"}</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the sensitive page**

Create `src/app/(dashboard)/employees/[id]/sensitive/page.tsx`:

```tsx
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
        action={<div className="header-actions"><Link className="btn" href={`/employees/${id}`}>Back to profile</Link><Link className="btn primary" href={`/employees/${id}/sensitive/edit`}>Edit details</Link></div>}
      />
      {query.success === "sensitive_updated" && <p className="form-success">Government and payroll details updated.</p>}
      <ProfileTabs employeeId={id} active="sensitive" canManage />

      <section className="card profile-section-card">
        <div className="profile-section-heading"><div><h2>Government IDs</h2><p className="muted">Values are masked by default. Every successful reveal is recorded.</p></div></div>
        <dl className="sensitive-list">
          {(["sss_number", "philhealth_number", "pagibig_number", "tin"] as const).map((field) => (
            <SensitiveFieldReveal
              key={field}
              label={{ sss_number: "SSS number", philhealth_number: "PhilHealth number", pagibig_number: "Pag-IBIG number", tin: "TIN" }[field]}
              masked={details[field].masked}
              hasValue={details[field].hasValue}
              revealAction={revealSensitiveValue.bind(null, id, field)}
            />
          ))}
        </dl>
      </section>

      <section className="card profile-section-card">
        <div className="profile-section-heading"><div><h2>Payroll and bank details</h2><p className="muted">Only HR Admin and Super Admin can access these details.</p></div></div>
        <dl className="sensitive-list">
          <div className="sensitive-row"><div><dt>Bank name</dt><dd>{details.bank_name ?? "Not provided"}</dd></div></div>
          <SensitiveFieldReveal label="Account name" masked={details.account_name.masked} hasValue={details.account_name.hasValue} revealAction={revealSensitiveValue.bind(null, id, "account_name")} />
          <SensitiveFieldReveal label="Account number" masked={details.account_number.masked} hasValue={details.account_number.hasValue} revealAction={revealSensitiveValue.bind(null, id, "account_number")} />
          <div className="sensitive-row"><div><dt>Payroll account type</dt><dd>{details.payroll_account_type ? payrollLabels[details.payroll_account_type] : "Not provided"}</dd></div></div>
        </dl>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify the page never receives ciphertext**

Run:

```bash
grep -R "_ciphertext\|_hash" 'src/app/(dashboard)/employees/[id]/sensitive/page.tsx' src/components/employees/profile/sensitive-field-reveal.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/sensitive/page.tsx' src/components/employees/profile/sensitive-field-reveal.tsx
git commit -m "feat: add masked sensitive detail page"
```

---

### Task 8: Build the sensitive edit form and explicit clear controls

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/sensitive/edit/page.tsx`
- Create: `src/components/employees/profile/sensitive-details-form.tsx`
- Create: `src/features/employees/sensitive/form-security.test.ts`

**Interfaces:**
- Edit page provides only masked current values and non-sensitive defaults.
- Protected inputs are empty on every initial render and after validation errors.
- Clear checkboxes use names `clear_<field>`.
- Form action is `updateSensitiveDetails.bind(null, employeeId)`.

- [ ] **Step 1: Write the failing form-security source test**

Create `src/features/employees/sensitive/form-security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL(
    "../../../components/employees/profile/sensitive-details-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("protected inputs are not prefilled from existing details", () => {
  assert.doesNotMatch(
    source,
    /defaultValue=\{details\.(sss_number|philhealth_number|pagibig_number|tin|account_name|account_number)/,
  );
  assert.match(source, /Leave blank to keep unchanged/);
});

test("clear controls are explicit and protected fields disable autocomplete", () => {
  assert.match(source, /name=\{`clear_\$\{name\}`\}/);
  for (const field of [
    "sss_number",
    "philhealth_number",
    "pagibig_number",
    "tin",
    "account_name",
    "account_number",
  ]) {
    assert.match(source, new RegExp(`name="${field}"`));
  }
  assert.match(source, /autoComplete="off"/);
});
```

- [ ] **Step 2: Create the complete form component**

Create `src/components/employees/profile/sensitive-details-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  MaskedSensitiveDetails,
  SensitiveDetailsActionState,
  SensitiveFieldName,
} from "@/features/employees/sensitive/types";

const initialState: SensitiveDetailsActionState = {};

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function ProtectedField({
  name,
  label,
  masked,
  hasValue,
  error,
  inputMode,
  placeholder,
}: {
  name: SensitiveFieldName;
  label: string;
  masked: string;
  hasValue: boolean;
  error?: string;
  inputMode?: "numeric" | "text";
  placeholder?: string;
}) {
  const helpId = `${name}-help`;
  const errorId = `${name}-error`;

  return (
    <div className="sensitive-form-field">
      <label htmlFor={name}><span>{label}</span></label>
      <input
        id={name}
        className="field"
        name={name}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
      />
      <small id={helpId} className="muted">
        Current value: {masked}. Leave blank to keep unchanged.
      </small>
      {hasValue && (
        <label className="clear-sensitive-control">
          <input type="checkbox" name={`clear_${name}`} />
          <span>I confirm that the current {label.toLowerCase()} should be cleared.</span>
        </label>
      )}
      {error && <span id={errorId} className="field-error">{error}</span>}
    </div>
  );
}

export function SensitiveDetailsForm({
  employeeId,
  details,
  action,
}: {
  employeeId: string;
  details: MaskedSensitiveDetails;
  action: (
    state: SensitiveDetailsActionState,
    formData: FormData,
  ) => Promise<SensitiveDetailsActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card employee-form">
      {state.error && <p className="form-error" role="alert">{state.error}</p>}

      <section className="form-section">
        <div>
          <h2>Government IDs</h2>
          <p className="muted">Protected values are encrypted before database storage.</p>
        </div>
        <div className="form-grid">
          <ProtectedField
            name="sss_number"
            label="SSS number"
            masked={details.sss_number.masked}
            hasValue={details.sss_number.hasValue}
            error={errors.sss_number}
            inputMode="numeric"
            placeholder="12-3456789-0"
          />
          <ProtectedField
            name="philhealth_number"
            label="PhilHealth number"
            masked={details.philhealth_number.masked}
            hasValue={details.philhealth_number.hasValue}
            error={errors.philhealth_number}
            inputMode="numeric"
            placeholder="12-345678901-2"
          />
          <ProtectedField
            name="pagibig_number"
            label="Pag-IBIG number"
            masked={details.pagibig_number.masked}
            hasValue={details.pagibig_number.hasValue}
            error={errors.pagibig_number}
            inputMode="numeric"
            placeholder="1234-5678-9012"
          />
          <ProtectedField
            name="tin"
            label="TIN"
            masked={details.tin.masked}
            hasValue={details.tin.hasValue}
            error={errors.tin}
            inputMode="numeric"
            placeholder="123-456-789-000"
          />
        </div>
      </section>

      <section className="form-section">
        <div>
          <h2>Payroll and bank details</h2>
          <p className="muted">Clearing removes the stored value permanently. Entering a replacement and selecting Clear is not allowed.</p>
        </div>
        <div className="form-grid">
          <label>
            <span>Bank name</span>
            <input
              className="field"
              name="bank_name"
              defaultValue={state.values?.bank_name ?? details.bank_name ?? ""}
              aria-invalid={Boolean(errors.bank_name)}
            />
            <ErrorText message={errors.bank_name} />
          </label>

          <ProtectedField
            name="account_name"
            label="Account name"
            masked={details.account_name.masked}
            hasValue={details.account_name.hasValue}
            error={errors.account_name}
            inputMode="text"
            placeholder="Juan Dela Cruz"
          />

          <ProtectedField
            name="account_number"
            label="Account number"
            masked={details.account_number.masked}
            hasValue={details.account_number.hasValue}
            error={errors.account_number}
            inputMode="text"
            placeholder="1234-5678-9012"
          />

          <label>
            <span>Payroll account type</span>
            <select
              className="field"
              name="payroll_account_type"
              defaultValue={state.values?.payroll_account_type ?? details.payroll_account_type ?? ""}
              aria-invalid={Boolean(errors.payroll_account_type)}
            >
              <option value="">Not provided</option>
              <option value="savings">Savings</option>
              <option value="current">Current</option>
              <option value="payroll">Payroll</option>
              <option value="other">Other</option>
            </select>
            <ErrorText message={errors.payroll_account_type} />
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link className="btn" href={`/employees/${employeeId}/sensitive`}>Cancel</Link>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save government & payroll details"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the edit route**

Create `src/app/(dashboard)/employees/[id]/sensitive/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SensitiveDetailsForm } from "@/components/employees/profile/sensitive-details-form";
import { requireSensitiveEmployeeManager } from "@/features/employees/sensitive/auth";
import { getMaskedSensitiveDetails } from "@/features/employees/sensitive/queries";
import { getEmployee } from "@/features/employees/queries";
import { updateSensitiveDetails } from "../../sensitive-actions";

export default async function EditSensitiveEmployeeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSensitiveEmployeeManager(id);
  const [employee, details] = await Promise.all([
    getEmployee(id),
    getMaskedSensitiveDetails(id),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title="Edit government & payroll details"
        description={`Update protected HR data for ${employee.first_name} ${employee.last_name}.`}
      />
      <SensitiveDetailsForm
        employeeId={id}
        details={details}
        action={updateSensitiveDetails.bind(null, id)}
      />
    </>
  );
}
```

- [ ] **Step 4: Run form security tests and TypeScript**

```bash
npm test -- src/features/employees/sensitive/form-security.test.ts
npx tsc --noEmit
```

Expected: the form security tests PASS and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/sensitive/edit/page.tsx' src/components/employees/profile/sensitive-details-form.tsx src/features/employees/sensitive/form-security.test.ts
git commit -m "feat: add sensitive detail editing"
```

---

### Task 9: Integrate authorized profile navigation and responsive styling

**Files:**
- Modify: `src/components/employees/profile/profile-tabs.tsx`
- Modify: `src/app/(dashboard)/employees/[id]/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- `ProfileTabs` accepts `canManage?: boolean`.
- Sensitive tab points to `/employees/[id]/sensitive` and appears only when `canManage` is true.
- Existing four tab query URLs remain unchanged.

- [ ] **Step 1: Update profile tabs**

Replace the static tab mapping with:

```tsx
import Link from "next/link";

const tabs = [
  { id: "overview", label: "Overview", sensitive: false },
  { id: "personal", label: "Personal", sensitive: false },
  { id: "employment", label: "Employment", sensitive: false },
  { id: "emergency", label: "Emergency Contacts", sensitive: false },
  { id: "sensitive", label: "Government & Payroll", sensitive: true },
] as const;

export type ProfileTab = typeof tabs[number]["id"];

export function ProfileTabs({
  employeeId,
  active,
  canManage = false,
}: {
  employeeId: string;
  active: ProfileTab;
  canManage?: boolean;
}) {
  return (
    <nav className="profile-tabs" aria-label="Employee profile sections">
      {tabs
        .filter((tab) => !tab.sensitive || canManage)
        .map((tab) => (
          <Link
            key={tab.id}
            href={tab.sensitive ? `/employees/${employeeId}/sensitive` : `/employees/${employeeId}?tab=${tab.id}`}
            className={active === tab.id ? "active" : ""}
            aria-current={active === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
    </nav>
  );
}
```

- [ ] **Step 2: Pass authorization from the existing profile page**

Change:

```tsx
<ProfileTabs employeeId={employee.id} active={activeTab} />
```

to:

```tsx
<ProfileTabs employeeId={employee.id} active={activeTab} canManage={access.canManage} />
```

Keep the existing profile page `validTabs` set limited to `overview`, `personal`, `employment`, and `emergency`; the sensitive tab has its own route.

- [ ] **Step 3: Add responsive styles**

Append focused styles to `src/app/globals.css`:

```css
.sensitive-list {
  display: grid;
  gap: 0;
  margin: 0;
}

.sensitive-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.sensitive-row:last-child {
  border-bottom: 0;
}

.sensitive-row dt {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.sensitive-row dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.clear-sensitive-control {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  font-weight: 500;
}

@media (max-width: 640px) {
  .sensitive-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .sensitive-row .btn {
    width: 100%;
    min-height: 44px;
  }
}
```

Use the existing `var(--border)` token exactly as shown; no global color-token changes are needed.

- [ ] **Step 4: Test role visibility manually**

- Super Admin: Government & Payroll tab visible and route opens.
- HR Admin: Government & Payroll tab visible and route opens.
- Employee: tab absent; direct `/employees/[id]/sensitive` and `/edit` redirect to unauthorized state.

- [ ] **Step 5: Commit**

```bash
git add src/components/employees/profile/profile-tabs.tsx 'src/app/(dashboard)/employees/[id]/page.tsx' src/app/globals.css
git commit -m "feat: integrate sensitive profile navigation"
```

---

### Task 10: Document deployment, verify security invariants, and run production checks

**Files:**
- Modify: `README.md`
- Modify: `.env.example` only if generation guidance is incomplete.

**Interfaces:**
- Documents migration `202607140001_sensitive_employee_details.sql`.
- Documents both server-only Vercel variables and independent key generation.
- Documents routes `/employees/[id]/sensitive` and `/employees/[id]/sensitive/edit`.

- [ ] **Step 1: Update README implementation and setup sections**

Add Phase 4B-1 to implemented modules and migration order. Add this environment section:

```env
HRIS_DATA_ENCRYPTION_KEY=<independent 32-byte base64url secret>
HRIS_DATA_HASH_KEY=<different independent 32-byte base64url secret>
```

Document:

- Generate each secret independently with Node `randomBytes(32)`.
- Store local values only in `.env.local`.
- Add both values to Vercel Production, Preview, and Development environments as appropriate.
- Back up both values in a secure password manager before entering production data.
- Losing the encryption key makes stored ciphertext unrecoverable.
- Changing the hash key breaks duplicate matching until existing rows are rehashed.
- Never expose either key through `NEXT_PUBLIC_` variables.

- [ ] **Step 2: Run the complete automated suite**

```bash
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 3: Run TypeScript and production build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both commands exit with code 0; build lists the two new dynamic routes.

- [ ] **Step 4: Scan for plaintext hazards and secrets**

```bash
grep -R "NEXT_PUBLIC_HRIS_DATA\|HRIS_DATA_ENCRYPTION_KEY=.*[A-Za-z0-9_-]\{20,\}\|HRIS_DATA_HASH_KEY=.*[A-Za-z0-9_-]\{20,\}" -n . --exclude='.env.local' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
grep -R "localStorage\|sessionStorage" -n src/components/employees/profile/sensitive-field-reveal.tsx src/app/'(dashboard)'/employees/'[id]'/sensitive-actions.ts
```

Expected: no committed real key values and no persistent browser storage usage.

- [ ] **Step 5: Perform database-content verification with a disposable test employee**

Enter test values through the UI, then run in Supabase SQL Editor:

```sql
select
  employee_id,
  left(sss_ciphertext, 3) as sss_version,
  length(sss_hash) as sss_hash_length,
  sss_last4,
  left(account_number_ciphertext, 3) as account_version,
  account_number_last4
from public.employee_sensitive_details
where employee_id = 'REPLACE_WITH_TEST_EMPLOYEE_UUID';
```

Expected:

- Ciphertext begins with `v1.`.
- Government hash length is 64.
- Only last-four metadata is readable.
- No plaintext identifier or bank account appears in any column.

- [ ] **Step 6: Verify reveal logging and fail-closed behavior**

Reveal one field once, then run:

```sql
select actor_profile_id, employee_id, field_name, action, accessed_at,
       ip_address is not null as has_ip,
       user_agent is not null as has_user_agent
from public.sensitive_data_access_logs
where employee_id = 'REPLACE_WITH_TEST_EMPLOYEE_UUID'
order by accessed_at desc
limit 5;
```

Expected: one new `reveal` row with metadata only. Confirm the table contains no plaintext/ciphertext/hash columns.

Temporarily deny insert permission through a development-only policy change or transaction, click Reveal, and confirm the UI returns the generic reveal error without showing plaintext. Restore the policy immediately afterward.

- [ ] **Step 7: Complete role and behavior QA**

```text
SUPER ADMIN
[ ] Can view masked values
[ ] Can reveal each populated protected field
[ ] Reveal hides after 30 seconds
[ ] Hide now clears immediately
[ ] Can replace values
[ ] Blank protected fields preserve values
[ ] Explicit clear removes values
[ ] Duplicate government ID receives field-level error

HR ADMIN
[ ] Same Phase 4B-1 capabilities as Super Admin

EMPLOYEE
[ ] Tab is hidden
[ ] Read route is blocked
[ ] Edit route is blocked
[ ] Direct reveal action is blocked
[ ] Direct update action is blocked

DATABASE
[ ] Ciphertext never equals submitted plaintext
[ ] Government hashes are unique
[ ] Duplicate bank account numbers are allowed
[ ] Reveal log is append-only
[ ] Employee deletion cascades sensitive details and logs
```

- [ ] **Step 8: Commit the documentation and final verified state**

```bash
git add README.md .env.example
git commit -m "docs: document sensitive employee data setup"
```

- [ ] **Step 9: Push and verify Vercel**

```bash
git push origin main
```

After deployment, test one HR Admin reveal and one Employee direct-route denial in production. Confirm the Vercel deployment has both server-only keys and that the reveal created one metadata-only access-log row.

---

## Final acceptance gate

Phase 4B-1 is complete only when all of the following are true:

- `npm test`, `npx tsc --noEmit`, and `npm run build` pass.
- Supabase stores only ciphertext, HMACs, last-four metadata, and approved non-sensitive bank fields.
- Government duplicate indexes reject duplicate SSS, PhilHealth, Pag-IBIG, and TIN values.
- Normal page loads do not select or decrypt protected values.
- Every successful reveal has exactly one corresponding immutable log row.
- A failed log insert never returns plaintext.
- Revealed values disappear after 30 seconds, on Hide now, on refresh, and on navigation.
- Employees cannot access the tab, routes, actions, or tables.
- Blank protected fields preserve values; explicit clear controls null the entire related storage group.
- Vercel has the two independent server-only keys and the keys are backed up securely.
