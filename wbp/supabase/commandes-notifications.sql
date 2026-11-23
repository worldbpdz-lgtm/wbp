-- ============================================================================
-- World Business Plus — COMMANDES, CLIENTS & NOTIFICATIONS
-- ----------------------------------------------------------------------------
-- Une seule migration, à exécuter UNE fois :
--
--   Supabase → SQL Editor → New query → coller ce fichier → Run
--   (ou double-clic sur apply-commandes.bat, qui fait la même chose)
--
-- ADDITIVE et IDEMPOTENTE : elle ne supprime, ne renomme et ne réécrit aucune
-- table, colonne ou donnée existante. Ré-exécutable sans risque. Les sites qui
-- partagent cette base (Central Network) continuent de fonctionner sans rien
-- changer : chaque nouvelle colonne a une valeur par défaut.
--
-- Ce qu'elle ajoute :
--   • customers            fiches clients (CRM), liées automatiquement aux
--                          devis, commandes et messages par téléphone / e-mail ;
--   • orders               commandes : lignes, prix, remise, TVA, livraison,
--                          paiement, appels, historique, numéro CMD-2026-0001 ;
--   • quote_requests  +    numéro DEV-2026-0001, prix par ligne, notes,
--                          « pris en charge par », historique ;
--   • contact_messages +   notes, « pris en charge par », fiche client ;
--   • notifications        fil des notifications (cloche web + app mobile) ;
--   • notification_reads   « lu jusqu'à » par compte ;
--   • push_subscriptions   téléphones / ordinateurs abonnés aux notifications ;
--   • app_secrets          clés VAPID des notifications push (privé) ;
--   • doc_counters         compteurs des numéros de commande / devis.
--
-- SÉCURITÉ : toutes ces tables ont la Row Level Security activée et AUCUNE
-- policy — ni la clé anon (navigateur) ni un compte connecté ne peuvent les lire
-- ou les écrire. Seul le serveur (clé service_role) y accède.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0) FONCTIONS DE NORMALISATION
-- ----------------------------------------------------------------------------
-- Un même client tape son numéro de dix façons : « 0560 01 82 06 »,
-- « +213 560 018 206 », « 00213560018206 »… Pour le reconnaître, on compare une
-- forme canonique : chiffres seuls, indicatif 213 en tête.
--
-- ⚠️ DOIT rester identique à normPhone() dans lib/phone.js : le serveur cherche
-- un client avec la valeur calculée en JavaScript dans la colonne calculée ici.
-- ============================================================================
create or replace function wbp_norm_phone(p text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if p is null then return null; end if;
  -- Chiffres arabes (٠١٢… et ۰۱۲…) tapés depuis un clavier arabe → 0-9.
  d := translate(p, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '\D', '', 'g');
  if d = '' then return null; end if;
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if left(d, 3) <> '213' then
    if left(d, 1) = '0' then d := '213' || substr(d, 2);
    elsif length(d) = 9 then d := '213' || d;
    end if;
  end if;
  if length(d) < 8 or length(d) > 15 then return null; end if;
  return d;
end $$;

create or replace function wbp_norm_email(e text) returns text
language sql immutable as $$
  select case when position('@' in coalesce(e, '')) > 1 then lower(btrim(e)) else null end
$$;

-- ============================================================================
-- 1) CLIENTS (CRM)
-- ----------------------------------------------------------------------------
-- À ne pas confondre avec la table `clients`, qui est la liste des LOGOS
-- « Ils nous font confiance » du site public.
-- ============================================================================
create table if not exists customers (
  id               uuid primary key default gen_random_uuid(),
  site             text not null default 'wbp',
  name             text,                 -- interlocuteur
  company          text,                 -- société / institution
  phone            text,
  phone2           text,
  email            text,
  wilaya           text,
  city             text,
  address          text,
  kind             text,                 -- entreprise | institution | installateur | revendeur | particulier
  nif              text,                 -- identifiants fiscaux, imprimés sur les documents
  nis              text,
  rc               text,
  art              text,                 -- article d'imposition
  notes            text,                 -- notes internes (jamais visibles du client)
  source           text not null default 'website',
  phone_norm       text generated always as (wbp_norm_phone(phone)) stored,
  phone2_norm      text generated always as (wbp_norm_phone(phone2)) stored,
  email_norm       text generated always as (wbp_norm_email(email)) stored,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists customers_site_phone_key on customers(site, phone_norm) where phone_norm is not null;
create unique index if not exists customers_site_email_key on customers(site, email_norm) where email_norm is not null;
create index if not exists customers_site_phone2_idx on customers(site, phone2_norm) where phone2_norm is not null;
create index if not exists customers_site_activity_idx on customers(site, last_activity_at desc);
alter table customers enable row level security;

-- ============================================================================
-- 2) COMPTEURS DE NUMÉROS — CMD-2026-0001 / DEV-2026-0001
-- ----------------------------------------------------------------------------
-- Un compteur par site, par type de document et par année. L'incrément passe
-- par un « insert … on conflict do update … returning » : atomique, deux
-- commandes simultanées ne peuvent pas recevoir le même numéro.
-- ============================================================================
create table if not exists doc_counters (
  site  text not null,
  kind  text not null,          -- 'order' | 'quote'
  year  int  not null,
  last  int  not null default 0,
  primary key (site, kind, year)
);
alter table doc_counters enable row level security;

