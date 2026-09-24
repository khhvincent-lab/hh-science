-- All access is through authenticated server routes; no browser database grants.
create or replace function public.save_ai_solver_configuration(p_value jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(624092401);
 insert into app_settings(id,value,updated_at)
 select 'ai_solver_previous',value,now() from app_settings where id='ai_solver'
 on conflict(id) do update set value=excluded.value,updated_at=excluded.updated_at;
 insert into app_settings(id,value,updated_at) values('ai_solver',p_value,now())
 on conflict(id) do update set value=excluded.value,updated_at=excluded.updated_at;
end;$$;
revoke all on function public.save_ai_solver_configuration(jsonb) from public,anon,authenticated;
grant execute on function public.save_ai_solver_configuration(jsonb) to service_role;

create table public.solve_jobs(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id) on delete cascade,
 client_key uuid not null,request_hash text not null,input_path text,
 status text not null default 'uploading' check(status in('uploading','queued','running','succeeded','failed')),
 stage text not null default 'uploading',workflow_run_id text,settings jsonb not null,
 result jsonb,http_status integer,history_id uuid references public.solve_history(id) on delete set null,
 quota_state text not null default 'none' check(quota_state in('none','reserved','committed','released')),
 quota_date date,quota_count integer,acknowledged_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(student_id,client_key)
);
create unique index solve_jobs_one_active on public.solve_jobs(student_id) where status in('uploading','queued','running');
create index solve_jobs_student_recent on public.solve_jobs(student_id,created_at desc);
alter table public.solve_jobs enable row level security;
revoke all on public.solve_jobs from anon,authenticated;
grant all on public.solve_jobs to service_role;
alter table public.solve_history add column solve_job_id uuid references public.solve_jobs(id) on delete set null;
create unique index solve_history_job_unique on public.solve_history(solve_job_id) where solve_job_id is not null;
create table public.solve_job_calls(job_id uuid not null references public.solve_jobs(id) on delete cascade,phase text not null,created_at timestamptz not null default now(),primary key(job_id,phase));
alter table public.solve_job_calls enable row level security;
revoke all on public.solve_job_calls from anon,authenticated;
grant all on public.solve_job_calls to service_role;

create or replace function public.reserve_solve_job_quota(p_job uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j solve_jobs%rowtype;n integer;d date:=(now() at time zone 'Asia/Taipei')::date;
begin
 select * into strict j from solve_jobs where id=p_job for update;
 if j.quota_state in('reserved','committed') then return jsonb_build_object('allowed',true,'count',j.quota_count);end if;
 if j.status<>'running' or j.quota_state='released' then raise exception 'Inactive solve job';end if;
 if p_limit<1 or p_limit>100 then raise exception 'Invalid limit';end if;
 insert into daily_usage(student_id,usage_date,count) values(j.student_id,d,0) on conflict(student_id,usage_date) do nothing;
 select count into n from daily_usage where student_id=j.student_id and usage_date=d for update;
 if n>=p_limit then return jsonb_build_object('allowed',false,'count',n);end if;
 update daily_usage set count=count+1,updated_at=now() where student_id=j.student_id and usage_date=d;
 update solve_jobs set quota_state='reserved',quota_date=d,quota_count=n+1,updated_at=now() where id=p_job;
 return jsonb_build_object('allowed',true,'count',n+1);
end;$$;

create or replace function public.finish_solve_job(p_job uuid,p_result jsonb,p_status integer,p_history uuid default null)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare j solve_jobs%rowtype;h solve_history%rowtype;
begin
 select * into strict j from solve_jobs where id=p_job for update;
 if j.status in('succeeded','failed') then return;end if;
 -- A persisted answer must not be lost or refunded if the final acknowledgement failed.
 select * into h from solve_history where solve_job_id=p_job;
 if p_status>=400 and h.id is not null then
  p_status:=200;p_history:=h.id;
  p_result:=jsonb_build_object('answer',h.answer,'explanation',h.explanation,'options',h.options,'annotations',h.annotations,'diagram',h.diagram,'chemicalStructure',h.chemical_structure,'historyId',h.id);
 end if;
 if p_status>=400 and j.quota_state='reserved' then
  update daily_usage set count=greatest(0,count-1),updated_at=now() where student_id=j.student_id and usage_date=j.quota_date;
 end if;
 update solve_jobs set status=case when p_status<400 then 'succeeded' else 'failed' end,
 stage=case when p_status<400 then 'complete' else 'failed' end,result=p_result,http_status=p_status,history_id=p_history,
 quota_state=case when j.quota_state='reserved' then case when p_status<400 then 'committed' else 'released' end else j.quota_state end,
 updated_at=now() where id=p_job;
end;$$;
revoke all on function public.reserve_solve_job_quota(uuid,integer),public.finish_solve_job(uuid,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserve_solve_job_quota(uuid,integer),public.finish_solve_job(uuid,jsonb,integer,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('solve-job-inputs','solve-job-inputs',false,4500000,array['application/json']) on conflict(id) do nothing;
