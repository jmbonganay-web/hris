# Phase 4B-2 HR Notes and Audit History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted HR notes and an immutable employee Activity timeline with role-aware note ownership, soft deletion and restoration, trigger-backed audit coverage, safe before/after values, and atomic sensitive-reveal logging.

**Architecture:** Store encrypted note bodies in `employee_hr_notes` and append-only activity in `employee_audit_logs`. PostgreSQL triggers own row-based audit events, while a single protected RPC atomically records sensitive reveal compliance and activity entries. Next.js Server Actions enforce role and ownership rules, and server-rendered pages expose decrypted note bodies only to HR Admin and Super Admin users.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.1.1, TypeScript 5.7, Node.js `crypto`, Supabase PostgreSQL/Auth/RLS, CSS, Node built-in test runner.

## Global Constraints

- Super Admin can view, create, edit, soft-delete, and restore any HR note.
- HR Admin can view all active notes, create notes, and edit or soft-delete only notes they created.
- HR Admin cannot view the deleted-note archive or restore deleted notes.
- Employees have no access to HR notes, deleted notes, activity routes, Server Actions, or database rows.
- HR note content is encrypted with the existing `HRIS_DATA_ENCRYPTION_KEY`.
- Plaintext note content never enters Supabase columns, audit JSON, application logs, URLs, browser storage, or analytics.
- HR note categories are exactly `general`, `performance`, `disciplinary`, `medical`, and `payroll`.
- Note bodies are required, whitespace-trimmed, and limited to 5,000 characters.
- Notes use soft deletion only; no application path permanently deletes a note.
- Audit entries are immutable and cannot be updated or deleted by any user role.
- PostgreSQL triggers own row-based events; application code owns only `sensitive_field.revealed`.
- One application business action creates one matching activity entry.
- Before/after values are limited to approved employment fields.
- Personal, emergency-contact, sensitive, and HR-note events store changed field names only.
- Sensitive reveal compliance and activity records must be inserted atomically before plaintext is returned.
- No new runtime dependencies.
- Existing Phase 4B-1 behavior and its 54 passing tests must remain intact.

---

## Baseline verified before planning

From the uploaded `hris-repository` project:

```text
npm test
54 passed
0 failed
```

```text
npm run build
Compiled successfully
TypeScript passed
Production routes generated successfully
```

---

## File map

### Create

- `supabase/migrations/202607140002_hr_notes_audit_history.sql`
- `src/features/employees/hr-notes/types.ts`
- `src/features/employees/hr-notes/validation.ts`
- `src/features/employees/hr-notes/validation.test.ts`
- `src/features/employees/hr-notes/auth.ts`
- `src/features/employees/hr-notes/queries.ts`
- `src/features/employees/hr-notes/queries.test.ts`
- `src/features/employees/hr-notes/migration.test.ts`
- `src/features/employees/hr-notes/actions.test.ts`
- `src/features/employees/audit/types.ts`
- `src/features/employees/audit/query.ts`
- `src/features/employees/audit/query.test.ts`
- `src/features/employees/audit/presentation.ts`
- `src/features/employees/audit/presentation.test.ts`
- `src/app/(dashboard)/employees/[id]/hr-note-actions.ts`
- `src/app/(dashboard)/employees/[id]/hr-notes/page.tsx`
- `src/app/(dashboard)/employees/[id]/hr-notes/new/page.tsx`
- `src/app/(dashboard)/employees/[id]/hr-notes/[noteId]/edit/page.tsx`
- `src/app/(dashboard)/employees/[id]/hr-notes/deleted/page.tsx`
- `src/app/(dashboard)/employees/[id]/activity/page.tsx`
- `src/components/employees/profile/hr-note-form.tsx`
- `src/components/employees/profile/hr-note-card.tsx`
- `src/components/employees/profile/delete-hr-note-button.tsx`
- `src/components/employees/profile/restore-hr-note-button.tsx`
- `src/components/employees/profile/activity-timeline.tsx`

### Modify

- `src/features/employees/auth.ts`
- `src/components/employees/profile/profile-tabs.tsx`
- `src/app/(dashboard)/employees/[id]/sensitive-actions.ts`
- `src/app/(dashboard)/employees/[id]/profile-actions.ts`
- `src/app/(dashboard)/employees/actions.ts`
- `src/app/globals.css`
- `README.md`
- `docs/superpowers/specs/2026-07-14-phase-4b2-hr-notes-audit-history-design.md`

---

## Shared interfaces

The following interfaces are fixed for all tasks.

```ts
export const hrNoteCategories = [
  "general",
  "performance",
  "disciplinary",
  "medical",
  "payroll",
] as const;

export type HrNoteCategory = typeof hrNoteCategories[number];

export type HrNoteActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    category: string;
  };
};

export type HrNoteRecord = {
  id: string;
  employee_id: string;
  category: HrNoteCategory;
  content: string | null;
  contentUnavailable: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  author: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
  updater: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
  deleter: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export const activityFilters = [
  "all",
  "profile",
  "employment",
  "emergency",
  "sensitive",
  "hr_notes",
  "system",
] as const;

export type ActivityFilter = typeof activityFilters[number];

export type EmployeeAuditEntry = {
  id: string;
  employee_id: string;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changed_fields: string[];
  before_values: Record<string, unknown>;
  after_values: Record<string, unknown>;
  metadata: Record<string, unknown>;
  source: "application" | "database_trigger";
  created_at: string;
  actor: {
    id: string;
    display_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
};

export type PaginatedActivity = {
  entries: EmployeeAuditEntry[];
  page: number;
  pageSize: 20;
  total: number;
  totalPages: number;
};
```

---

### Task 1: Add the Phase 4B-2 schema, RLS, immutable logs, and SQL source tests

**Files:**
- Create: `supabase/migrations/202607140002_hr_notes_audit_history.sql`
- Create: `src/features/employees/hr-notes/migration.test.ts`

**Interfaces:**
- Produces `public.employee_hr_notes`.
- Produces `public.employee_audit_logs`.
- Produces safe helper `public.write_employee_audit(...)`.
- Produces protected RPC `public.log_sensitive_data_reveal(...)`.
- Uses existing `public.is_hr_admin()` and `public.is_super_admin()`.

- [ ] **Step 1: Write the failing migration source tests**

