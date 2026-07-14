begin;

create extension if not exists pg_cron;

create table if not exists public.attendance_policy_versions (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null,
  late_grace_minutes integer not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint attendance_policy_effective_unique unique (effective_date),
  constraint attendance_policy_grace_check
    check (late_grace_minutes between 0 and 120),
  constraint attendance_policy_reason_length_check
    check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.attendance_calculation_groups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  attendance_date date not null,
  active_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calculation_group_employee_date_unique
    unique (employee_id, attendance_date)
);

create table if not exists public.attendance_calculation_revisions (
  id uuid primary key default gen_random_uuid(),
  calculation_group_id uuid not null
    references public.attendance_calculation_groups(id) on delete restrict,
  revision_number integer not null,
  attendance_record_id uuid
    references public.attendance_records(id) on delete restrict,
  schedule_assignment_id uuid
    references public.employee_schedule_assignments(id) on delete restrict,
  schedule_version_id uuid
    references public.work_schedule_versions(id) on delete restrict,
  policy_version_id uuid
    references public.attendance_policy_versions(id) on delete restrict,
  base_status text not null,
  is_provisional boolean not null default false,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  scheduled_minutes integer,
  actual_clock_in_at timestamptz,
  actual_clock_out_at timestamptz,
  worked_minutes integer,
  late_minutes integer,
  undertime_minutes integer,
  is_late boolean not null default false,
  is_undertime boolean not null default false,
  is_corrected boolean not null default false,
  is_recalculated boolean not null default false,
  calculation_source text not null,
  calculated_by uuid references public.profiles(id) on delete set null,
  calculated_at timestamptz not null default now(),
  recalculation_reason text,
  constraint calculation_revision_number_unique
    unique (calculation_group_id, revision_number),
  constraint calculation_revision_status_check
    check (base_status in (
      'present',
      'absent',
      'missing_clock_out',
      'rest_day_worked',
      'unscheduled_attendance'
    )),
  constraint calculation_revision_source_check
    check (calculation_source in (
      'clock_in',
      'clock_out',
      'hr_create',
      'hr_correction',
      'correction_approval',
      'daily_finalization',
      'manual_recalculation',
      'manual_finalization'
    )),
  constraint calculation_revision_reason_length_check
    check (
      recalculation_reason is null
      or char_length(recalculation_reason) <= 1000
    ),
  constraint calculation_nonnegative_minutes_check
    check (
      (scheduled_minutes is null or scheduled_minutes >= 0)
      and (worked_minutes is null or worked_minutes >= 0)
      and (late_minutes is null or late_minutes >= 0)
      and (undertime_minutes is null or undertime_minutes >= 0)
    ),
  constraint calculation_missing_clock_out_check
    check (
      base_status <> 'missing_clock_out'
      or (worked_minutes is null and undertime_minutes is null)
    ),
  constraint calculation_absent_check
    check (base_status <> 'absent' or attendance_record_id is null),
  constraint calculation_rest_unscheduled_check
    check (
      base_status not in ('rest_day_worked', 'unscheduled_attendance')
      or (late_minutes is null and undertime_minutes is null)
    ),
  constraint calculation_provisional_status_check
    check (
      not is_provisional
      or base_status not in ('absent', 'missing_clock_out')
    ),
  constraint calculation_completed_present_check
    check (
      base_status <> 'present'
      or is_provisional
      or worked_minutes is not null
    )
);

alter table public.attendance_calculation_groups
  add constraint attendance_calculation_groups_active_revision_fkey
  foreign key (active_revision_id)
  references public.attendance_calculation_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.attendance_finalization_runs (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  run_source text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  employees_processed integer not null default 0,
  absences_created integer not null default 0,
  missing_clock_outs_finalized integer not null default 0,
  unchanged_results_skipped integer not null default 0,
  error_count integer not null default 0,
  started_by uuid references public.profiles(id) on delete set null,
  manual_reason text,
  constraint attendance_finalization_source_check
    check (run_source in ('scheduled_job', 'manual')),
  constraint attendance_finalization_status_check
    check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  constraint attendance_finalization_counts_check
    check (
      employees_processed >= 0
      and absences_created >= 0
      and missing_clock_outs_finalized >= 0
      and unchanged_results_skipped >= 0
      and error_count >= 0
    ),
  constraint attendance_finalization_reason_length_check
    check (manual_reason is null or char_length(manual_reason) <= 1000)
);

create index if not exists attendance_policy_versions_effective_idx
  on public.attendance_policy_versions(effective_date desc, id desc);
create index if not exists attendance_calculation_groups_employee_date_idx
  on public.attendance_calculation_groups(employee_id, attendance_date desc);
create index if not exists attendance_calculation_revisions_group_revision_idx
  on public.attendance_calculation_revisions(
    calculation_group_id,
    revision_number desc
  );
create index if not exists attendance_calculation_revisions_attendance_idx
  on public.attendance_calculation_revisions(attendance_record_id);
create index if not exists attendance_finalization_runs_target_idx
  on public.attendance_finalization_runs(target_date desc, started_at desc);
create unique index if not exists attendance_finalization_one_running_idx
  on public.attendance_finalization_runs(target_date)
  where status = 'running';

alter table public.attendance_policy_versions enable row level security;
alter table public.attendance_calculation_groups enable row level security;
alter table public.attendance_calculation_revisions enable row level security;
alter table public.attendance_finalization_runs enable row level security;

create policy "HR views attendance policy versions"
on public.attendance_policy_versions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views attendance calculation groups"
on public.attendance_calculation_groups
for select to authenticated
using (public.is_hr_admin());

