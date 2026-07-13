begin;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  clock_in_note text,
  clock_out_note text,
  status text not null default 'clocked_in',
  is_corrected boolean not null default false,
  last_corrected_at timestamptz,
  last_corrected_by uuid references public.profiles(id) on delete set null,
  last_correction_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_employee_date_unique
    unique (employee_id, attendance_date),
  constraint attendance_records_status_check
    check (status in ('clocked_in', 'completed')),
  constraint attendance_records_clock_order_check
    check (clock_out_at is null or clock_out_at > clock_in_at),
  constraint attendance_records_clock_in_note_length_check
    check (clock_in_note is null or char_length(clock_in_note) <= 1000),
  constraint attendance_records_clock_out_note_length_check
    check (clock_out_note is null or char_length(clock_out_note) <= 1000),
  constraint attendance_records_correction_reason_length_check
    check (
      last_correction_reason is null
      or char_length(last_correction_reason) <= 1000
    )
);

create index if not exists attendance_records_employee_date_idx
  on public.attendance_records(employee_id, attendance_date desc, id desc);
create index if not exists attendance_records_open_idx
  on public.attendance_records(employee_id, attendance_date)
  where clock_out_at is null;
create index if not exists attendance_records_date_status_idx
  on public.attendance_records(attendance_date, status);

create table if not exists public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_record_id uuid references public.attendance_records(id) on delete set null,
  attendance_date date not null,
  request_type text not null,
  requested_clock_in_at timestamptz,
  requested_clock_out_at timestamptz,
  reason text not null,
  employee_note text,
  status text not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_correction_request_type_check
    check (request_type in (
      'add_missing_clock_in',
      'add_missing_clock_out',
      'change_clock_in',
      'change_clock_out'
    )),
  constraint attendance_correction_request_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint attendance_correction_reason_required_check
    check (char_length(btrim(reason)) >= 1 and char_length(reason) <= 1000),
  constraint attendance_correction_employee_note_length_check
    check (employee_note is null or char_length(employee_note) <= 1000),
  constraint attendance_correction_review_note_length_check
    check (review_note is null or char_length(review_note) <= 1000)
);

create unique index if not exists attendance_correction_one_pending_per_day_idx
  on public.attendance_correction_requests(employee_id, attendance_date)
  where status = 'pending';
create index if not exists attendance_correction_employee_created_idx
  on public.attendance_correction_requests(employee_id, created_at desc, id desc);
create index if not exists attendance_correction_status_created_idx
  on public.attendance_correction_requests(status, created_at, id);

create or replace function public.company_attendance_date(
  p_timestamp timestamptz default now()
)
returns date
language sql
stable
set search_path = pg_catalog, public
as $$
  select (p_timestamp at time zone 'Asia/Manila')::date;
$$;

revoke all on function public.company_attendance_date(timestamptz)
  from public, anon;
grant execute on function public.company_attendance_date(timestamptz)
  to authenticated;

alter table public.attendance_records enable row level security;
alter table public.attendance_correction_requests enable row level security;

drop policy if exists "Employees view own attendance and HR views all"
  on public.attendance_records;
create policy "Employees view own attendance and HR views all"
on public.attendance_records
for select to authenticated
using (
  public.is_hr_admin()
  or exists (
    select 1
    from public.employees as employee
    where employee.id = attendance_records.employee_id
      and employee.profile_id = auth.uid()
  )
);

drop policy if exists "Employees view own corrections and HR views all"
  on public.attendance_correction_requests;
create policy "Employees view own corrections and HR views all"
on public.attendance_correction_requests
for select to authenticated
using (
  public.is_hr_admin()
  or requested_by = auth.uid()
);

-- No direct INSERT, UPDATE, or DELETE policy is created for either table.
-- All writes use protected attendance RPC functions.


