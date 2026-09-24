create or replace function public.replace_teacher_institutions(teacher_id uuid, institution_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.admin_users where id=teacher_id and role='teacher' and deleted_at is null for update;
  if not found then raise exception 'Teacher not found'; end if;
  if coalesce(cardinality(institution_ids),0)=0 then raise exception 'At least one institution is required'; end if;
  if exists(select 1 from unnest(institution_ids) as wanted(id) where not exists(select 1 from public.institutions i where i.id=wanted.id)) then raise exception 'Invalid institution'; end if;
  delete from public.admin_user_institutions where admin_user_id=teacher_id;
  insert into public.admin_user_institutions(admin_user_id,institution_id) select teacher_id,id from (select distinct unnest(institution_ids) as id) x;
end;
$$;
revoke all on function public.replace_teacher_institutions(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.replace_teacher_institutions(uuid,uuid[]) to service_role;
