begin;
create table public.model_comparison_settings (
 id boolean primary key default true check(id), version uuid not null default gen_random_uuid(),
 config jsonb not null, updated_at timestamptz not null default now()
);
create table public.model_comparison_cases (
 id uuid primary key default gen_random_uuid(), history_id uuid not null references public.solve_history(id) on delete cascade,
 version uuid not null, config jsonb not null, source text not null check(source in ('auto','manual')),
 subject text not null, prompt text not null, images jsonb not null,
 blind_swap boolean not null default (random()<0.5),
 a_status text not null default 'queued' check(a_status in ('queued','running','succeeded','failed')),
 b_status text not null default 'queued' check(b_status in ('queued','running','succeeded','failed')),
 a_result jsonb, b_result jsonb, status text not null default 'queued' check(status in ('queued','running','ready','failed')),
 workflow_id text, reserved_twd numeric not null check(reserved_twd>=0), settled boolean not null default false,
 budget_day date not null default ((now() at time zone 'Asia/Taipei')::date), created_at timestamptz not null default now(),
 unique(history_id,version)
);
create index model_comparison_cases_list on public.model_comparison_cases(version,created_at desc);
create index model_comparison_cases_queue on public.model_comparison_cases(status) where status in ('queued','running');
create table public.model_comparison_reviews (
 case_id uuid primary key references public.model_comparison_cases(id) on delete cascade,
 reviewer_id uuid not null references public.admin_users(id), a_ratings jsonb not null,b_ratings jsonb not null,
 a_score numeric,b_score numeric,a_grade text not null,b_grade text not null,
 preference text not null check(preference in ('a','b','tie','neither')),note text not null default '',
 rubric_version text not null default '1',created_at timestamptz not null default now()
);
create index model_comparison_reviews_reviewer on public.model_comparison_reviews(reviewer_id);
create table public.model_comparison_daily(day date primary key, count integer not null default 0, committed_twd numeric not null default 0);
-- These tables are server-only: cookie sessions are checked by Next route handlers.
alter table public.model_comparison_settings enable row level security;
alter table public.model_comparison_cases enable row level security;
alter table public.model_comparison_reviews enable row level security;
alter table public.model_comparison_daily enable row level security;
revoke all on public.model_comparison_settings,public.model_comparison_cases,public.model_comparison_reviews,public.model_comparison_daily from public,anon,authenticated;
grant all on public.model_comparison_settings,public.model_comparison_cases,public.model_comparison_reviews,public.model_comparison_daily to service_role;

create function public.reserve_model_comparison(p_history uuid,p_version uuid,p_source text,p_subject text,p_prompt text,p_images jsonb,p_reserve numeric)
returns uuid language plpgsql security invoker set search_path=public as $$
declare cfg jsonb; v uuid; existing_id uuid; d date:=(now() at time zone 'Asia/Taipei')::date; daily public.model_comparison_daily;
begin
 select version,config into v,cfg from public.model_comparison_settings where id=true for update;
 if v is distinct from p_version then raise exception 'comparison_settings_changed'; end if;
 select id into existing_id from public.model_comparison_cases where history_id=p_history and version=v;
 if existing_id is not null then return existing_id; end if;
 if p_source='auto' and not (cfg->>'enabled')::boolean then return null;end if;
 if p_reserve<=0 then raise exception 'invalid_reservation'; end if;
 insert into public.model_comparison_daily(day) values(d) on conflict do nothing;
 select * into daily from public.model_comparison_daily where day=d for update;
 if daily.count >= (cfg->>'dailyLimit')::integer or daily.committed_twd+p_reserve > (cfg->>'dailyBudgetTwd')::numeric then return null;end if;
 insert into public.model_comparison_cases(history_id,version,config,source,subject,prompt,images,reserved_twd,budget_day)
 values(p_history,v,cfg,p_source,p_subject,p_prompt,p_images,p_reserve,d) returning id into existing_id;
 update public.model_comparison_daily set count=count+1,committed_twd=committed_twd+p_reserve where day=d;
 return existing_id;
end $$;
revoke all on function public.reserve_model_comparison(uuid,uuid,text,text,text,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.reserve_model_comparison(uuid,uuid,text,text,text,jsonb,numeric) to service_role;

create function public.settle_model_comparison(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare c public.model_comparison_cases; cost numeric;
begin
 select * into c from public.model_comparison_cases where id=p_id for update;
 if c.id is null or c.settled or c.a_status in ('queued','running') or c.b_status in ('queued','running') then return;end if;
 if c.a_status='succeeded' and c.b_status='succeeded' then
  cost:=((c.a_result->'usage'->>'estimatedCostUsd')::numeric+(c.b_result->'usage'->>'estimatedCostUsd')::numeric)*(c.config->>'usdTwd')::numeric;
  update public.model_comparison_daily set committed_twd=greatest(0,committed_twd-c.reserved_twd+cost) where day=c.budget_day;
  update public.model_comparison_cases set status='ready',settled=true where id=p_id;
 else
  -- Unknown provider billing retains reservation; do not silently report a zero cost.
  update public.model_comparison_cases set status='failed',settled=true where id=p_id;
 end if;
end $$;
revoke all on function public.settle_model_comparison(uuid) from public,anon,authenticated;
grant execute on function public.settle_model_comparison(uuid) to service_role;
commit;