create or replace function public.normalize_attendance_private_text(
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
    raise exception using errcode = 'P0001', message = 'REQUIRED_PRIVATE_TEXT';
  end if;
  if v_value is not null and char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'PRIVATE_TEXT_TOO_LONG';
  end if;
  return v_value;
end;
$$;

revoke all on function public.normalize_attendance_private_text(text, boolean)
  from public, anon, authenticated;

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

  return v_record.id;
end;
$$;

revoke all on function public.clock_out_attendance(text) from public, anon;
grant execute on function public.clock_out_attendance(text) to authenticated;


create or replace function public.create_attendance_correction_request(
  p_attendance_date date,
  p_request_type text,
  p_requested_clock_in_local timestamp default null,
  p_requested_clock_out_local timestamp default null,
  p_reason text default null,
  p_employee_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_record public.attendance_records%rowtype;
  v_record_exists boolean := false;
  v_company_date date := public.company_attendance_date(now());
  v_reason text := public.normalize_attendance_private_text(p_reason, true);
  v_note text := public.normalize_attendance_private_text(p_employee_note, false);
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_request_id uuid;
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
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;

  if p_attendance_date > v_company_date
    or p_attendance_date < v_company_date - 30 then
    raise exception using errcode = 'P0001', message = 'REQUEST_DATE_OUT_OF_RANGE';
  end if;

  if p_request_type not in (
    'add_missing_clock_in', 'add_missing_clock_out', 'change_clock_in', 'change_clock_out'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST_TYPE';
  end if;

  select * into v_record
  from public.attendance_records
  where employee_id = v_employee.id
    and attendance_date = p_attendance_date
  for update;
  v_record_exists := found;

  if p_requested_clock_in_local is not null then
    v_clock_in := p_requested_clock_in_local at time zone 'Asia/Manila';
    if public.company_attendance_date(v_clock_in) <> p_attendance_date then
      raise exception using errcode = 'P0001', message = 'CLOCK_IN_DATE_MISMATCH';
    end if;
  end if;
  if p_requested_clock_out_local is not null then
    v_clock_out := p_requested_clock_out_local at time zone 'Asia/Manila';
    if public.company_attendance_date(v_clock_out) <> p_attendance_date then
      raise exception using errcode = 'P0001', message = 'CLOCK_OUT_DATE_MISMATCH';
    end if;
  end if;

  if p_request_type = 'add_missing_clock_in' then
    if v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_ALREADY_EXISTS'; end if;
    if v_clock_in is null then raise exception using errcode = 'P0001', message = 'CLOCK_IN_REQUIRED'; end if;
  elsif p_request_type = 'add_missing_clock_out' then
    if not v_record_exists or v_record.clock_out_at is not null then
      raise exception using errcode = 'P0001', message = 'OPEN_ATTENDANCE_REQUIRED';
    end if;
    if v_clock_out is null then raise exception using errcode = 'P0001', message = 'CLOCK_OUT_REQUIRED'; end if;
  elsif p_request_type = 'change_clock_in' then
    if not v_record_exists then raise exception using errcode = 'P0001', message = 'ATTENDANCE_REQUIRED'; end if;
    if v_clock_in is null then raise exception using errcode = 'P0001', message = 'CLOCK_IN_REQUIRED'; end if;
  else
    if not v_record_exists or v_record.clock_out_at is null then
      raise exception using errcode = 'P0001', message = 'COMPLETED_ATTENDANCE_REQUIRED';
    end if;
    if v_clock_out is null then raise exception using errcode = 'P0001', message = 'CLOCK_OUT_REQUIRED'; end if;
  end if;

  if coalesce(v_clock_in, v_record.clock_in_at) is not null
    and coalesce(v_clock_out, v_record.clock_out_at) is not null
    and coalesce(v_clock_out, v_record.clock_out_at) <= coalesce(v_clock_in, v_record.clock_in_at) then
    raise exception using errcode = 'P0001', message = 'INVALID_CLOCK_ORDER';
  end if;

  insert into public.attendance_correction_requests (
    employee_id, attendance_record_id, attendance_date, request_type,
    requested_clock_in_at, requested_clock_out_at, reason, employee_note,
    status, requested_by
  ) values (
    v_employee.id, v_record.id, p_attendance_date, p_request_type,
    v_clock_in, v_clock_out, v_reason, v_note, 'pending', v_actor
  ) returning id into v_request_id;

  perform public.write_employee_audit(
    v_employee.id,
    'attendance_correction.requested',
    'attendance_correction',
    v_request_id,
    jsonb_build_array('request_type', 'request_status'),
    '{}'::jsonb,
    jsonb_build_object('request_type', p_request_type, 'request_status', 'pending'),
    jsonb_build_object('attendance_date', p_attendance_date),
    'application',
    v_actor
  );

  return v_request_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'PENDING_REQUEST_EXISTS';
end;
$$;

revoke all on function public.create_attendance_correction_request(
  date, text, timestamp, timestamp, text, text
) from public, anon;
grant execute on function public.create_attendance_correction_request(
  date, text, timestamp, timestamp, text, text
) to authenticated;

create or replace function public.cancel_attendance_correction_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.attendance_correction_requests%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select * into v_request
  from public.attendance_correction_requests
  where id = p_request_id
  for update;

  if not found or v_request.requested_by <> v_actor then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REQUEST_NOT_PENDING';
  end if;

  update public.attendance_correction_requests
  set status = 'cancelled', updated_at = now()
  where id = v_request.id;

  perform public.write_employee_audit(
    v_request.employee_id,
    'attendance_correction.cancelled',
    'attendance_correction',
    v_request.id,
    jsonb_build_array('request_status'),
    jsonb_build_object('request_status', 'pending'),
    jsonb_build_object('request_status', 'cancelled'),
    jsonb_build_object('attendance_date', v_request.attendance_date),
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.cancel_attendance_correction_request(uuid)
  from public, anon;
grant execute on function public.cancel_attendance_correction_request(uuid)
  to authenticated;

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
end;
$$;

revoke all on function public.review_attendance_correction_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_attendance_correction_request(uuid, text, text)
  to authenticated;



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

notify pgrst, 'reload schema';
commit;
