import { Client } from 'pg';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * SUPABASE KEEP-ALIVE — une seule petite écriture par jour pour que le projet
 * Supabase (offre gratuite) ne soit jamais mis en pause.
 *
 * POURQUOI UNE ÉCRITURE ET PAS UN `SELECT 1`
 * Un projet du plan gratuit est mis en pause après ~7 jours sans activité
 * *utilisateur* sur la base, et un pg_cron qui tourne à l'intérieur de
 * l'instance ne compte pas : la requête doit venir de l'extérieur. C'est le
 * rôle du cron Vercel quotidien (vercel.json), qui appelle
 * `GET /api/cron/keep-alive`.
 *
 * Le compteur est le journal le moins cher possible : ouvrez la ligne
 * `keep_alive` dans l'éditeur de tables Supabase — `ticks` et `last_ping_at`
 * disent d'un coup d'œil si le planificateur tourne encore. Un
 * `last_ping_at` vieux de plus d'un jour ou deux, c'est l'alerte précoce que
 * ce projet dérive vers une mise en pause. Un simple ping ne laisse aucune
 * trace : c'est exactement comme ça qu'un keep-alive cassé passe inaperçu
 * jusqu'à ce que le site tombe.
 *
 * À supprimer le jour où le projet passe sur une offre payante (les projets
 * payants ne sont jamais mis en pause automatiquement).
 */

/**
 * DDL idempotent — identique dans les 4 projets. Aussi disponible à la main
 * dans supabase/keep-alive.sql, mais la route le joue elle-même : aucune
 * migration à lancer, aucun passage par le dashboard.
 *
 * Singleton par construction : `id` vaut 1 par défaut et un CHECK l'y épingle,
 * la table ne peut donc contenir qu'une seule ligne de compteur.
 */
export const KEEP_ALIVE_DDL = [
  `CREATE TABLE IF NOT EXISTS "keep_alive" (
     "id" smallint PRIMARY KEY DEFAULT 1,
     "ticks" integer NOT NULL DEFAULT 0,
     "last_ping_at" timestamptz NOT NULL DEFAULT now(),
     "source" text,
     "created_at" timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "keep_alive_singleton" CHECK ("id" = 1)
   )`,
  `INSERT INTO "keep_alive" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING`,
  // RLS activé, aucune policy : seul le serveur touche cette ligne (connexion
  // Postgres directe en tant que propriétaire de la table, qui contourne RLS,
  // ou clé service_role). La clé anon publique ne peut donc ni lire ni
  // incrémenter le compteur via PostgREST.
  `ALTER TABLE "keep_alive" ENABLE ROW LEVEL SECURITY`,
];

const UPSERT_SQL = `
  INSERT INTO "keep_alive" ("id", "ticks", "last_ping_at", "source")
  VALUES (1, 1, now(), $1)
  ON CONFLICT ("id") DO UPDATE
    SET "ticks" = "keep_alive"."ticks" + 1,
        "last_ping_at" = now(),
        "source" = EXCLUDED."source"
  RETURNING "ticks", "last_ping_at"
`;

/**
 * Postgres signale une table absente avec le SQLSTATE 42P01. On remonte la
 * chaîne `cause` : `pg` pose le code sur l'erreur elle-même, mais un wrapper
 * (driver, ORM) peut l'enterrer d'un cran — et ne regarder que le premier
 * niveau désactive silencieusement l'auto-réparation ci-dessous.
 */
function isUndefinedTable(err) {
  for (let e = err, depth = 0; e && depth < 4; depth++) {
    if (e.code === '42P01') return true;
    e = e.cause;
  }
  return /relation .* does not exist/i.test(`${err?.message ?? ''} ${err?.cause?.message ?? ''}`);
}

/**
 * Un Postgres local (dev) ne parle pas TLS : forcer `ssl` ferait échouer la
 * connexion avec « server does not support SSL ». On ne l'exige donc que hors
 * localhost — c'est-à-dire toujours, en production.
 */
