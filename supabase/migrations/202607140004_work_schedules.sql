begin;

create extension if not exists btree_gist;

alter table public.employee_audit_logs alter column employee_id drop not null;

create or replace function public.write_employee_audit(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_changed_fields jsonb default '[]'::jsonb,
  p_before_values jsonb default '{}'::jsonb,
  p_after_values jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_source text default 'database_trigger',
  p_actor_profile_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_changed_fields) <> 'array'
    or jsonb_typeof(p_before_values) <> 'object'
    or jsonb_typeof(p_after_values) <> 'object'
    or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Invalid audit payload';
  end if;

  if p_source not in ('application', 'database_trigger') then
    raise exception 'Invalid audit source';
  end if;

  if p_employee_id is not null
    and not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Employee not found';
  end if;

  insert into public.employee_audit_logs (
    employee_id, actor_profile_id, action, entity_type, entity_id,
    changed_fields, before_values, after_values, metadata, source
  ) values (
    p_employee_id, p_actor_profile_id, p_action, p_entity_type, p_entity_id,
    p_changed_fields, p_before_values, p_after_values, p_metadata, p_source
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_employee_audit(
  uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, text, uuid
) from public, anon, authenticated;

create table if not exists public.work_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  constraint work_schedule_templates_code_unique unique (code),
  constraint work_schedule_templates_name_required
    check (char_length(btrim(name)) between 1 and 100),
  constraint work_schedule_templates_description_length
    check (description is null or char_length(description) <= 1000),
  constraint work_schedule_templates_archive_consistency
    check (
      (is_archived and archived_at is not null)
      or (not is_archived and archived_at is null and archived_by is null)
    )
);

create table if not exists public.work_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  schedule_template_id uuid not null
    references public.work_schedule_templates(id) on delete restrict,
  effective_date date not null,
  working_days text[] not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0,
  change_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint work_schedule_versions_template_date_unique
    unique (schedule_template_id, effective_date),
  constraint work_schedule_versions_workdays_required
    check (cardinality(working_days) >= 1),
  constraint work_schedule_versions_workdays_allowed
    check (
      working_days <@ array[
        'monday','tuesday','wednesday','thursday',
        'friday','saturday','sunday'
      ]::text[]
    ),
  constraint work_schedule_versions_same_day_shift
    check (end_time > start_time),
  constraint work_schedule_versions_break_nonnegative
    check (break_minutes >= 0),
  constraint work_schedule_versions_break_shorter_than_shift
    check (
      break_minutes < extract(epoch from (end_time - start_time)) / 60
    ),
  constraint work_schedule_versions_reason_length
    check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.employee_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  schedule_template_id uuid not null
    references public.work_schedule_templates(id) on delete restrict,
  effective_start_date date not null,
  effective_end_date date,
  assignment_reason text,
  is_superseded boolean not null default false,
  superseded_at timestamptz,
  superseded_by_assignment_id uuid
    references public.employee_schedule_assignments(id) on delete set null
    deferrable initially deferred,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint employee_schedule_assignment_date_order
    check (
      effective_end_date is null
      or effective_end_date >= effective_start_date
    ),
  constraint employee_schedule_assignment_reason_length
    check (assignment_reason is null or char_length(assignment_reason) <= 1000),
  constraint employee_schedule_assignment_superseded_consistency
    check (
      (not is_superseded and superseded_at is null and superseded_by_assignment_id is null)
      or (is_superseded and superseded_at is not null and superseded_by_assignment_id is not null)
    ),
  constraint employee_schedule_assignment_no_active_overlap
    exclude using gist (
      employee_id with =,
      daterange(
        effective_start_date,
        coalesce(effective_end_date, 'infinity'::date),
        '[]'
      ) with &&
    ) where (not is_superseded)
);

create index if not exists work_schedule_templates_status_name_idx
  on public.work_schedule_templates(is_archived, name, id);
create index if not exists work_schedule_versions_template_effective_idx
  on public.work_schedule_versions(schedule_template_id, effective_date desc, id desc);
create index if not exists employee_schedule_assignments_employee_start_idx
  on public.employee_schedule_assignments(employee_id, effective_start_date desc, id desc);
create index if not exists employee_schedule_assignments_template_idx
  on public.employee_schedule_assignments(schedule_template_id, effective_start_date, id);

