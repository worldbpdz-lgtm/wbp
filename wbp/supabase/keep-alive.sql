-- ============================================================
-- KEEP-ALIVE — anti mise en pause du projet Supabase (offre gratuite)
-- ============================================================
--
-- Normalement vous n'avez RIEN à lancer ici : la route
-- app/api/cron/keep-alive crée cette table toute seule au premier tick
-- (elle passe par DATABASE_URL). Ce fichier sert si vous préférez la créer
-- à la main, ou si DATABASE_URL n'est pas défini sur Vercel et que la route
-- doit se rabattre sur l'API REST — qui, elle, ne sait pas faire de DDL.
--
-- Rappel : un projet du plan gratuit est mis en pause après ~7 jours sans
-- activité *utilisateur* sur la base. Un pg_cron interne ne compte pas, la
-- requête doit venir de l'extérieur : c'est le cron Vercel quotidien qui
-- fait +1 sur `ticks`. `last_ping_at` sert d'indicateur — s'il se fige, le
-- planificateur ne tourne plus et le projet dérive vers la pause.
--
-- Idempotent : relançable sans risque.

CREATE TABLE IF NOT EXISTS "keep_alive" (
    "id" smallint PRIMARY KEY DEFAULT 1,
    "ticks" integer NOT NULL DEFAULT 0,
    "last_ping_at" timestamptz NOT NULL DEFAULT now(),
    "source" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "keep_alive_singleton" CHECK ("id" = 1)
);

INSERT INTO "keep_alive" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

-- RLS : la table n'est touchée que par le serveur (connexion Postgres directe
-- ou clé service_role, qui contourne RLS). On active RLS sans aucune policy,
-- donc la clé anon publique ne peut ni la lire ni l'écrire.
ALTER TABLE "keep_alive" ENABLE ROW LEVEL SECURITY;

-- Contrôle : où en est le compteur ?
-- SELECT ticks, last_ping_at, source FROM keep_alive;
