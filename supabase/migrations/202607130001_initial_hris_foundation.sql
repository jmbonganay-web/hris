create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('super_admin', 'hr_admin', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.employment_status as enum ('active', 'probation', 'on_leave', 'inactive', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'employee',
  first_name text not null default '',
  last_name text not null default '',
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_titles (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_number text not null unique,
  work_email text not null unique,
  personal_email text,
  phone text,
  department_id uuid references public.departments(id) on delete set null,
  job_title_id uuid references public.job_titles(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null,
  employment_type public.employment_type not null default 'full_time',
  employment_status public.employment_status not null default 'active',
  hire_date date not null,
  work_location text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_department_id_idx on public.employees(department_id);
create index if not exists employees_job_title_id_idx on public.employees(job_title_id);
create index if not exists employees_manager_id_idx on public.employees(manager_id);
create index if not exists employees_status_idx on public.employees(employment_status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() limit 1; $$;

create or replace function public.is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_user_role() in ('super_admin', 'hr_admin'), false); $$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_user_role() = 'super_admin', false); $$;

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.job_titles enable row level security;
alter table public.employees enable row level security;

drop policy if exists "Profiles are visible to owner and HR" on public.profiles;
create policy "Profiles are visible to owner and HR" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_hr_admin());

drop policy if exists "HR can manage profiles" on public.profiles;
create policy "HR can manage profiles" on public.profiles
for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists "Authenticated users can view departments" on public.departments;
create policy "Authenticated users can view departments" on public.departments
for select to authenticated using (true);

drop policy if exists "HR can manage departments" on public.departments;
create policy "HR can manage departments" on public.departments
for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists "Authenticated users can view job titles" on public.job_titles;
create policy "Authenticated users can view job titles" on public.job_titles
for select to authenticated using (true);

drop policy if exists "HR can manage job titles" on public.job_titles;
create policy "HR can manage job titles" on public.job_titles
for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists "Employees can view own record and HR can view all" on public.employees;
create policy "Employees can view own record and HR can view all" on public.employees
for select to authenticated using (profile_id = auth.uid() or public.is_hr_admin());

drop policy if exists "HR can create employee records" on public.employees;
create policy "HR can create employee records" on public.employees
for insert to authenticated with check (public.is_hr_admin());

drop policy if exists "HR can update employee records" on public.employees;
create policy "HR can update employee records" on public.employees
for update to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

drop policy if exists "Super admins can delete employee records" on public.employees;
create policy "Super admins can delete employee records" on public.employees
for delete to authenticated using (public.is_super_admin());