-- Fonction de TRIGGER (elle ne peut pas être appelée directement par l'API).
-- SECURITY DEFINER : elle écrit dans doc_counters (RLS sans policy) avec les
-- droits de son propriétaire. Indispensable pour la base PARTAGÉE : si l'autre
-- site (Central Network) enregistre ses demandes de devis avec sa clé anon ou
-- un compte connecté, son insertion échouerait sinon (« new row violates
-- row-level security policy for table doc_counters »).
create or replace function wbp_assign_doc_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare y int; n int; k text := tg_argv[0];
begin
  if new.number is not null and new.number <> '' then return new; end if;
  y := extract(year from (coalesce(new.created_at, now()) at time zone 'Africa/Algiers'))::int;
  insert into doc_counters (site, kind, year, last)
  values (coalesce(new.site, 'wbp'), k, y, 1)
  on conflict (site, kind, year) do update set last = doc_counters.last + 1
  returning last into n;
  new.number := (case k when 'order' then 'CMD' else 'DEV' end) || '-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end $$;

-- ============================================================================
-- 3) DEVIS — colonnes ajoutées à quote_requests
-- ============================================================================
alter table quote_requests add column if not exists number         text;
alter table quote_requests add column if not exists customer_id    uuid references customers(id) on delete set null;
alter table quote_requests add column if not exists source         text    not null default 'website';
alter table quote_requests add column if not exists notes          text;
alter table quote_requests add column if not exists assigned_to    text;
alter table quote_requests add column if not exists discount_type  text    not null default 'amount';
alter table quote_requests add column if not exists discount_value numeric not null default 0;
alter table quote_requests add column if not exists shipping_fee   numeric not null default 0;
alter table quote_requests add column if not exists tax_rate       numeric not null default 0;
alter table quote_requests add column if not exists subtotal       numeric;
alter table quote_requests add column if not exists total          numeric;
alter table quote_requests add column if not exists valid_until    date;
alter table quote_requests add column if not exists history        jsonb   not null default '[]'::jsonb;
alter table quote_requests add column if not exists updated_at     timestamptz not null default now();
-- Forme canonique du téléphone : recherche « 0560 01 82 06 » = « +213560018206 ».
alter table quote_requests add column if not exists phone_norm text generated always as (wbp_norm_phone(phone)) stored;
create index if not exists quote_requests_phone_idx on quote_requests(site, phone_norm) where phone_norm is not null;
create index if not exists quote_requests_customer_idx on quote_requests(customer_id);
create index if not exists quote_requests_site_status_idx on quote_requests(site, status, created_at desc);
create unique index if not exists quote_requests_site_number_key on quote_requests(site, number) where number is not null;

