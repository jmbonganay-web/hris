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
  constraint employee_sensitive_details_bank_name_length_check
    check (bank_name is null or char_length(bank_name) <= 100),
  constraint employee_sensitive_details_last4_length_check
    check (
      (sss_last4 is null or char_length(sss_last4) <= 4)
      and (philhealth_last4 is null or char_length(philhealth_last4) <= 4)
      and (pagibig_last4 is null or char_length(pagibig_last4) <= 4)
      and (tin_last4 is null or char_length(tin_last4) <= 4)
      and (account_name_last4 is null or char_length(account_name_last4) <= 4)
      and (account_number_last4 is null or char_length(account_number_last4) <= 4)
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

-- No DELETE policy is intentionally created. Explicit clear controls null only the
-- related protected column group, while employee deletion still cascades internally.

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

-- No UPDATE or DELETE policies are created for access logs.

notify pgrst, 'reload schema';
