-- Phase 10B.2A: Premium rules, attendance deduction policies, and immutable premium calculations.
-- New payroll_source_type enum values must be committed before they are used in table/function definitions.
alter type public.payroll_source_type add value if not exists 'premium_rule';
alter type public.payroll_source_type add value if not exists 'attendance_deduction_rule';
alter type public.payroll_source_type add value if not exists 'day_type_resolution';

begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.premium_rule_scope_type as enum (
    'company_default','employment_type','department','position','payroll_group'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.premium_day_type as enum (
    'regular_workday','rest_day','special_non_working_day','regular_holiday',
    'special_day_rest_day','regular_holiday_rest_day',
    'double_regular_holiday','double_regular_holiday_rest_day'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.premium_time_rounding_mode as enum (
    'exact_minutes','round_down','round_up','nearest_increment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.premium_type as enum (
    'rest_day','special_day','regular_holiday','special_day_rest_day',
    'regular_holiday_rest_day','double_holiday','double_holiday_rest_day',
    'regular_overtime','rest_day_overtime','special_day_overtime',
    'regular_holiday_overtime','combined_day_overtime','night_differential'
  );
exception when duplicate_object then null; end $$;

alter table public.holiday_calendar_versions
  add column if not exists holiday_count smallint not null default 1;

do $$ begin
  alter table public.holiday_calendar_versions
    add constraint holiday_calendar_versions_count_check
    check (holiday_count in (1,2));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.holiday_calendar_versions
    add constraint holiday_calendar_versions_double_regular_check
    check (holiday_count = 1 or holiday_type = 'regular_holiday');
exception when duplicate_object then null; end $$;

create table public.premium_rule_presets (
  code text primary key,
  name text not null,
  country_code text not null default 'PH' check (country_code = 'PH'),
  source_agency text not null,
  source_reference text not null,
  source_publication_date date not null,
  source_url text not null,
  day_rules jsonb not null,
  created_at timestamptz not null default now(),
  constraint premium_rule_preset_code_format check (code ~ '^[a-z0-9_]{3,80}$'),
  constraint premium_rule_preset_name_length check (char_length(btrim(name)) between 2 and 160),
  constraint premium_rule_preset_rules_array check (jsonb_typeof(day_rules) = 'array'),
  constraint premium_rule_preset_source_url check (source_url ~ '^https://')
);

create table public.premium_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id smallint not null default 1
    references public.payroll_settings(id) on delete restrict,
  supersedes_rule_set_id uuid references public.premium_rule_sets(id) on delete restrict,
  name text not null,
  scope_type public.premium_rule_scope_type not null,
  employment_type public.employment_type,
  department_id uuid references public.departments(id) on delete restrict,
  position_id uuid references public.job_titles(id) on delete restrict,
  payroll_group_id uuid references public.payroll_schedules(id) on delete restrict,
  scope_key text generated always as (
    case scope_type
      when 'company_default' then 'company_default'
      when 'employment_type' then 'employment_type:' || employment_type::text
      when 'department' then 'department:' || department_id::text
      when 'position' then 'position:' || position_id::text
      when 'payroll_group' then 'payroll_group:' || payroll_group_id::text
    end
  ) stored,
  effective_from date not null,
  effective_to date,
  status public.payroll_request_status not null default 'draft',
  change_reason text,
  version integer not null default 1 check (version >= 1),
  request_id uuid not null,
  source_agency text not null,
  source_reference text not null,
  source_publication_date date not null,
  source_url text not null,
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
  constraint premium_rule_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint premium_rule_effective_order check (effective_to is null or effective_to >= effective_from),
  constraint premium_rule_reason_length check (change_reason is null or char_length(change_reason) <= 1000),
  constraint premium_rule_rejection_length check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint premium_rule_source_required check (
    char_length(btrim(source_agency)) between 2 and 200
    and char_length(btrim(source_reference)) between 2 and 300
    and source_url ~ '^https://'
  ),
  constraint premium_rule_scope_target check (
    (scope_type = 'company_default' and employment_type is null and department_id is null and position_id is null and payroll_group_id is null)
    or (scope_type = 'employment_type' and employment_type is not null and department_id is null and position_id is null and payroll_group_id is null)
    or (scope_type = 'department' and employment_type is null and department_id is not null and position_id is null and payroll_group_id is null)
    or (scope_type = 'position' and employment_type is null and department_id is null and position_id is not null and payroll_group_id is null)
    or (scope_type = 'payroll_group' and employment_type is null and department_id is null and position_id is null and payroll_group_id is not null)
  ),
  constraint premium_rule_approved_no_overlap exclude using gist (
    organization_id with =,
    scope_key with =,
    daterange(effective_from, coalesce(effective_to + 1, 'infinity'::date), '[)') with &&
  ) where (status = 'approved')
);
create unique index premium_rule_request_unique on public.premium_rule_sets(created_by,request_id);
create index premium_rule_scope_effective_idx on public.premium_rule_sets(scope_key,status,effective_from desc,id desc);

create table public.premium_rule_versions (
  id uuid primary key default gen_random_uuid(),
  premium_rule_set_id uuid not null references public.premium_rule_sets(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  day_type public.premium_day_type not null,
  regular_time_multiplier numeric(8,5) not null check (regular_time_multiplier > 0 and regular_time_multiplier <= 10),
  overtime_multiplier numeric(8,5) not null check (overtime_multiplier > 0 and overtime_multiplier <= 10),
  additional_premium_only boolean not null default true,
  night_differential_percentage numeric(8,5) not null check (night_differential_percentage >= 0 and night_differential_percentage <= 5),
  night_window_start time not null,
  night_window_end time not null,
  overtime_rounding_mode public.premium_time_rounding_mode not null,
  overtime_rounding_increment_minutes integer check (overtime_rounding_increment_minutes is null or overtime_rounding_increment_minutes between 1 and 1440),
  night_rounding_mode public.premium_time_rounding_mode not null,
  night_rounding_increment_minutes integer check (night_rounding_increment_minutes is null or night_rounding_increment_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  constraint premium_rule_day_unique unique (premium_rule_set_id,day_type),
  constraint premium_rule_overtime_increment_required check (
    (overtime_rounding_mode='exact_minutes' and overtime_rounding_increment_minutes is null)
    or (overtime_rounding_mode<>'exact_minutes' and overtime_rounding_increment_minutes is not null)
  ),
  constraint premium_rule_night_increment_required check (
    (night_rounding_mode='exact_minutes' and night_rounding_increment_minutes is null)
    or (night_rounding_mode<>'exact_minutes' and night_rounding_increment_minutes is not null)
  ),
  constraint premium_rule_night_window_nonzero check (night_window_start <> night_window_end)
);
create index premium_rule_versions_set_idx on public.premium_rule_versions(premium_rule_set_id,day_type);

create table public.attendance_deduction_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id smallint not null default 1 references public.payroll_settings(id) on delete restrict,
  supersedes_rule_id uuid references public.attendance_deduction_rules(id) on delete restrict,
  scope_type public.premium_rule_scope_type not null,
  employment_type public.employment_type,
  department_id uuid references public.departments(id) on delete restrict,
  position_id uuid references public.job_titles(id) on delete restrict,
  payroll_group_id uuid references public.payroll_schedules(id) on delete restrict,
  scope_key text generated always as (
    case scope_type
      when 'company_default' then 'company_default'
      when 'employment_type' then 'employment_type:' || employment_type::text
      when 'department' then 'department:' || department_id::text
      when 'position' then 'position:' || position_id::text
      when 'payroll_group' then 'payroll_group:' || payroll_group_id::text
    end
  ) stored,
  late_grace_minutes integer not null check (late_grace_minutes between 0 and 1440),
  undertime_grace_minutes integer not null check (undertime_grace_minutes between 0 and 1440),
  late_rounding_mode public.premium_time_rounding_mode not null,
  late_rounding_increment_minutes integer check (late_rounding_increment_minutes is null or late_rounding_increment_minutes between 1 and 1440),
  undertime_rounding_mode public.premium_time_rounding_mode not null,
  undertime_rounding_increment_minutes integer check (undertime_rounding_increment_minutes is null or undertime_rounding_increment_minutes between 1 and 1440),
  deduct_beyond_grace_only boolean not null default true check (deduct_beyond_grace_only),
  effective_from date not null,
  effective_to date,
  status public.payroll_request_status not null default 'draft',
  change_reason text,
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
  constraint attendance_deduction_effective_order check (effective_to is null or effective_to >= effective_from),
  constraint attendance_deduction_reason_length check (change_reason is null or char_length(change_reason) <= 1000),
  constraint attendance_deduction_rejection_length check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint attendance_deduction_scope_target check (
    (scope_type = 'company_default' and employment_type is null and department_id is null and position_id is null and payroll_group_id is null)
    or (scope_type = 'employment_type' and employment_type is not null and department_id is null and position_id is null and payroll_group_id is null)
    or (scope_type = 'department' and employment_type is null and department_id is not null and position_id is null and payroll_group_id is null)
    or (scope_type = 'position' and employment_type is null and department_id is null and position_id is not null and payroll_group_id is null)
    or (scope_type = 'payroll_group' and employment_type is null and department_id is null and position_id is null and payroll_group_id is not null)
  ),
  constraint attendance_deduction_late_increment_required check (
    (late_rounding_mode='exact_minutes' and late_rounding_increment_minutes is null)
    or (late_rounding_mode<>'exact_minutes' and late_rounding_increment_minutes is not null)
  ),
  constraint attendance_deduction_under_increment_required check (
    (undertime_rounding_mode='exact_minutes' and undertime_rounding_increment_minutes is null)
    or (undertime_rounding_mode<>'exact_minutes' and undertime_rounding_increment_minutes is not null)
  ),
  constraint attendance_deduction_approved_no_overlap exclude using gist (
    organization_id with =,
    scope_key with =,
    daterange(effective_from,coalesce(effective_to + 1,'infinity'::date),'[)') with &&
  ) where (status='approved')
);
create unique index attendance_deduction_request_unique on public.attendance_deduction_rules(created_by,request_id);
create index attendance_deduction_scope_effective_idx on public.attendance_deduction_rules(scope_key,status,effective_from desc,id desc);

alter table public.payroll_employee_entries
  add column if not exists premium_earnings_raw numeric(18,6) not null default 0,
  add column if not exists premium_earnings_rounded numeric(14,2) not null default 0,
  add column if not exists night_differential_raw numeric(18,6) not null default 0,
  add column if not exists night_differential_rounded numeric(14,2) not null default 0,
  add column if not exists revised_gross_pay_raw numeric(18,6) not null default 0,
  add column if not exists revised_gross_pay_rounded numeric(14,2) not null default 0,
  add column if not exists premium_calculated_at timestamptz;

alter table public.payroll_entry_daily_breakdowns
  add column if not exists attendance_deduction_rule_id uuid references public.attendance_deduction_rules(id) on delete restrict,
  add column if not exists late_grace_minutes integer not null default 0,
  add column if not exists late_deductible_minutes integer not null default 0,
  add column if not exists undertime_grace_minutes integer not null default 0,
  add column if not exists undertime_deductible_minutes integer not null default 0;

create table public.payroll_day_type_resolutions (
  id uuid primary key default gen_random_uuid(),
  payroll_employee_entry_id uuid not null references public.payroll_employee_entries(id) on delete restrict,
  work_date date not null,
  base_day_type public.premium_day_type not null,
  is_rest_day boolean not null,
  holiday_version_id uuid references public.holiday_calendar_versions(id) on delete restrict,
  holiday_type text,
  holiday_count smallint not null default 1 check (holiday_count in (1,2)),
  combined_day_type public.premium_day_type not null,
  resolution_source jsonb not null default '{}'::jsonb check (jsonb_typeof(resolution_source)='object'),
  premium_rule_set_id uuid not null references public.premium_rule_sets(id) on delete restrict,
  premium_rule_version_id uuid not null references public.premium_rule_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payroll_day_type_entry_date_unique unique (payroll_employee_entry_id,work_date)
);
create index payroll_day_type_entry_idx on public.payroll_day_type_resolutions(payroll_employee_entry_id,work_date);

create table public.payroll_premium_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_employee_entry_id uuid not null references public.payroll_employee_entries(id) on delete restrict,
  payroll_entry_daily_breakdown_id uuid not null references public.payroll_entry_daily_breakdowns(id) on delete restrict,
  work_date date not null,
  premium_type public.premium_type not null,
  day_type public.premium_day_type not null,
  premium_rule_set_id uuid not null references public.premium_rule_sets(id) on delete restrict,
  premium_rule_version_id uuid not null references public.premium_rule_versions(id) on delete restrict,
  base_hourly_rate_raw numeric(18,9) not null,
  raw_minutes integer not null check (raw_minutes >= 0),
  rounded_minutes integer not null check (rounded_minutes >= 0),
  day_multiplier numeric(8,5) not null,
  overtime_multiplier numeric(8,5) not null,
  night_percentage numeric(8,5) not null,
  base_amount_raw numeric(18,6) not null,
  premium_amount_raw numeric(18,6) not null,
  premium_amount_rounded numeric(14,2) not null,
  is_additional_only boolean not null,
  calculation_details jsonb not null default '{}'::jsonb check (jsonb_typeof(calculation_details)='object'),
  created_at timestamptz not null default now(),
  constraint payroll_premium_line_unique unique (payroll_employee_entry_id,work_date,premium_type)
);
create index payroll_premium_lines_entry_date_idx on public.payroll_premium_lines(payroll_employee_entry_id,work_date,premium_type);

create table public.premium_rule_events (
  id uuid primary key default gen_random_uuid(),
  premium_rule_set_id uuid references public.premium_rule_sets(id) on delete restrict,
  premium_rule_version_id uuid references public.premium_rule_versions(id) on delete restrict,
  attendance_deduction_rule_id uuid references public.attendance_deduction_rules(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  previous_values jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_values)='object'),
  new_values jsonb not null default '{}'::jsonb check (jsonb_typeof(new_values)='object'),
  created_at timestamptz not null default now(),
  constraint premium_rule_event_target check (
    (premium_rule_set_id is not null and attendance_deduction_rule_id is null)
    or (premium_rule_set_id is null and attendance_deduction_rule_id is not null)
  ),
  constraint premium_rule_event_type check (event_type ~ '^[a-z0-9_]{3,80}$'),
  constraint premium_rule_event_reason_length check (reason is null or char_length(reason) <= 1000)
);
create index premium_rule_events_rule_created_idx on public.premium_rule_events(premium_rule_set_id,created_at desc);
create index premium_rule_events_attendance_created_idx on public.premium_rule_events(attendance_deduction_rule_id,created_at desc);

