begin;

-- Phase 9: in-app notifications, reminders, escalations, and scheduled processing.

alter table public.notifications
  add column if not exists module text,
  add column if not exists priority text,
  add column if not exists status text,
  add column if not exists resource_key text,
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists safe_context jsonb not null default '{}'::jsonb,
  add column if not exists action_url text,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists first_notified_at timestamptz,
  add column if not exists last_reminded_at timestamptz,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.notifications
set module = coalesce(module, case when type like 'document_%' then 'documents' else 'system' end),
    priority = coalesce(priority, 'normal'),
    status = coalesce(status, case when read_at is null then 'unread' else 'read' end),
    resource_key = coalesce(resource_key, coalesce(resource_type, 'notification') || ':' || coalesce(resource_id::text, id::text)),
    first_notified_at = coalesce(first_notified_at, created_at),
    updated_at = coalesce(updated_at, created_at);

alter table public.notifications
  alter column module set not null,
  alter column priority set not null,
  alter column status set not null,
  alter column resource_key set not null,
  alter column first_notified_at set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_module_check') then
    alter table public.notifications add constraint notifications_module_check check (module in ('attendance','leave','overtime','documents','system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_priority_check') then
    alter table public.notifications add constraint notifications_priority_check check (priority in ('info','normal','high','urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_status_check') then
    alter table public.notifications add constraint notifications_status_check check (status in ('unread','read','dismissed','resolved','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_counts_check') then
    alter table public.notifications add constraint notifications_counts_check check (reminder_count >= 0 and escalation_level >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_lifecycle_check') then
    alter table public.notifications add constraint notifications_lifecycle_check check (
      (status <> 'unread' or read_at is null)
      and (status <> 'read' or read_at is not null)
      and (status <> 'dismissed' or dismissed_at is not null)
      and (status <> 'resolved' or resolved_at is not null)
      and (status <> 'archived' or archived_at is not null)
    );
  end if;
end $$;

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  type_code text not null
    constraint notification_rules_type_code_check check (type_code in (
      'attendance_exception',
      'leave_approval_pending',
      'overtime_approval_pending',
      'document_review_pending',
      'document_expiring',
      'document_expired'
    )),
  module text not null check (module in ('attendance','leave','overtime','documents','system')),
  enabled boolean not null default true,
  initial_delay_days integer,
  repeat_interval_days integer not null default 1,
  escalation_after_days integer,
  lead_time_days integer,
  retention_days integer not null default 90,
  version integer not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint notification_rules_timing_check check (
    (initial_delay_days is null or initial_delay_days >= 0)
    and repeat_interval_days >= 1
    and (escalation_after_days is null or escalation_after_days >= 0)
    and (lead_time_days is null or lead_time_days >= 0)
    and retention_days between 1 and 3650
    and version >= 1
  )
);
create unique index if not exists notification_rules_type_code_unique on public.notification_rules(type_code);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete restrict,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','reminded','read','marked_unread','dismissed','escalated','resolved','archived','rule_changed','rule_reset')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  request_id uuid,
  safe_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notification_events_notification_created_idx on public.notification_events(notification_id, created_at desc);
create index if not exists notification_events_recipient_created_idx on public.notification_events(recipient_user_id, created_at desc);

create table if not exists public.notification_cycle_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default ((now() at time zone 'Asia/Manila')::date),
  run_source text not null check (run_source in ('scheduled','manual')),
  status text not null check (status in ('running','succeeded','partial_failed','failed')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  request_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_count integer not null default 0,
  reminded_count integer not null default 0,
  escalated_count integer not null default 0,
  resolved_count integer not null default 0,
  archived_count integer not null default 0,
  error_code text,
  safe_error_message text,
  rule_results jsonb not null default '{}'::jsonb
);
create unique index if not exists notification_cycle_runs_date_source_active_unique
  on public.notification_cycle_runs(run_date, run_source)
  where run_source = 'scheduled' and status in ('running','succeeded');
create unique index if not exists notification_cycle_runs_manual_request_unique
  on public.notification_cycle_runs(actor_user_id, request_id)
  where run_source = 'manual' and request_id is not null;

create index if not exists notifications_recipient_status_created_idx on public.notifications(recipient_user_id, status, created_at desc);
create index if not exists notifications_next_reminder_idx on public.notifications(next_reminder_at) where status in ('unread','read','dismissed');
create index if not exists notifications_resource_active_idx on public.notifications(resource_type, resource_key, status) where status in ('unread','read','dismissed');

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
  if p_payload is null then
    return;
  end if;

  if jsonb_typeof(p_payload) = 'object' then
    for v_key, v_value in
      select entry.key, entry.value
      from jsonb_each(p_payload) as entry
    loop
      foreach v_forbidden in array array[
        'signed_url',
        'storage_path',
        'service_role',
        'access_token',
        'raw_file',
        'filename',
        'original_filename',
        'safe_filename',
        'internal_reason',
        'private_note',
        'private_notes',
        'review_note',
        'rejection_reason',
        'approval_note',
        'bank',
        'account_number',
        'government_id',
        'custom_metadata',
        'issuing_organization',
        'reference_number'
      ] loop
        if position(v_forbidden in lower(v_key)) > 0 then
          raise exception 'NOTIFICATION_INVALID_PAYLOAD';
        end if;
      end loop;

      if jsonb_typeof(v_value) in ('object', 'array') then
        perform public.assert_safe_notification_payload(v_value);
      end if;
    end loop;
  elsif jsonb_typeof(p_payload) = 'array' then
    for v_value in
      select item.value
      from jsonb_array_elements(p_payload) as item
    loop
      if jsonb_typeof(v_value) in ('object', 'array') then
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
declare
  v_allowed boolean;
begin
  if p_url is null or btrim(p_url) = '' then return null; end if;
  if p_url ~* '^[a-z][a-z0-9+.-]*:'
     or starts_with(p_url, '//') -- protocol-relative paths are forbidden
     or position('://' in p_url) > 0
     or position(E'\\' in p_url) > 0
     or p_url ~ '[[:cntrl:]]'
     or lower(p_url) like 'javascript:%' then
    raise exception 'NOTIFICATION_INVALID_ACTION_URL';
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
    or p_url = '/admin/notifications/settings' or starts_with(p_url, '/admin/notifications/settings/') or starts_with(p_url, '/admin/notifications/settings?');
  if not v_allowed then raise exception 'NOTIFICATION_INVALID_ACTION_URL'; end if;
  return p_url;
end;
$$;

create or replace function public.guard_notification_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_safe_notification_payload(new.safe_context);
  new.action_url := public.validate_notification_action_url(new.action_url);
  if char_length(new.title) > 160 or char_length(new.body) > 500 then
    raise exception 'NOTIFICATION_INVALID_PAYLOAD';
  end if;
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;
drop trigger if exists notifications_safe_guard on public.notifications;
create trigger notifications_safe_guard before insert or update on public.notifications
for each row execute function public.guard_notification_row();

create or replace function public.prevent_notification_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$ begin raise exception 'NOTIFICATION_INVALID_STATUS'; end; $$;
drop trigger if exists notification_events_immutable on public.notification_events;
create trigger notification_events_immutable before update or delete on public.notification_events
for each row execute function public.prevent_notification_event_mutation();

alter table public.notifications enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_cycle_runs enable row level security;

drop policy if exists "Notification recipients can read their notifications" on public.notifications;
create policy "Notification recipients can read their notifications" on public.notifications
for select to authenticated using (recipient_user_id = auth.uid());

revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
revoke all on public.notification_rules from authenticated;
revoke all on public.notification_events from authenticated;
revoke all on public.notification_cycle_runs from authenticated;

insert into public.notification_rules(type_code,module,enabled,initial_delay_days,repeat_interval_days,escalation_after_days,lead_time_days,retention_days,version)
values
  ('attendance_exception','attendance',true,1,1,3,null,90,1),
  ('leave_approval_pending','leave',true,1,1,3,null,90,1),
  ('overtime_approval_pending','overtime',true,1,1,3,null,90,1),
  ('document_review_pending','documents',true,2,1,5,null,90,1),
  ('document_expiring','documents',true,null,1,7,30,90,1),
  ('document_expired','documents',true,0,1,3,null,90,1)
on conflict (type_code) do nothing;

create or replace function public.write_notification_event(
  p_notification_id uuid,
  p_recipient_user_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_safe_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.assert_safe_notification_payload(coalesce(p_safe_data, '{}'::jsonb));
  insert into public.notification_events(id,notification_id,recipient_user_id,event_type,actor_user_id,request_id,safe_data)
  values(v_id,p_notification_id,p_recipient_user_id,p_event_type,p_actor_user_id,p_request_id,coalesce(p_safe_data,'{}'::jsonb));
  return v_id;
end;
$$;

create or replace function public.build_notification_source_event_key(
  p_type_code text, p_resource_key text, p_recipient_user_id uuid, p_escalation_level integer
) returns text
language sql
immutable
security definer
set search_path = pg_catalog, public
as $$ select p_type_code || ':' || p_resource_key || ':' || p_recipient_user_id::text || ':' || p_escalation_level::text $$;

create or replace function public.upsert_safe_notification(
  p_recipient_user_id uuid,
  p_type_code text,
  p_title text,
  p_body text,
  p_module text,
  p_priority text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_key text,
  p_employee_id uuid,
  p_safe_context jsonb,
  p_action_url text,
  p_escalation_level integer,
  p_first_due_at timestamptz,
  p_repeat_interval_days integer,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_row public.notifications%rowtype;
  v_created boolean := false;
  v_reminded boolean := false;
  v_event_type text;
  v_due boolean := false;
begin
  if p_recipient_user_id is null
     or p_resource_key is null
     or p_escalation_level < 0 then
    raise exception 'NOTIFICATION_INVALID_PAYLOAD';
  end if;

  perform public.assert_safe_notification_payload(coalesce(p_safe_context, '{}'::jsonb));
  perform public.validate_notification_action_url(p_action_url);
  v_key := public.build_notification_source_event_key(
    p_type_code,
    p_resource_key,
    p_recipient_user_id,
    p_escalation_level
  );

  select *
  into v_row
  from public.notifications
  where recipient_user_id = p_recipient_user_id
    and source_event_key = v_key
  for update;

  if not found then
    insert into public.notifications(
      recipient_user_id,
      type,
      title,
      body,
      resource_type,
      resource_id,
      source_event_key,
      module,
      priority,
      status,
      resource_key,
      employee_id,
      safe_context,
      action_url,
      reminder_count,
      escalation_level,
      first_notified_at,
      next_reminder_at,
      escalated_at,
      created_at,
      updated_at
    ) values (
      p_recipient_user_id,
      p_type_code,
      left(p_title, 160),
      left(p_body, 500),
      p_resource_type,
      p_resource_id,
      v_key,
      p_module,
      p_priority,
      'unread',
      p_resource_key,
      p_employee_id,
      coalesce(p_safe_context, '{}'::jsonb),
      p_action_url,
      0,
      p_escalation_level,
      now(),
      greatest(coalesce(p_first_due_at, now()), now())
        + make_interval(days => greatest(p_repeat_interval_days, 1)),
      case when p_escalation_level > 0 then now() else null end,
      now(),
      now()
    )
    on conflict (recipient_user_id, source_event_key) do nothing
    returning * into v_row;

    if found then
      v_created := true;
      v_event_type := case
        when p_escalation_level > 0 then 'escalated'
        else 'created'
      end;
      perform public.write_notification_event(
        v_row.id,
        p_recipient_user_id,
        v_event_type,
        null,
        p_request_id,
        jsonb_build_object('stage', p_escalation_level)
      );
      return jsonb_build_object(
        'id', v_row.id,
        'created', true,
        'reminded', false,
        'escalated', p_escalation_level > 0,
        'status', v_row.status
      );
    end if;

    select *
    into v_row
    from public.notifications
    where recipient_user_id = p_recipient_user_id
      and source_event_key = v_key
    for update;
  end if;

  if v_row.status in ('resolved', 'archived') then
    return jsonb_build_object(
      'id', v_row.id,
      'created', false,
      'reminded', false,
      'escalated', false,
      'status', v_row.status
    );
  end if;

  v_due := v_row.next_reminder_at is null or v_row.next_reminder_at <= now();

  update public.notifications
  set title = left(p_title, 160),
      body = left(p_body, 500),
      priority = p_priority,
      safe_context = coalesce(p_safe_context, '{}'::jsonb),
      action_url = p_action_url,
      status = case when v_due then 'unread' else status end,
      read_at = case when v_due then null else read_at end,
      dismissed_at = case when v_due then null else dismissed_at end,
      reminder_count = case
        when v_due then reminder_count + 1
        else reminder_count
      end,
      last_reminded_at = case
        when v_due then now()
        else last_reminded_at
      end,
      next_reminder_at = case
        when v_due
          then now() + make_interval(days => greatest(p_repeat_interval_days, 1))
        else next_reminder_at
      end,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  if v_due then
    v_reminded := true;
    perform public.write_notification_event(
      v_row.id,
      p_recipient_user_id,
      'reminded',
      null,
      p_request_id,
      jsonb_build_object('reminder_count', v_row.reminder_count)
    );
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'created', v_created,
    'reminded', v_reminded,
    'escalated', false,
    'status', v_row.status
  );
end;
$$;

create or replace function public.resolve_notifications_for_resource(
  p_resource_type text,
  p_resource_id uuid,
  p_request_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  if p_resource_type is null or p_resource_id is null then
    raise exception 'NOTIFICATION_INVALID_PAYLOAD';
  end if;

  for v_row in
    select n.id, n.recipient_user_id
    from public.notifications n
    where n.resource_type = p_resource_type
      and n.resource_id = p_resource_id
      and n.status in ('unread', 'read', 'dismissed')
    order by n.id
    for update
  loop
    update public.notifications
    set status = 'resolved',
        resolved_at = now(),
        updated_at = now()
    where id = v_row.id;

    perform public.write_notification_event(
      v_row.id,
      v_row.recipient_user_id,
      'resolved',
      null,
      p_request_id,
      '{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.list_notification_center(
  p_module text default null,
  p_status text default null,
  p_priority text default null,
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_page integer default 1
) returns table(
  id uuid,type text,title text,body text,module text,priority text,status text,action_url text,
  reminder_count integer,escalation_level integer,created_at timestamptz,last_reminded_at timestamptz,
  read_at timestamptz,resolved_at timestamptz,archived_at timestamptz,total_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select n.id,n.type,n.title,n.body,n.module,n.priority,n.status,n.action_url,n.reminder_count,n.escalation_level,
         n.created_at,n.last_reminded_at,n.read_at,n.resolved_at,n.archived_at,count(*) over()
  from public.notifications n
  where n.recipient_user_id=auth.uid()
    and (p_module is null or n.module=p_module)
    and (p_priority is null or n.priority=p_priority)
    and (p_status is null or (p_status='active' and n.status in ('unread','read','dismissed')) or n.status=p_status)
    and (p_query is null or n.title ilike '%'||left(btrim(p_query),120)||'%' or n.body ilike '%'||left(btrim(p_query),120)||'%')
    and (p_from is null or n.created_at >= p_from::timestamptz)
    and (p_to is null or n.created_at < (p_to+1)::timestamptz)
  order by case n.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,n.created_at desc,n.id desc
  limit 25 offset (greatest(coalesce(p_page,1),1)-1)*25
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$ select count(*)::integer from public.notifications where recipient_user_id=auth.uid() and status='unread' $$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.notifications%rowtype;
begin
  select * into v_row from public.notifications where id=p_notification_id and recipient_user_id=auth.uid() for update;
  if not found then raise exception 'NOTIFICATION_NOT_FOUND'; end if;
  if v_row.status in ('resolved','archived') then raise exception 'NOTIFICATION_INVALID_STATUS'; end if;
  update public.notifications set status='read',read_at=coalesce(read_at,now()),updated_at=now() where id=p_notification_id;
  perform public.write_notification_event(p_notification_id,auth.uid(),'read',auth.uid(),gen_random_uuid(),'{}'::jsonb);
end;
$$;

create or replace function public.mark_notification_unread(p_notification_id uuid,p_request_id uuid default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.notifications%rowtype;
begin
  select * into v_row from public.notifications where id=p_notification_id and recipient_user_id=auth.uid() for update;
  if not found then raise exception 'NOTIFICATION_NOT_FOUND'; end if;
  if v_row.status in ('resolved','archived') then raise exception 'NOTIFICATION_INVALID_STATUS'; end if;
  update public.notifications set status='unread',read_at=null,dismissed_at=null,updated_at=now() where id=p_notification_id;
  perform public.write_notification_event(p_notification_id,auth.uid(),'marked_unread',auth.uid(),p_request_id,'{}'::jsonb);
end;
$$;

create or replace function public.dismiss_notification(p_notification_id uuid,p_request_id uuid default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.notifications%rowtype;
begin
  select * into v_row from public.notifications where id=p_notification_id and recipient_user_id=auth.uid() for update;
  if not found then raise exception 'NOTIFICATION_NOT_FOUND'; end if;
  if v_row.status in ('resolved','archived') then raise exception 'NOTIFICATION_INVALID_STATUS'; end if;
  update public.notifications set status='dismissed',dismissed_at=now(),updated_at=now() where id=p_notification_id;
  perform public.write_notification_event(p_notification_id,auth.uid(),'dismissed',auth.uid(),p_request_id,'{}'::jsonb);
end;
$$;

create or replace function public.bulk_mark_notifications_read(p_notification_ids uuid[],p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer; v_id uuid;
begin
  if p_notification_ids is null or cardinality(p_notification_ids) not between 1 and 100
     or cardinality(p_notification_ids) <> (select count(distinct x) from unnest(p_notification_ids) x) then
    raise exception 'NOTIFICATION_BULK_SELECTION_INVALID';
  end if;
  perform 1 from public.notifications n where n.id=any(p_notification_ids) order by n.id for update;
  select count(*) into v_count from public.notifications n where n.id=any(p_notification_ids) and n.recipient_user_id=auth.uid() and n.status not in ('resolved','archived');
  if v_count <> cardinality(p_notification_ids) then raise exception 'NOTIFICATION_BULK_SELECTION_INVALID'; end if;
  update public.notifications set status='read',read_at=coalesce(read_at,now()),updated_at=now() where id=any(p_notification_ids);
  foreach v_id in array p_notification_ids loop
    perform public.write_notification_event(v_id,auth.uid(),'read',auth.uid(),p_request_id,'{}'::jsonb);
  end loop;
  return v_count;
end;
$$;

create or replace function public.bulk_dismiss_notifications(p_notification_ids uuid[],p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer; v_id uuid;
begin
  if p_notification_ids is null or cardinality(p_notification_ids) not between 1 and 100
     or cardinality(p_notification_ids) <> (select count(distinct x) from unnest(p_notification_ids) x) then
    raise exception 'NOTIFICATION_BULK_SELECTION_INVALID';
  end if;
  perform 1 from public.notifications n where n.id=any(p_notification_ids) order by n.id for update;
  select count(*) into v_count from public.notifications n where n.id=any(p_notification_ids) and n.recipient_user_id=auth.uid() and n.status not in ('resolved','archived');
  if v_count <> cardinality(p_notification_ids) then raise exception 'NOTIFICATION_BULK_SELECTION_INVALID'; end if;
  update public.notifications set status='dismissed',dismissed_at=now(),updated_at=now() where id=any(p_notification_ids);
  foreach v_id in array p_notification_ids loop
    perform public.write_notification_event(v_id,auth.uid(),'dismissed',auth.uid(),p_request_id,'{}'::jsonb);
  end loop;
  return v_count;
end;
$$;

create or replace function public.list_notification_rules()
returns table(id uuid,type_code text,module text,enabled boolean,initial_delay_days integer,repeat_interval_days integer,escalation_after_days integer,lead_time_days integer,retention_days integer,version integer,updated_at timestamptz,updated_by_name text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.id,r.type_code,r.module,r.enabled,r.initial_delay_days,r.repeat_interval_days,r.escalation_after_days,r.lead_time_days,r.retention_days,r.version,r.updated_at,
         nullif(btrim(coalesce(p.display_name,'') || case when p.display_name is null then btrim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) else '' end),'')
  from public.notification_rules r left join public.profiles p on p.id=r.updated_by
  where public.is_hr_admin()
  order by r.module,r.type_code
$$;

create or replace function public.update_notification_rule(
  p_type_code text,p_enabled boolean,p_initial_delay_days integer,p_repeat_interval_days integer,
  p_escalation_after_days integer,p_lead_time_days integer,p_retention_days integer,
  p_expected_version integer,p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_rule public.notification_rules%rowtype;
begin
  if not public.is_super_admin() then raise exception 'NOTIFICATION_PERMISSION_DENIED'; end if;
  select * into v_rule from public.notification_rules where type_code=p_type_code for update;
  if not found or v_rule.version<>p_expected_version then raise exception 'NOTIFICATION_INVALID_RULE'; end if;
  if p_repeat_interval_days<1 or p_retention_days not between 1 and 3650
     or coalesce(p_initial_delay_days,0)<0 or coalesce(p_escalation_after_days,0)<0 or coalesce(p_lead_time_days,0)<0 then raise exception 'NOTIFICATION_INVALID_RULE'; end if;
  if p_type_code in ('attendance_exception','leave_approval_pending','overtime_approval_pending','document_review_pending') and (p_initial_delay_days is null or p_escalation_after_days is null) then raise exception 'NOTIFICATION_INVALID_RULE'; end if;
  if p_type_code='document_expiring' and (p_lead_time_days is null or p_escalation_after_days is null) then raise exception 'NOTIFICATION_INVALID_RULE'; end if;
  if p_type_code='document_expired' and p_escalation_after_days is null then raise exception 'NOTIFICATION_INVALID_RULE'; end if;
  update public.notification_rules set enabled=p_enabled,initial_delay_days=p_initial_delay_days,repeat_interval_days=p_repeat_interval_days,
    escalation_after_days=p_escalation_after_days,lead_time_days=p_lead_time_days,retention_days=p_retention_days,
    version=version+1,updated_by=auth.uid(),updated_at=now() where id=v_rule.id;
  perform public.write_notification_event(null,null,'rule_changed',auth.uid(),p_request_id,jsonb_build_object('type_code',p_type_code,'version',p_expected_version+1));
end;
$$;

create or replace function public.reset_notification_rules_to_defaults(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_type text;
begin
  if not public.is_super_admin() then raise exception 'NOTIFICATION_PERMISSION_DENIED'; end if;
  perform 1 from public.notification_rules order by type_code for update;
  update public.notification_rules set
    enabled=true,
    initial_delay_days=case type_code when 'attendance_exception' then 1 when 'leave_approval_pending' then 1 when 'overtime_approval_pending' then 1 when 'document_review_pending' then 2 when 'document_expiring' then null when 'document_expired' then 0 end,
    repeat_interval_days=1,
    escalation_after_days=case type_code when 'attendance_exception' then 3 when 'leave_approval_pending' then 3 when 'overtime_approval_pending' then 3 when 'document_review_pending' then 5 when 'document_expiring' then 7 when 'document_expired' then 3 end,
    lead_time_days=case when type_code='document_expiring' then 30 else null end,
    retention_days=90,version=version+1,updated_by=auth.uid(),updated_at=now();
  for v_type in select type_code from public.notification_rules loop
    perform public.write_notification_event(null,null,'rule_reset',auth.uid(),p_request_id,jsonb_build_object('type_code',v_type));
  end loop;
end;
$$;

create or replace function public.get_notification_cycle_status(p_limit integer default 10)
returns table(id uuid,run_date date,run_source text,status text,started_at timestamptz,completed_at timestamptz,created_count integer,reminded_count integer,escalated_count integer,resolved_count integer,archived_count integer,error_code text,safe_error_message text,rule_results jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.id,r.run_date,r.run_source,r.status,r.started_at,r.completed_at,r.created_count,r.reminded_count,r.escalated_count,r.resolved_count,r.archived_count,r.error_code,r.safe_error_message,r.rule_results
  from public.notification_cycle_runs r where public.is_hr_admin() order by r.started_at desc limit least(greatest(coalesce(p_limit,10),1),50)
$$;

-- Module processors. They use safe, broad context only.
create or replace function public.process_attendance_notifications(
  p_run_id uuid,
  p_rule jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  u record;
  v_result jsonb;
  v_age integer;
  v_initial integer := coalesce((p_rule ->> 'initial_delay_days')::integer, 1);
  v_escalation integer := coalesce((p_rule ->> 'escalation_after_days')::integer, 3);
  v_repeat integer := coalesce((p_rule ->> 'repeat_interval_days')::integer, 1);
  v_created integer := 0;
  v_reminded integer := 0;
  v_escalated integer := 0;
begin
  for r in
    select
      a.id,
      a.employee_id,
      a.attendance_date,
      a.request_type,
      a.created_at,
      employee.profile_id as employee_profile_id,
      manager.profile_id as manager_profile_id,
      btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
    from public.attendance_correction_requests a
    join public.employees employee on employee.id = a.employee_id
    left join public.employees manager on manager.id = employee.manager_id
    where a.status = 'pending'
      and employee.archived_at is null
      and a.created_at <= now() - make_interval(days => v_initial)
  loop
    v_age := greatest(0, current_date - r.created_at::date);

    if r.employee_profile_id is not null then
      v_result := public.upsert_safe_notification(
        r.employee_profile_id,
        'attendance_exception',
        'Attendance correction pending',
        'Your attendance correction request is still pending.',
        'attendance',
        'normal',
        'attendance_correction',
        r.id,
        r.id::text,
        r.employee_id,
        jsonb_build_object(
          'employee_name', r.employee_name,
          'attendance_date', r.attendance_date,
          'request_type', r.request_type
        ),
        '/attendance/corrections',
        0,
        r.created_at + make_interval(days => v_initial),
        v_repeat,
        p_run_id
      );
      v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
      v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
      v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
    end if;

    if r.manager_profile_id is not null then
      if v_age >= v_escalation then
        v_result := public.upsert_safe_notification(
          r.manager_profile_id,
          'attendance_exception',
          'Team attendance correction pending',
          'A direct-report attendance correction needs attention.',
          'attendance',
          'high',
          'attendance_correction',
          r.id,
          r.id::text,
          r.employee_id,
          jsonb_build_object(
            'employee_name', r.employee_name,
            'attendance_date', r.attendance_date,
            'request_type', r.request_type
          ),
          '/admin/attendance/corrections',
          1,
          r.created_at + make_interval(days => v_escalation),
          v_repeat,
          p_run_id
        );
        v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
        v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
        v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
      end if;

      if v_age >= v_escalation * 2 then
        for u in select id from public.profiles where role = 'hr_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'attendance_exception', 'Attendance correction escalated',
            'An unresolved attendance correction requires HR attention.',
            'attendance', 'high', 'attendance_correction', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date,
              'request_type', r.request_type
            ),
            '/admin/attendance/corrections', 2,
            r.created_at + make_interval(days => v_escalation * 2),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;

      if v_age >= v_escalation * 3 then
        for u in select id from public.profiles where role = 'super_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'attendance_exception', 'Attendance correction requires escalation',
            'An attendance correction remains unresolved.',
            'attendance', 'urgent', 'attendance_correction', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date,
              'request_type', r.request_type
            ),
            '/admin/attendance/corrections', 3,
            r.created_at + make_interval(days => v_escalation * 3),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    else
      if v_age >= v_escalation then
        for u in select id from public.profiles where role = 'hr_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'attendance_exception', 'Attendance correction escalated',
            'An unresolved attendance correction requires HR attention.',
            'attendance', 'high', 'attendance_correction', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date,
              'request_type', r.request_type
            ),
            '/admin/attendance/corrections', 1,
            r.created_at + make_interval(days => v_escalation),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;

      if v_age >= v_escalation * 2 then
        for u in select id from public.profiles where role = 'super_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'attendance_exception', 'Attendance correction requires escalation',
            'An attendance correction remains unresolved.',
            'attendance', 'urgent', 'attendance_correction', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date,
              'request_type', r.request_type
            ),
            '/admin/attendance/corrections', 2,
            r.created_at + make_interval(days => v_escalation * 2),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'succeeded',
    'created', v_created,
    'reminded', v_reminded,
    'escalated', v_escalated,
    'resolved', 0
  );
end;
$$;

create or replace function public.process_leave_notifications(
  p_run_id uuid,
  p_rule jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  u record;
  v_result jsonb;
  v_age integer;
  v_initial integer := coalesce((p_rule ->> 'initial_delay_days')::integer, 1);
  v_repeat integer := coalesce((p_rule ->> 'repeat_interval_days')::integer, 1);
  v_escalation integer := coalesce((p_rule ->> 'escalation_after_days')::integer, 3);
  v_created integer := 0;
  v_reminded integer := 0;
  v_escalated integer := 0;
begin
  for r in
    select
      request_group.id,
      request_group.employee_id,
      request_group.updated_at,
      request_revision.start_date,
      request_revision.end_date,
      employee.manager_id,
      employee.profile_id as employee_profile_id,
      manager.profile_id as manager_profile_id,
      btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name,
      coalesce(leave_type.name, 'Leave') as leave_type
    from public.leave_request_groups request_group
    join public.leave_request_revisions request_revision
      on request_revision.id = request_group.active_revision_id
    join public.employees employee on employee.id = request_group.employee_id
    left join public.employees manager on manager.id = employee.manager_id
    left join public.leave_type_versions leave_type
      on leave_type.id = request_revision.leave_type_version_id
    where request_group.current_status = 'pending'
      and employee.archived_at is null
      and request_group.updated_at <= now() - make_interval(days => v_initial)
  loop
    v_age := greatest(0, current_date - r.updated_at::date);

    if r.manager_profile_id is not null then
      v_result := public.upsert_safe_notification(
        r.manager_profile_id, 'leave_approval_pending', 'Leave approval pending',
        'A direct-report leave request needs review.',
        'leave', 'high', 'leave_request_group', r.id, r.id::text,
        r.employee_id,
        jsonb_build_object(
          'employee_name', r.employee_name,
          'start_date', r.start_date,
          'end_date', r.end_date,
          'leave_type', r.leave_type
        ),
        '/admin/leave', 0,
        r.updated_at + make_interval(days => v_initial),
        v_repeat, p_run_id
      );
      v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
      v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
      v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;

      if v_age >= v_escalation then
        for u in select id from public.profiles where role = 'hr_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'leave_approval_pending', 'Leave approval escalated',
            'A leave request remains pending.',
            'leave', 'high', 'leave_request_group', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'start_date', r.start_date,
              'end_date', r.end_date,
              'leave_type', r.leave_type
            ),
            '/admin/leave', 1,
            r.updated_at + make_interval(days => v_escalation),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;

      if v_age >= v_escalation * 2 then
        for u in select id from public.profiles where role = 'super_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'leave_approval_pending', 'Leave approval requires escalation',
            'A leave request remains unresolved.',
            'leave', 'urgent', 'leave_request_group', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'start_date', r.start_date,
              'end_date', r.end_date,
              'leave_type', r.leave_type
            ),
            '/admin/leave', 2,
            r.updated_at + make_interval(days => v_escalation * 2),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    else
      for u in select id from public.profiles where role = 'hr_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
        v_result := public.upsert_safe_notification(
          u.id, 'leave_approval_pending', 'Leave approval pending',
          'A leave request needs review.',
          'leave', 'high', 'leave_request_group', r.id, r.id::text,
          r.employee_id,
          jsonb_build_object(
            'employee_name', r.employee_name,
            'start_date', r.start_date,
            'end_date', r.end_date,
            'leave_type', r.leave_type
          ),
          '/admin/leave', 0,
          r.updated_at + make_interval(days => v_initial),
          v_repeat, p_run_id
        );
        v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
        v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
        v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
      end loop;

      if v_age >= v_escalation then
        for u in select id from public.profiles where role = 'super_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'leave_approval_pending', 'Leave approval requires escalation',
            'A leave request remains unresolved.',
            'leave', 'urgent', 'leave_request_group', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'start_date', r.start_date,
              'end_date', r.end_date,
              'leave_type', r.leave_type
            ),
            '/admin/leave', 1,
            r.updated_at + make_interval(days => v_escalation),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'succeeded',
    'created', v_created,
    'reminded', v_reminded,
    'escalated', v_escalated,
    'resolved', 0
  );
end;
$$;

create or replace function public.process_overtime_notifications(
  p_run_id uuid,
  p_rule jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  u record;
  v_result jsonb;
  v_age integer;
  v_initial integer := coalesce((p_rule ->> 'initial_delay_days')::integer, 1);
  v_repeat integer := coalesce((p_rule ->> 'repeat_interval_days')::integer, 1);
  v_escalation integer := coalesce((p_rule ->> 'escalation_after_days')::integer, 3);
  v_created integer := 0;
  v_reminded integer := 0;
  v_escalated integer := 0;
begin
  for r in
    select
      item.id,
      item.created_at,
      detection_group.employee_id,
      detection_group.attendance_date,
      employee.profile_id as employee_profile_id,
      manager.profile_id as manager_profile_id,
      btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
    from public.overtime_approval_items item
    join public.overtime_detection_revisions detection_revision
      on detection_revision.id = item.detection_revision_id
    join public.overtime_detection_groups detection_group
      on detection_group.id = detection_revision.detection_group_id
    join public.employees employee on employee.id = detection_group.employee_id
    left join public.employees manager on manager.id = employee.manager_id
    where item.status = 'pending'
      and item.superseded_at is null
      and employee.archived_at is null
      and item.created_at <= now() - make_interval(days => v_initial)
  loop
    v_age := greatest(0, current_date - r.created_at::date);

    if r.manager_profile_id is not null then
      v_result := public.upsert_safe_notification(
        r.manager_profile_id, 'overtime_approval_pending', 'Overtime approval pending',
        'A direct-report overtime item needs review.',
        'overtime', 'high', 'overtime_approval_item', r.id, r.id::text,
        r.employee_id,
        jsonb_build_object(
          'employee_name', r.employee_name,
          'attendance_date', r.attendance_date
        ),
        '/admin/overtime', 0,
        r.created_at + make_interval(days => v_initial),
        v_repeat, p_run_id
      );
      v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
      v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
      v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;

      if v_age >= v_escalation then
        for u in select id from public.profiles where role = 'hr_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'overtime_approval_pending', 'Overtime approval escalated',
            'An overtime approval remains pending.',
            'overtime', 'high', 'overtime_approval_item', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date
            ),
            '/admin/overtime', 1,
            r.created_at + make_interval(days => v_escalation),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;

      if v_age >= v_escalation * 2 then
        for u in select id from public.profiles where role = 'super_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'overtime_approval_pending', 'Overtime approval requires escalation',
            'An overtime approval remains unresolved.',
            'overtime', 'urgent', 'overtime_approval_item', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date
            ),
            '/admin/overtime', 2,
            r.created_at + make_interval(days => v_escalation * 2),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    else
      for u in select id from public.profiles where role = 'hr_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
        v_result := public.upsert_safe_notification(
          u.id, 'overtime_approval_pending', 'Overtime approval pending',
          'An overtime item needs review.',
          'overtime', 'high', 'overtime_approval_item', r.id, r.id::text,
          r.employee_id,
          jsonb_build_object(
            'employee_name', r.employee_name,
            'attendance_date', r.attendance_date
          ),
          '/admin/overtime', 0,
          r.created_at + make_interval(days => v_initial),
          v_repeat, p_run_id
        );
        v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
        v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
        v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
      end loop;

      if v_age >= v_escalation then
        for u in select id from public.profiles where role = 'super_admin' and (r.employee_profile_id is null or id <> r.employee_profile_id) loop
          v_result := public.upsert_safe_notification(
            u.id, 'overtime_approval_pending', 'Overtime approval requires escalation',
            'An overtime approval remains unresolved.',
            'overtime', 'urgent', 'overtime_approval_item', r.id, r.id::text,
            r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'attendance_date', r.attendance_date
            ),
            '/admin/overtime', 1,
            r.created_at + make_interval(days => v_escalation),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'succeeded',
    'created', v_created,
    'reminded', v_reminded,
    'escalated', v_escalated,
    'resolved', 0
  );
end;
$$;

create or replace function public.process_document_notifications(
  p_run_id uuid,
  p_rule jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  u record;
  v_result jsonb;
  v_type text := p_rule ->> 'type_code';
  v_initial integer := coalesce((p_rule ->> 'initial_delay_days')::integer, 0);
  v_repeat integer := coalesce((p_rule ->> 'repeat_interval_days')::integer, 1);
  v_escalation integer := coalesce((p_rule ->> 'escalation_after_days')::integer, 3);
  v_lead integer := coalesce((p_rule ->> 'lead_time_days')::integer, 30);
  v_age integer;
  v_reviewer_count integer;
  v_created integer := 0;
  v_reminded integer := 0;
  v_escalated integer := 0;
begin
  if v_type = 'document_review_pending' then
    for r in
      select
        version.id as version_id,
        document.id as document_id,
        document.employee_id,
        version.submitted_at,
        employee.profile_id as employee_profile_id,
        btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
      from public.employee_document_versions version
      join public.employee_documents document on document.id = version.document_id
      join public.employees employee on employee.id = document.employee_id
      where version.review_status = 'pending_review'
        and document.archived_at is null
        and employee.archived_at is null
        and version.submitted_at <= now() - make_interval(days => v_initial)
    loop
      v_age := greatest(0, current_date - r.submitted_at::date);

      select count(*)::integer
      into v_reviewer_count
      from public.profiles p
      where p.role = 'hr_admin'
        and (r.employee_profile_id is null or p.id <> r.employee_profile_id)
        and exists (
          select 1
          from public.document_permission_grants grant_row
          where grant_row.user_id = p.id
            and grant_row.permission_code = 'documents.review'
            and grant_row.revoked_at is null
        );

      if v_reviewer_count > 0 then
        for u in
          select p.id
          from public.profiles p
          where p.role = 'hr_admin'
            and (r.employee_profile_id is null or p.id <> r.employee_profile_id)
            and exists (
              select 1
              from public.document_permission_grants grant_row
              where grant_row.user_id = p.id
                and grant_row.permission_code = 'documents.review'
                and grant_row.revoked_at is null
            )
        loop
          v_result := public.upsert_safe_notification(
            u.id, 'document_review_pending', 'Document review pending',
            'An employee document is ready for review.',
            'documents', 'high', 'employee_document_version',
            r.version_id, r.version_id::text, r.employee_id,
            jsonb_build_object('employee_name', r.employee_name),
            '/admin/documents/review', 0,
            r.submitted_at + make_interval(days => v_initial),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;

        if v_age >= v_escalation then
          for u in
            select p.id
            from public.profiles p
            where p.role = 'super_admin'
              and (r.employee_profile_id is null or p.id <> r.employee_profile_id)
          loop
            v_result := public.upsert_safe_notification(
              u.id, 'document_review_pending', 'Document review escalated',
              'An employee document review remains pending.',
              'documents', 'urgent', 'employee_document_version',
              r.version_id, r.version_id::text, r.employee_id,
              jsonb_build_object('employee_name', r.employee_name),
              '/admin/documents/review', 1,
              r.submitted_at + make_interval(days => v_escalation),
              v_repeat, p_run_id
            );
            v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
            v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
            v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
          end loop;
        end if;
      else
        for u in
          select p.id
          from public.profiles p
          where p.role = 'super_admin'
            and (r.employee_profile_id is null or p.id <> r.employee_profile_id)
        loop
          v_result := public.upsert_safe_notification(
            u.id, 'document_review_pending', 'Document review pending',
            'An employee document is ready for review.',
            'documents', 'high', 'employee_document_version',
            r.version_id, r.version_id::text, r.employee_id,
            jsonb_build_object('employee_name', r.employee_name),
            '/admin/documents/review', 0,
            r.submitted_at + make_interval(days => v_initial),
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end loop;
      end if;
    end loop;
  elsif v_type in ('document_expiring', 'document_expired') then
    for r in
      select
        document.id as document_id,
        document.employee_id,
        version.id as version_id,
        version.expiration_date,
        employee.profile_id as employee_profile_id,
        manager.profile_id as manager_profile_id,
        btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
      from public.employee_documents document
      join public.employee_document_versions version on version.id = document.active_version_id
      join public.employees employee on employee.id = document.employee_id
      left join public.employees manager on manager.id = employee.manager_id
      where document.archived_at is null
        and employee.archived_at is null
        and version.review_status = 'approved'
        and version.expiration_date is not null
        and (
          (v_type = 'document_expiring'
            and version.expiration_date between current_date and current_date + v_lead)
          or (v_type = 'document_expired' and version.expiration_date < current_date)
        )
    loop
      v_age := case
        when v_type = 'document_expired' then current_date - r.expiration_date
        else v_lead - (r.expiration_date - current_date)
      end;

      if r.employee_profile_id is not null then
        v_result := public.upsert_safe_notification(
          r.employee_profile_id,
          v_type,
          case when v_type = 'document_expired' then 'Document expired' else 'Document expiring soon' end,
          case when v_type = 'document_expired' then 'A required document has expired.' else 'A required document will expire soon.' end,
          'documents',
          case when v_type = 'document_expired' then 'urgent' else 'high' end,
          'employee_document',
          r.document_id,
          r.document_id::text,
          r.employee_id,
          jsonb_build_object(
            'employee_name', r.employee_name,
            'expiration_date', r.expiration_date
          ),
          '/documents',
          0,
          case
            when v_type = 'document_expired' then r.expiration_date::timestamptz
            else (r.expiration_date - v_lead)::timestamptz
          end,
          v_repeat,
          p_run_id
        );
        v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
        v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
        v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
      end if;

      if v_type = 'document_expiring' then
        if r.expiration_date <= current_date + v_escalation
           and r.manager_profile_id is not null then
          v_result := public.upsert_safe_notification(
            r.manager_profile_id, v_type, 'Team document compliance alert',
            'A direct report has a document compliance issue.',
            'documents', 'high', 'employee_document',
            r.document_id, r.document_id::text, r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'compliance_status', 'expiring_soon'
            ),
            '/notifications', 1,
            (r.expiration_date - v_escalation)::timestamptz,
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end if;
      elsif r.manager_profile_id is not null then
        if v_age >= v_escalation then
          v_result := public.upsert_safe_notification(
            r.manager_profile_id, v_type, 'Team document compliance alert',
            'A direct report has a document compliance issue.',
            'documents', 'high', 'employee_document',
            r.document_id, r.document_id::text, r.employee_id,
            jsonb_build_object(
              'employee_name', r.employee_name,
              'compliance_status', 'expired'
            ),
            '/notifications', 1,
            (r.expiration_date + v_escalation)::timestamptz,
            v_repeat, p_run_id
          );
          v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
          v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
          v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
        end if;

        if v_age >= v_escalation * 2 then
          for u in select id from public.profiles where role = 'hr_admin' loop
            v_result := public.upsert_safe_notification(
              u.id, v_type, 'Document compliance escalated',
              'An employee document remains expired.',
              'documents', 'urgent', 'employee_document',
              r.document_id, r.document_id::text, r.employee_id,
              jsonb_build_object(
                'employee_name', r.employee_name,
                'compliance_status', 'expired'
              ),
              '/admin/documents/review', 2,
              (r.expiration_date + v_escalation * 2)::timestamptz,
              v_repeat, p_run_id
            );
            v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
            v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
            v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
          end loop;
        end if;

        if v_age >= v_escalation * 3 then
          for u in select id from public.profiles where role = 'super_admin' loop
            v_result := public.upsert_safe_notification(
              u.id, v_type, 'Document compliance requires escalation',
              'An employee document remains expired.',
              'documents', 'urgent', 'employee_document',
              r.document_id, r.document_id::text, r.employee_id,
              jsonb_build_object(
                'employee_name', r.employee_name,
                'compliance_status', 'expired'
              ),
              '/admin/documents/review', 3,
              (r.expiration_date + v_escalation * 3)::timestamptz,
              v_repeat, p_run_id
            );
            v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
            v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
            v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
          end loop;
        end if;
      else
        if v_age >= v_escalation then
          for u in select id from public.profiles where role = 'hr_admin' loop
            v_result := public.upsert_safe_notification(
              u.id, v_type, 'Document compliance escalated',
              'An employee document remains expired.',
              'documents', 'urgent', 'employee_document',
              r.document_id, r.document_id::text, r.employee_id,
              jsonb_build_object(
                'employee_name', r.employee_name,
                'compliance_status', 'expired'
              ),
              '/admin/documents/review', 1,
              (r.expiration_date + v_escalation)::timestamptz,
              v_repeat, p_run_id
            );
            v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
            v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
            v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
          end loop;
        end if;

        if v_age >= v_escalation * 2 then
          for u in select id from public.profiles where role = 'super_admin' loop
            v_result := public.upsert_safe_notification(
              u.id, v_type, 'Document compliance requires escalation',
              'An employee document remains expired.',
              'documents', 'urgent', 'employee_document',
              r.document_id, r.document_id::text, r.employee_id,
              jsonb_build_object(
                'employee_name', r.employee_name,
                'compliance_status', 'expired'
              ),
              '/admin/documents/review', 2,
              (r.expiration_date + v_escalation * 2)::timestamptz,
              v_repeat, p_run_id
            );
            v_created := v_created + case when coalesce((v_result ->> 'created')::boolean, false) then 1 else 0 end;
            v_reminded := v_reminded + case when coalesce((v_result ->> 'reminded')::boolean, false) then 1 else 0 end;
            v_escalated := v_escalated + case when coalesce((v_result ->> 'escalated')::boolean, false) then 1 else 0 end;
          end loop;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'status', 'succeeded',
    'created', v_created,
    'reminded', v_reminded,
    'escalated', v_escalated,
    'resolved', 0
  );
end;
$$;

create or replace function public.resolve_stale_notifications(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select n.id, n.recipient_user_id
    from public.notifications n
    where n.status in ('unread', 'read', 'dismissed')
      and (
        (
          n.resource_type = 'attendance_correction'
          and not exists (
            select 1
            from public.attendance_correction_requests request
            where request.id = n.resource_id
              and request.status = 'pending'
          )
        )
        or (
          n.resource_type = 'leave_request_group'
          and not exists (
            select 1
            from public.leave_request_groups request_group
            where request_group.id = n.resource_id
              and request_group.current_status = 'pending'
          )
        )
        or (
          n.resource_type = 'overtime_approval_item'
          and not exists (
            select 1
            from public.overtime_approval_items item
            where item.id = n.resource_id
              and item.status = 'pending'
          )
        )
        or (
          n.resource_type = 'employee_document_version'
          and not exists (
            select 1
            from public.employee_document_versions version
            where version.id = n.resource_id
              and version.review_status = 'pending_review'
          )
        )
        or (
          n.resource_type = 'employee_document'
          and n.type = 'document_expiring'
          and not exists (
            select 1
            from public.employee_documents document
            join public.employee_document_versions version
              on version.id = document.active_version_id
            where document.id = n.resource_id
              and document.archived_at is null
              and version.review_status = 'approved'
              and version.expiration_date between current_date and current_date + coalesce(
                (
                  select rule.lead_time_days
                  from public.notification_rules rule
                  where rule.type_code = 'document_expiring'
                ),
                30
              )
          )
        )
        or (
          n.resource_type = 'employee_document'
          and n.type = 'document_expired'
          and not exists (
            select 1
            from public.employee_documents document
            join public.employee_document_versions version
              on version.id = document.active_version_id
            where document.id = n.resource_id
              and document.archived_at is null
              and version.review_status = 'approved'
              and version.expiration_date < current_date
          )
        )
      )
    order by n.id
    for update
  loop
    update public.notifications
    set status = 'resolved',
        resolved_at = now(),
        updated_at = now()
    where id = r.id;

    perform public.write_notification_event(
      r.id,
      r.recipient_user_id,
      'resolved',
      null,
      p_run_id,
      '{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.archive_resolved_notifications(p_run_id uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare r record; c integer:=0;
begin
  for r in select n.id,n.recipient_user_id from public.notifications n left join public.notification_rules rule on rule.type_code=n.type where n.status='resolved' and n.resolved_at < now()-make_interval(days=>coalesce(rule.retention_days,90)) for update loop
    update public.notifications set status='archived',archived_at=now(),updated_at=now() where id=r.id;
    perform public.write_notification_event(r.id,r.recipient_user_id,'archived',null,p_run_id,'{}'::jsonb); c:=c+1;
  end loop; return c;
end $$;

create or replace function public.run_daily_notification_cycle(
  p_run_source text default 'scheduled',
  p_actor uuid default null,
  p_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run uuid := gen_random_uuid();
  r record;
  result jsonb;
  rules jsonb := '{}'::jsonb;
  created_total integer := 0;
  reminded_total integer := 0;
  escalated_total integer := 0;
  resolved_total integer := 0;
  archived_total integer := 0;
  failed_total integer := 0;
begin
  if p_run_source not in ('scheduled', 'manual') then
    raise exception 'NOTIFICATION_CYCLE_FAILED';
  end if;
  if p_run_source = 'manual' and (p_actor is null or p_request_id is null) then
    raise exception 'NOTIFICATION_CYCLE_FAILED';
  end if;
  if not pg_try_advisory_xact_lock(hashtext('hris-daily-notification-cycle')) then
    raise exception 'NOTIFICATION_CYCLE_ALREADY_RUNNING';
  end if;

  insert into public.notification_cycle_runs(
    id, run_source, status, actor_user_id, request_id
  ) values (
    v_run, p_run_source, 'running', p_actor, p_request_id
  );

  begin
    for r in
      select *
      from public.notification_rules
      where enabled
      order by type_code
    loop
      begin
        if r.module = 'attendance' then
          result := public.process_attendance_notifications(v_run, to_jsonb(r));
        elsif r.module = 'leave' then
          result := public.process_leave_notifications(v_run, to_jsonb(r));
        elsif r.module = 'overtime' then
          result := public.process_overtime_notifications(v_run, to_jsonb(r));
        else
          result := public.process_document_notifications(v_run, to_jsonb(r));
        end if;

        rules := rules || jsonb_build_object(r.type_code, result);
        created_total := created_total + coalesce((result ->> 'created')::integer, 0);
        reminded_total := reminded_total + coalesce((result ->> 'reminded')::integer, 0);
        escalated_total := escalated_total + coalesce((result ->> 'escalated')::integer, 0);
      exception when others then
        failed_total := failed_total + 1;
        rules := rules || jsonb_build_object(
          r.type_code,
          jsonb_build_object(
            'status', 'failed',
            'created', 0,
            'reminded', 0,
            'escalated', 0,
            'resolved', 0,
            'errorCode', 'NOTIFICATION_RULE_PROCESSING_FAILED'
          )
        );
      end;
    end loop;

    resolved_total := public.resolve_stale_notifications(v_run);
    archived_total := public.archive_resolved_notifications(v_run);

    update public.notification_cycle_runs
    set completed_at = now(),
        status = case
          when failed_total = 0 then 'succeeded'
          when failed_total < (select count(*) from public.notification_rules where enabled) then 'partial_failed'
          else 'failed'
        end,
        created_count = created_total,
        reminded_count = reminded_total,
        escalated_count = escalated_total,
        resolved_count = resolved_total,
        archived_count = archived_total,
        error_code = case when failed_total > 0 then 'NOTIFICATION_RULE_PROCESSING_FAILED' end,
        safe_error_message = case when failed_total > 0 then 'One or more notification rules could not be processed.' end,
        rule_results = rules
    where id = v_run;
  exception when others then
    update public.notification_cycle_runs
    set status = 'failed',
        completed_at = now(),
        error_code = 'NOTIFICATION_CYCLE_FAILED',
        safe_error_message = 'The notification cycle could not be completed.'
    where id = v_run;
  end;

  return v_run;
end;
$$;

create or replace function public.run_notification_cycle_now(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing uuid;
begin
  if not public.is_super_admin() then
    raise exception 'NOTIFICATION_PERMISSION_DENIED';
  end if;
  if p_request_id is null then
    raise exception 'NOTIFICATION_INVALID_PAYLOAD';
  end if;

  select id
  into v_existing
  from public.notification_cycle_runs
  where run_source = 'manual'
    and actor_user_id = auth.uid()
    and request_id = p_request_id;

  if v_existing is not null then
    return v_existing;
  end if;

  return public.run_daily_notification_cycle('manual', auth.uid(), p_request_id);
end;
$$;

-- Immediate workflow triggers.
create or replace function public.notify_attendance_correction_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  emp record;
  v_manager_profile_id uuid;
  v_hr_count integer := 0;
  v_became_pending boolean := false;
  u record;
begin
  v_became_pending := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_became_pending := old.status is distinct from new.status;
  end if;

  select
    employee.*,
    btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
  into emp
  from public.employees employee
  where employee.id = new.employee_id;

  if new.status = 'pending' and v_became_pending then
    if emp.profile_id is not null then
      perform public.upsert_safe_notification(
        emp.profile_id,
        'attendance_request_received',
        'Attendance correction received',
        'Your attendance correction request was received.',
        'attendance',
        'info',
        'attendance_correction',
        new.id,
        new.id::text,
        new.employee_id,
        jsonb_build_object(
          'attendance_date', new.attendance_date,
          'request_type', new.request_type
        ),
        '/attendance/corrections',
        0,
        now(),
        1,
        new.id
      );
    end if;

    if emp.manager_id is not null then
      select manager.profile_id
      into v_manager_profile_id
      from public.employees manager
      where manager.id = emp.manager_id
        and manager.archived_at is null;
    end if;

    if v_manager_profile_id is not null then
      perform public.upsert_safe_notification(
        v_manager_profile_id,
        'attendance_exception',
        'Attendance correction submitted',
        'A direct report submitted an attendance correction.',
        'attendance',
        'high',
        'attendance_correction',
        new.id,
        new.id::text,
        new.employee_id,
        jsonb_build_object(
          'employee_name', emp.employee_name,
          'attendance_date', new.attendance_date,
          'request_type', new.request_type
        ),
        '/admin/attendance/corrections',
        0,
        now(),
        1,
        new.id
      );
    else
      select count(*)::integer
      into v_hr_count
      from public.profiles
      where role = 'hr_admin'
        and (emp.profile_id is null or id <> emp.profile_id);

      if v_hr_count > 0 then
        for u in
          select id
          from public.profiles
          where role = 'hr_admin'
            and (emp.profile_id is null or id <> emp.profile_id)
        loop
          perform public.upsert_safe_notification(
            u.id, 'attendance_exception', 'Attendance correction submitted',
            'An attendance correction needs review.',
            'attendance', 'high', 'attendance_correction', new.id, new.id::text,
            new.employee_id,
            jsonb_build_object(
              'employee_name', emp.employee_name,
              'attendance_date', new.attendance_date,
              'request_type', new.request_type
            ),
            '/admin/attendance/corrections', 0, now(), 1, new.id
          );
        end loop;
      else
        for u in
          select id
          from public.profiles
          where role = 'super_admin'
            and (emp.profile_id is null or id <> emp.profile_id)
        loop
          perform public.upsert_safe_notification(
            u.id, 'attendance_exception', 'Attendance correction submitted',
            'An attendance correction needs review.',
            'attendance', 'high', 'attendance_correction', new.id, new.id::text,
            new.employee_id,
            jsonb_build_object(
              'employee_name', emp.employee_name,
              'attendance_date', new.attendance_date,
              'request_type', new.request_type
            ),
            '/admin/attendance/corrections', 0, now(), 1, new.id
          );
        end loop;
      end if;
    end if;
  elsif tg_op = 'UPDATE'
        and new.status in ('approved', 'rejected', 'cancelled')
        and old.status is distinct from new.status then
    perform public.resolve_notifications_for_resource(
      'attendance_correction',
      new.id,
      new.id
    );

    if emp.profile_id is not null then
      perform public.upsert_safe_notification(
        emp.profile_id,
        'attendance_request_decided',
        'Attendance correction updated',
        'Your attendance correction request is now ' || new.status || '.',
        'attendance',
        'normal',
        'attendance_correction',
        new.id,
        new.id::text || ':decision',
        new.employee_id,
        jsonb_build_object(
          'attendance_date', new.attendance_date,
          'status', new.status
        ),
        '/attendance/corrections',
        0,
        now(),
        1,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists attendance_correction_notification_trigger on public.attendance_correction_requests;
create trigger attendance_correction_notification_trigger
  after insert or update of status on public.attendance_correction_requests
  for each row execute function public.notify_attendance_correction_change();

create or replace function public.notify_leave_request_action()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_group record;
  emp record;
  v_manager_profile_id uuid;
  v_hr_count integer := 0;
  u record;
begin
  select *
  into request_group
  from public.leave_request_groups
  where id = new.request_group_id;

  select
    employee.*,
    btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
  into emp
  from public.employees employee
  where employee.id = request_group.employee_id;

  if new.action_type = 'submitted' then
    if emp.manager_id is not null then
      select manager.profile_id
      into v_manager_profile_id
      from public.employees manager
      where manager.id = emp.manager_id
        and manager.archived_at is null;
    end if;

    if v_manager_profile_id is not null then
      perform public.upsert_safe_notification(
        v_manager_profile_id, 'leave_approval_pending', 'Leave request submitted',
        'A direct-report leave request needs review.',
        'leave', 'high', 'leave_request_group', request_group.id,
        request_group.id::text, request_group.employee_id,
        jsonb_build_object('employee_name', emp.employee_name),
        '/admin/leave', 0, now(), 1, new.id
      );
    else
      select count(*)::integer
      into v_hr_count
      from public.profiles
      where role = 'hr_admin'
        and (emp.profile_id is null or id <> emp.profile_id);

      if v_hr_count > 0 then
        for u in
          select id
          from public.profiles
          where role = 'hr_admin'
            and (emp.profile_id is null or id <> emp.profile_id)
        loop
          perform public.upsert_safe_notification(
            u.id, 'leave_approval_pending', 'Leave request submitted',
            'A leave request needs review.',
            'leave', 'high', 'leave_request_group', request_group.id,
            request_group.id::text, request_group.employee_id,
            jsonb_build_object('employee_name', emp.employee_name),
            '/admin/leave', 0, now(), 1, new.id
          );
        end loop;
      else
        for u in
          select id
          from public.profiles
          where role = 'super_admin'
            and (emp.profile_id is null or id <> emp.profile_id)
        loop
          perform public.upsert_safe_notification(
            u.id, 'leave_approval_pending', 'Leave request submitted',
            'A leave request needs review.',
            'leave', 'high', 'leave_request_group', request_group.id,
            request_group.id::text, request_group.employee_id,
            jsonb_build_object('employee_name', emp.employee_name),
            '/admin/leave', 0, now(), 1, new.id
          );
        end loop;
      end if;
    end if;
  elsif new.action_type in ('approved', 'rejected', 'withdrawn', 'cancelled') then
    perform public.resolve_notifications_for_resource(
      'leave_request_group',
      request_group.id,
      new.id
    );

    if emp.profile_id is not null then
      perform public.upsert_safe_notification(
        emp.profile_id,
        'leave_request_decided',
        'Leave request updated',
        'Your leave request is now ' || new.to_status || '.',
        'leave',
        'normal',
        'leave_request_group',
        request_group.id,
        request_group.id::text || ':decision:' || new.id::text,
        request_group.employee_id,
        jsonb_build_object('status', new.to_status),
        '/employee/leave',
        0,
        now(),
        1,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists leave_request_action_notification_trigger on public.leave_request_actions;
create trigger leave_request_action_notification_trigger
  after insert on public.leave_request_actions
  for each row execute function public.notify_leave_request_action();

create or replace function public.notify_overtime_approval_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  detection_group record;
  emp record;
  v_manager_profile_id uuid;
  v_hr_count integer := 0;
  v_became_pending boolean := false;
  u record;
begin
  v_became_pending := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_became_pending := old.status is distinct from new.status;
  end if;

  select group_row.*
  into detection_group
  from public.overtime_detection_revisions revision
  join public.overtime_detection_groups group_row
    on group_row.id = revision.detection_group_id
  where revision.id = new.detection_revision_id;

  select
    employee.*,
    btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')) as employee_name
  into emp
  from public.employees employee
  where employee.id = detection_group.employee_id;

  if new.status = 'pending' and v_became_pending then
    if emp.manager_id is not null then
      select manager.profile_id
      into v_manager_profile_id
      from public.employees manager
      where manager.id = emp.manager_id
        and manager.archived_at is null;
    end if;

    if v_manager_profile_id is not null then
      perform public.upsert_safe_notification(
        v_manager_profile_id, 'overtime_approval_pending', 'Overtime item pending',
        'A direct-report overtime item needs review.',
        'overtime', 'high', 'overtime_approval_item', new.id, new.id::text,
        detection_group.employee_id,
        jsonb_build_object(
          'employee_name', emp.employee_name,
          'attendance_date', detection_group.attendance_date
        ),
        '/admin/overtime', 0, now(), 1, new.id
      );
    else
      select count(*)::integer
      into v_hr_count
      from public.profiles
      where role = 'hr_admin'
        and (emp.profile_id is null or id <> emp.profile_id);

      if v_hr_count > 0 then
        for u in
          select id
          from public.profiles
          where role = 'hr_admin'
            and (emp.profile_id is null or id <> emp.profile_id)
        loop
          perform public.upsert_safe_notification(
            u.id, 'overtime_approval_pending', 'Overtime item pending',
            'An overtime item needs review.',
            'overtime', 'high', 'overtime_approval_item', new.id, new.id::text,
            detection_group.employee_id,
            jsonb_build_object(
              'employee_name', emp.employee_name,
              'attendance_date', detection_group.attendance_date
            ),
            '/admin/overtime', 0, now(), 1, new.id
          );
        end loop;
      else
        for u in
          select id
          from public.profiles
          where role = 'super_admin'
            and (emp.profile_id is null or id <> emp.profile_id)
        loop
          perform public.upsert_safe_notification(
            u.id, 'overtime_approval_pending', 'Overtime item pending',
            'An overtime item needs review.',
            'overtime', 'high', 'overtime_approval_item', new.id, new.id::text,
            detection_group.employee_id,
            jsonb_build_object(
              'employee_name', emp.employee_name,
              'attendance_date', detection_group.attendance_date
            ),
            '/admin/overtime', 0, now(), 1, new.id
          );
        end loop;
      end if;
    end if;
  elsif tg_op = 'UPDATE'
        and new.status in ('approved', 'rejected', 'superseded')
        and old.status is distinct from new.status then
    perform public.resolve_notifications_for_resource(
      'overtime_approval_item',
      new.id,
      new.id
    );

    if emp.profile_id is not null then
      perform public.upsert_safe_notification(
        emp.profile_id,
        'overtime_request_decided',
        'Overtime status updated',
        'Your overtime item is now ' || new.status || '.',
        'overtime',
        'normal',
        'overtime_approval_item',
        new.id,
        new.id::text || ':decision',
        detection_group.employee_id,
        jsonb_build_object(
          'attendance_date', detection_group.attendance_date,
          'status', new.status
        ),
        '/overtime',
        0,
        now(),
        1,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists overtime_approval_notification_trigger on public.overtime_approval_items;
create trigger overtime_approval_notification_trigger
  after insert or update of status on public.overtime_approval_items
  for each row execute function public.notify_overtime_approval_change();

create or replace function public.notify_document_review_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.resolve_notifications_for_resource(
    'employee_document_version',
    new.document_version_id,
    new.id
  );
  return new;
end;
$$;
drop trigger if exists document_review_notification_trigger on public.document_reviews;
create trigger document_review_notification_trigger
  after insert on public.document_reviews
  for each row execute function public.notify_document_review_insert();

create or replace function public.create_document_notification(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_resource_type text,
  p_resource_id uuid,
  p_source_event_key text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_employee_profile_id uuid;
begin
  if p_type = 'document_submission_received'
     and p_resource_type = 'employee_document' then
    select employee.profile_id
    into v_employee_profile_id
    from public.employee_documents document
    join public.employees employee on employee.id = document.employee_id
    where document.id = p_resource_id;

    if p_recipient_user_id = v_employee_profile_id then
      return null;
    end if;
  end if;

  v_result := public.upsert_safe_notification(
    p_recipient_user_id,
    p_type,
    p_title,
    p_body,
    'documents',
    'normal',
    p_resource_type,
    p_resource_id,
    p_source_event_key,
    null,
    '{}'::jsonb,
    case
      when p_type = 'document_submission_received' then '/admin/documents/review'
      else '/documents'
    end,
    0,
    now(),
    1,
    null
  );
  return (v_result ->> 'id')::uuid;
end;
$$;

create or replace function public.get_notification_dashboard_summary(p_limit integer default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
  v_unread integer;
  v_urgent integer;
  v_active integer;
  v_resolved integer;
  v_cycle text;
begin
  select
    count(*) filter (where status = 'unread')::integer,
    count(*) filter (
      where priority = 'urgent'
        and status in ('unread', 'read', 'dismissed')
    )::integer,
    count(*) filter (
      where status in ('unread', 'read', 'dismissed')
    )::integer,
    count(*) filter (where status = 'resolved')::integer
  into v_unread, v_urgent, v_active, v_resolved
  from public.notifications
  where recipient_user_id = auth.uid();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'title', x.title,
        'module', x.module,
        'priority', x.priority,
        'actionUrl', x.action_url
      )
      order by x.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select id, title, module, priority, action_url, created_at
    from public.notifications
    where recipient_user_id = auth.uid()
      and status in ('unread', 'read')
    order by
      case priority
        when 'urgent' then 4
        when 'high' then 3
        when 'normal' then 2
        else 1
      end desc,
      created_at desc,
      id desc
    limit least(greatest(coalesce(p_limit, 5), 1), 10)
  ) x;

  if public.is_super_admin() then
    select status
    into v_cycle
    from public.notification_cycle_runs
    order by started_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'unreadCount', coalesce(v_unread, 0),
    'urgentCount', coalesce(v_urgent, 0),
    'activeCount', coalesce(v_active, 0),
    'resolvedCount', coalesce(v_resolved, 0),
    'items', v_items,
    'latestCycleStatus', v_cycle
  );
end;
$$;

-- Privilege hardening.
revoke all on function public.assert_safe_notification_payload(jsonb) from public,anon,authenticated;
revoke all on function public.validate_notification_action_url(text) from public,anon,authenticated;
revoke all on function public.guard_notification_row() from public,anon,authenticated;
revoke all on function public.prevent_notification_event_mutation() from public,anon,authenticated;
revoke all on function public.write_notification_event(uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.build_notification_source_event_key(text,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.upsert_safe_notification(uuid,text,text,text,text,text,text,uuid,text,uuid,jsonb,text,integer,timestamptz,integer,uuid) from public,anon,authenticated;
revoke all on function public.resolve_notifications_for_resource(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_attendance_notifications(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.process_leave_notifications(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.process_overtime_notifications(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.process_document_notifications(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.resolve_stale_notifications(uuid) from public,anon,authenticated;
revoke all on function public.archive_resolved_notifications(uuid) from public,anon,authenticated;
revoke all on function public.run_daily_notification_cycle(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.notify_attendance_correction_change() from public,anon,authenticated;
revoke all on function public.notify_leave_request_action() from public,anon,authenticated;
revoke all on function public.notify_overtime_approval_change() from public,anon,authenticated;
revoke all on function public.notify_document_review_insert() from public,anon,authenticated;
revoke all on function public.create_document_notification(uuid,text,text,text,text,uuid,text) from public,anon,authenticated;

revoke all on function public.list_notification_center(text,text,text,text,date,date,integer) from public,anon;
grant execute on function public.list_notification_center(text,text,text,text,date,date,integer) to authenticated;
revoke all on function public.get_unread_notification_count() from public,anon;
grant execute on function public.get_unread_notification_count() to authenticated;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
revoke all on function public.mark_notification_unread(uuid,uuid) from public,anon;
grant execute on function public.mark_notification_unread(uuid,uuid) to authenticated;
revoke all on function public.dismiss_notification(uuid,uuid) from public,anon;
grant execute on function public.dismiss_notification(uuid,uuid) to authenticated;
revoke all on function public.bulk_mark_notifications_read(uuid[],uuid) from public,anon;
grant execute on function public.bulk_mark_notifications_read(uuid[],uuid) to authenticated;
revoke all on function public.bulk_dismiss_notifications(uuid[],uuid) from public,anon;
grant execute on function public.bulk_dismiss_notifications(uuid[],uuid) to authenticated;
revoke all on function public.list_notification_rules() from public,anon;
grant execute on function public.list_notification_rules() to authenticated;
revoke all on function public.update_notification_rule(text,boolean,integer,integer,integer,integer,integer,integer,uuid) from public,anon;
grant execute on function public.update_notification_rule(text,boolean,integer,integer,integer,integer,integer,integer,uuid) to authenticated;
revoke all on function public.reset_notification_rules_to_defaults(uuid) from public,anon;
grant execute on function public.reset_notification_rules_to_defaults(uuid) to authenticated;
revoke all on function public.get_notification_cycle_status(integer) from public,anon;
grant execute on function public.get_notification_cycle_status(integer) to authenticated;
revoke all on function public.run_notification_cycle_now(uuid) from public,anon;
grant execute on function public.run_notification_cycle_now(uuid) to authenticated;
revoke all on function public.get_notification_dashboard_summary(integer) from public,anon;
grant execute on function public.get_notification_dashboard_summary(integer) to authenticated;

-- Replace the daily cron job idempotently. The database cron schedule is UTC.
do $cron$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname='hris-daily-notification-cycle' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule('hris-daily-notification-cycle','0 0 * * *',$job$select public.run_daily_notification_cycle('scheduled', null);$job$);
end
$cron$;

notify pgrst, 'reload schema';
commit;
