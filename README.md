# Northstar HRIS Frontend MVP

A frontend-only HRIS dashboard built with Next.js, TypeScript, and reusable CSS components.

## Included
- Responsive app shell and navigation
- Dashboard
- Employee directory
- Attendance
- Leave management
- Documents
- Announcements
- Reports
- Settings
- Demo login screen
- Mock data and reusable components

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Production build
```bash
npm run build
npm start
```

## Backend status
This project intentionally contains no backend yet. Replace the files in `src/data` with Supabase queries once authentication and database integration begin.
# Northstar HRIS MVP

A Next.js HRIS frontend with Supabase authentication, protected routes, password reset, role-aware user display, and the initial database/RLS foundation.

## Included in this version

- Supabase email/password authentication
- Secure cookie-based sessions
- Protected dashboard routes
- Login, logout, forgot-password, and reset-password flows
- User profile and role lookup
- Initial HRIS tables: profiles, departments, job titles, employees
- Row Level Security policies
- Seed data for departments and job titles
- Responsive HRIS frontend using mock operational data

Employee CRUD, attendance, leave, documents, and reports are still frontend mock modules and should be connected in later phases.

## 1. Install

```bash
npm install
```

## 2. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For Vercel, use the deployed production URL for `NEXT_PUBLIC_APP_URL`, for example:

```env
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
```

Never expose a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

## 3. Create the database foundation

In Supabase, open **SQL Editor** and run:

```text
supabase/migrations/202607130001_initial_hris_foundation.sql
```

Then optionally run:

```text
supabase/seed.sql
```

## 4. Create the first admin

In Supabase:

1. Open **Authentication → Users**.
2. Add a user with email and password.
3. Run this SQL, replacing the email:

```sql
update public.profiles
set role = 'super_admin'
where id = (
  select id from auth.users where email = 'YOUR_EMAIL_ADDRESS'
);
```

## 5. Configure Supabase URLs

In **Authentication → URL Configuration**:

- Site URL: your production Vercel URL
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://your-project.vercel.app/auth/callback`

These URLs are required for password-reset redirects.

## 6. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## 7. Validate

```bash
npm run build
```

## Vercel variables

Add these under **Project Settings → Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Redeploy after adding or changing variables.

## Next backend phase

1. Replace employee mock data with Supabase queries.
2. Add employee create/edit/archive Server Actions.
3. Add form validation and authorization checks.
4. Add attendance tables and workflows.
5. Add leave balances, requests, and approvals.