create policy "HR views attendance calculation revisions"
on public.attendance_calculation_revisions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views attendance finalization runs"
on public.attendance_finalization_runs
for select to authenticated
using (public.is_hr_admin());

-- Application users receive no direct mutation policies for policy versions,
-- calculation groups, revisions, or finalization runs. All writes use RPCs.


create or replace function public.create_attendance_policy_version(
  p_effective_date date,
  p_late_grace_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_policy_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_effective_date is null then
    raise exception using errcode = 'P0001', message = 'POLICY_DATE_REQUIRED';
  end if;
  if p_late_grace_minutes is null or p_late_grace_minutes < 0
    or p_late_grace_minutes > 120 then
    raise exception using errcode = 'P0001', message = 'POLICY_GRACE_OUT_OF_RANGE';
  end if;
  if p_effective_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'POLICY_REASON_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  insert into public.attendance_policy_versions (
    effective_date, late_grace_minutes, created_by, change_reason
  ) values (
    p_effective_date, p_late_grace_minutes, v_actor, v_reason
  ) returning id into v_policy_id;

  perform public.write_employee_audit(
    null,
    'attendance_policy.created',
    'attendance_policy',
    v_policy_id,
    jsonb_build_array('effective_date', 'late_grace_minutes'),
    '{}'::jsonb,
    jsonb_build_object(
      'policy_version_id', v_policy_id,
      'effective_date', p_effective_date,
      'late_grace_minutes', p_late_grace_minutes
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_policy_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'POLICY_EFFECTIVE_DATE_EXISTS';
end;
$$;

revoke all on function public.create_attendance_policy_version(date, integer, text)
  from public, anon;
grant execute on function public.create_attendance_policy_version(date, integer, text)
  to authenticated;

create or replace function public.resolve_attendance_policy(
  p_attendance_date date
)
returns table(policy_version_id uuid, late_grace_minutes integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select policy.id, policy.late_grace_minutes
  from public.attendance_policy_versions as policy
  where policy.effective_date <= p_attendance_date
  order by policy.effective_date desc, policy.id desc
  limit 1;

  if not found then
    return query select null::uuid, 0::integer;
  end if;
end;
$$;

revoke all on function public.resolve_attendance_policy(date)
  from public, anon, authenticated;

create or replace function public.write_attendance_calculation_revision(
  p_employee_id uuid,
  p_attendance_date date,
  p_attendance_record_id uuid,
  p_schedule_assignment_id uuid,
  p_schedule_version_id uuid,
  p_policy_version_id uuid,
  p_base_status text,
  p_is_provisional boolean,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_scheduled_minutes integer,
  p_actual_clock_in_at timestamptz,
  p_actual_clock_out_at timestamptz,
  p_worked_minutes integer,
  p_late_minutes integer,
  p_undertime_minutes integer,
  p_is_late boolean,
  p_is_undertime boolean,
  p_is_corrected boolean,
  p_is_recalculated boolean,
  p_calculation_source text,
  p_calculated_by uuid,
  p_recalculation_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_action text;
begin
  insert into public.attendance_calculation_groups (
    employee_id, attendance_date
  ) values (
    p_employee_id, p_attendance_date
  ) on conflict (employee_id, attendance_date) do nothing;

  select id into v_group_id
  from public.attendance_calculation_groups
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
  for update;

  select coalesce(max(revision_number), 0) + 1
    into v_revision_number
  from public.attendance_calculation_revisions
  where calculation_group_id = v_group_id;

  insert into public.attendance_calculation_revisions (
    calculation_group_id, revision_number, attendance_record_id,
    schedule_assignment_id, schedule_version_id, policy_version_id,
    base_status, is_provisional, scheduled_start_at, scheduled_end_at,
    scheduled_minutes, actual_clock_in_at, actual_clock_out_at,
    worked_minutes, late_minutes, undertime_minutes,
    is_late, is_undertime, is_corrected, is_recalculated,
    calculation_source, calculated_by, recalculation_reason
  ) values (
    v_group_id, v_revision_number, p_attendance_record_id,
    p_schedule_assignment_id, p_schedule_version_id, p_policy_version_id,
    p_base_status, p_is_provisional, p_scheduled_start_at, p_scheduled_end_at,
    p_scheduled_minutes, p_actual_clock_in_at, p_actual_clock_out_at,
    p_worked_minutes, p_late_minutes, p_undertime_minutes,
    p_is_late, p_is_undertime, p_is_corrected, p_is_recalculated,
    p_calculation_source, p_calculated_by,
    nullif(btrim(coalesce(p_recalculation_reason, '')), '')
  ) returning id into v_revision_id;

  update public.attendance_calculation_groups
  set active_revision_id = v_revision_id,
      updated_at = now()
  where id = v_group_id;

  v_action := case
    when p_calculation_source = 'manual_recalculation'
      then 'attendance_calculation.recalculated'
    when p_calculation_source in ('daily_finalization', 'manual_finalization')
      then 'attendance_calculation.finalized'
    else 'attendance_calculation.created'
  end;

  perform public.write_employee_audit(
    p_employee_id,
    v_action,
    'attendance_calculation',
    v_revision_id,
    jsonb_build_array(
      'attendance_date', 'base_status', 'revision_number',
      'worked_minutes', 'late_minutes', 'undertime_minutes',
      'is_provisional'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', p_attendance_date,
      'base_status', p_base_status,
      'revision_number', v_revision_number,
      'scheduled_minutes', p_scheduled_minutes,
      'worked_minutes', p_worked_minutes,
      'late_minutes', p_late_minutes,
      'undertime_minutes', p_undertime_minutes,
      'is_provisional', p_is_provisional,
      'policy_version_id', p_policy_version_id,
      'schedule_version_id', p_schedule_version_id,
      'calculation_source', p_calculation_source
    ),
    '{}'::jsonb,
    'application',
    p_calculated_by
  );

  return v_revision_id;
end;
$$;

revoke all on function public.write_attendance_calculation_revision(
  uuid, date, uuid, uuid, uuid, uuid, text, boolean,
  timestamptz, timestamptz, integer, timestamptz, timestamptz,
  integer, integer, integer, boolean, boolean, boolean, boolean,
  text, uuid, text
) from public, anon, authenticated;

create or replace function public.validate_active_calculation_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active_revision_id is not null and not exists (
    select 1
    from public.attendance_calculation_revisions as revision
    where revision.id = new.active_revision_id
      and revision.calculation_group_id = new.id
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_REVISION_GROUP_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_active_calculation_revision()
  from public, anon, authenticated;

drop trigger if exists validate_active_calculation_revision_trigger
  on public.attendance_calculation_groups;
create constraint trigger validate_active_calculation_revision_trigger
after insert or update of active_revision_id
on public.attendance_calculation_groups
deferrable initially deferred
for each row execute function public.validate_active_calculation_revision();


create or replace function public.calculate_attendance_day_internal(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text,
  p_actor_profile_id uuid,
  p_recalculation_reason text default null,
  p_force_final boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendance public.attendance_records%rowtype;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_version public.work_schedule_versions%rowtype;
  v_attendance_exists boolean := false;
  v_assignment_exists boolean := false;
  v_version_exists boolean := false;
  v_policy_version_id uuid;
  v_late_grace_minutes integer := 0;
  v_company_date date := public.company_attendance_date(now());
  v_date_has_ended boolean;
  v_weekday text;
  v_is_workday boolean := false;
  v_base_status text;
  v_is_provisional boolean := false;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  v_scheduled_minutes integer;
  v_worked_minutes integer;
  v_late_minutes integer;
  v_undertime_minutes integer;
  v_is_late boolean := false;
  v_is_undertime boolean := false;
  v_revision_id uuid;
begin
  if p_attendance_date is null or p_attendance_date > v_company_date then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if p_source not in (
    'clock_in','clock_out','hr_create','hr_correction',
    'correction_approval','daily_finalization',
    'manual_recalculation','manual_finalization'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_CALCULATION_SOURCE';
  end if;

  perform 1 from public.employees where id = p_employee_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_attendance
  from public.attendance_records
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
  limit 1;
  v_attendance_exists := found;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date <= p_attendance_date
    and (effective_end_date is null or effective_end_date >= p_attendance_date)
  order by effective_start_date desc, id desc
  limit 1;
  v_assignment_exists := found;

  if v_assignment_exists then
    select * into v_version
    from public.work_schedule_versions
    where schedule_template_id = v_assignment.schedule_template_id
      and effective_date <= p_attendance_date
    order by effective_date desc, id desc
    limit 1;
    v_version_exists := found;
    if not v_version_exists then
      raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_NOT_FOUND';
    end if;
  end if;

  select policy_version_id, late_grace_minutes
    into v_policy_version_id, v_late_grace_minutes
  from public.resolve_attendance_policy(p_attendance_date);

  v_date_has_ended := p_attendance_date < v_company_date;
  v_weekday := lower(trim(to_char(p_attendance_date::timestamp, 'FMDay')));
  if v_version_exists then
    v_is_workday := v_weekday = any(v_version.working_days);
  end if;

  if v_assignment_exists and v_is_workday then
    v_scheduled_start_at :=
      (p_attendance_date + v_version.start_time) at time zone 'Asia/Manila';
    v_scheduled_end_at :=
      (p_attendance_date + v_version.end_time) at time zone 'Asia/Manila';
    v_scheduled_minutes := greatest(
      0,
      floor(extract(epoch from (v_scheduled_end_at - v_scheduled_start_at)) / 60)::integer
        - v_version.break_minutes
    );
  end if;

  if not v_assignment_exists then
    if not v_attendance_exists then
      return null;
    end if;
    v_base_status := 'unscheduled_attendance';
    v_is_provisional := v_attendance.clock_out_at is null
      and not v_date_has_ended and not p_force_final;
  elsif not v_is_workday then
    if not v_attendance_exists then
      return null;
    end if;
    v_base_status := 'rest_day_worked';
    v_is_provisional := v_attendance.clock_out_at is null
      and not v_date_has_ended and not p_force_final;
    v_scheduled_minutes := 0;
  elsif not v_attendance_exists then
    if not v_date_has_ended and not p_force_final then
      return null;
    end if;
    v_base_status := 'absent';
    v_is_provisional := false;
    v_worked_minutes := 0;
    v_late_minutes := 0;
    v_undertime_minutes := 0;
  else
    if v_attendance.clock_out_at is null then
      if v_date_has_ended or p_force_final then
        v_base_status := 'missing_clock_out';
        v_is_provisional := false;
      else
        v_base_status := 'present';
        v_is_provisional := true;
      end if;
    else
      v_base_status := 'present';
      v_is_provisional := false;
    end if;
  end if;

  if v_attendance_exists and v_assignment_exists and v_is_workday then
    if v_attendance.clock_in_at <=
      v_scheduled_start_at + make_interval(mins => v_late_grace_minutes) then
      v_late_minutes := 0;
    else
      v_late_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_attendance.clock_in_at - v_scheduled_start_at
        )) / 60)::integer
      );
    end if;
    v_is_late := coalesce(v_late_minutes, 0) > 0;
  end if;

  if v_attendance_exists and v_attendance.clock_out_at is not null then
    v_worked_minutes := greatest(
      0,
      floor(extract(epoch from (
        v_attendance.clock_out_at - v_attendance.clock_in_at
      )) / 60)::integer
      - case when v_version_exists then v_version.break_minutes else 0 end
    );

    if v_assignment_exists and v_is_workday then
      v_undertime_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_scheduled_end_at - v_attendance.clock_out_at
        )) / 60)::integer
      );
      v_is_undertime := v_undertime_minutes > 0;
    else
      v_late_minutes := null;
      v_undertime_minutes := null;
      v_is_late := false;
      v_is_undertime := false;
    end if;
  elsif v_base_status = 'missing_clock_out' then
    v_worked_minutes := null;
    v_undertime_minutes := null;
    v_is_undertime := false;
  end if;

  v_revision_id := public.write_attendance_calculation_revision(
    p_employee_id,
    p_attendance_date,
    case when v_attendance_exists then v_attendance.id else null end,
    case when v_assignment_exists then v_assignment.id else null end,
    case when v_version_exists then v_version.id else null end,
    v_policy_version_id,
    v_base_status,
    v_is_provisional,
    case when v_assignment_exists and v_is_workday then v_scheduled_start_at else null end,
    case when v_assignment_exists and v_is_workday then v_scheduled_end_at else null end,
    v_scheduled_minutes,
    case when v_attendance_exists then v_attendance.clock_in_at else null end,
    case when v_attendance_exists then v_attendance.clock_out_at else null end,
    v_worked_minutes,
    v_late_minutes,
    v_undertime_minutes,
    v_is_late,
    v_is_undertime,
    case when v_attendance_exists then v_attendance.is_corrected else false end,
    p_source = 'manual_recalculation',
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );

  return v_revision_id;
