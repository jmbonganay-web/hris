# Northstar HRIS MVP

A responsive HRIS application built with Next.js, TypeScript, and Supabase. The current version includes authentication, organization management, expanded employee profiles, and encrypted HR-only government and payroll details.

## Implemented modules

- Supabase email/password authentication
- Cookie-based sessions and protected dashboard routes
- Forgot-password and reset-password flows
- Role-aware access for `super_admin`, `hr_admin`, and `employee`
- Employee list, search, filters, pagination, detail, create, edit, and soft archive
- Department list, search, filters, pagination, detail, create, edit, department heads, employee counts, and soft archive
- Job-title list, department/status filters, pagination, detail, create, edit, employee counts, and soft archive
- Department-aware job-title filtering in employee forms
- Server-side prevention of archived, inactive, or mismatched organization assignments
- Row Level Security policies for the current HRIS foundation
- Expanded employee profile tabs for overview, personal information, employment, and emergency contacts
- HR-only profile editing with employee self-view restrictions
- Multiple emergency contacts with a single primary contact
- Manager hierarchy validation that blocks self-management and circular reporting chains
- Private Supabase avatar storage with signed URLs, image validation, replacement, and removal
- Encrypted HR-only government IDs and payroll/bank details
- Masked-by-default sensitive values with 30-second reveal controls
- HMAC-based duplicate prevention for SSS, PhilHealth, Pag-IBIG, and TIN
- Append-only metadata logging for every successful sensitive-value reveal

Attendance, leave, documents, announcements, reports, and advanced settings remain future phases.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- A Supabase project

## 1. Install

```bash
npm install
```

## 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Add:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
HRIS_DATA_ENCRYPTION_KEY=<independent 32-byte base64url secret>
HRIS_DATA_HASH_KEY=<different independent 32-byte base64url secret>
```

Never place a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

## 3. Run database migrations

Apply the files in this order through **Supabase → SQL Editor**:

```text
supabase/migrations/202607130001_initial_hris_foundation.sql
supabase/migrations/202607130002_employee_management.sql
supabase/migrations/202607130003_organization_management.sql
supabase/migrations/202607130004_expanded_employee_profile.sql
supabase/migrations/202607140001_sensitive_employee_details.sql
```

The Phase 3 migration adds:

- `departments.department_head_id`
- `departments.archived_at`
- `job_titles.department_id`
- `job_titles.archived_at`
- Department/job-title lookup indexes
- Active job-title uniqueness within each department

Optionally run:

```text
supabase/seed.sql
```

## 4. Create the first admin

Create a user under **Supabase → Authentication → Users**, then run:

```sql
update public.profiles
set role = 'super_admin'
where id = (
  select id from auth.users where email = 'YOUR_EMAIL_ADDRESS'
);
```

## 5. Configure Supabase URLs

Under **Authentication → URL Configuration**:

- Site URL: your Vercel production URL
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://your-project.vercel.app/auth/callback`

## 6. Run locally

```bash
npm run dev
```

Open `http://localhost:3000/login`.

## 7. Test and validate

```bash
npm test
npx tsc --noEmit
npm run build
```

The tests use the Node.js built-in test runner and do not add a test-framework dependency.

## Phase 3 acceptance checklist

1. Create, edit, view, search, filter, paginate, and archive departments.
2. Assign an active employee as department head.
3. Confirm department employee counts update after employee changes.
4. Create, edit, view, filter, paginate, and archive job titles.
5. Confirm duplicate active job-title names are blocked within the same department.
6. Confirm archived organization records remain visible on existing employee details.
7. Confirm archived/inactive records disappear from new employee selectors.
8. Confirm employee job-title options filter by department.
9. Confirm server actions reject department/job-title mismatches.
10. Confirm employee-role users are redirected away from organization-management routes.

## Vercel variables

Add these under **Vercel → Project Settings → Environment Variables** and redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `HRIS_DATA_ENCRYPTION_KEY`
- `HRIS_DATA_HASH_KEY`


## Phase 4A expanded employee profiles

Phase 4A adds:

- Responsive employee profile tabs for Overview, Personal, Employment, and Emergency Contacts
- Dedicated HR-only edit forms per profile section
- Multiple emergency contacts with one primary contact
- Active-manager selection with self-management and circular-chain protection
- Probation, regularization, work-schedule, and reporting-manager fields
- A private `employee-avatars` Supabase Storage bucket with signed URLs
- Employee self-view restrictions enforced through server authorization and RLS

After applying `202607130004_expanded_employee_profile.sql`, Supabase creates the private avatar bucket and its policies automatically. The bucket accepts JPG, PNG, and WebP files up to 5 MB.

### Phase 4A routes

```text
/employees/[id]?tab=overview
/employees/[id]?tab=personal
/employees/[id]?tab=employment
/employees/[id]?tab=emergency
/employees/[id]/personal/edit
/employees/[id]/employment/edit
/employees/[id]/manager/edit
/employees/[id]/emergency-contacts/new
/employees/[id]/emergency-contacts/[contactId]/edit
```

### Phase 4A acceptance checklist

1. HR Admin and Super Admin can edit every Phase 4A profile section.
2. Employee-role users can view only their own expanded profile.
3. Profile photos upload to the private bucket and display through signed URLs.
4. Invalid file types and files larger than 5 MB are rejected.
5. Multiple emergency contacts can be created, but only one remains primary.
6. The current primary contact cannot be deleted while other contacts remain.
7. Only active, non-archived employees can be newly assigned as managers.
8. Self-management and circular reporting chains are rejected.
9. Existing archived organization values and historical managers remain readable.
10. `npm test`, `npx tsc --noEmit`, and `npm run build` pass.

## Phase 4B-1 protected government and payroll details

Phase 4B-1 adds an HR-only sensitive-data area with server-side encryption and masked display. Apply `supabase/migrations/202607140001_sensitive_employee_details.sql` before opening the new routes.

### Generate the two server-only keys

Generate each value independently:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store the first output as `HRIS_DATA_ENCRYPTION_KEY` and the second, different output as `HRIS_DATA_HASH_KEY`.

- Store local values only in `.env.local`.
- Add both values to the appropriate Vercel Production, Preview, and Development environments.
- Back up both values in a secure password manager before entering production data.
- Losing the encryption key makes stored encrypted values unrecoverable.
- Changing the hash key breaks duplicate matching until existing rows are rehashed.
- Never expose either key through a `NEXT_PUBLIC_` variable.

### Phase 4B-1 routes

```text
/employees/[id]/sensitive
/employees/[id]/sensitive/edit
```

Only `super_admin` and `hr_admin` users can open these routes or invoke their Server Actions. Employee-role users receive no database policy for either sensitive table.

### Storage and reveal behavior

- SSS, PhilHealth, Pag-IBIG, TIN, account name, and account number are encrypted using AES-256-GCM before storage.
- SSS, PhilHealth, Pag-IBIG, and TIN use keyed HMAC-SHA256 hashes for duplicate detection.
- Normal page reads select only last-four metadata, bank name, and payroll account type.
- Protected inputs are never prefilled. Leaving one blank preserves the current value.
- Explicit Clear controls remove the complete encrypted/hash/last-four group.
- Revealed plaintext remains only in component state and hides after 30 seconds, on **Hide now**, refresh, or navigation.
- Every successful reveal inserts one metadata-only row in `sensitive_data_access_logs` before plaintext is returned.
- Access-log rows have no update or delete RLS policy.

### Phase 4B-1 acceptance checklist

1. Super Admin and HR Admin can view masked values, reveal one value at a time, edit values, and explicitly clear values.
2. Employee-role users cannot see the tab or open either sensitive route.
3. Submitted protected values are not readable as plaintext in `employee_sensitive_details`.
4. Ciphertext starts with `v1.` and government hashes contain 64 hexadecimal characters.
5. Duplicate government IDs produce field-level errors; duplicate bank account numbers remain allowed.
6. Every successful reveal creates one metadata-only access-log row.
7. A failed access-log insert returns a generic error and never returns plaintext.
8. `npm test`, `npx tsc --noEmit`, and `npm run build` pass.

