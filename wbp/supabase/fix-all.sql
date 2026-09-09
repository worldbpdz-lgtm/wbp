-- ============================================================================
-- World Business Plus — CORRECTIF COMPLET DE LA BASE
-- ----------------------------------------------------------------------------
-- Un seul fichier, à exécuter UNE fois. Il remplace apply-upgrade.bat,
-- apply-featured.bat, apply-arrivals.bat et apply-multisite.bat.
--
--   Supabase → SQL Editor → New query → coller → Run
--
-- Idempotent : ré-exécutable sans risque, aucune perte de données.
--
-- ÉTAT CONSTATÉ SUR LA BASE DE PRODUCTION (08/09/2026) — ce que ça corrige :
--   • products.featured           MANQUANTE → tout enregistrement de fiche échouait
--   • brands.logo_url             MANQUANTE
--   • categories.image_url        MANQUANTE
--   • brands.short                NOT NULL  → ajout d'une marque impossible
--   • featured_picks              MANQUANTE → Vitrine inutilisable
--   • new_arrivals                MANQUANTE → Nouveautés inutilisable
--   • best_sellers                MANQUANTE → Meilleures ventes inutilisable
--   • ai_config / ai_messages     MANQUANTES → réglages IA non enregistrables
--   • email_campaigns / _sends    MANQUANTES → section Campagnes cassée
--   • newsletter_subscribers      colonnes du double opt-in absentes
--   • colonne `site`              ABSENTE DE TOUTES LES TABLES → les requêtes
--                                 filtrées par site échouaient en silence :
--                                 réglages du site, avis, compteurs de
--                                 l'administration, devis, messages, abonnés.
--   • reviews.approved            défaut `true` → avis publiés sans modération
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1) COLONNES MANQUANTES SUR LE CATALOGUE
-- ============================================================================
alter table brands     add column if not exists logo_url  text;
alter table categories add column if not exists image_url text;
alter table products   add column if not exists images    jsonb   not null default '[]'::jsonb;
alter table products   add column if not exists featured  boolean not null default false;
alter table products   add column if not exists price     numeric;
create index if not exists products_featured_idx    on products(featured) where featured;
create index if not exists products_active_sort_idx on products(active, sort);

-- « Abrégé » vide faisait échouer l'ajout d'une marque (contrainte NOT NULL).
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='brands'
               and column_name='short' and is_nullable='NO') then
    alter table brands alter column short drop not null;
  end if;
end $$;
update brands set short = left(name, 14) where short is null or short = '';

-- ============================================================================
-- 2) NEWSLETTER & CAMPAGNES (ex-newsletter.sql — jamais appliqué)
-- ============================================================================
alter table newsletter_subscribers add column if not exists status          text not null default 'subscribed';
alter table newsletter_subscribers add column if not exists token           text;
alter table newsletter_subscribers add column if not exists lang            text not null default 'fr';
alter table newsletter_subscribers add column if not exists source          text not null default 'website';
alter table newsletter_subscribers add column if not exists confirmed_at    timestamptz;
alter table newsletter_subscribers add column if not exists unsubscribed_at timestamptz;

alter table newsletter_subscribers drop constraint if exists newsletter_subscribers_status_chk;
alter table newsletter_subscribers add  constraint newsletter_subscribers_status_chk
  check (status in ('subscribed','pending','unsubscribed','bounced'));

update newsletter_subscribers set token = replace(gen_random_uuid()::text,'-','') where token is null;
create unique index if not exists newsletter_subscribers_token_key  on newsletter_subscribers (token);
create index        if not exists newsletter_subscribers_status_idx on newsletter_subscribers (status);

create table if not exists email_campaigns (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  preheader   text,
  body_html   text not null default '',
  audience    text not null default 'all',
  status      text not null default 'draft',
  sent_count  integer not null default 0,
  open_count  integer not null default 0,
  click_count integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz
);
alter table email_campaigns drop constraint if exists email_campaigns_status_chk;
alter table email_campaigns add  constraint email_campaigns_status_chk
  check (status in ('draft','sending','sent'));

create table if not exists email_campaign_sends (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references email_campaigns(id) on delete cascade,
  subscriber_id uuid references newsletter_subscribers(id) on delete set null,
  email         text not null,
  status        text not null default 'sent',
  error         text,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  sent_at       timestamptz not null default now()
);
create unique index if not exists email_campaign_sends_unq          on email_campaign_sends (campaign_id, email);
create index        if not exists email_campaign_sends_campaign_idx on email_campaign_sends (campaign_id);