drop trigger if exists quote_requests_number_trg on quote_requests;
create trigger quote_requests_number_trg before insert on quote_requests
  for each row execute function wbp_assign_doc_number('quote');

-- Numérotation des devis déjà reçus, dans l'ordre d'arrivée.
do $$
declare r record; y int; n int;
begin
  for r in select id, site, created_at from quote_requests where number is null order by created_at, id loop
    y := extract(year from (coalesce(r.created_at, now()) at time zone 'Africa/Algiers'))::int;
    insert into doc_counters (site, kind, year, last) values (coalesce(r.site, 'wbp'), 'quote', y, 1)
    on conflict (site, kind, year) do update set last = doc_counters.last + 1
    returning last into n;
    update quote_requests set number = 'DEV-' || y || '-' || lpad(n::text, 4, '0') where id = r.id;
  end loop;
end $$;

-- ============================================================================
-- 4) MESSAGES — colonnes ajoutées à contact_messages
-- ============================================================================
alter table contact_messages add column if not exists customer_id uuid references customers(id) on delete set null;
alter table contact_messages add column if not exists notes       text;
alter table contact_messages add column if not exists assigned_to text;
alter table contact_messages add column if not exists history     jsonb not null default '[]'::jsonb;
alter table contact_messages add column if not exists updated_at  timestamptz not null default now();
alter table contact_messages add column if not exists phone_norm text generated always as (wbp_norm_phone(phone)) stored;
create index if not exists contact_messages_phone_idx on contact_messages(site, phone_norm) where phone_norm is not null;
create index if not exists contact_messages_customer_idx on contact_messages(customer_id);
create index if not exists contact_messages_site_status_idx on contact_messages(site, status, created_at desc);

