-- Run in Supabase SQL Editor
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-ipas', 'signed-ipas', false, 524288000, null)
on conflict (id) do nothing;

create table if not exists signing_jobs (
  id text primary key,
  created_at timestamptz default now(),
  status text default 'created',
  app_name text,
  bundle_id text,
  signed_ipa_path text,
  manifest_path text,
  error text
);
