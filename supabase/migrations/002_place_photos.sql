-- Create a PRIVATE bucket named place-photos in Dashboard Storage first.
-- Size limit: 1 MB. Allowed MIME type: image/jpeg.
begin;
create or replace function private.place_photo_role(p_name text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare trip uuid;
begin
 if p_name !~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9_-]+/[0-9a-f-]{36}\.jpg$' then return null; end if;
 begin trip := split_part(p_name,'/',1)::uuid; exception when invalid_text_representation then return null; end;
 return private.member_role(trip);
end $$;
revoke all on function private.place_photo_role(text) from public,anon;
grant execute on function private.place_photo_role(text) to authenticated;
drop policy if exists trip_photo_read on storage.objects;
create policy trip_photo_read on storage.objects for select to authenticated
 using(bucket_id='place-photos' and private.place_photo_role(name) is not null);
drop policy if exists trip_photo_insert on storage.objects;
create policy trip_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='place-photos' and private.place_photo_role(name)='admin');
-- Unique paths are used for replacements, so overwriting objects is unnecessary.
-- Old files are retained; only an administrator may clean them via Storage API.
drop policy if exists trip_photo_delete on storage.objects;
create policy trip_photo_delete on storage.objects for delete to authenticated
 using(bucket_id='place-photos' and private.place_photo_role(name)='admin');
commit;
