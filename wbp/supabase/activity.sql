-- ============================================================================
-- Journal d'activité des comptes administrateurs — table `admin_activity`.
-- ----------------------------------------------------------------------------
-- Répond à la question « qui a fait quoi, quel jour, à quelle heure ». Chaque
-- action du back-office (enregistrement produit, modération d'un avis, envoi
-- d'une campagne, connexion…) y laisse une ligne.
--
-- Migration ADDITIVE : elle ne touche à aucune table existante. Ré-exécutable
-- sans risque (tout est `if not exists`).
--
-- Appliquer : double-clic sur apply-activity.bat  (ou `node scripts/apply-activity.mjs`)
-- ============================================================================

create table if not exists admin_activity (
  id           bigserial primary key,
  -- Site concerné : la base est partagée entre WBP et Central Network.
  site         text        not null default 'wbp',
  -- Qui : l'e-mail est la clé stable, le nom est celui affiché dans l'app.
  actor_email  text        not null,
  actor_name   text,
  -- Quoi : `action` est la clé technique (product.save…), `target` le libellé
  -- de l'élément concerné (nom du produit, n° de devis…).
  action       text        not null,
  target       text,
  -- Contexte libre (adresse IP, ancien/nouveau statut…) — non utilisé pour
  -- l'instant, présent pour ne pas avoir à migrer de nouveau.
  meta         jsonb,
  created_at   timestamptz not null default now()
);

-- Lecture principale de l'app mobile : « les N dernières actions de ce site ».
create index if not exists admin_activity_site_created_idx
  on admin_activity (site, created_at desc);

-- Vue « par compte » : filtre sur une personne, du plus récent au plus ancien.
create index if not exists admin_activity_actor_idx
  on admin_activity (actor_email, created_at desc);

-- ----------------------------------------------------------------------------
-- Row Level Security : ACTIVÉE, sans aucune policy.
-- Conséquence : ni la clé `anon` (navigateur) ni un compte connecté ne peuvent
-- lire ou écrire cette table directement. Seul le serveur, avec la clé
-- `service_role` (qui contourne RLS), y accède — c'est-à-dire les server
-- actions du back-office et les routes /api/mobile/*. Un journal d'audit ne
-- doit jamais être modifiable par celui qu'il surveille.
-- ----------------------------------------------------------------------------
alter table admin_activity enable row level security;

-- Purge automatique du vieux journal : on garde 12 mois glissants.
-- (Simple fonction appelable ; aucun cron n'est installé par cette migration.)
create or replace function prune_admin_activity() returns integer
language plpgsql as $$
declare n integer;
begin
  delete from admin_activity where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end $$;
