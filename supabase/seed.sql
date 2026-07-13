insert into public.departments (name, code, description, is_active)
values
  ('Human Resources', 'HR', 'People operations and employee support', true),
  ('Engineering', 'ENG', 'Product and platform engineering', true),
  ('Operations', 'OPS', 'Business operations', true)
on conflict (name) do update
set
  code = excluded.code,
  description = excluded.description,
  is_active = true,
  archived_at = null;

-- Upgrade the original global seed titles to department-scoped titles when
-- those records already exist from an earlier project phase.
update public.job_titles title
set department_id = department.id
from public.departments department
where title.department_id is null
  and title.archived_at is null
  and (
    (title.title = 'HR Administrator' and department.code = 'HR')
    or (title.title = 'Software Engineer' and department.code = 'ENG')
    or (title.title = 'Operations Specialist' and department.code = 'OPS')
  )
  and not exists (
    select 1
    from public.job_titles existing
    where lower(existing.title) = lower(title.title)
      and existing.department_id = department.id
      and existing.archived_at is null
  );

insert into public.job_titles (title, description, department_id, is_active)
select
  seed.title,
  seed.description,
  department.id,
  true
from (
  values
    ('HR Administrator', 'Manages employee records and HR workflows', 'HR'),
    ('Software Engineer', 'Builds and maintains software products', 'ENG'),
    ('Operations Specialist', 'Supports day-to-day business operations', 'OPS')
) as seed(title, description, department_code)
join public.departments department
  on department.code = seed.department_code
where not exists (
  select 1
  from public.job_titles existing
  where lower(existing.title) = lower(seed.title)
    and existing.department_id = department.id
    and existing.archived_at is null
);


-- Ensure every existing employee has an expandable personal-details record.
insert into public.employee_personal_details (employee_id)
select id from public.employees
on conflict (employee_id) do nothing;
