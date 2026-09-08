// ============================================================================
// Limitation de débit — protège les points d'entrée PUBLICS.
// ----------------------------------------------------------------------------
// POURQUOI :
// Les server actions publiques (devis, contact, avis, newsletter, statistiques)
// et /api/chat écrivent en base avec la clé service_role, qui contourne RLS.
// Elles étaient joignables sans aucune limite : un simple script pouvait
// insérer des dizaines de milliers de lignes en quelques minutes — base saturée,
// boîte mail noyée, quota Supabase épuisé, et pour /api/chat une facture d'IA
// sur le dos de quelqu'un d'autre.
//
// Ce module tient un compteur par (adresse IP + action) dans la mémoire du
// serveur. Simple et sans dépendance. Limite connue : sur Vercel, chaque
// instance a sa propre mémoire, donc la limite réelle est « N par instance ».
// C'est largement suffisant pour arrêter les scripts d'abus ; pour une
// protection stricte et partagée, brancher Upstash Redis plus tard.
// ============================================================================
import { headers } from 'next/headers';

const buckets = new Map();
let lastSweep = Date.now();

/** Purge les compteurs expirés (évite que la Map grossisse indéfiniment). */
function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}

/**
 * @param {string} key      identifiant de l'appelant + action (ex. "quote:1.2.3.4")
 * @param {number} limit    nombre d'appels autorisés par fenêtre
 * @param {number} windowMs durée de la fenêtre en millisecondes
 * @returns {{ok:boolean, retryAfter:number}}
 */
export function hit(key, limit, windowMs) {
  const now = Date.now();
  sweep(now);
  const cur = buckets.get(key);
  if (!cur || cur.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  cur.count += 1;
  if (cur.count > limit) return { ok: false, retryAfter: Math.ceil((cur.reset - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

/**
 * Adresse IP de l'appelant. Sur Vercel, x-forwarded-for est renseigné par la
 * plateforme et ne peut pas être usurpé par le client ; en local il peut être
 * absent, d'où le repli.
 */
export async function clientIp() {
  try {
    const h = await headers();
    const fwd = h.get('x-forwarded-for') || '';
    return (fwd.split(',')[0] || '').trim() || h.get('x-real-ip') || 'local';
  } catch { return 'local'; }
}

/** Raccourci pour les server actions : renvoie null si autorisé, sinon l'erreur. */
export async function guard(action, { limit = 5, windowMs = 60_000 } = {}) {
  const ip = await clientIp();
  const { ok, retryAfter } = hit(`${action}:${ip}`, limit, windowMs);
  if (ok) return null;
  return {
    ok: false,
    error: `Trop de tentatives. Réessayez dans ${retryAfter} seconde(s).`,
    rateLimited: true,
  };
}

/**
 * Piège à robots : un champ de formulaire invisible pour un humain. Rempli,
 * c'est un robot — on répond « ok » pour ne pas lui apprendre qu'il est repéré,
 * mais rien n'est enregistré.
 */
export function isBot(payload) {
  return Boolean(payload && typeof payload === 'object' && String(payload.website || payload._hp || '').trim());
}
