-- Server-only analytics. No student names, IP addresses, or browser fingerprints.
create table public.chemistry_reading_visits (
 id uuid primary key,
 slug text not null check (length(slug) between 1 and 100),
 student_id uuid references public.students(id) on delete cascade,
 viewed_at timestamptz not null default now(),
 completed_at timestamptz,
 score smallint check (score between 0 and 3),
 constraint chemistry_completion_consistency check (
  (completed_at is null and score is null) or
  (completed_at is not null and score is not null)
 )
);
alter table public.chemistry_reading_visits enable row level security;
revoke all on public.chemistry_reading_visits from public, anon, authenticated;
grant select, insert, update, delete on public.chemistry_reading_visits to service_role;
create index chemistry_reading_visits_student_time_idx on public.chemistry_reading_visits(student_id,viewed_at,id);
create index chemistry_reading_visits_time_idx on public.chemistry_reading_visits(viewed_at,id);
comment on table public.chemistry_reading_visits is 'Article-open visits, idempotent by client-generated UUID; server-derived student identity and first completed attempt. Admin access is class-scoped in the server API.';
