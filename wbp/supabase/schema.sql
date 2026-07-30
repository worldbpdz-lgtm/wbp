-- ============================================================================
-- World Business Plus — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor (once), then run seed.sql.
-- ============================================================================
create extension if not exists pgcrypto;

-- ---------- Catalog -------------------------------------------------------- --
create table if not exists brands (
  id          text primary key,
  name        text not null,
  short       text not null,
  color       text not null default '#FF5A1F',
  description jsonb not null default '{}'::jsonb,   -- { fr, en, ar }
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists categories (
  id         text primary key,
  icon       text not null default 'box',
  name       jsonb not null default '{}'::jsonb,    -- { fr, en, ar }
  blurb      jsonb not null default '{}'::jsonb,    -- { fr, en, ar }
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id            text primary key,
  cat           text references categories(id) on update cascade,
  brand         text references brands(id) on update cascade,
  name          text not null,
  code          text not null,
  badge         text,                                -- 'bestseller' | 'new' | null
  rating        numeric(2,1) not null default 0,
  reviews_count int  not null default 0,
  tag           jsonb not null default '{}'::jsonb,  -- { fr, en, ar }
  specs         jsonb not null default '[]'::jsonb,  -- [[k,v], ...]
  image_url     text,
  price         numeric,
  images        jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  featured      boolean not null default false,      -- mis en avant : affiché en premier dans le catalogue
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists products_cat_idx   on products(cat);
create index if not exists products_brand_idx on products(brand);
create index if not exists products_featured_idx on products(featured) where featured;

create table if not exists clients (
  id   serial primary key,
  name text not null,
  sort int not null default 0
);

-- ---------- User-generated / leads ---------------------------------------- --
create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id text references products(id) on delete cascade,
  author     text not null,
  rating     int  not null check (rating between 1 and 5),
  title      text,
  body       text not null,
  helpful    int  not null default 0,
  verified   boolean not null default false,
  approved   boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists reviews_product_idx on reviews(product_id);

create table if not exists quote_requests (
  id            uuid primary key default gen_random_uuid(),
  customer_name text,
  company       text,
  email         text,
  phone         text,
  message       text,
  items         jsonb not null default '[]'::jsonb,  -- [{id,name,code,qty}]
  status        text not null default 'new',          -- new | contacted | quoted | closed
  created_at    timestamptz not null default now()
);

create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  company    text,
  email      text,
  phone      text,
  subject    text,
  message    text,
  status     text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- Public (anon) key may ONLY read catalog data and approved reviews.
-- All writes & admin reads happen server-side with the SERVICE ROLE key,
-- which bypasses RLS. So no public write policies are defined (= denied).
-- ============================================================================
alter table brands                 enable row level security;
alter table categories             enable row level security;
alter table products               enable row level security;
alter table clients                enable row level security;
alter table reviews                enable row level security;
alter table quote_requests         enable row level security;
alter table contact_messages       enable row level security;
alter table newsletter_subscribers enable row level security;

drop policy if exists "public read brands"     on brands;
drop policy if exists "public read categories" on categories;
drop policy if exists "public read products"   on products;
drop policy if exists "public read clients"    on clients;
drop policy if exists "public read reviews"    on reviews;

create policy "public read brands"     on brands     for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public read products"   on products   for select using (active = true);
create policy "public read clients"    on clients    for select using (true);
create policy "public read reviews"    on reviews    for select using (approved = true);

-- ============================================================================
-- Dashboard add-ons: visitor analytics + editable site settings
-- ============================================================================
create table if not exists events (
  id         bigint generated always as identity primary key,
  type       text not null,            -- 'page_view' | 'product_view'
  path       text,
  product_id text,
  referrer   text,
  device     text,                     -- 'mobile' | 'tablet' | 'desktop'
  session_id text,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on events(created_at);
create index if not exists events_type_idx    on events(type);
create index if not exists events_product_idx on events(product_id);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table events   enable row level security;
alter table settings enable row level security;
-- events: writes happen server-side (service role); no public policies.
-- settings: public may read (the storefront needs contact/whatsapp/hero).
drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings for select using (true);
