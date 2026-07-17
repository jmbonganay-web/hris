begin;

create extension if not exists btree_gist;
create extension if not exists pg_cron;

do $$ begin
  create type public.payroll_schedule_type as enum ('weekly','biweekly','semi_monthly','monthly');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payroll_period_status as enum ('draft','open','under_review','approved','locked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.compensation_type as enum ('monthly','hourly');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payroll_request_status as enum ('draft','pending_approval','approved','rejected','superseded','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payroll_period_event_type as enum ('generated','opened','submitted_for_review','returned_to_open','approved','locked','reopened','date_adjusted');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.compensation_event_type as enum ('draft_created','draft_updated','submitted','approved','rejected','superseded','assignment_draft_created','assignment_draft_updated','assignment_submitted','assignment_approved','assignment_rejected','assignment_superseded');
exception when duplicate_object then null; end $$;

create table public.payroll_settings (
  id smallint primary key default 1 check (id = 1),
  default_currency_code text not null default 'PHP'
    check (default_currency_code ~ '^[A-Z]{3}$'),
  payroll_timezone text not null default 'Asia/Manila',
  generation_enabled boolean not null default true,
  generation_horizon_months integer not null default 12
    check (generation_horizon_months between 1 and 24),
  version integer not null default 1 check (version >= 1),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.payroll_settings(id) values (1)
on conflict (id) do nothing;

create table public.payroll_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  schedule_type public.payroll_schedule_type not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null,
  anchor_date date,
  first_period_end_day integer,
  cutoff_offset_days integer not null default 0,
  payment_offset_days integer not null default 5,
  business_day_adjustment text not null default 'previous'
    check (business_day_adjustment = 'previous'),
  is_active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint payroll_schedule_code_format check (code ~ '^[A-Z0-9-]{2,16}$'),
  constraint payroll_schedule_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint payroll_schedule_offsets check (
    cutoff_offset_days between -31 and 31
    and payment_offset_days between -31 and 62
  ),
  constraint payroll_schedule_config check (
    (schedule_type in ('weekly','biweekly') and anchor_date is not null and first_period_end_day is null)
    or (schedule_type = 'semi_monthly' and anchor_date is null and first_period_end_day between 1 and 27)
    or (schedule_type = 'monthly' and anchor_date is null and first_period_end_day is null)
  )
);
create unique index payroll_schedules_active_code_unique
  on public.payroll_schedules(lower(code)) where is_active;
create index payroll_schedules_active_idx on public.payroll_schedules(is_active, schedule_type);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  payroll_schedule_id uuid not null references public.payroll_schedules(id) on delete restrict,
  period_code text not null,
  period_sequence integer not null check (period_sequence >= 1),
  period_start date not null,
  period_end date not null,
  cutoff_date date not null,
  payment_date date not null,
  original_cutoff_date date not null,
  original_payment_date date not null,
  status public.payroll_period_status not null default 'draft',
  requires_recalculation boolean not null default false,
  version integer not null default 1 check (version >= 1),
  opened_at timestamptz,
  submitted_for_review_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_period_date_order check (period_start <= period_end),
  constraint payroll_period_schedule_dates_unique unique (payroll_schedule_id, period_start, period_end),
  constraint payroll_period_code_schedule_unique unique (payroll_schedule_id, period_code)
);
create index payroll_periods_status_dates_idx on public.payroll_periods(status, period_start, period_end);
create index payroll_periods_schedule_payment_idx on public.payroll_periods(payroll_schedule_id, payment_date);

create table public.employee_compensation_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  compensation_type public.compensation_type not null,
  monthly_salary numeric(14,2),
  hourly_rate numeric(12,2),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  standard_hours_per_day numeric(5,2) not null check (standard_hours_per_day > 0 and standard_hours_per_day <= 24),
  standard_hours_per_week numeric(6,2) not null check (standard_hours_per_week >= standard_hours_per_day and standard_hours_per_week <= 168),
  effective_from date not null,
  effective_to date,
  status public.payroll_request_status not null default 'draft',
  change_reason text,
  is_backdated boolean not null default false,
  version integer not null default 1 check (version >= 1),
  request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compensation_amount_type_check check (
    (compensation_type = 'monthly' and monthly_salary > 0 and hourly_rate is null)
    or (compensation_type = 'hourly' and hourly_rate > 0 and monthly_salary is null)
  ),
  constraint compensation_effective_order check (effective_to is null or effective_to >= effective_from),
  constraint compensation_reason_length check (change_reason is null or char_length(change_reason) <= 1000),
  constraint compensation_rejection_reason_length check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint employee_compensation_approved_no_overlap exclude using gist (
    employee_id with =,
    daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') with &&
  ) where (status = 'approved')
);
create unique index employee_compensation_request_unique
  on public.employee_compensation_records(created_by, request_id);
create index employee_compensation_employee_status_idx
  on public.employee_compensation_records(employee_id, status, effective_from desc);

create table public.employee_payroll_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  payroll_schedule_id uuid not null references public.payroll_schedules(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  status public.payroll_request_status not null default 'draft',
  change_reason text,
  override_mid_period boolean not null default false,
  override_reason text,
  version integer not null default 1 check (version >= 1),
  request_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_assignment_effective_order check (effective_to is null or effective_to >= effective_from),
  constraint payroll_assignment_reason_length check (change_reason is null or char_length(change_reason) <= 1000),
  constraint payroll_assignment_override_reason_check check (
    (not override_mid_period and override_reason is null)
    or (override_mid_period and nullif(btrim(coalesce(override_reason,'')), '') is not null)
  ),
  constraint payroll_assignment_rejection_reason_length check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint employee_payroll_assignment_approved_no_overlap exclude using gist (
    employee_id with =,
    daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') with &&
  ) where (status = 'approved')
);
create unique index employee_payroll_assignment_request_unique
  on public.employee_payroll_schedule_assignments(created_by, request_id);
create index employee_payroll_assignment_employee_status_idx
  on public.employee_payroll_schedule_assignments(employee_id, status, effective_from desc);

create table public.payroll_period_events (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  event_type public.payroll_period_event_type not null,
  from_status public.payroll_period_status,
  to_status public.payroll_period_status,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint payroll_period_event_reason_length check (reason is null or char_length(reason) <= 1000)
);
create index payroll_period_events_period_created_idx on public.payroll_period_events(payroll_period_id, created_at desc);

create table public.compensation_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  compensation_record_id uuid references public.employee_compensation_records(id) on delete restrict,
  schedule_assignment_id uuid references public.employee_payroll_schedule_assignments(id) on delete restrict,
  event_type public.compensation_event_type not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  request_id uuid,
  previous_values jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_values) = 'object'),
  new_values jsonb not null default '{}'::jsonb check (jsonb_typeof(new_values) = 'object'),
  created_at timestamptz not null default now(),
  constraint compensation_event_target_check check (
    (compensation_record_id is not null and schedule_assignment_id is null)
    or (compensation_record_id is null and schedule_assignment_id is not null)
  ),
  constraint compensation_event_reason_length check (reason is null or char_length(reason) <= 1000)
);
create index compensation_events_employee_created_idx on public.compensation_events(employee_id, created_at desc);