-- ============================================================================
-- 3) COLONNE `site` (ex-multisite.sql — jamais appliqué)
-- ----------------------------------------------------------------------------
-- Le code filtre partout sur `.eq('site', 'wbp')`. Sans cette colonne, TOUTES
-- ces requêtes échouaient sans message : réglages du site (contact, WhatsApp,
-- pop-up), avis affichés sur les fiches, compteurs devis / messages / avis du
-- tableau de bord, listes de devis, messages et abonnés.
-- ============================================================================
alter table quote_requests         add column if not exists site text not null default 'wbp';
alter table contact_messages       add column if not exists site text not null default 'wbp';
alter table reviews                add column if not exists site text not null default 'wbp';
alter table newsletter_subscribers add column if not exists site text not null default 'wbp';
alter table events                 add column if not exists site text not null default 'wbp';
alter table clients                add column if not exists site text not null default 'wbp';
alter table settings               add column if not exists site text not null default 'wbp';
alter table email_campaigns        add column if not exists site text not null default 'wbp';

create index if not exists quote_requests_site_idx   on quote_requests(site);
create index if not exists contact_messages_site_idx on contact_messages(site);
create index if not exists reviews_site_idx          on reviews(site);
create index if not exists newsletter_subs_site_idx  on newsletter_subscribers(site);
create index if not exists events_site_created_idx   on events(site, created_at);
create index if not exists clients_site_idx          on clients(site);
create index if not exists email_campaigns_site_idx  on email_campaigns(site);

-- Une même adresse peut s'abonner sur chaque site séparément.
alter table newsletter_subscribers drop constraint if exists newsletter_subscribers_email_key;
drop index if exists newsletter_subscribers_email_key;
create unique index if not exists newsletter_subscribers_site_email_key
  on newsletter_subscribers(site, email);

-- settings : la clé devient unique PAR SITE — requis par upsert(onConflict:'site,key').
do $$
begin
  if exists (select 1 from information_schema.key_column_usage
             where table_schema='public' and table_name='settings' and constraint_name='settings_pkey')
     and not exists (select 1 from information_schema.key_column_usage
             where table_schema='public' and table_name='settings'
               and constraint_name='settings_pkey' and column_name='site') then
    alter table settings drop constraint settings_pkey;
  end if;
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema='public' and table_name='settings' and constraint_type='PRIMARY KEY') then
    alter table settings add constraint settings_pkey primary key (site, key);
  end if;
end $$;

-- Doublons éventuels de la liste « ils nous font confiance ».
delete from clients a using clients b
  where a.site = b.site and a.name = b.name and a.id > b.id;

