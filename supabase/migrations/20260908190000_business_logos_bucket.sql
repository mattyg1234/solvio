/*
 * Business logos live in Solvio storage, not on third-party URLs.
 * Uploaded at signup (required) and from Settings; embedded in invoice PDFs.
 * Public read so /book pages, emails and PDFs can fetch them without auth.
 */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read a logo (bucket is public; this covers listing/metadata too).
drop policy if exists business_logos_select on storage.objects;
create policy business_logos_select
on storage.objects for select
using (bucket_id = 'business-logos');

-- Only the business owner or a Show Ops member can write inside that business's folder.
drop policy if exists business_logos_insert on storage.objects;
create policy business_logos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-logos'
  and (
    exists (
      select 1 from public.businesses b
      where b.id = (split_part(name, '/', 1))::uuid and b.owner_id = auth.uid()
    )
    or public.show_ops_can_access((split_part(name, '/', 1))::uuid)
  )
);

drop policy if exists business_logos_update on storage.objects;
create policy business_logos_update
on storage.objects for update to authenticated
using (
  bucket_id = 'business-logos'
  and (
    exists (
      select 1 from public.businesses b
      where b.id = (split_part(name, '/', 1))::uuid and b.owner_id = auth.uid()
    )
    or public.show_ops_can_access((split_part(name, '/', 1))::uuid)
  )
);

drop policy if exists business_logos_delete on storage.objects;
create policy business_logos_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'business-logos'
  and (
    exists (
      select 1 from public.businesses b
      where b.id = (split_part(name, '/', 1))::uuid and b.owner_id = auth.uid()
    )
    or public.show_ops_can_access((split_part(name, '/', 1))::uuid)
  )
);
