-- ============================================================================
-- NOUVEAUTÉS — « Nouveaux arrivages » sur la page d'accueil
-- ----------------------------------------------------------------------------
-- Même principe que la vitrine (featured_picks) mais dans une table séparée :
-- un produit peut donc être à la fois « Meilleure vente » et « Nouveauté ».
-- La sélection et l'ordre se font dans /admin/arrivals.
--
-- À lancer une seule fois : apply-arrivals.bat, ou collez ce fichier dans
-- Supabase → SQL Editor → Run.
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

alter table new_arrivals enable row level security;
drop policy if exists "public read new_arrivals" on new_arrivals;
create policy "public read new_arrivals" on new_arrivals for select using (true);

-- Sélection de départ : les produits déjà marqués « Nouveau » dans la fiche
-- produit. Ne fait rien si la liste contient déjà quelque chose.
insert into new_arrivals (site, product_id, rank)
  select 'wbp', id, row_number() over (order by sort, id) - 1
  from products
  where badge = 'new'
    and not exists (select 1 from new_arrivals where site = 'wbp')
on conflict (site, product_id) do nothing;
