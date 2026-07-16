begin;

create or replace function public.prevent_submitted_leave_request_action_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    select current_status into v_status
    from public.leave_request_groups
    where id = old.request_group_id;

    if v_status = 'draft' then
      return old;
    end if;
  end if;

  raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
end;
$$;

drop trigger if exists prevent_leave_request_action_mutation
on public.leave_request_actions;

create trigger prevent_leave_request_action_mutation
before update or delete on public.leave_request_actions
for each row execute function public.prevent_submitted_leave_request_action_mutation();

revoke all on function public.prevent_submitted_leave_request_action_mutation()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
