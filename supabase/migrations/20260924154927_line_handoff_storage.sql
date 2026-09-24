-- Server-only bucket: no anon/authenticated policies. Access uses expiring signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('line-handoffs', 'line-handoffs', false, 3000000, array['image/jpeg','application/json'])
on conflict (id) do nothing;