create or replace function public.assert_safe_payroll_payload(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_value jsonb;
  v_forbidden text;
begin
  if p_payload is null then return; end if;
  if jsonb_typeof(p_payload) = 'object' then
    for v_key, v_value in select key, value from jsonb_each(p_payload) loop
      foreach v_forbidden in array array[
        'monthly_salary','hourly_rate','amount','change_reason','override_reason',
        'rejection_reason','bank','account','tax','government','service_role','access_token'
      ] loop
        if position(v_forbidden in lower(v_key)) > 0 then
          raise exception using errcode = 'P0001', message = 'PAYROLL_SETTINGS_INVALID';
        end if;
      end loop;
      if jsonb_typeof(v_value) in ('object','array') then
        perform public.assert_safe_payroll_payload(v_value);
      end if;
    end loop;
  elsif jsonb_typeof(p_payload) = 'array' then
    for v_value in select value from jsonb_array_elements(p_payload) loop
      if jsonb_typeof(v_value) in ('object','array') then
        perform public.assert_safe_payroll_payload(v_value);
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.reject_payroll_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'PAYROLL_AUDIT_IMMUTABLE';
end;
$$;

create or replace function public.guard_payroll_request_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'PAYROLL_COMPENSATION_IMMUTABLE';
  end if;
  if old.status in ('approved','superseded')
     and current_setting('app.payroll_workflow', true) <> 'on' then
    raise exception using errcode = 'P0001', message = 'PAYROLL_COMPENSATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_period_events_immutable on public.payroll_period_events;
create trigger payroll_period_events_immutable
before update or delete on public.payroll_period_events
for each row execute function public.reject_payroll_audit_mutation();
drop trigger if exists compensation_events_immutable on public.compensation_events;
create trigger compensation_events_immutable
before update or delete on public.compensation_events
for each row execute function public.reject_payroll_audit_mutation();
drop trigger if exists compensation_records_immutable on public.employee_compensation_records;
create trigger compensation_records_immutable
before update or delete on public.employee_compensation_records
for each row execute function public.guard_payroll_request_mutation();
drop trigger if exists payroll_assignments_immutable on public.employee_payroll_schedule_assignments;
create trigger payroll_assignments_immutable
before update or delete on public.employee_payroll_schedule_assignments
for each row execute function public.guard_payroll_request_mutation();

create or replace function public.write_payroll_period_event(
  p_payroll_period_id uuid,
  p_event_type public.payroll_period_event_type,
  p_from_status public.payroll_period_status,
  p_to_status public.payroll_period_status,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.assert_safe_payroll_payload(coalesce(p_metadata, '{}'::jsonb));
  insert into public.payroll_period_events(
    id,payroll_period_id,event_type,from_status,to_status,actor_user_id,reason,request_id,metadata
  ) values (
    v_id,p_payroll_period_id,p_event_type,p_from_status,p_to_status,p_actor_user_id,
    nullif(btrim(coalesce(p_reason,'')),''),p_request_id,coalesce(p_metadata,'{}'::jsonb)
  );
  return v_id;
end;
$$;

create or replace function public.write_compensation_event(
  p_employee_id uuid,
  p_compensation_record_id uuid,
  p_schedule_assignment_id uuid,
  p_event_type public.compensation_event_type,
  p_actor_user_id uuid,
  p_reason text,
  p_request_id uuid,
  p_previous_values jsonb default '{}'::jsonb,
  p_new_values jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.assert_safe_payroll_payload(coalesce(p_previous_values,'{}'::jsonb));
  perform public.assert_safe_payroll_payload(coalesce(p_new_values,'{}'::jsonb));
  insert into public.compensation_events(
    id,employee_id,compensation_record_id,schedule_assignment_id,event_type,actor_user_id,
    reason,request_id,previous_values,new_values
  ) values (
    v_id,p_employee_id,p_compensation_record_id,p_schedule_assignment_id,p_event_type,
    p_actor_user_id,nullif(btrim(coalesce(p_reason,'')),''),p_request_id,
    coalesce(p_previous_values,'{}'::jsonb),coalesce(p_new_values,'{}'::jsonb)
  );
  return v_id;
end;
$$;

alter table public.payroll_settings enable row level security;
alter table public.payroll_schedules enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.employee_compensation_records enable row level security;
alter table public.employee_payroll_schedule_assignments enable row level security;
alter table public.payroll_period_events enable row level security;
alter table public.compensation_events enable row level security;

create policy "HR reads payroll settings" on public.payroll_settings
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll schedules" on public.payroll_schedules
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll periods" on public.payroll_periods
for select to authenticated using (public.is_hr_admin());
create policy "HR reads compensation records" on public.employee_compensation_records
for select to authenticated using (public.is_hr_admin());
create policy "Employees read own current compensation" on public.employee_compensation_records
for select to authenticated using (
  employee_id = public.current_employee_id()
  and status = 'approved'
  and effective_from <= public.company_attendance_date(now())
  and (effective_to is null or effective_to >= public.company_attendance_date(now()))
);
create policy "HR reads payroll assignments" on public.employee_payroll_schedule_assignments
for select to authenticated using (public.is_hr_admin());
create policy "Employees read own current payroll assignment" on public.employee_payroll_schedule_assignments
for select to authenticated using (
  employee_id = public.current_employee_id()
  and status = 'approved'
  and effective_from <= public.company_attendance_date(now())
  and (effective_to is null or effective_to >= public.company_attendance_date(now()))
);
create policy "HR reads payroll period events" on public.payroll_period_events
for select to authenticated using (public.is_hr_admin());
create policy "HR reads compensation events" on public.compensation_events
for select to authenticated using (public.is_hr_admin());

revoke all on public.payroll_settings from authenticated;
revoke all on public.payroll_schedules from authenticated;
revoke all on public.payroll_periods from authenticated;
revoke all on public.employee_compensation_records from authenticated;
revoke all on public.employee_payroll_schedule_assignments from authenticated;
revoke all on public.payroll_period_events from authenticated;
revoke all on public.compensation_events from authenticated;
grant select on public.payroll_settings to authenticated;
grant select on public.payroll_schedules to authenticated;
grant select on public.payroll_periods to authenticated;
grant select on public.employee_compensation_records to authenticated;
grant select on public.employee_payroll_schedule_assignments to authenticated;
grant select on public.payroll_period_events to authenticated;
grant select on public.compensation_events to authenticated;

revoke all on function public.assert_safe_payroll_payload(jsonb) from public, anon, authenticated;
revoke all on function public.reject_payroll_audit_mutation() from public, anon, authenticated;
revoke all on function public.guard_payroll_request_mutation() from public, anon, authenticated;
revoke all on function public.write_payroll_period_event(uuid,public.payroll_period_event_type,public.payroll_period_status,public.payroll_period_status,uuid,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.write_compensation_event(uuid,uuid,uuid,public.compensation_event_type,uuid,text,uuid,jsonb,jsonb) from public, anon, authenticated;

-- Extend Phase 9 notification safeguards for payroll without exposing compensation values.
alter table public.notifications drop constraint if exists notifications_module_check;
alter table public.notifications
  add constraint notifications_module_check
  check (module in ('attendance','leave','overtime','documents','payroll','system'));

create or replace function public.assert_safe_notification_payload(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_value jsonb;
  v_forbidden text;
begin
  if p_payload is null then return; end if;
  if jsonb_typeof(p_payload) = 'object' then
    for v_key, v_value in select key, value from jsonb_each(p_payload) loop
      foreach v_forbidden in array array[
        'signed_url','storage_path','service_role','access_token','raw_file','filename',
        'original_filename','safe_filename','internal_reason','private_note','private_notes',
        'review_note','rejection_reason','approval_note','bank','account_number','government_id',
        'custom_metadata','issuing_organization','reference_number','monthly_salary','hourly_rate',
        'amount','change_reason','override_reason'
      ] loop
        if position(v_forbidden in lower(v_key)) > 0 then
          raise exception using errcode = 'P0001', message = 'NOTIFICATION_INVALID_PAYLOAD';
        end if;
      end loop;
      if jsonb_typeof(v_value) in ('object','array') then
        perform public.assert_safe_notification_payload(v_value);
      end if;
    end loop;
  elsif jsonb_typeof(p_payload) = 'array' then
    for v_value in select value from jsonb_array_elements(p_payload) loop
      if jsonb_typeof(v_value) in ('object','array') then
        perform public.assert_safe_notification_payload(v_value);
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.validate_notification_action_url(p_url text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare v_allowed boolean;
begin
  if p_url is null or btrim(p_url) = '' then return null; end if;
  if p_url ~* '^[a-z][a-z0-9+.-]*:'
     or starts_with(p_url, '//')
     or position('://' in p_url) > 0
     or position(E'\\' in p_url) > 0
     or p_url ~ '[[:cntrl:]]'
     or lower(p_url) like 'javascript:%' then
    raise exception using errcode = 'P0001', message = 'NOTIFICATION_INVALID_ACTION_URL';
  end if;
  v_allowed := p_url = '/attendance' or starts_with(p_url, '/attendance/') or starts_with(p_url, '/attendance?')
    or p_url = '/admin/attendance' or starts_with(p_url, '/admin/attendance/') or starts_with(p_url, '/admin/attendance?')
    or p_url = '/leave' or starts_with(p_url, '/leave/') or starts_with(p_url, '/leave?')
    or p_url = '/employee/leave' or starts_with(p_url, '/employee/leave/') or starts_with(p_url, '/employee/leave?')
    or p_url = '/admin/leave' or starts_with(p_url, '/admin/leave/') or starts_with(p_url, '/admin/leave?')
    or p_url = '/overtime' or starts_with(p_url, '/overtime/') or starts_with(p_url, '/overtime?')
    or p_url = '/admin/overtime' or starts_with(p_url, '/admin/overtime/') or starts_with(p_url, '/admin/overtime?')
    or p_url = '/documents' or starts_with(p_url, '/documents/') or starts_with(p_url, '/documents?')
    or p_url = '/admin/documents/review' or starts_with(p_url, '/admin/documents/review/') or starts_with(p_url, '/admin/documents/review?')
    or p_url = '/notifications' or starts_with(p_url, '/notifications/') or starts_with(p_url, '/notifications?')
    or p_url = '/admin/notifications/settings' or starts_with(p_url, '/admin/notifications/settings/') or starts_with(p_url, '/admin/notifications/settings?')
    or p_url = '/payroll' or starts_with(p_url, '/payroll?')
    or p_url = '/payroll/approvals' or starts_with(p_url, '/payroll/approvals?')
    or p_url = '/payroll/periods' or starts_with(p_url, '/payroll/periods?')
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}(\?.*)?$'
    or p_url = '/me/compensation' or starts_with(p_url, '/me/compensation?');
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'NOTIFICATION_INVALID_ACTION_URL';
  end if;
  return p_url;
end;
$$;

create or replace function public.notify_payroll_super_admins(
  p_type_code text,
  p_title text,
  p_body text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_key text,
  p_employee_id uuid,
  p_safe_context jsonb,
  p_action_url text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user record;
  v_count integer := 0;
begin
  perform public.assert_safe_notification_payload(coalesce(p_safe_context,'{}'::jsonb));
  for v_user in select id from public.profiles where role = 'super_admin' loop
    perform public.upsert_safe_notification(
      v_user.id,p_type_code,p_title,p_body,'payroll','high',p_resource_type,p_resource_id,
      p_resource_key || ':' || v_user.id::text,p_employee_id,coalesce(p_safe_context,'{}'::jsonb),
      p_action_url,0,now(),3650,p_request_id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.notify_payroll_employee(
  p_employee_id uuid,
  p_type_code text,
  p_title text,
  p_body text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_key text,
  p_safe_context jsonb,
  p_action_url text,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_profile_id uuid;
begin
  perform public.assert_safe_notification_payload(coalesce(p_safe_context,'{}'::jsonb));
  select profile_id into v_profile_id from public.employees where id = p_employee_id;
  if v_profile_id is null then return false; end if;
  perform public.upsert_safe_notification(
    v_profile_id,p_type_code,p_title,p_body,'payroll','normal',p_resource_type,p_resource_id,
    p_resource_key,p_employee_id,coalesce(p_safe_context,'{}'::jsonb),p_action_url,0,now(),3650,p_request_id
  );
  return true;
end;
$$;

-- Compensation draft and approval workflow.
create or replace function public.create_compensation_draft(
  p_employee_id uuid,
  p_compensation_type public.compensation_type,
  p_monthly_salary numeric,
  p_hourly_rate numeric,
  p_standard_hours_per_day numeric,
  p_standard_hours_per_week numeric,
  p_effective_from date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_settings public.payroll_settings%rowtype;
  v_company_date date := public.company_attendance_date(now());
  v_reason text := nullif(btrim(coalesce(p_change_reason,'')), '');
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if p_employee_id is null or p_effective_from is null or p_request_id is null then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_INVALID'; end if;
  if not exists (select 1 from public.employees where id=p_employee_id and archived_at is null) then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_NOT_FOUND'; end if;
  if p_effective_from < v_company_date and v_reason is null then raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED'; end if;
  if v_reason is not null and char_length(v_reason) > 1000 then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_INVALID'; end if;
  select * into v_settings from public.payroll_settings where id=1;
  select id into v_id from public.employee_compensation_records where created_by=v_actor and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  begin
    insert into public.employee_compensation_records(
      employee_id,compensation_type,monthly_salary,hourly_rate,currency_code,
      standard_hours_per_day,standard_hours_per_week,effective_from,status,change_reason,
      is_backdated,request_id,created_by
    ) values (
      p_employee_id,p_compensation_type,p_monthly_salary,p_hourly_rate,v_settings.default_currency_code,
      p_standard_hours_per_day,p_standard_hours_per_week,p_effective_from,'draft',v_reason,
      p_effective_from < v_company_date,p_request_id,v_actor
    ) returning id into v_id;
  exception when check_violation or numeric_value_out_of_range then
    raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_INVALID';
  end;
  perform public.write_compensation_event(
    p_employee_id,v_id,null,'draft_created',v_actor,null,p_request_id,'{}'::jsonb,
    jsonb_build_object('effective_from',p_effective_from,'compensation_type',p_compensation_type,'status','draft')
  );
  return v_id;
end;
$$;

create or replace function public.update_compensation_draft(
  p_record_id uuid,
  p_expected_version integer,
  p_compensation_type public.compensation_type,
  p_monthly_salary numeric,
  p_hourly_rate numeric,
  p_standard_hours_per_day numeric,
  p_standard_hours_per_week numeric,
  p_effective_from date,
  p_change_reason text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_compensation_records%rowtype;
  v_reason text := nullif(btrim(coalesce(p_change_reason,'')), '');
  v_company_date date := public.company_attendance_date(now());
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.employee_compensation_records where id=p_record_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_NOT_FOUND'; end if;
  if v_row.status not in ('draft','rejected') then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if p_effective_from < v_company_date and v_reason is null then raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED'; end if;
  begin
    update public.employee_compensation_records set
      compensation_type=p_compensation_type,monthly_salary=p_monthly_salary,hourly_rate=p_hourly_rate,
      standard_hours_per_day=p_standard_hours_per_day,standard_hours_per_week=p_standard_hours_per_week,
      effective_from=p_effective_from,effective_to=null,status='draft',change_reason=v_reason,
      is_backdated=p_effective_from < v_company_date,rejected_by=null,rejected_at=null,rejection_reason=null,
      version=version+1,updated_at=now()
    where id=p_record_id;
  exception when check_violation or numeric_value_out_of_range then
    raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_INVALID';
  end;
  perform public.write_compensation_event(
    v_row.employee_id,p_record_id,null,'draft_updated',v_actor,null,p_request_id,
    jsonb_build_object('effective_from',v_row.effective_from,'compensation_type',v_row.compensation_type,'status',v_row.status),
    jsonb_build_object('effective_from',p_effective_from,'compensation_type',p_compensation_type,'status','draft')
  );
  return p_expected_version + 1;
end;
$$;

create or replace function public.submit_compensation_record(
  p_record_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_compensation_records%rowtype;
  v_version integer;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.employee_compensation_records where id=p_record_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_NOT_FOUND'; end if;
  if v_row.status not in ('draft','rejected') then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if v_row.effective_from < public.company_attendance_date(now()) and nullif(btrim(coalesce(v_row.change_reason,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED';
  end if;
  update public.employee_compensation_records set
    status='pending_approval',submitted_by=v_actor,submitted_at=now(),version=version+1,updated_at=now()
  where id=p_record_id returning version into v_version;
  perform public.write_compensation_event(
    v_row.employee_id,p_record_id,null,'submitted',v_actor,null,p_request_id,
    jsonb_build_object('status',v_row.status),
    jsonb_build_object('effective_from',v_row.effective_from,'compensation_type',v_row.compensation_type,'status','pending_approval')
  );
  perform public.notify_payroll_super_admins(
    'compensation_approval_pending','Compensation approval required',
    'A compensation change is waiting for approval.','compensation_record',p_record_id,
    'compensation:'||p_record_id::text,v_row.employee_id,
    jsonb_build_object('employee_id',v_row.employee_id,'request_id',p_record_id,'effective_from',v_row.effective_from,'status','pending_approval'),
    '/payroll/approvals',p_request_id
  );
  return v_version;
end;
$$;

create or replace function public.approve_compensation_record(
  p_record_id uuid,
  p_expected_version integer,
  p_backdated_confirmation boolean,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_compensation_records%rowtype;
  v_prior public.employee_compensation_records%rowtype;
  v_version integer;
  v_company_date date := public.company_attendance_date(now());
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  perform 1 from public.employees where id=(select employee_id from public.employee_compensation_records where id=p_record_id) for update;
  select * into v_row from public.employee_compensation_records where id=p_record_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_NOT_FOUND'; end if;
  if v_row.status <> 'pending_approval' then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if v_row.effective_from < v_company_date and (
    not coalesce(p_backdated_confirmation,false)
    or nullif(btrim(coalesce(v_row.change_reason,'')),'') is null
  ) then raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED'; end if;

  perform set_config('app.payroll_workflow','on',true);
  for v_prior in
    select * from public.employee_compensation_records
    where employee_id=v_row.employee_id and status='approved' and id<>v_row.id
    order by effective_from for update
  loop
    if v_prior.effective_from < v_row.effective_from then
      update public.employee_compensation_records set
        effective_to=v_row.effective_from-1,status='superseded',version=version+1,updated_at=now()
      where id=v_prior.id;
    else
      update public.employee_compensation_records set
        status='superseded',version=version+1,updated_at=now()
      where id=v_prior.id;
    end if;
    perform public.write_compensation_event(
      v_prior.employee_id,v_prior.id,null,'superseded',v_actor,null,p_request_id,
      jsonb_build_object('status','approved','effective_from',v_prior.effective_from),
      jsonb_build_object('status','superseded','effective_to',case when v_prior.effective_from < v_row.effective_from then v_row.effective_from-1 else v_prior.effective_to end)
    );
  end loop;

  update public.employee_compensation_records set
    status='approved',effective_to=null,approved_by=v_actor,approved_at=now(),
    rejected_by=null,rejected_at=null,rejection_reason=null,version=version+1,updated_at=now()
  where id=p_record_id returning version into v_version;

  update public.payroll_periods set requires_recalculation=true,version=version+1,updated_at=now()
  where status in ('open','under_review') and period_end >= v_row.effective_from;

  perform public.write_compensation_event(
    v_row.employee_id,p_record_id,null,'approved',v_actor,null,p_request_id,
    jsonb_build_object('status','pending_approval'),
    jsonb_build_object('effective_from',v_row.effective_from,'compensation_type',v_row.compensation_type,'status','approved')
  );
  perform public.notify_payroll_employee(
    v_row.employee_id,'compensation_approved','Compensation update approved',
    'Your approved compensation information is available.','compensation_record',p_record_id,
    'compensation-approved:'||p_record_id::text,
    jsonb_build_object('employee_id',v_row.employee_id,'request_id',p_record_id,'effective_from',v_row.effective_from,'status','approved'),
    '/me/compensation',p_request_id
  );
  return v_version;
exception when exclusion_violation then
  raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_OVERLAP';
end;
$$;

create or replace function public.reject_compensation_record(
  p_record_id uuid,
  p_expected_version integer,
  p_rejection_reason text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_compensation_records%rowtype;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason,'')), '');
  v_version integer;
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_INVALID'; end if;
  select * into v_row from public.employee_compensation_records where id=p_record_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_NOT_FOUND'; end if;
  if v_row.status <> 'pending_approval' then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  update public.employee_compensation_records set
    status='rejected',rejected_by=v_actor,rejected_at=now(),rejection_reason=v_reason,
    version=version+1,updated_at=now()
  where id=p_record_id returning version into v_version;
  perform public.write_compensation_event(
    v_row.employee_id,p_record_id,null,'rejected',v_actor,null,p_request_id,
    jsonb_build_object('status','pending_approval'),jsonb_build_object('status','rejected')
  );
  perform public.notify_payroll_employee(
    v_row.employee_id,'compensation_rejected','Compensation update needs revision',
    'A compensation request was returned to HR for revision.','compensation_record',p_record_id,
    'compensation-rejected:'||p_record_id::text,
    jsonb_build_object('employee_id',v_row.employee_id,'request_id',p_record_id,'effective_from',v_row.effective_from,'status','rejected'),
    '/me/compensation',p_request_id
  );
  return v_version;
end;
$$;

-- Payroll schedule assignment workflow.
create or replace function public.create_schedule_assignment_draft(
  p_employee_id uuid,
  p_payroll_schedule_id uuid,
  p_effective_from date,
  p_change_reason text,
  p_override_mid_period boolean,
  p_override_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_change_reason,'')), '');
  v_override_reason text := nullif(btrim(coalesce(p_override_reason,'')), '');
  v_company_date date := public.company_attendance_date(now());
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if p_employee_id is null or p_payroll_schedule_id is null or p_effective_from is null or p_request_id is null then
    raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_INVALID';
  end if;
  if not exists (select 1 from public.employees where id=p_employee_id and archived_at is null) then
    raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.payroll_schedules where id=p_payroll_schedule_id and is_active) then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_NOT_FOUND';
  end if;
  if p_effective_from < v_company_date and v_reason is null then
    raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED';
  end if;
  if coalesce(p_override_mid_period,false) and v_override_reason is null then
    raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_MID_PERIOD';
  end if;
  if (v_reason is not null and char_length(v_reason)>1000)
     or (v_override_reason is not null and char_length(v_override_reason)>1000) then
    raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_INVALID';
  end if;
  select id into v_id from public.employee_payroll_schedule_assignments
  where created_by=v_actor and request_id=p_request_id;
  if v_id is not null then return v_id; end if;

  insert into public.employee_payroll_schedule_assignments(
    employee_id,payroll_schedule_id,effective_from,status,change_reason,override_mid_period,
    override_reason,request_id,created_by
  ) values (
    p_employee_id,p_payroll_schedule_id,p_effective_from,'draft',v_reason,
    coalesce(p_override_mid_period,false),case when coalesce(p_override_mid_period,false) then v_override_reason else null end,
    p_request_id,v_actor
  ) returning id into v_id;

  perform public.write_compensation_event(
    p_employee_id,null,v_id,'assignment_draft_created',v_actor,null,p_request_id,'{}'::jsonb,
    jsonb_build_object('payroll_schedule_id',p_payroll_schedule_id,'effective_from',p_effective_from,'status','draft')
  );
  return v_id;
exception when check_violation then
  raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_INVALID';
end;
$$;

create or replace function public.update_schedule_assignment_draft(
  p_assignment_id uuid,
  p_expected_version integer,
  p_payroll_schedule_id uuid,
  p_effective_from date,
  p_change_reason text,
  p_override_mid_period boolean,
  p_override_reason text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_payroll_schedule_assignments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_change_reason,'')), '');
  v_override_reason text := nullif(btrim(coalesce(p_override_reason,'')), '');
  v_company_date date := public.company_attendance_date(now());
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.employee_payroll_schedule_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_NOT_FOUND'; end if;
  if v_row.status not in ('draft','rejected') then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if not exists (select 1 from public.payroll_schedules where id=p_payroll_schedule_id and is_active) then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_NOT_FOUND';
  end if;
  if p_effective_from < v_company_date and v_reason is null then
    raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED';
  end if;
  if coalesce(p_override_mid_period,false) and v_override_reason is null then
    raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_MID_PERIOD';
  end if;

  update public.employee_payroll_schedule_assignments set
    payroll_schedule_id=p_payroll_schedule_id,effective_from=p_effective_from,effective_to=null,
    status='draft',change_reason=v_reason,override_mid_period=coalesce(p_override_mid_period,false),
    override_reason=case when coalesce(p_override_mid_period,false) then v_override_reason else null end,
    rejected_by=null,rejected_at=null,rejection_reason=null,version=version+1,updated_at=now()
  where id=p_assignment_id;

  perform public.write_compensation_event(
    v_row.employee_id,null,p_assignment_id,'assignment_draft_updated',v_actor,null,p_request_id,
    jsonb_build_object('payroll_schedule_id',v_row.payroll_schedule_id,'effective_from',v_row.effective_from,'status',v_row.status),
    jsonb_build_object('payroll_schedule_id',p_payroll_schedule_id,'effective_from',p_effective_from,'status','draft')
  );
  return p_expected_version+1;
exception when check_violation then
  raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_INVALID';
end;
$$;

create or replace function public.submit_schedule_assignment(
  p_assignment_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_payroll_schedule_assignments%rowtype;
  v_version integer;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.employee_payroll_schedule_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_NOT_FOUND'; end if;
  if v_row.status not in ('draft','rejected') then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if v_row.effective_from < public.company_attendance_date(now()) and nullif(btrim(coalesce(v_row.change_reason,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_BACKDATED_REASON_REQUIRED';
  end if;
  update public.employee_payroll_schedule_assignments set
    status='pending_approval',submitted_by=v_actor,submitted_at=now(),version=version+1,updated_at=now()
  where id=p_assignment_id returning version into v_version;
  perform public.write_compensation_event(
    v_row.employee_id,null,p_assignment_id,'assignment_submitted',v_actor,null,p_request_id,
    jsonb_build_object('status',v_row.status),
    jsonb_build_object('payroll_schedule_id',v_row.payroll_schedule_id,'effective_from',v_row.effective_from,'status','pending_approval')
  );
  perform public.notify_payroll_super_admins(
    'schedule_assignment_approval_pending','Payroll schedule approval required',
    'A payroll schedule assignment is waiting for approval.','payroll_schedule_assignment',p_assignment_id,
    'assignment:'||p_assignment_id::text,v_row.employee_id,
    jsonb_build_object('employee_id',v_row.employee_id,'request_id',p_assignment_id,'schedule_id',v_row.payroll_schedule_id,'effective_from',v_row.effective_from,'status','pending_approval'),
    '/payroll/approvals',p_request_id
  );
  return v_version;
end;
$$;

create or replace function public.approve_schedule_assignment(
  p_assignment_id uuid,
  p_expected_version integer,
  p_mid_period_confirmation boolean,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_payroll_schedule_assignments%rowtype;
  v_prior public.employee_payroll_schedule_assignments%rowtype;
  v_mid_period boolean := false;
  v_version integer;
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  perform 1 from public.employees where id=(select employee_id from public.employee_payroll_schedule_assignments where id=p_assignment_id) for update;
  select * into v_row from public.employee_payroll_schedule_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_NOT_FOUND'; end if;
  if v_row.status <> 'pending_approval' then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if not exists (select 1 from public.payroll_schedules where id=v_row.payroll_schedule_id and is_active) then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_NOT_FOUND';
  end if;

  select exists(
    select 1 from public.payroll_periods
    where payroll_schedule_id=v_row.payroll_schedule_id
      and v_row.effective_from > period_start
      and v_row.effective_from <= period_end
  ) into v_mid_period;
  if v_mid_period and (
    not v_row.override_mid_period
    or nullif(btrim(coalesce(v_row.override_reason,'')),'') is null
    or not coalesce(p_mid_period_confirmation,false)
  ) then raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_MID_PERIOD'; end if;

  perform set_config('app.payroll_workflow','on',true);
  for v_prior in
    select * from public.employee_payroll_schedule_assignments
    where employee_id=v_row.employee_id and status='approved' and id<>v_row.id
    order by effective_from for update
  loop
    if v_prior.effective_from < v_row.effective_from then
      update public.employee_payroll_schedule_assignments set
        effective_to=v_row.effective_from-1,status='superseded',version=version+1,updated_at=now()
      where id=v_prior.id;
    else
      update public.employee_payroll_schedule_assignments set
        status='superseded',version=version+1,updated_at=now()
      where id=v_prior.id;
    end if;
    perform public.write_compensation_event(
      v_prior.employee_id,null,v_prior.id,'assignment_superseded',v_actor,null,p_request_id,
      jsonb_build_object('status','approved','effective_from',v_prior.effective_from),
      jsonb_build_object('status','superseded','effective_to',case when v_prior.effective_from < v_row.effective_from then v_row.effective_from-1 else v_prior.effective_to end)
    );
  end loop;

  update public.employee_payroll_schedule_assignments set
    status='approved',effective_to=null,approved_by=v_actor,approved_at=now(),
    rejected_by=null,rejected_at=null,rejection_reason=null,version=version+1,updated_at=now()
  where id=p_assignment_id returning version into v_version;

  perform public.write_compensation_event(
    v_row.employee_id,null,p_assignment_id,'assignment_approved',v_actor,null,p_request_id,
    jsonb_build_object('status','pending_approval'),
    jsonb_build_object('payroll_schedule_id',v_row.payroll_schedule_id,'effective_from',v_row.effective_from,'status','approved')
  );
  perform public.notify_payroll_employee(
    v_row.employee_id,'schedule_assignment_approved','Payroll schedule approved',
    'Your current payroll schedule information is available.','payroll_schedule_assignment',p_assignment_id,
    'assignment-approved:'||p_assignment_id::text,
    jsonb_build_object('employee_id',v_row.employee_id,'request_id',p_assignment_id,'schedule_id',v_row.payroll_schedule_id,'effective_from',v_row.effective_from,'status','approved'),
    '/me/compensation',p_request_id
  );
  return v_version;
exception when exclusion_violation then
  raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_OVERLAP';
end;
$$;

create or replace function public.reject_schedule_assignment(
  p_assignment_id uuid,
  p_expected_version integer,
  p_rejection_reason text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.employee_payroll_schedule_assignments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason,'')), '');
  v_version integer;
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_INVALID'; end if;
  select * into v_row from public.employee_payroll_schedule_assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_ASSIGNMENT_NOT_FOUND'; end if;
  if v_row.status <> 'pending_approval' then raise exception using errcode='P0001', message='PAYROLL_REQUEST_STATE_INVALID'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  update public.employee_payroll_schedule_assignments set
    status='rejected',rejected_by=v_actor,rejected_at=now(),rejection_reason=v_reason,
    version=version+1,updated_at=now()
  where id=p_assignment_id returning version into v_version;
  perform public.write_compensation_event(
    v_row.employee_id,null,p_assignment_id,'assignment_rejected',v_actor,null,p_request_id,
    jsonb_build_object('status','pending_approval'),jsonb_build_object('status','rejected')
  );
  perform public.notify_payroll_employee(
    v_row.employee_id,'schedule_assignment_rejected','Payroll schedule needs revision',
    'A payroll schedule request was returned to HR for revision.','payroll_schedule_assignment',p_assignment_id,
    'assignment-rejected:'||p_assignment_id::text,
    jsonb_build_object('employee_id',v_row.employee_id,'request_id',p_assignment_id,'schedule_id',v_row.payroll_schedule_id,'effective_from',v_row.effective_from,'status','rejected'),
    '/me/compensation',p_request_id
  );
  return v_version;
end;
$$;

-- Payroll schedule administration and period generation.
create or replace function public.create_payroll_schedule(
  p_name text,
  p_code text,
  p_schedule_type public.payroll_schedule_type,
  p_anchor_date date,
  p_first_period_end_day integer,
  p_cutoff_offset_days integer,
  p_payment_offset_days integer,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_settings public.payroll_settings%rowtype;
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name,'')), '');
  v_code text := upper(regexp_replace(btrim(coalesce(p_code,'')), '\s+', '-', 'g'));
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if p_request_id is null then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID'; end if;
  select * into v_settings from public.payroll_settings where id=1;
  begin
    insert into public.payroll_schedules(
      name,code,schedule_type,currency_code,timezone,anchor_date,first_period_end_day,
      cutoff_offset_days,payment_offset_days,created_by,updated_by
    ) values (
      v_name,v_code,p_schedule_type,v_settings.default_currency_code,v_settings.payroll_timezone,
      p_anchor_date,p_first_period_end_day,p_cutoff_offset_days,p_payment_offset_days,v_actor,v_actor
    ) returning id into v_id;
  exception when unique_violation or check_violation then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID';
  end;
  return v_id;
end;
$$;

create or replace function public.update_payroll_schedule(
  p_schedule_id uuid,
  p_expected_version integer,
  p_name text,
  p_code text,
  p_anchor_date date,
  p_first_period_end_day integer,
  p_cutoff_offset_days integer,
  p_payment_offset_days integer,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.payroll_schedules%rowtype;
  v_version integer;
  v_name text := nullif(btrim(coalesce(p_name,'')), '');
  v_code text := upper(regexp_replace(btrim(coalesce(p_code,'')), '\s+', '-', 'g'));
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.payroll_schedules where id=p_schedule_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_NOT_FOUND'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  begin
    update public.payroll_schedules set
      name=v_name,code=v_code,anchor_date=p_anchor_date,first_period_end_day=p_first_period_end_day,
      cutoff_offset_days=p_cutoff_offset_days,payment_offset_days=p_payment_offset_days,
      updated_by=v_actor,updated_at=now(),version=version+1
    where id=p_schedule_id returning version into v_version;
  exception when unique_violation or check_violation then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID';
  end;
  return v_version;
end;
$$;

create or replace function public.set_payroll_schedule_active(
  p_schedule_id uuid,
  p_expected_version integer,
  p_is_active boolean,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.payroll_schedules%rowtype;
  v_version integer;
  v_company_date date := public.company_attendance_date(now());
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.payroll_schedules where id=p_schedule_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_NOT_FOUND'; end if;
  if v_row.version <> p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if not p_is_active and exists(
    select 1 from public.employee_payroll_schedule_assignments
    where payroll_schedule_id=p_schedule_id and status='approved'
      and coalesce(effective_to,'infinity'::date) >= v_company_date
  ) then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_IN_USE'; end if;
  begin
    update public.payroll_schedules set
      is_active=p_is_active,updated_by=v_actor,updated_at=now(),version=version+1
    where id=p_schedule_id returning version into v_version;
  exception when unique_violation then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID';
  end;
  return v_version;
end;
$$;

create or replace function public.is_payroll_business_day(p_date date)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_date is not null
    and extract(isodow from p_date) between 1 and 5
    and not exists(select 1 from public.resolve_active_holiday(p_date));
$$;

create or replace function public.adjust_to_previous_payroll_business_day(p_date date)
returns date
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_date date := p_date;
  v_attempts integer := 0;
begin
  if v_date is null then return null; end if;
  while not public.is_payroll_business_day(v_date) loop
    v_date := v_date - 1;
    v_attempts := v_attempts + 1;
    if v_attempts > 31 then raise exception using errcode='P0001', message='PAYROLL_GENERATION_FAILED'; end if;
  end loop;
  return v_date;
end;
$$;

create or replace function public.payroll_period_code(
  p_type public.payroll_schedule_type,
  p_start date,
  p_end date,
  p_sequence integer
) returns text
language sql
immutable
security definer
set search_path = pg_catalog, public
as $$
  select case p_type
    when 'weekly' then to_char(p_start,'YYYY') || '-W-' || to_char(p_start,'MMDD')
    when 'biweekly' then to_char(p_start,'YYYY') || '-BW-' || to_char(p_start,'MMDD')
    when 'semi_monthly' then to_char(p_start,'YYYY') || '-SM-' || to_char(p_start,'MM') || case when extract(day from p_start)=1 then 'A' else 'B' end
    else to_char(p_start,'YYYY') || '-M-' || to_char(p_start,'MM')
  end;
$$;

create or replace function public.preview_payroll_schedule_periods_internal(
  p_schedule public.payroll_schedules,
  p_from date,
  p_through date
) returns table(
  period_code text,
  period_sequence integer,
  period_start date,
  period_end date,
  cutoff_date date,
  payment_date date,
  original_cutoff_date date,
  original_payment_date date,
  cutoff_adjusted boolean,
  payment_adjusted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_start date;
  v_end date;
  v_month_start date;
  v_month_end date;
  v_first_end date;
  v_days integer;
  v_offset integer;
  v_sequence integer;
  v_original_cutoff date;
  v_original_payment date;
begin
  if p_from is null or p_through is null or p_from > p_through then
    raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID';
  end if;

  if p_schedule.schedule_type in ('weekly','biweekly') then
    v_days := case when p_schedule.schedule_type='weekly' then 7 else 14 end;
    if p_schedule.anchor_date is null then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID'; end if;
    v_offset := floor(((p_from - p_schedule.anchor_date)::numeric) / v_days)::integer;
    v_start := p_schedule.anchor_date + (v_offset * v_days);
    while v_start <= p_through loop
      v_end := v_start + (v_days - 1);
      v_sequence := greatest(1, floor(((v_start - date '2000-01-03')::numeric) / v_days)::integer + 1);
      v_original_cutoff := v_end + p_schedule.cutoff_offset_days;
      v_original_payment := v_end + p_schedule.payment_offset_days;
      period_start := v_start;
      period_end := v_end;
      period_sequence := v_sequence;
      period_code := public.payroll_period_code(p_schedule.schedule_type,v_start,v_end,v_sequence);
      original_cutoff_date := v_original_cutoff;
      original_payment_date := v_original_payment;
      cutoff_date := public.adjust_to_previous_payroll_business_day(v_original_cutoff);
      payment_date := public.adjust_to_previous_payroll_business_day(v_original_payment);
      cutoff_adjusted := cutoff_date <> original_cutoff_date;
      payment_adjusted := payment_date <> original_payment_date;
      return next;
      v_start := v_start + v_days;
    end loop;
  elsif p_schedule.schedule_type='semi_monthly' then
    v_month_start := date_trunc('month',p_from)::date;
    while v_month_start <= p_through loop
      v_month_end := (v_month_start + interval '1 month - 1 day')::date;
      v_first_end := least(v_month_start + (coalesce(p_schedule.first_period_end_day,15)-1), v_month_end);
      for v_offset in 0..1 loop
        if v_offset=0 then v_start:=v_month_start; v_end:=v_first_end;
        else v_start:=v_first_end+1; v_end:=v_month_end; end if;
        if v_start <= p_through and v_end >= p_from then
          v_sequence := (extract(year from v_start)::integer-2000)*24 + (extract(month from v_start)::integer-1)*2 + v_offset + 1;
          v_original_cutoff := v_end + p_schedule.cutoff_offset_days;
          v_original_payment := v_end + p_schedule.payment_offset_days;
          period_start:=v_start; period_end:=v_end; period_sequence:=v_sequence;
          period_code:=public.payroll_period_code(p_schedule.schedule_type,v_start,v_end,v_sequence);
          original_cutoff_date:=v_original_cutoff; original_payment_date:=v_original_payment;
          cutoff_date:=public.adjust_to_previous_payroll_business_day(v_original_cutoff);
          payment_date:=public.adjust_to_previous_payroll_business_day(v_original_payment);
          cutoff_adjusted:=cutoff_date<>original_cutoff_date; payment_adjusted:=payment_date<>original_payment_date;
          return next;
        end if;
      end loop;
      v_month_start := (v_month_start + interval '1 month')::date;
    end loop;
  else
    v_month_start := date_trunc('month',p_from)::date;
    while v_month_start <= p_through loop
      v_month_end := (v_month_start + interval '1 month - 1 day')::date;
      v_sequence := (extract(year from v_month_start)::integer-2000)*12 + extract(month from v_month_start)::integer;
      v_original_cutoff := v_month_end + p_schedule.cutoff_offset_days;
      v_original_payment := v_month_end + p_schedule.payment_offset_days;
      period_start:=v_month_start; period_end:=v_month_end; period_sequence:=v_sequence;
      period_code:=public.payroll_period_code(p_schedule.schedule_type,v_month_start,v_month_end,v_sequence);
      original_cutoff_date:=v_original_cutoff; original_payment_date:=v_original_payment;
      cutoff_date:=public.adjust_to_previous_payroll_business_day(v_original_cutoff);
      payment_date:=public.adjust_to_previous_payroll_business_day(v_original_payment);
      cutoff_adjusted:=cutoff_date<>original_cutoff_date; payment_adjusted:=payment_date<>original_payment_date;
      return next;
      v_month_start := (v_month_start + interval '1 month')::date;
    end loop;
  end if;
end;
$$;

create or replace function public.preview_payroll_schedule_periods(
  p_schedule_type public.payroll_schedule_type,
  p_anchor_date date,
  p_first_period_end_day integer,
  p_cutoff_offset_days integer,
  p_payment_offset_days integer,
  p_from date,
  p_count integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule public.payroll_schedules%rowtype;
  v_through date;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if p_count is null or p_count < 1 or p_count > 36 then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_INVALID'; end if;
  v_schedule.schedule_type:=p_schedule_type;
  v_schedule.anchor_date:=p_anchor_date;
  v_schedule.first_period_end_day:=p_first_period_end_day;
  v_schedule.cutoff_offset_days:=coalesce(p_cutoff_offset_days,0);
  v_schedule.payment_offset_days:=coalesce(p_payment_offset_days,5);
  v_through := (p_from + interval '3 years')::date;
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_code',x.period_code,'period_sequence',x.period_sequence,'period_start',x.period_start,
    'period_end',x.period_end,'cutoff_date',x.cutoff_date,'payment_date',x.payment_date,
    'original_cutoff_date',x.original_cutoff_date,'original_payment_date',x.original_payment_date,
    'cutoff_adjusted',x.cutoff_adjusted,'payment_adjusted',x.payment_adjusted
  ) order by x.period_start),'[]'::jsonb) into v_result
  from (select * from public.preview_payroll_schedule_periods_internal(v_schedule,p_from,v_through) order by period_start limit p_count) x;
  return v_result;
end;
$$;

create or replace function public.notify_payroll_admins(
  p_type_code text,
  p_title text,
  p_body text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_key text,
  p_safe_context jsonb,
  p_action_url text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user record; v_count integer:=0;
begin
  perform public.assert_safe_notification_payload(coalesce(p_safe_context,'{}'::jsonb));
  for v_user in select id from public.profiles where role in ('hr_admin','super_admin') loop
    perform public.upsert_safe_notification(
      v_user.id,p_type_code,p_title,p_body,'payroll','normal',p_resource_type,p_resource_id,
      p_resource_key||':'||v_user.id::text,null,coalesce(p_safe_context,'{}'::jsonb),p_action_url,
      0,now(),3650,p_request_id
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.ensure_payroll_period_horizon(
  p_source text default 'scheduled',
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_settings public.payroll_settings%rowtype;
  v_schedule public.payroll_schedules%rowtype;
  v_preview record;
  v_period_id uuid;
  v_company_date date := public.company_attendance_date(now());
  v_through date;
  v_schedules integer:=0;
  v_created integer:=0;
  v_adjusted integer:=0;
begin
  if p_source not in ('scheduled','manual') then raise exception using errcode='P0001', message='PAYROLL_GENERATION_FAILED'; end if;
  if p_source='scheduled' and v_actor is not null then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if p_source='manual' and (v_actor is null or not public.is_super_admin()) then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('payroll-period-generation', 0)) then
    raise exception using errcode='P0001', message='PAYROLL_GENERATION_ALREADY_RUNNING';
  end if;
  select * into v_settings from public.payroll_settings where id=1 for update;
  if not v_settings.generation_enabled then
    return jsonb_build_object('status','disabled','schedulesProcessed',0,'periodsCreated',0,'adjustedDates',0);
  end if;
  v_through := (v_company_date + make_interval(months=>v_settings.generation_horizon_months))::date;
  for v_schedule in select * from public.payroll_schedules where is_active order by created_at,id loop
    v_schedules:=v_schedules+1;
    for v_preview in select * from public.preview_payroll_schedule_periods_internal(v_schedule,v_company_date,v_through) loop
      v_period_id:=null;
      insert into public.payroll_periods(
        payroll_schedule_id,period_code,period_sequence,period_start,period_end,cutoff_date,payment_date,
        original_cutoff_date,original_payment_date
      ) values (
        v_schedule.id,v_preview.period_code,v_preview.period_sequence,v_preview.period_start,v_preview.period_end,
        v_preview.cutoff_date,v_preview.payment_date,v_preview.original_cutoff_date,v_preview.original_payment_date
      ) on conflict do nothing returning id into v_period_id;
      if v_period_id is not null then
        v_created:=v_created+1;
        perform public.write_payroll_period_event(
          v_period_id,'generated',null,'draft',v_actor,null,p_request_id,
          jsonb_build_object('schedule_id',v_schedule.id,'period_start',v_preview.period_start,'period_end',v_preview.period_end,'status','draft')
        );
        if v_preview.cutoff_adjusted or v_preview.payment_adjusted then
          v_adjusted:=v_adjusted+1;
          perform public.write_payroll_period_event(
            v_period_id,'date_adjusted','draft','draft',v_actor,null,p_request_id,
            jsonb_build_object('schedule_id',v_schedule.id,'period_id',v_period_id,'status','draft')
          );
        end if;
      end if;
    end loop;
  end loop;
  if v_created>0 then
    perform public.notify_payroll_admins(
      'payroll_period_ready','Payroll periods ready',
      'New draft payroll periods are ready for review.','payroll_period',null,
      'payroll-generation:'||v_company_date::text,
      jsonb_build_object('status','draft'),'/payroll/periods',p_request_id
    );
  end if;
  return jsonb_build_object('status','succeeded','schedulesProcessed',v_schedules,'periodsCreated',v_created,'adjustedDates',v_adjusted);
exception when sqlstate 'P0001' then raise;
when others then raise exception using errcode='P0001', message='PAYROLL_GENERATION_FAILED';
end;
$$;

create or replace function public.transition_payroll_period(
  p_period_id uuid,
  p_expected_version integer,
  p_to_status public.payroll_period_status,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.payroll_periods%rowtype;
  v_allowed boolean:=false;
  v_event public.payroll_period_event_type;
  v_version integer;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_row from public.payroll_periods where id=p_period_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='P0001', message='PAYROLL_PERIOD_VERSION_CONFLICT'; end if;
  v_allowed := (v_row.status='draft' and p_to_status='open')
    or (v_row.status='open' and p_to_status='under_review')
    or (v_row.status='under_review' and p_to_status='open')
    or (v_row.status='under_review' and p_to_status='approved' and public.is_super_admin())
    or (v_row.status='approved' and p_to_status='locked' and public.is_super_admin());
  if not v_allowed then raise exception using errcode='P0001', message='PAYROLL_PERIOD_TRANSITION_INVALID'; end if;
  if p_to_status in ('approved','locked') and not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  v_event := case
    when p_to_status='open' and v_row.status='draft' then 'opened'
    when p_to_status='open' then 'returned_to_open'
    when p_to_status='under_review' then 'submitted_for_review'
    when p_to_status='approved' then 'approved'
    else 'locked' end;
  update public.payroll_periods set
    status=p_to_status,version=version+1,updated_at=now(),
    opened_at=case when p_to_status='open' and opened_at is null then now() else opened_at end,
    submitted_for_review_at=case when p_to_status='under_review' then now() when p_to_status='open' then null else submitted_for_review_at end,
    approved_at=case when p_to_status='approved' then now() else approved_at end,
    approved_by=case when p_to_status='approved' then v_actor else approved_by end,
    locked_at=case when p_to_status='locked' then now() else locked_at end,
    locked_by=case when p_to_status='locked' then v_actor else locked_by end
  where id=p_period_id returning version into v_version;
  perform public.write_payroll_period_event(
    p_period_id,v_event,v_row.status,p_to_status,v_actor,null,p_request_id,
    jsonb_build_object('period_id',p_period_id,'schedule_id',v_row.payroll_schedule_id,'status',p_to_status)
  );
  if p_to_status='under_review' then
    perform public.notify_payroll_super_admins(
      'payroll_period_approval_pending','Payroll period approval required',
      'A payroll period is waiting for approval.','payroll_period',p_period_id,
      'period-approval:'||p_period_id::text,null,
      jsonb_build_object('period_id',p_period_id,'schedule_id',v_row.payroll_schedule_id,'status','under_review'),
      '/payroll/periods/'||p_period_id::text,p_request_id
    );
  end if;
  return v_version;
end;
$$;

create or replace function public.reopen_payroll_period(
  p_period_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.payroll_periods%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')), '');
  v_version integer;
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001', message='PAYROLL_PERIOD_REOPEN_REASON_REQUIRED'; end if;
  select * into v_row from public.payroll_periods where id=p_period_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='P0001', message='PAYROLL_PERIOD_VERSION_CONFLICT'; end if;
  if v_row.status<>'locked' then raise exception using errcode='P0001', message='PAYROLL_PERIOD_TRANSITION_INVALID'; end if;
  update public.payroll_periods set
    status='under_review',requires_recalculation=true,version=version+1,updated_at=now(),
    reopened_at=now(),reopened_by=v_actor,submitted_for_review_at=now()
  where id=p_period_id returning version into v_version;
  perform public.write_payroll_period_event(
    p_period_id,'reopened','locked','under_review',v_actor,v_reason,p_request_id,
    jsonb_build_object('period_id',p_period_id,'schedule_id',v_row.payroll_schedule_id,'status','under_review')
  );
  perform public.notify_payroll_admins(
    'payroll_period_reopened','Payroll period reopened',
    'A locked payroll period was reopened for review.','payroll_period',p_period_id,
    'period-reopened:'||p_period_id::text,
    jsonb_build_object('period_id',p_period_id,'schedule_id',v_row.payroll_schedule_id,'status','under_review'),
    '/payroll/periods/'||p_period_id::text,p_request_id
  );
  return v_version;
end;
$$;

-- Safe JSON projection helpers.
create or replace function public.payroll_employee_identity_json(p_employee_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id',e.id,
    'employee_number',e.employee_number,
    'full_name',btrim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')),
    'work_email',e.work_email
  )
  from public.employees e where e.id=p_employee_id;
$$;

create or replace function public.payroll_compensation_record_json(
  p_record_id uuid,
  p_include_private boolean default false
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',r.id,'employee_id',r.employee_id,'compensation_type',r.compensation_type,
    'monthly_salary',r.monthly_salary,'hourly_rate',r.hourly_rate,'currency_code',r.currency_code,
    'standard_hours_per_day',r.standard_hours_per_day,'standard_hours_per_week',r.standard_hours_per_week,
    'effective_from',r.effective_from,'effective_to',r.effective_to,'status',r.status,
    'change_reason',case when p_include_private then r.change_reason else null end,
    'is_backdated',r.is_backdated,'version',r.version,'submitted_at',r.submitted_at,
    'approved_at',r.approved_at,'rejected_at',r.rejected_at,
    'rejection_reason',case when p_include_private then r.rejection_reason else null end,
    'created_at',r.created_at,'updated_at',r.updated_at
  ))
  from public.employee_compensation_records r where r.id=p_record_id;
$$;

create or replace function public.payroll_assignment_json(
  p_assignment_id uuid,
  p_include_private boolean default false
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',a.id,'employee_id',a.employee_id,'payroll_schedule_id',a.payroll_schedule_id,
    'payroll_schedule_name',s.name,'payroll_schedule_type',s.schedule_type,
    'effective_from',a.effective_from,'effective_to',a.effective_to,'status',a.status,
    'change_reason',case when p_include_private then a.change_reason else null end,
    'override_mid_period',a.override_mid_period,
    'override_reason',case when p_include_private then a.override_reason else null end,
    'version',a.version,'submitted_at',a.submitted_at,'approved_at',a.approved_at,
    'rejected_at',a.rejected_at,
    'rejection_reason',case when p_include_private then a.rejection_reason else null end,
    'created_at',a.created_at,'updated_at',a.updated_at
  ))
  from public.employee_payroll_schedule_assignments a
  join public.payroll_schedules s on s.id=a.payroll_schedule_id
  where a.id=p_assignment_id;
$$;

create or replace function public.get_own_compensation()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid:=public.current_employee_id();
  v_company_date date:=public.company_attendance_date(now());
  v_compensation_id uuid;
  v_assignment_id uuid;
  v_schedule_id uuid;
  v_next_payment date;
  v_compensation jsonb;
  v_assignment jsonb;
begin
  if auth.uid() is null or v_employee_id is null then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select id into v_compensation_id from public.employee_compensation_records
  where employee_id=v_employee_id and status='approved' and effective_from<=v_company_date
    and (effective_to is null or effective_to>=v_company_date)
  order by effective_from desc limit 1;
  if v_compensation_id is not null then
    select jsonb_build_object(
      'compensation_type',r.compensation_type,'monthly_salary',r.monthly_salary,'hourly_rate',r.hourly_rate,
      'currency_code',r.currency_code,'standard_hours_per_day',r.standard_hours_per_day,
      'standard_hours_per_week',r.standard_hours_per_week,'effective_from',r.effective_from
    ) into v_compensation from public.employee_compensation_records r where r.id=v_compensation_id;
  end if;
  select id,payroll_schedule_id into v_assignment_id,v_schedule_id
  from public.employee_payroll_schedule_assignments
  where employee_id=v_employee_id and status='approved' and effective_from<=v_company_date
    and (effective_to is null or effective_to>=v_company_date)
  order by effective_from desc limit 1;
  if v_assignment_id is not null then
    select jsonb_build_object(
      'payroll_schedule_name',s.name,'payroll_schedule_type',s.schedule_type,'effective_from',a.effective_from
    ) into v_assignment
    from public.employee_payroll_schedule_assignments a
    join public.payroll_schedules s on s.id=a.payroll_schedule_id
    where a.id=v_assignment_id;
    select payment_date into v_next_payment from public.payroll_periods
    where payroll_schedule_id=v_schedule_id and payment_date>=v_company_date
    order by payment_date limit 1;
  end if;
  return jsonb_build_object(
    'company_date',v_company_date,'current_compensation',v_compensation,
    'current_schedule',v_assignment,'next_payment_date',v_next_payment
  );
end;
$$;

create or replace function public.get_payroll_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.app_role:=public.current_user_role();
  v_company_date date:=public.company_attendance_date(now());
  v_settings jsonb;
  v_missing jsonb:='[]'::jsonb;
  v_active_schedules integer:=0;
  v_draft_periods integer:=0;
  v_review integer:=0;
  v_pending integer:=0;
  v_missing_comp integer:=0;
  v_missing_schedule integer:=0;
  v_backdated integer:=0;
  v_reopened integer:=0;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select jsonb_build_object(
    'default_currency_code',default_currency_code,'payroll_timezone',payroll_timezone,
    'generation_enabled',generation_enabled,'generation_horizon_months',generation_horizon_months,
    'version',version,'updated_at',updated_at
  ) into v_settings from public.payroll_settings where id=1;
  if v_role='employee' then
    return jsonb_build_object(
      'role','employee','settings',v_settings,'active_schedule_count',0,'upcoming_draft_period_count',0,
      'periods_requiring_review_count',0,'pending_approval_count',0,
      'employees_missing_compensation_count',0,'employees_missing_schedule_count',0,
      'backdated_warning_count',0,'recently_reopened_count',0,
      'own_compensation',public.get_own_compensation(),'missing_employees','[]'::jsonb
    );
  end if;
  if not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select count(*) into v_active_schedules from public.payroll_schedules where is_active;
  select count(*) into v_draft_periods from public.payroll_periods where status='draft' and period_start<=v_company_date+90;
  select count(*) into v_review from public.payroll_periods where status in ('open','under_review');
  select (select count(*) from public.employee_compensation_records where status='pending_approval')
       + (select count(*) from public.employee_payroll_schedule_assignments where status='pending_approval') into v_pending;
  select count(*) into v_missing_comp from public.employees e
  where e.archived_at is null and e.employment_status in ('active','probation','on_leave') and not exists(
    select 1 from public.employee_compensation_records r where r.employee_id=e.id and r.status='approved'
      and r.effective_from<=v_company_date and (r.effective_to is null or r.effective_to>=v_company_date)
  );
  select count(*) into v_missing_schedule from public.employees e
  where e.archived_at is null and e.employment_status in ('active','probation','on_leave') and not exists(
    select 1 from public.employee_payroll_schedule_assignments a where a.employee_id=e.id and a.status='approved'
      and a.effective_from<=v_company_date and (a.effective_to is null or a.effective_to>=v_company_date)
  );
  select (select count(*) from public.employee_compensation_records where status='pending_approval' and is_backdated)
       + (select count(*) from public.employee_payroll_schedule_assignments where status='pending_approval' and effective_from<v_company_date) into v_backdated;
  select count(*) into v_reopened from public.payroll_period_events where event_type='reopened' and created_at>=now()-interval '30 days';
  select coalesce(jsonb_agg(public.payroll_employee_identity_json(x.id)),'[]'::jsonb) into v_missing
  from (
    select e.id from public.employees e
    where e.archived_at is null and e.employment_status in ('active','probation','on_leave') and (
      not exists(select 1 from public.employee_compensation_records r where r.employee_id=e.id and r.status='approved' and r.effective_from<=v_company_date and (r.effective_to is null or r.effective_to>=v_company_date))
      or not exists(select 1 from public.employee_payroll_schedule_assignments a where a.employee_id=e.id and a.status='approved' and a.effective_from<=v_company_date and (a.effective_to is null or a.effective_to>=v_company_date))
    ) order by e.last_name,e.first_name limit 10
  ) x;
  return jsonb_build_object(
    'role',v_role::text,'settings',v_settings,'active_schedule_count',v_active_schedules,
    'upcoming_draft_period_count',v_draft_periods,'periods_requiring_review_count',v_review,
    'pending_approval_count',v_pending,'employees_missing_compensation_count',v_missing_comp,
    'employees_missing_schedule_count',v_missing_schedule,'backdated_warning_count',v_backdated,
    'recently_reopened_count',v_reopened,'own_compensation',null,'missing_employees',v_missing
  );
end;
$$;

create or replace function public.list_payroll_schedules()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'code',s.code,'schedule_type',s.schedule_type,
    'currency_code',s.currency_code,'timezone',s.timezone,'anchor_date',s.anchor_date,
    'first_period_end_day',s.first_period_end_day,'cutoff_offset_days',s.cutoff_offset_days,
    'payment_offset_days',s.payment_offset_days,'business_day_adjustment',s.business_day_adjustment,
    'is_active',s.is_active,'version',s.version,'assigned_employee_count',coalesce(a.assigned_count,0),
    'next_period',case when p.id is null then null else jsonb_build_object(
      'period_code',p.period_code,'period_sequence',p.period_sequence,'period_start',p.period_start,
      'period_end',p.period_end,'cutoff_date',p.cutoff_date,'payment_date',p.payment_date,
      'original_cutoff_date',p.original_cutoff_date,'original_payment_date',p.original_payment_date,
      'cutoff_adjusted',p.cutoff_date<>p.original_cutoff_date,'payment_adjusted',p.payment_date<>p.original_payment_date
    ) end
  ) order by s.is_active desc,s.name),'[]'::jsonb) into v_result
  from public.payroll_schedules s
  left join lateral (
    select count(*)::integer assigned_count from public.employee_payroll_schedule_assignments x
    where x.payroll_schedule_id=s.id and x.status='approved'
      and coalesce(x.effective_to,'infinity'::date)>=public.company_attendance_date(now())
  ) a on true
  left join lateral (
    select * from public.payroll_periods x where x.payroll_schedule_id=s.id
      and x.period_end>=public.company_attendance_date(now()) order by x.period_start limit 1
  ) p on true;
  return v_result;
end;
$$;

create or replace function public.get_payroll_schedule_detail(p_schedule_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_schedule public.payroll_schedules%rowtype; v_result jsonb; v_upcoming jsonb; v_count integer;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_schedule from public.payroll_schedules where id=p_schedule_id;
  if not found then raise exception using errcode='P0001', message='PAYROLL_SCHEDULE_NOT_FOUND'; end if;
  select count(*) into v_count from public.employee_payroll_schedule_assignments
  where payroll_schedule_id=p_schedule_id and status='approved'
    and coalesce(effective_to,'infinity'::date)>=public.company_attendance_date(now());
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_code',p.period_code,'period_sequence',p.period_sequence,'period_start',p.period_start,
    'period_end',p.period_end,'cutoff_date',p.cutoff_date,'payment_date',p.payment_date,
    'original_cutoff_date',p.original_cutoff_date,'original_payment_date',p.original_payment_date,
    'cutoff_adjusted',p.cutoff_date<>p.original_cutoff_date,'payment_adjusted',p.payment_date<>p.original_payment_date
  ) order by p.period_start),'[]'::jsonb) into v_upcoming
  from (select * from public.payroll_periods where payroll_schedule_id=p_schedule_id
    and period_end>=public.company_attendance_date(now()) order by period_start limit 12) p;
  v_result:=jsonb_build_object(
    'id',v_schedule.id,'name',v_schedule.name,'code',v_schedule.code,'schedule_type',v_schedule.schedule_type,
    'currency_code',v_schedule.currency_code,'timezone',v_schedule.timezone,'anchor_date',v_schedule.anchor_date,
    'first_period_end_day',v_schedule.first_period_end_day,'cutoff_offset_days',v_schedule.cutoff_offset_days,
    'payment_offset_days',v_schedule.payment_offset_days,'business_day_adjustment',v_schedule.business_day_adjustment,
    'is_active',v_schedule.is_active,'version',v_schedule.version,'assigned_employee_count',v_count,
    'next_period',case when jsonb_array_length(v_upcoming)>0 then v_upcoming->0 else null end,
    'upcoming_periods',v_upcoming,'created_at',v_schedule.created_at,'updated_at',v_schedule.updated_at
  );
  return v_result;
end;
$$;

create or replace function public.list_payroll_periods(
  p_schedule_id uuid default null,
  p_status public.payroll_period_status default null,
  p_year integer default null,
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_items jsonb; v_total integer; v_page integer:=greatest(coalesce(p_page,1),1); v_size integer:=least(greatest(coalesce(p_page_size,25),1),100);
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select count(*) into v_total from public.payroll_periods p
  where (p_schedule_id is null or p.payroll_schedule_id=p_schedule_id)
    and (p_status is null or p.status=p_status)
    and (p_year is null or extract(year from p.period_start)::integer=p_year)
    and (p_from is null or p.period_end>=p_from)
    and (p_to is null or p.period_start<=p_to);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'payroll_schedule_id',x.payroll_schedule_id,'schedule_name',x.schedule_name,'schedule_code',x.schedule_code,
    'period_code',x.period_code,'period_sequence',x.period_sequence,'period_start',x.period_start,'period_end',x.period_end,
    'cutoff_date',x.cutoff_date,'payment_date',x.payment_date,'original_cutoff_date',x.original_cutoff_date,
    'original_payment_date',x.original_payment_date,'cutoff_adjusted',x.cutoff_date<>x.original_cutoff_date,
    'payment_adjusted',x.payment_date<>x.original_payment_date,'status',x.status,
    'requires_recalculation',x.requires_recalculation,'version',x.version
  ) order by x.period_start desc),'[]'::jsonb) into v_items
  from (
    select p.*,s.name schedule_name,s.code schedule_code from public.payroll_periods p
    join public.payroll_schedules s on s.id=p.payroll_schedule_id
    where (p_schedule_id is null or p.payroll_schedule_id=p_schedule_id)
      and (p_status is null or p.status=p_status)
      and (p_year is null or extract(year from p.period_start)::integer=p_year)
      and (p_from is null or p.period_end>=p_from)
      and (p_to is null or p.period_start<=p_to)
    order by p.period_start desc,p.id desc limit v_size offset (v_page-1)*v_size
  ) x;
  return jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'page_size',v_size);
end;
$$;

create or replace function public.get_payroll_period_detail(p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_row record; v_events jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select p.*,s.name schedule_name,s.code schedule_code into v_row
  from public.payroll_periods p join public.payroll_schedules s on s.id=p.payroll_schedule_id
  where p.id=p_period_id;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'event_type',e.event_type,'from_status',e.from_status,'to_status',e.to_status,
    'actor_user_id',e.actor_user_id,'actor_name',coalesce(pr.display_name,btrim(coalesce(pr.first_name,'')||' '||coalesce(pr.last_name,''))),
    'reason',e.reason,'metadata',e.metadata,'created_at',e.created_at
  ) order by e.created_at desc),'[]'::jsonb) into v_events
  from public.payroll_period_events e left join public.profiles pr on pr.id=e.actor_user_id
  where e.payroll_period_id=p_period_id;
  return jsonb_build_object(
    'id',v_row.id,'payroll_schedule_id',v_row.payroll_schedule_id,'schedule_name',v_row.schedule_name,'schedule_code',v_row.schedule_code,
    'period_code',v_row.period_code,'period_sequence',v_row.period_sequence,'period_start',v_row.period_start,'period_end',v_row.period_end,
    'cutoff_date',v_row.cutoff_date,'payment_date',v_row.payment_date,'original_cutoff_date',v_row.original_cutoff_date,
    'original_payment_date',v_row.original_payment_date,'cutoff_adjusted',v_row.cutoff_date<>v_row.original_cutoff_date,
    'payment_adjusted',v_row.payment_date<>v_row.original_payment_date,'status',v_row.status,
    'requires_recalculation',v_row.requires_recalculation,'version',v_row.version,'opened_at',v_row.opened_at,
    'submitted_for_review_at',v_row.submitted_for_review_at,'approved_at',v_row.approved_at,'approved_by',v_row.approved_by,
    'locked_at',v_row.locked_at,'locked_by',v_row.locked_by,'reopened_at',v_row.reopened_at,'reopened_by',v_row.reopened_by,
    'created_at',v_row.created_at,'updated_at',v_row.updated_at,'events',v_events
  );
end;
$$;

create or replace function public.get_employee_compensation_admin(p_employee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_date date:=public.company_attendance_date(now());
  v_employee jsonb;
  v_current_comp_id uuid;
  v_current_assignment_id uuid;
  v_schedule_id uuid;
  v_current_comp jsonb;
  v_current_assignment jsonb;
  v_future jsonb;
  v_requests jsonb;
  v_history jsonb;
  v_assignment_requests jsonb;
  v_assignment_history jsonb;
  v_events jsonb;
  v_active_schedules jsonb;
  v_suggested date;
  v_currency text;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select public.payroll_employee_identity_json(p_employee_id) into v_employee;
  if v_employee is null then raise exception using errcode='P0001', message='PAYROLL_COMPENSATION_NOT_FOUND'; end if;
  select default_currency_code into v_currency from public.payroll_settings where id=1;

  select id into v_current_comp_id from public.employee_compensation_records
  where employee_id=p_employee_id and status='approved' and effective_from<=v_company_date
    and (effective_to is null or effective_to>=v_company_date)
  order by effective_from desc limit 1;
  if v_current_comp_id is not null then v_current_comp:=public.payroll_compensation_record_json(v_current_comp_id,true); end if;

  select id,payroll_schedule_id into v_current_assignment_id,v_schedule_id
  from public.employee_payroll_schedule_assignments
  where employee_id=p_employee_id and status='approved' and effective_from<=v_company_date
    and (effective_to is null or effective_to>=v_company_date)
  order by effective_from desc limit 1;
  if v_current_assignment_id is not null then v_current_assignment:=public.payroll_assignment_json(v_current_assignment_id,true); end if;

  select coalesce(jsonb_agg(public.payroll_compensation_record_json(x.id,true) order by x.effective_from),'[]'::jsonb)
  into v_future from public.employee_compensation_records x
  where x.employee_id=p_employee_id and x.status='approved' and x.effective_from>v_company_date;
  select coalesce(jsonb_agg(public.payroll_compensation_record_json(x.id,true) order by x.created_at desc),'[]'::jsonb)
  into v_requests from public.employee_compensation_records x
  where x.employee_id=p_employee_id and x.status in ('draft','pending_approval','rejected');
  select coalesce(jsonb_agg(public.payroll_compensation_record_json(x.id,true) order by x.effective_from desc),'[]'::jsonb)
  into v_history from public.employee_compensation_records x
  where x.employee_id=p_employee_id and x.status in ('approved','superseded');

  select coalesce(jsonb_agg(public.payroll_assignment_json(x.id,true) order by x.created_at desc),'[]'::jsonb)
  into v_assignment_requests from public.employee_payroll_schedule_assignments x
  where x.employee_id=p_employee_id and x.status in ('draft','pending_approval','rejected');
  select coalesce(jsonb_agg(public.payroll_assignment_json(x.id,true) order by x.effective_from desc),'[]'::jsonb)
  into v_assignment_history from public.employee_payroll_schedule_assignments x
  where x.employee_id=p_employee_id and x.status in ('approved','superseded');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'event_type',e.event_type,'from_status',null,'to_status',null,
    'actor_user_id',e.actor_user_id,'actor_name',coalesce(pr.display_name,btrim(coalesce(pr.first_name,'')||' '||coalesce(pr.last_name,''))),
    'reason',e.reason,'metadata',e.new_values,'created_at',e.created_at
  ) order by e.created_at desc),'[]'::jsonb) into v_events
  from public.compensation_events e left join public.profiles pr on pr.id=e.actor_user_id
  where e.employee_id=p_employee_id;

  v_active_schedules:=public.list_payroll_schedules();
  if v_schedule_id is not null then
    select period_start into v_suggested from public.payroll_periods
    where payroll_schedule_id=v_schedule_id and period_start>v_company_date
    order by period_start limit 1;
  end if;
  v_suggested:=coalesce(v_suggested,v_company_date+1);

  return jsonb_build_object(
    'employee',v_employee,'currency_code',v_currency,'company_date',v_company_date,
    'current_compensation',v_current_comp,'current_assignment',v_current_assignment,
    'future_compensation',v_future,'requests',v_requests,'compensation_history',v_history,
    'assignment_requests',v_assignment_requests,'assignment_history',v_assignment_history,
    'audit_events',v_events,'active_schedules',v_active_schedules,'suggested_next_effective_date',v_suggested
  );