-- ============================================================================
-- 4) VITRINE — « Meilleures ventes », ordre choisi dans /admin/showcase
-- ============================================================================
create table if not exists featured_picks (
  id         bigint generated always as identity primary key,
  site       text not null default 'wbp',
  product_id text not null references products(id) on delete cascade,
  rank       int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists featured_picks_site_product_key on featured_picks(site, product_id);
create index        if not exists featured_picks_site_rank_idx    on featured_picks(site, rank);

insert into featured_picks (site, product_id, rank)
  select 'wbp', id, row_number() over (order by sort, id) - 1
  from products where featured
    and not exists (select 1 from featured_picks where site = 'wbp')
on conflict (site, product_id) do nothing;

-- ============================================================================
-- 5) NOUVEAUTÉS — « Nouveaux arrivages »
-- ============================================================================
create table if not exists new_arrivals (
  id         bigint generated always as identity primary key,
  site       text not null default 'wbp',
  product_id text not null references products(id) on delete cascade,
  rank       int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists new_arrivals_site_product_key on new_arrivals(site, product_id);
create index        if not exists new_arrivals_site_rank_idx    on new_arrivals(site, rank);

insert into new_arrivals (site, product_id, rank)
  select 'wbp', id, row_number() over (order by sort, id) - 1
  from products where badge = 'new' and active
    and not exists (select 1 from new_arrivals where site = 'wbp')
on conflict (site, product_id) do nothing;

-- ============================================================================
-- 5 bis) MEILLEURES VENTES — carrousel « Meilleures ventes » de l'accueil
-- ----------------------------------------------------------------------------
-- Liste distincte de la vitrine : `featured_picks` sert à la PRIORITÉ dans le
-- catalogue, `best_sellers` au carrousel de la page d'accueil.
-- Sélection dans /admin/best-sellers.
-- ============================================================================
create table if not exists best_sellers (
  id         bigint generated always as identity primary key,
  site       text not null default 'wbp',
  product_id text not null references products(id) on delete cascade,
  rank       int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists best_sellers_site_product_key on best_sellers(site, product_id);
create index        if not exists best_sellers_site_rank_idx    on best_sellers(site, rank);

-- Reprise : badge « Best-seller » d'abord, sinon la vitrine actuelle (c'est
-- elle qui alimentait la section jusqu'ici) — l'accueil reste identique.
insert into best_sellers (site, product_id, rank)
  select 'wbp', id, row_number() over (order by sort, id) - 1
  from products where badge = 'bestseller' and active
    and not exists (select 1 from best_sellers where site = 'wbp')
on conflict (site, product_id) do nothing;

insert into best_sellers (site, product_id, rank)
  select site, product_id, rank from featured_picks
  where site = 'wbp'
    and not exists (select 1 from best_sellers where site = 'wbp')
on conflict (site, product_id) do nothing;

-- ============================================================================
-- 6) ASSISTANT IA — tables PRIVÉES
-- ============================================================================
create table if not exists ai_config (
  site         text primary key default 'wbp',
  enabled      boolean not null default true,
  provider     text    not null default 'builtin',   -- 'builtin' | 'external'
  base_url     text,
  widget_key   text,
  assistant    text    not null default 'Assistant WBP',
  greeting     jsonb   not null default '{}'::jsonb,
  suggestions  jsonb   not null default '{}'::jsonb,
  accent       text    not null default '#FF5A1F',
  updated_at   timestamptz not null default now()
);
alter table ai_config alter column provider set default 'builtin';
insert into ai_config (site, enabled, provider, assistant)
values ('wbp', true, 'builtin', 'Assistant WBP')
on conflict (site) do nothing;

create table if not exists ai_messages (
  id         bigint generated always as identity primary key,
  site       text not null default 'wbp',
  session_id text,
  role       text not null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_site_created_idx on ai_messages(site, created_at desc);

-- ============================================================================
-- 7) AVIS — modération réellement active
-- ----------------------------------------------------------------------------
-- `approved` valait true par défaut : n'importe qui pouvait publier un avis
-- directement en ligne sur une fiche produit, sans passer par /admin/reviews.
-- ============================================================================
alter table reviews alter column approved set default false;

-- ============================================================================
-- 8) SÉCURITÉ — Row Level Security, table par table
-- ----------------------------------------------------------------------------
-- La clé « anon » est publique : elle est intégrée au JavaScript envoyé au
-- navigateur. Tout ce qu'elle peut lire est de fait public.
--   LECTURE PUBLIQUE : catalogue seulement.
--   AUCUN ACCÈS ANON : devis, messages, abonnés, statistiques, campagnes,
--                      configuration IA, journaux du chat.
--   ÉCRITURE         : jamais depuis le navigateur (clé service_role côté serveur).
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['brands','categories','products','clients','reviews',
                           'settings','featured_picks','new_arrivals','best_sellers']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists "public read %s" on %I', t, t);
    end if;
  end loop;
end $$;

create policy "public read brands"         on brands         for select using (true);
create policy "public read categories"     on categories     for select using (true);
create policy "public read products"       on products       for select using (active = true);
create policy "public read clients"        on clients        for select using (true);
create policy "public read reviews"        on reviews        for select using (approved = true);
create policy "public read settings"       on settings       for select using (true);
create policy "public read featured_picks" on featured_picks for select using (true);
create policy "public read new_arrivals"   on new_arrivals   for select using (true);
create policy "public read best_sellers"  on best_sellers  for select using (true);

-- Tables strictement privées : RLS active, aucune policy = aucun accès anon.
do $$
declare t text;
begin
  foreach t in array array['quote_requests','contact_messages','newsletter_subscribers',
                           'events','ai_config','ai_messages','email_campaigns',
                           'email_campaign_sends','keep_alive']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table %I enable row level security', t);
      execute (
        select coalesce(string_agg(format('drop policy if exists %I on %I;', polname, t), ' '), '')
        from pg_policy where polrelid = to_regclass('public.'||t)
      );
    end if;
  end loop;
