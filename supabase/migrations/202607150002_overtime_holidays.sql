begin;

create table if not exists public.overtime_policy_versions (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null,
  minimum_qualifying_minutes integer not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint overtime_policy_effective_unique unique (effective_date),
  constraint overtime_policy_minimum_check
    check (minimum_qualifying_minutes between 1 and 480),
  constraint overtime_policy_reason_length_check
    check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.holiday_calendar_groups (
  id uuid primary key default gen_random_uuid(),
  active_version_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holiday_calendar_versions (
  id uuid primary key default gen_random_uuid(),
  holiday_group_id uuid not null
    references public.holiday_calendar_groups(id) on delete restrict,
  revision_number integer not null,
  holiday_date date not null,
  holiday_name text not null,
  holiday_type text not null,
  is_active boolean not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint holiday_version_revision_unique
    unique (holiday_group_id, revision_number),
  constraint holiday_name_required_check
    check (char_length(btrim(holiday_name)) between 1 and 160),
  constraint holiday_type_check
    check (holiday_type in (
      'regular_holiday',
      'special_non_working_holiday',
      'company_holiday'
    )),
  constraint holiday_reason_length_check
    check (change_reason is null or char_length(change_reason) <= 1000)
);

alter table public.holiday_calendar_groups
  add constraint holiday_calendar_groups_active_version_fkey
  foreign key (active_version_id)
  references public.holiday_calendar_versions(id)
  on delete restrict
  deferrable initially deferred;

alter table public.attendance_calculation_revisions
  add column if not exists holiday_version_id uuid
    references public.holiday_calendar_versions(id) on delete restrict,
  add column if not exists holiday_name text,
  add column if not exists holiday_type text,
  add column if not exists is_holiday boolean not null default false;

alter table public.attendance_calculation_revisions
  drop constraint if exists calculation_revision_status_check;
alter table public.attendance_calculation_revisions
  add constraint calculation_revision_status_check
  check (base_status in (
    'present',
    'absent',
    'holiday',
    'missing_clock_out',
    'rest_day_worked',
    'unscheduled_attendance'
  ));

alter table public.attendance_calculation_revisions
  add constraint calculation_revision_holiday_type_check
  check (holiday_type is null or holiday_type in (
      'regular_holiday',
      'special_non_working_holiday',
      'company_holiday'
    )
  );

alter table public.attendance_calculation_revisions
  add constraint calculation_revision_holiday_snapshot_check
  check (
    (
      is_holiday
      and holiday_version_id is not null
      and char_length(btrim(holiday_name)) >= 1
      and holiday_type is not null
    )
    or (
      not is_holiday
      and holiday_version_id is null
      and holiday_name is null
      and holiday_type is null
    )
  );

alter table public.attendance_calculation_revisions
  drop constraint if exists calculation_rest_unscheduled_check;
alter table public.attendance_calculation_revisions
  add constraint calculation_rest_unscheduled_check
  check (
    base_status not in ('holiday', 'rest_day_worked', 'unscheduled_attendance')
    or (late_minutes is null and undertime_minutes is null)
  );

create table if not exists public.overtime_detection_groups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  attendance_date date not null,
  segment_type text not null,
  active_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overtime_detection_group_identity_unique
    unique (employee_id, attendance_date, segment_type),
  constraint overtime_detection_group_segment_check
    check (segment_type in (
      'pre_shift', 'post_shift', 'rest_day', 'holiday_work'
    ))
);

create table if not exists public.overtime_detection_revisions (
  id uuid primary key default gen_random_uuid(),
  detection_group_id uuid not null
    references public.overtime_detection_groups(id) on delete restrict,
  revision_number integer not null,
  attendance_calculation_revision_id uuid not null
    references public.attendance_calculation_revisions(id) on delete restrict,
  attendance_record_id uuid
    references public.attendance_records(id) on delete restrict,
  schedule_assignment_id uuid
    references public.employee_schedule_assignments(id) on delete restrict,
  schedule_version_id uuid
    references public.work_schedule_versions(id) on delete restrict,
  overtime_policy_version_id uuid
    references public.overtime_policy_versions(id) on delete restrict,
  holiday_version_id uuid
    references public.holiday_calendar_versions(id) on delete restrict,
  segment_type text not null,
  detected_start_at timestamptz,
  detected_end_at timestamptz,
  detected_minutes integer not null,
  meets_threshold boolean not null,
  is_active boolean not null,
  calculation_source text not null,
  calculated_by uuid references public.profiles(id) on delete set null,
  calculated_at timestamptz not null default now(),
  recalculation_reason text,
  constraint overtime_detection_revision_number_unique
    unique (detection_group_id, revision_number),
  constraint overtime_detection_revision_segment_check
    check (segment_type in (
      'pre_shift', 'post_shift', 'rest_day', 'holiday_work'
    )),
  constraint overtime_detection_minutes_check
    check (detected_minutes >= 0),
  constraint overtime_detection_time_order_check
    check (
      detected_start_at is null
      or detected_end_at is null
      or detected_end_at >= detected_start_at
    ),
  constraint overtime_detection_reason_length_check
    check (
      recalculation_reason is null
      or char_length(recalculation_reason) <= 1000
    ),
  constraint overtime_detection_source_check
    check (calculation_source in (
      'clock_in',
      'clock_out',
      'hr_create',
      'hr_correction',
      'correction_approval',
      'daily_finalization',
      'manual_recalculation',
      'manual_finalization',
      'overtime_recalculation'
    ))
);

alter table public.overtime_detection_groups
  add constraint overtime_detection_groups_active_revision_fkey
  foreign key (active_revision_id)
  references public.overtime_detection_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.overtime_approval_items (
  id uuid primary key default gen_random_uuid(),
  detection_revision_id uuid not null
    references public.overtime_detection_revisions(id) on delete restrict,
  status text not null,
  detected_minutes integer not null,
  approved_minutes integer not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  approval_note text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_item_id uuid,
  constraint overtime_approval_detection_unique unique (detection_revision_id),
  constraint overtime_approval_status_check
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  constraint overtime_approval_minutes_nonnegative_check
    check (detected_minutes >= 0 and approved_minutes >= 0),
  constraint overtime_approval_note_length_check
    check (approval_note is null or char_length(approval_note) <= 1000),
  constraint overtime_rejection_reason_length_check
    check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  constraint overtime_approval_decision_check
    check (
      (status = 'pending' and approved_minutes = 0
        and reviewed_by is null and reviewed_at is null
        and approval_note is null and rejection_reason is null)
      or (status = 'approved' and approved_minutes = detected_minutes
        and reviewed_by is not null and reviewed_at is not null
        and rejection_reason is null)
      or (status = 'rejected' and approved_minutes = 0
        and reviewed_by is not null and reviewed_at is not null
        and char_length(btrim(rejection_reason)) >= 1
        and approval_note is null)
      or (status = 'superseded' and superseded_at is not null)
    ),
  constraint overtime_approval_supersession_check
    check (
      (status <> 'superseded'
        and superseded_at is null
        and superseded_by_item_id is null)
      or status = 'superseded'
    )
);

alter table public.overtime_approval_items
  add constraint overtime_approval_items_superseded_by_fkey
  foreign key (superseded_by_item_id)
  references public.overtime_approval_items(id)
  on delete restrict
  deferrable initially deferred;

create index if not exists overtime_policy_effective_idx
  on public.overtime_policy_versions(effective_date desc, id desc);
create index if not exists holiday_versions_group_revision_idx
  on public.holiday_calendar_versions(holiday_group_id, revision_number desc);
create index if not exists holiday_versions_date_idx
  on public.holiday_calendar_versions(holiday_date, created_at desc);
create index if not exists overtime_detection_employee_date_idx
  on public.overtime_detection_groups(employee_id, attendance_date desc);
create index if not exists overtime_detection_revision_group_idx
  on public.overtime_detection_revisions(detection_group_id, revision_number desc);
create index if not exists overtime_detection_revision_attendance_idx
  on public.overtime_detection_revisions(attendance_calculation_revision_id);
create index if not exists overtime_approval_status_created_idx
  on public.overtime_approval_items(status, created_at, id);

alter table public.overtime_policy_versions enable row level security;
alter table public.holiday_calendar_groups enable row level security;
alter table public.holiday_calendar_versions enable row level security;
alter table public.overtime_detection_groups enable row level security;
alter table public.overtime_detection_revisions enable row level security;
alter table public.overtime_approval_items enable row level security;

create policy "HR views overtime policy versions"
on public.overtime_policy_versions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views holiday calendar groups"
on public.holiday_calendar_groups
for select to authenticated
using (public.is_hr_admin());

create policy "HR views holiday calendar versions"
on public.holiday_calendar_versions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views overtime detection groups"
on public.overtime_detection_groups
for select to authenticated
using (public.is_hr_admin());

create policy "HR views overtime detection revisions"
on public.overtime_detection_revisions
for select to authenticated
using (public.is_hr_admin());

create policy "HR views overtime approval items"
on public.overtime_approval_items
for select to authenticated
using (public.is_hr_admin());

-- No INSERT, UPDATE, or DELETE policies are created for Phase 5B-2B tables.
-- Protected security-definer functions own every lifecycle mutation.
-- Revoke table-level DML as defense in depth; authenticated clients use RPCs.
revoke insert, update, delete on table
  public.overtime_policy_versions,
  public.holiday_calendar_groups,
  public.holiday_calendar_versions,
  public.overtime_detection_groups,
  public.overtime_detection_revisions,
  public.overtime_approval_items
from anon, authenticated;

create or replace function public.resolve_overtime_policy(
  p_attendance_date date
)
returns table(
  overtime_policy_version_id uuid,
  minimum_qualifying_minutes integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select policy.id, policy.minimum_qualifying_minutes
  from public.overtime_policy_versions as policy
  where policy.effective_date <= p_attendance_date
  order by policy.effective_date desc, policy.id desc
  limit 1;

  if not found then
    return query select null::uuid, 30::integer;
  end if;
end;
$$;

revoke all on function public.resolve_overtime_policy(date)
  from public, anon, authenticated;

create or replace function public.create_overtime_policy_version(
  p_effective_date date,
  p_minimum_qualifying_minutes integer,
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
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_DATE_REQUIRED';
  end if;
  if p_minimum_qualifying_minutes is null
    or p_minimum_qualifying_minutes < 1
    or p_minimum_qualifying_minutes > 480 then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_MINIMUM_OUT_OF_RANGE';
  end if;
  if p_effective_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_REASON_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  insert into public.overtime_policy_versions (
    effective_date,
    minimum_qualifying_minutes,
    created_by,
    change_reason
  ) values (
    p_effective_date,
    p_minimum_qualifying_minutes,
    v_actor,
    v_reason
  )
  returning id into v_policy_id;

  perform public.write_employee_audit(
    null,
    'overtime_policy.created',
    'overtime_policy',
    v_policy_id,
    jsonb_build_array('effective_date', 'minimum_qualifying_minutes'),
    '{}'::jsonb,
    jsonb_build_object(
      'effective_date', p_effective_date,
      'minimum_qualifying_minutes', p_minimum_qualifying_minutes,
      'policy_version_id', v_policy_id
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_policy_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'OVERTIME_POLICY_EFFECTIVE_DATE_EXISTS';
end;
$$;

revoke all on function public.create_overtime_policy_version(date, integer, text)
  from public, anon;
grant execute on function public.create_overtime_policy_version(date, integer, text)
  to authenticated;

create or replace function public.resolve_active_holiday(
  p_holiday_date date
)
returns table(
  holiday_version_id uuid,
  holiday_name text,
  holiday_type text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select version.id, version.holiday_name, version.holiday_type
  from public.holiday_calendar_groups as group_row
  join public.holiday_calendar_versions as version
    on group_row.active_version_id = version.id
   and version.holiday_group_id = group_row.id
  where version.holiday_date = p_holiday_date
    and version.is_active
  order by version.created_at desc, version.id desc
  limit 1;
$$;

revoke all on function public.resolve_active_holiday(date)
  from public, anon, authenticated;

create or replace function public.create_holiday(
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_holiday_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_group_id uuid;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_holiday_date is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_REQUIRED';
  end if;
  if v_name is null or char_length(v_name) > 160 then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_NAME_INVALID';
  end if;
  if p_holiday_type not in (
    'regular_holiday',
    'special_non_working_holiday',
    'company_holiday'
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_TYPE_INVALID';
  end if;
  if p_holiday_date <= public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_REASON_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  lock table public.holiday_calendar_groups in share row exclusive mode;

  if exists (
    select 1
    from public.holiday_calendar_groups as group_row
    join public.holiday_calendar_versions as version
      on version.id = group_row.active_version_id
    where version.holiday_date = p_holiday_date
      and version.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_EXISTS';
  end if;

  insert into public.holiday_calendar_groups (
    created_by
  ) values (
    v_actor
  ) returning id into v_group_id;

  insert into public.holiday_calendar_versions (
    holiday_group_id,
    revision_number,
    holiday_date,
    holiday_name,
    holiday_type,
    is_active,
    created_by,
    change_reason
  ) values (
    v_group_id,
    1,
    p_holiday_date,
    v_name,
    p_holiday_type,
    true,
    v_actor,
    v_reason
  ) returning id into v_version_id;

  update public.holiday_calendar_groups
  set active_version_id = v_version_id,
      updated_at = now()
  where id = v_group_id;

  perform public.write_employee_audit(
    null,
    'holiday.created',
    'holiday_calendar',
    v_group_id,
    jsonb_build_array(
      'holiday_date', 'holiday_name', 'holiday_type', 'revision_number'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'holiday_group_id', v_group_id,
      'holiday_version_id', v_version_id,
      'holiday_date', p_holiday_date,
      'holiday_name', v_name,
      'holiday_type', p_holiday_type,
      'revision_number', 1,
      'is_active', true
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_group_id;
end;
$$;

revoke all on function public.create_holiday(date, text, text, text)
  from public, anon;
grant execute on function public.create_holiday(date, text, text, text)
  to authenticated;

create or replace function public.replace_holiday_version(
  p_holiday_group_id uuid,
  p_expected_active_version_id uuid,
  p_holiday_date date,
  p_holiday_name text,
  p_holiday_type text,
  p_is_active boolean,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_holiday_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
  v_group public.holiday_calendar_groups%rowtype;
  v_active public.holiday_calendar_versions%rowtype;
  v_version_id uuid;
  v_revision_number integer;
  v_action text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_holiday_group_id is null or p_expected_active_version_id is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_INPUT_INVALID';
  end if;
  if p_holiday_date is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_REQUIRED';
  end if;
  if v_name is null or char_length(v_name) > 160 then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_NAME_INVALID';
  end if;
  if p_holiday_type not in (
    'regular_holiday',
    'special_non_working_holiday',
    'company_holiday'
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_TYPE_INVALID';
  end if;
  if p_holiday_date <= public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  lock table public.holiday_calendar_groups in share row exclusive mode;

  select * into v_group
  from public.holiday_calendar_groups
  where id = p_holiday_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_NOT_FOUND';
  end if;
  if v_group.active_version_id is distinct from p_expected_active_version_id then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_VERSION_STALE';
  end if;

  select * into v_active
  from public.holiday_calendar_versions
  where id = v_group.active_version_id
    and holiday_group_id = v_group.id;

  if not found then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_VERSION_STALE';
  end if;

  if p_is_active and exists (
    select 1
    from public.holiday_calendar_groups as other_group
    join public.holiday_calendar_versions as version
      on version.id = other_group.active_version_id
    where other_group.id <> v_group.id
      and version.holiday_date = p_holiday_date
      and version.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'HOLIDAY_DATE_EXISTS';
  end if;

  v_revision_number := v_active.revision_number + 1;

  insert into public.holiday_calendar_versions (
    holiday_group_id,
    revision_number,
    holiday_date,
    holiday_name,
    holiday_type,
    is_active,
    created_by,
    change_reason
  ) values (
    v_group.id,
    v_revision_number,
    p_holiday_date,
    v_name,
    p_holiday_type,
    p_is_active,
    v_actor,
    v_reason
  ) returning id into v_version_id;

  update public.holiday_calendar_groups
  set active_version_id = v_version_id,
      updated_at = now()
  where id = v_group.id;

  v_action := case when p_is_active
    then 'holiday.replaced'
    else 'holiday.deactivated'
  end;

  perform public.write_employee_audit(
    null,
    v_action,
    'holiday_calendar',
    v_group.id,
    jsonb_build_array(
      'holiday_date', 'holiday_name', 'holiday_type',
      'revision_number', 'is_active'
    ),
    jsonb_build_object(
      'holiday_version_id', v_active.id,
      'holiday_date', v_active.holiday_date,
      'holiday_name', v_active.holiday_name,
      'holiday_type', v_active.holiday_type,
      'revision_number', v_active.revision_number,
      'is_active', v_active.is_active
    ),
    jsonb_build_object(
      'holiday_version_id', v_version_id,
      'holiday_date', p_holiday_date,
      'holiday_name', v_name,
      'holiday_type', p_holiday_type,
      'revision_number', v_revision_number,
      'is_active', p_is_active
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_version_id;
end;
$$;

revoke all on function public.replace_holiday_version(
  uuid, uuid, date, text, text, boolean, text
) from public, anon;
grant execute on function public.replace_holiday_version(
  uuid, uuid, date, text, text, boolean, text
) to authenticated;

create or replace function public.validate_active_overtime_detection_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active_revision_id is not null and not exists (
    select 1
    from public.overtime_detection_revisions as revision
    where revision.id = new.active_revision_id
      and revision.detection_group_id = new.id
      and revision.segment_type = new.segment_type
  ) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ACTIVE_REVISION_GROUP_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_active_overtime_detection_revision()
  from public, anon, authenticated;

drop trigger if exists validate_active_overtime_detection_revision_trigger
  on public.overtime_detection_groups;
create constraint trigger validate_active_overtime_detection_revision_trigger
after insert or update of active_revision_id
on public.overtime_detection_groups
deferrable initially deferred
for each row execute function public.validate_active_overtime_detection_revision();

create or replace function public.write_overtime_detection_revision(
  p_employee_id uuid,
  p_attendance_date date,
  p_segment_type text,
  p_attendance_calculation_revision_id uuid,
  p_attendance_record_id uuid,
  p_schedule_assignment_id uuid,
  p_schedule_version_id uuid,
  p_overtime_policy_version_id uuid,
  p_holiday_version_id uuid,
  p_detected_start_at timestamptz,
  p_detected_end_at timestamptz,
  p_detected_minutes integer,
  p_meets_threshold boolean,
  p_calculation_source text,
  p_calculated_by uuid,
  p_recalculation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_recalculation_reason, '')), '');
  v_group_id uuid;
  v_current public.overtime_detection_revisions%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
  v_new_item_id uuid;
  v_old_item public.overtime_approval_items%rowtype;
  v_item_created boolean := false;
  v_item_superseded boolean := false;
  v_action text;
begin
  if p_segment_type not in (
    'pre_shift', 'post_shift', 'rest_day', 'holiday_work'
  ) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_SEGMENT_INVALID';
  end if;
  if p_detected_minutes is null or p_detected_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'OVERTIME_MINUTES_INVALID';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  select id into v_group_id
  from public.overtime_detection_groups
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
    and segment_type = p_segment_type;

  if v_group_id is null and p_detected_minutes = 0 then
    return jsonb_build_object(
      'changed', false,
      'revision_created', false,
      'approval_item_created', false,
      'approval_item_superseded', false
    );
  end if;

  if v_group_id is null then
    insert into public.overtime_detection_groups (
      employee_id,
      attendance_date,
      segment_type
    ) values (
      p_employee_id,
      p_attendance_date,
      p_segment_type
    )
    on conflict (employee_id, attendance_date, segment_type) do nothing;
  end if;

  select id into v_group_id
  from public.overtime_detection_groups
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
    and segment_type = p_segment_type
  for update;

  select revision.* into v_current
  from public.overtime_detection_groups as group_row
  join public.overtime_detection_revisions as revision
    on revision.id = group_row.active_revision_id
  where group_row.id = v_group_id;

  if found
    and v_current.attendance_calculation_revision_id
      is not distinct from p_attendance_calculation_revision_id
    and v_current.attendance_record_id
      is not distinct from p_attendance_record_id
    and v_current.schedule_assignment_id
      is not distinct from p_schedule_assignment_id
    and v_current.schedule_version_id
      is not distinct from p_schedule_version_id
    and v_current.overtime_policy_version_id
      is not distinct from p_overtime_policy_version_id
    and v_current.holiday_version_id
      is not distinct from p_holiday_version_id
    and v_current.segment_type = p_segment_type
    and v_current.detected_start_at
      is not distinct from p_detected_start_at
    and v_current.detected_end_at
      is not distinct from p_detected_end_at
    and v_current.detected_minutes = p_detected_minutes
    and v_current.meets_threshold = p_meets_threshold
    and v_current.is_active then
    return jsonb_build_object(
      'changed', false,
      'revision_created', false,
      'approval_item_created', false,
      'approval_item_superseded', false
    );
  end if;

  select coalesce(max(revision_number), 0) + 1
    into v_revision_number
  from public.overtime_detection_revisions
  where detection_group_id = v_group_id;

  if v_current.id is not null then
    update public.overtime_detection_revisions
    set is_active = false
    where id = v_current.id;
  end if;

  insert into public.overtime_detection_revisions (
    detection_group_id,
    revision_number,
    attendance_calculation_revision_id,
    attendance_record_id,
    schedule_assignment_id,
    schedule_version_id,
    overtime_policy_version_id,
    holiday_version_id,
    segment_type,
    detected_start_at,
    detected_end_at,
    detected_minutes,
    meets_threshold,
    is_active,
    calculation_source,
    calculated_by,
    recalculation_reason
  ) values (
    v_group_id,
    v_revision_number,
    p_attendance_calculation_revision_id,
    p_attendance_record_id,
    p_schedule_assignment_id,
    p_schedule_version_id,
    p_overtime_policy_version_id,
    p_holiday_version_id,
    p_segment_type,
    p_detected_start_at,
    p_detected_end_at,
    p_detected_minutes,
    p_meets_threshold,
    true,
    p_calculation_source,
    p_calculated_by,
    v_reason
  ) returning id into v_revision_id;

  if p_meets_threshold and p_detected_minutes > 0 then
    insert into public.overtime_approval_items (
      detection_revision_id,
      status,
      detected_minutes,
      approved_minutes
    ) values (
      v_revision_id,
      'pending',
      p_detected_minutes,
      0
    ) returning id into v_new_item_id;
    v_item_created := true;
  end if;

  if v_current.id is not null then
    select approval.* into v_old_item
    from public.overtime_approval_items as approval
    where approval.detection_revision_id = v_current.id
      and approval.status <> 'superseded'
    for update;

    if v_old_item.id is not null then
      update public.overtime_approval_items
      set status = 'superseded',
          superseded_at = now(),
          superseded_by_item_id = v_new_item_id
      where id = v_old_item.id;
      v_item_superseded := true;

      perform public.write_employee_audit(
        p_employee_id,
        'overtime_approval.superseded',
        'overtime_approval',
        v_old_item.id,
        jsonb_build_array('status'),
        jsonb_build_object(
          'status', v_old_item.status,
          'approved_minutes', v_old_item.approved_minutes
        ),
        jsonb_build_object(
          'status', 'superseded',
          'approved_minutes', v_old_item.approved_minutes,
          'attendance_date', p_attendance_date,
          'segment_type', p_segment_type,
          'detected_minutes', v_current.detected_minutes,
          'revision_number', v_current.revision_number
        ),
        '{}'::jsonb,
        'application',
        p_calculated_by
      );
    end if;

    perform public.write_employee_audit(
      p_employee_id,
      'overtime_detection.superseded',
      'overtime_detection',
      v_current.id,
      jsonb_build_array('is_active'),
      jsonb_build_object('is_active', true),
      jsonb_build_object(
        'is_active', false,
        'attendance_date', p_attendance_date,
        'segment_type', p_segment_type,
        'detected_minutes', v_current.detected_minutes,
        'revision_number', v_current.revision_number
      ),
      '{}'::jsonb,
      'application',
      p_calculated_by
    );
  end if;

  update public.overtime_detection_groups
  set active_revision_id = v_revision_id,
      updated_at = now()
  where id = v_group_id;

  v_action := case
    when v_current.id is null then 'overtime_detection.created'
    else 'overtime_detection.recalculated'
  end;

  perform public.write_employee_audit(
    p_employee_id,
    v_action,
    'overtime_detection',
    v_revision_id,
    jsonb_build_array(
      'attendance_date',
      'segment_type',
      'detected_minutes',
      'meets_threshold',
      'revision_number'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'attendance_date', p_attendance_date,
      'segment_type', p_segment_type,
      'detected_minutes', p_detected_minutes,
      'meets_threshold', p_meets_threshold,
      'revision_number', v_revision_number,
      'policy_version_id', p_overtime_policy_version_id,
      'holiday_version_id', p_holiday_version_id,
      'calculation_source', p_calculation_source
    ),
    '{}'::jsonb,
    'application',
    p_calculated_by
  );

  return jsonb_build_object(
    'changed', true,
    'revision_created', true,
    'approval_item_created', v_item_created,
    'approval_item_superseded', v_item_superseded,
    'revision_id', v_revision_id,
    'approval_item_id', v_new_item_id
  );
end;
$$;

revoke all on function public.write_overtime_detection_revision(
  uuid, date, text, uuid, uuid, uuid, uuid, uuid, uuid,
  timestamptz, timestamptz, integer, boolean, text, uuid, text
) from public, anon, authenticated;

create or replace function public.calculate_overtime_for_attendance_day(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text,
  p_actor_profile_id uuid,
  p_recalculation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendance public.attendance_calculation_revisions%rowtype;
  v_schedule public.work_schedule_versions%rowtype;
  v_attendance_found boolean := false;
  v_schedule_found boolean := false;
  v_policy_version_id uuid;
  v_minimum_minutes integer := 30;
  v_holiday_version_id uuid;
  v_holiday_name text;
  v_holiday_type text;
  v_weekday text;
  v_is_scheduled_workday boolean := false;
  v_is_complete boolean := false;
  v_pre_minutes integer := 0;
  v_post_minutes integer := 0;
  v_rest_minutes integer := 0;
  v_holiday_minutes integer := 0;
  v_write jsonb;
  v_revisions integer := 0;
  v_items integer := 0;
  v_superseded integer := 0;
  v_unchanged integer := 0;
begin
  if p_attendance_date is null
    or p_attendance_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if p_source not in (
    'clock_in',
    'clock_out',
    'hr_create',
    'hr_correction',
    'correction_approval',
    'daily_finalization',
    'manual_recalculation',
    'manual_finalization',
    'overtime_recalculation'
  ) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_SOURCE_INVALID';
  end if;

  select revision.* into v_attendance
  from public.attendance_calculation_groups as group_row
  join public.attendance_calculation_revisions as revision
    on revision.id = group_row.active_revision_id
  where group_row.employee_id = p_employee_id
    and group_row.attendance_date = p_attendance_date;
  v_attendance_found := found;

  if not v_attendance_found then
    return jsonb_build_object(
      'revisions_created', 0,
      'approval_items_created', 0,
      'approval_items_superseded', 0,
      'unchanged_segments', 4
    );
  end if;

  select overtime_policy_version_id, minimum_qualifying_minutes
    into v_policy_version_id, v_minimum_minutes
  from public.resolve_overtime_policy(p_attendance_date);

  select holiday_version_id, holiday_name, holiday_type
    into v_holiday_version_id, v_holiday_name, v_holiday_type
  from public.resolve_active_holiday(p_attendance_date);

  if v_attendance.schedule_version_id is not null then
    select * into v_schedule
    from public.work_schedule_versions
    where id = v_attendance.schedule_version_id;
    v_schedule_found := found;
  end if;

  v_weekday := lower(trim(to_char(p_attendance_date::timestamp, 'FMDay')));
  if v_schedule_found then
    v_is_scheduled_workday := v_weekday = any(v_schedule.working_days);
  end if;

  v_is_complete :=
    not v_attendance.is_provisional
    and v_attendance.actual_clock_in_at is not null
    and v_attendance.actual_clock_out_at is not null
    and v_attendance.worked_minutes is not null
    and v_attendance.base_status not in (
      'absent', 'holiday', 'missing_clock_out'
    );

  if v_is_complete then
    if v_holiday_version_id is not null then
      v_holiday_minutes := v_attendance.worked_minutes;
    elsif not v_is_scheduled_workday then
      if v_schedule_found then
        v_rest_minutes := v_attendance.worked_minutes;
      end if;
    elsif v_attendance.scheduled_start_at is not null
      and v_attendance.scheduled_end_at is not null then
      if v_attendance.actual_clock_in_at < v_attendance.scheduled_start_at then
        v_pre_minutes := greatest(
          0,
          floor(extract(epoch from (
            v_attendance.scheduled_start_at
            - v_attendance.actual_clock_in_at
          )) / 60)::integer
        );
      end if;
      if v_attendance.actual_clock_out_at > v_attendance.scheduled_end_at then
        v_post_minutes := greatest(
          0,
          floor(extract(epoch from (
            v_attendance.actual_clock_out_at
            - v_attendance.scheduled_end_at
          )) / 60)::integer
        );
      end if;
    end if;
  end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'pre_shift',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    null,
    case when v_pre_minutes > 0 then v_attendance.actual_clock_in_at else null end,
    case when v_pre_minutes > 0 then v_attendance.scheduled_start_at else null end,
    v_pre_minutes,
    v_pre_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'post_shift',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    null,
    case when v_post_minutes > 0 then v_attendance.scheduled_end_at else null end,
    case when v_post_minutes > 0 then v_attendance.actual_clock_out_at else null end,
    v_post_minutes,
    v_post_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'rest_day',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    null,
    case when v_rest_minutes > 0 then v_attendance.actual_clock_in_at else null end,
    case when v_rest_minutes > 0 then v_attendance.actual_clock_out_at else null end,
    v_rest_minutes,
    v_rest_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  v_write := public.write_overtime_detection_revision(
    p_employee_id,
    p_attendance_date,
    'holiday_work',
    v_attendance.id,
    v_attendance.attendance_record_id,
    v_attendance.schedule_assignment_id,
    v_attendance.schedule_version_id,
    v_policy_version_id,
    v_holiday_version_id,
    case when v_holiday_minutes > 0 then v_attendance.actual_clock_in_at else null end,
    case when v_holiday_minutes > 0 then v_attendance.actual_clock_out_at else null end,
    v_holiday_minutes,
    v_holiday_minutes >= v_minimum_minutes,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );
  if coalesce((v_write ->> 'changed')::boolean, false) then v_revisions := v_revisions + 1; else v_unchanged := v_unchanged + 1; end if;
  if coalesce((v_write ->> 'approval_item_created')::boolean, false) then v_items := v_items + 1; end if;
  if coalesce((v_write ->> 'approval_item_superseded')::boolean, false) then v_superseded := v_superseded + 1; end if;

  return jsonb_build_object(
    'revisions_created', v_revisions,
    'approval_items_created', v_items,
    'approval_items_superseded', v_superseded,
    'unchanged_segments', v_unchanged
  );
end;
$$;

revoke all on function public.calculate_overtime_for_attendance_day(
  uuid, date, text, uuid, text
) from public, anon, authenticated;


create or replace function public.write_attendance_calculation_revision(
  p_employee_id uuid,
  p_attendance_date date,
  p_attendance_record_id uuid,
  p_schedule_assignment_id uuid,
  p_schedule_version_id uuid,
  p_policy_version_id uuid,
  p_holiday_version_id uuid,
  p_holiday_name text,
  p_holiday_type text,
  p_is_holiday boolean,
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
    holiday_version_id, holiday_name, holiday_type, is_holiday,
    base_status, is_provisional, scheduled_start_at, scheduled_end_at,
    scheduled_minutes, actual_clock_in_at, actual_clock_out_at,
    worked_minutes, late_minutes, undertime_minutes,
    is_late, is_undertime, is_corrected, is_recalculated,
    calculation_source, calculated_by, recalculation_reason
  ) values (
    v_group_id, v_revision_number, p_attendance_record_id,
    p_schedule_assignment_id, p_schedule_version_id, p_policy_version_id,
    p_holiday_version_id, p_holiday_name, p_holiday_type, p_is_holiday,
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
      'is_provisional', 'is_holiday', 'holiday_type'
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
      'is_holiday', p_is_holiday,
      'holiday_type', p_holiday_type,
      'holiday_version_id', p_holiday_version_id,
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
  uuid, date, uuid, uuid, uuid, uuid, uuid, text, text, boolean,
  text, boolean, timestamptz, timestamptz, integer,
  timestamptz, timestamptz, integer, integer, integer,
  boolean, boolean, boolean, boolean, text, uuid, text
) from public, anon, authenticated;

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
  v_holiday_version_id uuid;
  v_holiday_name text;
  v_holiday_type text;
  v_is_holiday boolean := false;
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

  select holiday_version_id, holiday_name, holiday_type
    into v_holiday_version_id, v_holiday_name, v_holiday_type
  from public.resolve_active_holiday(p_attendance_date);
  v_is_holiday := v_holiday_version_id is not null;

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

  if v_is_holiday then
    if not v_attendance_exists then
      v_base_status := 'holiday';
      v_is_provisional := false;
      v_worked_minutes := 0;
      v_late_minutes := null;
      v_undertime_minutes := null;
    elsif v_attendance.clock_out_at is null then
      if v_date_has_ended or p_force_final then
        v_base_status := 'missing_clock_out';
        v_is_provisional := false;
      else
        v_base_status := 'present';
        v_is_provisional := true;
      end if;
      v_worked_minutes := null;
      v_late_minutes := null;
      v_undertime_minutes := null;
    else
      v_base_status := 'present';
      v_is_provisional := false;
      v_worked_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_attendance.clock_out_at - v_attendance.clock_in_at
        )) / 60)::integer
        - case when v_version_exists then v_version.break_minutes else 0 end
      );
      v_late_minutes := null;
      v_undertime_minutes := null;
    end if;
    v_is_late := false;
    v_is_undertime := false;
  elsif not v_assignment_exists then
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

  if not v_is_holiday and v_attendance_exists and v_assignment_exists and v_is_workday then
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

  if not v_is_holiday and v_attendance_exists and v_attendance.clock_out_at is not null then
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
  elsif not v_is_holiday and v_base_status = 'missing_clock_out' then
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
    v_holiday_version_id,
    v_holiday_name,
    v_holiday_type,
    v_is_holiday,
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

  perform public.calculate_overtime_for_attendance_day(
    p_employee_id,
    p_attendance_date,
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

drop function if exists public.write_attendance_calculation_revision(
  uuid, date, uuid, uuid, uuid, uuid, text, boolean,
  timestamptz, timestamptz, integer, timestamptz, timestamptz,
  integer, integer, integer, boolean, boolean, boolean, boolean,
  text, uuid, text
);

drop function if exists public.get_my_attendance_calculations(date, date);

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
  holiday_name text,
  holiday_type text,
  is_holiday boolean,
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
    revision.holiday_name,
    revision.holiday_type,
    revision.is_holiday,
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

create or replace function public.recalculate_overtime_range(
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
  v_result jsonb;
  v_employees integer := 0;
  v_dates integer := 0;
  v_revisions integer := 0;
  v_items integer := 0;
  v_superseded integer := 0;
  v_unchanged integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_DATE_RANGE_INVALID';
  end if;
  if p_end_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_FUTURE_DATE';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;

  if p_employee_ids is null then
    select coalesce(array_agg(employee.id order by employee.id), '{}'::uuid[])
      into v_employee_ids
    from public.employees as employee
    where employee.archived_at is null;
  else
    if cardinality(p_employee_ids) = 0 then
      raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_EMPLOYEE_INPUT_INVALID';
    end if;
    select coalesce(array_agg(employee.id order by employee.id), '{}'::uuid[])
      into v_employee_ids
    from public.employees as employee
    where employee.id = any(p_employee_ids)
      and employee.archived_at is null;
    if cardinality(v_employee_ids) <> cardinality(
      array(select distinct unnest(p_employee_ids))
    ) then
      raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_EMPLOYEE_INPUT_INVALID';
    end if;
  end if;

  foreach v_employee_id in array v_employee_ids loop
    v_employees := v_employees + 1;
    for v_date in
      select generate_series(p_start_date, p_end_date, interval '1 day')::date
    loop
      v_dates := v_dates + 1;
      v_result := public.calculate_overtime_for_attendance_day(
        v_employee_id,
        v_date,
        'overtime_recalculation',
        v_actor,
        v_reason
      );
      v_revisions := v_revisions + coalesce((v_result ->> 'revisions_created')::integer, 0);
      v_items := v_items + coalesce((v_result ->> 'approval_items_created')::integer, 0);
      v_superseded := v_superseded + coalesce((v_result ->> 'approval_items_superseded')::integer, 0);
      v_unchanged := v_unchanged + coalesce((v_result ->> 'unchanged_segments')::integer, 0);
    end loop;
  end loop;

  return jsonb_build_object(
    'employees_processed', v_employees,
    'dates_processed', v_dates,
    'revisions_created', v_revisions,
    'approval_items_created', v_items,
    'approval_items_superseded', v_superseded,
    'unchanged_segments', v_unchanged
  );
exception
  when sqlstate 'P0001' then
    raise;
  when others then
    raise exception using errcode = 'P0001', message = 'OVERTIME_RECALCULATION_FAILED';
end;
$$;

revoke all on function public.recalculate_overtime_range(uuid[], date, date, text)
  from public, anon;
grant execute on function public.recalculate_overtime_range(uuid[], date, date, text)
  to authenticated;

create or replace view public.employee_overtime_safe_projection
with (security_invoker = true)
as
select
  employee.profile_id as owner_profile_id,
  detection_group.attendance_date,
  detection_revision.segment_type,
  approval.detected_minutes,
  approval.approved_minutes,
  approval.status,
  approval.reviewed_at as approval_date,
  holiday.holiday_name,
  holiday.holiday_type,
  detection_revision.is_active,
  approval.created_at,
  detection_revision.revision_number
from public.employees as employee
join public.overtime_detection_groups as detection_group
  on detection_group.employee_id = employee.id
join public.overtime_detection_revisions as detection_revision
  on detection_revision.detection_group_id = detection_group.id
join public.overtime_approval_items as approval
  on approval.detection_revision_id = detection_revision.id
left join public.holiday_calendar_versions as holiday
  on holiday.id = detection_revision.holiday_version_id;

revoke all on public.employee_overtime_safe_projection
  from public, anon, authenticated;

create or replace function public.get_my_overtime_items(
  p_from_date date default null,
  p_to_date date default null
)
returns table(
  attendance_date date,
  segment_type text,
  detected_minutes integer,
  approved_minutes integer,
  status text,
  approval_date timestamptz,
  holiday_name text,
  holiday_type text,
  is_active boolean,
  created_at timestamptz
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
    safe.attendance_date,
    safe.segment_type,
    safe.detected_minutes,
    safe.approved_minutes,
    safe.status,
    safe.approval_date,
    safe.holiday_name,
    safe.holiday_type,
    safe.is_active,
    safe.created_at
  from public.employee_overtime_safe_projection as safe
  join public.employees as employee
    on employee.profile_id = safe.owner_profile_id
  where employee.profile_id = auth.uid()
    and (p_from_date is null or safe.attendance_date >= p_from_date)
    and (p_to_date is null or safe.attendance_date <= p_to_date)
  order by safe.attendance_date desc, safe.created_at desc, safe.revision_number desc;
end;
$$;

revoke all on function public.get_my_overtime_items(date, date)
  from public, anon;
grant execute on function public.get_my_overtime_items(date, date)
  to authenticated;

create or replace function public.review_overtime_approval_item(
  p_approval_item_id uuid,
  p_expected_status text,
  p_decision text,
  p_review_text text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  item public.overtime_approval_items%rowtype;
  revision public.overtime_detection_revisions%rowtype;
  group_row public.overtime_detection_groups%rowtype;
  v_review_text text := nullif(btrim(coalesce(p_review_text, '')), '');
  v_status text;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'OVERTIME_DECISION_INVALID';
  end if;
  if p_expected_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;
  if v_review_text is not null and char_length(v_review_text) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;
  if p_decision = 'reject' and v_review_text is null then
    raise exception using errcode = 'P0001', message = 'OVERTIME_REJECTION_REASON_REQUIRED';
  end if;

  select approval.* into item
  from public.overtime_approval_items as approval
  where approval.id = p_approval_item_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  select detection.* into revision
  from public.overtime_detection_revisions as detection
  where detection.id = item.detection_revision_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  select detection_group.* into group_row
  from public.overtime_detection_groups as detection_group
  where detection_group.id = revision.detection_group_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  if item.status <> p_expected_status
    or item.status <> 'pending'
    or item.superseded_at is not null
    or not revision.is_active
    or group_row.active_revision_id <> revision.id
    or item.detected_minutes <> revision.detected_minutes
  then
    raise exception using errcode = 'P0001', message = 'OVERTIME_ITEM_STALE';
  end if;

  if p_decision = 'approve' then
    update public.overtime_approval_items
    set status = 'approved',
        approved_minutes = item.detected_minutes,
        reviewed_by = v_actor,
        reviewed_at = now(),
        approval_note = v_review_text,
        rejection_reason = null
    where id = item.id;
    v_status := 'approved';
  else
    update public.overtime_approval_items
    set status = 'rejected',
        approved_minutes = 0,
        reviewed_by = v_actor,
        reviewed_at = now(),
        approval_note = null,
        rejection_reason = v_review_text
    where id = item.id;
    v_status := 'rejected';
  end if;

  perform public.write_employee_audit(
    group_row.employee_id,
    'overtime_approval.' || v_status,
    'overtime_approval',
    item.id,
    jsonb_build_array('attendance_date', 'segment_type', 'status', 'approved_minutes'),
    jsonb_build_object(
      'attendance_date', group_row.attendance_date,
      'segment_type', revision.segment_type,
      'status', 'pending',
      'approved_minutes', 0
    ),
    jsonb_build_object(
      'attendance_date', group_row.attendance_date,
      'segment_type', revision.segment_type,
      'status', v_status,
      'detected_minutes', revision.detected_minutes,
      'approved_minutes', case when v_status = 'approved' then revision.detected_minutes else 0 end,
      'revision_number', revision.revision_number,
      'holiday_version_id', revision.holiday_version_id,
      'overtime_policy_version_id', revision.overtime_policy_version_id
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return item.id;
exception
  when sqlstate 'P0001' then
    raise;
  when others then
    raise exception using errcode = 'P0001', message = 'OVERTIME_REVIEW_FAILED';
end;
$$;

revoke all on function public.review_overtime_approval_item(uuid, text, text, text)
  from public, anon;
grant execute on function public.review_overtime_approval_item(uuid, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
