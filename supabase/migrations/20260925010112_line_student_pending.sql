-- Server-only: student sessions are custom cookies, not Supabase Auth users.
create table if not exists public.student_line_bindings (
  student_id uuid primary key references public.students(id) on delete cascade,
  line_user_id text not null unique check (line_user_id ~ '^U[0-9a-f]{32}$'),
  pin_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.student_line_pending (
  student_id uuid primary key references public.students(id) on delete cascade,
  history_id uuid not null references public.solve_history(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.student_line_bindings enable row level security;
alter table public.student_line_pending enable row level security;
revoke all on public.student_line_bindings, public.student_line_pending from public, anon, authenticated;
grant select, insert, update, delete on public.student_line_bindings, public.student_line_pending to service_role;
comment on table public.student_line_bindings is 'Verified LINE Login identity to student. Never expose via browser Data API.';
comment on table public.student_line_pending is 'One pending teacher handoff per student; expires in 24h. Capability token is server-only.';
