-- ============================================================================
-- MEILLEURES VENTES — section « Meilleures ventes » de la page d'accueil
-- ----------------------------------------------------------------------------
-- Liste PROPRE à la page d'accueil, distincte de la vitrine (featured_picks).
--
--   • featured_picks → PRIORITÉ dans le catalogue : les produits qui
--     remontent en tête de la page Produits.
--   • best_sellers   → contenu du carrousel « Meilleures ventes » de l'accueil.
--   • new_arrivals   → contenu du carrousel « Nouveaux arrivages ».
--
-- Un produit peut appartenir aux trois listes sans conflit.
-- La sélection et l'ordre se font dans /admin/best-sellers.
--
-- À lancer une seule fois : apply-bestsellers.bat, ou collez ce fichier dans
-- Supabase → SQL Editor → Run.
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

alter table best_sellers enable row level security;
drop policy if exists "public read best_sellers" on best_sellers;
create policy "public read best_sellers" on best_sellers for select using (true);

-- Sélection de départ : les produits marqués « Best-seller » dans leur fiche,
-- et à défaut la vitrine actuelle — c'est elle qui alimentait la section
-- jusqu'ici, donc l'accueil ne change pas d'aspect après la migration.
-- Ne fait rien si la liste contient déjà quelque chose.
insert into best_sellers (site, product_id, rank)
  select 'wbp', id, row_number() over (order by sort, id) - 1
  from products
  where badge = 'bestseller' and active
    and not exists (select 1 from best_sellers where site = 'wbp')
on conflict (site, product_id) do nothing;

insert into best_sellers (site, product_id, rank)
  select site, product_id, rank
  from featured_picks
  where site = 'wbp'
    and not exists (select 1 from best_sellers where site = 'wbp')
on conflict (site, product_id) do nothing;
