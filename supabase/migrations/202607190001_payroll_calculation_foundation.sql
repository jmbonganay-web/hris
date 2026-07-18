begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.payroll_calculation_run_status as enum (
    'queued','running','completed','completed_with_exceptions','failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payroll_employee_entry_status as enum (
    'pending','calculated','stale','recalculated','exception','excluded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payroll_exception_severity as enum ('warning','blocking');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payroll_exception_status as enum ('open','resolved','ignored');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payroll_source_type as enum (
    'employment','compensation','schedule_assignment','work_schedule',
    'attendance','leave','overtime','payroll_basis_rule','holiday'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payroll_basis_rounding_mode as enum ('half_up','half_even','truncate');
exception when duplicate_object then null; end $$;

create table public.payroll_basis_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id smallint not null default 1 references public.payroll_settings(id) on delete restrict,
  name text not null,
  annual_divisor numeric(8,3) not null check (annual_divisor > 0 and annual_divisor <= 1000),
  standard_hours_per_day numeric(5,2) not null check (standard_hours_per_day > 0 and standard_hours_per_day <= 24),
  rounding_mode public.payroll_basis_rounding_mode not null default 'half_up',
  effective_from date not null,
  effective_to date,
  status public.payroll_request_status not null default 'draft',
  change_reason text,
  version integer not null default 1 check (version >= 1),
  request_id uuid not null,
  created_by uuid references public.profiles(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_basis_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint payroll_basis_effective_order check (effective_to is null or effective_to >= effective_from),
  constraint payroll_basis_reason_length check (change_reason is null or char_length(change_reason) <= 1000),
  constraint payroll_basis_rejection_reason_length check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint payroll_basis_approved_no_overlap exclude using gist (
    daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') with &&
  ) where (status = 'approved')
);
create unique index payroll_basis_request_unique on public.payroll_basis_rules(created_by, request_id);
create index payroll_basis_status_effective_idx on public.payroll_basis_rules(status, effective_from desc, id desc);

create table public.payroll_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  idempotency_key uuid not null unique,
  mode text not null default 'all' check (mode in ('all','uncalculated','selected','recalculate')),
  status public.payroll_calculation_run_status not null default 'queued',
  started_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  eligible_employee_count integer not null default 0 check (eligible_employee_count >= 0),
  calculated_count integer not null default 0 check (calculated_count >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  excluded_count integer not null default 0 check (excluded_count >= 0),
  stale_count integer not null default 0 check (stale_count >= 0),
  error_code text,
  safe_error_message text,
  created_at timestamptz not null default now()
);
create unique index payroll_calculation_one_active_run_idx
  on public.payroll_calculation_runs(payroll_period_id)
  where status in ('queued','running');
create index payroll_calculation_runs_period_created_idx
  on public.payroll_calculation_runs(payroll_period_id, created_at desc, id desc);

create table public.payroll_employee_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  calculation_run_id uuid not null references public.payroll_calculation_runs(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  previous_entry_id uuid references public.payroll_employee_entries(id) on delete restrict,
  is_current boolean not null default true,
  status public.payroll_employee_entry_status not null default 'pending',
  compensation_type public.compensation_type,
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  period_start date not null,
  period_end date not null,
  employment_start date,
  employment_end date,
  eligible_start date,
  eligible_end date,
  monthly_salary numeric(14,2),
  hourly_rate numeric(12,2),
  annual_divisor numeric(8,3),
  standard_hours_per_day numeric(5,2),
  standard_hours_per_week numeric(6,2),
  eligible_workdays numeric(8,2) not null default 0,
  eligible_minutes integer not null default 0 check (eligible_minutes >= 0),
  payable_minutes integer not null default 0 check (payable_minutes >= 0),
  approved_overtime_minutes integer not null default 0 check (approved_overtime_minutes >= 0),
  regular_earnings_raw numeric(18,6) not null default 0,
  regular_earnings_rounded numeric(14,2) not null default 0,
  absence_deduction_raw numeric(18,6) not null default 0,
  absence_deduction_rounded numeric(14,2) not null default 0,
  late_deduction_raw numeric(18,6) not null default 0,
  late_deduction_rounded numeric(14,2) not null default 0,
  undertime_deduction_raw numeric(18,6) not null default 0,
  undertime_deduction_rounded numeric(14,2) not null default 0,
  overtime_input_amount numeric(14,2) not null default 0,
  paid_leave_amount numeric(14,2) not null default 0,
  unpaid_leave_deduction numeric(14,2) not null default 0,
  gross_pay_raw numeric(18,6) not null default 0,
  gross_pay_rounded numeric(14,2) not null default 0,
  is_stale boolean not null default false,
  stale_reason text,
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payroll_entry_period_order check (period_start <= period_end),
  constraint payroll_entry_eligibility_order check (eligible_start is null or eligible_end is null or eligible_start <= eligible_end),
  constraint payroll_entry_version_unique unique (payroll_period_id, employee_id, version_number),
  constraint payroll_entry_previous_not_self check (previous_entry_id is null or previous_entry_id <> id),
  constraint payroll_entry_stale_reason_length check (stale_reason is null or char_length(stale_reason) <= 1000)
);
create unique index payroll_employee_one_current_idx
  on public.payroll_employee_entries(payroll_period_id, employee_id)
  where is_current;
create index payroll_employee_entries_period_status_idx
  on public.payroll_employee_entries(payroll_period_id, status, employee_id);
create index payroll_employee_entries_employee_period_idx
  on public.payroll_employee_entries(employee_id, payroll_period_id, version_number desc);

create table public.payroll_entry_input_snapshots (
  id uuid primary key default gen_random_uuid(),
  payroll_employee_entry_id uuid not null references public.payroll_employee_entries(id) on delete restrict,
  source_type public.payroll_source_type not null,
  source_table text not null,
  source_record_id uuid not null,
  source_updated_at timestamptz,
  effective_date date,
  snapshot_data jsonb not null default '{}'::jsonb,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  constraint payroll_snapshot_table_length check (char_length(source_table) between 1 and 120),
  constraint payroll_snapshot_hash_format check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint payroll_snapshot_identity_unique unique (
    payroll_employee_entry_id, source_type, source_record_id, effective_date
  )
);
create index payroll_snapshots_entry_type_idx
  on public.payroll_entry_input_snapshots(payroll_employee_entry_id, source_type, effective_date);

create table public.payroll_entry_daily_breakdowns (
  id uuid primary key default gen_random_uuid(),
  payroll_employee_entry_id uuid not null references public.payroll_employee_entries(id) on delete restrict,
  work_date date not null,
  employment_eligible boolean not null,
  scheduled_workday boolean not null,
  scheduled_minutes integer not null default 0 check (scheduled_minutes >= 0),
  attendance_minutes integer not null default 0 check (attendance_minutes >= 0),
  paid_leave_minutes integer not null default 0 check (paid_leave_minutes >= 0),
  unpaid_leave_minutes integer not null default 0 check (unpaid_leave_minutes >= 0),
  absence_minutes integer not null default 0 check (absence_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  undertime_minutes integer not null default 0 check (undertime_minutes >= 0),
  approved_overtime_minutes integer not null default 0 check (approved_overtime_minutes >= 0),
  compensation_record_id uuid references public.employee_compensation_records(id) on delete restrict,
  payroll_basis_rule_id uuid references public.payroll_basis_rules(id) on delete restrict,
  daily_rate_raw numeric(18,6) not null default 0,
  hourly_rate_raw numeric(18,6) not null default 0,
  regular_earnings_raw numeric(18,6) not null default 0,
  absence_deduction_raw numeric(18,6) not null default 0,
  late_deduction_raw numeric(18,6) not null default 0,
  undertime_deduction_raw numeric(18,6) not null default 0,
  unpaid_leave_deduction_raw numeric(18,6) not null default 0,
  calculation_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_daily_entry_date_unique unique (payroll_employee_entry_id, work_date)
);
create index payroll_daily_breakdowns_entry_date_idx
  on public.payroll_entry_daily_breakdowns(payroll_employee_entry_id, work_date);

create table public.payroll_entry_exceptions (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  calculation_run_id uuid references public.payroll_calculation_runs(id) on delete restrict,
  payroll_employee_entry_id uuid references public.payroll_employee_entries(id) on delete restrict,
  exception_code text not null,
  severity public.payroll_exception_severity not null,
  message text not null,
  source_type public.payroll_source_type,
  source_record_id uuid,
  status public.payroll_exception_status not null default 'open',
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payroll_exception_code_format check (exception_code ~ '^[A-Z0-9_]{3,80}$'),
  constraint payroll_exception_message_length check (char_length(message) between 1 and 500),
  constraint payroll_exception_resolution_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);
create index payroll_exceptions_period_status_idx
  on public.payroll_entry_exceptions(payroll_period_id, status, severity, employee_id);
create index payroll_exceptions_entry_idx
  on public.payroll_entry_exceptions(payroll_employee_entry_id, created_at desc);

create table public.payroll_employee_exclusions (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  reason text not null,
  excluded_by uuid not null references public.profiles(id) on delete restrict,
  excluded_at timestamptz not null default now(),
  reversed_by uuid references public.profiles(id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  constraint payroll_exclusion_reason_length check (char_length(btrim(reason)) between 1 and 1000),
  constraint payroll_exclusion_reversal_reason_length check (reversal_reason is null or char_length(reversal_reason) <= 1000),
  constraint payroll_exclusion_reversal_consistency check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null and nullif(btrim(coalesce(reversal_reason,'')), '') is not null)
  )
);
create unique index payroll_employee_one_active_exclusion_idx
  on public.payroll_employee_exclusions(payroll_period_id, employee_id)
  where reversed_at is null;
create index payroll_employee_exclusions_period_idx
  on public.payroll_employee_exclusions(payroll_period_id, excluded_at desc);

create table public.payroll_calculation_events (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  calculation_run_id uuid references public.payroll_calculation_runs(id) on delete restrict,
  payroll_employee_entry_id uuid references public.payroll_employee_entries(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_calculation_event_type_format check (event_type ~ '^[a-z0-9_]{3,80}$'),
  constraint payroll_calculation_event_reason_length check (reason is null or char_length(reason) <= 1000)
);
create index payroll_calculation_events_period_created_idx
  on public.payroll_calculation_events(payroll_period_id, created_at desc, id desc);
create index payroll_calculation_events_employee_created_idx
  on public.payroll_calculation_events(employee_id, created_at desc, id desc);

create or replace function public.reject_payroll_calculation_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode='P0001', message='PAYROLL_CALCULATION_IMMUTABLE';
end;
$$;

create trigger payroll_snapshots_immutable
before update or delete on public.payroll_entry_input_snapshots
for each row execute function public.reject_payroll_calculation_mutation();
create trigger payroll_daily_breakdowns_immutable
before update or delete on public.payroll_entry_daily_breakdowns
for each row execute function public.reject_payroll_calculation_mutation();
create trigger payroll_calculation_events_immutable
before update or delete on public.payroll_calculation_events
for each row execute function public.reject_payroll_calculation_mutation();

create or replace function public.write_payroll_calculation_event(
  p_payroll_period_id uuid,
  p_calculation_run_id uuid,
  p_payroll_employee_entry_id uuid,
  p_employee_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_reason text,
  p_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  perform public.assert_safe_payroll_payload(coalesce(p_metadata,'{}'::jsonb));
  insert into public.payroll_calculation_events(
    payroll_period_id,calculation_run_id,payroll_employee_entry_id,employee_id,
    event_type,actor_user_id,reason,metadata
  ) values (
    p_payroll_period_id,p_calculation_run_id,p_payroll_employee_entry_id,p_employee_id,
    p_event_type,p_actor_user_id,nullif(btrim(coalesce(p_reason,'')),''),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_payroll_entry_exception(
  p_payroll_period_id uuid,
  p_employee_id uuid,
  p_calculation_run_id uuid,
  p_payroll_employee_entry_id uuid,
  p_exception_code text,
  p_severity public.payroll_exception_severity,
  p_message text,
  p_source_type public.payroll_source_type,
  p_source_record_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  insert into public.payroll_entry_exceptions(
    payroll_period_id,employee_id,calculation_run_id,payroll_employee_entry_id,
    exception_code,severity,message,source_type,source_record_id
  ) values (
    p_payroll_period_id,p_employee_id,p_calculation_run_id,p_payroll_employee_entry_id,
    p_exception_code,p_severity,p_message,p_source_type,p_source_record_id
  ) returning id into v_id;
  perform public.write_payroll_calculation_event(
    p_payroll_period_id,p_calculation_run_id,p_payroll_employee_entry_id,p_employee_id,
    'exception_created',auth.uid(),null,jsonb_build_object(
      'exception_id',v_id,'exception_code',p_exception_code,'severity',p_severity
    )
  );
  return v_id;
end;
$$;

create or replace function public.insert_payroll_snapshot(
  p_entry_id uuid,
  p_source_type public.payroll_source_type,
  p_source_table text,
  p_source_record_id uuid,
  p_source_updated_at timestamptz,
  p_effective_date date,
  p_snapshot_data jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid; v_data jsonb:=coalesce(p_snapshot_data,'{}'::jsonb);
begin
  insert into public.payroll_entry_input_snapshots(
    payroll_employee_entry_id,source_type,source_table,source_record_id,
    source_updated_at,effective_date,snapshot_data,snapshot_hash
  ) values (
    p_entry_id,p_source_type,p_source_table,p_source_record_id,p_source_updated_at,
    p_effective_date,v_data,encode(digest(v_data::text,'sha256'),'hex')
  ) on conflict (payroll_employee_entry_id,source_type,source_record_id,effective_date)
  do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.payroll_entry_input_snapshots
    where payroll_employee_entry_id=p_entry_id and source_type=p_source_type
      and source_record_id=p_source_record_id
      and effective_date is not distinct from p_effective_date;
  end if;
  return v_id;
end;
$$;

alter table public.payroll_basis_rules enable row level security;
alter table public.payroll_calculation_runs enable row level security;
alter table public.payroll_employee_entries enable row level security;
alter table public.payroll_entry_input_snapshots enable row level security;
alter table public.payroll_entry_daily_breakdowns enable row level security;
alter table public.payroll_entry_exceptions enable row level security;
alter table public.payroll_employee_exclusions enable row level security;
alter table public.payroll_calculation_events enable row level security;

create policy "HR reads payroll basis rules" on public.payroll_basis_rules
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll calculation runs" on public.payroll_calculation_runs
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll employee entries" on public.payroll_employee_entries
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll input snapshots" on public.payroll_entry_input_snapshots
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll daily breakdowns" on public.payroll_entry_daily_breakdowns
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll entry exceptions" on public.payroll_entry_exceptions
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll employee exclusions" on public.payroll_employee_exclusions
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll calculation events" on public.payroll_calculation_events
for select to authenticated using (public.is_hr_admin());

revoke all on public.payroll_basis_rules from authenticated;
revoke all on public.payroll_calculation_runs from authenticated;
revoke all on public.payroll_employee_entries from authenticated;
revoke all on public.payroll_entry_input_snapshots from authenticated;
revoke all on public.payroll_entry_daily_breakdowns from authenticated;
revoke all on public.payroll_entry_exceptions from authenticated;
revoke all on public.payroll_employee_exclusions from authenticated;
revoke all on public.payroll_calculation_events from authenticated;
grant select on public.payroll_basis_rules to authenticated;
grant select on public.payroll_calculation_runs to authenticated;
grant select on public.payroll_employee_entries to authenticated;
grant select on public.payroll_entry_input_snapshots to authenticated;
grant select on public.payroll_entry_daily_breakdowns to authenticated;
grant select on public.payroll_entry_exceptions to authenticated;
grant select on public.payroll_employee_exclusions to authenticated;
grant select on public.payroll_calculation_events to authenticated;

create or replace function public.create_payroll_basis_rule(
  p_name text,
  p_annual_divisor numeric,
  p_standard_hours_per_day numeric,
  p_rounding_mode public.payroll_basis_rounding_mode,
  p_effective_from date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120 then
    raise exception using errcode='P0001', message='PAYROLL_BASIS_INVALID';
  end if;
  if p_annual_divisor is null or p_annual_divisor<=0 or p_annual_divisor>1000
     or p_standard_hours_per_day is null or p_standard_hours_per_day<=0 or p_standard_hours_per_day>24
     or p_effective_from is null then
    raise exception using errcode='P0001', message='PAYROLL_BASIS_INVALID';
  end if;
  insert into public.payroll_basis_rules(
    name,annual_divisor,standard_hours_per_day,rounding_mode,effective_from,
    change_reason,request_id,created_by
  ) values (
    btrim(p_name),p_annual_divisor,p_standard_hours_per_day,coalesce(p_rounding_mode,'half_up'),
    p_effective_from,nullif(btrim(coalesce(p_change_reason,'')),''),coalesce(p_request_id,gen_random_uuid()),v_actor
  ) on conflict (created_by,request_id) do update set request_id=excluded.request_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_payroll_basis_rule(
  p_rule_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_row public.payroll_basis_rules%rowtype; v_version integer;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select * into v_row from public.payroll_basis_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_BASIS_NOT_FOUND'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if v_row.status not in ('draft','rejected') then raise exception using errcode='P0001', message='PAYROLL_BASIS_STATUS_INVALID'; end if;
  update public.payroll_basis_rules set
    status='pending_approval',version=version+1,submitted_by=v_actor,submitted_at=now(),
    rejected_by=null,rejected_at=null,rejection_reason=null,updated_at=now()
  where id=p_rule_id returning version into v_version;
  perform public.notify_payroll_super_admins(
    'payroll_basis_approval_pending','Payroll basis approval required',
    'A payroll basis rule is waiting for approval.','payroll_basis_rule',p_rule_id,
    'basis-approval:'||p_rule_id::text,null,
    jsonb_build_object('basis_rule_id',p_rule_id,'status','pending_approval'),
    '/payroll/settings/basis-rules',coalesce(p_request_id,gen_random_uuid())
  );
  return v_version;
end;
$$;

create or replace function public.approve_payroll_basis_rule(
  p_rule_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_row public.payroll_basis_rules%rowtype; v_version integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select * into v_row from public.payroll_basis_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_BASIS_NOT_FOUND'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if v_row.status<>'pending_approval' then raise exception using errcode='P0001', message='PAYROLL_BASIS_STATUS_INVALID'; end if;
  if exists(
    select 1 from public.payroll_basis_rules
    where status='approved' and id<>p_rule_id and effective_from>=v_row.effective_from
  ) then raise exception using errcode='P0001', message='PAYROLL_BASIS_FUTURE_CONFLICT'; end if;
  update public.payroll_basis_rules set
    effective_to=v_row.effective_from-1,updated_at=now(),version=version+1
  where status='approved' and id<>p_rule_id
    and effective_from<v_row.effective_from
    and (effective_to is null or effective_to>=v_row.effective_from);
  update public.payroll_basis_rules set
    status='approved',version=version+1,approved_by=v_actor,approved_at=now(),
    rejected_by=null,rejected_at=null,rejection_reason=null,updated_at=now()
  where id=p_rule_id returning version into v_version;
  return v_version;
end;
$$;

create or replace function public.reject_payroll_basis_rule(
  p_rule_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_row public.payroll_basis_rules%rowtype; v_version integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_REASON_REQUIRED';
  end if;
  select * into v_row from public.payroll_basis_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_BASIS_NOT_FOUND'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='P0001', message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  if v_row.status<>'pending_approval' then raise exception using errcode='P0001', message='PAYROLL_BASIS_STATUS_INVALID'; end if;
  update public.payroll_basis_rules set
    status='rejected',version=version+1,rejected_by=v_actor,rejected_at=now(),
    rejection_reason=btrim(p_reason),updated_at=now()
  where id=p_rule_id returning version into v_version;
  return v_version;
end;
$$;

create or replace function public.round_payroll_amount(
  p_value numeric,
  p_mode public.payroll_basis_rounding_mode
) returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_value numeric:=coalesce(p_value,0);
  v_abs_scaled numeric;
  v_whole numeric;
  v_fraction numeric;
begin
  if p_mode='truncate' then
    return trunc(v_value,2);
  end if;
  if p_mode='half_even' then
    v_abs_scaled:=abs(v_value)*100;
    v_whole:=floor(v_abs_scaled);
    v_fraction:=v_abs_scaled-v_whole;
    if v_fraction>0.5 or (v_fraction=0.5 and mod(v_whole,2)=1) then
      v_whole:=v_whole+1;
    end if;
    return sign(v_value)*v_whole/100;
  end if;
  return round(v_value,2);
end;
$$;

create or replace function public.calculate_payroll_employee_internal(
  p_calculation_run_id uuid,
  p_employee_id uuid,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run public.payroll_calculation_runs%rowtype;
  v_period public.payroll_periods%rowtype;
  v_employee public.employees%rowtype;
  v_assignment public.employee_payroll_schedule_assignments%rowtype;
  v_comp public.employee_compensation_records%rowtype;
  v_first_comp public.employee_compensation_records%rowtype;
  v_basis public.payroll_basis_rules%rowtype;
  v_first_basis public.payroll_basis_rules%rowtype;
  v_schedule_assignment public.employee_schedule_assignments%rowtype;
  v_schedule_version public.work_schedule_versions%rowtype;
  v_attendance public.attendance_calculation_revisions%rowtype;
  v_leave_day_revision_id uuid;
  v_leave_classification text;
  v_leave_chargeable_units numeric(2,1);
  v_leave_request_revision_id uuid;
  v_leave_request_group_id uuid;
  v_leave_updated_at timestamptz;
  v_previous public.payroll_employee_entries%rowtype;
  v_entry_id uuid;
  v_version integer;
  v_work_date date;
  v_employment_end date;
  v_eligible_start date;
  v_eligible_end date;
  v_day_name text;
  v_scheduled_workday boolean;
  v_scheduled_minutes integer;
  v_attendance_minutes integer;
  v_paid_leave_minutes integer;
  v_unpaid_leave_minutes integer;
  v_absence_minutes integer;
  v_late_minutes integer;
  v_undertime_minutes integer;
  v_overtime_minutes integer;
  v_daily_rate numeric(18,6);
  v_hourly_rate numeric(18,6);
  v_minute_rate numeric(18,9);
  v_regular_earnings numeric(18,6);
  v_absence_deduction numeric(18,6);
  v_late_deduction numeric(18,6);
  v_undertime_deduction numeric(18,6);
  v_unpaid_leave_deduction numeric(18,6);
  v_payable_minutes integer;
  v_missing_comp_date date;
  v_missing_basis_date date;
  v_missing_schedule_date date;
  v_incomplete_attendance_date date;
  v_mixed_compensation boolean:=false;
  v_blocking_count integer:=0;
  v_regular_total numeric(18,6):=0;
  v_absence_total numeric(18,6):=0;
  v_late_total numeric(18,6):=0;
  v_undertime_total numeric(18,6):=0;
  v_unpaid_leave_total numeric(18,6):=0;
  v_paid_leave_total numeric(18,6):=0;
  v_eligible_minutes_total integer:=0;
  v_payable_minutes_total integer:=0;
  v_overtime_minutes_total integer:=0;
  v_eligible_workdays_total numeric(8,2):=0;
  v_gross_pay numeric(18,6):=0;
  v_actor uuid:=auth.uid();
begin
  select * into v_run from public.payroll_calculation_runs where id=p_calculation_run_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_CALCULATION_RUN_NOT_FOUND'; end if;
  select * into v_period from public.payroll_periods where id=v_run.payroll_period_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_period.status not in ('open','under_review') then
    raise exception using errcode='P0001', message='PAYROLL_PERIOD_CALCULATION_INVALID';
  end if;
  select * into v_employee from public.employees where id=p_employee_id;
  if not found then raise exception using errcode='P0001', message='PAYROLL_EMPLOYEE_NOT_FOUND'; end if;

  select * into v_assignment
  from public.employee_payroll_schedule_assignments
  where employee_id=p_employee_id and payroll_schedule_id=v_period.payroll_schedule_id
    and status='approved' and effective_from<=v_period.period_end
    and (effective_to is null or effective_to>=v_period.period_start)
  order by effective_from desc limit 1;

  select * into v_previous
  from public.payroll_employee_entries
  where payroll_period_id=v_period.id and employee_id=p_employee_id and is_current
  for update;
  v_version:=coalesce(v_previous.version_number,0)+1;
  if v_previous.id is not null then
    update public.payroll_employee_entries
    set is_current=false,status=case when status='exception' then status else 'stale' end,
        is_stale=true,stale_reason=coalesce(stale_reason,'Replaced by a newer calculation version.')
    where id=v_previous.id;
  end if;

  v_employment_end:=case when v_employee.archived_at is not null then v_employee.archived_at::date else null end;
  v_eligible_start:=greatest(v_period.period_start,v_employee.hire_date);
  v_eligible_end:=least(v_period.period_end,coalesce(v_employment_end,v_period.period_end));

  insert into public.payroll_employee_entries(
    payroll_period_id,employee_id,calculation_run_id,version_number,previous_entry_id,
    status,period_start,period_end,employment_start,employment_end,eligible_start,eligible_end
  ) values (
    v_period.id,p_employee_id,p_calculation_run_id,v_version,v_previous.id,'pending',
    v_period.period_start,v_period.period_end,v_employee.hire_date,v_employment_end,
    v_eligible_start,v_eligible_end
  ) returning id into v_entry_id;

  perform public.insert_payroll_snapshot(
    v_entry_id,'employment','employees',v_employee.id,v_employee.updated_at,v_employee.hire_date,
    jsonb_build_object(
      'employee_id',v_employee.id,'employee_number',v_employee.employee_number,
      'employment_status',v_employee.employment_status,'employment_type',v_employee.employment_type,
      'hire_date',v_employee.hire_date,'employment_end',v_employment_end
    )
  );

  if v_assignment.id is null then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,
      'MISSING_SCHEDULE_ASSIGNMENT','blocking',
      'No approved payroll schedule assignment covers this payroll period.',
      'schedule_assignment',null
    );
    v_blocking_count:=v_blocking_count+1;
  else
    perform public.insert_payroll_snapshot(
      v_entry_id,'schedule_assignment','employee_payroll_schedule_assignments',v_assignment.id,
      v_assignment.updated_at,v_assignment.effective_from,
      jsonb_build_object(
        'assignment_id',v_assignment.id,'payroll_schedule_id',v_assignment.payroll_schedule_id,
        'effective_from',v_assignment.effective_from,'effective_to',v_assignment.effective_to
      )
    );
  end if;

  if v_employee.employment_status in ('terminated','inactive') and v_employment_end is null then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,
      'MISSING_EMPLOYMENT_END','blocking',
      'The employee is inactive or terminated but has no effective employment end date.',
      'employment',v_employee.id
    );
    v_blocking_count:=v_blocking_count+1;
  end if;

  if v_eligible_start>v_eligible_end then
    update public.payroll_employee_entries set status='excluded',calculated_at=now() where id=v_entry_id;
    perform public.write_payroll_calculation_event(
      v_period.id,p_calculation_run_id,v_entry_id,p_employee_id,'employee_excluded',v_actor,
      'Employment dates do not overlap the payroll period.',
      jsonb_build_object('entry_id',v_entry_id,'version_number',v_version)
    );
    return jsonb_build_object('status','excluded','entryId',v_entry_id,'version',v_version);
  end if;

  for v_work_date in
    select generate_series(v_period.period_start, v_period.period_end, interval '1 day')::date
  loop
    v_scheduled_workday:=false;
    v_scheduled_minutes:=0;
    v_attendance_minutes:=0;
    v_paid_leave_minutes:=0;
    v_unpaid_leave_minutes:=0;
    v_absence_minutes:=0;
    v_late_minutes:=0;
    v_undertime_minutes:=0;
    v_overtime_minutes:=0;
    v_daily_rate:=0;
    v_hourly_rate:=0;
    v_minute_rate:=0;
    v_regular_earnings:=0;
    v_absence_deduction:=0;
    v_late_deduction:=0;
    v_undertime_deduction:=0;
    v_unpaid_leave_deduction:=0;
    v_payable_minutes:=0;
    v_comp:=null;
    v_basis:=null;
    v_schedule_assignment:=null;
    v_schedule_version:=null;
    v_attendance:=null;
    v_leave_day_revision_id:=null;
    v_leave_classification:=null;
    v_leave_chargeable_units:=null;
    v_leave_request_revision_id:=null;
    v_leave_request_group_id:=null;
    v_leave_updated_at:=null;

    if v_work_date<v_eligible_start or v_work_date>v_eligible_end then
      insert into public.payroll_entry_daily_breakdowns(
        payroll_employee_entry_id,work_date,employment_eligible,scheduled_workday,calculation_details
      ) values (
        v_entry_id,v_work_date,false,false,jsonb_build_object('reason','outside_employment_range')
      );
      continue;
    end if;

    select * into v_comp
    from public.employee_compensation_records
    where employee_id=p_employee_id and status='approved'
      and effective_from <= v_work_date
      and (effective_to is null or effective_to >= v_work_date)
    order by effective_from desc limit 1;
    if v_comp.id is null then
      v_missing_comp_date:=coalesce(v_missing_comp_date,v_work_date);
    else
      if v_first_comp.id is null then v_first_comp:=v_comp;
      elsif v_first_comp.compensation_type<>v_comp.compensation_type then v_mixed_compensation:=true;
      end if;
      perform public.insert_payroll_snapshot(
        v_entry_id,'compensation','employee_compensation_records',v_comp.id,v_comp.updated_at,
        v_comp.effective_from,jsonb_build_object(
          'compensation_record_id',v_comp.id,'compensation_type',v_comp.compensation_type,
          'monthly_salary',v_comp.monthly_salary,'hourly_rate',v_comp.hourly_rate,
          'currency_code',v_comp.currency_code,'standard_hours_per_day',v_comp.standard_hours_per_day,
          'standard_hours_per_week',v_comp.standard_hours_per_week,
          'effective_from',v_comp.effective_from,'effective_to',v_comp.effective_to
        )
      );
    end if;

    select * into v_basis
    from public.payroll_basis_rules
    where status='approved' and effective_from <= v_work_date
      and (effective_to is null or effective_to >= v_work_date)
    order by effective_from desc limit 1;
    if v_basis.id is null then
      v_missing_basis_date:=coalesce(v_missing_basis_date,v_work_date);
    else
      if v_first_basis.id is null then v_first_basis:=v_basis; end if;
      perform public.insert_payroll_snapshot(
        v_entry_id,'payroll_basis_rule','payroll_basis_rules',v_basis.id,v_basis.updated_at,
        v_basis.effective_from,jsonb_build_object(
          'basis_rule_id',v_basis.id,'annual_divisor',v_basis.annual_divisor,
          'standard_hours_per_day',v_basis.standard_hours_per_day,'rounding_mode',v_basis.rounding_mode,
          'effective_from',v_basis.effective_from,'effective_to',v_basis.effective_to
        )
      );
    end if;

    select * into v_schedule_assignment
    from public.employee_schedule_assignments
    where employee_id=p_employee_id and not is_superseded
      and effective_start_date<=v_work_date
      and (effective_end_date is null or effective_end_date>=v_work_date)
    order by effective_start_date desc limit 1;
    if v_schedule_assignment.id is not null then
      select * into v_schedule_version
      from public.work_schedule_versions
      where schedule_template_id=v_schedule_assignment.schedule_template_id
        and effective_date<=v_work_date
      order by effective_date desc limit 1;
    end if;
    if v_schedule_version.id is null then
      v_missing_schedule_date:=coalesce(v_missing_schedule_date,v_work_date);
    else
      v_day_name:=lower(trim(to_char(v_work_date,'Day')));
      v_scheduled_workday:=v_day_name=any(v_schedule_version.working_days);
      if v_scheduled_workday then
        v_scheduled_minutes:=greatest(0,
          floor(extract(epoch from (v_schedule_version.end_time-v_schedule_version.start_time))/60)::integer
          - v_schedule_version.break_minutes
        );
      end if;
      perform public.insert_payroll_snapshot(
        v_entry_id,'work_schedule','work_schedule_versions',v_schedule_version.id,
        v_schedule_version.created_at,v_schedule_version.effective_date,
        jsonb_build_object(
          'schedule_assignment_id',v_schedule_assignment.id,'schedule_version_id',v_schedule_version.id,
          'working_days',v_schedule_version.working_days,'start_time',v_schedule_version.start_time,
          'end_time',v_schedule_version.end_time,'break_minutes',v_schedule_version.break_minutes,
          'effective_date',v_schedule_version.effective_date
        )
      );
    end if;

    select revision.* into v_attendance
    from public.attendance_calculation_groups calculation_group
    join public.attendance_calculation_revisions revision
      on revision.id=calculation_group.active_revision_id
    where calculation_group.employee_id=p_employee_id
      and calculation_group.attendance_date=v_work_date;
    if v_attendance.id is not null then
      v_attendance_minutes:=coalesce(v_attendance.worked_minutes,0);
      v_late_minutes:=coalesce(v_attendance.late_minutes,0);
      v_undertime_minutes:=coalesce(v_attendance.undertime_minutes,0);
      perform public.insert_payroll_snapshot(
        v_entry_id,'attendance','attendance_calculation_revisions',v_attendance.id,
        v_attendance.calculated_at,v_work_date,jsonb_build_object(
          'attendance_revision_id',v_attendance.id,'attendance_record_id',v_attendance.attendance_record_id,
          'base_status',v_attendance.base_status,'is_provisional',v_attendance.is_provisional,
          'scheduled_minutes',v_attendance.scheduled_minutes,'worked_minutes',v_attendance.worked_minutes,
          'late_minutes',v_attendance.late_minutes,'undertime_minutes',v_attendance.undertime_minutes,
          'calculated_at',v_attendance.calculated_at
        )
      );
    end if;

    select day_revision.id,day_revision.leave_classification,
           day_revision.chargeable_units,request_revision.id,
           request_group.id,request_revision.updated_at
      into v_leave_day_revision_id,v_leave_classification,v_leave_chargeable_units,
           v_leave_request_revision_id,v_leave_request_group_id,v_leave_updated_at
    from public.leave_request_groups request_group
    join public.leave_request_revisions request_revision on request_revision.id=request_group.active_revision_id
    join public.leave_request_days request_day on request_day.request_revision_id=request_revision.id
    join public.leave_request_day_revisions day_revision on day_revision.id=request_day.active_revision_id
    where request_group.employee_id=p_employee_id and request_group.current_status='approved'
      and request_day.leave_date=v_work_date
    order by request_revision.revision_number desc limit 1;
    if v_leave_day_revision_id is not null then
      if v_leave_classification='paid_leave' then
        v_paid_leave_minutes:=round(v_scheduled_minutes*coalesce(v_leave_chargeable_units,0))::integer;
      elsif v_leave_classification='unpaid_leave' then
        v_unpaid_leave_minutes:=round(v_scheduled_minutes*coalesce(v_leave_chargeable_units,0))::integer;
      end if;
      perform public.insert_payroll_snapshot(
        v_entry_id,'leave','leave_request_day_revisions',v_leave_day_revision_id,
        v_leave_updated_at,v_work_date,jsonb_build_object(
          'request_group_id',v_leave_request_group_id,'request_revision_id',v_leave_request_revision_id,
          'day_revision_id',v_leave_day_revision_id,'classification',v_leave_classification,
          'chargeable_units',v_leave_chargeable_units
        )
      );
    end if;

    select coalesce(sum(approval.approved_minutes),0)::integer into v_overtime_minutes
    from public.overtime_detection_groups detection_group
    join public.overtime_detection_revisions detection_revision
      on detection_revision.id=detection_group.active_revision_id
    join public.overtime_approval_items approval
      on approval.detection_revision_id=detection_revision.id and approval.status='approved'
    where detection_group.employee_id=p_employee_id
      and detection_group.attendance_date=v_work_date;
    if v_overtime_minutes>0 then
      perform public.insert_payroll_snapshot(
        v_entry_id,'overtime','overtime_detection_groups',
        (select id from public.overtime_detection_groups where employee_id=p_employee_id and attendance_date=v_work_date order by id limit 1),
        now(),v_work_date,jsonb_build_object('approved_minutes',v_overtime_minutes,'work_date',v_work_date)
      );
    end if;

    if v_scheduled_workday and (v_attendance.id is null or v_attendance.is_provisional) and v_paid_leave_minutes=0 and v_unpaid_leave_minutes=0 then
      v_incomplete_attendance_date:=coalesce(v_incomplete_attendance_date,v_work_date);
    end if;

    if v_comp.id is not null and v_basis.id is not null then
      if v_comp.compensation_type='monthly' then
        v_daily_rate:=v_comp.monthly_salary * 12 / v_basis.annual_divisor;
        v_hourly_rate:=v_daily_rate / v_comp.standard_hours_per_day;
      else
        v_hourly_rate:=v_comp.hourly_rate;
        v_daily_rate:=v_hourly_rate * v_comp.standard_hours_per_day;
      end if;
      v_minute_rate:=v_hourly_rate / 60;

      if v_comp.compensation_type='hourly' then
        v_payable_minutes:=least(v_scheduled_minutes,greatest(0,v_attendance_minutes+v_paid_leave_minutes));
        v_regular_earnings := v_payable_minutes * v_hourly_rate / 60;
        v_absence_deduction := 0;
        v_late_deduction := 0;
        v_undertime_deduction := 0;
        v_unpaid_leave_deduction := 0;
      else
        if v_scheduled_workday then v_regular_earnings:=v_daily_rate; end if;
        if v_scheduled_workday and v_unpaid_leave_minutes=0 and v_paid_leave_minutes=0 then
          if v_attendance.id is null or v_attendance.base_status='absent' then
            v_absence_minutes:=v_scheduled_minutes;
          end if;
        end if;
        v_absence_deduction:=v_absence_minutes*v_minute_rate;
        v_late_deduction:=v_late_minutes*v_minute_rate;
        v_undertime_deduction:=v_undertime_minutes*v_minute_rate;
        v_unpaid_leave_deduction:=v_unpaid_leave_minutes*v_minute_rate;
        v_payable_minutes:=greatest(0,v_scheduled_minutes-v_absence_minutes-v_late_minutes-v_undertime_minutes-v_unpaid_leave_minutes);
      end if;
    end if;

    insert into public.payroll_entry_daily_breakdowns(
      payroll_employee_entry_id,work_date,employment_eligible,scheduled_workday,
      scheduled_minutes,attendance_minutes,paid_leave_minutes,unpaid_leave_minutes,
      absence_minutes,late_minutes,undertime_minutes,approved_overtime_minutes,
      compensation_record_id,payroll_basis_rule_id,daily_rate_raw,hourly_rate_raw,
      regular_earnings_raw,absence_deduction_raw,late_deduction_raw,
      undertime_deduction_raw,unpaid_leave_deduction_raw,calculation_details
    ) values (
      v_entry_id,v_work_date,true,v_scheduled_workday,v_scheduled_minutes,v_attendance_minutes,
      v_paid_leave_minutes,v_unpaid_leave_minutes,v_absence_minutes,v_late_minutes,
      v_undertime_minutes,v_overtime_minutes,v_comp.id,v_basis.id,v_daily_rate,v_hourly_rate,
      v_regular_earnings,v_absence_deduction,v_late_deduction,v_undertime_deduction,
      v_unpaid_leave_deduction,jsonb_build_object(
        'attendance_status',v_attendance.base_status,'payable_minutes',v_payable_minutes,
        'leave_classification',v_leave_classification,'calculation_version',v_version
      )
    );

    if v_scheduled_workday then v_eligible_workdays_total:=v_eligible_workdays_total+1; end if;
    v_eligible_minutes_total:=v_eligible_minutes_total+v_scheduled_minutes;
    v_payable_minutes_total:=v_payable_minutes_total+v_payable_minutes;
    v_overtime_minutes_total:=v_overtime_minutes_total+v_overtime_minutes;
    v_regular_total:=v_regular_total+v_regular_earnings;
    v_absence_total:=v_absence_total+v_absence_deduction;
    v_late_total:=v_late_total+v_late_deduction;
    v_undertime_total:=v_undertime_total+v_undertime_deduction;
    v_unpaid_leave_total:=v_unpaid_leave_total+v_unpaid_leave_deduction;
    v_paid_leave_total:=v_paid_leave_total+(v_paid_leave_minutes*v_hourly_rate/60);
  end loop;

  if v_missing_comp_date is not null then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,'MISSING_COMPENSATION','blocking',
      'No approved compensation record covers one or more eligible payroll dates.',
      'compensation',null
    );
    v_blocking_count:=v_blocking_count+1;
  end if;
  if v_missing_basis_date is not null then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,'MISSING_PAYROLL_BASIS','blocking',
      'No approved payroll-basis rule covers one or more eligible payroll dates.',
      'payroll_basis_rule',null
    );
    v_blocking_count:=v_blocking_count+1;
  end if;
  if v_missing_schedule_date is not null then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,'MISSING_WORK_SCHEDULE','blocking',
      'No effective work schedule covers one or more eligible payroll dates.',
      'work_schedule',null
    );
    v_blocking_count:=v_blocking_count+1;
  end if;
  if v_incomplete_attendance_date is not null then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,'INCOMPLETE_ATTENDANCE','blocking',
      'One or more scheduled dates have no finalized attendance or approved leave coverage.',
      'attendance',null
    );
    v_blocking_count:=v_blocking_count+1;
  end if;
  if v_mixed_compensation then
    perform public.create_payroll_entry_exception(
      v_period.id,p_employee_id,p_calculation_run_id,v_entry_id,'MIXED_COMPENSATION_TYPE','blocking',
      'The compensation type changes inside this payroll period and requires payroll review.',
      'compensation',null
    );
    v_blocking_count:=v_blocking_count+1;
  end if;

  v_gross_pay:=greatest(0,v_regular_total-v_absence_total-v_late_total-v_undertime_total-v_unpaid_leave_total);
  update public.payroll_employee_entries set
    status=case when v_blocking_count>0 then 'exception'
      when v_previous.id is null then 'calculated' else 'recalculated' end,
    compensation_type=v_first_comp.compensation_type,
    currency_code=v_first_comp.currency_code,
    monthly_salary=v_first_comp.monthly_salary,
    hourly_rate=v_first_comp.hourly_rate,
    annual_divisor=v_first_basis.annual_divisor,
    standard_hours_per_day=v_first_comp.standard_hours_per_day,
    standard_hours_per_week=v_first_comp.standard_hours_per_week,
    eligible_workdays=v_eligible_workdays_total,
    eligible_minutes=v_eligible_minutes_total,
    payable_minutes=v_payable_minutes_total,
    approved_overtime_minutes=v_overtime_minutes_total,
    regular_earnings_raw=v_regular_total,
    regular_earnings_rounded=public.round_payroll_amount(v_regular_total,coalesce(v_first_basis.rounding_mode,'half_up')),
    absence_deduction_raw=v_absence_total,
    absence_deduction_rounded=public.round_payroll_amount(v_absence_total,coalesce(v_first_basis.rounding_mode,'half_up')),
    late_deduction_raw=v_late_total,
    late_deduction_rounded=public.round_payroll_amount(v_late_total,coalesce(v_first_basis.rounding_mode,'half_up')),
    undertime_deduction_raw=v_undertime_total,
    undertime_deduction_rounded=public.round_payroll_amount(v_undertime_total,coalesce(v_first_basis.rounding_mode,'half_up')),
    paid_leave_amount=public.round_payroll_amount(v_paid_leave_total,coalesce(v_first_basis.rounding_mode,'half_up')),
    unpaid_leave_deduction=public.round_payroll_amount(v_unpaid_leave_total,coalesce(v_first_basis.rounding_mode,'half_up')),
    gross_pay_raw=v_gross_pay,
    gross_pay_rounded=public.round_payroll_amount(v_gross_pay,coalesce(v_first_basis.rounding_mode,'half_up')),
    is_stale=false,stale_reason=null,calculated_at=now()
  where id=v_entry_id;

  perform public.write_payroll_calculation_event(
    v_period.id,p_calculation_run_id,v_entry_id,p_employee_id,
    case when v_blocking_count>0 then 'calculation_failed'
      when v_previous.id is null then 'calculation_completed' else 'recalculation_completed' end,
    v_actor,null,jsonb_build_object(
      'entry_id',v_entry_id,'version_number',v_version,
      'status',case when v_blocking_count>0 then 'exception' when v_previous.id is null then 'calculated' else 'recalculated' end,
      'blocking_exception_count',v_blocking_count
    )
  );
  return jsonb_build_object(
    'status',case when v_blocking_count>0 then 'exception' when v_previous.id is null then 'calculated' else 'recalculated' end,
    'entryId',v_entry_id,'version',v_version,'blockingExceptions',v_blocking_count
  );
end;
$$;

create or replace function public.calculate_payroll_employee(
  p_calculation_run_id uuid,
  p_employee_id uuid,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  return public.calculate_payroll_employee_internal(
    p_calculation_run_id,p_employee_id,coalesce(p_request_id,gen_random_uuid())
  );
end;
$$;

create or replace function public.start_payroll_calculation_run(
  p_payroll_period_id uuid,
  p_mode text default 'all',
  p_employee_ids uuid[] default null,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=auth.uid();
  v_period public.payroll_periods%rowtype;
  v_existing public.payroll_calculation_runs%rowtype;
  v_run_id uuid;
  v_employee record;
  v_employee_result jsonb;
  v_eligible integer:=0;
  v_calculated integer:=0;
  v_exceptions integer:=0;
  v_excluded integer:=0;
  v_status public.payroll_calculation_run_status;
  v_primary_schedule_id uuid;
  v_key uuid:=coalesce(p_idempotency_key,gen_random_uuid());
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if p_mode not in ('all','uncalculated','selected','recalculate') then
    raise exception using errcode='P0001', message='PAYROLL_CALCULATION_MODE_INVALID';
  end if;
  select * into v_existing from public.payroll_calculation_runs where idempotency_key=v_key;
  if found then
    return jsonb_build_object(
      'runId',v_existing.id,'status',v_existing.status,'idempotentReplay',true,
      'eligibleEmployeeCount',v_existing.eligible_employee_count,
      'calculatedCount',v_existing.calculated_count,'exceptionCount',v_existing.exception_count,
      'excludedCount',v_existing.excluded_count
    );
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('payroll-calculation:' || p_payroll_period_id::text,0)) then
    raise exception using errcode='P0001', message='PAYROLL_CALCULATION_ALREADY_RUNNING';
  end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_period.status<>'open' then
    raise exception using errcode='P0001', message='PAYROLL_PERIOD_CALCULATION_INVALID';
  end if;
  if exists(select 1 from public.payroll_calculation_runs where payroll_period_id=p_payroll_period_id and status in ('queued','running')) then
    raise exception using errcode='P0001', message='PAYROLL_CALCULATION_ALREADY_RUNNING';
  end if;
  if not exists(
    select 1 from public.payroll_basis_rules
    where status='approved' and effective_from<=v_period.period_end
      and (effective_to is null or effective_to>=v_period.period_start)
  ) then raise exception using errcode='P0001', message='PAYROLL_BASIS_REQUIRED'; end if;

  insert into public.payroll_calculation_runs(
    payroll_period_id,idempotency_key,mode,status,started_by,started_at
  ) values (
    p_payroll_period_id,v_key,p_mode,'queued',v_actor,now()
  ) on conflict (idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into v_run_id;
  update public.payroll_calculation_runs set status='running' where id=v_run_id;
  perform public.write_payroll_calculation_event(
    p_payroll_period_id,v_run_id,null,null,'run_started',v_actor,null,
    jsonb_build_object('run_id',v_run_id,'mode',p_mode,'period_id',p_payroll_period_id)
  );

  select id into v_primary_schedule_id
  from public.payroll_schedules where is_active order by created_at,id limit 1;

  for v_employee in
    select distinct e.id
    from public.employees e
    where e.hire_date<=v_period.period_end
      and (
        e.archived_at is null
        or e.archived_at::date>=v_period.period_start
      )
      and (
        exists(
          select 1 from public.employee_payroll_schedule_assignments assignment
          where assignment.employee_id=e.id
            and assignment.payroll_schedule_id=v_period.payroll_schedule_id
            and assignment.status='approved'
            and assignment.effective_from<=v_period.period_end
            and (assignment.effective_to is null or assignment.effective_to>=v_period.period_start)
        )
        or (
          v_period.payroll_schedule_id=v_primary_schedule_id
          and not exists(
            select 1 from public.employee_payroll_schedule_assignments any_assignment
            where any_assignment.employee_id=e.id and any_assignment.status='approved'
              and any_assignment.effective_from<=v_period.period_end
              and (any_assignment.effective_to is null or any_assignment.effective_to>=v_period.period_start)
          )
        )
      )
      and (p_employee_ids is null or e.id=any(p_employee_ids))
      and (
        p_mode not in ('uncalculated','selected')
        or p_mode='selected'
        or not exists(
          select 1 from public.payroll_employee_entries entry
          where entry.payroll_period_id=v_period.id and entry.employee_id=e.id
            and entry.is_current and entry.status in ('calculated','recalculated')
        )
      )
    order by e.id
  loop
    v_eligible:=v_eligible+1;
    if exists(
      select 1 from public.payroll_employee_exclusions exclusion
      where exclusion.payroll_period_id=v_period.id and exclusion.employee_id=v_employee.id
        and exclusion.reversed_at is null
    ) then
      v_excluded:=v_excluded+1;
      perform public.write_payroll_calculation_event(
        v_period.id,v_run_id,null,v_employee.id,'employee_excluded',v_actor,null,
        jsonb_build_object('employee_id',v_employee.id,'reason','active_exclusion')
      );
      continue;
    end if;
    begin
      v_employee_result := public.calculate_payroll_employee_internal(
        v_run_id,v_employee.id,v_key
      );
      if v_employee_result->>'status' in ('calculated','recalculated') then
        v_calculated:=v_calculated+1;
      elsif v_employee_result->>'status'='excluded' then
        v_excluded:=v_excluded+1;
      else
        v_exceptions:=v_exceptions+1;
      end if;
    exception when others then
      v_exceptions:=v_exceptions+1;
      perform public.create_payroll_entry_exception(
        v_period.id,v_employee.id,v_run_id,null,'CALCULATION_FAILED','blocking',
        'The employee payroll calculation could not be completed.','employment',v_employee.id
      );
      perform public.write_payroll_calculation_event(
        v_period.id,v_run_id,null,v_employee.id,'calculation_failed',v_actor,null,
        jsonb_build_object('employee_id',v_employee.id,'safe_error','PAYROLL_EMPLOYEE_CALCULATION_FAILED')
      );
    end;
  end loop;

  v_status:=case when v_exceptions>0 then 'completed_with_exceptions' else 'completed' end;
  update public.payroll_calculation_runs set
    status=v_status,completed_at=now(),eligible_employee_count=v_eligible,
    calculated_count=v_calculated,exception_count=v_exceptions,excluded_count=v_excluded,
    stale_count=(select count(*) from public.payroll_employee_entries where payroll_period_id=v_period.id and is_current and is_stale)
  where id=v_run_id;
  perform public.write_payroll_calculation_event(
    v_period.id,v_run_id,null,null,'run_completed',v_actor,null,
    jsonb_build_object(
      'run_id',v_run_id,'status',v_status,'eligible_count',v_eligible,
      'calculated_count',v_calculated,'exception_count',v_exceptions,'excluded_count',v_excluded
    )
  );
  perform public.notify_payroll_admins(
    case when v_exceptions>0 then 'payroll_calculation_exceptions' else 'payroll_calculation_completed' end,
    case when v_exceptions>0 then 'Payroll calculation needs review' else 'Payroll calculation completed' end,
    case when v_exceptions>0 then 'A payroll calculation run completed with exceptions.' else 'A payroll calculation run completed successfully.' end,
    'payroll_calculation_run',v_run_id,'calculation-run:'||v_run_id::text,
    jsonb_build_object('run_id',v_run_id,'period_id',v_period.id,'status',v_status,'exception_count',v_exceptions),
    '/payroll/periods/'||v_period.id::text||'/workspace',v_key
  );
  return jsonb_build_object(
    'runId',v_run_id,'status',v_status,'idempotentReplay',false,
    'eligibleEmployeeCount',v_eligible,'calculatedCount',v_calculated,
    'exceptionCount',v_exceptions,'excludedCount',v_excluded
  );
exception when others then
  if v_run_id is not null then
    insert into public.payroll_calculation_runs(
      id,payroll_period_id,idempotency_key,mode,status,started_by,started_at,completed_at,
      error_code,safe_error_message
    ) values (
      v_run_id,p_payroll_period_id,v_key,p_mode,'failed',v_actor,now(),now(),
      'PAYROLL_CALCULATION_FAILED','The payroll calculation run could not be completed.'
    ) on conflict (idempotency_key) do update set
      status='failed',completed_at=now(),error_code='PAYROLL_CALCULATION_FAILED',
      safe_error_message='The payroll calculation run could not be completed.'
    returning id into v_run_id;
    return jsonb_build_object(
      'runId',v_run_id,'status','failed','errorCode','PAYROLL_CALCULATION_FAILED',
      'safeErrorMessage','The payroll calculation run could not be completed.'
    );
  end if;
  raise;
end;
$$;

create or replace function public.recalculate_payroll_employee(
  p_payroll_period_id uuid,
  p_employee_id uuid,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_period public.payroll_periods%rowtype; v_run_id uuid; v_result jsonb;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('payroll-calculation:' || p_payroll_period_id::text,0)) then
    raise exception using errcode='P0001', message='PAYROLL_CALCULATION_ALREADY_RUNNING';
  end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_period.status not in ('open','under_review') then
    raise exception using errcode='P0001', message='PAYROLL_PERIOD_CALCULATION_INVALID';
  end if;
  insert into public.payroll_calculation_runs(
    payroll_period_id,idempotency_key,mode,status,started_by,started_at,eligible_employee_count
  ) values (
    p_payroll_period_id,coalesce(p_request_id,gen_random_uuid()),'recalculate','running',v_actor,now(),1
  ) on conflict (idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into v_run_id;
  v_result:=public.calculate_payroll_employee_internal(v_run_id,p_employee_id,p_request_id);
  update public.payroll_calculation_runs set
    status=case when v_result->>'status'='exception' then 'completed_with_exceptions' else 'completed' end,
    completed_at=now(),calculated_count=case when v_result->>'status' in ('calculated','recalculated') then 1 else 0 end,
    exception_count=case when v_result->>'status'='exception' then 1 else 0 end,
    excluded_count=case when v_result->>'status'='excluded' then 1 else 0 end
  where id=v_run_id;
  return v_result||jsonb_build_object('runId',v_run_id);
end;
$$;

create or replace function public.exclude_employee_from_payroll(
  p_payroll_period_id uuid,
  p_employee_id uuid,
  p_reason text,
  p_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_period public.payroll_periods%rowtype; v_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_REASON_REQUIRED';
  end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id for update;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_period.status not in ('open','under_review') then
    raise exception using errcode='P0001', message='PAYROLL_PERIOD_CALCULATION_INVALID';
  end if;
  insert into public.payroll_employee_exclusions(
    payroll_period_id,employee_id,reason,excluded_by
  ) values (p_payroll_period_id,p_employee_id,btrim(p_reason),v_actor)
  on conflict (payroll_period_id,employee_id) where reversed_at is null
  do update set reason=excluded.reason
  returning id into v_id;
  update public.payroll_employee_entries
  set status='excluded',is_stale=false,stale_reason=null
  where payroll_period_id=p_payroll_period_id and employee_id=p_employee_id and is_current;
  perform public.write_payroll_calculation_event(
    p_payroll_period_id,null,null,p_employee_id,'employee_excluded',v_actor,btrim(p_reason),
    jsonb_build_object('exclusion_id',v_id,'employee_id',p_employee_id)
  );
  return v_id;
end;
$$;

create or replace function public.reverse_payroll_exclusion(
  p_exclusion_id uuid,
  p_reason text,
  p_request_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_row public.payroll_employee_exclusions%rowtype;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_REASON_REQUIRED';
  end if;
  select * into v_row from public.payroll_employee_exclusions where id=p_exclusion_id for update;
  if not found or v_row.reversed_at is not null then
    raise exception using errcode='P0001', message='PAYROLL_EXCLUSION_NOT_FOUND';
  end if;
  update public.payroll_employee_exclusions set
    reversed_by=v_actor,reversed_at=now(),reversal_reason=btrim(p_reason)
  where id=p_exclusion_id;
  update public.payroll_employee_entries set
    status='stale',is_stale=true,stale_reason='Payroll exclusion was reversed and requires recalculation.'
  where payroll_period_id=v_row.payroll_period_id and employee_id=v_row.employee_id and is_current;
  perform public.write_payroll_calculation_event(
    v_row.payroll_period_id,null,null,v_row.employee_id,'employee_exclusion_reversed',v_actor,btrim(p_reason),
    jsonb_build_object('exclusion_id',p_exclusion_id,'employee_id',v_row.employee_id)
  );
  return true;
end;
$$;

create or replace function public.resolve_payroll_exception(
  p_exception_id uuid,
  p_resolution_note text,
  p_request_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_row public.payroll_entry_exceptions%rowtype;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_resolution_note,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_REASON_REQUIRED';
  end if;
  select * into v_row from public.payroll_entry_exceptions where id=p_exception_id for update;
  if not found or v_row.status<>'open' then
    raise exception using errcode='P0001', message='PAYROLL_EXCEPTION_NOT_FOUND';
  end if;
  if v_row.severity='blocking' then
    raise exception using errcode='P0001', message='PAYROLL_BLOCKING_EXCEPTION_REQUIRES_RECALCULATION';
  end if;
  update public.payroll_entry_exceptions set
    status='resolved',resolution_note=btrim(p_resolution_note),resolved_by=v_actor,resolved_at=now()
  where id=p_exception_id;
  perform public.write_payroll_calculation_event(
    v_row.payroll_period_id,v_row.calculation_run_id,v_row.payroll_employee_entry_id,
    v_row.employee_id,'exception_resolved',v_actor,btrim(p_resolution_note),
    jsonb_build_object('exception_id',p_exception_id,'exception_code',v_row.exception_code)
  );
  return true;
end;
$$;

create or replace function public.ignore_blocking_payroll_exception(
  p_exception_id uuid,
  p_reason text,
  p_request_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_row public.payroll_entry_exceptions%rowtype;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='P0001', message='PAYROLL_REASON_REQUIRED';
  end if;
  select * into v_row from public.payroll_entry_exceptions where id=p_exception_id for update;
  if not found or v_row.status<>'open' or v_row.severity<>'blocking' then
    raise exception using errcode='P0001', message='PAYROLL_EXCEPTION_NOT_FOUND';
  end if;
  update public.payroll_entry_exceptions set
    status='ignored',resolution_note=btrim(p_reason),resolved_by=v_actor,resolved_at=now()
  where id=p_exception_id;
  perform public.write_payroll_calculation_event(
    v_row.payroll_period_id,v_row.calculation_run_id,v_row.payroll_employee_entry_id,
    v_row.employee_id,'blocking_exception_ignored',v_actor,btrim(p_reason),
    jsonb_build_object('exception_id',p_exception_id,'exception_code',v_row.exception_code)
  );
  return true;
end;
$$;

create or replace function public.mark_employee_payroll_entries_stale(
  p_employee_id uuid,
  p_reason text,
  p_source_type public.payroll_source_type,
  p_source_record_id uuid,
  p_effective_date date default null
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_entry record; v_count integer:=0;
begin
  for v_entry in
    select entry.id,entry.payroll_period_id,entry.employee_id
    from public.payroll_employee_entries entry
    join public.payroll_periods period on period.id=entry.payroll_period_id
    where entry.employee_id=p_employee_id and entry.is_current
      and entry.status in ('calculated','recalculated','stale','exception')
      and period.status in ('open','under_review')
      and (p_effective_date is null or p_effective_date between period.period_start and period.period_end)
    for update of entry
  loop
    update public.payroll_employee_entries set
      status='stale',is_stale=true,stale_reason=left(coalesce(p_reason,'A payroll source changed.'),1000)
    where id=v_entry.id;
    perform public.write_payroll_calculation_event(
      v_entry.payroll_period_id,null,v_entry.id,v_entry.employee_id,'entry_marked_stale',auth.uid(),null,
      jsonb_build_object(
        'entry_id',v_entry.id,'source_type',p_source_type,
        'source_record_id',p_source_record_id,'effective_date',p_effective_date
      )
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.mark_payroll_stale_from_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid;
  v_source_id uuid;
  v_effective_date date;
  v_source_type public.payroll_source_type;
begin
  if tg_table_name='attendance_calculation_groups' then
    v_employee_id:=new.employee_id;
    v_source_id:=new.id;
    v_effective_date:=new.attendance_date;
    v_source_type:='attendance';
  elsif tg_table_name='leave_request_groups' then
    v_employee_id:=new.employee_id;
    v_source_id:=new.id;
    v_source_type:='leave';
  elsif tg_table_name='employee_compensation_records' then
    v_employee_id:=new.employee_id;
    v_source_id:=new.id;
    v_effective_date:=new.effective_from;
    v_source_type:='compensation';
  elsif tg_table_name='employee_payroll_schedule_assignments' then
    v_employee_id:=new.employee_id;
    v_source_id:=new.id;
    v_effective_date:=new.effective_from;
    v_source_type:='schedule_assignment';
  elsif tg_table_name='employee_schedule_assignments' then
    v_employee_id:=new.employee_id;
    v_source_id:=new.id;
    v_effective_date:=new.effective_start_date;
    v_source_type:='work_schedule';
  elsif tg_table_name='employees' then
    v_employee_id:=new.id;
    v_source_id:=v_employee_id;
    v_effective_date:=new.hire_date;
    v_source_type:='employment';
  elsif tg_table_name='overtime_approval_items' then
    select detection_group.employee_id,detection_group.attendance_date
      into v_employee_id,v_effective_date
    from public.overtime_detection_revisions detection_revision
    join public.overtime_detection_groups detection_group
      on detection_group.id=detection_revision.detection_group_id
    where detection_revision.id=new.detection_revision_id;
    v_source_id:=new.id;
    v_source_type:='overtime';
  else
    return new;
  end if;
  if v_employee_id is not null then
    perform public.mark_employee_payroll_entries_stale(
      v_employee_id,'A payroll source record changed.',v_source_type,v_source_id,v_effective_date
    );
  end if;
  return new;
end;
$$;

create trigger payroll_stale_attendance
  after insert or update on public.attendance_calculation_groups
  for each row execute function public.mark_payroll_stale_from_source();
create trigger payroll_stale_leave
  after insert or update on public.leave_request_groups
  for each row execute function public.mark_payroll_stale_from_source();
create trigger payroll_stale_overtime
  after insert or update on public.overtime_approval_items
  for each row execute function public.mark_payroll_stale_from_source();
create trigger payroll_stale_compensation
  after insert or update on public.employee_compensation_records
  for each row execute function public.mark_payroll_stale_from_source();
create trigger payroll_stale_payroll_assignment
  after insert or update on public.employee_payroll_schedule_assignments
  for each row execute function public.mark_payroll_stale_from_source();
create trigger payroll_stale_work_schedule_assignment
  after insert or update on public.employee_schedule_assignments
  for each row execute function public.mark_payroll_stale_from_source();
create trigger payroll_stale_employment
  after update on public.employees
  for each row execute function public.mark_payroll_stale_from_source();

create or replace function public.mark_payroll_stale_from_basis()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_entry record;
begin
  if coalesce(new.status,old.status)='approved' then
    for v_entry in
      select entry.id,entry.payroll_period_id,entry.employee_id
      from public.payroll_employee_entries entry
      join public.payroll_periods period on period.id=entry.payroll_period_id
      where entry.is_current and period.status in ('open','under_review')
        and period.period_end>=new.effective_from
      for update of entry
    loop
      update public.payroll_employee_entries set
        status='stale',is_stale=true,stale_reason='The effective payroll-basis rule changed.'
      where id=v_entry.id;
      perform public.write_payroll_calculation_event(
        v_entry.payroll_period_id,null,v_entry.id,v_entry.employee_id,'entry_marked_stale',auth.uid(),null,
        jsonb_build_object('entry_id',v_entry.id,'source_type','payroll_basis_rule','source_record_id',new.id)
      );
    end loop;
  end if;
  return new;
end;
$$;
create trigger payroll_stale_basis_rule
  after update on public.payroll_basis_rules
  for each row execute function public.mark_payroll_stale_from_basis();

create or replace function public.check_payroll_period_readiness(
  p_payroll_period_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_active_runs integer;
  v_blocking integer;
  v_stale integer;
  v_missing integer;
  v_ready boolean;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  select count(*) into v_active_runs from public.payroll_calculation_runs
    where payroll_period_id=p_payroll_period_id and status in ('queued','running');
  select count(*) into v_blocking from public.payroll_entry_exceptions
    where payroll_period_id=p_payroll_period_id and severity='blocking' and status='open';
  select count(*) into v_stale from public.payroll_employee_entries
    where payroll_period_id=p_payroll_period_id and is_current and (is_stale or status='stale');
  select count(*) into v_missing
  from public.employee_payroll_schedule_assignments assignment
  where assignment.payroll_schedule_id=v_period.payroll_schedule_id and assignment.status='approved'
    and assignment.effective_from<=v_period.period_end
    and (assignment.effective_to is null or assignment.effective_to>=v_period.period_start)
    and not exists(
      select 1 from public.payroll_employee_entries entry
      where entry.payroll_period_id=p_payroll_period_id and entry.employee_id=assignment.employee_id
        and entry.is_current and entry.status in ('calculated','recalculated') and not entry.is_stale
    )
    and not exists(
      select 1 from public.payroll_employee_exclusions exclusion
      where exclusion.payroll_period_id=p_payroll_period_id and exclusion.employee_id=assignment.employee_id
        and exclusion.reversed_at is null
    );
  v_ready:=v_active_runs=0 and v_blocking=0 and v_stale=0 and v_missing=0;
  return jsonb_build_object(
    'ready',v_ready,'activeRunCount',v_active_runs,'blockingExceptionCount',v_blocking,
    'staleEntryCount',v_stale,'missingEmployeeCount',v_missing
  );
end;
$$;

create or replace function public.payroll_basis_rule_json(p_rule public.payroll_basis_rules)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id',p_rule.id,'name',p_rule.name,'annual_divisor',p_rule.annual_divisor,
    'standard_hours_per_day',p_rule.standard_hours_per_day,'rounding_mode',p_rule.rounding_mode,
    'effective_from',p_rule.effective_from,'effective_to',p_rule.effective_to,
    'status',p_rule.status,'change_reason',p_rule.change_reason,'version',p_rule.version,
    'submitted_at',p_rule.submitted_at,'approved_at',p_rule.approved_at,
    'rejected_at',p_rule.rejected_at,'rejection_reason',p_rule.rejection_reason,
    'created_at',p_rule.created_at,'updated_at',p_rule.updated_at
  );
$$;

create or replace function public.payroll_calculation_run_json(p_run public.payroll_calculation_runs)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id',p_run.id,'payroll_period_id',p_run.payroll_period_id,'mode',p_run.mode,
    'status',p_run.status,'started_by',p_run.started_by,'started_at',p_run.started_at,
    'completed_at',p_run.completed_at,'eligible_employee_count',p_run.eligible_employee_count,
    'calculated_count',p_run.calculated_count,'exception_count',p_run.exception_count,
    'excluded_count',p_run.excluded_count,'stale_count',p_run.stale_count,
    'error_code',p_run.error_code,'safe_error_message',p_run.safe_error_message,
    'created_at',p_run.created_at
  );
$$;

create or replace function public.payroll_employee_entry_json(p_entry public.payroll_employee_entries)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id',p_entry.id,'payroll_period_id',p_entry.payroll_period_id,'employee_id',p_entry.employee_id,
    'calculation_run_id',p_entry.calculation_run_id,'version_number',p_entry.version_number,
    'previous_entry_id',p_entry.previous_entry_id,'is_current',p_entry.is_current,'status',p_entry.status,
    'compensation_type',p_entry.compensation_type,'currency_code',p_entry.currency_code,
    'period_start',p_entry.period_start,'period_end',p_entry.period_end,
    'employment_start',p_entry.employment_start,'employment_end',p_entry.employment_end,
    'eligible_start',p_entry.eligible_start,'eligible_end',p_entry.eligible_end,
    'monthly_salary',p_entry.monthly_salary,'hourly_rate',p_entry.hourly_rate,
    'annual_divisor',p_entry.annual_divisor,'standard_hours_per_day',p_entry.standard_hours_per_day,
    'standard_hours_per_week',p_entry.standard_hours_per_week,
    'eligible_workdays',p_entry.eligible_workdays,'eligible_minutes',p_entry.eligible_minutes,
    'payable_minutes',p_entry.payable_minutes,'approved_overtime_minutes',p_entry.approved_overtime_minutes,
    'regular_earnings_raw',p_entry.regular_earnings_raw,'regular_earnings_rounded',p_entry.regular_earnings_rounded,
    'absence_deduction_raw',p_entry.absence_deduction_raw,'absence_deduction_rounded',p_entry.absence_deduction_rounded,
    'late_deduction_raw',p_entry.late_deduction_raw,'late_deduction_rounded',p_entry.late_deduction_rounded,
    'undertime_deduction_raw',p_entry.undertime_deduction_raw,'undertime_deduction_rounded',p_entry.undertime_deduction_rounded,
    'overtime_input_amount',p_entry.overtime_input_amount,'paid_leave_amount',p_entry.paid_leave_amount,
    'unpaid_leave_deduction',p_entry.unpaid_leave_deduction,
    'gross_pay_raw',p_entry.gross_pay_raw,'gross_pay_rounded',p_entry.gross_pay_rounded,
    'is_stale',p_entry.is_stale,'stale_reason',p_entry.stale_reason,
    'calculated_at',p_entry.calculated_at,'created_at',p_entry.created_at,
    'active_exclusion_id',(
      select exclusion.id from public.payroll_employee_exclusions exclusion
      where exclusion.payroll_period_id=p_entry.payroll_period_id
        and exclusion.employee_id=p_entry.employee_id and exclusion.reversed_at is null
      order by exclusion.excluded_at desc limit 1
    )
  );
$$;

create or replace function public.list_payroll_basis_rules()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_rules jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(public.payroll_basis_rule_json(rule) order by rule.effective_from desc,rule.created_at desc),'[]'::jsonb)
    into v_rules from public.payroll_basis_rules rule;
  return jsonb_build_object(
    'rules',v_rules,
    'presets',jsonb_build_array(
      jsonb_build_object('code','261','name','261-day basis','annual_divisor',261,'standard_hours_per_day',8),
      jsonb_build_object('code','310','name','310-day basis','annual_divisor',310,'standard_hours_per_day',8),
      jsonb_build_object('code','313','name','313-day basis','annual_divisor',313,'standard_hours_per_day',8),
      jsonb_build_object('code','365','name','365-day basis','annual_divisor',365,'standard_hours_per_day',8)
    )
  );
end;
$$;

create or replace function public.get_payroll_calculation_workspace(p_payroll_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_schedule public.payroll_schedules%rowtype;
  v_latest_run public.payroll_calculation_runs%rowtype;
  v_entries jsonb;
  v_runs jsonb;
  v_readiness jsonb;
  v_excluded integer;
  v_exception_count integer;
  v_stale_count integer;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id;
  if not found then raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  select * into v_schedule from public.payroll_schedules where id=v_period.payroll_schedule_id;
  select * into v_latest_run from public.payroll_calculation_runs
    where payroll_period_id=p_payroll_period_id order by created_at desc,id desc limit 1;
  select coalesce(jsonb_agg(
    public.payroll_employee_entry_json(entry)
    || jsonb_build_object(
      'employee',public.payroll_employee_identity_json(entry.employee_id),
      'open_exception_count',(select count(*) from public.payroll_entry_exceptions exception where exception.payroll_employee_entry_id=entry.id and exception.status='open'),
      'blocking_exception_count',(select count(*) from public.payroll_entry_exceptions exception where exception.payroll_employee_entry_id=entry.id and exception.status='open' and exception.severity='blocking')
    ) order by (public.payroll_employee_identity_json(entry.employee_id)->>'full_name')
  ),'[]'::jsonb) into v_entries
  from public.payroll_employee_entries entry
  where entry.payroll_period_id=p_payroll_period_id and entry.is_current;
  select coalesce(jsonb_agg(public.payroll_calculation_run_json(run) order by run.created_at desc),'[]'::jsonb)
    into v_runs from public.payroll_calculation_runs run where run.payroll_period_id=p_payroll_period_id;
  select count(*) into v_excluded from public.payroll_employee_exclusions
    where payroll_period_id=p_payroll_period_id and reversed_at is null;
  select count(*) into v_exception_count from public.payroll_entry_exceptions
    where payroll_period_id=p_payroll_period_id and status='open';
  select count(*) into v_stale_count from public.payroll_employee_entries
    where payroll_period_id=p_payroll_period_id and is_current and (is_stale or status='stale');
  v_readiness:=public.check_payroll_period_readiness(p_payroll_period_id);
  return jsonb_build_object(
    'period',jsonb_build_object(
      'id',v_period.id,'period_code',v_period.period_code,'period_start',v_period.period_start,
      'period_end',v_period.period_end,'cutoff_date',v_period.cutoff_date,'payment_date',v_period.payment_date,
      'status',v_period.status,'version',v_period.version,'requires_recalculation',v_period.requires_recalculation,
      'payroll_schedule_id',v_period.payroll_schedule_id,'schedule_name',v_schedule.name,
      'schedule_code',v_schedule.code,'currency_code',v_schedule.currency_code
    ),
    'latest_run',case when v_latest_run.id is null then null else public.payroll_calculation_run_json(v_latest_run) end,
    'runs',v_runs,'entries',v_entries,'readiness',v_readiness,
    'summary',jsonb_build_object(
      'entry_count',jsonb_array_length(v_entries),'exception_count',v_exception_count,
      'stale_count',v_stale_count,'excluded_count',v_excluded
    )
  );
end;
$$;

create or replace function public.get_payroll_employee_calculation_detail(
  p_payroll_period_id uuid,
  p_employee_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_current public.payroll_employee_entries%rowtype; v_versions jsonb; v_daily jsonb; v_snapshots jsonb; v_exceptions jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select * into v_current from public.payroll_employee_entries
    where payroll_period_id=p_payroll_period_id and employee_id=p_employee_id and is_current;
  select coalesce(jsonb_agg(public.payroll_employee_entry_json(entry) order by entry.version_number desc),'[]'::jsonb)
    into v_versions from public.payroll_employee_entries entry
    where entry.payroll_period_id=p_payroll_period_id and entry.employee_id=p_employee_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',daily.id,'work_date',daily.work_date,'employment_eligible',daily.employment_eligible,
    'scheduled_workday',daily.scheduled_workday,'scheduled_minutes',daily.scheduled_minutes,
    'attendance_minutes',daily.attendance_minutes,'paid_leave_minutes',daily.paid_leave_minutes,
    'unpaid_leave_minutes',daily.unpaid_leave_minutes,'absence_minutes',daily.absence_minutes,
    'late_minutes',daily.late_minutes,'undertime_minutes',daily.undertime_minutes,
    'approved_overtime_minutes',daily.approved_overtime_minutes,'daily_rate_raw',daily.daily_rate_raw,
    'hourly_rate_raw',daily.hourly_rate_raw,'regular_earnings_raw',daily.regular_earnings_raw,
    'absence_deduction_raw',daily.absence_deduction_raw,'late_deduction_raw',daily.late_deduction_raw,
    'undertime_deduction_raw',daily.undertime_deduction_raw,
    'unpaid_leave_deduction_raw',daily.unpaid_leave_deduction_raw,
    'calculation_details',daily.calculation_details
  ) order by daily.work_date),'[]'::jsonb) into v_daily
  from public.payroll_entry_daily_breakdowns daily where daily.payroll_employee_entry_id=v_current.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',snapshot.id,'source_type',snapshot.source_type,'source_table',snapshot.source_table,
    'source_record_id',snapshot.source_record_id,'source_updated_at',snapshot.source_updated_at,
    'effective_date',snapshot.effective_date,'snapshot_hash',snapshot.snapshot_hash,
    'snapshot_data',snapshot.snapshot_data,'created_at',snapshot.created_at
  ) order by snapshot.source_type,snapshot.effective_date,snapshot.created_at),'[]'::jsonb) into v_snapshots
  from public.payroll_entry_input_snapshots snapshot where snapshot.payroll_employee_entry_id=v_current.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',exception.id,'exception_code',exception.exception_code,'severity',exception.severity,
    'message',exception.message,'source_type',exception.source_type,'source_record_id',exception.source_record_id,
    'status',exception.status,'resolution_note',exception.resolution_note,
    'resolved_at',exception.resolved_at,'created_at',exception.created_at
  ) order by exception.created_at desc),'[]'::jsonb) into v_exceptions
  from public.payroll_entry_exceptions exception
  where exception.payroll_period_id=p_payroll_period_id and exception.employee_id=p_employee_id;
  return jsonb_build_object(
    'employee',public.payroll_employee_identity_json(p_employee_id),
    'current_entry',case when v_current.id is null then null else public.payroll_employee_entry_json(v_current) end,
    'versions',v_versions,'daily_breakdowns',v_daily,'snapshots',v_snapshots,'exceptions',v_exceptions
  );
end;
$$;

create or replace function public.list_payroll_entry_exceptions(p_payroll_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_items jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode='P0001', message='PAYROLL_PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',exception.id,'payroll_period_id',exception.payroll_period_id,'employee_id',exception.employee_id,
    'employee',public.payroll_employee_identity_json(exception.employee_id),
    'calculation_run_id',exception.calculation_run_id,'payroll_employee_entry_id',exception.payroll_employee_entry_id,
    'exception_code',exception.exception_code,'severity',exception.severity,'message',exception.message,
    'source_type',exception.source_type,'source_record_id',exception.source_record_id,
    'status',exception.status,'resolution_note',exception.resolution_note,
    'resolved_at',exception.resolved_at,'created_at',exception.created_at
  ) order by case when exception.severity='blocking' then 0 else 1 end,exception.created_at desc),'[]'::jsonb)
  into v_items from public.payroll_entry_exceptions exception
  where exception.payroll_period_id=p_payroll_period_id;
  return jsonb_build_object('items',v_items);
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
  v_readiness jsonb;
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
  if v_row.status='open' and p_to_status='under_review' then
    v_readiness:=public.check_payroll_period_readiness(p_period_id);
    if not coalesce((v_readiness->>'ready')::boolean,false) then
      raise exception using errcode='P0001', message='PAYROLL_PERIOD_NOT_READY';
    end if;
  end if;
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

revoke all on function public.reject_payroll_calculation_mutation() from public,anon,authenticated;
revoke all on function public.write_payroll_calculation_event(uuid,uuid,uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.create_payroll_entry_exception(uuid,uuid,uuid,uuid,text,public.payroll_exception_severity,text,public.payroll_source_type,uuid) from public,anon,authenticated;
revoke all on function public.insert_payroll_snapshot(uuid,public.payroll_source_type,text,uuid,timestamptz,date,jsonb) from public,anon,authenticated;
revoke all on function public.round_payroll_amount(numeric,public.payroll_basis_rounding_mode) from public,anon,authenticated;
revoke all on function public.calculate_payroll_employee_internal(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.mark_employee_payroll_entries_stale(uuid,text,public.payroll_source_type,uuid,date) from public,anon,authenticated;
revoke all on function public.mark_payroll_stale_from_source() from public,anon,authenticated;
revoke all on function public.mark_payroll_stale_from_basis() from public,anon,authenticated;
revoke all on function public.payroll_basis_rule_json(public.payroll_basis_rules) from public,anon,authenticated;
revoke all on function public.payroll_calculation_run_json(public.payroll_calculation_runs) from public,anon,authenticated;
revoke all on function public.payroll_employee_entry_json(public.payroll_employee_entries) from public,anon,authenticated;

revoke all on function public.create_payroll_basis_rule(text,numeric,numeric,public.payroll_basis_rounding_mode,date,text,uuid) from public,anon;
grant execute on function public.create_payroll_basis_rule(text,numeric,numeric,public.payroll_basis_rounding_mode,date,text,uuid) to authenticated;
revoke all on function public.submit_payroll_basis_rule(uuid,integer,uuid) from public,anon;
grant execute on function public.submit_payroll_basis_rule(uuid,integer,uuid) to authenticated;
revoke all on function public.approve_payroll_basis_rule(uuid,integer,uuid) from public,anon;
grant execute on function public.approve_payroll_basis_rule(uuid,integer,uuid) to authenticated;
revoke all on function public.reject_payroll_basis_rule(uuid,integer,text,uuid) from public,anon;
grant execute on function public.reject_payroll_basis_rule(uuid,integer,text,uuid) to authenticated;
revoke all on function public.start_payroll_calculation_run(uuid,text,uuid[],uuid) from public,anon;
grant execute on function public.start_payroll_calculation_run(uuid,text,uuid[],uuid) to authenticated;
revoke all on function public.calculate_payroll_employee(uuid,uuid,uuid) from public,anon;
grant execute on function public.calculate_payroll_employee(uuid,uuid,uuid) to authenticated;
revoke all on function public.recalculate_payroll_employee(uuid,uuid,uuid) from public,anon;
grant execute on function public.recalculate_payroll_employee(uuid,uuid,uuid) to authenticated;
revoke all on function public.exclude_employee_from_payroll(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.exclude_employee_from_payroll(uuid,uuid,text,uuid) to authenticated;
revoke all on function public.reverse_payroll_exclusion(uuid,text,uuid) from public,anon;
grant execute on function public.reverse_payroll_exclusion(uuid,text,uuid) to authenticated;
revoke all on function public.resolve_payroll_exception(uuid,text,uuid) from public,anon;
grant execute on function public.resolve_payroll_exception(uuid,text,uuid) to authenticated;
revoke all on function public.ignore_blocking_payroll_exception(uuid,text,uuid) from public,anon;
grant execute on function public.ignore_blocking_payroll_exception(uuid,text,uuid) to authenticated;
revoke all on function public.check_payroll_period_readiness(uuid) from public,anon;
grant execute on function public.check_payroll_period_readiness(uuid) to authenticated;
revoke all on function public.list_payroll_basis_rules() from public,anon;
grant execute on function public.list_payroll_basis_rules() to authenticated;
revoke all on function public.get_payroll_calculation_workspace(uuid) from public,anon;
grant execute on function public.get_payroll_calculation_workspace(uuid) to authenticated;
revoke all on function public.get_payroll_employee_calculation_detail(uuid,uuid) from public,anon;
grant execute on function public.get_payroll_employee_calculation_detail(uuid,uuid) to authenticated;
revoke all on function public.list_payroll_entry_exceptions(uuid) from public,anon;
grant execute on function public.list_payroll_entry_exceptions(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
