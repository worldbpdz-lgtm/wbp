// ============================================================================
// Outils SERVEUR des devis, commandes, messages et fiches clients.
// ----------------------------------------------------------------------------
// Ne jamais importer depuis un composant client : ce module utilise la clé
// service_role (via le client Supabase passé en paramètre).
// ============================================================================
import { normPhone, normEmail } from '@/lib/phone';
import { displayName } from '@/lib/activity';
import { SITE } from '@/lib/site';

// --------------------------------------------------------- erreurs Postgres --
// PGRST205 = table absente du cache de schéma, 42P01 = relation inexistante :
// la migration supabase/commandes-notifications.sql n'a pas été appliquée.
export const isMissingTable = (error) => {
  const m = String(error?.message || error || '');
  return error?.code === 'PGRST205' || error?.code === '42P01'
    || /relation .* does not exist|could not find the table/i.test(m);
};
export const isMissingColumn = (error) => {
  const m = String(error?.message || error || '');
  return error?.code === 'PGRST204' || error?.code === '42703'
    || /column .* does not exist|could not find the '.*' column/i.test(m);
};
export const isNotMigrated = (error) => isMissingTable(error) || isMissingColumn(error);

export const MIGRATION_HINT = 'La base n’est pas encore à jour pour les commandes et les clients. '
  + 'Ouvrez Supabase → SQL Editor → New query, collez le fichier supabase/commandes-notifications.sql '
  + 'du projet, cliquez Run, puis rechargez cette page.';

// ---------------------------------------------------------------- historique --
// Une entrée par événement : création, modification, changement de statut,
// appel, prise en charge… Lue sur la fiche (web et mobile). Bornée à 200
// entrées : au-delà, les plus anciennes sortent.
const MAX_HISTORY = 200;

export function historyEntry(user, type, text, extra = {}) {
  return {
    at: new Date().toISOString(),
    by: user?.email ? String(user.email).toLowerCase() : null,
    name: user ? displayName(user) : 'Site web',
    type,
    text: String(text || '').slice(0, 500),
    ...extra,
  };
}

export function appendHistory(list, ...entries) {
  const base = Array.isArray(list) ? list : [];
  return [...base, ...entries.filter(Boolean)].slice(-MAX_HISTORY);
}

// ---------------------------------------------------------- fiches clients --
const clip = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};

/**
 * Retrouve (ou crée) la fiche client correspondant à des coordonnées.
 *
 * Ordre de rapprochement : téléphone principal → second téléphone → e-mail.
 * Une fiche trouvée n'est jamais écrasée : on complète seulement ses champs
 * VIDES (le nom saisi par l'équipe gagne toujours sur celui tapé dans un
 * formulaire). Sans téléphone ni e-mail exploitable, aucune fiche n'est créée.
 *
 * Ne lève jamais : renvoie null si la table n'existe pas encore ou en cas
 * d'erreur — rattacher une fiche ne doit jamais faire échouer l'enregistrement
 * d'une commande ou d'un devis.
 */
export async function linkCustomer(sb, c = {}, { source = 'website', touch = true } = {}) {
  try {
    const pn = normPhone(c.phone);
    const en = normEmail(c.email);
    if (!pn && !en) return null;

    let found = null;
    if (pn) {
      const { data, error } = await sb.from('customers').select('*')
        .eq('site', SITE).or(`phone_norm.eq.${pn},phone2_norm.eq.${pn}`).limit(1);
      if (error) { if (isNotMigrated(error)) return null; throw error; }
      found = data?.[0] || null;
    }
    if (!found && en) {
      const { data, error } = await sb.from('customers').select('*')
        .eq('site', SITE).eq('email_norm', en).limit(1);
      if (error) { if (isNotMigrated(error)) return null; throw error; }
      found = data?.[0] || null;
    }

    const now = new Date().toISOString();
    if (found) {
      const patch = {};
      if (!found.name && clip(c.name, 200)) patch.name = clip(c.name, 200);
      if (!found.company && clip(c.company, 200)) patch.company = clip(c.company, 200);
      if (!found.wilaya && clip(c.wilaya, 80)) patch.wilaya = clip(c.wilaya, 80);
      if (!found.city && clip(c.city, 120)) patch.city = clip(c.city, 120);
      if (!found.address && clip(c.address, 400)) patch.address = clip(c.address, 400);
      // Téléphone / e-mail manquants : complétés seulement s'ils ne sont pas
      // déjà portés par une autre fiche (index unique).
      if (!found.phone_norm && pn) patch.phone = clip(c.phone, 60);
      else if (pn && found.phone_norm !== pn && !found.phone2_norm) patch.phone2 = clip(c.phone, 60);
      if (!found.email_norm && en) patch.email = clip(c.email, 200);
      if (touch) patch.last_activity_at = now;
      if (Object.keys(patch).length) {
        patch.updated_at = now;
        const { error } = await sb.from('customers').update(patch).eq('id', found.id);
        // Conflit d'unicité sur le téléphone ou l'e-mail : on retente sans eux.
        if (error) {
          delete patch.phone; delete patch.phone2; delete patch.email;
          await sb.from('customers').update(patch).eq('id', found.id);
        }
      }
      return found.id;
    }

    const row = {
      site: SITE,
      name: clip(c.name, 200),
      company: clip(c.company, 200),
      phone: pn ? clip(c.phone, 60) : null,
      email: en ? clip(c.email, 200) : null,
      wilaya: clip(c.wilaya, 80),
      city: clip(c.city, 120),
      address: clip(c.address, 400),
      source: clip(source, 30) || 'website',
      last_activity_at: now,
    };
    const ins = await sb.from('customers').insert(row).select('id').single();
    if (!ins.error) return ins.data.id;
    if (isNotMigrated(ins.error)) return null;
    // Course : la même fiche vient d'être créée par une autre requête.
    if (ins.error.code === '23505') {
      const again = await sb.from('customers').select('id')
        .eq('site', SITE).or([pn && `phone_norm.eq.${pn}`, en && `email_norm.eq.${orLit(en)}`].filter(Boolean).join(','))
        .limit(1);
      return again.data?.[0]?.id || null;
    }
    throw ins.error;
  } catch (e) {
    console.warn('[linkCustomer]', e?.message || e);
    return null;
  }
}

// ------------------------------------------------------------- à traiter --
/**
 * Compteurs « à traiter », partagés par toute l'équipe : nouveaux devis,
 * commandes à confirmer, nouveaux messages, avis en attente. Servent aux
 * pastilles du menu web, de l'onglet « Demandes » et de l'icône de l'app.
 */
export async function todoCounts(sb) {
  const head = { count: 'exact', head: true };
  const [q, o, m, r] = await Promise.all([
    sb.from('quote_requests').select('id', head).eq('site', SITE).eq('status', 'new'),
    sb.from('orders').select('id', head).eq('site', SITE).eq('status', 'pending'),
    sb.from('contact_messages').select('id', head).eq('site', SITE).eq('status', 'new'),
    sb.from('reviews').select('id', head).eq('site', SITE).eq('approved', false),
  ]);
  const quotes = q.count || 0;
  const orders = o.error ? 0 : (o.count || 0);
  const messages = m.count || 0;
  const reviews = r.count || 0;
  return {
    quotes, orders, messages, reviews,
    // Le badge de l'icône ne compte que ce qui demande un rappel client.
    total: quotes + orders + messages,
    ordersReady: !o.error,
  };
}

/** Recherche « contient » sûre pour la grammaire or() de PostgREST. */
export const orLit = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
