begin;
create table if not exists public.money_records(
 trip_id uuid not null,
 user_id uuid not null default auth.uid(),
 kind text not null check(kind in('expense','day')),
 id text not null,
 entry_date date not null,
 amount_vnd bigint not null default 0 check(amount_vnd>=0 and amount_vnd<=1000000000000),
 title text not null default '' check(length(title)<=200),
 category text not null default 'その他',
 memo text not null default '' check(length(memo)<=5000),
 deleted boolean not null default false,
 version bigint not null default 1 check(version>0 and version<9007199254740991),
 last_mutation uuid,
 updated_at timestamptz not null default now(),
 primary key(trip_id,user_id,kind,id),
 foreign key(trip_id,user_id) references public.group_members(trip_id,user_id) on delete cascade,
 check((kind='expense' and id ~ '^[0-9a-fA-F-]{36}$' and amount_vnd>0 and category in('食事','カフェ','移動','観光','買い物','宿泊','その他')) or (kind='day' and id=entry_date::text and amount_vnd=0))
);
alter table public.money_records enable row level security;
revoke all on public.money_records from public,anon,authenticated;
grant select,insert,update on public.money_records to authenticated;
create policy money_read on public.money_records for select to authenticated using(user_id=(select auth.uid()) and private.member_role(trip_id) is not null);
create policy money_insert on public.money_records for insert to authenticated with check(user_id=(select auth.uid()) and private.member_role(trip_id) is not null);
create policy money_update on public.money_records for update to authenticated using(user_id=(select auth.uid()) and private.member_role(trip_id) is not null) with check(user_id=(select auth.uid()) and private.member_role(trip_id) is not null);
create or replace function public.save_money_record(p_trip uuid,p_user uuid,p_kind text,p_id text,p_expected_version bigint,p_values jsonb,p_mutation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.money_records;
begin
 if auth.uid() is null or p_user is distinct from auth.uid() or private.member_role(p_trip) is null or p_kind not in('expense','day') or p_mutation is null then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_values) is distinct from 'object' or (p_values->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid record' using errcode='22023'; end if;
 select * into r from public.money_records where trip_id=p_trip and user_id=auth.uid() and kind=p_kind and id=p_id for update;
 if not found then
  if p_expected_version<>0 then raise exception 'record removed' using errcode='40001'; end if;
  insert into public.money_records(trip_id,user_id,kind,id,entry_date,amount_vnd,title,category,memo,deleted,last_mutation)
  values(p_trip,auth.uid(),p_kind,p_id,(p_values->>'date')::date,(p_values->>'amount')::bigint,p_values->>'name',p_values->>'category',p_values->>'memo',(p_values->>'deleted')::boolean,p_mutation)
  on conflict do nothing returning * into r;
  if found then return jsonb_build_object('status','ok','record',to_jsonb(r)); end if;
  select * into r from public.money_records where trip_id=p_trip and user_id=auth.uid() and kind=p_kind and id=p_id for update;
 end if;
 if r.last_mutation=p_mutation then return jsonb_build_object('status','ok','record',to_jsonb(r)); end if;
 if r.version<>p_expected_version then return jsonb_build_object('status','conflict','record',to_jsonb(r)); end if;
 update public.money_records set entry_date=(p_values->>'date')::date,amount_vnd=(p_values->>'amount')::bigint,title=p_values->>'name',category=p_values->>'category',memo=p_values->>'memo',deleted=(p_values->>'deleted')::boolean,version=version+1,last_mutation=p_mutation,updated_at=now()
 where trip_id=p_trip and user_id=auth.uid() and kind=p_kind and id=p_id returning * into r;
 return jsonb_build_object('status','ok','record',to_jsonb(r));
end $$;
revoke all on function public.save_money_record(uuid,uuid,text,text,bigint,jsonb,uuid) from public,anon;
grant execute on function public.save_money_record(uuid,uuid,text,text,bigint,jsonb,uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='money_records') then alter publication supabase_realtime add table public.money_records; end if;
end $$;
commit;