Create `src/features/employees/hr-notes/migration.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140002_hr_notes_audit_history.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration creates encrypted HR notes and immutable employee activity", () => {
  assert.match(sql, /create table if not exists public\.employee_hr_notes/i);
  assert.match(sql, /content_ciphertext text not null/i);
  assert.match(sql, /create table if not exists public\.employee_audit_logs/i);
  assert.match(sql, /alter table public\.employee_hr_notes enable row level security/i);
  assert.match(sql, /alter table public\.employee_audit_logs enable row level security/i);
});

test("HR note categories and ownership policies are constrained", () => {
  for (const category of [
    "general",
    "performance",
    "disciplinary",
    "medical",
    "payroll",
  ]) {
    assert.match(sql, new RegExp(`'${category}'`, "i"));
  }

  assert.match(sql, /created_by = auth\.uid\(\)/i);
  assert.match(sql, /public\.is_super_admin\(\)/i);
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.employee_hr_notes[^;]+for delete/i,
  );
});

test("audit rows are append-only and employee users receive no policy", () => {
  assert.match(
    sql,
    /create policy "HR can view employee audit logs"[\s\S]+using \(public\.is_hr_admin\(\)\)/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.employee_audit_logs[^;]+for update/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy[^;]+on public\.employee_audit_logs[^;]+for delete/i,
  );
  assert.doesNotMatch(sql, /current_employee_id\(\)/i);
});

test("sensitive reveal logging is atomic", () => {
  assert.match(
    sql,
    /create or replace function public\.log_sensitive_data_reveal/i,
  );
  assert.match(sql, /insert into public\.sensitive_data_access_logs/i);
  assert.match(sql, /insert into public\.employee_audit_logs/i);
  assert.match(sql, /sensitive_field\.revealed/i);
});

test("trigger functions use fixed search paths and are not publicly executable", () => {
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function public\./i);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- src/features/employees/hr-notes/migration.test.ts
```

Expected: FAIL with `ENOENT` for `202607140002_hr_notes_audit_history.sql`.

- [ ] **Step 3: Create the two tables and indexes**

The migration must include these exact table shapes:

```sql
create table if not exists public.employee_hr_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null,
  content_ciphertext text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint employee_hr_notes_category_check
    check (category in (
      'general',
      'performance',
      'disciplinary',
      'medical',
      'payroll'
    ))
);

create index if not exists employee_hr_notes_employee_active_idx
  on public.employee_hr_notes(employee_id, deleted_at, created_at desc);
create index if not exists employee_hr_notes_employee_category_idx
  on public.employee_hr_notes(employee_id, category, created_at desc);
create index if not exists employee_hr_notes_created_by_idx
  on public.employee_hr_notes(created_by);

create table if not exists public.employee_audit_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields jsonb not null default '[]'::jsonb,
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  source text not null,
  created_at timestamptz not null default now(),
  constraint employee_audit_logs_source_check
    check (source in ('application', 'database_trigger')),
  constraint employee_audit_logs_changed_fields_array_check
    check (jsonb_typeof(changed_fields) = 'array'),
  constraint employee_audit_logs_before_object_check
    check (jsonb_typeof(before_values) = 'object'),
  constraint employee_audit_logs_after_object_check
    check (jsonb_typeof(after_values) = 'object'),
  constraint employee_audit_logs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists employee_audit_logs_employee_created_idx
  on public.employee_audit_logs(employee_id, created_at desc, id desc);
create index if not exists employee_audit_logs_employee_entity_idx
  on public.employee_audit_logs(employee_id, entity_type, created_at desc);
create index if not exists employee_audit_logs_action_idx
  on public.employee_audit_logs(action, created_at desc);
create index if not exists employee_audit_logs_actor_idx
  on public.employee_audit_logs(actor_profile_id, created_at desc);
```

- [ ] **Step 4: Add RLS policies**

Use these policies:

```sql
alter table public.employee_hr_notes enable row level security;
alter table public.employee_audit_logs enable row level security;

drop policy if exists "HR can view permitted HR notes"
  on public.employee_hr_notes;
create policy "HR can view permitted HR notes"
on public.employee_hr_notes
for select to authenticated
using (
  public.is_hr_admin()
  and (deleted_at is null or public.is_super_admin())
);

drop policy if exists "HR can create HR notes"
  on public.employee_hr_notes;
create policy "HR can create HR notes"
on public.employee_hr_notes
for insert to authenticated
with check (
  public.is_hr_admin()
  and created_by = auth.uid()
  and deleted_at is null
  and deleted_by is null
);

drop policy if exists "HR can update permitted HR notes"
  on public.employee_hr_notes;
create policy "HR can update permitted HR notes"
on public.employee_hr_notes
for update to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'hr_admin'
    and created_by = auth.uid()
    and deleted_at is null
  )
)
with check (
  public.is_super_admin()
  or (
    public.current_user_role() = 'hr_admin'
    and created_by = auth.uid()
  )
);

drop policy if exists "HR can view employee audit logs"
  on public.employee_audit_logs;
create policy "HR can view employee audit logs"
on public.employee_audit_logs
for select to authenticated
using (public.is_hr_admin());

-- No INSERT, UPDATE, or DELETE policy is created for employee_audit_logs.
-- No DELETE policy is created for employee_hr_notes.
```

- [ ] **Step 5: Add the internal audit writer**

Create a fixed-search-path security-definer function that accepts only structured metadata:

```sql
create or replace function public.write_employee_audit(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_changed_fields jsonb default '[]'::jsonb,
  p_before_values jsonb default '{}'::jsonb,
  p_after_values jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_source text default 'database_trigger',
  p_actor_profile_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_changed_fields) <> 'array'
    or jsonb_typeof(p_before_values) <> 'object'
    or jsonb_typeof(p_after_values) <> 'object'
    or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Invalid audit payload';
  end if;

  if p_source not in ('application', 'database_trigger') then
    raise exception 'Invalid audit source';
  end if;

  insert into public.employee_audit_logs (
    employee_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    before_values,
    after_values,
    metadata,
    source
  )
  values (
    p_employee_id,
    p_actor_profile_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_changed_fields,
    p_before_values,
    p_after_values,
    p_metadata,
    p_source
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_employee_audit(
  uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, text, uuid
) from public, anon, authenticated;
```

- [ ] **Step 6: Add atomic sensitive reveal logging**

Replace direct access-log insertion with an RPC contract:

```sql
create or replace function public.log_sensitive_data_reveal(
  p_employee_id uuid,
  p_field_name text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_field_name not in (
    'sss_number',
    'philhealth_number',
    'pagibig_number',
    'tin',
    'account_name',
    'account_number'
  ) then
    raise exception 'Invalid sensitive field';
  end if;

  if not exists (
    select 1 from public.employees where id = p_employee_id
  ) then
    raise exception 'Employee not found';
  end if;

  insert into public.sensitive_data_access_logs (
    actor_profile_id,
    employee_id,
    field_name,
    action,
    ip_address,
    user_agent
  )
  values (
    v_actor,
    p_employee_id,
    p_field_name,
    'reveal',
    left(p_ip_address, 100),
    left(p_user_agent, 500)
  );

  perform public.write_employee_audit(
    p_employee_id,
    'sensitive_field.revealed',
    'sensitive_data',
    null,
    jsonb_build_array(p_field_name),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('field_name', p_field_name),
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.log_sensitive_data_reveal(
  uuid, text, text, text
) from public, anon;
grant execute on function public.log_sensitive_data_reveal(
  uuid, text, text, text
) to authenticated;

drop policy if exists "HR can insert sensitive access logs"
  on public.sensitive_data_access_logs;
```