end;
$$;

create or replace function public.list_payroll_approvals()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_date date:=public.company_attendance_date(now());
  v_compensation jsonb;
  v_assignments jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() then raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','compensation','id',r.id,'employee',public.payroll_employee_identity_json(r.employee_id),
    'current_record',case when c.id is null then null else public.payroll_compensation_record_json(c.id,true) end,
    'proposed_record',public.payroll_compensation_record_json(r.id,true),
    'affected_period_count',(select count(*) from public.payroll_periods p where p.status in ('open','under_review') and p.period_end>=r.effective_from)
  ) order by r.submitted_at,r.id),'[]'::jsonb) into v_compensation
  from public.employee_compensation_records r
  left join lateral (
    select x.id from public.employee_compensation_records x
    where x.employee_id=r.employee_id and x.status='approved' and x.effective_from<=v_company_date
      and (x.effective_to is null or x.effective_to>=v_company_date)
    order by x.effective_from desc limit 1
  ) c on true
  where r.status='pending_approval';

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind','schedule_assignment','id',a.id,'employee',public.payroll_employee_identity_json(a.employee_id),
    'current_assignment',case when c.id is null then null else public.payroll_assignment_json(c.id,true) end,
    'proposed_assignment',public.payroll_assignment_json(a.id,true),
    'affected_period_count',(select count(*) from public.payroll_periods p where p.payroll_schedule_id=a.payroll_schedule_id and p.period_end>=a.effective_from),
    'mid_period_conflict',exists(select 1 from public.payroll_periods p where p.payroll_schedule_id=a.payroll_schedule_id and a.effective_from>p.period_start and a.effective_from<=p.period_end)
  ) order by a.submitted_at,a.id),'[]'::jsonb) into v_assignments
  from public.employee_payroll_schedule_assignments a
  left join lateral (
    select x.id from public.employee_payroll_schedule_assignments x
    where x.employee_id=a.employee_id and x.status='approved' and x.effective_from<=v_company_date
      and (x.effective_to is null or x.effective_to>=v_company_date)
    order by x.effective_from desc limit 1
  ) c on true
  where a.status='pending_approval';

  return jsonb_build_object('compensation',v_compensation,'assignments',v_assignments);
