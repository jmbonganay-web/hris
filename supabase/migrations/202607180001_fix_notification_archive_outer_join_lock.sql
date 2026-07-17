begin;

create or replace function public.archive_resolved_notifications(
  p_run_id uuid
)
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
    select
      n.id,
      n.recipient_user_id
    from public.notifications as n
    left join public.notification_rules as rule
      on rule.type_code = n.type
    where n.status = 'resolved'
      and n.resolved_at is not null
      and n.resolved_at <
        now() - make_interval(days => coalesce(rule.retention_days, 90))
    for update of n
  loop
    update public.notifications
    set
      status = 'archived',
      archived_at = now(),
      updated_at = now()
    where id = r.id;

    perform public.write_notification_event(
      r.id,
      r.recipient_user_id,
      'archived',
      null,
      p_run_id,
      '{}'::jsonb
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.archive_resolved_notifications(uuid)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
