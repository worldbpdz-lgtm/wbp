-- ============================================================================
-- Fiches techniques (PDF) — colonne `products.docs`.
-- ----------------------------------------------------------------------------
-- Chaque produit peut porter jusqu'à 6 documents téléversés depuis /admin
-- (fiche technique constructeur, manuel d'installation, certificat, notice
-- firmware…). Le client les voit et les télécharge depuis la fiche produit.
--
-- Forme du contenu — un tableau JSON, un objet par document :
--   [{ "label": "Fiche technique", "url": "https://…/docs/xxx.pdf",
--      "name": "DH-IPC-HDBW5541R.pdf", "size": 482113 }]
--
-- Pourquoi jsonb et pas une table à part : un document n'existe jamais sans
-- son produit, ne se partage pas entre produits, et n'est jamais interrogé
-- autrement que « les documents de ce produit ». Une table séparée ajouterait
-- une jointure à chaque affichage de fiche pour aucun gain.
--
-- Migration ADDITIVE : aucune colonne existante n'est modifiée ni supprimée.
-- Ré-exécutable sans risque.
--
-- Appliquer : double-clic sur apply-documents.bat
-- ============================================================================

alter table products add column if not exists docs jsonb not null default '[]'::jsonb;

-- Index partiel : sert la question « quels produits ont au moins un document »
-- (compteur du back-office, futur filtre « avec fiche technique » au catalogue).
-- Partiel = il n'indexe que les produits concernés, donc il reste minuscule
-- tant que la majorité du catalogue n'a pas encore de PDF.
create index if not exists products_docs_idx
  on products ((jsonb_array_length(docs)))
  where jsonb_array_length(docs) > 0;

-- ----------------------------------------------------------------------------
-- Les PDF vivent dans le bucket public « media » (le même que les photos),
-- sous-dossier docs/. Il est créé par supabase/upgrade.sql ; on le remet ici
-- pour que cette migration soit autonome si elle est jouée en premier.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Vérification finale : la colonne est-elle bien là ?
select case
  when exists (
    select 1 from information_schema.columns
    where table_name = 'products' and column_name = 'docs'
  ) then 'OK — products.docs prête'
  else 'MANQUANT'
end as resultat;
