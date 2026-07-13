-- Phase 3: Organization management.
-- Adds soft-archive fields, department heads, and department-scoped job titles.

alter table public.departments
  add column if not exists department_head_id uuid,
  add column if not exists archived_at timestamptz;

alter table public.job_titles
  add column if not exists department_id uuid,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'departments_department_head_id_fkey'
      and conrelid = 'public.departments'::regclass
  ) then
    alter table public.departments
      add constraint departments_department_head_id_fkey
      foreign key (department_head_id)
      references public.employees(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_titles_department_id_fkey'
      and conrelid = 'public.job_titles'::regclass
  ) then
    alter table public.job_titles
      add constraint job_titles_department_id_fkey
      foreign key (department_id)
      references public.departments(id)
      on delete set null;
  end if;
end $$;

-- The initial schema made title globally unique. Phase 3 allows the same title
-- in different departments while keeping active titles unique per department.
alter table public.job_titles
  drop constraint if exists job_titles_title_key;

drop index if exists public.job_titles_title_department_active_unique;
create unique index job_titles_title_department_active_unique
  on public.job_titles (
    lower(title),
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where archived_at is null;

create index if not exists departments_department_head_id_idx
  on public.departments(department_head_id);

create index if not exists departments_archived_at_idx
  on public.departments(archived_at);

create index if not exists job_titles_department_id_idx
  on public.job_titles(department_id);

create index if not exists job_titles_archived_at_idx
  on public.job_titles(archived_at);