- [ ] **Step 7: Run the migration tests**

Run:

```bash
npm test -- src/features/employees/hr-notes/migration.test.ts
```

Expected: all migration tests PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/202607140002_hr_notes_audit_history.sql \
  src/features/employees/hr-notes/migration.test.ts
git commit -m "feat: add HR notes and audit schema"
```

---

### Task 2: Add HR note types, validation, and encryption tests

**Files:**
- Create: `src/features/employees/hr-notes/types.ts`
- Create: `src/features/employees/hr-notes/validation.ts`
- Create: `src/features/employees/hr-notes/validation.test.ts`

**Interfaces:**
- Produces `HrNoteCategory`, `HrNoteActionState`, `HrNoteRecord`.
- Produces `validateHrNote(formData: FormData)`.
- Reuses `encryptSensitiveValue()` and `decryptSensitiveValue()` from `src/lib/security/sensitive-data.ts`.

- [ ] **Step 1: Write validation tests**

Create `src/features/employees/hr-notes/validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { validateHrNote } from "./validation.ts";

function form(category: string, content: string) {
  const data = new FormData();
  data.set("category", category);
  data.set("content", content);
  return data;
}

test("all approved HR note categories are accepted", () => {
  for (const category of [
    "general",
    "performance",
    "disciplinary",
    "medical",
    "payroll",
  ]) {
    const result = validateHrNote(form(category, "Approved content"));
    assert.equal(result.data?.category, category);
  }
});

test("unsupported categories are rejected", () => {
  const result = validateHrNote(form("compensation", "Content"));
  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.category, "Choose a valid category.");
});

test("empty and whitespace-only notes are rejected", () => {
  for (const content of ["", "   \n\t "]) {
    const result = validateHrNote(form("general", content));
    assert.equal(result.data, undefined);
    assert.equal(result.state?.fieldErrors?.content, "Note content is required.");
  }
});

test("note content is trimmed and limited to 5000 characters", () => {
  const valid = validateHrNote(form("general", "  useful note  "));
  assert.equal(valid.data?.content, "useful note");

  const invalid = validateHrNote(form("general", "x".repeat(5001)));
  assert.equal(invalid.data, undefined);
  assert.equal(
    invalid.state?.fieldErrors?.content,
    "Note content must be 5,000 characters or fewer.",
  );
});

test("validation state never echoes note content", () => {
  const sentinel = "DO_NOT_LOG_NOTE_TEXT";
  const result = validateHrNote(form("", sentinel));
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(sentinel));
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
npm test -- src/features/employees/hr-notes/validation.test.ts
```

Expected: FAIL because `validation.ts` does not exist.

- [ ] **Step 3: Implement types and validation**

Create `src/features/employees/hr-notes/types.ts` using the Shared interfaces section.

Create `src/features/employees/hr-notes/validation.ts`:

```ts
import {
  hrNoteCategories,
  type HrNoteActionState,
  type HrNoteCategory,
} from "./types.ts";

export function validateHrNote(formData: FormData): {
  data?: { category: HrNoteCategory; content: string };
  state?: HrNoteActionState;
} {
  const category = String(formData.get("category") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (!hrNoteCategories.includes(category as HrNoteCategory)) {
    fieldErrors.category = "Choose a valid category.";
  }

  if (!content) {
    fieldErrors.content = "Note content is required.";
  } else if (content.length > 5000) {
    fieldErrors.content = "Note content must be 5,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: { category },
      },
    };
  }

  return {
    data: {
      category: category as HrNoteCategory,
      content,
    },
  };
}
```

- [ ] **Step 4: Add an encryption regression test**

Append to the test file:

```ts
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from "../../../lib/security/sensitive-data.ts";

test("HR note content uses authenticated encryption with a fresh IV", () => {
  const key = Buffer.alloc(32, 9);
  const first = encryptSensitiveValue("Confidential note", key);
  const second = encryptSensitiveValue("Confidential note", key);

  assert.notEqual(first, second);
  assert.equal(decryptSensitiveValue(first, key), "Confidential note");
  assert.doesNotMatch(first, /Confidential note/);
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/features/employees/hr-notes/validation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/employees/hr-notes
git commit -m "feat: add HR note validation"
```

---

### Task 3: Add HR note authorization and server-only queries

**Files:**
- Modify: `src/features/employees/auth.ts`
- Create: `src/features/employees/hr-notes/auth.ts`
- Create: `src/features/employees/hr-notes/queries.ts`
- Create: `src/features/employees/hr-notes/queries.test.ts`

**Interfaces:**
- Produces `requireSuperAdmin()`.
- Produces `requireHrNoteManager(employeeId: string)`.
- Produces `requireDeletedHrNoteManager(employeeId: string)`.
- Produces `getActiveHrNotes(employeeId, category?)`.
- Produces `getDeletedHrNotes(employeeId)`.
- Produces `getHrNoteForEdit(employeeId, noteId)`.

- [ ] **Step 1: Add `requireSuperAdmin()`**

Append to `src/features/employees/auth.ts`:

```ts
export async function requireSuperAdmin() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (data?.role ?? "employee") as AppRole;
  if (role !== "super_admin") {
    redirect("/employees?error=unauthorized");
  }

  return { supabase, user, role };
}
```

- [ ] **Step 2: Create HR note authorization wrappers**

Create `src/features/employees/hr-notes/auth.ts`:

```ts
import {
  requireEmployeeProfileManager,
  requireSuperAdmin,
} from "@/features/employees/auth";

export async function requireHrNoteManager(employeeId: string) {
  return requireEmployeeProfileManager(employeeId);
}

export async function requireDeletedHrNoteManager(employeeId: string) {
  const context = await requireSuperAdmin();
  const { data: employee } = await context.supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) {
    return { ...context, employeeExists: false as const };
  }

  return { ...context, employeeExists: true as const };
}
```

- [ ] **Step 3: Write source-security tests before the query**

Create `src/features/employees/hr-notes/queries.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("./queries.ts", import.meta.url),
  "utf8",
);

test("HR note queries are server-only and exclude deleted notes by default", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /\.is\("deleted_at", null\)/);
});

test("queries decrypt note content without logging it", () => {
  assert.match(source, /decryptSensitiveValue/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*content_ciphertext/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*content/);
});