end;
$$;

revoke all on function public.calculate_attendance_day_internal(
  uuid, date, text, uuid, text, boolean
) from public, anon, authenticated;

create or replace function public.calculate_attendance_day(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_attendance_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;

  if not public.is_hr_admin() then
    if p_source not in ('clock_in', 'clock_out') then
      raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
    end if;
    select employee.id into v_employee_id
    from public.employees as employee
    where employee.profile_id = v_actor
      and employee.id = p_employee_id
      and employee.archived_at is null;
    if v_employee_id is null then
      raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
    end if;
  elsif p_source = 'manual_recalculation' then
    raise exception using errcode = 'P0001', message = 'INVALID_CALCULATION_SOURCE';
  end if;

  return public.calculate_attendance_day_internal(
    p_employee_id,
    p_attendance_date,
    p_source,
    v_actor,
    null,
    false
  );
end;
$$;

revoke all on function public.calculate_attendance_day(uuid, date, text)
  from public, anon;
grant execute on function public.calculate_attendance_day(uuid, date, text)
  to authenticated;

create or replace function public.clock_in_attendance(
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_clock_in timestamptz := now();
  v_company_date date := public.company_attendance_date(v_clock_in);
  v_note text := public.normalize_attendance_private_text(p_note, false);
  v_record_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select * into v_employee
  from public.employees
  where profile_id = v_actor
    and archived_at is null
    and employment_status not in ('inactive', 'terminated')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.attendance_records
    where employee_id = v_employee.id
      and attendance_date < v_company_date
      and clock_out_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'PREVIOUS_OPEN_ATTENDANCE';
  end if;

  if exists (
    select 1
    from public.attendance_records
    where employee_id = v_employee.id
      and attendance_date = v_company_date
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_CLOCKED_IN';
  end if;

  insert into public.attendance_records (
    employee_id,
    attendance_date,
    clock_in_at,
    clock_in_note,
    status,
    created_by
  ) values (
    v_employee.id,
    v_company_date,
    v_clock_in,
    v_note,
    'clocked_in',
    v_actor
  )
  returning id into v_record_id;

  perform public.write_employee_audit(
    v_employee.id,
    'attendance.clocked_in',
    'attendance',
    v_record_id,
    jsonb_build_array('attendance_date', 'clock_in_at', 'status'),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', v_company_date,
      'clock_in_at', v_clock_in,
      'status', 'clocked_in'
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  perform public.calculate_attendance_day_internal(
    v_employee.id, v_company_date, 'clock_in', v_actor, null, false
  );

  return v_record_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'ALREADY_CLOCKED_IN';
end;
$$;

revoke all on function public.clock_in_attendance(text) from public, anon;
grant execute on function public.clock_in_attendance(text) to authenticated;

create or replace function public.clock_out_attendance(
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_clock_out timestamptz := now();
  v_company_date date := public.company_attendance_date(v_clock_out);
  v_note text := public.normalize_attendance_private_text(p_note, false);
  v_record public.attendance_records%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select * into v_employee
  from public.employees
  where profile_id = v_actor
    and archived_at is null
    and employment_status not in ('inactive', 'terminated')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_record
  from public.attendance_records
  where employee_id = v_employee.id
    and attendance_date = v_company_date
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NO_TODAY_ATTENDANCE';
  end if;
  if v_record.clock_out_at is not null then
    raise exception using errcode = 'P0001', message = 'ALREADY_CLOCKED_OUT';
  end if;

  update public.attendance_records
  set
    clock_out_at = v_clock_out,
    clock_out_note = v_note,
    status = 'completed',
    updated_at = v_clock_out
  where id = v_record.id;

  perform public.write_employee_audit(
    v_employee.id,
    'attendance.clocked_out',
    'attendance',
    v_record.id,
    jsonb_build_array('clock_out_at', 'status'),
    jsonb_build_object(
      'clock_out_at', null,
      'status', v_record.status
    ),
    jsonb_build_object(
      'clock_out_at', v_clock_out,
      'status', 'completed'
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  perform public.calculate_attendance_day_internal(
    v_employee.id, v_company_date, 'clock_out', v_actor, null, false
  );

  return v_record.id;
end;
$$;

revoke all on function public.clock_out_attendance(text) from public, anon;
grant execute on function public.clock_out_attendance(text) to authenticated;

create or replace function public.hr_create_attendance(
  p_employee_id uuid,
  p_attendance_date date,
  p_clock_in_local timestamp,
  p_clock_out_local timestamp default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_reason text;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_status text;
  v_record_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  v_reason := public.normalize_attendance_private_text(p_reason, true);
  v_clock_in := p_clock_in_local at time zone 'Asia/Manila';
  v_clock_out := case
    when p_clock_out_local is null then null
    else p_clock_out_local at time zone 'Asia/Manila'
  end;

  if p_attendance_date is null or p_clock_in_local is null then
    raise exception using errcode = 'P0001', message = 'INVALID_ATTENDANCE_INPUT';
  end if;
  if p_attendance_date > public.company_attendance_date(v_now) then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if public.company_attendance_date(v_clock_in) <> p_attendance_date then
    raise exception using errcode = 'P0001', message = 'CLOCK_IN_DATE_MISMATCH';
  end if;
  if v_clock_out is not null
    and public.company_attendance_date(v_clock_out) <> p_attendance_date then
    raise exception using errcode = 'P0001', message = 'CLOCK_OUT_DATE_MISMATCH';
  end if;
  if v_clock_out is not null and v_clock_out <= v_clock_in then
    raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
  end if;

  perform 1
  from public.employees
  where id = p_employee_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;

  v_status := case when v_clock_out is null then 'clocked_in' else 'completed' end;

  insert into public.attendance_records (
    employee_id,
    attendance_date,
    clock_in_at,
    clock_out_at,
    status,
    is_corrected,
    last_corrected_at,
    last_corrected_by,
    last_correction_reason,
    created_by,
    updated_at
  ) values (
    p_employee_id,
    p_attendance_date,
    v_clock_in,
    v_clock_out,
    v_status,
    true,
    v_now,
    v_actor,
    v_reason,
    v_actor,
    v_now
  )
  returning id into v_record_id;

  perform public.write_employee_audit(
    p_employee_id,
    'attendance.created_by_hr',
    'attendance',
    v_record_id,
    jsonb_build_array(
      'attendance_date',
      'clock_in_at',
      'clock_out_at',
      'status',
      'is_corrected'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', p_attendance_date,
      'clock_in_at', v_clock_in,
      'clock_out_at', v_clock_out,
      'status', v_status,
      'is_corrected', true
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  perform public.calculate_attendance_day_internal(
    p_employee_id, p_attendance_date, 'hr_create', v_actor, null, false
  );

  return v_record_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS';
end;
$$;

revoke all on function public.hr_create_attendance(
  uuid,
  date,
  timestamp without time zone,
  timestamp without time zone,
  text
) from public, anon;
grant execute on function public.hr_create_attendance(
  uuid,
  date,
  timestamp without time zone,
  timestamp without time zone,
  text
) to authenticated;

create or replace function public.hr_correct_attendance(
  p_attendance_id uuid,
  p_attendance_date date,
  p_clock_in_local timestamp,
  p_clock_out_local timestamp default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_reason text;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_status text;
  v_record public.attendance_records%rowtype;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  v_reason := public.normalize_attendance_private_text(p_reason, true);
  v_clock_in := p_clock_in_local at time zone 'Asia/Manila';
  v_clock_out := case
    when p_clock_out_local is null then null
    else p_clock_out_local at time zone 'Asia/Manila'
  end;

  if p_attendance_date is null or p_clock_in_local is null then
    raise exception using errcode = 'P0001', message = 'INVALID_ATTENDANCE_INPUT';
  end if;
  if p_attendance_date > public.company_attendance_date(v_now) then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if public.company_attendance_date(v_clock_in) <> p_attendance_date then
    raise exception using errcode = 'P0001', message = 'CLOCK_IN_DATE_MISMATCH';
  end if;
  if v_clock_out is not null
    and public.company_attendance_date(v_clock_out) <> p_attendance_date then
    raise exception using errcode = 'P0001', message = 'CLOCK_OUT_DATE_MISMATCH';
  end if;
  if v_clock_out is not null and v_clock_out <= v_clock_in then
    raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
  end if;

  select * into v_record
  from public.attendance_records
  where id = p_attendance_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.attendance_records
    where employee_id = v_record.employee_id
      and attendance_date = p_attendance_date
      and id <> v_record.id
  ) then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS';
  end if;

  v_status := case when v_clock_out is null then 'clocked_in' else 'completed' end;

  update public.attendance_records
  set attendance_date = p_attendance_date,
      clock_in_at = v_clock_in,
      clock_out_at = v_clock_out,
      status = v_status,
      is_corrected = true,
      last_corrected_at = v_now,
      last_corrected_by = v_actor,
      last_correction_reason = v_reason,
      updated_at = v_now
  where id = v_record.id;

  perform public.write_employee_audit(
    v_record.employee_id,
    'attendance.corrected',
    'attendance',
    v_record.id,
    jsonb_build_array(
      'attendance_date',
      'clock_in_at',
      'clock_out_at',
      'status',
      'is_corrected'
    ),
    jsonb_build_object(
      'attendance_date', v_record.attendance_date,
      'clock_in_at', v_record.clock_in_at,
      'clock_out_at', v_record.clock_out_at,
      'status', v_record.status,
      'is_corrected', v_record.is_corrected
    ),
    jsonb_build_object(
      'attendance_date', p_attendance_date,
      'clock_in_at', v_clock_in,
      'clock_out_at', v_clock_out,
      'status', v_status,
      'is_corrected', true
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );
  if v_record.attendance_date <> p_attendance_date then
    perform public.calculate_attendance_day_internal(
      v_record.employee_id, v_record.attendance_date,
      'hr_correction', v_actor, null, true
    );
  end if;

  perform public.calculate_attendance_day_internal(
    v_record.employee_id, p_attendance_date,
    'hr_correction', v_actor, null, false
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS';
end;
$$;

revoke all on function public.hr_correct_attendance(
  uuid,
  date,
  timestamp without time zone,
  timestamp without time zone,
  text
) from public, anon;
grant execute on function public.hr_correct_attendance(
  uuid,
  date,
  timestamp without time zone,
  timestamp without time zone,
  text
) to authenticated;

create or replace function public.review_attendance_correction_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.attendance_correction_requests%rowtype;
  v_record public.attendance_records%rowtype;
  v_record_exists boolean := false;
  v_note text := public.normalize_attendance_private_text(p_review_note, false);
  v_record_id uuid;
  v_new_clock_in timestamptz;
  v_new_clock_out timestamptz;
  v_new_status text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'INVALID_DECISION';
  end if;

  select * into v_request
  from public.attendance_correction_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_PENDING';
  end if;
  if v_request.requested_by = v_actor then
    raise exception using errcode = 'P0001', message = 'SELF_REVIEW_NOT_ALLOWED';
  end if;

  if p_decision = 'reject' then
    update public.attendance_correction_requests
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = now(),
        review_note = v_note, updated_at = now()
    where id = v_request.id;

    perform public.write_employee_audit(
      v_request.employee_id,
      'attendance_correction.rejected',
      'attendance_correction',
      v_request.id,
      jsonb_build_array('request_status'),
      jsonb_build_object('request_status', 'pending'),
      jsonb_build_object('request_status', 'rejected'),
      jsonb_build_object('attendance_date', v_request.attendance_date),
      'application',
      v_actor
    );
    return;
  end if;

  select * into v_record
  from public.attendance_records
  where employee_id = v_request.employee_id
    and attendance_date = v_request.attendance_date
  for update;
  v_record_exists := found;

  if v_record_exists and v_record.updated_at > v_request.created_at then
    raise exception using errcode = 'P0001', message = 'REQUEST_STATE_CHANGED';
  end if;

  if v_request.request_type = 'add_missing_clock_out'
    and (not v_record_exists or v_record.clock_out_at is not null) then
    raise exception using errcode = 'P0001', message = 'REQUEST_STATE_CHANGED';
  end if;

  if v_request.request_type = 'change_clock_out'
    and (not v_record_exists or v_record.clock_out_at is null) then
    raise exception using errcode = 'P0001', message = 'REQUEST_STATE_CHANGED';
  end if;

  if v_request.request_type = 'change_clock_in' and not v_record_exists then
    raise exception using errcode = 'P0001', message = 'REQUEST_STATE_CHANGED';
  end if;

  if v_request.request_type = 'add_missing_clock_in' then
    if v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS'; end if;
    v_new_clock_in := v_request.requested_clock_in_at;
    v_new_clock_out := v_request.requested_clock_out_at;
    v_new_status := case when v_new_clock_out is null then 'clocked_in' else 'completed' end;

    insert into public.attendance_records (
      employee_id, attendance_date, clock_in_at, clock_out_at, status,
      is_corrected, last_corrected_at, last_corrected_by,
      last_correction_reason, created_by
    ) values (
      v_request.employee_id, v_request.attendance_date,
      v_new_clock_in, v_new_clock_out, v_new_status,
      true, now(), v_actor, v_request.reason, v_actor
    ) returning id into v_record_id;
  else
    if not v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_REQUIRED'; end if;
    v_new_clock_in := case
      when v_request.request_type = 'change_clock_in' then v_request.requested_clock_in_at
      else v_record.clock_in_at
    end;
    v_new_clock_out := case
      when v_request.request_type in ('add_missing_clock_out', 'change_clock_out')
        then v_request.requested_clock_out_at
      else v_record.clock_out_at
    end;
    if v_new_clock_out is not null and v_new_clock_out <= v_new_clock_in then
      raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
    end if;
    v_new_status := case when v_new_clock_out is null then 'clocked_in' else 'completed' end;
    v_record_id := v_record.id;

    update public.attendance_records
    set clock_in_at = v_new_clock_in,
        clock_out_at = v_new_clock_out,
        status = v_new_status,
        is_corrected = true,
        last_corrected_at = now(),
        last_corrected_by = v_actor,
        last_correction_reason = v_request.reason,
        updated_at = now()
    where id = v_record.id;
  end if;

  update public.attendance_correction_requests
  set status = 'approved', reviewed_by = v_actor, reviewed_at = now(),
      review_note = v_note, attendance_record_id = v_record_id, updated_at = now()
  where id = v_request.id;

  perform public.write_employee_audit(
    v_request.employee_id,
    'attendance.corrected',
    'attendance',
    v_record_id,
    jsonb_build_array('clock_in_at', 'clock_out_at', 'status', 'is_corrected'),
    case
      when v_record_exists then jsonb_build_object(
        'clock_in_at', v_record.clock_in_at,
        'clock_out_at', v_record.clock_out_at,
        'status', v_record.status,
        'is_corrected', v_record.is_corrected
      )
      else jsonb_build_object(
        'clock_in_at', null,
        'clock_out_at', null,
        'status', null,
        'is_corrected', false
      )
    end,
    jsonb_build_object(
      'clock_in_at', v_new_clock_in,
      'clock_out_at', v_new_clock_out,
      'status', v_new_status,
      'is_corrected', true
    ),
    jsonb_build_object('attendance_date', v_request.attendance_date),
    'application',
    v_actor
  );

  perform public.write_employee_audit(
    v_request.employee_id,
    'attendance_correction.approved',
    'attendance_correction',
    v_request.id,
    jsonb_build_array('request_status'),
    jsonb_build_object('request_status', 'pending'),
    jsonb_build_object('request_status', 'approved'),
    jsonb_build_object('attendance_date', v_request.attendance_date),
    'application',
    v_actor
  );
  perform public.calculate_attendance_day_internal(
    v_request.employee_id, v_request.attendance_date,
    'correction_approval', v_actor, null, false
  );
end;
$$;

revoke all on function public.review_attendance_correction_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_attendance_correction_request(uuid, text, text)
  to authenticated;


create or replace function public.get_my_attendance_calculations(
  p_from_date date default null,
  p_to_date date default null
)
returns table(
  employee_id uuid,
  attendance_date date,
  revision_id uuid,
  calculation_group_id uuid,
  revision_number integer,
  attendance_record_id uuid,
  schedule_assignment_id uuid,
  schedule_version_id uuid,
  policy_version_id uuid,
  base_status text,
  is_provisional boolean,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  scheduled_minutes integer,
  actual_clock_in_at timestamptz,
  actual_clock_out_at timestamptz,
  worked_minutes integer,
  late_minutes integer,
  undertime_minutes integer,
  is_late boolean,
  is_undertime boolean,
  is_corrected boolean,
  is_recalculated boolean,
  calculation_source text,
  calculated_at timestamptz,
  schedule_code text,
  schedule_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  return query
  select
    employee.id,
    group_row.attendance_date,
    revision.id,
    group_row.id,
    revision.revision_number,
    revision.attendance_record_id,
    revision.schedule_assignment_id,
    revision.schedule_version_id,
    revision.policy_version_id,
    revision.base_status,
    revision.is_provisional,
    revision.scheduled_start_at,
    revision.scheduled_end_at,
    revision.scheduled_minutes,
    revision.actual_clock_in_at,
    revision.actual_clock_out_at,
    revision.worked_minutes,
    revision.late_minutes,
    revision.undertime_minutes,
    revision.is_late,
    revision.is_undertime,
    revision.is_corrected,
    revision.is_recalculated,
    revision.calculation_source,
    revision.calculated_at,
    template.code,
    template.name
  from public.employees as employee
  join public.attendance_calculation_groups as group_row
    on group_row.employee_id = employee.id
  join public.attendance_calculation_revisions as revision
    on revision.id = group_row.active_revision_id
  left join public.work_schedule_versions as version
    on version.id = revision.schedule_version_id
  left join public.work_schedule_templates as template
    on template.id = version.schedule_template_id
  where employee.profile_id = auth.uid()
    and (p_from_date is null or group_row.attendance_date >= p_from_date)
    and (p_to_date is null or group_row.attendance_date <= p_to_date)
  order by group_row.attendance_date desc, revision.id desc;
end;
$$;

revoke all on function public.get_my_attendance_calculations(date, date)
  from public, anon;
grant execute on function public.get_my_attendance_calculations(date, date)
  to authenticated;


create or replace function public.recalculate_attendance_range(
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_employee_ids uuid[];
  v_employee_id uuid;
  v_date date;
  v_revision_id uuid;
  v_employees integer := 0;
  v_dates integer := 0;
  v_revisions integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
  v_input_count integer;
  v_distinct_count integer;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = 'P0001', message = 'RECALCULATION_DATE_RANGE_INVALID';
  end if;
  if p_end_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'RECALCULATION_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  if p_employee_ids is null then
    select array_agg(employee.id order by employee.id)
      into v_employee_ids
    from public.employees as employee
    where employee.archived_at is null
      and employee.employment_status in ('active', 'probation', 'on_leave');
  else
    select count(*), count(distinct value)
      into v_input_count, v_distinct_count
    from unnest(p_employee_ids) as value;
    if v_input_count = 0 or v_input_count <> v_distinct_count then
      raise exception using errcode = 'P0001', message = 'RECALCULATION_EMPLOYEE_INPUT_INVALID';
    end if;

    select array_agg(employee.id order by employee.id)
      into v_employee_ids
    from public.employees as employee
    where employee.id = any(p_employee_ids)
      and employee.archived_at is null
      and employee.employment_status in ('active', 'probation', 'on_leave');

    if coalesce(cardinality(v_employee_ids), 0) <> cardinality(p_employee_ids) then
      raise exception using errcode = 'P0001', message = 'RECALCULATION_EMPLOYEE_INPUT_INVALID';
    end if;
  end if;

  v_employees := coalesce(cardinality(v_employee_ids), 0);
  if v_employees = 0 then
    return jsonb_build_object(
      'employees', 0, 'dates_evaluated', 0,
      'revisions_created', 0, 'skipped_dates', 0, 'errors', 0
    );
  end if;

  foreach v_employee_id in array v_employee_ids loop
    v_date := p_start_date;
    while v_date <= p_end_date loop
      v_dates := v_dates + 1;
      begin
        v_revision_id := public.calculate_attendance_day_internal(
          v_employee_id,
          v_date,
          'manual_recalculation',
          v_actor,
          v_reason,
          v_date < public.company_attendance_date(now())
        );
        if v_revision_id is null then
          v_skipped := v_skipped + 1;
        else
          v_revisions := v_revisions + 1;
        end if;
      exception when others then
        v_errors := v_errors + 1;
      end;
      v_date := v_date + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'employees', v_employees,
    'dates_evaluated', v_dates,
    'revisions_created', v_revisions,
    'skipped_dates', v_skipped,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.recalculate_attendance_range(uuid[], date, date, text)
  from public, anon;
grant execute on function public.recalculate_attendance_range(uuid[], date, date, text)
  to authenticated;


create or replace function public.finalize_attendance_date(
  p_target_date date,
  p_run_source text,
  p_manual_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_company_date date := public.company_attendance_date(now());
  v_reason text := nullif(btrim(coalesce(p_manual_reason, '')), '');
  v_run_id uuid;
  v_employee record;
  v_revision_id uuid;
  v_active_revision public.attendance_calculation_revisions%rowtype;
  v_created_revision public.attendance_calculation_revisions%rowtype;
  v_processed integer := 0;
  v_absences integer := 0;
  v_missing integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
  v_status text;
  v_source text;
begin
  if p_target_date is null or p_target_date >= v_company_date then
    raise exception using errcode = 'P0001', message = 'FINALIZATION_DATE_INVALID';
  end if;
  if p_run_source = 'manual' then
    if v_actor is null or not public.is_hr_admin() then
      raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
    end if;
    if v_reason is null then
      raise exception using errcode = 'P0001', message = 'FINALIZATION_REASON_REQUIRED';
    end if;
    if char_length(v_reason) > 1000 then
      raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
    end if;
    v_source := 'manual_finalization';
  elsif p_run_source = 'scheduled_job' then
    if v_actor is not null or p_target_date <> v_company_date - 1 then
      raise exception using errcode = 'P0001', message = 'UNAUTHORIZED_SCHEDULED_FINALIZATION';
    end if;
    v_source := 'daily_finalization';
  else
    raise exception using errcode = 'P0001', message = 'FINALIZATION_SOURCE_INVALID';
  end if;

  begin
    insert into public.attendance_finalization_runs (
      target_date, run_source, status, started_by, manual_reason
    ) values (
      p_target_date, p_run_source, 'running', v_actor, v_reason
    ) returning id into v_run_id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'FINALIZATION_ALREADY_RUNNING';
  end;

  perform public.write_employee_audit(
    null,
    'attendance_finalization.started',
    'attendance_finalization',
    v_run_id,
    jsonb_build_array('target_date', 'status'),
    '{}'::jsonb,
    jsonb_build_object('target_date', p_target_date, 'status', 'running'),
    jsonb_build_object('run_source', p_run_source),
    'application',
    v_actor
  );

  begin
    for v_employee in
      select employee.id
      from public.employees as employee
      where employee.archived_at is null
        and employee.employment_status in ('active', 'probation', 'on_leave')
      order by employee.id
    loop
      v_processed := v_processed + 1;
      begin
        select revision.* into v_active_revision
        from public.attendance_calculation_groups as group_row
        join public.attendance_calculation_revisions as revision
          on revision.id = group_row.active_revision_id
        where group_row.employee_id = v_employee.id
          and group_row.attendance_date = p_target_date;

        if found and not v_active_revision.is_provisional then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        v_revision_id := public.calculate_attendance_day_internal(
          v_employee.id,
          p_target_date,
          v_source,
          v_actor,
          case when p_run_source = 'manual' then v_reason else null end,
          true
        );

        if v_revision_id is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;

        select * into v_created_revision
        from public.attendance_calculation_revisions
        where id = v_revision_id;

        if v_created_revision.base_status = 'absent' then
          v_absences := v_absences + 1;
        elsif v_created_revision.base_status = 'missing_clock_out' then
          v_missing := v_missing + 1;
        end if;
      exception when others then
        v_errors := v_errors + 1;
      end;
    end loop;

    v_status := case when v_errors > 0 then 'completed_with_errors' else 'completed' end;
    update public.attendance_finalization_runs
    set status = v_status,
        completed_at = now(),
        employees_processed = v_processed,
        absences_created = v_absences,
        missing_clock_outs_finalized = v_missing,
        unchanged_results_skipped = v_skipped,
        error_count = v_errors
    where id = v_run_id;

    perform public.write_employee_audit(
      null,
      'attendance_finalization.completed',
      'attendance_finalization',
      v_run_id,
      jsonb_build_array('status', 'employees_processed'),
      jsonb_build_object('status', 'running'),
      jsonb_build_object(
        'status', v_status,
        'employees_processed', v_processed,
        'absences_created', v_absences,
        'missing_clock_outs_finalized', v_missing,
        'unchanged_results_skipped', v_skipped,
        'error_count', v_errors
      ),
      jsonb_build_object('target_date', p_target_date, 'run_source', p_run_source),
      'application',
      v_actor
    );
  exception when others then
    update public.attendance_finalization_runs
    set status = 'failed', completed_at = now(), error_count = greatest(v_errors, 1)
    where id = v_run_id;

    perform public.write_employee_audit(
      null,
      'attendance_finalization.failed',
      'attendance_finalization',
      v_run_id,
      jsonb_build_array('status'),
      jsonb_build_object('status', 'running'),
      jsonb_build_object('status', 'failed'),
      jsonb_build_object('target_date', p_target_date, 'run_source', p_run_source),
      'application',
      v_actor
    );
  end;

  return v_run_id;
end;
$$;

revoke all on function public.finalize_attendance_date(date, text, text)
  from public, anon;
grant execute on function public.finalize_attendance_date(date, text, text)
  to authenticated;

-- The job command is stored now and calls the protected function after this
-- migration finishes creating it later in the file.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'finalize-attendance-daily';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'finalize-attendance-daily',
    '5 16 * * *',
    $cron$
      select public.finalize_attendance_date(
        ((now() at time zone 'Asia/Manila')::date - 1),
        'scheduled_job',
        null
      );
    $cron$
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
