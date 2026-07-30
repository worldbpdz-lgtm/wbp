-- ============================================================================
-- World Business Plus — MISE À NIVEAU 2026-07
-- ----------------------------------------------------------------------------
-- Ajoute tout ce qui manquait pour gérer le site sans toucher au code :
--
--   1) IMAGES         · logo des marques, image des catégories, galerie produits
--                       + bucket de stockage public « media » (upload depuis /admin)
--   2) VITRINE        · table `featured_picks` : vous choisissez une catégorie,
--                       une marque, puis les produits qui apparaissent EN PREMIER
--                       (ordre libre, propre à chaque site)
--   3) POP-UP         · réglages du pop-up newsletter affiché à l'ouverture du site
--   4) ASSISTANT IA   · table `ai_config` (privée) pour brancher votre IA
--   5) MARQUES/CATÉG. · `short` devient optionnel (c'était la cause de l'erreur
--                       « null value in column short » à l'ajout d'une marque)
--
-- Idempotent : ré-exécutable sans risque.
-- Appliquer : double-cliquez apply-upgrade.bat (racine du projet)
--             ou collez ce fichier dans Supabase → SQL Editor → Run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1) IMAGES
-- ============================================================================

-- Logo de marque (uploadé depuis /admin/brands ou URL externe).
alter table brands     add column if not exists logo_url text;
-- Image d'illustration de catégorie (affichée sur les cartes de l'accueil).
alter table categories add column if not exists image_url text;
-- Galerie produit (tableau d'URLs) — déjà présente sur les installations récentes.
alter table products   add column if not exists images   jsonb not null default '[]'::jsonb;
alter table products   add column if not exists featured boolean not null default false;
create index if not exists products_featured_idx on products(featured) where featured;

-- ---- CORRECTIF « impossible d'ajouter une marque » -------------------------
-- brands.short était NOT NULL : laisser le champ « Abrégé » vide faisait
-- échouer l'insertion avec une erreur Postgres illisible. Il devient optionnel
-- (le code remplit automatiquement une valeur à partir du nom).
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='brands'
               and column_name='short' and is_nullable='NO') then
    alter table brands alter column short drop not null;
  end if;
end $$;
update brands set short = left(name, 14) where short is null or short = '';

-- ---- Bucket de stockage public pour les images -----------------------------
-- Les uploads se font côté serveur avec la clé service_role (elle contourne
-- RLS) ; le public a seulement le droit de LIRE les fichiers.
--
-- Selon les projets Supabase, les tables du schéma « storage » appartiennent au
-- rôle supabase_storage_admin : le rôle postgres utilisé par apply-upgrade.bat
-- n'a alors pas le droit d'y créer une policy. On isole donc cette partie dans
-- un bloc qui AVERTIT au lieu d'échouer — le reste de la migration passe, et il
-- suffit de créer le bucket à la main (30 secondes, marche à suivre affichée).
do $$
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true)
    on conflict (id) do update set public = true;
  exception when others then
    raise notice 'Bucket « media » non créé (%). Créez-le dans Supabase → Storage → New bucket → nom "media" → cochez Public.', sqlerrm;
  end;

  begin
    execute 'drop policy if exists "media public read" on storage.objects';
    execute 'create policy "media public read" on storage.objects for select using (bucket_id = ''media'')';
  exception when others then
    raise notice 'Policy de lecture publique non créée (%). Si le bucket « media » est marqué Public dans le tableau de bord, rien de plus n''est nécessaire.', sqlerrm;
  end;
end $$;

