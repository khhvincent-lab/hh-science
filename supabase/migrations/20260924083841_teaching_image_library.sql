-- Curated global diagrams. All access goes through authenticated server routes.
create table public.teaching_images (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  subject text not null check (subject in ('physics','chemistry','biology','earth')),
  description text not null check (char_length(description) between 1 and 1500),
  keywords text[] not null check (cardinality(keywords) between 1 and 20),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  enabled boolean not null default false,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.teaching_images enable row level security;
revoke all on public.teaching_images from anon, authenticated;
grant select, insert, update, delete on public.teaching_images to service_role;
create index teaching_images_subject_active_idx on public.teaching_images(subject, enabled) where deleted_at is null;
create index teaching_images_created_by_idx on public.teaching_images(created_by);
comment on table public.teaching_images is 'Global curated handout diagrams. Server-only access; archived images remain available to their original solution owners.';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('teaching-images','teaching-images',false,3145728,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
