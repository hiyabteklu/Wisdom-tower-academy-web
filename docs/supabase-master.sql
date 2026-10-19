-- ============================================================
-- DO NOT RUN ON THE LIVE DATABASE. Historical file only.
-- This script re-creates open policies (`using (true)`, `auth.role() = 'authenticated'`, "Public read profiles basic",
-- "Anyone manage rate limits", update rights on orders and inquiries for every signed-in account). Policies ADD UP,
-- so running it would let every signed-in student read all profiles and orders and change orders, and would open
-- the rate-limit table to everyone. The live policies are stricter and use private.is_admin().
-- See docs/SQL_DO_NOT_RUN_ON_LIVE.md. Only the database owner changes the database.
-- ============================================================

-- ============================================================
-- Wisdom Tower — MASTER SCHEMA (idempotent, safe to re-run)
-- Supabase Dashboard → SQL Editor → New query → paste ALL → Run
-- ============================================================
-- Does NOT delete your data. Creates missing tables/columns,
-- re-applies RLS policies, storage bucket for receipts.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) PROFILES
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Public read profiles basic" on public.profiles;
create policy "Public read profiles basic" on public.profiles
  for select using (true);

-- ------------------------------------------------------------
-- 2) INQUIRIES (contact / request / custom)
-- ------------------------------------------------------------
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  service text,
  message text not null,
  status text not null default 'new'
);

alter table public.inquiries enable row level security;

drop policy if exists "Anyone can insert inquiries" on public.inquiries;
create policy "Anyone can insert inquiries" on public.inquiries
  for insert with check (true);

drop policy if exists "Users read own inquiries by email" on public.inquiries;
create policy "Users read own inquiries by email" on public.inquiries
  for select using (
    auth.jwt() ->> 'email' is not null
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "Authenticated read all inquiries" on public.inquiries;
create policy "Authenticated read all inquiries" on public.inquiries
  for select to authenticated using (true);

drop policy if exists "Authenticated update inquiries" on public.inquiries;
create policy "Authenticated update inquiries" on public.inquiries
  for update to authenticated using (true);

-- ------------------------------------------------------------
-- 3) ORDERS (academy packages)
-- ------------------------------------------------------------
create table if not exists public.orders (
  id text primary key,
  package_id text not null,
  package_name text not null,
  amount_etb numeric,
  status text not null default 'pending_payment',
  payment_method text,
  student_name text,
  phone text,
  email text,
  transaction_ref text,
  note text,
  receipt_url text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by text
);

alter table public.orders add column if not exists receipt_url text;
alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists verified_at timestamptz;
alter table public.orders add column if not exists verified_by text;
alter table public.orders add column if not exists amount_etb numeric;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists student_name text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists email text;
alter table public.orders add column if not exists transaction_ref text;
alter table public.orders add column if not exists note text;
alter table public.orders add column if not exists package_name text;
alter table public.orders add column if not exists package_id text;
alter table public.orders add column if not exists status text;
alter table public.orders add column if not exists created_at timestamptz default now();

create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_email_idx on public.orders (email);
create index if not exists orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

drop policy if exists "Anyone insert orders" on public.orders;
create policy "Anyone insert orders" on public.orders
  for insert with check (true);

drop policy if exists "Users read own orders" on public.orders;
create policy "Users read own orders" on public.orders
  for select using (
    (user_id is not null and auth.uid() = user_id)
    or (email is not null and auth.jwt() ->> 'email' is not null
        and lower(email) = lower(auth.jwt() ->> 'email'))
    or auth.role() = 'authenticated'
  );

drop policy if exists "Authenticated update orders" on public.orders;
create policy "Authenticated update orders" on public.orders
  for update to authenticated using (true);

-- ------------------------------------------------------------
-- 4) ENROLLMENTS
-- ------------------------------------------------------------
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  package_id text not null,
  package_name text,
  created_at timestamptz not null default now(),
  unique (user_id, package_id)
);

alter table public.enrollments add column if not exists email text;
alter table public.enrollments add column if not exists package_name text;

create index if not exists enrollments_user_idx on public.enrollments (user_id);
create index if not exists enrollments_email_idx on public.enrollments (email);

alter table public.enrollments enable row level security;

drop policy if exists "Users read own enrollments" on public.enrollments;
create policy "Users read own enrollments" on public.enrollments
  for select using (
    (user_id is not null and auth.uid() = user_id)
    or (email is not null and auth.jwt() ->> 'email' is not null
        and lower(email) = lower(auth.jwt() ->> 'email'))
    or auth.role() = 'authenticated'
  );

drop policy if exists "Authenticated insert enrollments" on public.enrollments;
create policy "Authenticated insert enrollments" on public.enrollments
  for insert to authenticated with check (true);

drop policy if exists "Anyone insert enrollments" on public.enrollments;
create policy "Anyone insert enrollments" on public.enrollments
  for insert with check (true);

-- ------------------------------------------------------------
-- 5) TALENT APPLICATIONS
-- ------------------------------------------------------------
create table if not exists public.talent_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  roles text,
  primary_role text,
  portfolio_url text,
  experience text,
  message text,
  status text not null default 'new'
);

alter table public.talent_applications enable row level security;

drop policy if exists "Anyone insert talent applications" on public.talent_applications;
create policy "Anyone insert talent applications" on public.talent_applications
  for insert with check (true);

drop policy if exists "Authenticated read talent applications" on public.talent_applications;
create policy "Authenticated read talent applications" on public.talent_applications
  for select to authenticated using (true);

drop policy if exists "Authenticated update talent applications" on public.talent_applications;
create policy "Authenticated update talent applications" on public.talent_applications
  for update to authenticated using (true);