-- ============================================================================
-- 5) COMMANDES
-- ============================================================================
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  site            text not null default 'wbp',
  number          text,
  status          text not null default 'pending',
  source          text not null default 'website',   -- website | quote | whatsapp | phone | email | visit | manual
  quote_id        uuid references quote_requests(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  -- Coordonnées FIGÉES au moment de la commande : modifier la fiche client
  -- plus tard ne doit pas réécrire un bon de commande déjà imprimé.
  customer_name   text,
  company         text,
  phone           text,
  email           text,
  wilaya          text,
  city            text,
  address         text,
  delivery_method text not null default 'delivery',  -- delivery | pickup | installation
  due_date        date,
  -- [{ key, product_id, code, name, qty, unit_price }]
  items           jsonb not null default '[]'::jsonb,
  discount_type   text    not null default 'amount', -- amount (DA) | percent (%)
  discount_value  numeric not null default 0,
  shipping_fee    numeric not null default 0,
  tax_rate        numeric not null default 0,        -- 0 = prix TTC sans ligne de TVA, 19 = TVA 19 %
  subtotal        numeric not null default 0,
  total           numeric not null default 0,
  paid_amount     numeric not null default 0,
  payment_method  text,
  customer_note   text,
  internal_note   text,
  assigned_to     text,
  call_attempts   int  not null default 0,
  history         jsonb not null default '[]'::jsonb,
  confirmed_at    timestamptz,
  confirmed_by    text,
  cancelled_at    timestamptz,
  cancel_reason   text,
  delivered_at    timestamptz,
  created_by      text,
  phone_norm      text generated always as (wbp_norm_phone(phone)) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Colonnes ajoutées après la première version du fichier : `create table if
-- not exists` ne les ajouterait pas à une table déjà créée.
alter table orders add column if not exists phone_norm text generated always as (wbp_norm_phone(phone)) stored;
alter table orders drop constraint if exists orders_status_chk;
alter table orders add  constraint orders_status_chk
  check (status in ('pending','confirmed','preparing','shipped','delivered','cancelled'));
alter table orders drop constraint if exists orders_delivery_chk;
alter table orders add  constraint orders_delivery_chk
  check (delivery_method in ('delivery','pickup','installation'));
alter table orders drop constraint if exists orders_discount_chk;
alter table orders add  constraint orders_discount_chk
  check (discount_type in ('amount','percent'));
create unique index if not exists orders_site_number_key on orders(site, number) where number is not null;
create index if not exists orders_site_status_idx  on orders(site, status, created_at desc);
create index if not exists orders_site_created_idx on orders(site, created_at desc);
create index if not exists orders_customer_idx     on orders(customer_id);
create index if not exists orders_quote_idx        on orders(quote_id);
create index if not exists orders_site_phone_idx   on orders(site, phone_norm, created_at desc) where phone_norm is not null;
alter table orders enable row level security;

drop trigger if exists orders_number_trg on orders;
create trigger orders_number_trg before insert on orders
  for each row execute function wbp_assign_doc_number('order');

-- ============================================================================
-- 6) NOTIFICATIONS
-- ============================================================================
create table if not exists notifications (
  id          bigint generated always as identity primary key,
  site        text not null default 'wbp',
  kind        text not null,              -- quote | order | message | review | team
  ref_type    text,                       -- quote | order | message | review
  ref_id      text,
  title       text not null,
  body        text,
  url         text,                       -- lien de l'application mobile
  admin_url   text,                       -- lien du back-office web
  actor_email text,                       -- auteur (événements d'équipe) — jamais notifié de sa propre action
  meta        jsonb not null default '{}'::jsonb,
  push_sent   int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_site_created_idx on notifications(site, created_at desc);
create index if not exists notifications_ref_idx on notifications(site, ref_type, ref_id);
alter table notifications enable row level security;

create table if not exists notification_reads (
  site         text not null default 'wbp',
  user_email   text not null,
  last_read_at timestamptz not null default now(),
  primary key (site, user_email)
);
alter table notification_reads enable row level security;

create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  site            text not null default 'wbp',
  user_email      text not null,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  device          text,                   -- « iPhone — app WBP », « Ordinateur — Chrome »…
  scope           text not null default '/mobile',  -- /mobile (app) | /admin (ordinateur)
  prefs           jsonb not null default '{}'::jsonb,
  fail_count      int  not null default 0,
  last_error      text,
  last_success_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists push_subscriptions_endpoint_key on push_subscriptions(endpoint);
create index if not exists push_subscriptions_site_user_idx on push_subscriptions(site, user_email);
alter table push_subscriptions enable row level security;

-- Clés privées (VAPID) : générées automatiquement par le serveur au premier
-- besoin si les variables d'environnement ne sont pas définies.
create table if not exists app_secrets (
  site       text not null default 'wbp',
  key        text not null,
  value      jsonb not null,
  created_at timestamptz not null default now(),
  primary key (site, key)
);
alter table app_secrets enable row level security;

-- ============================================================================
-- 7) REPRISE — fiches clients créées à partir des devis et messages existants
-- ----------------------------------------------------------------------------
-- Du plus ancien au plus récent : le premier contact fixe la date de création
-- de la fiche, les suivants complètent les champs vides et avancent la date de
-- dernière activité. Une fiche n'est créée que si l'on a un téléphone ou un
-- e-mail exploitable. Ne touche que les lignes pas encore liées (ré-exécutable).
-- ============================================================================
do $$
declare
  r record; cid uuid; pn text; en text; is_new boolean;
begin
  for r in
    select 'quote' as t, id, site, customer_name as name, company, phone, email, created_at
      from quote_requests where customer_id is null and site = 'wbp'
    union all
    select 'message', id, site, name, company, phone, email, created_at
      from contact_messages where customer_id is null and site = 'wbp'
    order by created_at
  loop
    pn := wbp_norm_phone(r.phone);
    en := wbp_norm_email(r.email);
    if pn is null and en is null then continue; end if;

    cid := null;
    if pn is not null then
      select id into cid from customers where site = r.site and (phone_norm = pn or phone2_norm = pn) limit 1;
    end if;
    if cid is null and en is not null then
      select id into cid from customers where site = r.site and email_norm = en limit 1;
    end if;

    is_new := cid is null;
    if is_new then
      insert into customers (site, name, company, phone, email, source, created_at, last_activity_at)
      values (
        r.site, nullif(btrim(r.name), ''), nullif(btrim(r.company), ''),
        case when pn is not null then r.phone end,
        -- l'e-mail n'est repris que s'il n'appartient pas déjà à une autre fiche
        case when en is not null and not exists (select 1 from customers c where c.site = r.site and c.email_norm = en) then r.email end,
        'website', r.created_at, r.created_at)
      returning id into cid;
    else
      update customers c set
        name    = coalesce(nullif(btrim(c.name), ''), nullif(btrim(r.name), '')),
        company = coalesce(nullif(btrim(c.company), ''), nullif(btrim(r.company), '')),
        phone   = case when c.phone_norm is null and pn is not null
                        and not exists (select 1 from customers x where x.site = r.site and x.phone_norm = pn)
                       then r.phone else c.phone end,
        email   = case when c.email_norm is null and en is not null
                        and not exists (select 1 from customers x where x.site = r.site and x.email_norm = en)
                       then r.email else c.email end,
        last_activity_at = greatest(c.last_activity_at, r.created_at)
      where c.id = cid;
    end if;

    if r.t = 'quote' then
      update quote_requests set customer_id = cid where id = r.id;
    else
      update contact_messages set customer_id = cid where id = r.id;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 8) DROITS DES FONCTIONS
