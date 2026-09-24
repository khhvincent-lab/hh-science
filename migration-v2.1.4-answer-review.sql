-- 人工覆核只紀錄判定，不改寫學生原本填入的參考答案。
create table if not exists public.solve_accuracy_reviews (
  solve_history_id uuid primary key references public.solve_history(id) on delete cascade,
  verdict text not null check (verdict in ('ai_correct', 'ai_incorrect', 'unreviewed')),
  note text not null default '',
  reviewed_by uuid not null references public.admin_users(id),
  reviewed_at timestamptz not null default now()
);

alter table public.solve_accuracy_reviews enable row level security;
revoke all on public.solve_accuracy_reviews from anon, authenticated;
grant select, insert, update, delete on public.solve_accuracy_reviews to service_role;
