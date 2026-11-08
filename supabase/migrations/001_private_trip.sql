-- Run as the project owner in Supabase SQL Editor. Contains no personal data.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke create on schema public from public;
create table public.travel_groups (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(name) between 1 and 200),
 start_date date not null,
 end_date date not null check (end_date >= start_date and end_date < start_date + 31),
 created_at timestamptz not null default now()
);
create table public.group_members (
 trip_id uuid not null references public.travel_groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','viewer')),
 primary key(trip_id,user_id),
 unique(user_id),
 unique(trip_id,role) -- exactly one slot per role; at most two members
);
create function private.member_role(p_trip uuid) returns text
language sql stable security definer set search_path = '' as $$
 select role from public.group_members where trip_id=p_trip and user_id=(select auth.uid())
$$;
revoke all on function private.member_role(uuid) from public,anon;
grant execute on function private.member_role(uuid) to authenticated;
create function private.valid_payload(p jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; r jsonb; field text; required text[];
begin
 if p is null or jsonb_typeof(p) <> 'object' or (select count(*) from jsonb_object_keys(p)) <> 6 then return false; end if;
 foreach k in array array['events','packing','places','flights','hotels','notes'] loop
  if jsonb_typeof(p->k) is distinct from 'array' or jsonb_array_length(p->k)>2000 then return false; end if;
  if (select count(*) from jsonb_array_elements(p->k)) <> (select count(distinct x->>'id') from jsonb_array_elements(p->k) x) then return false; end if;
  required:=case k
   when 'events' then array['id','date','time','end','name','category','place','mapUrl','memo','url']
   when 'packing' then array['id','name','category']
   when 'places' then array['id','name','city','category','address','memo','url','lat','lng']
   when 'flights' then array['id','airline','number','departure','arrival','from','to','booking','url','checked','cabin','memo']
   when 'hotels' then array['id','name','city','checkin','checkout','address','mapUrl','url','booking','phone','memo']
   else array['id','name','category','memo','url'] end;
  for r in select value from jsonb_array_elements(p->k) loop
   if jsonb_typeof(r)<>'object' or coalesce(length(r->>'id'),0)=0 then return false; end if;
   foreach field in array required loop
    if jsonb_typeof(r->field) is distinct from 'string' or length(r->>field)>10000 then return false; end if;
   end loop;
   foreach field in array array['url','mapUrl'] loop
    if r ? field and length(r->>field)>0 and ((r->>field) !~ '^https://[^/[:space:]]+' or (r->>field) ~ '^https://[^/]*@') then return false; end if;
   end loop;
   if k='packing' and (r ? 'done' or coalesce((r->>'quantity') !~ '^[1-9][0-9]{0,2}$',true)) then return false; end if;
   if k='events' and (jsonb_typeof(r->'done') is distinct from 'boolean' or jsonb_typeof(r->'order') is distinct from 'number' or (r->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or (r->>'time') !~ '^([01]\d|2[0-3]):[0-5]\d$') then return false; end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function private.valid_payload(jsonb) from public,anon;
grant execute on function private.valid_payload(jsonb) to authenticated;
create table public.travel_documents (
 trip_id uuid primary key references public.travel_groups(id) on delete cascade,
 payload jsonb not null check(private.valid_payload(payload)),
 version bigint not null default 1 check (version>0 and version<9007199254740991),
 last_mutation uuid,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
create table public.packing_checks (
 trip_id uuid not null,
 user_id uuid not null default auth.uid(),
 item_id text not null check(length(item_id) between 1 and 100),
 checked boolean not null default false,
 version bigint not null default 1 check(version>0 and version<9007199254740991),
 last_mutation uuid,
 updated_at timestamptz not null default now(),
 primary key(trip_id,user_id,item_id),
 foreign key(trip_id,user_id) references public.group_members(trip_id,user_id) on delete cascade
);
create function private.item_exists(p_trip uuid,p_item text) returns boolean
language sql stable security definer set search_path = '' as $$
 select private.member_role(p_trip) is not null and exists(select 1 from public.travel_documents d cross join lateral jsonb_array_elements(d.payload->'packing') p where d.trip_id=p_trip and p->>'id'=p_item)
$$;
revoke all on function private.item_exists(uuid,text) from public,anon;
grant execute on function private.item_exists(uuid,text) to authenticated;
alter table public.travel_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.travel_documents enable row level security;
alter table public.packing_checks enable row level security;
create policy group_read on public.travel_groups for select to authenticated using(private.member_role(id) is not null);
create policy member_read on public.group_members for select to authenticated using(user_id=(select auth.uid()));
create policy document_read on public.travel_documents for select to authenticated using(private.member_role(trip_id) is not null);
create policy document_insert on public.travel_documents for insert to authenticated with check(private.member_role(trip_id)='admin');
create policy document_update on public.travel_documents for update to authenticated using(private.member_role(trip_id)='admin') with check(private.member_role(trip_id)='admin');
create policy document_delete on public.travel_documents for delete to authenticated using(private.member_role(trip_id)='admin');
create policy checks_read on public.packing_checks for select to authenticated using(user_id=(select auth.uid()) and private.member_role(trip_id) is not null);
create policy checks_insert on public.packing_checks for insert to authenticated with check(user_id=(select auth.uid()) and private.item_exists(trip_id,item_id));
create policy checks_update on public.packing_checks for update to authenticated using(user_id=(select auth.uid()) and private.member_role(trip_id) is not null) with check(user_id=(select auth.uid()) and private.item_exists(trip_id,item_id));
create policy checks_delete on public.packing_checks for delete to authenticated using(user_id=(select auth.uid()) and private.member_role(trip_id) is not null);
revoke all on public.travel_groups,public.group_members,public.travel_documents,public.packing_checks from public,anon,authenticated;
grant select on public.travel_groups,public.group_members to authenticated;
grant select,insert,update,delete on public.travel_documents,public.packing_checks to authenticated;
create function public.save_packing_check(p_trip uuid,p_item text,p_expected_version bigint,p_checked boolean,p_mutation uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.packing_checks;
begin
 if auth.uid() is null or private.member_role(p_trip) is null or not private.item_exists(p_trip,p_item) or p_mutation is null or p_checked is null then raise exception 'forbidden' using errcode='42501'; end if;
 -- ON CONFLICT serializes first writers without granting access to another user.
 insert into public.packing_checks(trip_id,user_id,item_id,checked,version,last_mutation) values(p_trip,auth.uid(),p_item,p_checked,1,p_mutation) on conflict do nothing returning * into c;
 if found then
  if p_expected_version<>0 then raise exception 'stale check' using errcode='40001'; end if;
  return jsonb_build_object('status','ok','check',to_jsonb(c));
 end if;
 select * into c from public.packing_checks where trip_id=p_trip and user_id=auth.uid() and item_id=p_item for update;
 if c.last_mutation=p_mutation then return jsonb_build_object('status','ok','check',to_jsonb(c)); end if;
 if c.version<>p_expected_version then return jsonb_build_object('status','conflict','check',to_jsonb(c)); end if;
 update public.packing_checks set checked=p_checked,version=version+1,last_mutation=p_mutation,updated_at=now() where trip_id=p_trip and user_id=auth.uid() and item_id=p_item returning * into c;
 return jsonb_build_object('status','ok','check',to_jsonb(c));
end $$;
-- Optimistic compare-and-swap; duplicate mutation IDs are idempotent.
create function public.save_trip_document(p_trip uuid,p_expected_version bigint,p_payload jsonb,p_mutation uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare d public.travel_documents;
begin
 if private.member_role(p_trip) is distinct from 'admin' or p_mutation is null then raise exception 'forbidden' using errcode='42501'; end if;
 if not private.valid_payload(p_payload) then raise exception 'invalid payload' using errcode='22023'; end if;
 select * into d from public.travel_documents where trip_id=p_trip for update;
 if not found then
  if p_expected_version<>0 then raise exception 'document removed' using errcode='40001'; end if;
  insert into public.travel_documents(trip_id,payload,last_mutation,updated_by) values(p_trip,p_payload,p_mutation,auth.uid()) on conflict do nothing returning * into d;
  if found then return jsonb_build_object('status','ok','document',to_jsonb(d)); end if;
  select * into d from public.travel_documents where trip_id=p_trip for update;
 end if;
 if d.last_mutation=p_mutation then return jsonb_build_object('status','ok','document',to_jsonb(d)); end if;
 if d.version<>p_expected_version then return jsonb_build_object('status','conflict','document',to_jsonb(d)); end if;
 update public.travel_documents set payload=p_payload,version=version+1,last_mutation=p_mutation,updated_at=now(),updated_by=auth.uid() where trip_id=p_trip returning * into d;
 return jsonb_build_object('status','ok','document',to_jsonb(d));
end $$;
revoke all on function public.save_trip_document(uuid,bigint,jsonb,uuid),public.save_packing_check(uuid,text,bigint,boolean,uuid) from public,anon;
grant execute on function public.save_trip_document(uuid,bigint,jsonb,uuid),public.save_packing_check(uuid,text,bigint,boolean,uuid) to authenticated;
create function private.cleanup_checks() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.packing_checks c where c.trip_id=new.trip_id and not exists(select 1 from jsonb_array_elements(new.payload->'packing') p where p->>'id'=c.item_id);
 return new;
end $$;
revoke all on function private.cleanup_checks() from public,anon,authenticated;
create trigger document_cleanup after insert or update on public.travel_documents for each row execute function private.cleanup_checks();
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['travel_documents','packing_checks','group_members'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
commit;