test("profile relations use explicit foreign-key hints", () => {
  assert.match(source, /author:profiles!employee_hr_notes_created_by_fkey/);
  assert.match(source, /updater:profiles!employee_hr_notes_updated_by_fkey/);
  assert.match(source, /deleter:profiles!employee_hr_notes_deleted_by_fkey/);
});
```

- [ ] **Step 4: Implement the queries**

Create `src/features/employees/hr-notes/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { decryptSensitiveValue } from "@/lib/security/sensitive-data";
import type {
  HrNoteCategory,
  HrNoteRecord,
} from "./types";

const noteSelect = `
  id,
  employee_id,
  category,
  content_ciphertext,
  created_by,
  created_at,
  updated_by,
  updated_at,
  deleted_by,
  deleted_at,
  author:profiles!employee_hr_notes_created_by_fkey(
    id,display_name,first_name,last_name
  ),
  updater:profiles!employee_hr_notes_updated_by_fkey(
    id,display_name,first_name,last_name
  ),
  deleter:profiles!employee_hr_notes_deleted_by_fkey(
    id,display_name,first_name,last_name
  )
`;

function mapNote(row: Record<string, unknown>): HrNoteRecord {
  let content: string | null = null;
  let contentUnavailable = false;

  try {
    content = decryptSensitiveValue(String(row.content_ciphertext));
  } catch {
    contentUnavailable = true;
  }

  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    category: row.category as HrNoteCategory,
    content,
    contentUnavailable,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_by: row.updated_by ? String(row.updated_by) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    author: (row.author ?? null) as HrNoteRecord["author"],
    updater: (row.updater ?? null) as HrNoteRecord["updater"],
    deleter: (row.deleter ?? null) as HrNoteRecord["deleter"],
  };
}

export async function getActiveHrNotes(
  employeeId: string,
  category?: HrNoteCategory,
) {
  const supabase = await createClient();
  let query = supabase
    .from("employee_hr_notes")
    .select(noteSelect)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw new Error("Unable to load HR notes.");

  return (data ?? []).map((row) =>
    mapNote(row as unknown as Record<string, unknown>),
  );
}

