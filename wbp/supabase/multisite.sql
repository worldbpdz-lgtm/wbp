-- ============================================================================
-- WBP + Central Network — ONE shared database for BOTH websites
-- ----------------------------------------------------------------------------
-- After this migration:
--   • brands / categories / products stay SHARED: add or edit a product in
--     either admin (/admin) and BOTH websites update instantly.
--   • Everything else becomes per-site via a `site` column:
--       'wbp' = World Business Plus   ·   'cn' = Central Network
--     (quote requests, contact messages, reviews, newsletter subscribers,
--      analytics events, site settings, client list, e-mail campaigns)
--   • All existing rows are kept and assigned to 'wbp'.
--
-- Idempotent: safe to run several times.
-- Apply: double-click apply-multisite.bat (project root), or paste this file
--        in Supabase → SQL Editor (run newsletter.sql first if never done).
--
-- NOTE: after this migration, do NOT re-run setup.sql (its settings seed
--       still targets the old primary key). Day-to-day changes are made from
--       the /admin panel of either site.
-- ============================================================================

-- 1) Per-site column (existing data belongs to World Business Plus)
alter table quote_requests         add column if not exists site text not null default 'wbp';
alter table contact_messages       add column if not exists site text not null default 'wbp';
alter table reviews                add column if not exists site text not null default 'wbp';
alter table newsletter_subscribers add column if not exists site text not null default 'wbp';
alter table events                 add column if not exists site text not null default 'wbp';
alter table clients                add column if not exists site text not null default 'wbp';
alter table settings               add column if not exists site text not null default 'wbp';

-- e-mail campaigns table exists only if newsletter.sql was applied
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'email_campaigns') then
    alter table email_campaigns add column if not exists site text not null default 'wbp';
    create index if not exists email_campaigns_site_idx on email_campaigns(site);
  end if;
end $$;

-- 2) Indexes for per-site queries
create index if not exists quote_requests_site_idx        on quote_requests(site);
create index if not exists contact_messages_site_idx      on contact_messages(site);
create index if not exists reviews_site_idx               on reviews(site);
create index if not exists newsletter_subs_site_idx       on newsletter_subscribers(site);
create index if not exists events_site_created_idx        on events(site, created_at);
create index if not exists clients_site_idx               on clients(site);

-- 3) Newsletter: the same e-mail may now subscribe on each site separately
alter table newsletter_subscribers drop constraint if exists newsletter_subscribers_email_key;
drop index if exists newsletter_subscribers_email_key;
create unique index if not exists newsletter_subscribers_site_email_key
  on newsletter_subscribers(site, email);

-- 4) Settings: a key is now unique PER SITE (primary key becomes (site, key))
do $$
begin
  -- drop the old single-column primary key if it is still in place
  if exists (
    select 1 from information_schema.key_column_usage
    where table_schema = 'public' and table_name = 'settings'
      and constraint_name = 'settings_pkey'
  ) and not exists (
    select 1 from information_schema.key_column_usage
    where table_schema = 'public' and table_name = 'settings'
      and constraint_name = 'settings_pkey' and column_name = 'site'
  ) then
    alter table settings drop constraint settings_pkey;
  end if;
  -- (re)create the composite primary key
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'settings'
      and constraint_type = 'PRIMARY KEY'
  ) then
    alter table settings add constraint settings_pkey primary key (site, key);
  end if;
end $$;

-- 5) Client list ("they trust us"):
--    a) remove duplicates that older setup.sql re-runs may have created
delete from clients a using clients b
  where a.site = 'wbp' and b.site = 'wbp' and a.name = b.name and a.id > b.id;
--    b) give Central Network its own starting copy of the list (runs once)
insert into clients (name, sort, site)
  select name, sort, 'cn' from clients
  where site = 'wbp'
    and not exists (select 1 from clients c where c.site = 'cn');

-- Done. Catalog stays shared; each site now keeps its own leads & settings.
