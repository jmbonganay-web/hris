-- Employee-management fields required by the connected frontend.
alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text;

update public.employees e
set
  first_name = coalesce(nullif(p.first_name, ''), 'Unknown'),
  last_name = coalesce(nullif(p.last_name, ''), 'Employee')
from public.profiles p
where e.profile_id = p.id
  and (e.first_name is null or e.last_name is null);

update public.employees
set
  first_name = coalesce(first_name, 'Unknown'),
  last_name = coalesce(last_name, 'Employee')
where first_name is null or last_name is null;

alter table public.employees
  alter column first_name set not null,
  alter column last_name set not null;

create index if not exists employees_name_idx
  on public.employees (last_name, first_name);

create index if not exists employees_archived_at_idx
  on public.employees (archived_at);