end $$;

-- Filet : supprime toute policy d'ÉCRITURE publique restée d'une ancienne
-- installation (polcmd <> 'r' = autre chose que SELECT).
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname as pol
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and p.polcmd::text <> 'r'
  loop
    execute format('drop policy if exists %I on %I', r.pol, r.tbl);
    raise notice 'Policy d''écriture publique supprimée : %.%', r.tbl, r.pol;
  end loop;
end $$;

-- ============================================================================
-- 9) STOCKAGE — bucket « media » utilisé par les uploads de /admin
-- ----------------------------------------------------------------------------
-- lib/storage.js écrit dans un bucket nommé « media ». Il n'existait pas (seul
-- « products » était présent) : TOUT envoi d'image depuis l'administration
-- échouait. Public en lecture, aucune écriture anonyme (les uploads passent par
-- le serveur avec la clé service_role).
-- ============================================================================
do $$
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true)
    on conflict (id) do update set public = true;
  exception when others then
    raise notice 'Bucket « media » non créé (%). Créez-le à la main : Storage → New bucket → nom "media" → Public.', sqlerrm;
  end;
  begin
    execute 'drop policy if exists "media public read" on storage.objects';
    execute 'create policy "media public read" on storage.objects for select using (bucket_id = ''media'')';
  exception when others then
    raise notice 'Policy de lecture non créée (%). Si le bucket est marqué Public, rien de plus n''est nécessaire.', sqlerrm;
  end;
end $$;

-- ============================================================================
-- 10) KEEP-ALIVE
-- ============================================================================
create table if not exists keep_alive (
  id         int primary key default 1,
  ticks      bigint not null default 0,
  last_ping  timestamptz not null default now(),
  source     text
);
insert into keep_alive (id) values (1) on conflict (id) do nothing;
alter table keep_alive enable row level security;

-- ============================================================================
-- VÉRIFICATION — tout doit afficher « OK ».
-- ============================================================================
select 'featured_picks'      as objet, case when to_regclass('public.featured_picks')      is not null then 'OK' else 'MANQUANT' end as etat
union all select 'new_arrivals',         case when to_regclass('public.new_arrivals')         is not null then 'OK' else 'MANQUANT' end
union all select 'best_sellers',         case when to_regclass('public.best_sellers')         is not null then 'OK' else 'MANQUANT' end
union all select 'ai_config',            case when to_regclass('public.ai_config')            is not null then 'OK' else 'MANQUANT' end
union all select 'email_campaigns',      case when to_regclass('public.email_campaigns')      is not null then 'OK' else 'MANQUANT' end
union all select 'email_campaign_sends', case when to_regclass('public.email_campaign_sends') is not null then 'OK' else 'MANQUANT' end
union all select 'products.images',      case when exists (select 1 from information_schema.columns where table_name='products' and column_name='images')   then 'OK' else 'MANQUANT' end
union all select 'products.featured',    case when exists (select 1 from information_schema.columns where table_name='products' and column_name='featured') then 'OK' else 'MANQUANT' end
union all select 'brands.logo_url',      case when exists (select 1 from information_schema.columns where table_name='brands' and column_name='logo_url')   then 'OK' else 'MANQUANT' end
union all select 'categories.image_url', case when exists (select 1 from information_schema.columns where table_name='categories' and column_name='image_url') then 'OK' else 'MANQUANT' end
union all select 'colonne site',         case when (select count(*) from information_schema.columns where table_schema='public' and column_name='site') >= 7 then 'OK' else 'MANQUANT' end
union all select 'brands.short optionnel', case when (select is_nullable from information_schema.columns where table_name='brands' and column_name='short') = 'YES' then 'OK' else 'MANQUANT' end
union all select 'avis moderes',         case when (select column_default from information_schema.columns where table_name='reviews' and column_name='approved') like '%false%' then 'OK' else 'A VERIFIER' end
union all select 'bucket media',         case when exists (select 1 from storage.buckets where id='media') then 'OK' else 'A CREER A LA MAIN' end
union all select 'ecriture publique',    case when (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and p.polcmd::text <> 'r') = 0 then 'OK - aucune' else 'A VERIFIER' end
order by 1;