export async function getDeletedHrNotes(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hr_notes")
    .select(noteSelect)
    .eq("employee_id", employeeId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw new Error("Unable to load deleted HR notes.");

  return (data ?? []).map((row) =>
    mapNote(row as unknown as Record<string, unknown>),
  );
}

export async function getHrNoteForEdit(
  employeeId: string,
  noteId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hr_notes")
    .select(noteSelect)
    .eq("employee_id", employeeId)
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("Unable to load HR note.");
  return data
    ? mapNote(data as unknown as Record<string, unknown>)
    : null;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- src/features/employees/hr-notes/queries.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/employees/auth.ts \
  src/features/employees/hr-notes/auth.ts \
  src/features/employees/hr-notes/queries.ts \
  src/features/employees/hr-notes/queries.test.ts
git commit -m "feat: add protected HR note queries"
```

---

### Task 4: Add HR note Server Actions with ownership enforcement

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/hr-note-actions.ts`
- Create: `src/features/employees/hr-notes/actions.test.ts`

**Interfaces:**
- Produces:
  - `createHrNote(employeeId, state, formData)`
  - `updateHrNote(employeeId, noteId, state, formData)`
  - `deleteHrNote(employeeId, noteId)`
  - `restoreHrNote(employeeId, noteId)`

- [ ] **Step 1: Write action source tests**

Create `src/features/employees/hr-notes/actions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/hr-note-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("note content is encrypted before insert or update", () => {
  assert.match(source, /encryptSensitiveValue/);
  assert.match(source, /content_ciphertext/);
  assert.doesNotMatch(source, /\.insert\(\{[^}]*content:/s);
  assert.doesNotMatch(source, /\.update\(\{[^}]*content:/s);
});

test("HR Admin ownership is enforced for update and delete", () => {
  assert.match(source, /created_by/);
  assert.match(source, /role === "super_admin"/);
  assert.match(source, /note\.created_by !== user\.id/);
});

test("deletion is soft and restoration is Super Admin-only", () => {
  assert.match(source, /deleted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /deleted_by: user\.id/);
  assert.match(source, /deleted_at: null/);
  assert.match(source, /requireDeletedHrNoteManager/);
  assert.doesNotMatch(source, /\.delete\(\)/);
});

test("actions never log note plaintext", () => {
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*content/);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm test -- src/features/employees/hr-notes/actions.test.ts
```

Expected: FAIL because the action file does not exist.

- [ ] **Step 3: Implement the actions**

The action file must:

- Use `requireHrNoteManager()` for create, update, and delete.
- Use `requireDeletedHrNoteManager()` for restore.
- Read note ownership before update/delete.
- Reject deleted notes for update/delete.
- Encrypt note content before database writes.
- Let triggers create audit rows; do not insert audit rows in Server Actions.
- Revalidate:
  - `/employees/${employeeId}/hr-notes`
  - `/employees/${employeeId}/hr-notes/deleted`
  - `/employees/${employeeId}/activity`

Core implementation:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encryptSensitiveValue } from "@/lib/security/sensitive-data";
import {
  requireDeletedHrNoteManager,
  requireHrNoteManager,
} from "@/features/employees/hr-notes/auth";
import type { HrNoteActionState } from "@/features/employees/hr-notes/types";
import { validateHrNote } from "@/features/employees/hr-notes/validation";

function revalidateHrNotes(employeeId: string) {
  revalidatePath(`/employees/${employeeId}/hr-notes`);
  revalidatePath(`/employees/${employeeId}/hr-notes/deleted`);
  revalidatePath(`/employees/${employeeId}/activity`);
}

export async function createHrNote(
  employeeId: string,
  _state: HrNoteActionState,
  formData: FormData,
): Promise<HrNoteActionState> {
  const { supabase, user } = await requireHrNoteManager(employeeId);
  const validation = validateHrNote(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid HR note." };
  }

  let ciphertext: string;
  try {
    ciphertext = encryptSensitiveValue(validation.data.content);
  } catch {
    return {
      error: "Unable to save the HR note.",
      values: { category: validation.data.category },
    };
  }

  const { error } = await supabase.from("employee_hr_notes").insert({
    employee_id: employeeId,
    category: validation.data.category,
    content_ciphertext: ciphertext,
    created_by: user.id,
  });

  if (error) {
    return {
      error: "Unable to save the HR note.",
      values: { category: validation.data.category },
    };
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_created`);
}

export async function updateHrNote(
  employeeId: string,
  noteId: string,
  _state: HrNoteActionState,
  formData: FormData,
): Promise<HrNoteActionState> {
  const { supabase, user, role } = await requireHrNoteManager(employeeId);
  const validation = validateHrNote(formData);
  if (!validation.data) {
    return validation.state ?? { error: "Invalid HR note." };
  }

  const { data: note, error: noteError } = await supabase
    .from("employee_hr_notes")
    .select("id,created_by,deleted_at")
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (noteError || !note || note.deleted_at) {
    return { error: "HR note not found." };
  }

  if (role !== "super_admin" && note.created_by !== user.id) {
    return { error: "You do not have permission to edit this note." };
  }

  let ciphertext: string;
  try {
    ciphertext = encryptSensitiveValue(validation.data.content);
  } catch {
    return {
      error: "Unable to update the HR note.",
      values: { category: validation.data.category },
    };
  }

  const { error } = await supabase
    .from("employee_hr_notes")
    .update({
      category: validation.data.category,
      content_ciphertext: ciphertext,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (error) {
    return {
      error: "Unable to update the HR note.",
      values: { category: validation.data.category },
    };
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_updated`);
}

export async function deleteHrNote(
  employeeId: string,
  noteId: string,
) {
  const { supabase, user, role } = await requireHrNoteManager(employeeId);
  const { data: note, error: noteError } = await supabase
    .from("employee_hr_notes")
    .select("id,created_by,deleted_at")
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (noteError || !note || note.deleted_at) {
    redirect(`/employees/${employeeId}/hr-notes?error=note_not_found`);
  }

  if (role !== "super_admin" && note.created_by !== user.id) {
    redirect(`/employees/${employeeId}/hr-notes?error=unauthorized`);
  }

  const { error } = await supabase
    .from("employee_hr_notes")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (error) {
    redirect(`/employees/${employeeId}/hr-notes?error=note_delete_failed`);
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_deleted`);
}

export async function restoreHrNote(
  employeeId: string,
  noteId: string,
) {
  const { supabase, user, employeeExists } =
    await requireDeletedHrNoteManager(employeeId);

  if (!employeeExists) {
    redirect("/employees?error=not_found");
  }

  const { error } = await supabase
    .from("employee_hr_notes")
    .update({
      deleted_at: null,
      deleted_by: null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("employee_id", employeeId)
    .not("deleted_at", "is", null);

  if (error) {
    redirect(
      `/employees/${employeeId}/hr-notes/deleted?error=note_restore_failed`,
    );
  }

  revalidateHrNotes(employeeId);
  redirect(`/employees/${employeeId}/hr-notes?success=note_restored`);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/features/employees/hr-notes/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/hr-note-actions.ts' \
  src/features/employees/hr-notes/actions.test.ts
git commit -m "feat: add HR note actions"
```

---

### Task 5: Add HR Notes pages, forms, cards, archive, and responsive styles

**Files:**
- Create all HR note route and component files from the File map.
- Modify: `src/components/employees/profile/profile-tabs.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Authorized tabs: `hr_notes` and `activity`.
- Active note filters use `category` query parameter.
- Deleted archive is Super Admin-only.
- Components receive pre-authorized action bindings.

- [ ] **Step 1: Extend profile tabs**

Update the tab model:

```ts
const tabs = [
  { id: "overview", label: "Overview", restricted: false, href: "query" },
  { id: "personal", label: "Personal", restricted: false, href: "query" },
  { id: "employment", label: "Employment", restricted: false, href: "query" },
  { id: "emergency", label: "Emergency Contacts", restricted: false, href: "query" },
  { id: "sensitive", label: "Government & Payroll", restricted: true, href: "route" },
  { id: "hr_notes", label: "HR Notes", restricted: true, href: "route" },
  { id: "activity", label: "Activity", restricted: true, href: "route" },
] as const;
```

Route mapping:

```ts
function tabHref(employeeId: string, tab: typeof tabs[number]) {
  if (tab.id === "sensitive") return `/employees/${employeeId}/sensitive`;
  if (tab.id === "hr_notes") return `/employees/${employeeId}/hr-notes`;
  if (tab.id === "activity") return `/employees/${employeeId}/activity`;
  return `/employees/${employeeId}?tab=${tab.id}`;
}
```

Filter with:

```ts
.filter((tab) => !tab.restricted || canManage)
```

- [ ] **Step 2: Create `HrNoteForm`**

The form must:

- Use `useActionState`.
- Keep only category in retry state.
- Never put submitted note content into action state.
- Set `maxLength={5000}`.
- Display character guidance.
- Prefill decrypted content only on the authorized edit page.

Required signature:

```ts
export function HrNoteForm({
  employeeId,
  action,
  initialCategory = "general",
  initialContent = "",
  submitLabel,
}: {
  employeeId: string;
  action: (
    state: HrNoteActionState,
    formData: FormData,
  ) => Promise<HrNoteActionState>;
  initialCategory?: HrNoteCategory;
  initialContent?: string;
  submitLabel: string;
}) {}
```

- [ ] **Step 3: Create note action buttons**

`DeleteHrNoteButton` confirmation text must be:

```text
Delete this HR note?

The note will be removed from the active list. Only a Super Admin can restore it.
```

`RestoreHrNoteButton` must require explicit confirmation before submitting.

Both components use `<form action={action}>` and must not receive note content.

- [ ] **Step 4: Create note cards**

`HrNoteCard` must display:

- Category badge
- Author display name
- Created timestamp
- Updated timestamp only when `updated_at` is present
- Plaintext note body only from server-authorized query data
- Safe unavailable state when `contentUnavailable`
- Edit/delete controls only when `canEdit`/`canDelete`

- [ ] **Step 5: Create active notes page**

Route:

```text
/employees/[id]/hr-notes
```

Behavior:

- Call `requireHrNoteManager(id)` before data reads.
- Load employee and filtered active notes.
- Validate `category` against `hrNoteCategories`.
- Show newest first.
- Show filters and empty state.
- Show `New HR note`.
- Show `View deleted notes` only for Super Admin.
- Pass `active="hr_notes"` and `canManage` to `ProfileTabs`.

- [ ] **Step 6: Create new/edit pages**

New route:

```text
/employees/[id]/hr-notes/new
```

Edit route:

```text
/employees/[id]/hr-notes/[noteId]/edit
```

Edit page must:

- Load the note through `getHrNoteForEdit`.
- Return not found for missing/deleted note.
- Check ownership for HR Admin before rendering decrypted content.
- Allow Super Admin to edit any active note.

- [ ] **Step 7: Create deleted archive**

Route:

```text
/employees/[id]/hr-notes/deleted
```

Behavior:

- Call `requireDeletedHrNoteManager`.
- Load only deleted notes.
- Show deleted-by and deleted-at metadata.
- Bind `restoreHrNote`.
- Never show a permanent delete action.

- [ ] **Step 8: Add styles**

Add focused classes:

```css
.hr-note-toolbar,
.hr-note-actions,
.activity-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hr-note-list,
.activity-list {
  display: grid;
  gap: 14px;
}

.hr-note-card {
  min-width: 0;
}

.hr-note-meta {
  display: flex;
  gap: 8px 14px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 13px;
}

.hr-note-body {
  margin-top: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
}

.hr-note-unavailable {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 12px;
}

.hr-note-category {
  display: inline-flex;
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 800;
  text-transform: capitalize;
}

.hr-note-form textarea {
  min-height: 220px;
  resize: vertical;
}
```

- [ ] **Step 9: Run tests and build**

```bash
npm test
npm run build
```

Expected: existing tests pass and the new routes compile.

- [ ] **Step 10: Commit**

```bash
git add src/components/employees/profile \
  'src/app/(dashboard)/employees/[id]/hr-notes' \
  src/components/employees/profile/profile-tabs.tsx \
  src/app/globals.css
git commit -m "feat: add encrypted HR notes UI"
```

---

### Task 6: Add row-based audit triggers with safe data whitelists

**Files:**
- Modify: `supabase/migrations/202607140002_hr_notes_audit_history.sql`
- Create: `src/features/employees/audit/query.test.ts` initially as SQL source safety tests, then expand in Task 7.

**Interfaces:**
- Trigger ownership:
  - `employees`
  - `employee_personal_details`
  - `employee_emergency_contacts`
  - `employee_sensitive_details`
  - `employee_hr_notes`
- Source is always `database_trigger`.
- Direct SQL without JWT actor stores `actor_profile_id = null`.

- [ ] **Step 1: Add SQL source assertions**

Create the first part of `src/features/employees/audit/query.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140002_hr_notes_audit_history.sql",
    import.meta.url,
  ),
  "utf8",
);

test("all approved row-based tables have audit triggers", () => {
  for (const table of [
    "employees",
    "employee_personal_details",
    "employee_emergency_contacts",
    "employee_sensitive_details",
    "employee_hr_notes",
  ]) {
    assert.match(sql, new RegExp(`create trigger[^;]+on public\\.${table}`, "i"));
  }
});

test("sensitive audit payloads use safe business field names only", () => {
  for (const safeName of [
    "sss_number",
    "philhealth_number",
    "pagibig_number",
    "tin",
    "account_name",
    "account_number",
  ]) {
    assert.match(sql, new RegExp(`'${safeName}'`, "i"));
  }

  assert.doesNotMatch(sql, /jsonb_build_object\([^)]*sss_ciphertext/i);
  assert.doesNotMatch(sql, /jsonb_build_object\([^)]*account_number_ciphertext/i);
});

test("HR note audit never copies note ciphertext", () => {
  assert.doesNotMatch(
    sql,
    /write_employee_audit\([^;]+content_ciphertext/is,
  );
});

test("approved employment fields are whitelisted", () => {
  for (const field of [
    "department_id",
    "job_title_id",
    "manager_id",
    "employment_type",
    "employment_status",
    "hire_date",
    "probation_end_date",
    "regularization_date",
    "work_location",
    "work_schedule",
  ]) {
    assert.match(sql, new RegExp(`'${field}'`, "i"));
  }
});
```

- [ ] **Step 2: Implement `employee_hr_notes` trigger**

Rules:

```text
INSERT                                      -> hr_note.created
deleted_at null -> non-null                 -> hr_note.deleted
deleted_at non-null -> null                 -> hr_note.restored
category or content_ciphertext changed      -> hr_note.updated
```

Changed fields are only `category` and/or `content`.

- [ ] **Step 3: Implement `employee_personal_details` trigger**

Use `AFTER UPDATE` only.

Compare:

```text
middle_name
preferred_name
date_of_birth
gender
civil_status
nationality
personal_email
phone
address_line_1
address_line_2
city
state_province
postal_code
country
```

Insert one `personal_details.updated` row when at least one value changed.

Store changed field names only. `before_values` and `after_values` remain `{}`.

- [ ] **Step 4: Implement emergency-contact trigger and suppress internal primary updates**

Audit events:

```text
INSERT -> emergency_contact.created
UPDATE -> emergency_contact.updated
DELETE -> emergency_contact.deleted
```

Store changed field names only.

Replace `public.set_single_primary_emergency_contact()` in the new migration so its internal update is wrapped with:

```sql
perform set_config('app.audit_suppressed', 'true', true);

update public.employee_emergency_contacts
set is_primary = false, updated_at = now()
where employee_id = new.employee_id
  and id <> new.id
  and is_primary = true;

perform set_config('app.audit_suppressed', 'false', true);
```

The emergency audit trigger begins with:

```sql
if current_setting('app.audit_suppressed', true) = 'true' then
  return coalesce(new, old);
end if;
```

This prevents a single primary-contact change from creating a second internal audit entry.

- [ ] **Step 5: Implement sensitive-details trigger**

Map protected storage groups to safe names:

```text
sss_ciphertext            -> sss_number
philhealth_ciphertext     -> philhealth_number
pagibig_ciphertext        -> pagibig_number
tin_ciphertext            -> tin
account_name_ciphertext   -> account_name
account_number_ciphertext -> account_number
bank_name                 -> bank_name
payroll_account_type      -> payroll_account_type
```

Never inspect or serialize hashes or last-four columns.

Classification:

- `sensitive_details.cleared` only when every changed protected field moved from non-null to null and no changed field received a replacement.
- Otherwise use `sensitive_details.updated`.

Store changed field names only.

- [ ] **Step 6: Implement employees trigger with priority classification**

The application already separates manager, avatar, archive, and employment mutations. Classify one event per update using this priority:

1. `employee.archived` or `employee.restored`
2. `manager.changed`
3. `avatar.uploaded`, `avatar.replaced`, or `avatar.removed`
4. `employment_details.updated`

For employment changes, store safe before/after values only for:

```text
department_id
job_title_id
employment_type
employment_status
hire_date
probation_end_date
regularization_date
work_location
work_schedule
```

For `manager.changed`, store a snapshot object:

```json
{
  "manager_id": {
    "id": "uuid-or-null",
    "label": "Employee Name or Not assigned"
  }
}
```

For department and job title, store equivalent `{ id, label }` objects.

Ignore updates that affect only:

```text
personal_email
phone
updated_at
profile_id
employee_number
work_email
first_name
last_name
```

unless one of the classified fields also changed.

- [ ] **Step 7: Revoke direct execution**

For every trigger function:

```sql
revoke all on function public.<function_signature> from public, anon, authenticated;
```

- [ ] **Step 8: Run source tests**

```bash
npm test -- src/features/employees/audit/query.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607140002_hr_notes_audit_history.sql \
  src/features/employees/audit/query.test.ts
git commit -m "feat: add employee audit triggers"
```

---

### Task 7: Add Activity types, safe presentation, filtering, and pagination

**Files:**
- Create: `src/features/employees/audit/types.ts`
- Create: `src/features/employees/audit/query.ts`
- Modify: `src/features/employees/audit/query.test.ts`
- Create: `src/features/employees/audit/presentation.ts`
- Create: `src/features/employees/audit/presentation.test.ts`

**Interfaces:**
- Produces `getEmployeeActivity(employeeId, filter, page)`.
- Produces `describeAuditEntry(entry)`.
- Page size is exactly 20.
- Ordering is `created_at DESC, id DESC`.

- [ ] **Step 1: Create audit types**

Use the Shared interfaces section.

Add this filter-to-entity map:

```ts
export const activityEntityFilters: Record<
  Exclude<ActivityFilter, "all">,
  string[]
> = {
  profile: ["personal_details", "avatar"],
  employment: ["employment", "manager", "employee"],
  emergency: ["emergency_contact"],
  sensitive: ["sensitive_data"],
  hr_notes: ["hr_note"],
  system: ["system"],
};
```

- [ ] **Step 2: Add query tests**

Append to `query.test.ts`:

```ts
const querySource = await readFile(
  new URL("./query.ts", import.meta.url),
  "utf8",
);

test("activity query uses stable newest-first pagination", () => {
  assert.match(querySource, /const pageSize = 20/);
  assert.match(querySource, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(querySource, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(querySource, /\.range\(from, to\)/);
});

test("activity query uses explicit actor profile relationship", () => {
  assert.match(
    querySource,
    /actor:profiles!employee_audit_logs_actor_profile_id_fkey/,
  );
});
```

- [ ] **Step 3: Implement `getEmployeeActivity`**

Core query:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  activityEntityFilters,
  activityFilters,
  type ActivityFilter,
  type EmployeeAuditEntry,
  type PaginatedActivity,
} from "./types";

export async function getEmployeeActivity(
  employeeId: string,
  requestedFilter: string,
  requestedPage: number,
): Promise<PaginatedActivity> {
  const filter = activityFilters.includes(requestedFilter as ActivityFilter)
    ? requestedFilter as ActivityFilter
    : "all";
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from("employee_audit_logs")
    .select(`
      id,
      employee_id,
      actor_profile_id,
      action,
      entity_type,
      entity_id,
      changed_fields,
      before_values,
      after_values,
      metadata,
      source,
      created_at,
      actor:profiles!employee_audit_logs_actor_profile_id_fkey(
        id,display_name,first_name,last_name
      )
    `, { count: "exact" })
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (filter !== "all") {
    query = query.in("entity_type", activityEntityFilters[filter]);
  }

  const { data, count, error } = await query;
  if (error) throw new Error("Unable to load employee activity.");

  const total = count ?? 0;
  return {
    entries: (data ?? []) as unknown as EmployeeAuditEntry[],
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
```

- [ ] **Step 4: Write presentation tests**

Create `presentation.test.ts` with entries for:

- Manager changed
- Sensitive details updated
- HR note deleted
- System actor
- Unknown action fallback

Verify no description includes values from sensitive metadata.

- [ ] **Step 5: Implement safe descriptions**

`describeAuditEntry` returns:

```ts
export type AuditPresentation = {
  title: string;
  detail: string | null;
  actorLabel: string;
};
```

Required examples:

```text
manager.changed
Title: Manager changed
Detail: Maria Santos → Joel Reyes

sensitive_details.updated
Title: Sensitive details updated
Detail: SSS number, Account number

hr_note.deleted
Title: HR note deleted
Detail: null

actor_profile_id null
Actor: System / database operation
```

Only read before/after values for whitelisted employment fields. For sensitive and HR note actions, read changed field names only.

- [ ] **Step 6: Run tests**

```bash
npm test -- src/features/employees/audit/query.test.ts \
  src/features/employees/audit/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/employees/audit
git commit -m "feat: add employee activity queries"
```

---

### Task 8: Replace direct reveal logging with the atomic RPC

**Files:**
- Modify: `src/app/(dashboard)/employees/[id]/sensitive-actions.ts`
- Modify: `src/features/employees/sensitive/actions.test.ts`

**Interfaces:**
- Calls `log_sensitive_data_reveal`.
- Returns plaintext only after RPC success.
- Revalidates `/employees/${employeeId}/activity`.

- [ ] **Step 1: Update tests first**

Replace the logging assertion with:

```ts
test("reveal compliance and activity logging succeeds before plaintext is returned", () => {
  assert.match(source, /\.rpc\("log_sensitive_data_reveal"/);
  assert.match(source, /if \(logError\) \{/);
  assert.ok(
    source.indexOf('rpc("log_sensitive_data_reveal"')
      < source.indexOf("value: plaintext"),
  );
  assert.doesNotMatch(
    source,
    /\.from\("sensitive_data_access_logs"\)\s*\.insert/,
  );
});
```

- [ ] **Step 2: Update reveal action**

Replace direct insertion with:

```ts
const { error: logError } = await supabase.rpc(
  "log_sensitive_data_reveal",
  {
    p_employee_id: employeeId,
    p_field_name: fieldName,
    p_ip_address: forwardedFor,
    p_user_agent: userAgent,
  },
);

if (logError) {
  return { error: "Unable to reveal this value. Please try again." };
}

revalidatePath(`/employees/${employeeId}/activity`);
return { value: plaintext, revealedAt: Date.now() };
```

Remove the direct `sensitive_data_access_logs` insert.

- [ ] **Step 3: Run sensitive tests**

```bash
npm test -- src/features/employees/sensitive/actions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/sensitive-actions.ts' \
  src/features/employees/sensitive/actions.test.ts
git commit -m "feat: make sensitive reveal logging atomic"
```

---

### Task 9: Add Activity route and timeline UI

**Files:**
- Create: `src/app/(dashboard)/employees/[id]/activity/page.tsx`
- Create: `src/components/employees/profile/activity-timeline.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- HR-only route through `requireEmployeeProfileManager`.
- Filter query parameter: `filter`.
- Page query parameter: `page`.
- Exactly 20 rows per page.

- [ ] **Step 1: Create timeline component**

Required signature:

```ts
export function ActivityTimeline({
  entries,
}: {
  entries: EmployeeAuditEntry[];
}) {}
```

Each entry displays:

- Human-readable title
- Safe detail
- Actor
- Timestamp
- Source label
- Changed field chips when safe

No edit/delete controls.

- [ ] **Step 2: Create Activity page**

The page must:

- Call `requireEmployeeProfileManager(id)` before data reads.
- Load employee.
- Parse `filter` and `page`.
- Call `getEmployeeActivity`.
- Render `ProfileTabs active="activity" canManage`.
- Render filter links preserving page reset to 1.
- Render previous/next pagination links.
- Show stable page information.
- Show empty state when no activity exists.

- [ ] **Step 3: Add timeline styles**

```css
.activity-entry {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 12px;
}

.activity-dot {
  width: 10px;
  height: 10px;
  margin-top: 7px;
  border-radius: 999px;
  background: var(--primary);
}

.activity-entry-content {
  min-width: 0;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.activity-entry-title {
  margin: 0;
  font-size: 15px;
}

.activity-entry-detail {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}

.activity-entry-meta {
  display: flex;
  gap: 6px 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
}
```

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: route `/employees/[id]/activity` appears and build passes.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/activity' \
  src/components/employees/profile/activity-timeline.tsx \
  src/app/globals.css
git commit -m "feat: add employee activity timeline"
```

---

### Task 10: Revalidate Activity after existing business actions

**Files:**
- Modify: `src/app/(dashboard)/employees/[id]/profile-actions.ts`
- Modify: `src/app/(dashboard)/employees/actions.ts`
- Modify: `src/app/(dashboard)/employees/[id]/sensitive-actions.ts`

**Interfaces:**
- Existing business behavior remains unchanged.
- Only cache revalidation is added because triggers own audit inserts.

- [ ] **Step 1: Extend profile revalidation**

Inside `revalidateProfile(employeeId)` add:

```ts
revalidatePath(`/employees/${employeeId}/activity`);
```

- [ ] **Step 2: Extend employee organization revalidation**

Inside `revalidateEmployeeOrganizationPaths(id)` add:

```ts
if (id) revalidatePath(`/employees/${id}/activity`);
```

- [ ] **Step 3: Revalidate sensitive activity after updates**

After successful sensitive update, before redirect:

```ts
revalidatePath(`/employees/${employeeId}/activity`);
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all prior and new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/employees/[id]/profile-actions.ts' \
  'src/app/(dashboard)/employees/[id]/sensitive-actions.ts' \
  'src/app/(dashboard)/employees/actions.ts'
git commit -m "chore: revalidate employee activity"
```

---

### Task 11: Add security regression tests, documentation, and final verification

**Files:**
- Create: `src/features/employees/audit/security.test.ts`
- Modify: `README.md`
- Add: `docs/superpowers/specs/2026-07-14-phase-4b2-hr-notes-audit-history-design.md`
- Add: `docs/superpowers/plans/2026-07-14-phase-4b2-hr-notes-audit-history.md`

**Interfaces:**
- Tests assert no prohibited values can be serialized into audit definitions or application action sources.
- README includes migration and QA instructions.

- [ ] **Step 1: Add sentinel data-leak tests**

Create `security.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../../../../supabase/migrations/202607140002_hr_notes_audit_history.sql",
    import.meta.url,
  ),
  "utf8",
);

const noteActions = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/hr-note-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

const revealActions = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/sensitive-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("audit definitions contain no prohibited sentinel values", () => {
  for (const sentinel of [
    "DO_NOT_LOG_NOTE_TEXT",
    "DO_NOT_LOG_SSS_1234567890",
    "DO_NOT_LOG_BANK_99887766",
  ]) {
    assert.doesNotMatch(migration, new RegExp(sentinel));
    assert.doesNotMatch(noteActions, new RegExp(sentinel));
    assert.doesNotMatch(revealActions, new RegExp(sentinel));
  }
});

test("audit writer is never passed protected ciphertext or hash columns", () => {
  assert.doesNotMatch(
    migration,
    /write_employee_audit\([^;]+(_ciphertext|_hash|_last4)/is,
  );
});

test("HR note actions never use persistent browser storage or plaintext logs", () => {
  assert.doesNotMatch(noteActions, /localStorage|sessionStorage/);
  assert.doesNotMatch(noteActions, /console\.(log|error)\([^)]*content/);
});
```

- [ ] **Step 2: Document setup and smoke tests**

README additions must include:

```text
Migration:
supabase/migrations/202607140002_hr_notes_audit_history.sql

Protected routes:
/employees/[id]/hr-notes
/employees/[id]/hr-notes/new
/employees/[id]/hr-notes/[noteId]/edit
/employees/[id]/hr-notes/deleted
/employees/[id]/activity
```

Also document:

- HR note ownership matrix
- Deleted archive is Super Admin-only
- Existing `HRIS_DATA_ENCRYPTION_KEY` is required
- Do not rotate the key without migrating existing Phase 4B-1 and Phase 4B-2 ciphertext
- Apply migration before deploying application code
- Run role and direct-route smoke tests
- Query audit logs and confirm no prohibited data

- [ ] **Step 3: Run complete verification**

```bash
npm test
npm run build
```

Expected:

- All tests pass with zero failures.
- TypeScript passes.
- Build contains:
  - `/employees/[id]/hr-notes`
  - `/employees/[id]/hr-notes/new`
  - `/employees/[id]/hr-notes/[noteId]/edit`
  - `/employees/[id]/hr-notes/deleted`
  - `/employees/[id]/activity`

- [ ] **Step 4: Apply migration to the development Supabase project**

Run the complete migration in Supabase SQL Editor, then:

```sql
notify pgrst, 'reload schema';
```

Verify:

```sql
select
  relname,
  relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('employee_hr_notes', 'employee_audit_logs');

select
  trigger_name,
  event_object_table
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'employees',
    'employee_personal_details',
    'employee_emergency_contacts',
    'employee_sensitive_details',
    'employee_hr_notes'
  )
order by event_object_table, trigger_name;
```

- [ ] **Step 5: Run manual role QA**

Super Admin:

```text
[ ] Can create, edit, delete, view deleted, and restore any note
[ ] Can view all Activity entries
```

HR Admin:

```text
[ ] Can view all active notes
[ ] Can create notes
[ ] Can edit/delete own notes
[ ] Cannot edit/delete another HR Admin’s note
[ ] Cannot access deleted archive
[ ] Can view Activity entries
```

Employee:

```text
[ ] HR Notes tab hidden
[ ] Activity tab hidden
[ ] Direct HR Notes routes blocked
[ ] Direct Activity route blocked
[ ] No protected content briefly renders
```

Audit:

```text
[ ] Each approved business action creates one entry
[ ] Reveal creates compliance and activity rows
[ ] Failed reveal logging returns no plaintext
[ ] No HR note text, ciphertext, government ID, hash, last-four, or bank value appears in employee_audit_logs
[ ] Audit UPDATE and DELETE attempts fail
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: complete HR notes and audit history"
```

---

## Final acceptance checklist

```text
[ ] HR notes encrypted at rest
[ ] Five approved categories only
[ ] 5,000-character maximum enforced
[ ] HR Admin ownership rules enforced in Server Actions and RLS
[ ] Soft deletion only
[ ] Deleted archive and restore are Super Admin-only
[ ] Employees blocked from all note and activity data
[ ] Every approved row-based event creates one trigger-owned activity row
[ ] Sensitive reveal logging is atomic
[ ] Audit logs contain only approved safe values
[ ] Audit logs are immutable
[ ] Activity filters work
[ ] Activity pagination is stable at 20 entries
[ ] All automated tests pass
[ ] Production build passes
[ ] Migration and role QA pass in Supabase
```