create or replace function public.normalize_schedule_code(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select trim(both '-' from regexp_replace(
    upper(btrim(coalesce(p_value, ''))),
    '[^A-Z0-9]+',
    '-',
    'g'
  ));
$$;

create or replace function public.normalize_schedule_private_text(
  p_value text,
  p_required boolean default false
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if p_required and v_value is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_REASON_REQUIRED';
  end if;
  if v_value is not null and char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_PRIVATE_TEXT_TOO_LONG';
  end if;
  return v_value;
end;
$$;

create or replace function public.validate_schedule_rules(
  p_effective_date date,
  p_working_days text[],
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_change_reason text default null
)
returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_reason text := public.normalize_schedule_private_text(p_change_reason, false);
  v_shift_minutes integer;
begin
  if p_effective_date is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EFFECTIVE_DATE_REQUIRED';
  end if;
  if p_working_days is null or cardinality(p_working_days) = 0 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_WORKDAYS_REQUIRED';
  end if;
  if exists (
    select 1
    from unnest(p_working_days) as day_name
    where day_name not in (
      'monday','tuesday','wednesday','thursday',
      'friday','saturday','sunday'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_WORKDAY_INVALID';
  end if;
  if (select count(*) from unnest(p_working_days))
    <> (select count(distinct day_name) from unnest(p_working_days) as day_name) then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_WORKDAY_DUPLICATE';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_TIME_ORDER_INVALID';
  end if;
  if p_break_minutes is null or p_break_minutes < 0 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_BREAK_INVALID';
  end if;
  v_shift_minutes := extract(epoch from (p_end_time - p_start_time))::integer / 60;
  if p_break_minutes >= v_shift_minutes then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_BREAK_TOO_LONG';
  end if;
  if p_effective_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_REASON_REQUIRED';
  end if;
  return v_reason;
end;
$$;

revoke all on function public.normalize_schedule_code(text)
  from public, anon, authenticated;
revoke all on function public.normalize_schedule_private_text(text, boolean)
  from public, anon, authenticated;
revoke all on function public.validate_schedule_rules(date, text[], time, time, integer, text)
  from public, anon, authenticated;

create or replace function public.prevent_work_schedule_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_work_schedule_version_mutation()
  from public, anon, authenticated;

drop trigger if exists prevent_work_schedule_version_update
  on public.work_schedule_versions;
create trigger prevent_work_schedule_version_update
before update or delete on public.work_schedule_versions
for each row execute function public.prevent_work_schedule_version_mutation();

alter table public.work_schedule_templates enable row level security;
alter table public.work_schedule_versions enable row level security;
alter table public.employee_schedule_assignments enable row level security;

drop policy if exists "HR views all schedule templates"
  on public.work_schedule_templates;
create policy "HR views all schedule templates"
on public.work_schedule_templates
for select to authenticated
using (public.is_hr_admin());

drop policy if exists "HR views all schedule versions"
  on public.work_schedule_versions;
create policy "HR views all schedule versions"
on public.work_schedule_versions
for select to authenticated
using (public.is_hr_admin());

drop policy if exists "HR views all employee schedule assignments"
  on public.employee_schedule_assignments;
create policy "HR views all employee schedule assignments"
on public.employee_schedule_assignments
for select to authenticated
using (public.is_hr_admin());

-- Employees do not receive direct base-table schedule SELECT policies.
-- Employee self-service uses the protected get_my_schedule RPC added in Task 10.
-- No INSERT, UPDATE, or DELETE policies are created for schedule tables.


create or replace function public.create_work_schedule_template(
  p_code text,
  p_name text,
  p_description text,
  p_effective_date date,
  p_working_days text[],
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := public.normalize_schedule_code(p_code);
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := public.normalize_schedule_private_text(p_description, false);
  v_reason text;
  v_template_id uuid;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if v_code = '' or char_length(v_code) > 30 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_INVALID';
  end if;
  if v_name = '' or char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NAME_INVALID';
  end if;

  v_reason := public.validate_schedule_rules(
    p_effective_date, p_working_days, p_start_time,
    p_end_time, p_break_minutes, p_change_reason
  );

  insert into public.work_schedule_templates (
    code, name, description, created_by, updated_by
  ) values (
    v_code, v_name, v_description, v_actor, v_actor
  ) returning id into v_template_id;

  insert into public.work_schedule_versions (
    schedule_template_id, effective_date, working_days,
    start_time, end_time, break_minutes, change_reason, created_by
  ) values (
    v_template_id, p_effective_date, p_working_days,
    p_start_time, p_end_time, p_break_minutes, v_reason, v_actor
  ) returning id into v_version_id;

  perform public.write_employee_audit(
    null,
    'schedule_template.created',
    'schedule_template',
    v_template_id,
    jsonb_build_array('code', 'name'),
    '{}'::jsonb,
    jsonb_build_object('code', v_code, 'name', v_name),
    '{}'::jsonb,
    'application',
    v_actor
  );

  perform public.write_employee_audit(
    null,
    'schedule_version.created',
    'schedule_version',
    v_version_id,
    jsonb_build_array(
      'effective_date','working_days','start_time','end_time','break_minutes'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'schedule_template_id', v_template_id,
      'effective_date', p_effective_date,
      'working_days', to_jsonb(p_working_days),
      'start_time', p_start_time,
      'end_time', p_end_time,
      'break_minutes', p_break_minutes
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );

  return v_template_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_EXISTS';
end;
$$;

create or replace function public.update_work_schedule_template(
  p_template_id uuid,
  p_code text,
  p_name text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.work_schedule_templates%rowtype;
  v_code text := public.normalize_schedule_code(p_code);
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := public.normalize_schedule_private_text(p_description, false);
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if v_code = '' or char_length(v_code) > 30 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_INVALID';
  end if;
  if v_name = '' or char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NAME_INVALID';
  end if;

  select * into v_existing
  from public.work_schedule_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;

  update public.work_schedule_templates
  set code = v_code,
      name = v_name,
      description = v_description,
      updated_by = v_actor,
      updated_at = now()
  where id = p_template_id;

  perform public.write_employee_audit(
    null,
    'schedule_template.updated',
    'schedule_template',
    p_template_id,
    jsonb_build_array('code', 'name'),
    jsonb_build_object('code', v_existing.code, 'name', v_existing.name),
    jsonb_build_object('code', v_code, 'name', v_name),
    '{}'::jsonb,
    'application',
    v_actor
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_CODE_EXISTS';
end;
$$;

create or replace function public.create_work_schedule_version(
  p_template_id uuid,
  p_effective_date date,
  p_working_days text[],
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  perform 1
  from public.work_schedule_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;

  v_reason := public.validate_schedule_rules(
    p_effective_date, p_working_days, p_start_time,
    p_end_time, p_break_minutes, p_change_reason
  );

  insert into public.work_schedule_versions (
    schedule_template_id, effective_date, working_days,
    start_time, end_time, break_minutes, change_reason, created_by
  ) values (
    p_template_id, p_effective_date, p_working_days,
    p_start_time, p_end_time, p_break_minutes, v_reason, v_actor
  ) returning id into v_version_id;

  perform public.write_employee_audit(
    null,
    'schedule_version.created',
    'schedule_version',
    v_version_id,
    jsonb_build_array(
      'effective_date','working_days','start_time','end_time','break_minutes'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'schedule_template_id', p_template_id,
      'effective_date', p_effective_date,
      'working_days', to_jsonb(p_working_days),
      'start_time', p_start_time,
      'end_time', p_end_time,
      'break_minutes', p_break_minutes
    ),
    '{}'::jsonb,
    'application',
    v_actor
  );
  return v_version_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_DATE_EXISTS';
end;
$$;

create or replace function public.set_work_schedule_template_archived(
  p_template_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.work_schedule_templates%rowtype;
  v_action text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  select * into v_template
  from public.work_schedule_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;

  update public.work_schedule_templates
  set is_archived = p_archived,
      archived_by = case when p_archived then v_actor else null end,
      archived_at = case when p_archived then now() else null end,
      updated_by = v_actor,
      updated_at = now()
  where id = p_template_id;

  v_action := case
    when p_archived then 'schedule_template.archived'
    else 'schedule_template.restored'
  end;

  perform public.write_employee_audit(
    null,
    v_action,
    'schedule_template',
    p_template_id,
    jsonb_build_array('is_archived'),
    jsonb_build_object('is_archived', v_template.is_archived),
    jsonb_build_object('is_archived', p_archived),
    '{}'::jsonb,
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.create_work_schedule_template(
  text, text, text, date, text[], time, time, integer, text
) from public, anon;
revoke all on function public.update_work_schedule_template(uuid, text, text, text)
  from public, anon;
revoke all on function public.create_work_schedule_version(
  uuid, date, text[], time, time, integer, text
) from public, anon;
revoke all on function public.set_work_schedule_template_archived(uuid, boolean)
  from public, anon;

grant execute on function public.create_work_schedule_template(
  text, text, text, date, text[], time, time, integer, text
) to authenticated;
grant execute on function public.update_work_schedule_template(uuid, text, text, text)
  to authenticated;
grant execute on function public.create_work_schedule_version(
  uuid, date, text[], time, time, integer, text
) to authenticated;
grant execute on function public.set_work_schedule_template_archived(uuid, boolean)
  to authenticated;


create or replace function public.apply_employee_schedule_assignment(
  p_actor uuid,
  p_employee_id uuid,
  p_schedule_template_id uuid,
  p_effective_start_date date,
  p_effective_end_date date,
  p_assignment_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template public.work_schedule_templates%rowtype;
  v_reason text := public.normalize_schedule_private_text(p_assignment_reason, false);
  v_assignment_id uuid := gen_random_uuid();
  v_previous public.employee_schedule_assignments%rowtype;
  v_future public.employee_schedule_assignments%rowtype;
begin
  if p_effective_start_date is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_ASSIGNMENT_START_REQUIRED';
  end if;
  if p_effective_end_date is not null and p_effective_end_date < p_effective_start_date then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_ASSIGNMENT_DATE_INVALID';
  end if;
  if p_effective_start_date < public.company_attendance_date(now()) and v_reason is null then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_REASON_REQUIRED';
  end if;

  perform 1
  from public.employees
  where id = p_employee_id
    and archived_at is null
    and employment_status in ('active', 'probation', 'on_leave')
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EMPLOYEE_INELIGIBLE';
  end if;

  select * into v_template
  from public.work_schedule_templates
  where id = p_schedule_template_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_NOT_FOUND';
  end if;
  if v_template.is_archived then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_ARCHIVED';
  end if;

  perform 1
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
  order by id
  for update;

  select * into v_previous
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date < p_effective_start_date
    and (effective_end_date is null or effective_end_date >= p_effective_start_date)
  order by effective_start_date desc
  limit 1;

  if found then
    update public.employee_schedule_assignments
    set effective_end_date = p_effective_start_date - 1,
        updated_by = p_actor,
        updated_at = now()
    where id = v_previous.id;

    perform public.write_employee_audit(
      p_employee_id,
      'schedule_assignment.ended',
      'schedule_assignment',
      v_previous.id,
      jsonb_build_array('effective_end_date'),
      jsonb_build_object('effective_end_date', v_previous.effective_end_date),
      jsonb_build_object('effective_end_date', p_effective_start_date - 1),
      jsonb_build_object('schedule_template_id', v_previous.schedule_template_id),
      'application',
      p_actor
    );
  end if;

  for v_future in
    select *
    from public.employee_schedule_assignments
    where employee_id = p_employee_id
      and not is_superseded
      and effective_start_date >= p_effective_start_date
    order by effective_start_date, id
    for update
  loop
    update public.employee_schedule_assignments
    set is_superseded = true,
        superseded_at = now(),
        superseded_by_assignment_id = v_assignment_id,
        updated_by = p_actor,
        updated_at = now()
    where id = v_future.id;

    perform public.write_employee_audit(
      p_employee_id,
      'schedule_assignment.superseded',
      'schedule_assignment',
      v_future.id,
      jsonb_build_array('is_superseded'),
      jsonb_build_object('is_superseded', false),
      jsonb_build_object('is_superseded', true),
      jsonb_build_object(
        'schedule_template_id', v_future.schedule_template_id,
        'superseded_by_assignment_id', v_assignment_id
      ),
      'application',
      p_actor
    );
  end loop;

  insert into public.employee_schedule_assignments (
    id,employee_id,schedule_template_id,effective_start_date,effective_end_date,
    assignment_reason,created_by,updated_by
  ) values (
    v_assignment_id,p_employee_id,p_schedule_template_id,p_effective_start_date,
    p_effective_end_date,v_reason,p_actor,p_actor
  );

  perform public.write_employee_audit(
    p_employee_id,
    'schedule_assignment.created',
    'schedule_assignment',
    v_assignment_id,
    jsonb_build_array(
      'schedule_template_id','effective_start_date','effective_end_date'
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'schedule_template_id', p_schedule_template_id,
      'effective_start_date', p_effective_start_date,
      'effective_end_date', p_effective_end_date
    ),
    '{}'::jsonb,
    'application',
    p_actor
  );

  return v_assignment_id;
end;
$$;

revoke all on function public.apply_employee_schedule_assignment(
  uuid, uuid, uuid, date, date, text
) from public, anon, authenticated;

create or replace function public.assign_employee_schedule(
  p_employee_id uuid,
  p_schedule_template_id uuid,
  p_effective_start_date date,
  p_effective_end_date date default null,
  p_assignment_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  return public.apply_employee_schedule_assignment(
    v_actor,p_employee_id,p_schedule_template_id,
    p_effective_start_date,p_effective_end_date,p_assignment_reason
  );
end;
$$;

create or replace function public.bulk_assign_employee_schedule(
  p_employee_ids uuid[],
  p_schedule_template_id uuid,
  p_effective_start_date date,
  p_effective_end_date date default null,
  p_assignment_reason text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee_id uuid;
  v_assignment_ids uuid[] := '{}'::uuid[];
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_employee_ids is null or cardinality(p_employee_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EMPLOYEE_REQUIRED';
  end if;
  if cardinality(p_employee_ids) <> (
    select count(distinct employee_id)
    from unnest(p_employee_ids) as employee_id
  ) then
    raise exception using errcode = 'P0001', message = 'SCHEDULE_EMPLOYEE_DUPLICATE';
  end if;

  for v_employee_id in
    select employee_id
    from unnest(p_employee_ids) as employee_id
    order by employee_id
  loop
    v_assignment_ids := array_append(
      v_assignment_ids,
      public.apply_employee_schedule_assignment(
        v_actor,v_employee_id,p_schedule_template_id,
        p_effective_start_date,p_effective_end_date,p_assignment_reason
      )
    );
  end loop;

  return v_assignment_ids;
end;
$$;

revoke all on function public.assign_employee_schedule(uuid, uuid, date, date, text)
  from public, anon;
revoke all on function public.bulk_assign_employee_schedule(uuid[], uuid, date, date, text)
  from public, anon;
grant execute on function public.assign_employee_schedule(uuid, uuid, date, date, text)
  to authenticated;
grant execute on function public.bulk_assign_employee_schedule(uuid[], uuid, date, date, text)
  to authenticated;


create or replace function public.get_my_schedule(
  p_company_date date default public.company_attendance_date(now())
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee_id uuid;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_upcoming public.employee_schedule_assignments%rowtype;
  v_template public.work_schedule_templates%rowtype;
  v_upcoming_template public.work_schedule_templates%rowtype;
  v_version public.work_schedule_versions%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select id into v_employee_id
  from public.employees
  where profile_id = v_actor
    and archived_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = v_employee_id
    and not is_superseded
    and effective_start_date <= p_company_date
    and (effective_end_date is null or effective_end_date >= p_company_date)
  order by effective_start_date desc, id desc
  limit 1;

  select * into v_upcoming
  from public.employee_schedule_assignments
  where employee_id = v_employee_id
    and not is_superseded
    and effective_start_date > p_company_date
  order by effective_start_date, id
  limit 1;

  if v_assignment.id is not null then
    select * into v_template
    from public.work_schedule_templates
    where id = v_assignment.schedule_template_id;

    select * into v_version
    from public.work_schedule_versions
    where schedule_template_id = v_assignment.schedule_template_id
      and effective_date <= p_company_date
    order by effective_date desc, id desc
    limit 1;
  end if;

  if v_upcoming.id is not null then
    select * into v_upcoming_template
    from public.work_schedule_templates
    where id = v_upcoming.schedule_template_id;
  end if;

  return jsonb_build_object(
    'companyDate', p_company_date,
    'assignment', case when v_assignment.id is null then null else jsonb_build_object(
      'id', v_assignment.id,
      'employee_id', v_assignment.employee_id,
      'schedule_template_id', v_assignment.schedule_template_id,
      'effective_start_date', v_assignment.effective_start_date,
      'effective_end_date', v_assignment.effective_end_date,
      'is_superseded', false,
      'template', jsonb_build_object(
        'id', v_template.id,
        'code', v_template.code,
        'name', v_template.name,
        'is_archived', v_template.is_archived
      )
    ) end,
    'version', case when v_version.id is null then null else jsonb_build_object(
      'id', v_version.id,
      'schedule_template_id', v_version.schedule_template_id,
      'effective_date', v_version.effective_date,
      'working_days', v_version.working_days,
      'start_time', v_version.start_time,
      'end_time', v_version.end_time,
      'break_minutes', v_version.break_minutes
    ) end,
    'upcomingAssignment', case when v_upcoming.id is null then null else jsonb_build_object(
      'id', v_upcoming.id,
      'employee_id', v_upcoming.employee_id,
      'schedule_template_id', v_upcoming.schedule_template_id,
      'effective_start_date', v_upcoming.effective_start_date,
      'effective_end_date', v_upcoming.effective_end_date,
      'is_superseded', false,
      'template', jsonb_build_object(
        'id', v_upcoming_template.id,
        'code', v_upcoming_template.code,
        'name', v_upcoming_template.name,
        'is_archived', v_upcoming_template.is_archived
      )
    ) end
  );
end;
$$;

revoke all on function public.get_my_schedule(date) from public, anon;
grant execute on function public.get_my_schedule(date) to authenticated;

notify pgrst, 'reload schema';
commit;
