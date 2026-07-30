-- ============================================================================
-- Produits "mis en avant" (featured)
-- ----------------------------------------------------------------------------
-- Ajoute une colonne `featured` sur les produits : l'admin coche les produits
-- qu'il veut voir apparaître EN PREMIER dans le catalogue public — dans
-- « Tous les produits » comme dans les résultats filtrés (catégorie / marque).
--
-- Idempotent : peut être exécuté plusieurs fois sans risque.
-- Appliquer : double-cliquer apply-featured.bat (racine du projet), ou coller
--             ce fichier dans Supabase → SQL Editor.
-- ============================================================================

alter table products add column if not exists featured boolean not null default false;

-- Index partiel : seuls les produits mis en avant y figurent (liste courte).
create index if not exists products_featured_idx on products(featured) where featured;

-- Fin. Cochez ensuite l'étoile ★ dans /admin/products (ou la case
-- « Mis en avant » dans la fiche produit) pour choisir les produits.
