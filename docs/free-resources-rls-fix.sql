-- ============================================================
-- DO NOT RUN ON THE LIVE DATABASE. Historical file only.
-- The live policies are stricter (admin-only writes through private.is_admin()).
-- The select policies below are open to every signed-in account (drafts included).
-- See docs/SQL_DO_NOT_RUN_ON_LIVE.md. Only the database owner changes the database.
-- ============================================================

-- ============================================================
-- Run this if published stories do not show for logged-out users
-- ============================================================

-- Pages: anyone can read published rows
drop policy if exists "free_resource_pages_select_published" on public.free_resource_pages;
create policy "free_resource_pages_select_published" on public.free_resource_pages
  for select to anon, authenticated
  using (published = true);

drop policy if exists "free_resource_pages_select_auth" on public.free_resource_pages;
create policy "free_resource_pages_select_auth" on public.free_resource_pages
  for select to authenticated
  using (true);

-- Items: anyone can read published rows
drop policy if exists "free_resource_items_select_published" on public.free_resource_items;
create policy "free_resource_items_select_published" on public.free_resource_items
  for select to anon, authenticated
  using (published = true);

drop policy if exists "free_resource_items_select_auth" on public.free_resource_items;
create policy "free_resource_items_select_auth" on public.free_resource_items
  for select to authenticated
  using (true);

-- Writes stay authenticated-only (already set in main setup)