-- ============================================================================
-- 2) VITRINE — produits mis en avant, dans VOTRE ordre, par site
-- ============================================================================
create table if not exists featured_picks (
  id         bigint generated always as identity primary key,
  site       text not null default 'wbp',
  product_id text not null references products(id) on delete cascade,
  rank       int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists featured_picks_site_product_key on featured_picks(site, product_id);
create index        if not exists featured_picks_site_rank_idx     on featured_picks(site, rank);

alter table featured_picks enable row level security;
drop policy if exists "public read featured_picks" on featured_picks;
create policy "public read featured_picks" on featured_picks for select using (true);

-- Reprend les produits déjà cochés « ★ mis en avant » comme vitrine de départ
-- (une seule fois : ne fait rien si la vitrine contient déjà quelque chose).
insert into featured_picks (site, product_id, rank)
  select 'wbp', id, row_number() over (order by sort, id) - 1
  from products where featured
    and not exists (select 1 from featured_picks where site = 'wbp')
on conflict (site, product_id) do nothing;

-- ============================================================================
-- 3) POP-UP NEWSLETTER (réglages publics, par site)
-- ============================================================================
-- `settings` a une clé primaire (site, key) depuis multisite.sql ; on gère les
-- deux cas pour rester compatible avec une base non migrée.
do $$
declare has_site boolean;
begin
  select exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='settings' and column_name='site')
    into has_site;
  if has_site then
    insert into settings (site, key, value) values
      ('wbp', 'popup', '{"enabled":true,"delay":2200,"days":7,"image_url":null,
        "title":{"fr":"Rejoignez la newsletter WBP","en":"Join the WBP newsletter","ar":"انضم إلى نشرة WBP"},
        "sub":{"fr":"Nouveautés produits, arrivages et offres réservées aux professionnels — une fois par mois, sans spam.","en":"New products, fresh stock and pro-only offers — once a month, no spam.","ar":"منتجات جديدة ووصولات وعروض خاصة بالمهنيين — مرة في الشهر، بدون إزعاج."},
        "cta":{"fr":"Je m''inscris","en":"Subscribe","ar":"اشترك"},
        "perks":{"fr":["Nouveaux produits en avant-première","Offres réservées aux professionnels","Conseils de nos ingénieurs"],"en":["Early access to new products","Pro-only offers","Tips from our engineers"],"ar":["وصول مبكر للمنتجات الجديدة","عروض خاصة بالمهنيين","نصائح من مهندسينا"]}}'::jsonb)
    on conflict (site, key) do nothing;
  else
    insert into settings (key, value) values ('popup', '{"enabled":true,"delay":2200,"days":7}'::jsonb)
    on conflict (key) do nothing;
  end if;
end $$;

-- ============================================================================
-- 4) ASSISTANT IA — configuration PRIVÉE (jamais lisible par le navigateur)
-- ============================================================================
-- RLS activé SANS aucune policy = table accessible uniquement côté serveur
-- (clé service_role). La clé du widget et l'URL de votre plateforme IA ne
-- transitent donc jamais vers le navigateur du visiteur.
create table if not exists ai_config (
  site         text primary key default 'wbp',
  enabled      boolean not null default false,
  provider     text    not null default 'dtech',   -- 'dtech' | 'builtin'
  base_url     text,                                -- ex. https://app.messaging-ai.com
  widget_key   text,                                -- wgt_pk_…
  assistant    text    not null default 'Assistant WBP',
  greeting     jsonb   not null default '{}'::jsonb,
  suggestions  jsonb   not null default '[]'::jsonb,
  accent       text    not null default '#FF5A1F',
  updated_at   timestamptz not null default now()
);
alter table ai_config enable row level security;

insert into ai_config (site, enabled, provider, assistant, greeting, suggestions)
values ('wbp', true, 'builtin', 'Assistant WBP',
  '{"fr":"Bonjour 👋 Je suis l''assistant World Business Plus. Dites-moi ce que vous cherchez — caméra, alarme, écran interactif, réseau — et je vous guide vers le bon produit.","en":"Hi 👋 I''m the World Business Plus assistant. Tell me what you need — camera, alarm, interactive display, network — and I''ll point you to the right product.","ar":"مرحباً 👋 أنا مساعد World Business Plus. أخبرني بما تبحث عنه — كاميرا، إنذار، شاشة تفاعلية، شبكة — وسأرشدك إلى المنتج المناسب."}'::jsonb,
  '{"fr":["Quelles caméras pour un entrepôt ?","Kit alarme pour un bureau","Écran interactif pour salle de réunion","Demander un devis"],"en":["Which cameras for a warehouse?","Alarm kit for an office","Interactive display for a meeting room","Request a quote"],"ar":["أي كاميرات لمستودع؟","طقم إنذار لمكتب","شاشة تفاعلية لقاعة اجتماعات","طلب عرض سعر"]}'::jsonb)
on conflict (site) do nothing;

-- Journal des conversations de l'assistant (utile pour l'admin ; privé).
create table if not exists ai_messages (
  id         bigint generated always as identity primary key,
  site       text not null default 'wbp',
  session_id text,
  role       text not null,                        -- 'user' | 'assistant'
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_site_created_idx on ai_messages(site, created_at desc);
alter table ai_messages enable row level security;

-- ============================================================================
-- Terminé.
--   /admin/brands      → logo de marque (glisser-déposer)
--   /admin/categories  → image de catégorie
--   /admin/products    → photo principale + galerie
--   /admin/showcase    → choisir catégorie, marque et produits mis en avant
--   /admin/ai          → brancher votre assistant IA
--   /admin/settings    → pop-up newsletter
-- ============================================================================