-- ----------------------------------------------------------------------------
-- • wbp_assign_doc_number() : fonction de trigger (SECURITY DEFINER). Aucun
--   rôle public n'a à l'exécuter — on retire le droit à anon/authenticated.
-- • wbp_norm_phone / wbp_norm_email : fonctions PURES (texte → texte), sans
--   accès aux données. Elles calculent les colonnes phone_norm des tables
--   PARTAGÉES quote_requests et contact_messages : le rôle qui insère ou
--   modifie une ligne (y compris anon/authenticated si Central Network écrit
--   avec ces clés) doit pouvoir les exécuter, sinon son écriture échoue.
--   On les accorde donc explicitement. Les appeler en RPC ne révèle rien.
-- (Bloc protégé : les rôles anon/authenticated n'existent que sur Supabase.)
-- ============================================================================
do $$
declare fn text; ro text;
begin
  execute 'revoke execute on function wbp_assign_doc_number() from public';
  foreach ro in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = ro) then
      execute format('revoke execute on function wbp_assign_doc_number() from %I', ro);
    end if;
  end loop;
  foreach fn in array array['wbp_norm_phone(text)', 'wbp_norm_email(text)'] loop
    foreach ro in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = ro) then
        execute format('grant execute on function %s to %I', fn, ro);
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function wbp_assign_doc_number() to service_role';
  end if;
end $$;

-- ============================================================================
-- VÉRIFICATION — tout doit afficher « OK ».
-- ============================================================================
select 'customers' as objet, case when to_regclass('public.customers') is not null then 'OK' else 'MANQUANT' end as etat
union all select 'orders',             case when to_regclass('public.orders')             is not null then 'OK' else 'MANQUANT' end
union all select 'notifications',      case when to_regclass('public.notifications')      is not null then 'OK' else 'MANQUANT' end
union all select 'push_subscriptions', case when to_regclass('public.push_subscriptions') is not null then 'OK' else 'MANQUANT' end
union all select 'notification_reads', case when to_regclass('public.notification_reads') is not null then 'OK' else 'MANQUANT' end
union all select 'app_secrets',        case when to_regclass('public.app_secrets')        is not null then 'OK' else 'MANQUANT' end
union all select 'devis numérotés',    case when not exists (select 1 from quote_requests where number is null) then 'OK' else 'A VERIFIER' end
union all select 'fiches clients',     (select count(*)::text || ' fiche(s)' from customers where site = 'wbp')
union all select 'RLS sans policy',    case when (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
                                          where c.relname in ('customers','orders','notifications','notification_reads','push_subscriptions','app_secrets','doc_counters')) = 0
                                        then 'OK' else 'A VERIFIER' end;
