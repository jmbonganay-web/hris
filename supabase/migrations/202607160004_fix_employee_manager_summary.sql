begin;

create or replace function public.get_employee_manager_summary(p_employee_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  employee_number text,
  employment_status public.employment_status,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_hr_admin()
     and public.current_employee_id() is distinct from p_employee_id then
    raise exception using
      errcode = '42501',
      message = 'EMPLOYEE_PROFILE_FORBIDDEN';
  end if;

  return query
  select
    manager.id,
    manager.first_name,
    manager.last_name,
    manager.employee_number,
    manager.employment_status,
    manager.archived_at
  from public.employees as employee
  join public.employees as manager
    on manager.id = employee.manager_id
  where employee.id = p_employee_id;
end;
$$;

revoke all on function public.get_employee_manager_summary(uuid)
from public, anon;

grant execute on function public.get_employee_manager_summary(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
