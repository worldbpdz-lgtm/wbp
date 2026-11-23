// ============================================================================
// Notifications de l'équipe — un événement, deux destinations.
// ----------------------------------------------------------------------------
//   1. une ligne dans `notifications` : le fil de la cloche, dans le back-office
//      web et dans l'application mobile (lu / non lu par compte) ;
//   2. un push vers chaque appareil abonné qui accepte ce type d'événement
//      (lib/push.js), avec le nombre de demandes à traiter pour le badge de
//      l'icône.
//
// RÈGLE : notifier ne doit JAMAIS faire échouer l'action notifiée. Toutes les
// fonctions avalent leurs erreurs ; elles sont appelées après la réponse au
// visiteur (`after()`), qui n'attend donc pas les services push.
// ============================================================================
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { pushEvent } from '@/lib/push';
import { todoCounts, isNotMigrated } from '@/lib/crm-server';
import { dzd } from '@/lib/pricing';
import { deliveryLabel, personOf } from '@/lib/crm';
import { displayName } from '@/lib/activity';

const cut = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const itemsCount = (items) => (Array.isArray(items) ? items.length : 0);

export async function notify(evt) {
  if (!hasSupabase()) return;
  try {
    const sb = createAdminClient();
    const row = {
      site: SITE,
      kind: evt.kind,
      ref_type: evt.refType || null,
      ref_id: evt.refId != null ? String(evt.refId) : null,
      title: cut(evt.title, 140),
      body: cut(evt.body, 300) || null,
      url: evt.url || null,
      admin_url: evt.adminUrl || null,
      actor_email: evt.actorEmail || null,
      meta: evt.meta || {},
    };
    const ins = await sb.from('notifications').insert(row).select('id').single();
    if (ins.error && !isNotMigrated(ins.error)) console.warn('[notify] insert:', ins.error.message);
    const id = ins.data?.id || null;

    let badge = null;
    try { badge = (await todoCounts(sb)).total; } catch { /* badge facultatif */ }
    const sent = await pushEvent(sb, { ...evt, id, title: row.title, body: row.body || '', badge });
    if (id && sent) await sb.from('notifications').update({ push_sent: sent }).eq('id', id);
  } catch (e) {
    console.warn('[notify]', e?.message || e);
  }
}

// ---------------------------------------------------------------- builders --
// Les textes tiennent sur un écran verrouillé : QUI, QUOI, combien.

export function notifyNewOrder(o) {
  const n = itemsCount(o.items);
  return notify({
    kind: 'order', refType: 'order', refId: o.id,
    title: `🛒 Nouvelle commande ${o.number || ''}`.trim(),
    body: [personOf(o), plural(n, 'article', 'articles'), o.wilaya, deliveryLabel(o.delivery_method)]
      .filter(Boolean).join(' · '),
    url: `/mobile/orders/${o.id}`,
    adminUrl: `/admin/orders/${o.id}`,
    meta: { number: o.number, phone: o.phone, items: n },
  });
}

export function notifyNewQuote(q) {
  const n = itemsCount(q.items);
  return notify({
    kind: 'quote', refType: 'quote', refId: q.id,
    title: `📄 Demande de devis ${q.number || ''}`.trim(),
    body: [personOf(q), n ? plural(n, 'article', 'articles') : null, q.message ? `« ${cut(q.message, 80)} »` : null]
      .filter(Boolean).join(' · '),
    url: `/mobile/inbox?open=quote:${q.id}`,
    adminUrl: `/admin/quotes/${q.id}`,
    meta: { number: q.number, phone: q.phone, items: n },
  });
}

export function notifyNewMessage(m) {
  return notify({
    kind: 'message', refType: 'message', refId: m.id,
    title: `✉️ Nouveau message — ${cut(personOf(m), 60)}`,
    body: [m.subject ? cut(m.subject, 70) : null, cut(m.message, 140)].filter(Boolean).join(' — '),
    url: `/mobile/inbox?open=message:${m.id}`,
    adminUrl: `/admin/messages/${m.id}`,
    meta: { phone: m.phone },
  });
}

export function notifyNewReview(r, productName) {
  return notify({
    kind: 'review', refType: 'review', refId: r.id,
    title: `⭐ Avis à modérer — ${r.rating}★`,
    body: [productName ? cut(productName, 60) : null, r.author, r.body ? `« ${cut(r.body, 90)} »` : null].filter(Boolean).join(' · '),
    url: '/mobile/reviews',
    adminUrl: '/admin/reviews?status=pending',
  });
}

const TEAM_TEXT = {
  confirmed: ['✅', 'confirmée'],
  cancelled: ['❌', 'annulée'],
  delivered: ['📦', 'livrée'],
  shipped: ['🚚', 'partie en livraison'],
};

/** Événement d'équipe sur une commande (jamais envoyé à son auteur). */
export function notifyOrderStatus(o, status, user, { reason } = {}) {
  const t = TEAM_TEXT[status];
  if (!t) return Promise.resolve();
  const who = user ? displayName(user) : 'L’équipe';
  return notify({
    kind: 'team', refType: 'order', refId: o.id,
    title: `${t[0]} ${o.number || 'Commande'} ${t[1]} par ${who}`,
    body: [personOf(o), Number(o.total) ? dzd(o.total) : null, reason ? `Motif : ${reason}` : null].filter(Boolean).join(' · '),
    url: `/mobile/orders/${o.id}`,
    adminUrl: `/admin/orders/${o.id}`,
    actorEmail: user?.email || null,
  });
}

export function notifyQuoteConverted(q, o, user) {
  const who = user ? displayName(user) : 'L’équipe';
  return notify({
    kind: 'team', refType: 'order', refId: o.id,
    title: `🤝 Devis ${q.number || ''} accepté — ${o.number || 'commande créée'}`.replace(/\s+/g, ' '),
    body: [personOf(o), `par ${who}`, Number(o.total) ? dzd(o.total) : null].filter(Boolean).join(' · '),
    url: `/mobile/orders/${o.id}`,
    adminUrl: `/admin/orders/${o.id}`,
    actorEmail: user?.email || null,
  });
}
