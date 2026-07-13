# Northstar HRIS MVP

A responsive HRIS application built with Next.js, TypeScript, and Supabase. The current version includes authentication, protected routes, employee management, departments, and job titles.

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
```

Never place a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

## 3. Run database migrations

Apply the files in this order through **Supabase → SQL Editor**:

```text
supabase/migrations/202607130001_initial_hris_foundation.sql
supabase/migrations/202607130002_employee_management.sql
supabase/migrations/202607130003_organization_management.sql
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