end;
$$;

-- Seed one default schedule only when no payroll schedule exists.
insert into public.payroll_schedules(
  name,code,schedule_type,currency_code,timezone,anchor_date,first_period_end_day,
  cutoff_offset_days,payment_offset_days,is_active
)
select 'Semi-monthly payroll','SM','semi_monthly',s.default_currency_code,s.payroll_timezone,
  null,15,0,5,true
from public.payroll_settings s
where s.id=1 and not exists(select 1 from public.payroll_schedules);

-- Internal functions are never executable directly by application roles.
revoke all on function public.notify_payroll_super_admins(text,text,text,text,uuid,text,uuid,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.notify_payroll_employee(uuid,text,text,text,text,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.notify_payroll_admins(text,text,text,text,uuid,text,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.is_payroll_business_day(date) from public,anon,authenticated;
revoke all on function public.adjust_to_previous_payroll_business_day(date) from public,anon,authenticated;
revoke all on function public.payroll_period_code(public.payroll_schedule_type,date,date,integer) from public,anon,authenticated;
revoke all on function public.preview_payroll_schedule_periods_internal(public.payroll_schedules,date,date) from public,anon,authenticated;
revoke all on function public.payroll_employee_identity_json(uuid) from public,anon,authenticated;
revoke all on function public.payroll_compensation_record_json(uuid,boolean) from public,anon,authenticated;
revoke all on function public.payroll_assignment_json(uuid,boolean) from public,anon,authenticated;

-- Public RPCs remain protected by explicit role checks.
revoke all on function public.create_compensation_draft(uuid,public.compensation_type,numeric,numeric,numeric,numeric,date,text,uuid) from public,anon;
grant execute on function public.create_compensation_draft(uuid,public.compensation_type,numeric,numeric,numeric,numeric,date,text,uuid) to authenticated;
revoke all on function public.update_compensation_draft(uuid,integer,public.compensation_type,numeric,numeric,numeric,numeric,date,text,uuid) from public,anon;
grant execute on function public.update_compensation_draft(uuid,integer,public.compensation_type,numeric,numeric,numeric,numeric,date,text,uuid) to authenticated;
revoke all on function public.submit_compensation_record(uuid,integer,uuid) from public,anon;
grant execute on function public.submit_compensation_record(uuid,integer,uuid) to authenticated;
revoke all on function public.approve_compensation_record(uuid,integer,boolean,uuid) from public,anon;
grant execute on function public.approve_compensation_record(uuid,integer,boolean,uuid) to authenticated;
revoke all on function public.reject_compensation_record(uuid,integer,text,uuid) from public,anon;
grant execute on function public.reject_compensation_record(uuid,integer,text,uuid) to authenticated;
revoke all on function public.create_schedule_assignment_draft(uuid,uuid,date,text,boolean,text,uuid) from public,anon;
grant execute on function public.create_schedule_assignment_draft(uuid,uuid,date,text,boolean,text,uuid) to authenticated;
revoke all on function public.update_schedule_assignment_draft(uuid,integer,uuid,date,text,boolean,text,uuid) from public,anon;
grant execute on function public.update_schedule_assignment_draft(uuid,integer,uuid,date,text,boolean,text,uuid) to authenticated;
revoke all on function public.submit_schedule_assignment(uuid,integer,uuid) from public,anon;
grant execute on function public.submit_schedule_assignment(uuid,integer,uuid) to authenticated;
revoke all on function public.approve_schedule_assignment(uuid,integer,boolean,uuid) from public,anon;
grant execute on function public.approve_schedule_assignment(uuid,integer,boolean,uuid) to authenticated;
revoke all on function public.reject_schedule_assignment(uuid,integer,text,uuid) from public,anon;
grant execute on function public.reject_schedule_assignment(uuid,integer,text,uuid) to authenticated;
revoke all on function public.create_payroll_schedule(text,text,public.payroll_schedule_type,date,integer,integer,integer,uuid) from public,anon;
grant execute on function public.create_payroll_schedule(text,text,public.payroll_schedule_type,date,integer,integer,integer,uuid) to authenticated;
revoke all on function public.update_payroll_schedule(uuid,integer,text,text,date,integer,integer,integer,uuid) from public,anon;
grant execute on function public.update_payroll_schedule(uuid,integer,text,text,date,integer,integer,integer,uuid) to authenticated;
revoke all on function public.set_payroll_schedule_active(uuid,integer,boolean,uuid) from public,anon;
grant execute on function public.set_payroll_schedule_active(uuid,integer,boolean,uuid) to authenticated;
revoke all on function public.preview_payroll_schedule_periods(public.payroll_schedule_type,date,integer,integer,integer,date,integer) from public,anon;
grant execute on function public.preview_payroll_schedule_periods(public.payroll_schedule_type,date,integer,integer,integer,date,integer) to authenticated;
revoke all on function public.ensure_payroll_period_horizon(text,uuid) from public,anon;
grant execute on function public.ensure_payroll_period_horizon(text,uuid) to authenticated;
revoke all on function public.transition_payroll_period(uuid,integer,public.payroll_period_status,uuid) from public,anon;
grant execute on function public.transition_payroll_period(uuid,integer,public.payroll_period_status,uuid) to authenticated;
revoke all on function public.reopen_payroll_period(uuid,integer,text,uuid) from public,anon;
grant execute on function public.reopen_payroll_period(uuid,integer,text,uuid) to authenticated;
revoke all on function public.get_payroll_overview() from public,anon;
grant execute on function public.get_payroll_overview() to authenticated;
revoke all on function public.list_payroll_schedules() from public,anon;
grant execute on function public.list_payroll_schedules() to authenticated;
revoke all on function public.get_payroll_schedule_detail(uuid) from public,anon;
grant execute on function public.get_payroll_schedule_detail(uuid) to authenticated;
revoke all on function public.list_payroll_periods(uuid,public.payroll_period_status,integer,date,date,integer,integer) from public,anon;
grant execute on function public.list_payroll_periods(uuid,public.payroll_period_status,integer,date,date,integer,integer) to authenticated;
revoke all on function public.get_payroll_period_detail(uuid) from public,anon;
grant execute on function public.get_payroll_period_detail(uuid) to authenticated;
revoke all on function public.get_employee_compensation_admin(uuid) from public,anon;
grant execute on function public.get_employee_compensation_admin(uuid) to authenticated;
revoke all on function public.get_own_compensation() from public,anon;
grant execute on function public.get_own_compensation() to authenticated;
revoke all on function public.list_payroll_approvals() from public,anon;
grant execute on function public.list_payroll_approvals() to authenticated;

-- Generate the initial rolling horizon and register the daily UTC cron job (08:15 Asia/Manila).
select public.ensure_payroll_period_horizon('scheduled', null);
do $cron$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname='hris-daily-payroll-period-generation' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'hris-daily-payroll-period-generation',
    '15 0 * * *',
    $job$select public.ensure_payroll_period_horizon('scheduled', null);$job$
  );
end
$cron$;

notify pgrst, 'reload schema';
commit;