create table public.premium_calculation_events (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  payroll_employee_entry_id uuid references public.payroll_employee_entries(id) on delete restrict,
  payroll_premium_line_id uuid references public.payroll_premium_lines(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint premium_calculation_event_type check (event_type ~ '^[a-z0-9_]{3,80}$'),
  constraint premium_calculation_event_reason_length check (reason is null or char_length(reason) <= 1000)
);
create index premium_calculation_events_period_idx on public.premium_calculation_events(payroll_period_id,created_at desc);
create index premium_calculation_events_entry_idx on public.premium_calculation_events(payroll_employee_entry_id,created_at desc);

create or replace function public.reject_premium_calculation_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode='P0001', message='PAYROLL_PREMIUM_IMMUTABLE';
end;
$$;

create or replace function public.reject_approved_premium_rule_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op='DELETE' and old.status in ('approved','superseded','rejected','cancelled') then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_IMMUTABLE';
  end if;
  if old.status='approved' and new.status='superseded'
     and (to_jsonb(new)-array['status','effective_to','updated_at']::text[])=(to_jsonb(old)-array['status','effective_to','updated_at']::text[])
     and (
       new.effective_to is not distinct from old.effective_to
       or (
         new.effective_to is not null
         and new.effective_to >= old.effective_from
         and (old.effective_to is null or new.effective_to <= old.effective_to)
       )
     ) then return new; end if;
  if old.status in ('approved','superseded','rejected','cancelled') then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger premium_rule_presets_immutable
before update or delete on public.premium_rule_presets
for each row execute function public.reject_premium_calculation_mutation();
create trigger payroll_day_type_resolutions_immutable
before update or delete on public.payroll_day_type_resolutions
for each row execute function public.reject_premium_calculation_mutation();
create trigger payroll_premium_lines_immutable
before update or delete on public.payroll_premium_lines
for each row execute function public.reject_premium_calculation_mutation();
create trigger premium_rule_events_immutable
before update or delete on public.premium_rule_events
for each row execute function public.reject_premium_calculation_mutation();
create trigger premium_calculation_events_immutable
before update or delete on public.premium_calculation_events
for each row execute function public.reject_premium_calculation_mutation();
create trigger premium_rule_sets_approved_immutable
before update or delete on public.premium_rule_sets
for each row execute function public.reject_approved_premium_rule_mutation();
create or replace function public.reject_approved_premium_rule_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare parent_status public.payroll_request_status;
begin
  select status into parent_status
  from public.premium_rule_sets
  where id=old.premium_rule_set_id;
  if parent_status in ('approved','superseded','rejected','cancelled') then
    raise exception using errcode='P0001', message='PAYROLL_PREMIUM_RULE_IMMUTABLE';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger premium_rule_versions_approved_immutable
before update or delete on public.premium_rule_versions
for each row execute function public.reject_approved_premium_rule_version_mutation();

create trigger attendance_deduction_rules_approved_immutable
before update or delete on public.attendance_deduction_rules
for each row execute function public.reject_approved_premium_rule_mutation();

alter table public.premium_rule_presets enable row level security;
alter table public.premium_rule_sets enable row level security;
alter table public.premium_rule_versions enable row level security;
alter table public.attendance_deduction_rules enable row level security;
alter table public.payroll_day_type_resolutions enable row level security;
alter table public.payroll_premium_lines enable row level security;
alter table public.premium_rule_events enable row level security;
alter table public.premium_calculation_events enable row level security;

create policy "HR reads premium rule presets" on public.premium_rule_presets
for select to authenticated using (public.is_hr_admin());
create policy "HR reads premium rule sets" on public.premium_rule_sets
for select to authenticated using (public.is_hr_admin());
create policy "HR reads premium rule versions" on public.premium_rule_versions
for select to authenticated using (public.is_hr_admin());
create policy "HR reads attendance deduction rules" on public.attendance_deduction_rules
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll day type resolutions" on public.payroll_day_type_resolutions
for select to authenticated using (public.is_hr_admin());
create policy "HR reads payroll premium lines" on public.payroll_premium_lines
for select to authenticated using (public.is_hr_admin());
create policy "HR reads premium rule events" on public.premium_rule_events
for select to authenticated using (public.is_hr_admin());
create policy "HR reads premium calculation events" on public.premium_calculation_events
for select to authenticated using (public.is_hr_admin());

revoke all on public.premium_rule_presets from authenticated;
revoke all on public.premium_rule_sets from authenticated;
revoke all on public.premium_rule_versions from authenticated;
revoke all on public.attendance_deduction_rules from authenticated;
revoke all on public.payroll_day_type_resolutions from authenticated;
revoke all on public.payroll_premium_lines from authenticated;
revoke all on public.premium_rule_events from authenticated;
revoke all on public.premium_calculation_events from authenticated;
grant select on public.premium_rule_presets to authenticated;
grant select on public.premium_rule_sets to authenticated;
grant select on public.premium_rule_versions to authenticated;
grant select on public.attendance_deduction_rules to authenticated;
grant select on public.payroll_day_type_resolutions to authenticated;
grant select on public.payroll_premium_lines to authenticated;
grant select on public.premium_rule_events to authenticated;
grant select on public.premium_calculation_events to authenticated;

insert into public.premium_rule_presets(
  code,name,country_code,source_agency,source_reference,source_publication_date,source_url,day_rules
) values (
  'ph_dole_2024_reference',
  'Philippine statutory premium reference',
  'PH',
  'DOLE/Bureau of Working Conditions',
  'Handbook on Workers'' Statutory Monetary Benefits, 2024 Edition',
  date '2024-11-01',
  'https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf',
  jsonb_build_array(
    jsonb_build_object('day_type','regular_workday','regular_time_multiplier',1.00,'overtime_multiplier',1.25,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','rest_day','regular_time_multiplier',1.30,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','special_non_working_day','regular_time_multiplier',1.30,'overtime_multiplier',1.30,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','special_day_rest_day','regular_time_multiplier',1.50,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','regular_holiday','regular_time_multiplier',2.00,'overtime_multiplier',1.30,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','regular_holiday_rest_day','regular_time_multiplier',2.60,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','double_regular_holiday','regular_time_multiplier',3.00,'overtime_multiplier',1.30,'additional_premium_only',true,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null),
    jsonb_build_object('day_type','double_regular_holiday_rest_day','regular_time_multiplier',3.90,'overtime_multiplier',1.30,'additional_premium_only',false,'night_differential_percentage',0.10,'night_window_start','22:00','night_window_end','06:00','overtime_rounding_mode','exact_minutes','overtime_rounding_increment_minutes',null,'night_rounding_mode','exact_minutes','night_rounding_increment_minutes',null)
  )
) on conflict (code) do nothing;

create or replace function public.write_premium_rule_event(
  p_premium_rule_set_id uuid,
  p_premium_rule_version_id uuid,
  p_attendance_deduction_rule_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_reason text,
  p_previous_values jsonb,
  p_new_values jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  perform public.assert_safe_payroll_payload(coalesce(p_previous_values,'{}'::jsonb));
  perform public.assert_safe_payroll_payload(coalesce(p_new_values,'{}'::jsonb));
  insert into public.premium_rule_events(
    premium_rule_set_id,premium_rule_version_id,attendance_deduction_rule_id,
    event_type,actor_user_id,reason,previous_values,new_values
  ) values (
    p_premium_rule_set_id,p_premium_rule_version_id,p_attendance_deduction_rule_id,
    p_event_type,p_actor_user_id,nullif(btrim(coalesce(p_reason,'')),''),
    coalesce(p_previous_values,'{}'::jsonb),coalesce(p_new_values,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.write_premium_calculation_event(
  p_payroll_period_id uuid,
  p_payroll_employee_entry_id uuid,
  p_payroll_premium_line_id uuid,
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
  insert into public.premium_calculation_events(
    payroll_period_id,payroll_employee_entry_id,payroll_premium_line_id,employee_id,
    event_type,actor_user_id,reason,metadata
  ) values (
    p_payroll_period_id,p_payroll_employee_entry_id,p_payroll_premium_line_id,p_employee_id,
    p_event_type,p_actor_user_id,nullif(btrim(coalesce(p_reason,'')),''),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.validate_premium_rule_scope(
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_scope_type='company_default' and p_employment_type is null and p_department_id is null and p_position_id is null and p_payroll_group_id is null then return 'company_default'; end if;
  if p_scope_type='employment_type' and p_employment_type is not null and p_department_id is null and p_position_id is null and p_payroll_group_id is null then return 'employment_type:'||p_employment_type::text; end if;
  if p_scope_type='department' and p_employment_type is null and p_department_id is not null and p_position_id is null and p_payroll_group_id is null then return 'department:'||p_department_id::text; end if;
  if p_scope_type='position' and p_employment_type is null and p_department_id is null and p_position_id is not null and p_payroll_group_id is null then return 'position:'||p_position_id::text; end if;
  if p_scope_type='payroll_group' and p_employment_type is null and p_department_id is null and p_position_id is null and p_payroll_group_id is not null then return 'payroll_group:'||p_payroll_group_id::text; end if;
  raise exception using errcode='P0001', message='PAYROLL_PREMIUM_SCOPE_INVALID';
end;
$$;

create or replace function public.validate_premium_day_rules(p_day_rules jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer; v_distinct integer; v_row jsonb; v_mode text; v_increment integer;
begin
  if jsonb_typeof(p_day_rules)<>'array' or jsonb_array_length(p_day_rules)<>8 then
    raise exception using errcode='P0001', message='PAYROLL_PREMIUM_RULE_INVALID';
  end if;
  select count(*),count(distinct value->>'day_type') into v_count,v_distinct from jsonb_array_elements(p_day_rules);
  if v_count<>8 or v_distinct<>8 then raise exception using errcode='P0001', message='PAYROLL_PREMIUM_RULE_INVALID'; end if;
  for v_row in select value from jsonb_array_elements(p_day_rules) loop
    if (v_row->>'day_type') not in ('regular_workday','rest_day','special_non_working_day','regular_holiday','special_day_rest_day','regular_holiday_rest_day','double_regular_holiday','double_regular_holiday_rest_day') then
      raise exception using errcode='P0001', message='PAYROLL_PREMIUM_RULE_INVALID';
    end if;
    if coalesce((v_row->>'regular_time_multiplier')::numeric,0)<=0 or coalesce((v_row->>'regular_time_multiplier')::numeric,0)>10
       or coalesce((v_row->>'overtime_multiplier')::numeric,0)<=0 or coalesce((v_row->>'overtime_multiplier')::numeric,0)>10
       or coalesce((v_row->>'night_differential_percentage')::numeric,-1)<0 or coalesce((v_row->>'night_differential_percentage')::numeric,0)>5 then
      raise exception using errcode='P0001', message='PAYROLL_PREMIUM_RULE_INVALID';
    end if;
    perform (v_row->>'night_window_start')::time;
    perform (v_row->>'night_window_end')::time;
    if (v_row->>'night_window_start')::time = (v_row->>'night_window_end')::time then
      raise exception using errcode='P0001', message='INVALID_NIGHT_WINDOW';
    end if;
    v_mode:=v_row->>'overtime_rounding_mode';
    if v_mode not in ('exact_minutes','round_down','round_up','nearest_increment') then raise exception using errcode='P0001', message='PAYROLL_PREMIUM_ROUNDING_INVALID'; end if;
    v_increment:=nullif(v_row->>'overtime_rounding_increment_minutes','')::integer;
    if (v_mode='exact_minutes' and v_increment is not null) or (v_mode<>'exact_minutes' and coalesce(v_increment,0) not between 1 and 1440) then raise exception using errcode='P0001', message='PAYROLL_PREMIUM_ROUNDING_INVALID'; end if;
    v_mode:=v_row->>'night_rounding_mode';
    if v_mode not in ('exact_minutes','round_down','round_up','nearest_increment') then raise exception using errcode='P0001', message='PAYROLL_PREMIUM_ROUNDING_INVALID'; end if;
    v_increment:=nullif(v_row->>'night_rounding_increment_minutes','')::integer;
    if (v_mode='exact_minutes' and v_increment is not null) or (v_mode<>'exact_minutes' and coalesce(v_increment,0) not between 1 and 1440) then raise exception using errcode='P0001', message='PAYROLL_PREMIUM_ROUNDING_INVALID'; end if;
  end loop;
end;
$$;

create or replace function public.create_premium_rule_set(
  p_name text,
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_source_agency text,
  p_source_reference text,
  p_source_publication_date date,
  p_source_url text,
  p_day_rules jsonb,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=auth.uid(); v_id uuid; v_row jsonb; v_scope text;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  v_scope:=public.validate_premium_rule_scope(p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id);
  perform public.validate_premium_day_rules(p_day_rules);
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120
    or p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from)
    or nullif(btrim(coalesce(p_change_reason,'')),'') is null
    or nullif(btrim(coalesce(p_source_agency,'')),'') is null
    or nullif(btrim(coalesce(p_source_reference,'')),'') is null
    or p_source_publication_date is null or coalesce(p_source_url,'') !~ '^https://' then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_INVALID';
  end if;
  select id into v_id from public.premium_rule_sets where created_by=v_actor and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  insert into public.premium_rule_sets(
    name,scope_type,employment_type,department_id,position_id,payroll_group_id,
    effective_from,effective_to,status,change_reason,version,request_id,
    source_agency,source_reference,source_publication_date,source_url,created_by
  ) values (
    btrim(p_name),p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id,
    p_effective_from,p_effective_to,'draft',btrim(p_change_reason),1,p_request_id,
    btrim(p_source_agency),btrim(p_source_reference),p_source_publication_date,p_source_url,v_actor
  ) returning id into v_id;
  for v_row in select value from jsonb_array_elements(p_day_rules) loop
    insert into public.premium_rule_versions(
      premium_rule_set_id,version_number,day_type,regular_time_multiplier,overtime_multiplier,
      additional_premium_only,night_differential_percentage,night_window_start,night_window_end,
      overtime_rounding_mode,overtime_rounding_increment_minutes,night_rounding_mode,night_rounding_increment_minutes
    ) values (
      v_id,1,(v_row->>'day_type')::public.premium_day_type,
      (v_row->>'regular_time_multiplier')::numeric,(v_row->>'overtime_multiplier')::numeric,
      coalesce((v_row->>'additional_premium_only')::boolean,true),
      (v_row->>'night_differential_percentage')::numeric,
      (v_row->>'night_window_start')::time,(v_row->>'night_window_end')::time,
      (v_row->>'overtime_rounding_mode')::public.premium_time_rounding_mode,
      nullif(v_row->>'overtime_rounding_increment_minutes','')::integer,
      (v_row->>'night_rounding_mode')::public.premium_time_rounding_mode,
      nullif(v_row->>'night_rounding_increment_minutes','')::integer
    );
  end loop;
  perform public.write_premium_rule_event(v_id,null,null,'created',v_actor,null,'{}'::jsonb,jsonb_build_object('scope_key',v_scope,'status','draft'));
  return v_id;
end;
$$;

create or replace function public.clone_premium_rule_preset(
  p_preset_code text,
  p_name text,
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_preset public.premium_rule_presets%rowtype;
begin
  select * into v_preset from public.premium_rule_presets where code=p_preset_code;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  return public.create_premium_rule_set(
    coalesce(nullif(btrim(p_name),''),v_preset.name),p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id,
    p_effective_from,p_effective_to,p_change_reason,v_preset.source_agency,v_preset.source_reference,
    v_preset.source_publication_date,v_preset.source_url,v_preset.day_rules,p_request_id
  );
end;
$$;

create or replace function public.clone_premium_rule_version(
  p_rule_set_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_source public.premium_rule_sets%rowtype; v_new uuid; v_actor uuid:=auth.uid(); v_rules jsonb;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_source from public.premium_rule_sets where id=p_rule_set_id;
  if not found or v_source.status not in ('approved','rejected','superseded') then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  select jsonb_agg(jsonb_build_object(
    'day_type',day_type,'regular_time_multiplier',regular_time_multiplier,'overtime_multiplier',overtime_multiplier,
    'additional_premium_only',additional_premium_only,'night_differential_percentage',night_differential_percentage,
    'night_window_start',to_char(night_window_start,'HH24:MI'),'night_window_end',to_char(night_window_end,'HH24:MI'),
    'overtime_rounding_mode',overtime_rounding_mode,'overtime_rounding_increment_minutes',overtime_rounding_increment_minutes,
    'night_rounding_mode',night_rounding_mode,'night_rounding_increment_minutes',night_rounding_increment_minutes
  ) order by day_type::text) into v_rules from public.premium_rule_versions where premium_rule_set_id=p_rule_set_id;
  v_new:=public.create_premium_rule_set(
    v_source.name,v_source.scope_type,v_source.employment_type,v_source.department_id,v_source.position_id,v_source.payroll_group_id,
    p_effective_from,p_effective_to,p_change_reason,v_source.source_agency,v_source.source_reference,
    v_source.source_publication_date,v_source.source_url,v_rules,p_request_id
  );
  update public.premium_rule_sets set supersedes_rule_set_id=p_rule_set_id,version=v_source.version+1 where id=v_new;
  update public.premium_rule_versions set version_number=v_source.version+1 where premium_rule_set_id=v_new;
  return v_new;
end;
$$;

create or replace function public.update_premium_rule_set_draft(
  p_rule_set_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_source_agency text,
  p_source_reference text,
  p_source_publication_date date,
  p_source_url text,
  p_day_rules jsonb,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=auth.uid(); v_rule public.premium_rule_sets%rowtype; v_row jsonb; v_scope text;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_rule from public.premium_rule_sets where id=p_rule_set_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'draft' then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_IMMUTABLE'; end if;
  if p_expected_updated_at is null or v_rule.updated_at is distinct from p_expected_updated_at then raise exception using errcode='P0001',message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  v_scope:=public.validate_premium_rule_scope(p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id);
  perform public.validate_premium_day_rules(p_day_rules);
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120
    or p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from)
    or nullif(btrim(coalesce(p_change_reason,'')),'') is null
    or nullif(btrim(coalesce(p_source_agency,'')),'') is null
    or nullif(btrim(coalesce(p_source_reference,'')),'') is null
    or p_source_publication_date is null or coalesce(p_source_url,'') !~ '^https://' then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_INVALID';
  end if;
  update public.premium_rule_sets set
    name=btrim(p_name),scope_type=p_scope_type,employment_type=p_employment_type,
    department_id=p_department_id,position_id=p_position_id,payroll_group_id=p_payroll_group_id,
    effective_from=p_effective_from,effective_to=p_effective_to,change_reason=btrim(p_change_reason),
    source_agency=btrim(p_source_agency),source_reference=btrim(p_source_reference),
    source_publication_date=p_source_publication_date,source_url=p_source_url,updated_at=clock_timestamp()
  where id=p_rule_set_id;
  delete from public.premium_rule_versions where premium_rule_set_id=p_rule_set_id;
  for v_row in select value from jsonb_array_elements(p_day_rules) loop
    insert into public.premium_rule_versions(
      premium_rule_set_id,version_number,day_type,regular_time_multiplier,overtime_multiplier,
      additional_premium_only,night_differential_percentage,night_window_start,night_window_end,
      overtime_rounding_mode,overtime_rounding_increment_minutes,night_rounding_mode,night_rounding_increment_minutes
    ) values (
      p_rule_set_id,v_rule.version,(v_row->>'day_type')::public.premium_day_type,
      (v_row->>'regular_time_multiplier')::numeric,(v_row->>'overtime_multiplier')::numeric,
      coalesce((v_row->>'additional_premium_only')::boolean,true),(v_row->>'night_differential_percentage')::numeric,
      (v_row->>'night_window_start')::time,(v_row->>'night_window_end')::time,
      (v_row->>'overtime_rounding_mode')::public.premium_time_rounding_mode,
      nullif(v_row->>'overtime_rounding_increment_minutes','')::integer,
      (v_row->>'night_rounding_mode')::public.premium_time_rounding_mode,
      nullif(v_row->>'night_rounding_increment_minutes','')::integer
    );
  end loop;
  perform public.write_premium_rule_event(p_rule_set_id,null,null,'updated',v_actor,null,
    jsonb_build_object('scope_key',v_rule.scope_key,'updated_at',v_rule.updated_at),
    jsonb_build_object('scope_key',v_scope,'request_id',p_request_id));
  return true;
end;
$$;

create or replace function public.submit_premium_rule_set(
  p_rule_set_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.premium_rule_sets%rowtype;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_rule from public.premium_rule_sets where id=p_rule_set_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'draft' or v_rule.version<>p_expected_version then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  if (select count(*) from public.premium_rule_versions where premium_rule_set_id=p_rule_set_id)<>8 then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_INVALID'; end if;
  update public.premium_rule_sets set status='pending_approval',submitted_by=v_actor,submitted_at=now(),updated_at=now() where id=p_rule_set_id;
  perform public.write_premium_rule_event(p_rule_set_id,null,null,'submitted',v_actor,null,jsonb_build_object('status','draft'),jsonb_build_object('status','pending_approval'));
  perform public.notify_payroll_super_admins(
    'payroll_premium_rule_approval_required','Premium rule awaiting approval',
    'A premium rule was submitted for review.','premium_rule_set',p_rule_set_id,
    'premium-rule-submitted:'||p_rule_set_id::text,null,
    jsonb_build_object('rule_set_id',p_rule_set_id,'scope_type',v_rule.scope_type,'status','pending_approval'),
    '/payroll/approvals/premium-rules',p_request_id
  );
  return true;
end;
$$;

create or replace function public.approve_premium_rule_set(
  p_rule_set_id uuid,
  p_expected_version integer,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.premium_rule_sets%rowtype; v_conflict uuid; v_stale integer:=0;
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001',message='PAYROLL_APPROVER_REQUIRED'; end if;
  select * into v_rule from public.premium_rule_sets where id=p_rule_set_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'pending_approval' or v_rule.version<>p_expected_version then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  if (select count(*) from public.premium_rule_versions where premium_rule_set_id=p_rule_set_id)<>8 then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_INVALID'; end if;
  select id into v_conflict from public.premium_rule_sets other
  where other.id<>v_rule.id and other.organization_id=v_rule.organization_id and other.scope_key=v_rule.scope_key and other.status='approved'
    and daterange(other.effective_from,coalesce(other.effective_to+1,'infinity'::date),'[)') && daterange(v_rule.effective_from,coalesce(v_rule.effective_to+1,'infinity'::date),'[)')
  limit 1;
  if v_conflict is not null and v_conflict is distinct from v_rule.supersedes_rule_set_id then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_CONFLICT'; end if;
  if v_rule.supersedes_rule_set_id is not null then
    update public.premium_rule_sets
    set status='superseded',
        effective_to=case
          when effective_from < v_rule.effective_from
            and (effective_to is null or effective_to >= v_rule.effective_from)
          then v_rule.effective_from - 1
          else effective_to
        end,
        updated_at=now()
    where id=v_rule.supersedes_rule_set_id and status='approved';
  end if;
  update public.premium_rule_sets set status='approved',approved_by=v_actor,approved_at=now(),updated_at=now() where id=p_rule_set_id;
  perform public.write_premium_rule_event(p_rule_set_id,null,null,'approved',v_actor,null,jsonb_build_object('status','pending_approval'),jsonb_build_object('status','approved'));
  v_stale:=public.mark_payroll_entries_stale_for_premium_scope(
    v_rule.scope_type,v_rule.employment_type,v_rule.department_id,v_rule.position_id,v_rule.payroll_group_id,
    v_rule.effective_from,v_rule.effective_to,'Approved premium rule changed','premium_rule',v_rule.id
  );
  perform public.write_premium_rule_event(p_rule_set_id,null,null,'activated',v_actor,null,'{}'::jsonb,jsonb_build_object('affected_entry_count',v_stale));
  perform public.notify_payroll_admins(
    'payroll_premium_rule_approved','Premium rule approved',
    'A premium rule was approved and is ready for payroll use.','premium_rule_set',p_rule_set_id,
    'premium-rule-approved:'||p_rule_set_id::text,
    jsonb_build_object('rule_set_id',p_rule_set_id,'scope_type',v_rule.scope_type,'status','approved','affected_entry_count',v_stale),
    '/payroll/settings/premium-rules/'||p_rule_set_id::text,p_request_id
  );
  return true;
end;
$$;

create or replace function public.reject_premium_rule_set(
  p_rule_set_id uuid,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.premium_rule_sets%rowtype; v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001',message='PAYROLL_APPROVER_REQUIRED'; end if;
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='PAYROLL_REASON_REQUIRED'; end if;
  select * into v_rule from public.premium_rule_sets where id=p_rule_set_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'pending_approval' or v_rule.version<>p_expected_version then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  update public.premium_rule_sets set status='rejected',rejected_by=v_actor,rejected_at=now(),rejection_reason=v_reason,updated_at=now() where id=p_rule_set_id;
  perform public.write_premium_rule_event(p_rule_set_id,null,null,'rejected',v_actor,v_reason,jsonb_build_object('status','pending_approval'),jsonb_build_object('status','rejected'));
  perform public.notify_payroll_admins(
    'payroll_premium_rule_rejected','Premium rule rejected',
    'A submitted premium rule was rejected.','premium_rule_set',p_rule_set_id,
    'premium-rule-rejected:'||p_rule_set_id::text,
    jsonb_build_object('rule_set_id',p_rule_set_id,'scope_type',v_rule.scope_type,'status','rejected'),
    '/payroll/settings/premium-rules/'||p_rule_set_id::text,p_request_id
  );
  return true;
end;
$$;

create or replace function public.create_attendance_deduction_rule(
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_late_grace_minutes integer,
  p_undertime_grace_minutes integer,
  p_late_rounding_mode public.premium_time_rounding_mode,
  p_late_rounding_increment_minutes integer,
  p_undertime_rounding_mode public.premium_time_rounding_mode,
  p_undertime_rounding_increment_minutes integer,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_scope text;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  v_scope:=public.validate_premium_rule_scope(p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id);
  if p_late_grace_minutes not between 0 and 1440 or p_undertime_grace_minutes not between 0 and 1440
     or p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from)
     or nullif(btrim(coalesce(p_change_reason,'')),'') is null then
    raise exception using errcode='P0001',message='PAYROLL_ATTENDANCE_DEDUCTION_RULE_INVALID';
  end if;
  if (p_late_rounding_mode='exact_minutes' and p_late_rounding_increment_minutes is not null)
     or (p_late_rounding_mode<>'exact_minutes' and coalesce(p_late_rounding_increment_minutes,0) not between 1 and 1440)
     or (p_undertime_rounding_mode='exact_minutes' and p_undertime_rounding_increment_minutes is not null)
     or (p_undertime_rounding_mode<>'exact_minutes' and coalesce(p_undertime_rounding_increment_minutes,0) not between 1 and 1440) then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_ROUNDING_INVALID';
  end if;
  select id into v_id from public.attendance_deduction_rules where created_by=v_actor and request_id=p_request_id;
  if v_id is not null then return v_id; end if;
  insert into public.attendance_deduction_rules(
    scope_type,employment_type,department_id,position_id,payroll_group_id,
    late_grace_minutes,undertime_grace_minutes,late_rounding_mode,late_rounding_increment_minutes,
    undertime_rounding_mode,undertime_rounding_increment_minutes,deduct_beyond_grace_only,
    effective_from,effective_to,status,change_reason,version,request_id,created_by
  ) values (
    p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id,
    p_late_grace_minutes,p_undertime_grace_minutes,p_late_rounding_mode,p_late_rounding_increment_minutes,
    p_undertime_rounding_mode,p_undertime_rounding_increment_minutes,true,
    p_effective_from,p_effective_to,'draft',btrim(p_change_reason),1,p_request_id,v_actor
  ) returning id into v_id;
  perform public.write_premium_rule_event(null,null,v_id,'created',v_actor,null,'{}'::jsonb,jsonb_build_object('scope_key',v_scope,'status','draft'));
  return v_id;
end;
$$;

create or replace function public.clone_attendance_deduction_rule(
  p_rule_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_source public.attendance_deduction_rules%rowtype; v_new uuid;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_source from public.attendance_deduction_rules where id=p_rule_id;
  if not found or v_source.status not in ('approved','rejected','superseded') then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  v_new:=public.create_attendance_deduction_rule(
    v_source.scope_type,v_source.employment_type,v_source.department_id,v_source.position_id,v_source.payroll_group_id,
    v_source.late_grace_minutes,v_source.undertime_grace_minutes,v_source.late_rounding_mode,v_source.late_rounding_increment_minutes,
    v_source.undertime_rounding_mode,v_source.undertime_rounding_increment_minutes,
    p_effective_from,p_effective_to,p_change_reason,p_request_id
  );
  update public.attendance_deduction_rules set supersedes_rule_id=p_rule_id,version=v_source.version+1 where id=v_new;
  return v_new;
end;
$$;

create or replace function public.update_attendance_deduction_rule_draft(
  p_rule_id uuid,
  p_expected_updated_at timestamptz,
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_late_grace_minutes integer,
  p_undertime_grace_minutes integer,
  p_late_rounding_mode public.premium_time_rounding_mode,
  p_late_rounding_increment_minutes integer,
  p_undertime_rounding_mode public.premium_time_rounding_mode,
  p_undertime_rounding_increment_minutes integer,
  p_effective_from date,
  p_effective_to date,
  p_change_reason text,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.attendance_deduction_rules%rowtype; v_scope text;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_rule from public.attendance_deduction_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'draft' then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_IMMUTABLE'; end if;
  if p_expected_updated_at is null or v_rule.updated_at is distinct from p_expected_updated_at then raise exception using errcode='P0001',message='PAYROLL_REQUEST_VERSION_CONFLICT'; end if;
  v_scope:=public.validate_premium_rule_scope(p_scope_type,p_employment_type,p_department_id,p_position_id,p_payroll_group_id);
  if p_late_grace_minutes not between 0 and 1440 or p_undertime_grace_minutes not between 0 and 1440
     or p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from)
     or nullif(btrim(coalesce(p_change_reason,'')),'') is null then
    raise exception using errcode='P0001',message='PAYROLL_ATTENDANCE_DEDUCTION_RULE_INVALID';
  end if;
  if (p_late_rounding_mode='exact_minutes' and p_late_rounding_increment_minutes is not null)
     or (p_late_rounding_mode<>'exact_minutes' and coalesce(p_late_rounding_increment_minutes,0) not between 1 and 1440)
     or (p_undertime_rounding_mode='exact_minutes' and p_undertime_rounding_increment_minutes is not null)
     or (p_undertime_rounding_mode<>'exact_minutes' and coalesce(p_undertime_rounding_increment_minutes,0) not between 1 and 1440) then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_ROUNDING_INVALID';
  end if;
  update public.attendance_deduction_rules set
    scope_type=p_scope_type,employment_type=p_employment_type,department_id=p_department_id,
    position_id=p_position_id,payroll_group_id=p_payroll_group_id,
    late_grace_minutes=p_late_grace_minutes,undertime_grace_minutes=p_undertime_grace_minutes,
    late_rounding_mode=p_late_rounding_mode,late_rounding_increment_minutes=p_late_rounding_increment_minutes,
    undertime_rounding_mode=p_undertime_rounding_mode,undertime_rounding_increment_minutes=p_undertime_rounding_increment_minutes,
    effective_from=p_effective_from,effective_to=p_effective_to,change_reason=btrim(p_change_reason),updated_at=clock_timestamp()
  where id=p_rule_id;
  perform public.write_premium_rule_event(null,null,p_rule_id,'updated',v_actor,null,
    jsonb_build_object('scope_key',v_rule.scope_key,'updated_at',v_rule.updated_at),
    jsonb_build_object('scope_key',v_scope,'request_id',p_request_id));
  return true;
end;
$$;

create or replace function public.submit_attendance_deduction_rule(
  p_rule_id uuid,p_expected_version integer,p_request_id uuid
) returns boolean
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.attendance_deduction_rules%rowtype;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_rule from public.attendance_deduction_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'draft' or v_rule.version<>p_expected_version then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  update public.attendance_deduction_rules set status='pending_approval',submitted_by=v_actor,submitted_at=now(),updated_at=now() where id=p_rule_id;
  perform public.write_premium_rule_event(null,null,p_rule_id,'submitted',v_actor,null,jsonb_build_object('status','draft'),jsonb_build_object('status','pending_approval'));
  perform public.notify_payroll_super_admins(
    'payroll_attendance_rule_approval_required','Attendance deduction rule awaiting approval',
    'An attendance deduction rule was submitted for review.','attendance_deduction_rule',p_rule_id,
    'attendance-rule-submitted:'||p_rule_id::text,null,
    jsonb_build_object('rule_id',p_rule_id,'scope_type',v_rule.scope_type,'status','pending_approval'),
    '/payroll/approvals/premium-rules',p_request_id
  );
  return true;
end;
$$;

create or replace function public.approve_attendance_deduction_rule(
  p_rule_id uuid,p_expected_version integer,p_request_id uuid
) returns boolean
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.attendance_deduction_rules%rowtype; v_conflict uuid; v_stale integer:=0;
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001',message='PAYROLL_APPROVER_REQUIRED'; end if;
  select * into v_rule from public.attendance_deduction_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'pending_approval' or v_rule.version<>p_expected_version then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  select id into v_conflict from public.attendance_deduction_rules other
  where other.id<>v_rule.id and other.organization_id=v_rule.organization_id and other.scope_key=v_rule.scope_key and other.status='approved'
    and daterange(other.effective_from,coalesce(other.effective_to+1,'infinity'::date),'[)') && daterange(v_rule.effective_from,coalesce(v_rule.effective_to+1,'infinity'::date),'[)')
  limit 1;
  if v_conflict is not null and v_conflict is distinct from v_rule.supersedes_rule_id then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_CONFLICT'; end if;
  if v_rule.supersedes_rule_id is not null then
    update public.attendance_deduction_rules
    set status='superseded',
        effective_to=case
          when effective_from < v_rule.effective_from
            and (effective_to is null or effective_to >= v_rule.effective_from)
          then v_rule.effective_from - 1
          else effective_to
        end,
        updated_at=now()
    where id=v_rule.supersedes_rule_id and status='approved';
  end if;
  update public.attendance_deduction_rules set status='approved',approved_by=v_actor,approved_at=now(),updated_at=now() where id=p_rule_id;
  perform public.write_premium_rule_event(null,null,p_rule_id,'approved',v_actor,null,jsonb_build_object('status','pending_approval'),jsonb_build_object('status','approved'));
  v_stale:=public.mark_payroll_entries_stale_for_premium_scope(
    v_rule.scope_type,v_rule.employment_type,v_rule.department_id,v_rule.position_id,v_rule.payroll_group_id,
    v_rule.effective_from,v_rule.effective_to,'Approved attendance deduction rule changed','attendance_deduction_rule',v_rule.id
  );
  perform public.notify_payroll_admins(
    'payroll_attendance_rule_approved','Attendance deduction rule approved',
    'An attendance deduction rule was approved and is ready for payroll use.','attendance_deduction_rule',p_rule_id,
    'attendance-rule-approved:'||p_rule_id::text,
    jsonb_build_object('rule_id',p_rule_id,'scope_type',v_rule.scope_type,'status','approved','affected_entry_count',v_stale),
    '/payroll/settings/attendance-deduction-rules',p_request_id
  );
  return true;
end;
$$;

create or replace function public.reject_attendance_deduction_rule(
  p_rule_id uuid,p_expected_version integer,p_reason text,p_request_id uuid
) returns boolean
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_actor uuid:=auth.uid(); v_rule public.attendance_deduction_rules%rowtype; v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_actor is null or not public.is_super_admin() then raise exception using errcode='P0001',message='PAYROLL_APPROVER_REQUIRED'; end if;
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='PAYROLL_REASON_REQUIRED'; end if;
  select * into v_rule from public.attendance_deduction_rules where id=p_rule_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  if v_rule.status<>'pending_approval' or v_rule.version<>p_expected_version then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_STATUS_INVALID'; end if;
  update public.attendance_deduction_rules set status='rejected',rejected_by=v_actor,rejected_at=now(),rejection_reason=v_reason,updated_at=now() where id=p_rule_id;
  perform public.write_premium_rule_event(null,null,p_rule_id,'rejected',v_actor,v_reason,jsonb_build_object('status','pending_approval'),jsonb_build_object('status','rejected'));
  perform public.notify_payroll_admins(
    'payroll_attendance_rule_rejected','Attendance deduction rule rejected',
    'A submitted attendance deduction rule was rejected.','attendance_deduction_rule',p_rule_id,
    'attendance-rule-rejected:'||p_rule_id::text,
    jsonb_build_object('rule_id',p_rule_id,'scope_type',v_rule.scope_type,'status','rejected'),
    '/payroll/settings/attendance-deduction-rules',p_request_id
  );
  return true;
end;
$$;

create or replace function public.round_premium_minutes(
  p_minutes integer,
  p_mode public.premium_time_rounding_mode,
  p_increment integer
) returns integer
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare v_minutes integer:=greatest(coalesce(p_minutes,0),0);
begin
  if p_mode='exact_minutes' then return v_minutes; end if;
  if p_increment is null or p_increment<=0 then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_ROUNDING_INVALID'; end if;
  return case p_mode
    when 'round_down' then floor(v_minutes::numeric/p_increment)::integer*p_increment
    when 'round_up' then ceil(v_minutes::numeric/p_increment)::integer*p_increment
    when 'nearest_increment' then round(v_minutes::numeric/p_increment)::integer*p_increment
    else v_minutes
  end;
end;
$$;

create or replace function public.resolve_employee_premium_rule(
  p_employee_id uuid,
  p_payroll_period_id uuid,
  p_work_date date,
  p_day_type public.premium_day_type
) returns table (
  premium_rule_set_id uuid,
  premium_rule_version_id uuid,
  scope_type public.premium_rule_scope_type,
  scope_key text,
  regular_time_multiplier numeric,
  overtime_multiplier numeric,
  additional_premium_only boolean,
  night_differential_percentage numeric,
  night_window_start time,
  night_window_end time,
  overtime_rounding_mode public.premium_time_rounding_mode,
  overtime_rounding_increment_minutes integer,
  night_rounding_mode public.premium_time_rounding_mode,
  night_rounding_increment_minutes integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_employee public.employees%rowtype; v_payroll_group uuid; v_count integer;
begin
  select * into v_employee from public.employees where id=p_employee_id;
  if not found then raise exception using errcode='P0001',message='PAYROLL_EMPLOYEE_NOT_FOUND'; end if;
  select assignment.payroll_schedule_id into v_payroll_group
  from public.employee_payroll_schedule_assignments assignment
  where assignment.employee_id=p_employee_id and assignment.status='approved'
    and assignment.effective_from<=p_work_date and (assignment.effective_to is null or assignment.effective_to>=p_work_date)
  order by assignment.effective_from desc limit 1;
  select count(*) into v_count
  from public.premium_rule_sets rule
  join public.premium_rule_versions version on version.premium_rule_set_id=rule.id and version.day_type=p_day_type
  where rule.status in ('approved','superseded') and rule.effective_from<=p_work_date and (rule.effective_to is null or rule.effective_to>=p_work_date)
    and (
      (rule.scope_type='payroll_group' and rule.payroll_group_id=v_payroll_group)
      or (rule.scope_type='position' and rule.position_id=v_employee.job_title_id)
      or (rule.scope_type='department' and rule.department_id=v_employee.department_id)
      or (rule.scope_type='employment_type' and rule.employment_type=v_employee.employment_type)
      or rule.scope_type='company_default'
    );
  if v_count=0 then
    if not exists(select 1 from public.premium_rule_sets rule where rule.status in ('approved','superseded') and rule.scope_type='company_default' and rule.effective_from<=p_work_date and (rule.effective_to is null or rule.effective_to>=p_work_date)) then
      raise exception using errcode='P0001',message='MISSING_COMPANY_DEFAULT_PREMIUM_RULE';
    end if;
    raise exception using errcode='P0001',message='MISSING_PREMIUM_RULE';
  end if;
  return query
  select rule.id,version.id,rule.scope_type,rule.scope_key,
    version.regular_time_multiplier,version.overtime_multiplier,version.additional_premium_only,
    version.night_differential_percentage,version.night_window_start,version.night_window_end,
    version.overtime_rounding_mode,version.overtime_rounding_increment_minutes,
    version.night_rounding_mode,version.night_rounding_increment_minutes
  from public.premium_rule_sets rule
  join public.premium_rule_versions version on version.premium_rule_set_id=rule.id and version.day_type=p_day_type
  where rule.status in ('approved','superseded') and rule.effective_from<=p_work_date and (rule.effective_to is null or rule.effective_to>=p_work_date)
    and (
      (rule.scope_type='payroll_group' and rule.payroll_group_id=v_payroll_group)
      or (rule.scope_type='position' and rule.position_id=v_employee.job_title_id)
      or (rule.scope_type='department' and rule.department_id=v_employee.department_id)
      or (rule.scope_type='employment_type' and rule.employment_type=v_employee.employment_type)
      or rule.scope_type='company_default'
    )
  order by case rule.scope_type
    when 'payroll_group' then 1
    when 'position' then 2
    when 'department' then 3
    when 'employment_type' then 4
    when 'company_default' then 5
  end,
    case when rule.status='approved' then 0 else 1 end,
    rule.effective_from desc,rule.id
  limit 1;
end;
$$;

create or replace function public.resolve_attendance_deduction_rule(
  p_employee_id uuid,
  p_work_date date
) returns table (
  rule_id uuid,
  scope_type public.premium_rule_scope_type,
  scope_key text,
  late_grace_minutes integer,
  undertime_grace_minutes integer,
  late_rounding_mode public.premium_time_rounding_mode,
  late_rounding_increment_minutes integer,
  undertime_rounding_mode public.premium_time_rounding_mode,
  undertime_rounding_increment_minutes integer,
  resolution_source text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_employee public.employees%rowtype; v_payroll_group uuid;
begin
  select * into v_employee from public.employees where id=p_employee_id;
  select assignment.payroll_schedule_id into v_payroll_group
  from public.employee_payroll_schedule_assignments assignment
  where assignment.employee_id=p_employee_id and assignment.status='approved'
    and assignment.effective_from<=p_work_date and (assignment.effective_to is null or assignment.effective_to>=p_work_date)
  order by assignment.effective_from desc limit 1;
  return query
  select rule.id,rule.scope_type,rule.scope_key,rule.late_grace_minutes,rule.undertime_grace_minutes,
    rule.late_rounding_mode,rule.late_rounding_increment_minutes,
    rule.undertime_rounding_mode,rule.undertime_rounding_increment_minutes,'approved_rule'::text
  from public.attendance_deduction_rules rule
  where rule.status in ('approved','superseded') and rule.effective_from<=p_work_date and (rule.effective_to is null or rule.effective_to>=p_work_date)
    and (
      (rule.scope_type='payroll_group' and rule.payroll_group_id=v_payroll_group)
      or (rule.scope_type='position' and rule.position_id=v_employee.job_title_id)
      or (rule.scope_type='department' and rule.department_id=v_employee.department_id)
      or (rule.scope_type='employment_type' and rule.employment_type=v_employee.employment_type)
      or rule.scope_type='company_default'
    )
  order by case rule.scope_type
    when 'payroll_group' then 1
    when 'position' then 2
    when 'department' then 3
    when 'employment_type' then 4
    when 'company_default' then 5
  end,
    case when rule.status='approved' then 0 else 1 end,
    rule.effective_from desc,rule.id limit 1;
  if not found then
    return query select null::uuid,'company_default'::public.premium_rule_scope_type,'virtual:phase10b1_zero_grace'::text,
      0,0,'exact_minutes'::public.premium_time_rounding_mode,null::integer,
      'exact_minutes'::public.premium_time_rounding_mode,null::integer,'phase10b1_zero_grace_default'::text;
  end if;
end;
$$;

create or replace function public.resolve_employee_day_type(
  p_employee_id uuid,
  p_payroll_period_id uuid,
  p_work_date date
) returns table (
  base_day_type public.premium_day_type,
  is_rest_day boolean,
  holiday_version_id uuid,
  holiday_type text,
  holiday_count smallint,
  combined_day_type public.premium_day_type,
  resolution_source jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment public.employee_schedule_assignments%rowtype;
  v_version public.work_schedule_versions%rowtype;
  v_holiday public.holiday_calendar_versions%rowtype;
  v_weekday text:=lower(to_char(p_work_date,'FMDay'));
  v_rest boolean:=true;
  v_base public.premium_day_type;
  v_combined public.premium_day_type;
begin
  select * into v_assignment from public.employee_schedule_assignments
  where employee_id=p_employee_id and not is_superseded
    and effective_start_date<=p_work_date and (effective_end_date is null or effective_end_date>=p_work_date)
  order by effective_start_date desc,id desc limit 1;
  if v_assignment.id is not null then
    select * into v_version from public.work_schedule_versions
    where schedule_template_id=v_assignment.schedule_template_id and effective_date<=p_work_date
    order by effective_date desc,id desc limit 1;
    if v_version.id is not null then v_rest:=not (v_weekday=any(v_version.working_days)); end if;
  end if;
  select version.* into v_holiday
  from public.holiday_calendar_groups group_row
  join public.holiday_calendar_versions version on version.id=group_row.active_version_id
  where version.holiday_date=p_work_date and version.is_active
  limit 1;
  if v_holiday.id is null then
    v_base:=case when v_rest then 'rest_day' else 'regular_workday' end;
    v_combined:=v_base;
  elsif v_holiday.holiday_type='company_holiday' then
    raise exception using errcode='P0001',message='MISSING_HOLIDAY_CONFIGURATION';
  elsif v_holiday.holiday_type='special_non_working_holiday' then
    if v_holiday.holiday_count<>1 then raise exception using errcode='P0001',message='MISSING_HOLIDAY_CONFIGURATION'; end if;
    v_base:='special_non_working_day';
    v_combined:=case when v_rest then 'special_day_rest_day' else 'special_non_working_day' end;
  elsif v_holiday.holiday_type='regular_holiday' and v_holiday.holiday_count=1 then
    v_base:='regular_holiday';
    v_combined:=case when v_rest then 'regular_holiday_rest_day' else 'regular_holiday' end;
  elsif v_holiday.holiday_type='regular_holiday' and v_holiday.holiday_count=2 then
    v_base:='double_regular_holiday';
    v_combined:=case when v_rest then 'double_regular_holiday_rest_day' else 'double_regular_holiday' end;
  else
    raise exception using errcode='P0001',message='MISSING_HOLIDAY_CONFIGURATION';
  end if;
  return query select v_base,v_rest,v_holiday.id,v_holiday.holiday_type,coalesce(v_holiday.holiday_count,1),v_combined,
    jsonb_build_object('schedule_assignment_id',v_assignment.id,'schedule_version_id',v_version.id,'weekday',v_weekday,
      'holiday_version_id',v_holiday.id,'holiday_type',v_holiday.holiday_type,'holiday_count',coalesce(v_holiday.holiday_count,1));
end;
$$;

create or replace function public.resolve_payroll_premium_segments(
  p_payroll_employee_entry_id uuid,
  p_work_date date
) returns table (
  segment_key text,
  segment_kind text,
  source_segment_type text,
  source_revision_id uuid,
  source_approval_item_id uuid,
  segment_start_at timestamptz,
  segment_end_at timestamptz,
  raw_minutes integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_entry public.payroll_employee_entries%rowtype; v_att public.attendance_calculation_revisions%rowtype; v_day record; v_standard integer; v_item record; v_ordinary integer; v_overtime integer; v_split timestamptz; v_has_full_day_approval boolean:=false;
begin
  select * into v_entry from public.payroll_employee_entries where id=p_payroll_employee_entry_id;
  if not found then return; end if;
  select * into v_day from public.resolve_employee_day_type(v_entry.employee_id,v_entry.payroll_period_id,p_work_date);
  v_standard:=greatest(round(coalesce(v_entry.standard_hours_per_day,8)*60)::integer,1);
  select exists(
    select 1
    from public.overtime_detection_groups group_row
    join public.overtime_detection_revisions revision on revision.id=group_row.active_revision_id and revision.is_active
    join public.overtime_approval_items approval on approval.detection_revision_id=revision.id and approval.status='approved'
    where group_row.employee_id=v_entry.employee_id
      and group_row.attendance_date=p_work_date
      and group_row.segment_type in ('rest_day','holiday_work')
      and approval.approved_minutes>0
  ) into v_has_full_day_approval;
  select revision.* into v_att
  from public.attendance_calculation_groups group_row
  join public.attendance_calculation_revisions revision on revision.id=group_row.active_revision_id
  where group_row.employee_id=v_entry.employee_id and group_row.attendance_date=p_work_date
    and not revision.is_provisional
  limit 1;
  if v_day.combined_day_type='regular_workday' and not v_has_full_day_approval
     and v_att.id is not null and v_att.actual_clock_in_at is not null and v_att.actual_clock_out_at is not null
     and v_att.base_status='present' then
    return query select 'attendance:'||v_att.id::text,'ordinary','scheduled',v_att.id,null::uuid,
      greatest(v_att.actual_clock_in_at,v_att.scheduled_start_at),least(v_att.actual_clock_out_at,v_att.scheduled_end_at),
      greatest(0,floor(extract(epoch from (least(v_att.actual_clock_out_at,v_att.scheduled_end_at)-greatest(v_att.actual_clock_in_at,v_att.scheduled_start_at)))/60)::integer);
  end if;
  for v_item in
    select group_row.segment_type,revision.id revision_id,revision.detected_start_at,revision.detected_end_at,
      approval.id approval_id,approval.approved_minutes
    from public.overtime_detection_groups group_row
    join public.overtime_detection_revisions revision on revision.id=group_row.active_revision_id and revision.is_active
    join public.overtime_approval_items approval on approval.detection_revision_id=revision.id and approval.status='approved'
    where group_row.employee_id=v_entry.employee_id and group_row.attendance_date=p_work_date and approval.approved_minutes>0
    order by revision.detected_start_at,group_row.segment_type
  loop
    if v_day.combined_day_type='regular_workday' and v_item.segment_type in ('pre_shift','post_shift') then
      return query select 'overtime:'||v_item.approval_id::text,'overtime',v_item.segment_type,v_item.revision_id,v_item.approval_id,
        v_item.detected_start_at,v_item.detected_start_at + make_interval(mins=>v_item.approved_minutes),v_item.approved_minutes;
    elsif v_day.combined_day_type<>'regular_workday'
      and v_item.segment_type in ('rest_day','holiday_work') then
      v_ordinary:=least(v_item.approved_minutes,v_standard);
      v_overtime:=greatest(v_item.approved_minutes-v_standard,0);
      v_split:=v_item.detected_start_at + make_interval(mins=>v_ordinary);
      if v_ordinary>0 then
        return query select 'ordinary:'||v_item.approval_id::text,'ordinary',v_item.segment_type,v_item.revision_id,v_item.approval_id,
          v_item.detected_start_at,v_split,v_ordinary;
      end if;
      if v_overtime>0 then
        return query select 'overtime:'||v_item.approval_id::text,'overtime',v_item.segment_type,v_item.revision_id,v_item.approval_id,
          v_split,v_split+make_interval(mins=>v_overtime),v_overtime;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.calculate_night_overlap_minutes(
  p_segment_start timestamptz,
  p_segment_end timestamptz,
  p_work_date date,
  p_window_start time,
  p_window_end time
) returns integer
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare v_total numeric:=0; v_start timestamptz; v_end timestamptz; v_i integer;
begin
  if p_segment_start is null or p_segment_end is null or p_segment_end<=p_segment_start or p_window_start=p_window_end then return 0; end if;
  for v_i in -1..1 loop
    v_start:=((p_work_date+v_i)::date+p_window_start) at time zone 'Asia/Manila';
    if p_window_end>p_window_start then v_end:=((p_work_date+v_i)::date+p_window_end) at time zone 'Asia/Manila';
    else v_end:=((p_work_date+v_i+1)::date+p_window_end) at time zone 'Asia/Manila'; end if;
    v_total:=v_total+greatest(0,extract(epoch from (least(p_segment_end,v_end)-greatest(p_segment_start,v_start)))/60);
  end loop;
  return greatest(floor(v_total)::integer,0);
end;
$$;

create or replace function public.mark_payroll_entries_stale_for_premium_scope(
  p_scope_type public.premium_rule_scope_type,
  p_employment_type public.employment_type,
  p_department_id uuid,
  p_position_id uuid,
  p_payroll_group_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_reason text,
  p_source_type public.payroll_source_type,
  p_source_record_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer:=0; v_row record;
begin
  for v_row in
    select entry.id,entry.payroll_period_id,entry.employee_id
    from public.payroll_employee_entries entry
    join public.payroll_periods period on period.id=entry.payroll_period_id
    join public.employees employee on employee.id=entry.employee_id
    where entry.is_current and period.status in ('open','under_review')
      and period.period_end>=p_effective_from and (p_effective_to is null or period.period_start<=p_effective_to)
      and (
        p_scope_type='company_default'
        or (p_scope_type='employment_type' and employee.employment_type=p_employment_type)
        or (p_scope_type='department' and employee.department_id=p_department_id)
        or (p_scope_type='position' and employee.job_title_id=p_position_id)
        or (p_scope_type='payroll_group' and period.payroll_schedule_id=p_payroll_group_id)
      )
    for update of entry
  loop
    update public.payroll_employee_entries set status='stale',is_stale=true,stale_reason=left(coalesce(p_reason,'Premium input changed'),1000)
    where id=v_row.id;
    update public.payroll_periods set requires_recalculation=true,updated_at=now() where id=v_row.payroll_period_id;
    perform public.write_payroll_calculation_event(v_row.payroll_period_id,null,v_row.id,v_row.employee_id,'entry_marked_stale',auth.uid(),null,
      jsonb_build_object('source_type',p_source_type,'source_record_id',p_source_record_id));
    perform public.write_premium_calculation_event(v_row.payroll_period_id,v_row.id,null,v_row.employee_id,'premium_marked_stale',auth.uid(),null,
      jsonb_build_object('source_type',p_source_type,'source_record_id',p_source_record_id));
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.mark_payroll_stale_from_holiday_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row record;
begin
  if tg_op='UPDATE' and new.holiday_date is not distinct from old.holiday_date
     and new.holiday_type is not distinct from old.holiday_type
     and new.holiday_count is not distinct from old.holiday_count
     and new.is_active is not distinct from old.is_active then return new; end if;
  for v_row in
    select entry.id,entry.payroll_period_id,entry.employee_id
    from public.payroll_employee_entries entry
    join public.payroll_periods period on period.id=entry.payroll_period_id
    where entry.is_current and period.status in ('open','under_review')
      and coalesce(new.holiday_date,old.holiday_date) between period.period_start and period.period_end
    for update of entry
  loop
    update public.payroll_employee_entries set status='stale',is_stale=true,stale_reason='Holiday configuration changed.' where id=v_row.id;
    update public.payroll_periods set requires_recalculation=true,updated_at=now() where id=v_row.payroll_period_id;
    perform public.write_premium_calculation_event(v_row.payroll_period_id,v_row.id,null,v_row.employee_id,'premium_marked_stale',auth.uid(),null,
      jsonb_build_object('source_type','holiday','source_record_id',coalesce(new.id,old.id)));
  end loop;
  return new;
end;
$$;

create trigger mark_payroll_stale_from_holiday_count
after insert or update on public.holiday_calendar_versions
for each row execute function public.mark_payroll_stale_from_holiday_count();

do $$ begin
  alter table public.payroll_calculation_runs drop constraint payroll_calculation_runs_mode_check;
exception when undefined_object then null; end $$;
alter table public.payroll_calculation_runs
  add constraint payroll_calculation_runs_mode_check
  check (mode in ('all','uncalculated','selected','recalculate','premium','premium_recalculate'));

create or replace function public.clone_payroll_entry_for_premiums(
  p_source_entry_id uuid,
  p_calculation_run_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public.payroll_employee_entries%rowtype;
  v_period public.payroll_periods%rowtype;
  v_new_id uuid;
  v_daily public.payroll_entry_daily_breakdowns%rowtype;
  v_rule record;
  v_late_after integer; v_under_after integer; v_late_pay integer; v_under_pay integer;
  v_late_raw numeric(18,6):=0; v_under_raw numeric(18,6):=0;
  v_rounding public.payroll_basis_rounding_mode:='half_up';
  v_old_late numeric(18,6); v_old_under numeric(18,6); v_new_gross numeric(18,6);
begin
  select * into v_source from public.payroll_employee_entries where id=p_source_entry_id and is_current for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_ENTRY_NOT_FOUND'; end if;
  select * into v_period from public.payroll_periods where id=v_source.payroll_period_id for update;
  if v_period.status not in ('open','under_review') then raise exception using errcode='P0001',message='PAYROLL_PERIOD_CALCULATION_INVALID'; end if;
  update public.payroll_employee_entries set is_current=false where id=v_source.id;
  insert into public.payroll_employee_entries(
    payroll_period_id,employee_id,calculation_run_id,version_number,previous_entry_id,is_current,status,
    compensation_type,currency_code,period_start,period_end,employment_start,employment_end,eligible_start,eligible_end,
    monthly_salary,hourly_rate,annual_divisor,standard_hours_per_day,standard_hours_per_week,
    eligible_workdays,eligible_minutes,payable_minutes,approved_overtime_minutes,
    regular_earnings_raw,regular_earnings_rounded,absence_deduction_raw,absence_deduction_rounded,
    late_deduction_raw,late_deduction_rounded,undertime_deduction_raw,undertime_deduction_rounded,
    overtime_input_amount,paid_leave_amount,unpaid_leave_deduction,gross_pay_raw,gross_pay_rounded,
    premium_earnings_raw,premium_earnings_rounded,night_differential_raw,night_differential_rounded,
    revised_gross_pay_raw,revised_gross_pay_rounded,is_stale,stale_reason,calculated_at,premium_calculated_at
  ) values (
    v_source.payroll_period_id,v_source.employee_id,p_calculation_run_id,v_source.version_number+1,v_source.id,true,'recalculated',
    v_source.compensation_type,v_source.currency_code,v_source.period_start,v_source.period_end,v_source.employment_start,v_source.employment_end,v_source.eligible_start,v_source.eligible_end,
    v_source.monthly_salary,v_source.hourly_rate,v_source.annual_divisor,v_source.standard_hours_per_day,v_source.standard_hours_per_week,
    v_source.eligible_workdays,v_source.eligible_minutes,v_source.payable_minutes,v_source.approved_overtime_minutes,
    v_source.regular_earnings_raw,v_source.regular_earnings_rounded,v_source.absence_deduction_raw,v_source.absence_deduction_rounded,
    v_source.late_deduction_raw,v_source.late_deduction_rounded,v_source.undertime_deduction_raw,v_source.undertime_deduction_rounded,
    v_source.overtime_input_amount,v_source.paid_leave_amount,v_source.unpaid_leave_deduction,v_source.gross_pay_raw,v_source.gross_pay_rounded,
    0,0,0,0,v_source.gross_pay_raw,v_source.gross_pay_rounded,false,null,now(),null
  ) returning id into v_new_id;

  insert into public.payroll_entry_input_snapshots(
    payroll_employee_entry_id,source_type,source_table,source_record_id,source_updated_at,effective_date,snapshot_data,snapshot_hash
  ) select v_new_id,source_type,source_table,source_record_id,source_updated_at,effective_date,snapshot_data,snapshot_hash
    from public.payroll_entry_input_snapshots
    where payroll_employee_entry_id=v_source.id
      and source_type not in ('premium_rule','attendance_deduction_rule','day_type_resolution');

  for v_daily in select * from public.payroll_entry_daily_breakdowns where payroll_employee_entry_id=v_source.id order by work_date loop
    select * into v_rule from public.resolve_attendance_deduction_rule(v_source.employee_id,v_daily.work_date);
    v_late_after:=greatest(v_daily.late_minutes-v_rule.late_grace_minutes,0);
    v_under_after:=greatest(v_daily.undertime_minutes-v_rule.undertime_grace_minutes,0);
    v_late_pay:=public.round_premium_minutes(v_late_after,v_rule.late_rounding_mode,v_rule.late_rounding_increment_minutes);
    v_under_pay:=public.round_premium_minutes(v_under_after,v_rule.undertime_rounding_mode,v_rule.undertime_rounding_increment_minutes);
    v_late_raw:=v_late_raw+(v_daily.hourly_rate_raw/60*v_late_pay);
    v_under_raw:=v_under_raw+(v_daily.hourly_rate_raw/60*v_under_pay);
    insert into public.payroll_entry_daily_breakdowns(
      payroll_employee_entry_id,work_date,employment_eligible,scheduled_workday,scheduled_minutes,attendance_minutes,
      paid_leave_minutes,unpaid_leave_minutes,absence_minutes,late_minutes,undertime_minutes,approved_overtime_minutes,
      compensation_record_id,payroll_basis_rule_id,daily_rate_raw,hourly_rate_raw,regular_earnings_raw,absence_deduction_raw,
      late_deduction_raw,undertime_deduction_raw,unpaid_leave_deduction_raw,calculation_details,
      attendance_deduction_rule_id,late_grace_minutes,late_deductible_minutes,undertime_grace_minutes,undertime_deductible_minutes
    ) values (
      v_new_id,v_daily.work_date,v_daily.employment_eligible,v_daily.scheduled_workday,v_daily.scheduled_minutes,v_daily.attendance_minutes,
      v_daily.paid_leave_minutes,v_daily.unpaid_leave_minutes,v_daily.absence_minutes,v_daily.late_minutes,v_daily.undertime_minutes,v_daily.approved_overtime_minutes,
      v_daily.compensation_record_id,v_daily.payroll_basis_rule_id,v_daily.daily_rate_raw,v_daily.hourly_rate_raw,v_daily.regular_earnings_raw,v_daily.absence_deduction_raw,
      v_daily.hourly_rate_raw/60*v_late_pay,v_daily.hourly_rate_raw/60*v_under_pay,v_daily.unpaid_leave_deduction_raw,
      v_daily.calculation_details||jsonb_build_object('attendance_deduction_rule_id',v_rule.rule_id,'late_raw_minutes',v_daily.late_minutes,
        'late_grace_minutes',v_rule.late_grace_minutes,'late_after_grace_minutes',v_late_after,'late_deductible_minutes',v_late_pay,
        'undertime_raw_minutes',v_daily.undertime_minutes,'undertime_grace_minutes',v_rule.undertime_grace_minutes,
        'undertime_after_grace_minutes',v_under_after,'undertime_deductible_minutes',v_under_pay,'attendance_rule_source',v_rule.resolution_source),
      v_rule.rule_id,v_rule.late_grace_minutes,v_late_pay,v_rule.undertime_grace_minutes,v_under_pay
    );
    if v_rule.rule_id is not null then
      perform public.insert_payroll_snapshot(v_new_id,'attendance_deduction_rule','attendance_deduction_rules',v_rule.rule_id,null,v_daily.work_date,
        jsonb_build_object('rule_id',v_rule.rule_id,'scope_type',v_rule.scope_type,'late_grace_minutes',v_rule.late_grace_minutes,
          'undertime_grace_minutes',v_rule.undertime_grace_minutes,'late_rounding_mode',v_rule.late_rounding_mode,
          'undertime_rounding_mode',v_rule.undertime_rounding_mode));
    end if;
    select basis.rounding_mode into v_rounding from public.payroll_basis_rules basis where basis.id=v_daily.payroll_basis_rule_id;
  end loop;
  v_old_late:=v_source.late_deduction_raw; v_old_under:=v_source.undertime_deduction_raw;
  v_new_gross:=v_source.gross_pay_raw+v_old_late+v_old_under-v_late_raw-v_under_raw;
  update public.payroll_employee_entries set
    late_deduction_raw=v_late_raw,late_deduction_rounded=public.round_payroll_amount(v_late_raw,coalesce(v_rounding,'half_up')),
    undertime_deduction_raw=v_under_raw,undertime_deduction_rounded=public.round_payroll_amount(v_under_raw,coalesce(v_rounding,'half_up')),
    gross_pay_raw=v_new_gross,gross_pay_rounded=public.round_payroll_amount(v_new_gross,coalesce(v_rounding,'half_up')),
    revised_gross_pay_raw=v_new_gross,revised_gross_pay_rounded=public.round_payroll_amount(v_new_gross,coalesce(v_rounding,'half_up'))
  where id=v_new_id;
  return v_new_id;
end;
$$;

create or replace function public.calculate_employee_premiums_internal(
  p_payroll_employee_entry_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entry public.payroll_employee_entries%rowtype;
  v_daily public.payroll_entry_daily_breakdowns%rowtype;
  v_day record; v_rule record; v_seg record;
  v_day_resolution_id uuid; v_line_id uuid;
  v_day_premium_type public.premium_type; v_ot_premium_type public.premium_type;
  v_included_base_multiplier numeric; v_incremental_multiplier numeric;
  v_raw_day_minutes integer; v_raw_ot_minutes integer; v_round_ot_minutes integer;
  v_raw_night_minutes integer; v_round_night_minutes integer; v_segment_night integer; v_segment_night_rounded integer;
  v_day_base numeric(18,6); v_day_amount numeric(18,6); v_ot_base numeric(18,6); v_ot_amount numeric(18,6);
  v_night_base numeric(18,6); v_night_amount numeric(18,6);
  v_premium_total_raw numeric(18,6):=0; v_premium_total_rounded numeric(14,2):=0;
  v_night_total_raw numeric(18,6):=0; v_night_total_rounded numeric(14,2):=0;
  v_rounding public.payroll_basis_rounding_mode; v_revised_raw numeric(18,6); v_revised_rounded numeric(14,2);
begin
  select * into v_entry from public.payroll_employee_entries where id=p_payroll_employee_entry_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_ENTRY_NOT_FOUND'; end if;
  if not v_entry.is_current then raise exception using errcode='P0001',message='PAYROLL_ENTRY_NOT_CURRENT'; end if;
  if exists(select 1 from public.payroll_premium_lines where payroll_employee_entry_id=v_entry.id) then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_IMMUTABLE';
  end if;

  for v_daily in select * from public.payroll_entry_daily_breakdowns where payroll_employee_entry_id=v_entry.id order by work_date loop
    select * into v_day from public.resolve_employee_day_type(v_entry.employee_id,v_entry.payroll_period_id,v_daily.work_date);
    select * into v_rule from public.resolve_employee_premium_rule(v_entry.employee_id,v_entry.payroll_period_id,v_daily.work_date,v_day.combined_day_type);
    select basis.rounding_mode into v_rounding from public.payroll_basis_rules basis where basis.id=v_daily.payroll_basis_rule_id;
    v_rounding:=coalesce(v_rounding,'half_up');

    insert into public.payroll_day_type_resolutions(
      payroll_employee_entry_id,work_date,base_day_type,is_rest_day,holiday_version_id,holiday_type,holiday_count,
      combined_day_type,resolution_source,premium_rule_set_id,premium_rule_version_id
    ) values (
      v_entry.id,v_daily.work_date,v_day.base_day_type,v_day.is_rest_day,v_day.holiday_version_id,v_day.holiday_type,v_day.holiday_count,
      v_day.combined_day_type,v_day.resolution_source,v_rule.premium_rule_set_id,v_rule.premium_rule_version_id
    ) returning id into v_day_resolution_id;

    perform public.insert_payroll_snapshot(v_entry.id,'premium_rule','premium_rule_sets',v_rule.premium_rule_set_id,null,v_daily.work_date,
      jsonb_build_object('premium_rule_set_id',v_rule.premium_rule_set_id,'premium_rule_version_id',v_rule.premium_rule_version_id,
        'scope_type',v_rule.scope_type,'scope_key',v_rule.scope_key,'day_type',v_day.combined_day_type,
        'regular_time_multiplier',v_rule.regular_time_multiplier,'overtime_multiplier',v_rule.overtime_multiplier,
        'night_differential_percentage',v_rule.night_differential_percentage));
    perform public.insert_payroll_snapshot(v_entry.id,'day_type_resolution','payroll_day_type_resolutions',v_day_resolution_id,null,v_daily.work_date,
      jsonb_build_object('base_day_type',v_day.base_day_type,'combined_day_type',v_day.combined_day_type,
        'is_rest_day',v_day.is_rest_day,'holiday_version_id',v_day.holiday_version_id,'holiday_type',v_day.holiday_type,'holiday_count',v_day.holiday_count));

    v_day_premium_type:=case v_day.combined_day_type
      when 'rest_day' then 'rest_day'::public.premium_type
      when 'special_non_working_day' then 'special_day'::public.premium_type
      when 'regular_holiday' then 'regular_holiday'::public.premium_type
      when 'special_day_rest_day' then 'special_day_rest_day'::public.premium_type
      when 'regular_holiday_rest_day' then 'regular_holiday_rest_day'::public.premium_type
      when 'double_regular_holiday' then 'double_holiday'::public.premium_type
      when 'double_regular_holiday_rest_day' then 'double_holiday_rest_day'::public.premium_type
      else null
    end;
    v_ot_premium_type:=case v_day.combined_day_type
      when 'regular_workday' then 'regular_overtime'::public.premium_type
      when 'rest_day' then 'rest_day_overtime'::public.premium_type
      when 'special_non_working_day' then 'special_day_overtime'::public.premium_type
      when 'regular_holiday' then 'regular_holiday_overtime'::public.premium_type
      else 'combined_day_overtime'::public.premium_type
    end;
    v_included_base_multiplier:=case when v_rule.additional_premium_only then 1 else 0 end;
    v_incremental_multiplier:=greatest(v_rule.regular_time_multiplier-v_included_base_multiplier,0);
    v_raw_day_minutes:=0; v_raw_ot_minutes:=0; v_round_ot_minutes:=0;
    v_raw_night_minutes:=0; v_round_night_minutes:=0;
    v_day_base:=0; v_day_amount:=0; v_ot_base:=0; v_ot_amount:=0; v_night_base:=0; v_night_amount:=0;

    for v_seg in select * from public.resolve_payroll_premium_segments(v_entry.id,v_daily.work_date) loop
      if v_seg.segment_kind='ordinary' then
        v_raw_day_minutes:=v_raw_day_minutes+v_seg.raw_minutes;
        v_day_base:=v_day_base+(v_daily.hourly_rate_raw*v_seg.raw_minutes/60);
        v_day_amount:=v_day_amount+(v_daily.hourly_rate_raw*v_seg.raw_minutes/60*v_incremental_multiplier);
        v_segment_night:=public.calculate_night_overlap_minutes(v_seg.segment_start_at,v_seg.segment_end_at,v_daily.work_date,v_rule.night_window_start,v_rule.night_window_end);
        v_segment_night_rounded:=public.round_premium_minutes(v_segment_night,v_rule.night_rounding_mode,v_rule.night_rounding_increment_minutes);
        v_raw_night_minutes:=v_raw_night_minutes+v_segment_night;
        v_round_night_minutes:=v_round_night_minutes+v_segment_night_rounded;
        v_night_base:=v_night_base+(v_daily.hourly_rate_raw*v_segment_night_rounded/60*v_rule.regular_time_multiplier);
        v_night_amount:=v_night_amount+(v_daily.hourly_rate_raw*v_segment_night_rounded/60*v_rule.regular_time_multiplier*v_rule.night_differential_percentage);
      elsif v_seg.segment_kind='overtime' then
        v_raw_ot_minutes:=v_raw_ot_minutes+v_seg.raw_minutes;
        v_round_ot_minutes:=v_round_ot_minutes+public.round_premium_minutes(v_seg.raw_minutes,v_rule.overtime_rounding_mode,v_rule.overtime_rounding_increment_minutes);
        v_ot_base:=v_ot_base+(v_daily.hourly_rate_raw*public.round_premium_minutes(v_seg.raw_minutes,v_rule.overtime_rounding_mode,v_rule.overtime_rounding_increment_minutes)/60*v_rule.regular_time_multiplier);
        v_ot_amount:=v_ot_amount+(v_daily.hourly_rate_raw*public.round_premium_minutes(v_seg.raw_minutes,v_rule.overtime_rounding_mode,v_rule.overtime_rounding_increment_minutes)/60*v_rule.regular_time_multiplier*v_rule.overtime_multiplier);
        v_segment_night:=public.calculate_night_overlap_minutes(v_seg.segment_start_at,v_seg.segment_end_at,v_daily.work_date,v_rule.night_window_start,v_rule.night_window_end);
        v_segment_night_rounded:=public.round_premium_minutes(v_segment_night,v_rule.night_rounding_mode,v_rule.night_rounding_increment_minutes);
        v_raw_night_minutes:=v_raw_night_minutes+v_segment_night;
        v_round_night_minutes:=v_round_night_minutes+v_segment_night_rounded;
        v_night_base:=v_night_base+(v_daily.hourly_rate_raw*v_segment_night_rounded/60*v_rule.regular_time_multiplier*v_rule.overtime_multiplier);
        v_night_amount:=v_night_amount+(v_daily.hourly_rate_raw*v_segment_night_rounded/60*v_rule.regular_time_multiplier*v_rule.overtime_multiplier*v_rule.night_differential_percentage);
      end if;
    end loop;

    if v_day_premium_type is not null and v_raw_day_minutes>0 and v_day_amount<>0 then
      insert into public.payroll_premium_lines(
        payroll_employee_entry_id,payroll_entry_daily_breakdown_id,work_date,premium_type,day_type,
        premium_rule_set_id,premium_rule_version_id,base_hourly_rate_raw,raw_minutes,rounded_minutes,
        day_multiplier,overtime_multiplier,night_percentage,base_amount_raw,premium_amount_raw,premium_amount_rounded,
        is_additional_only,calculation_details
      ) values (
        v_entry.id,v_daily.id,v_daily.work_date,v_day_premium_type,v_day.combined_day_type,
        v_rule.premium_rule_set_id,v_rule.premium_rule_version_id,v_daily.hourly_rate_raw,v_raw_day_minutes,v_raw_day_minutes,
        v_rule.regular_time_multiplier,v_rule.overtime_multiplier,v_rule.night_differential_percentage,
        v_day_base,v_day_amount,public.round_payroll_amount(v_day_amount,v_rounding),v_rule.additional_premium_only,
        jsonb_build_object('formula','hourly_rate × minutes / 60 × max(day_multiplier − included_base_multiplier, 0)',
          'included_base_multiplier',v_included_base_multiplier,'incremental_multiplier',v_incremental_multiplier)
      ) returning id into v_line_id;
      v_premium_total_raw:=v_premium_total_raw+v_day_amount;
      v_premium_total_rounded:=v_premium_total_rounded+public.round_payroll_amount(v_day_amount,v_rounding);
      perform public.write_premium_calculation_event(v_entry.payroll_period_id,v_entry.id,v_line_id,v_entry.employee_id,'premium_calculated',auth.uid(),null,
        jsonb_build_object('work_date',v_daily.work_date,'premium_type',v_day_premium_type,'rule_version_id',v_rule.premium_rule_version_id));
    end if;

    if v_raw_ot_minutes>0 and v_ot_amount<>0 then
      insert into public.payroll_premium_lines(
        payroll_employee_entry_id,payroll_entry_daily_breakdown_id,work_date,premium_type,day_type,
        premium_rule_set_id,premium_rule_version_id,base_hourly_rate_raw,raw_minutes,rounded_minutes,
        day_multiplier,overtime_multiplier,night_percentage,base_amount_raw,premium_amount_raw,premium_amount_rounded,
        is_additional_only,calculation_details
      ) values (
        v_entry.id,v_daily.id,v_daily.work_date,v_ot_premium_type,v_day.combined_day_type,
        v_rule.premium_rule_set_id,v_rule.premium_rule_version_id,v_daily.hourly_rate_raw,v_raw_ot_minutes,v_round_ot_minutes,
        v_rule.regular_time_multiplier,v_rule.overtime_multiplier,v_rule.night_differential_percentage,
        v_ot_base,v_ot_amount,public.round_payroll_amount(v_ot_amount,v_rounding),false,
        jsonb_build_object('formula','hourly_rate × rounded_minutes / 60 × day_multiplier × overtime_multiplier',
          'raw_minutes',v_raw_ot_minutes,'rounded_minutes',v_round_ot_minutes)
      ) returning id into v_line_id;
      v_premium_total_raw:=v_premium_total_raw+v_ot_amount;
      v_premium_total_rounded:=v_premium_total_rounded+public.round_payroll_amount(v_ot_amount,v_rounding);
      perform public.write_premium_calculation_event(v_entry.payroll_period_id,v_entry.id,v_line_id,v_entry.employee_id,'premium_calculated',auth.uid(),null,
        jsonb_build_object('work_date',v_daily.work_date,'premium_type',v_ot_premium_type,'rule_version_id',v_rule.premium_rule_version_id));
    end if;

    if v_raw_night_minutes>0 and v_night_amount<>0 then
      insert into public.payroll_premium_lines(
        payroll_employee_entry_id,payroll_entry_daily_breakdown_id,work_date,premium_type,day_type,
        premium_rule_set_id,premium_rule_version_id,base_hourly_rate_raw,raw_minutes,rounded_minutes,
        day_multiplier,overtime_multiplier,night_percentage,base_amount_raw,premium_amount_raw,premium_amount_rounded,
        is_additional_only,calculation_details
      ) values (
        v_entry.id,v_daily.id,v_daily.work_date,'night_differential',v_day.combined_day_type,
        v_rule.premium_rule_set_id,v_rule.premium_rule_version_id,v_daily.hourly_rate_raw,v_raw_night_minutes,v_round_night_minutes,
        v_rule.regular_time_multiplier,v_rule.overtime_multiplier,v_rule.night_differential_percentage,
        v_night_base,v_night_amount,public.round_payroll_amount(v_night_amount,v_rounding),true,
        jsonb_build_object('formula','applicable ordinary-or-overtime premium base × night differential percentage',
          'night_window_start',v_rule.night_window_start,'night_window_end',v_rule.night_window_end,
          'raw_minutes',v_raw_night_minutes,'rounded_minutes',v_round_night_minutes)
      ) returning id into v_line_id;
      v_night_total_raw:=v_night_total_raw+v_night_amount;
      v_night_total_rounded:=v_night_total_rounded+public.round_payroll_amount(v_night_amount,v_rounding);
      perform public.write_premium_calculation_event(v_entry.payroll_period_id,v_entry.id,v_line_id,v_entry.employee_id,'night_differential_calculated',auth.uid(),null,
        jsonb_build_object('work_date',v_daily.work_date,'rule_version_id',v_rule.premium_rule_version_id));
    end if;
  end loop;

  v_revised_raw:=v_entry.gross_pay_raw+v_premium_total_raw+v_night_total_raw;
  v_revised_rounded:=v_entry.gross_pay_rounded+v_premium_total_rounded+v_night_total_rounded;
  update public.payroll_employee_entries set
    premium_earnings_raw=v_premium_total_raw,premium_earnings_rounded=v_premium_total_rounded,
    night_differential_raw=v_night_total_raw,night_differential_rounded=v_night_total_rounded,
    revised_gross_pay_raw=v_revised_raw,revised_gross_pay_rounded=v_revised_rounded,
    premium_calculated_at=now(),status='recalculated',is_stale=false,stale_reason=null
  where id=v_entry.id;
  perform public.write_premium_calculation_event(v_entry.payroll_period_id,v_entry.id,null,v_entry.employee_id,'premium_recalculated',auth.uid(),null,
    jsonb_build_object('premium_line_count',(select count(*) from public.payroll_premium_lines where payroll_employee_entry_id=v_entry.id)));
  return jsonb_build_object(
    'entryId',v_entry.id,'premiumEarningsRaw',v_premium_total_raw,'premiumEarningsRounded',v_premium_total_rounded,
    'nightDifferentialRaw',v_night_total_raw,'nightDifferentialRounded',v_night_total_rounded,
    'revisedGrossPayRaw',v_revised_raw,'revisedGrossPayRounded',v_revised_rounded,'blockingExceptionCount',0
  );
end;
$$;

create or replace function public.calculate_payroll_premiums(
  p_payroll_period_id uuid,
  p_mode text default 'uncalculated',
  p_employee_ids uuid[] default null,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid:=auth.uid(); v_period public.payroll_periods%rowtype; v_run public.payroll_calculation_runs%rowtype;
  v_entry public.payroll_employee_entries%rowtype; v_new_id uuid; v_calculated integer:=0; v_exceptions integer:=0; v_eligible integer:=0;
  v_code text; v_message text;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  if p_mode not in ('all','uncalculated','selected','recalculate') then raise exception using errcode='P0001',message='PAYROLL_CALCULATION_MODE_INVALID'; end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id for update;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  if v_period.status not in ('open','under_review') then raise exception using errcode='P0001',message='PAYROLL_PERIOD_CALCULATION_INVALID'; end if;
  if not exists(select 1 from public.premium_rule_sets where status in ('approved','superseded') and scope_type='company_default'
    and effective_from<=v_period.period_end and (effective_to is null or effective_to>=v_period.period_start)) then
    raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payroll-calculation:'||p_payroll_period_id::text,0));
  select * into v_run from public.payroll_calculation_runs where idempotency_key=coalesce(p_idempotency_key,gen_random_uuid());
  if v_run.id is not null then return public.payroll_calculation_run_json(v_run); end if;
  insert into public.payroll_calculation_runs(payroll_period_id,idempotency_key,mode,status,started_by,started_at)
  values (p_payroll_period_id,coalesce(p_idempotency_key,gen_random_uuid()),case when p_mode='recalculate' then 'premium_recalculate' else 'premium' end,'running',v_actor,now())
  returning * into v_run;
  for v_entry in
    select entry.* from public.payroll_employee_entries entry
    where entry.payroll_period_id=p_payroll_period_id and entry.is_current
      and entry.status in ('calculated','recalculated')
      and not entry.is_stale
      and (p_employee_ids is null or entry.employee_id=any(p_employee_ids))
      and (p_mode<>'uncalculated' or entry.premium_calculated_at is null)
    order by entry.employee_id
  loop
    v_eligible:=v_eligible+1;
    begin
      v_new_id:=public.clone_payroll_entry_for_premiums(v_entry.id,v_run.id);
      perform public.calculate_employee_premiums_internal(v_new_id);
      v_calculated:=v_calculated+1;
    exception when others then
      v_exceptions:=v_exceptions+1;
      v_code:=case when sqlerrm in ('MISSING_PREMIUM_RULE','CONFLICTING_PREMIUM_RULE','MISSING_COMPANY_DEFAULT_PREMIUM_RULE','INVALID_DAY_TYPE_RESOLUTION','MISSING_HOLIDAY_CONFIGURATION','INVALID_NIGHT_WINDOW','PREMIUM_INPUT_CHANGED') then sqlerrm else 'PAYROLL_PREMIUM_CALCULATION_FAILED' end;
      v_message:=case v_code
        when 'MISSING_PREMIUM_RULE' then 'No approved premium rule applies to an employee work date.'
        when 'MISSING_COMPANY_DEFAULT_PREMIUM_RULE' then 'No approved company-default premium rule covers this payroll period.'
        when 'MISSING_HOLIDAY_CONFIGURATION' then 'A holiday configuration does not support payroll calculation.'
        else 'Payroll premiums could not be calculated for this employee.' end;
      perform public.create_payroll_entry_exception(p_payroll_period_id,v_entry.employee_id,v_run.id,v_entry.id,v_code,'blocking',v_message,null,null);
      perform public.write_premium_calculation_event(p_payroll_period_id,v_entry.id,null,v_entry.employee_id,'premium_exception_created',v_actor,null,jsonb_build_object('exception_code',v_code));
    end;
  end loop;
  update public.payroll_calculation_runs set status=case when v_exceptions>0 then 'completed_with_exceptions' else 'completed' end,
    completed_at=now(),eligible_employee_count=v_eligible,calculated_count=v_calculated,exception_count=v_exceptions
  where id=v_run.id returning * into v_run;
  perform public.notify_payroll_admins(
    'payroll_premium_calculation_completed','Payroll premium calculation completed',
    case when v_exceptions>0 then 'A premium calculation completed with exceptions.' else 'A premium calculation completed.' end,
    'payroll_period',p_payroll_period_id,'premium-calculation:'||v_run.id::text,
    jsonb_build_object('payroll_period_id',p_payroll_period_id,'run_id',v_run.id,'status',v_run.status,
      'eligible_count',v_eligible,'calculated_count',v_calculated,'exception_count',v_exceptions),
    '/payroll/periods/'||p_payroll_period_id::text||'/workspace',coalesce(p_idempotency_key,v_run.id)
  );
  return public.payroll_calculation_run_json(v_run);
exception when others then
  if v_run.id is not null then update public.payroll_calculation_runs set status='failed',completed_at=now(),error_code='PAYROLL_PREMIUM_CALCULATION_FAILED',safe_error_message='Payroll premium calculation failed.' where id=v_run.id; end if;
  raise;
end;
$$;

create or replace function public.recalculate_employee_premiums(
  p_payroll_period_id uuid,
  p_employee_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.calculate_payroll_premiums(p_payroll_period_id,'recalculate',array[p_employee_id],p_request_id);
end;
$$;

create or replace function public.premium_rule_set_json(p_rule public.premium_rule_sets)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id',p_rule.id,'supersedes_rule_set_id',p_rule.supersedes_rule_set_id,'name',p_rule.name,
    'scope_type',p_rule.scope_type,'scope_label',case p_rule.scope_type
      when 'company_default' then 'Company default'
      when 'employment_type' then initcap(replace(p_rule.employment_type::text,'_',' '))
      when 'department' then coalesce((select name from public.departments where id=p_rule.department_id),'Department')
      when 'position' then coalesce((select title from public.job_titles where id=p_rule.position_id),'Position')
      when 'payroll_group' then coalesce((select name from public.payroll_schedules where id=p_rule.payroll_group_id),'Payroll group') end,
    'employment_type',p_rule.employment_type,'department_id',p_rule.department_id,'position_id',p_rule.position_id,
    'payroll_group_id',p_rule.payroll_group_id,'effective_from',p_rule.effective_from,'effective_to',p_rule.effective_to,
    'status',p_rule.status,'change_reason',p_rule.change_reason,'version',p_rule.version,
    'source_agency',p_rule.source_agency,'source_reference',p_rule.source_reference,
    'source_publication_date',p_rule.source_publication_date,'source_url',p_rule.source_url,
    'submitted_at',p_rule.submitted_at,'approved_at',p_rule.approved_at,'rejected_at',p_rule.rejected_at,
    'rejection_reason',p_rule.rejection_reason,'created_at',p_rule.created_at,'updated_at',p_rule.updated_at,
    'day_rules',coalesce((select jsonb_agg(jsonb_build_object(
      'id',version.id,'version_number',version.version_number,'day_type',version.day_type,
      'regular_time_multiplier',version.regular_time_multiplier,'overtime_multiplier',version.overtime_multiplier,
      'additional_premium_only',version.additional_premium_only,'night_differential_percentage',version.night_differential_percentage,
      'night_window_start',to_char(version.night_window_start,'HH24:MI'),'night_window_end',to_char(version.night_window_end,'HH24:MI'),
      'overtime_rounding_mode',version.overtime_rounding_mode,'overtime_rounding_increment_minutes',version.overtime_rounding_increment_minutes,
      'night_rounding_mode',version.night_rounding_mode,'night_rounding_increment_minutes',version.night_rounding_increment_minutes
    ) order by version.day_type::text) from public.premium_rule_versions version where version.premium_rule_set_id=p_rule.id),'[]'::jsonb)
  );
$$;

create or replace function public.attendance_deduction_rule_json(p_rule public.attendance_deduction_rules)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id',p_rule.id,'supersedes_rule_id',p_rule.supersedes_rule_id,'scope_type',p_rule.scope_type,
    'scope_label',case p_rule.scope_type
      when 'company_default' then 'Company default'
      when 'employment_type' then initcap(replace(p_rule.employment_type::text,'_',' '))
      when 'department' then coalesce((select name from public.departments where id=p_rule.department_id),'Department')
      when 'position' then coalesce((select title from public.job_titles where id=p_rule.position_id),'Position')
      when 'payroll_group' then coalesce((select name from public.payroll_schedules where id=p_rule.payroll_group_id),'Payroll group') end,
    'employment_type',p_rule.employment_type,'department_id',p_rule.department_id,'position_id',p_rule.position_id,'payroll_group_id',p_rule.payroll_group_id,
    'late_grace_minutes',p_rule.late_grace_minutes,'undertime_grace_minutes',p_rule.undertime_grace_minutes,
    'late_rounding_mode',p_rule.late_rounding_mode,'late_rounding_increment_minutes',p_rule.late_rounding_increment_minutes,
    'undertime_rounding_mode',p_rule.undertime_rounding_mode,'undertime_rounding_increment_minutes',p_rule.undertime_rounding_increment_minutes,
    'effective_from',p_rule.effective_from,'effective_to',p_rule.effective_to,'status',p_rule.status,'change_reason',p_rule.change_reason,
    'version',p_rule.version,'submitted_at',p_rule.submitted_at,'approved_at',p_rule.approved_at,'rejected_at',p_rule.rejected_at,
    'rejection_reason',p_rule.rejection_reason,'created_at',p_rule.created_at,'updated_at',p_rule.updated_at
  );
$$;

create or replace function public.list_premium_rule_sets()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_rules jsonb; v_presets jsonb; v_departments jsonb; v_positions jsonb; v_groups jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select coalesce(jsonb_agg(public.premium_rule_set_json(rule) order by rule.effective_from desc,rule.created_at desc),'[]'::jsonb) into v_rules from public.premium_rule_sets rule;
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'country_code',country_code,'source_agency',source_agency,
    'source_reference',source_reference,'source_publication_date',source_publication_date,'source_url',source_url,'day_rules',day_rules) order by name),'[]'::jsonb) into v_presets from public.premium_rule_presets;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) into v_departments from public.departments;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',title) order by title),'[]'::jsonb) into v_positions from public.job_titles;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) order by name),'[]'::jsonb) into v_groups from public.payroll_schedules where is_active;
  return jsonb_build_object('rules',v_rules,'presets',v_presets,'departments',v_departments,'positions',v_positions,'payroll_groups',v_groups);
end;
$$;

create or replace function public.get_premium_rule_set_detail(p_rule_set_id uuid)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_rule public.premium_rule_sets%rowtype;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_rule from public.premium_rule_sets where id=p_rule_set_id;
  if not found then return null; end if;
  return public.premium_rule_set_json(v_rule);
end;
$$;

create or replace function public.list_attendance_deduction_rules()
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_items jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select coalesce(jsonb_agg(public.attendance_deduction_rule_json(rule) order by rule.effective_from desc,rule.created_at desc),'[]'::jsonb) into v_items from public.attendance_deduction_rules rule;
  return jsonb_build_object('items',v_items);
end;
$$;

create or replace function public.list_premium_rule_approvals()
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_premium jsonb; v_attendance jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() then raise exception using errcode='P0001',message='PAYROLL_APPROVER_REQUIRED'; end if;
  select coalesce(jsonb_agg(public.premium_rule_set_json(rule) order by rule.submitted_at),'[]'::jsonb) into v_premium from public.premium_rule_sets rule where status='pending_approval';
  select coalesce(jsonb_agg(public.attendance_deduction_rule_json(rule) order by rule.submitted_at),'[]'::jsonb) into v_attendance from public.attendance_deduction_rules rule where status='pending_approval';
  return jsonb_build_object('premium_rules',v_premium,'attendance_deduction_rules',v_attendance);
end;
$$;

create or replace function public.preview_premium_rule_coverage(p_rule_set_id uuid)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_rule public.premium_rule_sets%rowtype; v_employees integer; v_periods integer; v_stale integer; v_conflicts jsonb; v_missing jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_rule from public.premium_rule_sets where id=p_rule_set_id;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PREMIUM_RULE_NOT_FOUND'; end if;
  select count(*) into v_employees from public.employees employee where employee.employment_status='active' and (
    v_rule.scope_type='company_default' or (v_rule.scope_type='employment_type' and employee.employment_type=v_rule.employment_type)
    or (v_rule.scope_type='department' and employee.department_id=v_rule.department_id)
    or (v_rule.scope_type='position' and employee.job_title_id=v_rule.position_id)
    or (v_rule.scope_type='payroll_group' and exists(select 1 from public.employee_payroll_schedule_assignments assignment where assignment.employee_id=employee.id and assignment.payroll_schedule_id=v_rule.payroll_group_id and assignment.status='approved'))
  );
  select count(*) into v_periods from public.payroll_periods period where period.status in ('open','under_review')
    and period.period_end>=v_rule.effective_from and (v_rule.effective_to is null or period.period_start<=v_rule.effective_to)
    and (v_rule.scope_type<>'payroll_group' or period.payroll_schedule_id=v_rule.payroll_group_id);
  select count(*) into v_stale from public.payroll_employee_entries entry join public.payroll_periods period on period.id=entry.payroll_period_id
    where entry.is_current and period.status in ('open','under_review') and period.period_end>=v_rule.effective_from
      and (v_rule.effective_to is null or period.period_start<=v_rule.effective_to);
  select coalesce(jsonb_agg(id),'[]'::jsonb) into v_conflicts from public.premium_rule_sets other where other.id<>v_rule.id and other.status='approved'
    and other.scope_key=v_rule.scope_key and daterange(other.effective_from,coalesce(other.effective_to+1,'infinity'::date),'[)') && daterange(v_rule.effective_from,coalesce(v_rule.effective_to+1,'infinity'::date),'[)');
  select coalesce(jsonb_agg(day_type),'[]'::jsonb) into v_missing from unnest(enum_range(null::public.premium_day_type)) as missing(day_type)
    where not exists(select 1 from public.premium_rule_versions version where version.premium_rule_set_id=v_rule.id and version.day_type=missing.day_type);
  return jsonb_build_object('affected_employee_count',v_employees,'affected_open_period_count',v_periods,'stale_entry_count',v_stale,
    'conflicting_rule_ids',v_conflicts,'missing_day_types',v_missing);
end;
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
    'premium_earnings_raw',p_entry.premium_earnings_raw,'premium_earnings_rounded',p_entry.premium_earnings_rounded,
    'night_differential_raw',p_entry.night_differential_raw,'night_differential_rounded',p_entry.night_differential_rounded,
    'revised_gross_pay_raw',p_entry.revised_gross_pay_raw,'revised_gross_pay_rounded',p_entry.revised_gross_pay_rounded,
    'premium_calculated_at',p_entry.premium_calculated_at,
    'is_stale',p_entry.is_stale,'stale_reason',p_entry.stale_reason,
    'calculated_at',p_entry.calculated_at,'created_at',p_entry.created_at,
    'active_exclusion_id',(
      select exclusion.id from public.payroll_employee_exclusions exclusion
      where exclusion.payroll_period_id=p_entry.payroll_period_id and exclusion.employee_id=p_entry.employee_id and exclusion.reversed_at is null
      order by exclusion.excluded_at desc limit 1
    )
  );
$$;

create or replace function public.check_payroll_period_readiness(p_payroll_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period public.payroll_periods%rowtype; v_active_runs integer; v_blocking integer; v_stale integer; v_missing integer; v_missing_premium integer; v_ready boolean;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  select count(*) into v_active_runs from public.payroll_calculation_runs where payroll_period_id=p_payroll_period_id and status in ('queued','running');
  select count(*) into v_blocking from public.payroll_entry_exceptions where payroll_period_id=p_payroll_period_id and severity='blocking' and status='open';
  select count(*) into v_stale from public.payroll_employee_entries where payroll_period_id=p_payroll_period_id and is_current and (is_stale or status='stale');
  select count(*) into v_missing from public.employee_payroll_schedule_assignments assignment
  where assignment.payroll_schedule_id=v_period.payroll_schedule_id and assignment.status='approved'
    and assignment.effective_from<=v_period.period_end and (assignment.effective_to is null or assignment.effective_to>=v_period.period_start)
    and not exists(select 1 from public.payroll_employee_entries entry where entry.payroll_period_id=p_payroll_period_id and entry.employee_id=assignment.employee_id
      and entry.is_current and entry.status in ('calculated','recalculated') and not entry.is_stale)
    and not exists(select 1 from public.payroll_employee_exclusions exclusion where exclusion.payroll_period_id=p_payroll_period_id
      and exclusion.employee_id=assignment.employee_id and exclusion.reversed_at is null);
  select count(*) into v_missing_premium from public.payroll_employee_entries entry
  where entry.payroll_period_id=p_payroll_period_id and entry.is_current and entry.status in ('calculated','recalculated') and not entry.is_stale
    and entry.premium_calculated_at is null
    and not exists(select 1 from public.payroll_employee_exclusions exclusion where exclusion.payroll_period_id=entry.payroll_period_id
      and exclusion.employee_id=entry.employee_id and exclusion.reversed_at is null);
  v_ready:=v_active_runs=0 and v_blocking=0 and v_stale=0 and v_missing=0 and v_missing_premium=0;
  return jsonb_build_object('ready',v_ready,'activeRunCount',v_active_runs,'blockingExceptionCount',v_blocking,
    'staleEntryCount',v_stale,'missingEmployeeCount',v_missing,'missingPremiumEntryCount',v_missing_premium);
end;
$$;

create or replace function public.get_payroll_calculation_workspace(p_payroll_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period public.payroll_periods%rowtype; v_schedule public.payroll_schedules%rowtype; v_latest_run public.payroll_calculation_runs%rowtype;
  v_entries jsonb; v_runs jsonb; v_readiness jsonb; v_excluded integer; v_exception_count integer; v_stale_count integer;
  v_premium numeric; v_night numeric; v_revised numeric; v_pending integer; v_premium_exceptions integer;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_period from public.payroll_periods where id=p_payroll_period_id;
  if not found then raise exception using errcode='P0001',message='PAYROLL_PERIOD_NOT_FOUND'; end if;
  select * into v_schedule from public.payroll_schedules where id=v_period.payroll_schedule_id;
  select * into v_latest_run from public.payroll_calculation_runs where payroll_period_id=p_payroll_period_id order by created_at desc,id desc limit 1;
  select coalesce(jsonb_agg(public.payroll_employee_entry_json(entry)||jsonb_build_object(
    'employee',public.payroll_employee_identity_json(entry.employee_id),
    'open_exception_count',(select count(*) from public.payroll_entry_exceptions exception where exception.payroll_employee_entry_id=entry.id and exception.status='open'),
    'blocking_exception_count',(select count(*) from public.payroll_entry_exceptions exception where exception.payroll_employee_entry_id=entry.id and exception.status='open' and exception.severity='blocking')
  ) order by (public.payroll_employee_identity_json(entry.employee_id)->>'full_name')),'[]'::jsonb) into v_entries
  from public.payroll_employee_entries entry where entry.payroll_period_id=p_payroll_period_id and entry.is_current;
  select coalesce(jsonb_agg(public.payroll_calculation_run_json(run) order by run.created_at desc),'[]'::jsonb) into v_runs
    from public.payroll_calculation_runs run where run.payroll_period_id=p_payroll_period_id;
  select count(*) into v_excluded from public.payroll_employee_exclusions where payroll_period_id=p_payroll_period_id and reversed_at is null;
  select count(*) into v_exception_count from public.payroll_entry_exceptions where payroll_period_id=p_payroll_period_id and status='open';
  select count(*) into v_stale_count from public.payroll_employee_entries where payroll_period_id=p_payroll_period_id and is_current and (is_stale or status='stale');
  select coalesce(sum(premium_earnings_rounded),0),coalesce(sum(night_differential_rounded),0),coalesce(sum(revised_gross_pay_rounded),0),
    count(*) filter(where premium_calculated_at is null),count(*) filter(where exists(select 1 from public.payroll_entry_exceptions x where x.payroll_employee_entry_id=entry.id and x.status='open' and x.exception_code in ('MISSING_PREMIUM_RULE','CONFLICTING_PREMIUM_RULE','MISSING_COMPANY_DEFAULT_PREMIUM_RULE','INVALID_DAY_TYPE_RESOLUTION','MISSING_HOLIDAY_CONFIGURATION','INVALID_NIGHT_WINDOW','PREMIUM_INPUT_CHANGED','PAYROLL_PREMIUM_CALCULATION_FAILED')))
  into v_premium,v_night,v_revised,v_pending,v_premium_exceptions
  from public.payroll_employee_entries entry where payroll_period_id=p_payroll_period_id and is_current;
  v_readiness:=public.check_payroll_period_readiness(p_payroll_period_id);
  return jsonb_build_object(
    'period',jsonb_build_object('id',v_period.id,'period_code',v_period.period_code,'period_start',v_period.period_start,'period_end',v_period.period_end,
      'cutoff_date',v_period.cutoff_date,'payment_date',v_period.payment_date,'status',v_period.status,'version',v_period.version,
      'requires_recalculation',v_period.requires_recalculation,'payroll_schedule_id',v_period.payroll_schedule_id,'schedule_name',v_schedule.name,
      'schedule_code',v_schedule.code,'currency_code',v_schedule.currency_code),
    'latest_run',case when v_latest_run.id is null then null else public.payroll_calculation_run_json(v_latest_run) end,
    'runs',v_runs,'entries',v_entries,'readiness',v_readiness,
    'summary',jsonb_build_object('entry_count',jsonb_array_length(v_entries),'exception_count',v_exception_count,'stale_count',v_stale_count,'excluded_count',v_excluded,
      'premium_earnings',v_premium,'night_differential',v_night,'revised_gross_pay',v_revised,'premium_pending_count',v_pending,'premium_exception_count',v_premium_exceptions)
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
declare
  v_current public.payroll_employee_entries%rowtype; v_versions jsonb; v_daily jsonb; v_snapshots jsonb; v_exceptions jsonb;
  v_day_types jsonb; v_lines jsonb; v_events jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='PAYROLL_PERMISSION_DENIED'; end if;
  select * into v_current from public.payroll_employee_entries where payroll_period_id=p_payroll_period_id and employee_id=p_employee_id and is_current;
  select coalesce(jsonb_agg(public.payroll_employee_entry_json(entry) order by entry.version_number desc),'[]'::jsonb) into v_versions
    from public.payroll_employee_entries entry where entry.payroll_period_id=p_payroll_period_id and entry.employee_id=p_employee_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',daily.id,'work_date',daily.work_date,'employment_eligible',daily.employment_eligible,'scheduled_workday',daily.scheduled_workday,
    'scheduled_minutes',daily.scheduled_minutes,'attendance_minutes',daily.attendance_minutes,'paid_leave_minutes',daily.paid_leave_minutes,
    'unpaid_leave_minutes',daily.unpaid_leave_minutes,'absence_minutes',daily.absence_minutes,'late_minutes',daily.late_minutes,
    'undertime_minutes',daily.undertime_minutes,'approved_overtime_minutes',daily.approved_overtime_minutes,
    'daily_rate_raw',daily.daily_rate_raw,'hourly_rate_raw',daily.hourly_rate_raw,'regular_earnings_raw',daily.regular_earnings_raw,
    'absence_deduction_raw',daily.absence_deduction_raw,'late_deduction_raw',daily.late_deduction_raw,
    'undertime_deduction_raw',daily.undertime_deduction_raw,'unpaid_leave_deduction_raw',daily.unpaid_leave_deduction_raw,
    'attendance_deduction_rule_id',daily.attendance_deduction_rule_id,'late_grace_minutes',daily.late_grace_minutes,
    'late_deductible_minutes',daily.late_deductible_minutes,'undertime_grace_minutes',daily.undertime_grace_minutes,
    'undertime_deductible_minutes',daily.undertime_deductible_minutes,'calculation_details',daily.calculation_details
  ) order by daily.work_date),'[]'::jsonb) into v_daily
  from public.payroll_entry_daily_breakdowns daily where daily.payroll_employee_entry_id=v_current.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',snapshot.id,'source_type',snapshot.source_type,'source_table',snapshot.source_table,'source_record_id',snapshot.source_record_id,
    'source_updated_at',snapshot.source_updated_at,'effective_date',snapshot.effective_date,'snapshot_hash',snapshot.snapshot_hash,
    'snapshot_data',snapshot.snapshot_data,'created_at',snapshot.created_at
  ) order by snapshot.source_type,snapshot.effective_date,snapshot.created_at),'[]'::jsonb) into v_snapshots
  from public.payroll_entry_input_snapshots snapshot where snapshot.payroll_employee_entry_id=v_current.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',exception.id,'exception_code',exception.exception_code,'severity',exception.severity,'message',exception.message,
    'source_type',exception.source_type,'source_record_id',exception.source_record_id,'status',exception.status,
    'resolution_note',exception.resolution_note,'resolved_at',exception.resolved_at,'created_at',exception.created_at
  ) order by exception.created_at desc),'[]'::jsonb) into v_exceptions
  from public.payroll_entry_exceptions exception where exception.payroll_period_id=p_payroll_period_id and exception.employee_id=p_employee_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',resolution.id,'work_date',resolution.work_date,'base_day_type',resolution.base_day_type,'is_rest_day',resolution.is_rest_day,
    'holiday_version_id',resolution.holiday_version_id,'holiday_type',resolution.holiday_type,'holiday_count',resolution.holiday_count,
    'combined_day_type',resolution.combined_day_type,'resolution_source',resolution.resolution_source,
    'premium_rule_set_id',resolution.premium_rule_set_id,'premium_rule_version_id',resolution.premium_rule_version_id
  ) order by resolution.work_date),'[]'::jsonb) into v_day_types
  from public.payroll_day_type_resolutions resolution where resolution.payroll_employee_entry_id=v_current.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',line.id,'daily_breakdown_id',line.payroll_entry_daily_breakdown_id,'work_date',line.work_date,'premium_type',line.premium_type,
    'day_type',line.day_type,'premium_rule_set_id',line.premium_rule_set_id,'premium_rule_version_id',line.premium_rule_version_id,
    'base_hourly_rate_raw',line.base_hourly_rate_raw,'raw_minutes',line.raw_minutes,'rounded_minutes',line.rounded_minutes,
    'day_multiplier',line.day_multiplier,'overtime_multiplier',line.overtime_multiplier,'night_percentage',line.night_percentage,
    'base_amount_raw',line.base_amount_raw,'premium_amount_raw',line.premium_amount_raw,'premium_amount_rounded',line.premium_amount_rounded,
    'is_additional_only',line.is_additional_only,'calculation_details',line.calculation_details,'created_at',line.created_at
  ) order by line.work_date,line.premium_type),'[]'::jsonb) into v_lines
  from public.payroll_premium_lines line where line.payroll_employee_entry_id=v_current.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',event.id,'event_type',event.event_type,'reason',event.reason,'metadata',event.metadata,'created_at',event.created_at)
    order by event.created_at desc),'[]'::jsonb) into v_events
  from public.premium_calculation_events event where event.payroll_period_id=p_payroll_period_id and event.employee_id=p_employee_id;
  return jsonb_build_object('employee',public.payroll_employee_identity_json(p_employee_id),
    'current_entry',case when v_current.id is null then null else public.payroll_employee_entry_json(v_current) end,
    'versions',v_versions,'daily_breakdowns',v_daily,'snapshots',v_snapshots,'exceptions',v_exceptions,
    'day_type_resolutions',v_day_types,'premium_lines',v_lines,'premium_events',v_events);
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
  if p_url is null or btrim(p_url)='' then return null; end if;
  if p_url ~* '^[a-z][a-z0-9+.-]*:' or starts_with(p_url,'//') or position('://' in p_url)>0
     or position(E'\\' in p_url)>0 or p_url ~ '[[:cntrl:]]' or lower(p_url) like 'javascript:%' then
    raise exception using errcode='P0001',message='NOTIFICATION_INVALID_ACTION_URL';
  end if;
  v_allowed:=
       p_url='/attendance' or starts_with(p_url,'/attendance/') or starts_with(p_url,'/attendance?')
    or p_url='/admin/attendance' or starts_with(p_url,'/admin/attendance/') or starts_with(p_url,'/admin/attendance?')
    or p_url='/leave' or starts_with(p_url,'/leave/') or starts_with(p_url,'/leave?')
    or p_url='/employee/leave' or starts_with(p_url,'/employee/leave/') or starts_with(p_url,'/employee/leave?')
    or p_url='/admin/leave' or starts_with(p_url,'/admin/leave/') or starts_with(p_url,'/admin/leave?')
    or p_url='/overtime' or starts_with(p_url,'/overtime/') or starts_with(p_url,'/overtime?')
    or p_url='/admin/overtime' or starts_with(p_url,'/admin/overtime/') or starts_with(p_url,'/admin/overtime?')
    or p_url='/documents' or starts_with(p_url,'/documents/') or starts_with(p_url,'/documents?')
    or p_url='/admin/documents/review' or starts_with(p_url,'/admin/documents/review/') or starts_with(p_url,'/admin/documents/review?')
    or p_url='/notifications' or starts_with(p_url,'/notifications/') or starts_with(p_url,'/notifications?')
    or p_url='/admin/notifications/settings' or starts_with(p_url,'/admin/notifications/settings/') or starts_with(p_url,'/admin/notifications/settings?')
    or p_url='/payroll' or starts_with(p_url,'/payroll?')
    or p_url='/payroll/approvals' or starts_with(p_url,'/payroll/approvals?')
    or p_url='/payroll/approvals/premium-rules' or starts_with(p_url,'/payroll/approvals/premium-rules?')
    or p_url='/payroll/periods' or starts_with(p_url,'/payroll/periods?')
    or p_url='/payroll/settings/basis-rules' or starts_with(p_url,'/payroll/settings/basis-rules?')
    or p_url='/payroll/settings/premium-rules' or starts_with(p_url,'/payroll/settings/premium-rules/') or starts_with(p_url,'/payroll/settings/premium-rules?')
    or p_url='/payroll/settings/attendance-deduction-rules' or starts_with(p_url,'/payroll/settings/attendance-deduction-rules?')
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}(\?.*)?$'
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}/workspace(\?.*)?$'
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}/exceptions(\?.*)?$'
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}/employees/[0-9a-fA-F-]{36}(\?.*)?$'
    or p_url='/me/compensation' or starts_with(p_url,'/me/compensation?');
  if not v_allowed then raise exception using errcode='P0001',message='NOTIFICATION_INVALID_ACTION_URL'; end if;
  return p_url;
