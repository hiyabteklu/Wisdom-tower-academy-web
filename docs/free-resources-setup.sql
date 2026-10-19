-- ============================================================
-- DO NOT RUN ON THE LIVE DATABASE. Historical file only.
-- The policies in sections 3 to 5 below (`to authenticated using (true)`) would let EVERY signed-in
-- student write to the free-resource tables and the free-resources storage bucket. The live policies
-- allow admins only. See docs/SQL_DO_NOT_RUN_ON_LIVE.md. Only the database owner changes the database.
-- ============================================================

-- ============================================================
-- Wisdom Tower Academy — Free resources (pages + items)
-- Run in Supabase → SQL Editor → New query → Run
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- 1) Page shells (intro / tips for each section)
create table if not exists public.free_resource_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in (
    'success-stories',
    'study-techniques',
    'campus-life',
    'universities',
    'departments',
    'scholarships'
  )),
  title text not null,
  subtitle text,
  body_md text not null default '',
  meta jsonb not null default '{}'::jsonb,
  cover_path text,
  published boolean not null default false,
  sort_order int not null default 0,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists free_resource_pages_slug_idx
  on public.free_resource_pages (slug);

insert into public.free_resource_pages (slug, title, subtitle, body_md, meta, published, sort_order)
values
  ('success-stories', 'Success Stories', 'Students who leveled up — one story at a time', '', '{}'::jsonb, false, 10),
  ('study-techniques', 'Study Techniques', 'Methods to learn faster and retain under pressure', '', '{}'::jsonb, false, 20),
  ('campus-life', 'Campus Life', 'Friends, focus, burnout, lectures, facilities and group work', '', '{}'::jsonb, false, 30),
  ('universities', 'Ethiopian Universities', 'Distance, climate, campuses, and first-year life — one university at a time', '', '{}'::jsonb, false, 40),
  ('departments', 'Department Info', 'What each field of study actually involves', '', '{}'::jsonb, false, 50),
  ('scholarships', 'Scholarship Info', 'Tips to apply well — plus live opportunities with deadlines', '', '{}'::jsonb, false, 60)
on conflict (slug) do nothing;

-- 2) Individual items (stories, universities, scholarship posts, department cards)
create table if not exists public.free_resource_items (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null check (page_slug in (
    'success-stories',
    'study-techniques',
    'campus-life',
    'universities',
    'departments',
    'scholarships'
  )),
  -- Discriminator for UI + public rendering
  kind text not null check (kind in (
    'success_story',
    'university',
    'scholarship',
    'department',
    'tip',
    'general'
  )),
  title text not null,
  subtitle text,
  body_md text not null default '',
  -- Main photo / logo
  image_path text,
  -- Extra images: [{"path":"…","caption":"…"}]
  gallery jsonb not null default '[]'::jsonb,
  -- Structured fields (campus list, deadline, score, region, link, etc.)
  meta jsonb not null default '{}'::jsonb,
  featured boolean not null default false,
  published boolean not null default false,
  sort_order int not null default 0,
  -- Scholarship deadlines (optional; also store human string in meta)
  deadline date,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists free_resource_items_page_idx
  on public.free_resource_items (page_slug, sort_order);
create index if not exists free_resource_items_published_idx
  on public.free_resource_items (page_slug, published);
create index if not exists free_resource_items_kind_idx
  on public.free_resource_items (kind);

-- 3) RLS pages
alter table public.free_resource_pages enable row level security;

drop policy if exists "free_resource_pages_select_published" on public.free_resource_pages;
create policy "free_resource_pages_select_published" on public.free_resource_pages
  for select using (published = true);

drop policy if exists "free_resource_pages_select_auth" on public.free_resource_pages;
create policy "free_resource_pages_select_auth" on public.free_resource_pages
  for select to authenticated using (true);

drop policy if exists "free_resource_pages_write_auth" on public.free_resource_pages;
create policy "free_resource_pages_write_auth" on public.free_resource_pages
  for all to authenticated using (true) with check (true);

-- 4) RLS items
alter table public.free_resource_items enable row level security;

drop policy if exists "free_resource_items_select_published" on public.free_resource_items;
create policy "free_resource_items_select_published" on public.free_resource_items
  for select using (published = true);

drop policy if exists "free_resource_items_select_auth" on public.free_resource_items;
create policy "free_resource_items_select_auth" on public.free_resource_items
  for select to authenticated using (true);

drop policy if exists "free_resource_items_write_auth" on public.free_resource_items;
create policy "free_resource_items_write_auth" on public.free_resource_items
  for all to authenticated using (true) with check (true);

-- 5) Storage (public images for cards / photos)
insert into storage.buckets (id, name, public)
values ('free-resources', 'free-resources', true)
on conflict (id) do nothing;

drop policy if exists "free_resources_public_read" on storage.objects;
create policy "free_resources_public_read" on storage.objects
  for select using (bucket_id = 'free-resources');

drop policy if exists "free_resources_auth_write" on storage.objects;
create policy "free_resources_auth_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'free-resources');

drop policy if exists "free_resources_auth_update" on storage.objects;
create policy "free_resources_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'free-resources');

drop policy if exists "free_resources_auth_delete" on storage.objects;
create policy "free_resources_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'free-resources');
