-- Phase 4A: Expanded employee profiles.
-- Adds personal details, emergency contacts, employment dates/schedule,
-- manager hierarchy helpers, and private employee avatar storage.

alter table public.employees
  add column if not exists avatar_path text,
  add column if not exists probation_end_date date,
  add column if not exists regularization_date date,
  add column if not exists work_schedule text;

create table if not exists public.employee_personal_details (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  middle_name text,
  preferred_name text,
  date_of_birth date,
  gender text,
  civil_status text,
  nationality text,
  personal_email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_province text,
  postal_code text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  phone text not null,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_emergency_contacts_employee_id_idx
  on public.employee_emergency_contacts(employee_id);

create unique index if not exists employee_emergency_contacts_one_primary_idx
  on public.employee_emergency_contacts(employee_id)
  where is_primary;

-- Backfill personal email and phone from the original employee columns.
insert into public.employee_personal_details (employee_id, personal_email, phone)
select id, personal_email, phone
from public.employees
where personal_email is not null or phone is not null
on conflict (employee_id) do update
set
  personal_email = coalesce(public.employee_personal_details.personal_email, excluded.personal_email),
  phone = coalesce(public.employee_personal_details.phone, excluded.phone),
  updated_at = now();

create or replace function public.set_single_primary_emergency_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_primary then
    update public.employee_emergency_contacts
    set is_primary = false, updated_at = now()
    where employee_id = new.employee_id
      and id <> new.id
      and is_primary = true;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ensure_single_primary_emergency_contact
  on public.employee_emergency_contacts;
create trigger ensure_single_primary_emergency_contact
before insert or update of is_primary, employee_id
on public.employee_emergency_contacts
for each row
execute function public.set_single_primary_emergency_contact();

create or replace function public.create_employee_personal_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.employee_personal_details (employee_id, personal_email, phone)
  values (new.id, new.personal_email, new.phone)
  on conflict (employee_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_employee_created_personal_details on public.employees;
create trigger on_employee_created_personal_details
after insert on public.employees
for each row
execute function public.create_employee_personal_details();

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.employees
  where profile_id = auth.uid()
  limit 1;
$$;

alter table public.employee_personal_details enable row level security;
alter table public.employee_emergency_contacts enable row level security;

drop policy if exists "Personal details visible to owner and HR"
  on public.employee_personal_details;
create policy "Personal details visible to owner and HR"
on public.employee_personal_details
for select to authenticated
using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists "HR can manage personal details"
  on public.employee_personal_details;
create policy "HR can manage personal details"
on public.employee_personal_details
for all to authenticated
using (public.is_hr_admin())
with check (public.is_hr_admin());

drop policy if exists "Emergency contacts visible to owner and HR"
  on public.employee_emergency_contacts;
create policy "Emergency contacts visible to owner and HR"
on public.employee_emergency_contacts
for select to authenticated
using (employee_id = public.current_employee_id() or public.is_hr_admin());

drop policy if exists "HR can manage emergency contacts"
  on public.employee_emergency_contacts;
create policy "HR can manage emergency contacts"
on public.employee_emergency_contacts
for all to authenticated
using (public.is_hr_admin())
with check (public.is_hr_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-avatars',
  'employee-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Employee avatar images visible to owner and HR"
  on storage.objects;
create policy "Employee avatar images visible to owner and HR"
on storage.objects
for select to authenticated
using (
  bucket_id = 'employee-avatars'
  and (
    public.is_hr_admin()
    or (storage.foldername(name))[1] = public.current_employee_id()::text
  )
);

drop policy if exists "HR can upload employee avatars"
  on storage.objects;
create policy "HR can upload employee avatars"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'employee-avatars'
  and public.is_hr_admin()
);

drop policy if exists "HR can update employee avatars"
  on storage.objects;
create policy "HR can update employee avatars"
on storage.objects
for update to authenticated
using (bucket_id = 'employee-avatars' and public.is_hr_admin())
with check (bucket_id = 'employee-avatars' and public.is_hr_admin());

drop policy if exists "HR can delete employee avatars"
  on storage.objects;
create policy "HR can delete employee avatars"
on storage.objects
for delete to authenticated
using (bucket_id = 'employee-avatars' and public.is_hr_admin());

notify pgrst, 'reload schema';
