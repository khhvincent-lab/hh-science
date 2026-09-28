create table public.followup_language_events (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete cascade,
 solve_history_id uuid references public.solve_history(id) on delete set null,
 request_id uuid not null,
 question text not null check (length(question) between 1 and 1200),
 category text not null check (category in ('profanity','insult','threat')),
 reason text not null,
 source text not null check (source in ('rules','semantic')),
 status text not null default 'active' check (status in ('active','dismissed')),
 needs_review boolean not null default false,
 reviewed_at timestamptz,
 reviewed_by uuid references public.admin_users(id) on delete set null,
 review_note text,
 blocked_until timestamptz,
 created_at timestamptz not null default now(),
 unique(student_id,request_id)
);
create index followup_language_student_time on public.followup_language_events(student_id,created_at desc);
create index followup_language_created on public.followup_language_events(created_at desc);
create index followup_language_history on public.followup_language_events(solve_history_id);
create index followup_language_reviewer on public.followup_language_events(reviewed_by);
alter table public.followup_language_events enable row level security;
revoke all on public.followup_language_events from public,anon,authenticated;
grant select,insert,update,delete on public.followup_language_events to service_role;

-- Called only by the server after session and history ownership verification.
-- Student-level transaction lock makes concurrent requests and retries count once.
create function public.check_followup_language(
 p_student_id uuid,p_history_id uuid,p_request_id uuid,
 p_question text default '',p_category text default null,p_reason text default '',p_source text default 'rules'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 v_count integer; v_until timestamptz; v_duplicate boolean;
 v_start timestamptz := date_trunc('day',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei';
begin
 perform pg_advisory_xact_lock(hashtextextended('followup-language:' || p_student_id::text,0));
 if not exists(select 1 from public.solve_history where id=p_history_id and student_id=p_student_id) then
   raise exception 'History not owned by student';
 end if;
 select count(*) filter(where created_at>=v_start)::integer,max(blocked_until) filter(where blocked_until>now()) into v_count,v_until
 from public.followup_language_events where student_id=p_student_id and status='active' and created_at>=v_start-interval '5 minutes';
 select exists(select 1 from public.followup_language_events where student_id=p_student_id and request_id=p_request_id) into v_duplicate;
 if v_duplicate or v_until is not null or p_category is null then
   return jsonb_build_object('count',v_count,'blockedUntil',v_until,'duplicate',v_duplicate,'recorded',false);
 end if;
 v_count:=v_count+1;
 if v_count>=3 then v_until:=now()+interval '5 minutes'; end if;
 insert into public.followup_language_events(student_id,solve_history_id,request_id,question,category,reason,source,needs_review,blocked_until)
 values(p_student_id,p_history_id,p_request_id,p_question,p_category,left(p_reason,160),p_source,p_category in ('insult','threat'),v_until);
 return jsonb_build_object('count',v_count,'blockedUntil',v_until,'duplicate',false,'recorded',true);
end $$;
revoke all on function public.check_followup_language(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.check_followup_language(uuid,uuid,uuid,text,text,text,text) to service_role;

create function public.review_followup_language(p_event_id uuid,p_admin_id uuid,p_dismiss boolean,p_note text)
 returns void language plpgsql security invoker set search_path='' as $$
declare v_student uuid;
begin
 select student_id into v_student from public.followup_language_events where id=p_event_id;
 if v_student is null then raise exception 'Event not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('followup-language:' || v_student::text,0));
 update public.followup_language_events set status=case when p_dismiss then 'dismissed' else status end,
   needs_review=false,reviewed_at=now(),reviewed_by=p_admin_id,review_note=left(p_note,500)
 where id=p_event_id;
 -- Dismissing a false positive also releases an active pause. Counts derive from active events.
 if p_dismiss then
   update public.followup_language_events set blocked_until=null where student_id=v_student and blocked_until>now();
 end if;
end $$;
revoke all on function public.review_followup_language(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.review_followup_language(uuid,uuid,boolean,text) to service_role;
