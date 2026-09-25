begin;
create table public.model_review_batches (
 id uuid primary key default gen_random_uuid(),label text not null,status text not null default 'queued' check(status in ('queued','running','paused','completed')),
 cutoff timestamptz not null,config jsonb not null,total integer not null default 0,
 workflow_id text,launch_hash text,launch_expires_at timestamptz,reason text,created_at timestamptz not null default now()
);
alter table public.model_review_batches enable row level security;
revoke all on public.model_review_batches from public,anon,authenticated;
grant all on public.model_review_batches to service_role;
alter table public.model_comparison_cases add column batch_id uuid references public.model_review_batches(id);
create index model_comparison_cases_batch on public.model_comparison_cases(batch_id,status);
alter table public.model_comparison_cases drop constraint model_comparison_cases_source_check;
alter table public.model_comparison_cases add constraint model_comparison_cases_source_check check(source in ('auto','manual','historical'));
create function public.create_historical_luna_batch(p_config jsonb,p_prompts jsonb,p_cutoff timestamptz,p_launch_hash text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare b uuid; n integer;
begin
 perform pg_advisory_xact_lock(hashtext('historical-luna-batch'));
 if exists(select 1 from public.model_review_batches where status in ('queued','running','paused')) then raise exception 'active_batch_exists';end if;
 if p_config->'b'->>'model'<>'gpt-6-luna' then raise exception 'luna_required';end if;
 insert into public.model_review_batches(label,cutoff,config,launch_hash,launch_expires_at)
 values('GPT-6 Luna 歷史題目重解',p_cutoff,p_config,p_launch_hash,now()+interval '24 hours') returning id into b;
 insert into public.model_comparison_cases(history_id,version,batch_id,config,source,subject,prompt,images,a_status,a_result,b_status,b_result,status,reserved_twd)
 select h.id,b,b,jsonb_set(p_config,'{a}',jsonb_build_object('model',coalesce(h.arbiter_model,h.primary_model,'gemini-3.8-flash'),'reasoning','medium')),
 'historical',h.subject,
 replace(replace(coalesce(p_prompts->>h.subject,p_prompts->>'auto'),'{{QUESTION_NOTE}}',coalesce(h.question_note,'')),'{{REFERENCE_ANSWER}}',coalesce(h.reference_answer,'')),
 coalesce(h.image_paths,'[]'::jsonb),'succeeded',jsonb_build_object('answer',h.answer,'explanation',h.explanation,'options',h.options,'diagram',h.diagram,'chemicalStructure',h.chemical_structure,'historical',true,'usage',jsonb_build_object('estimatedCostUsd',0)),
 case when jsonb_typeof(h.image_paths)='array' and jsonb_array_length(h.image_paths)>0 then 'queued' else 'failed' end,
 case when jsonb_typeof(h.image_paths)='array' and jsonb_array_length(h.image_paths)>0 then null else '{"error":"原題缺少圖片，未呼叫模型","notCalled":true}'::jsonb end,
 case when jsonb_typeof(h.image_paths)='array' and jsonb_array_length(h.image_paths)>0 then 'queued' else 'failed' end,0.50
 from public.solve_history h where h.created_at<=p_cutoff;
 get diagnostics n=row_count;
 update public.model_review_batches set total=n where id=b;
 return b;
end $$;
revoke all on function public.create_historical_luna_batch(jsonb,jsonb,timestamptz,text) from public,anon,authenticated;
grant execute on function public.create_historical_luna_batch(jsonb,jsonb,timestamptz,text) to service_role;
create or replace function public.settle_model_comparison(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare c public.model_comparison_cases; cost numeric;
begin
 select * into c from public.model_comparison_cases where id=p_id for update;
 if c.id is null or c.settled or c.a_status in ('queued','running') or c.b_status in ('queued','running') then return;end if;
 if c.a_status='succeeded' and c.b_status='succeeded' then
  cost:=((c.a_result->'usage'->>'estimatedCostUsd')::numeric+(c.b_result->'usage'->>'estimatedCostUsd')::numeric)*(c.config->>'usdTwd')::numeric;
  if c.batch_id is null then
   update public.model_comparison_daily set committed_twd=greatest(0,committed_twd-c.reserved_twd+cost) where day=c.budget_day;
  end if;
  update public.model_comparison_cases set status='ready',settled=true where id=p_id;
 else
  update public.model_comparison_cases set status='failed',settled=true where id=p_id;
 end if;
end $$;
create function public.historical_luna_batch_progress(p_batch uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('total',count(*),'queued',count(*) filter(where b_status='queued'),'running',count(*) filter(where b_status='running'),'succeeded',count(*) filter(where b_status='succeeded'),'failed',count(*) filter(where b_status='failed'),
 'notCalled',count(*) filter(where b_result->>'notCalled'='true'),
 'reviewed',(select count(*) from public.model_comparison_reviews r join public.model_comparison_cases x on x.id=r.case_id where x.batch_id=p_batch),
 'costUsd',coalesce(sum((b_result->'usage'->>'estimatedCostUsd')::numeric),0),
 'committedTwd',coalesce(sum(case when b_result->>'notCalled'='true' then 0 when b_result->'usage'->>'estimatedCostUsd' is not null then (b_result->'usage'->>'estimatedCostUsd')::numeric*(config->>'usdTwd')::numeric when b_status in ('running','failed') then reserved_twd else 0 end),0))
 from public.model_comparison_cases where batch_id=p_batch;
$$;
revoke all on function public.historical_luna_batch_progress(uuid) from public,anon,authenticated;
grant execute on function public.historical_luna_batch_progress(uuid) to service_role;
commit;
