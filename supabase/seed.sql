insert into public.departments (name, code, description)
values
  ('Human Resources', 'HR', 'People operations and employee support'),
  ('Engineering', 'ENG', 'Product and platform engineering'),
  ('Operations', 'OPS', 'Business operations')
on conflict (name) do nothing;

insert into public.job_titles (title, description)
values
  ('HR Administrator', 'Manages employee records and HR workflows'),
  ('Software Engineer', 'Builds and maintains software products'),
  ('Operations Specialist', 'Supports day-to-day business operations')
on conflict (title) do nothing;