function sslFor(connectionString) {
  const isLocal =
    /@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(connectionString) ||
    /sslmode=disable/i.test(connectionString);
  // Le pooler Supabase exige TLS mais présente un certificat que Node ne sait
  // pas valider seul ; la chaîne est de toute façon interne à Supabase.
  return isLocal ? false : { rejectUnauthorized: false };
}

/**
 * Chemin principal : connexion Postgres directe. C'est le seul chemin qui
 * peut CRÉER la table (l'API REST de Supabase ne fait pas de DDL), donc une
 * base vierge se soigne toute seule au premier tick.
 */
async function pingViaPostgres(source) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslFor(process.env.DATABASE_URL),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    // Une connexion, une fois par jour : le pooler « session » (port 5432)
    // n'a pas le temps de saturer ses ~15 places.
    application_name: 'wbp-keep-alive',
  });

  await client.connect();
  try {
    let healed = false;
    let rows;
    try {
      ({ rows } = await client.query(UPSERT_SQL, [source]));
    } catch (err) {
      if (!isUndefinedTable(err)) throw err;
      for (const statement of KEEP_ALIVE_DDL) await client.query(statement);
      healed = true;
      ({ rows } = await client.query(UPSERT_SQL, [source]));
    }
    const row = rows[0] || {};
    return {
      ticks: Number(row.ticks ?? 0),
      lastPingAt: new Date(row.last_ping_at ?? Date.now()).toISOString(),
      healed,
      via: 'postgres',
    };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Repli quand DATABASE_URL n'est pas configuré sur Vercel : on passe par
 * l'API REST avec la clé service_role. Lecture + écriture, donc pas
 * d'incrément atomique — sans importance à raison d'un tick par jour, mais
 * ce chemin ne peut PAS créer la table : lancez alors supabase/keep-alive.sql
 * une fois (ou ajoutez DATABASE_URL, c'est plus simple).
 */
async function pingViaRest(source) {
  const sb = createAdminClient();

  const { data: current, error: readError } = await sb
    .from('keep_alive')
    .select('ticks')
    .eq('id', 1)
    .maybeSingle();
  if (readError) throw new Error(`${readError.message} (table keep_alive absente ? lancez supabase/keep-alive.sql)`);

  const next = Number(current?.ticks ?? 0) + 1;
  const lastPingAt = new Date().toISOString();

  const { error: writeError } = await sb
    .from('keep_alive')
    .upsert({ id: 1, ticks: next, last_ping_at: lastPingAt, source }, { onConflict: 'id' });
  if (writeError) throw new Error(writeError.message);

  return { ticks: next, lastPingAt, healed: false, via: 'rest' };
}

/**
 * +1 sur le compteur. Lève une erreur si la base est injoignable : l'appelant
 * répond alors 503, et le journal d'échecs du planificateur est la seule
 * supervision dont on dispose.
 *
 * @param {string} source qui a pingué (`vercel-cron`, `manual`, …), stocké sur
 *   la ligne pour qu'un compteur figé reste traçable.
 */
export async function pingKeepAlive(source) {
  if (process.env.DATABASE_URL) return pingViaPostgres(source);
  return pingViaRest(source);
}

/**
 * Auth du cron, volontairement permissive si rien n'est configuré.
 *
 * Avec CRON_SECRET défini (Vercel l'envoie automatiquement en
 * `Authorization: Bearer $CRON_SECRET`), le secret est exigé. Sans secret, la
 * route reste ouverte au lieu de se fermer : refuser saboterait en silence la
 * seule mission de cette route, et le pire qu'un appelant anonyme puisse
 * faire est d'incrémenter un compteur. Définir CRON_SECRET reste conseillé.
 */
export function isKeepAliveAuthorized(req) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return { authorized: true, isProtected: false };

  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    new URL(req.url).searchParams.get('key') ||
    '';

  return { authorized: provided === secret, isProtected: true };
}

/** Vercel marque ses propres invocations de cron. */
export const pingSource = (req) =>
  req.headers.get('x-vercel-cron') ? 'vercel-cron' : 'manual';