-- ------------------------------------------------------------
-- 6) ACADEMIC RESULTS
-- ------------------------------------------------------------
create table if not exists public.academic_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_id text not null,
  title text not null,
  total int not null check (total > 0),
  correct int not null check (correct >= 0),
  missed int not null check (missed >= 0),
  percent numeric(5,1) not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists academic_results_user_scope_idx
  on public.academic_results (user_id, scope_id, created_at desc);

alter table public.academic_results enable row level security;

drop policy if exists "Users read own results" on public.academic_results;
create policy "Users read own results" on public.academic_results
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own results" on public.academic_results;
create policy "Users insert own results" on public.academic_results
  for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 7) QUESTION EXPLANATIONS (AI cache)
-- ------------------------------------------------------------
create table if not exists public.question_explanations (
  question_id text primary key,
  explanation text not null,
  subject text,
  difficulty text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.question_explanations enable row level security;

drop policy if exists "Anyone can read explanations" on public.question_explanations;
create policy "Anyone can read explanations" on public.question_explanations
  for select using (true);

drop policy if exists "Service insert explanations" on public.question_explanations;
create policy "Service insert explanations" on public.question_explanations
  for insert with check (true);

drop policy if exists "Service update explanations" on public.question_explanations;
create policy "Service update explanations" on public.question_explanations
  for update using (true);

-- ------------------------------------------------------------
-- 8) API RATE LIMITS
-- ------------------------------------------------------------
create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  hit_count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;

drop policy if exists "Anyone manage rate limits" on public.api_rate_limits;
create policy "Anyone manage rate limits" on public.api_rate_limits
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- 9) BUSINESS HUB
-- ------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  industry text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id text,
  service_name text not null,
  billing text default 'monthly',
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

create table if not exists public.business_updates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null default 'note',
  title text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- NOTE: column is metric_window (not "window" — reserved in PostgreSQL)
create table if not exists public.business_metrics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null,
  value text not null,
  metric_window text default '7d',
  recorded_at timestamptz not null default now()
);

create index if not exists businesses_owner_idx on public.businesses(owner_user_id);
create index if not exists business_subscriptions_biz_idx on public.business_subscriptions(business_id);
create index if not exists business_updates_biz_idx on public.business_updates(business_id);

alter table public.businesses enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.business_updates enable row level security;
alter table public.business_metrics enable row level security;

-- Businesses policies
drop policy if exists "Owners read own businesses" on public.businesses;
create policy "Owners read own businesses" on public.businesses
  for select using (owner_user_id = auth.uid() or auth.role() = 'authenticated');

drop policy if exists "Owners insert businesses" on public.businesses;
create policy "Owners insert businesses" on public.businesses
  for insert with check (true);

drop policy if exists "Owners update own businesses" on public.businesses;
create policy "Owners update own businesses" on public.businesses
  for update using (owner_user_id = auth.uid() or auth.role() = 'authenticated');

-- Subscriptions
drop policy if exists "Owners read subscriptions" on public.business_subscriptions;
create policy "Owners read subscriptions" on public.business_subscriptions
  for select using (
    exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or auth.role() = 'authenticated'))
  );

drop policy if exists "Anyone insert subscriptions" on public.business_subscriptions;
create policy "Anyone insert subscriptions" on public.business_subscriptions
  for insert with check (true);

drop policy if exists "Authenticated update subscriptions" on public.business_subscriptions;
create policy "Authenticated update subscriptions" on public.business_subscriptions
  for update to authenticated using (true);

-- Updates
drop policy if exists "Owners read updates" on public.business_updates;
create policy "Owners read updates" on public.business_updates
  for select using (
    exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or auth.role() = 'authenticated'))
  );

drop policy if exists "Owners insert updates" on public.business_updates;
create policy "Owners insert updates" on public.business_updates
  for insert with check (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid())
    or auth.role() = 'authenticated'
  );

-- Metrics
drop policy if exists "Owners read metrics" on public.business_metrics;
create policy "Owners read metrics" on public.business_metrics
  for select using (
    exists (select 1 from public.businesses b where b.id = business_id and (b.owner_user_id = auth.uid() or auth.role() = 'authenticated'))
  );

drop policy if exists "Authenticated write metrics" on public.business_metrics;
create policy "Authenticated write metrics" on public.business_metrics
  for insert to authenticated with check (true);

-- ------------------------------------------------------------
-- 10) STORAGE: payment-receipts
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('payment-receipts', 'payment-receipts', true, 8388608)
on conflict (id) do update
  set public = true,
      file_size_limit = 8388608;

drop policy if exists "Anyone upload payment receipts" on storage.objects;
drop policy if exists "Public read payment receipts" on storage.objects;
drop policy if exists "Authenticated manage payment receipts" on storage.objects;
drop policy if exists "payment-receipts insert anon" on storage.objects;
drop policy if exists "payment-receipts insert authenticated" on storage.objects;
drop policy if exists "payment-receipts select public" on storage.objects;
drop policy if exists "payment-receipts update auth" on storage.objects;
drop policy if exists "payment-receipts delete auth" on storage.objects;

create policy "payment-receipts insert anon"
  on storage.objects for insert to anon
  with check (bucket_id = 'payment-receipts');

create policy "payment-receipts insert authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-receipts');

create policy "payment-receipts select public"
  on storage.objects for select to public
  using (bucket_id = 'payment-receipts');

create policy "payment-receipts update auth"
  on storage.objects for update to authenticated
  using (bucket_id = 'payment-receipts');

create policy "payment-receipts delete auth"
  on storage.objects for delete to authenticated
  using (bucket_id = 'payment-receipts');

-- Done.
select 'Wisdom Tower master schema applied' as status;