end;
$$;

drop function if exists public.create_holiday(date,text,text,text);
create or replace function public.create_holiday(
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_change_reason text default null,
  p_holiday_count smallint default 1
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_name text:=nullif(btrim(coalesce(p_holiday_name,'')),''); v_reason text:=nullif(btrim(coalesce(p_change_reason,'')),''); v_group_id uuid; v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='UNAUTHORIZED'; end if;
  if p_holiday_date is null then raise exception using errcode='P0001',message='HOLIDAY_DATE_REQUIRED'; end if;
  if v_name is null or char_length(v_name)>160 then raise exception using errcode='P0001',message='HOLIDAY_NAME_INVALID'; end if;
  if p_holiday_type not in ('regular_holiday','special_non_working_holiday','company_holiday') then raise exception using errcode='P0001',message='HOLIDAY_TYPE_INVALID'; end if;
  if p_holiday_count not in (1,2) then raise exception using errcode='P0001',message='HOLIDAY_COUNT_INVALID'; end if;
  if p_holiday_count=2 and p_holiday_type<>'regular_holiday' then raise exception using errcode='P0001',message='HOLIDAY_DOUBLE_REQUIRES_REGULAR'; end if;
  if p_holiday_date<=public.company_attendance_date(now()) and v_reason is null then raise exception using errcode='P0001',message='HOLIDAY_REASON_REQUIRED'; end if;
  if v_reason is not null and char_length(v_reason)>1000 then raise exception using errcode='P0001',message='PRIVATE_TEXT_TOO_LONG'; end if;
  lock table public.holiday_calendar_groups in share row exclusive mode;
  if exists(select 1 from public.holiday_calendar_groups group_row join public.holiday_calendar_versions version on version.id=group_row.active_version_id where version.holiday_date=p_holiday_date and version.is_active) then raise exception using errcode='P0001',message='HOLIDAY_DATE_EXISTS'; end if;
  insert into public.holiday_calendar_groups(created_by) values(v_actor) returning id into v_group_id;
  insert into public.holiday_calendar_versions(holiday_group_id,revision_number,holiday_date,holiday_name,holiday_type,holiday_count,is_active,created_by,change_reason)
    values(v_group_id,1,p_holiday_date,v_name,p_holiday_type,p_holiday_count,true,v_actor,v_reason) returning id into v_version_id;
  update public.holiday_calendar_groups set active_version_id=v_version_id,updated_at=now() where id=v_group_id;
  perform public.write_employee_audit(null,'holiday.created','holiday_calendar',v_group_id,
    jsonb_build_array('holiday_date','holiday_name','holiday_type','holiday_count','revision_number'),'{}'::jsonb,
    jsonb_build_object('holiday_group_id',v_group_id,'holiday_version_id',v_version_id,'holiday_date',p_holiday_date,'holiday_name',v_name,
      'holiday_type',p_holiday_type,'holiday_count',p_holiday_count,'revision_number',1,'is_active',true),'{}'::jsonb,'application',v_actor);
  return v_group_id;
end;
$$;

drop function if exists public.replace_holiday_version(uuid,uuid,date,text,text,boolean,text);
create or replace function public.replace_holiday_version(
  p_holiday_group_id uuid,
  p_expected_active_version_id uuid,
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_is_active boolean,
  p_change_reason text,
  p_holiday_count smallint default 1
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_name text:=nullif(btrim(coalesce(p_holiday_name,'')),''); v_reason text:=nullif(btrim(coalesce(p_change_reason,'')),''); v_group public.holiday_calendar_groups%rowtype; v_active public.holiday_calendar_versions%rowtype; v_version_id uuid; v_revision integer; v_action text;
begin
  if v_actor is null or not public.is_hr_admin() then raise exception using errcode='P0001',message='UNAUTHORIZED'; end if;
  if p_holiday_group_id is null or p_expected_active_version_id is null then raise exception using errcode='P0001',message='HOLIDAY_INPUT_INVALID'; end if;
  if p_holiday_date is null then raise exception using errcode='P0001',message='HOLIDAY_DATE_REQUIRED'; end if;
  if v_name is null or char_length(v_name)>160 then raise exception using errcode='P0001',message='HOLIDAY_NAME_INVALID'; end if;
  if p_holiday_type not in ('regular_holiday','special_non_working_holiday','company_holiday') then raise exception using errcode='P0001',message='HOLIDAY_TYPE_INVALID'; end if;
  if p_holiday_count not in (1,2) then raise exception using errcode='P0001',message='HOLIDAY_COUNT_INVALID'; end if;
  if p_holiday_count=2 and p_holiday_type<>'regular_holiday' then raise exception using errcode='P0001',message='HOLIDAY_DOUBLE_REQUIRES_REGULAR'; end if;
  if p_holiday_date<=public.company_attendance_date(now()) and v_reason is null then raise exception using errcode='P0001',message='HOLIDAY_REASON_REQUIRED'; end if;
  if v_reason is null or char_length(v_reason)>1000 then raise exception using errcode='P0001',message='PRIVATE_TEXT_TOO_LONG'; end if;
  lock table public.holiday_calendar_groups in share row exclusive mode;
  select * into v_group from public.holiday_calendar_groups where id=p_holiday_group_id for update;
  if not found then raise exception using errcode='P0001',message='HOLIDAY_NOT_FOUND'; end if;
  if v_group.active_version_id is distinct from p_expected_active_version_id then raise exception using errcode='P0001',message='HOLIDAY_VERSION_STALE'; end if;
  select * into v_active from public.holiday_calendar_versions where id=v_group.active_version_id and holiday_group_id=v_group.id;
  if p_is_active and exists(select 1 from public.holiday_calendar_groups other_group join public.holiday_calendar_versions version on version.id=other_group.active_version_id where other_group.id<>v_group.id and version.holiday_date=p_holiday_date and version.is_active) then raise exception using errcode='P0001',message='HOLIDAY_DATE_EXISTS'; end if;
  v_revision:=v_active.revision_number+1;
  insert into public.holiday_calendar_versions(holiday_group_id,revision_number,holiday_date,holiday_name,holiday_type,holiday_count,is_active,created_by,change_reason)
    values(v_group.id,v_revision,p_holiday_date,v_name,p_holiday_type,p_holiday_count,p_is_active,v_actor,v_reason) returning id into v_version_id;
  update public.holiday_calendar_groups set active_version_id=v_version_id,updated_at=now() where id=v_group.id;
  v_action:=case when p_is_active then 'holiday.replaced' else 'holiday.deactivated' end;
  perform public.write_employee_audit(null,v_action,'holiday_calendar',v_group.id,
    jsonb_build_array('holiday_date','holiday_name','holiday_type','holiday_count','revision_number','is_active'),
    jsonb_build_object('holiday_version_id',v_active.id,'holiday_date',v_active.holiday_date,'holiday_name',v_active.holiday_name,
      'holiday_type',v_active.holiday_type,'holiday_count',v_active.holiday_count,'revision_number',v_active.revision_number,'is_active',v_active.is_active),
    jsonb_build_object('holiday_version_id',v_version_id,'holiday_date',p_holiday_date,'holiday_name',v_name,
      'holiday_type',p_holiday_type,'holiday_count',p_holiday_count,'revision_number',v_revision,'is_active',p_is_active),
    '{}'::jsonb,'application',v_actor);
  return v_version_id;
end;
$$;

revoke all on function public.create_holiday(date,text,text,text,smallint) from public,anon,authenticated;
grant execute on function public.create_holiday(date,text,text,text,smallint) to authenticated;
revoke all on function public.replace_holiday_version(uuid,uuid,date,text,text,boolean,text,smallint) from public,anon,authenticated;
grant execute on function public.replace_holiday_version(uuid,uuid,date,text,text,boolean,text,smallint) to authenticated;

-- Internal helpers are never directly browser executable.
revoke all on function public.reject_premium_calculation_mutation() from public,anon,authenticated;
revoke all on function public.reject_approved_premium_rule_mutation() from public,anon,authenticated;
revoke all on function public.reject_approved_premium_rule_version_mutation() from public,anon,authenticated;
revoke all on function public.write_premium_rule_event(uuid,uuid,uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.write_premium_calculation_event(uuid,uuid,uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.validate_premium_rule_scope(public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.validate_premium_day_rules(jsonb) from public,anon,authenticated;
revoke all on function public.round_premium_minutes(integer,public.premium_time_rounding_mode,integer) from public,anon,authenticated;
revoke all on function public.resolve_employee_premium_rule(uuid,uuid,date,public.premium_day_type) from public,anon,authenticated;
revoke all on function public.resolve_attendance_deduction_rule(uuid,date) from public,anon,authenticated;
revoke all on function public.resolve_employee_day_type(uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.resolve_payroll_premium_segments(uuid,date) from public,anon,authenticated;
revoke all on function public.calculate_night_overlap_minutes(timestamptz,timestamptz,date,time,time) from public,anon,authenticated;
revoke all on function public.mark_payroll_entries_stale_for_premium_scope(public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,public.payroll_source_type,uuid) from public,anon,authenticated;
revoke all on function public.mark_payroll_stale_from_holiday_count() from public,anon,authenticated;
revoke all on function public.clone_payroll_entry_for_premiums(uuid,uuid) from public,anon,authenticated;
revoke all on function public.calculate_employee_premiums_internal(uuid) from public,anon,authenticated;
revoke all on function public.premium_rule_set_json(public.premium_rule_sets) from public,anon,authenticated;
revoke all on function public.attendance_deduction_rule_json(public.attendance_deduction_rules) from public,anon,authenticated;
revoke all on function public.validate_notification_action_url(text) from public,anon,authenticated;

-- Public HR/Super Admin RPCs still verify the actor inside each function.
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.create_premium_rule_set(text,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,text,text,date,text,jsonb,uuid)',
    'public.clone_premium_rule_preset(text,text,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,uuid)',
    'public.clone_premium_rule_version(uuid,date,date,text,uuid)',
    'public.update_premium_rule_set_draft(uuid,timestamptz,text,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,text,text,date,text,jsonb,uuid)',
    'public.submit_premium_rule_set(uuid,integer,uuid)',
    'public.approve_premium_rule_set(uuid,integer,uuid)',
    'public.reject_premium_rule_set(uuid,integer,text,uuid)',
    'public.create_attendance_deduction_rule(public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,integer,integer,public.premium_time_rounding_mode,integer,public.premium_time_rounding_mode,integer,date,date,text,uuid)',
    'public.clone_attendance_deduction_rule(uuid,date,date,text,uuid)',
    'public.update_attendance_deduction_rule_draft(uuid,timestamptz,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,integer,integer,public.premium_time_rounding_mode,integer,public.premium_time_rounding_mode,integer,date,date,text,uuid)',
    'public.submit_attendance_deduction_rule(uuid,integer,uuid)',
    'public.approve_attendance_deduction_rule(uuid,integer,uuid)',
    'public.reject_attendance_deduction_rule(uuid,integer,text,uuid)',
    'public.list_premium_rule_sets()',
    'public.get_premium_rule_set_detail(uuid)',
    'public.list_attendance_deduction_rules()',
    'public.list_premium_rule_approvals()',
    'public.preview_premium_rule_coverage(uuid)',
    'public.calculate_payroll_premiums(uuid,text,uuid[],uuid)',
    'public.recalculate_employee_premiums(uuid,uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated',v_signature);
    execute format('grant execute on function %s to authenticated',v_signature);
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
