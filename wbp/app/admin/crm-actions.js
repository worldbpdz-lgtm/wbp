'use server';
// ============================================================================
// Server actions — COMMANDES, DEVIS, MESSAGES, FICHES CLIENTS, NOTIFICATIONS.
// ----------------------------------------------------------------------------
// Appelées par le back-office web ET par l'application mobile : une commande
// confirmée au téléphone passe par exactement le même code qu'une commande
// confirmée sur ordinateur (contrôles, historique, journal, notifications).
//
// Chaque action :
//   • revérifie la session et l'appartenance à ADMIN_EMAILS (requireAdmin) et
//     écrit une ligne dans le journal d'activité ;
//   • filtre par site — la base est partagée avec Central Network ;
//   • ne fait confiance à rien de ce qu'envoie le navigateur : champs bornés,
//     montants recalculés ici, statuts vérifiés contre une liste fermée ;
//   • renvoie { ok:false, error } avec un message lisible au lieu de lever.
// ============================================================================
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { adminEmails, isAdminEmail } from '@/lib/admin';
import { displayName } from '@/lib/activity';
import { SITE } from '@/lib/site';
import { normPhone, normEmail } from '@/lib/phone';
import { computeTotals, sanitizeLines, sanitizePricing, cleanMoney } from '@/lib/pricing';
import {
  ORDER_STATUSES, QUOTE_STATUSES, MESSAGE_STATUSES, CALL_OUTCOMES, CUSTOMER_KINDS,
  ORDER_SOURCES, PAYMENT_METHODS, orderStatus, quoteStatus, messageStatus, callLabel,
} from '@/lib/crm';
import {
  linkCustomer, historyEntry, appendHistory, isNotMigrated, MIGRATION_HINT, orLit,
} from '@/lib/crm-server';
import { notifyOrderStatus, notifyQuoteConverted } from '@/lib/notify';

const s = (v, max = 4000) => {
  if (v == null) return null;
  const t = String(v).trim().slice(0, max);
  return t || null;
};
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const ORDER_VALUES = ORDER_STATUSES.map((x) => x.value);
const QUOTE_VALUES = QUOTE_STATUSES.map((x) => x.value);
const MESSAGE_VALUES = MESSAGE_STATUSES.map((x) => x.value);
const SOURCE_VALUES = ORDER_SOURCES.map((x) => x.value);
const KIND_VALUES = CUSTOMER_KINDS.map((x) => x.value);
const DELIVERY_VALUES = ['delivery', 'pickup', 'installation'];

// Erreurs : message lisible, et le conseil de migration quand la base n'est
// pas encore à jour. Le détail technique reste dans les journaux du serveur.
function fail(where, error, what = 'Cette opération') {
  if (isNotMigrated(error)) return { ok: false, error: MIGRATION_HINT, migrate: true };
  const m = String(error?.message || error || '');
  console.error(`[${where}]`, m);
  if (/duplicate key|unique/i.test(m)) return { ok: false, error: `${what} existe déjà.` };
  if (/JWT|Invalid API key/i.test(m)) return { ok: false, error: 'Clé Supabase invalide — vérifiez SUPABASE_SERVICE_ROLE_KEY.' };
  return { ok: false, error: `${what} n’a pas pu être enregistré(e). Réessayez dans un instant.` };
}

const denied = { ok: false, error: 'Session expirée ou droits insuffisants. Rechargez la page et reconnectez-vous.' };

// requireAdmin lève quand la session a expiré : on le transforme en réponse
// lisible plutôt qu'en page d'erreur.
async function guardAdmin(action, target) {
  try { return await requireAdmin(action, target); } catch { return null; }
}

function revalidateCrm(...extra) {
  for (const p of ['/admin', '/admin/orders', '/admin/quotes', '/admin/messages', '/admin/customers',
    '/admin/notifications', '/mobile/inbox', ...extra].filter(Boolean)) revalidatePath(p);
}

/** Qui prend en charge : 'me', 'none' ou une adresse d'ADMIN_EMAILS. */
function resolveAssignee(mode, user) {
  if (mode === 'none' || mode === '' || mode == null) return { email: null };
  if (mode === 'me') return { email: String(user.email).toLowerCase() };
  const e = String(mode).toLowerCase();
  if (!isAdminEmail(e)) return { error: 'Ce compte ne fait pas partie de l’équipe.' };
  return { email: e };
}

// ============================================================================
// RECHERCHES (sélecteurs des formulaires)
// ============================================================================

/** Produits du catalogue pour ajouter une ligne (visibles ET masqués). */
export async function searchProducts(q) {
  const user = await guardAdmin();
  if (!user) return { ok: false, error: denied.error, items: [] };
  const term = s(q, 80);
  if (!term || term.length < 2) return { ok: true, items: [] };
  const sb = createAdminClient();
  const like = orLit(`%${term}%`);
  const { data, error } = await sb.from('products')
    .select('id,name,code,price,image_url,active,brand')
    .or(`name.ilike.${like},code.ilike.${like}`)
    .order('active', { ascending: false }).order('name').limit(20);
  if (error) return { ok: false, error: 'Recherche impossible.', items: [] };
  return { ok: true, items: data || [] };
}

/** Fiches clients : nom, société, e-mail, ou chiffres d'un téléphone. */
export async function searchCustomers(q) {
  const user = await guardAdmin();
  if (!user) return { ok: false, error: denied.error, items: [] };
  const term = s(q, 80);
  if (!term || term.length < 2) return { ok: true, items: [] };
  const sb = createAdminClient();
  const like = orLit(`%${term}%`);
  const ors = [`name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`];
  const digits = term.replace(/\D/g, '');
  if (digits.length >= 4) {
    const core = digits.replace(/^0+/, '');
    ors.push(`phone_norm.ilike.${orLit(`%${core}%`)}`, `phone2_norm.ilike.${orLit(`%${core}%`)}`);
  }
  const { data, error } = await sb.from('customers')
    .select('id,name,company,phone,email,wilaya,city,address,kind')
    .eq('site', SITE).or(ors.join(','))
    .order('last_activity_at', { ascending: false }).limit(12);
  if (error) return isNotMigrated(error) ? { ok: false, error: MIGRATION_HINT, items: [] } : { ok: false, error: 'Recherche impossible.', items: [] };
  return { ok: true, items: data || [] };
}

// ============================================================================
// COMMANDES
// ============================================================================

// Champs « contact » figés sur la commande.
function contactOf(input) {
  return {
    customer_name: s(input.customer_name, 200),
    company: s(input.company, 200),
    phone: s(input.phone, 60),
    email: s(input.email, 200),
    wilaya: s(input.wilaya, 80),
    city: s(input.city, 120),
    address: s(input.address, 400),
  };
}

const FIELD_LABELS = {
  customer_name: 'nom', company: 'société', phone: 'téléphone', email: 'e-mail', wilaya: 'wilaya',
  city: 'ville', address: 'adresse', delivery_method: 'mode de livraison', due_date: 'date prévue',
  items: 'articles', discount_type: 'remise', discount_value: 'remise', shipping_fee: 'frais de livraison',
  tax_rate: 'TVA', paid_amount: 'paiement', payment_method: 'mode de paiement', customer_note: 'note du client',
  internal_note: 'note interne', customer_id: 'fiche client', valid_until: 'validité', notes: 'notes',
  message: 'message', source: 'origine',
};

function changedFields(before, after) {
  const out = new Set();
  for (const k of Object.keys(after)) {
    if (!(k in FIELD_LABELS)) continue;
    const a = JSON.stringify(before?.[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a !== b) out.add(FIELD_LABELS[k]);
  }
  return [...out];
}

async function resolveCustomerId(sb, input, contact, source) {
  if (isUuid(input.customer_id)) {
    const { data } = await sb.from('customers').select('id').eq('site', SITE).eq('id', input.customer_id).maybeSingle();
    if (data?.id) {
      await sb.from('customers').update({ last_activity_at: new Date().toISOString() }).eq('id', data.id);
      return data.id;
    }
  }
  return linkCustomer(sb, { name: contact.customer_name, ...contact }, { source });
}

/**
 * Crée ou modifie une commande (formulaire complet, web ou mobile).
 * `expected_updated_at` : date de la version chargée par le formulaire. Si la
 * commande a changé entre-temps (un collègue l'a modifiée), on refuse plutôt
 * que d'écraser son travail sans que personne ne le voie.
 */
export async function saveOrder(input = {}) {
  const isNew = !isUuid(input.id);
  const user = await guardAdmin(isNew ? 'createOrder' : 'updateOrder', s(input.number, 40) || s(input.customer_name, 80));
  if (!user) return denied;
  const sb = createAdminClient();

  const contact = contactOf(input);
  if (!contact.customer_name && !contact.company && !contact.phone) {
    return { ok: false, error: 'Indiquez au moins le nom du client, sa société ou son téléphone.' };
  }
  const items = sanitizeLines(input.items);
  const pricing = sanitizePricing(input);
  const totals = computeTotals({ items, ...pricing });
  const row = {
    ...contact,
    delivery_method: DELIVERY_VALUES.includes(input.delivery_method) ? input.delivery_method : 'delivery',
    due_date: isDate(input.due_date) ? input.due_date : null,
    items,
    ...pricing,
    subtotal: totals.subtotal,
    total: totals.total,
    paid_amount: cleanMoney(input.paid_amount, { allowNull: false }),
    payment_method: PAYMENT_METHODS.includes(input.payment_method) ? input.payment_method : s(input.payment_method, 60),
    customer_note: s(input.customer_note, 4000),
    internal_note: s(input.internal_note, 4000),
    updated_at: new Date().toISOString(),
  };

  if (isNew) {
    const source = SOURCE_VALUES.includes(input.source) ? input.source : 'manual';
    const status = ORDER_VALUES.includes(input.status) && input.status !== 'cancelled' ? input.status : 'pending';
    if (status !== 'pending' && (totals.unpriced || !items.length)) {
      return { ok: false, error: 'Pour créer la commande directement « confirmée », chaque ligne doit avoir un prix.' };
    }
    const customer_id = await resolveCustomerId(sb, input, contact, source);
    const now = new Date().toISOString();
    const ins = {
      site: SITE,
      ...row,
      source,
      status,
      customer_id,
      quote_id: isUuid(input.quote_id) ? input.quote_id : null,
      created_by: String(user.email).toLowerCase(),
      assigned_to: String(user.email).toLowerCase(),
      confirmed_at: status !== 'pending' ? now : null,
      confirmed_by: status !== 'pending' ? String(user.email).toLowerCase() : null,
      history: [historyEntry(user, 'created', `Commande créée (${(ORDER_SOURCES.find((x) => x.value === source) || {}).label || source}).`)],
    };
    const { data, error } = await sb.from('orders').insert(ins).select('id,number,updated_at').single();
    if (error) return fail('saveOrder/create', error, 'La commande');
    revalidateCrm();
    return { ok: true, id: data.id, number: data.number, updated_at: data.updated_at };
  }

  const { data: cur, error: e1 } = await sb.from('orders').select('*').eq('id', input.id).eq('site', SITE).maybeSingle();
  if (e1) return fail('saveOrder/read', e1, 'La commande');
  if (!cur) return { ok: false, error: 'Commande introuvable (supprimée ?).' };
  if (input.expected_updated_at && cur.updated_at && new Date(cur.updated_at).getTime() !== new Date(input.expected_updated_at).getTime()) {
    const last = Array.isArray(cur.history) ? cur.history[cur.history.length - 1] : null;
    return {
      ok: false, conflict: true,
      error: `Cette commande vient d’être modifiée${last?.name ? ` par ${last.name}` : ''}. Rechargez la page pour voir sa version, puis refaites vos changements.`,
    };
  }
  const customer_id = await resolveCustomerId(sb, input, contact, cur.source);
  const patch = { ...row, customer_id: customer_id || cur.customer_id };
  const changed = changedFields(cur, patch);
  if (changed.length) patch.history = appendHistory(cur.history, historyEntry(user, 'edit', `Modifié : ${changed.join(', ')}.`));
  const { data, error } = await sb.from('orders').update(patch).eq('id', cur.id).eq('site', SITE).select('id,number,updated_at').single();
  if (error) return fail('saveOrder/update', error, 'La commande');
  revalidateCrm(`/admin/orders/${cur.id}`, `/mobile/orders/${cur.id}`);
  return { ok: true, id: data.id, number: data.number, updated_at: data.updated_at, changed };
}

/** Change le statut d'une commande (confirmer, livrer, annuler…). */
export async function setOrderStatus(id, status, opts = {}) {
  if (!isUuid(id)) return { ok: false, error: 'Commande inconnue.' };
  if (!ORDER_VALUES.includes(status)) return { ok: false, error: 'Statut inconnu.' };
  const user = await guardAdmin('setOrderStatus', `commande → ${orderStatus(status).label}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: cur, error: e1 } = await sb.from('orders').select('*').eq('id', id).eq('site', SITE).maybeSingle();
  if (e1) return fail('setOrderStatus/read', e1, 'La commande');
  if (!cur) return { ok: false, error: 'Commande introuvable (supprimée ?).' };
  if (cur.status === status) return { ok: true, unchanged: true };

  const items = Array.isArray(cur.items) ? cur.items : [];
  if (status === 'confirmed' || status === 'preparing' || status === 'shipped' || status === 'delivered') {
    const t = computeTotals({ ...cur, items });
    const missing = [];
    if (!items.length) missing.push('au moins un article');
    if (t.unpriced) missing.push(`le prix de ${t.unpriced} ligne${t.unpriced > 1 ? 's' : ''}`);
    if (!cur.phone && !cur.email) missing.push('un téléphone ou un e-mail du client');
    if (missing.length) return { ok: false, error: `Avant de confirmer, il manque : ${missing.join(', ')}.` };
  }

  const now = new Date().toISOString();
  const reason = s(opts.reason, 200);
  const note = s(opts.note, 500);
  const patch = { status, updated_at: now };
  if (['confirmed', 'preparing', 'shipped', 'delivered'].includes(status) && !cur.confirmed_at) {
    patch.confirmed_at = now; patch.confirmed_by = String(user.email).toLowerCase();
  }
  if (status === 'delivered') patch.delivered_at = now;
  if (status === 'cancelled') { patch.cancelled_at = now; patch.cancel_reason = reason || 'Autre'; }
  if (cur.status === 'cancelled' && status !== 'cancelled') { patch.cancelled_at = null; patch.cancel_reason = null; }
  if (status === 'pending') { patch.confirmed_at = null; patch.confirmed_by = null; }
  if (!cur.assigned_to) patch.assigned_to = String(user.email).toLowerCase();

  const label = `${orderStatus(cur.status).label} → ${orderStatus(status).label}`;
  patch.history = appendHistory(cur.history, historyEntry(user, 'status',
    [label, reason && `motif : ${reason}`, note].filter(Boolean).join(' — '), { from: cur.status, to: status }));

  const { error } = await sb.from('orders').update(patch).eq('id', id).eq('site', SITE);
  if (error) return fail('setOrderStatus', error, 'Le statut');

  // Une commande confirmée issue d'un devis : le devis passe « Accepté ».
  if (cur.quote_id && ['confirmed', 'preparing', 'shipped', 'delivered'].includes(status)) {
    const { data: q } = await sb.from('quote_requests').select('id,status,history').eq('id', cur.quote_id).maybeSingle();
    if (q && q.status !== 'won') {
      await sb.from('quote_requests').update({
        status: 'won', updated_at: now,
        history: appendHistory(q.history, historyEntry(user, 'status', `Accepté — commande ${cur.number || ''} confirmée.`, { from: q.status, to: 'won' })),
      }).eq('id', q.id);
    }
  }

  after(() => notifyOrderStatus({ ...cur, ...patch }, status, user, { reason }));
  revalidateCrm(`/admin/orders/${id}`, `/mobile/orders/${id}`);
  // updated_at renvoyé : le formulaire ouvert garde la bonne version de
  // référence, sinon son prochain « Enregistrer » croirait à un conflit.
  return { ok: true, updated_at: now };
}

/** Note un appel au client (« pas de réponse », « rappeler »…). */
export async function logOrderCall(id, outcome, note) {
  if (!isUuid(id)) return { ok: false, error: 'Commande inconnue.' };
  const known = CALL_OUTCOMES.map((x) => x.value);
  const out = known.includes(outcome) ? outcome : 'no_answer';
  const user = await guardAdmin('logOrderCall', callLabel(out));
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: cur, error: e1 } = await sb.from('orders').select('id,history,call_attempts,assigned_to').eq('id', id).eq('site', SITE).maybeSingle();
  if (e1) return fail('logOrderCall/read', e1, 'L’appel');
  if (!cur) return { ok: false, error: 'Commande introuvable.' };
  const attempts = (cur.call_attempts || 0) + 1;
  const now = new Date().toISOString();
  const { error } = await sb.from('orders').update({
    call_attempts: attempts,
    updated_at: now,
    assigned_to: cur.assigned_to || String(user.email).toLowerCase(),
    history: appendHistory(cur.history, historyEntry(user, 'call',
      `Appel n°${attempts} : ${callLabel(out)}${s(note, 300) ? ` — ${s(note, 300)}` : ''}`, { outcome: out })),
  }).eq('id', id).eq('site', SITE);
  if (error) return fail('logOrderCall', error, 'L’appel');
  revalidateCrm(`/admin/orders/${id}`, `/mobile/orders/${id}`);
  return { ok: true, attempts, updated_at: now };
}

/** Prise en charge d'une commande, d'un devis ou d'un message. */
export async function assignItem(kind, id, mode) {
  const table = { order: 'orders', quote: 'quote_requests', message: 'contact_messages' }[kind];
  if (!table || !isUuid(id)) return { ok: false, error: 'Élément inconnu.' };
  const user = await guardAdmin('assignItem', `${kind} → ${mode === 'me' ? 'moi' : mode || 'personne'}`);
  if (!user) return denied;
  const who = resolveAssignee(mode, user);
  if (who.error) return { ok: false, error: who.error };
  const sb = createAdminClient();
  const { data: cur, error: e1 } = await sb.from(table).select('id,history,assigned_to').eq('id', id).eq('site', SITE).maybeSingle();
  if (e1) return fail('assignItem/read', e1, 'La prise en charge');
  if (!cur) return { ok: false, error: 'Élément introuvable.' };
  if ((cur.assigned_to || null) === who.email) return { ok: true, unchanged: true };
  const text = who.email ? `Pris en charge par ${displayName(who.email)}.` : 'Prise en charge retirée.';
  const now = new Date().toISOString();
  const { error } = await sb.from(table).update({
    assigned_to: who.email,
    updated_at: now,
    history: appendHistory(cur.history, historyEntry(user, 'assign', text)),
  }).eq('id', id).eq('site', SITE);
  if (error) return fail('assignItem', error, 'La prise en charge');
  revalidateCrm(kind === 'order' ? `/mobile/orders/${id}` : undefined);
  return { ok: true, assigned_to: who.email, updated_at: now };
}

/** Supprime une commande (erreur de saisie, spam). Irréversible. */
export async function deleteOrder(id) {
  if (!isUuid(id)) return { ok: false, error: 'Commande inconnue.' };
  const user = await guardAdmin('deleteOrder', `commande #${id}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { error } = await sb.from('orders').delete().eq('id', id).eq('site', SITE);
  if (error) return fail('deleteOrder', error, 'La commande');
  // Les notifications qui menaient à cette commande deviendraient des liens morts.
  await sb.from('notifications').delete().eq('site', SITE).eq('ref_type', 'order').eq('ref_id', id);
  revalidateCrm();
  return { ok: true };
}

/** Devis accepté → commande (lignes, prix et client repris). */
export async function convertQuoteToOrder(quoteId, opts = {}) {
  if (!isUuid(quoteId)) return { ok: false, error: 'Devis inconnu.' };
  const user = await guardAdmin('convertQuoteToOrder', `devis #${quoteId}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: q, error: e1 } = await sb.from('quote_requests').select('*').eq('id', quoteId).eq('site', SITE).maybeSingle();
  if (e1) return fail('convertQuote/read', e1, 'Le devis');
  if (!q) return { ok: false, error: 'Devis introuvable.' };

  // Déjà converti : on renvoie vers la commande existante, sans doublon.
  const ex = await sb.from('orders').select('id,number').eq('site', SITE).eq('quote_id', quoteId).limit(1);
  if (ex.error) return fail('convertQuote/check', ex.error, 'La commande');
  if (ex.data?.[0]) return { ok: true, id: ex.data[0].id, number: ex.data[0].number, existing: true };

  // Lignes du devis ; un prix manquant est complété par le prix catalogue.
  const raw = Array.isArray(q.items) ? q.items : [];
  const ids = [...new Set(raw.map((i) => s(i?.product_id ?? i?.id, 60)).filter(Boolean))];
  const { data: prods } = ids.length ? await sb.from('products').select('id,name,code,price').in('id', ids) : { data: [] };
  const byId = Object.fromEntries((prods || []).map((p) => [p.id, p]));
  const items = sanitizeLines(raw.map((i) => {
    const pid = s(i?.product_id ?? i?.id, 60);
    const p = byId[pid];
    return {
      key: i?.key, product_id: pid, code: i?.code || p?.code, name: i?.name || p?.name, qty: i?.qty,
      unit_price: i?.unit_price != null && i.unit_price !== '' ? i.unit_price : (p?.price ?? null),
    };
  }));
  const pricing = sanitizePricing(q);
  const totals = computeTotals({ items, ...pricing });
  let status = opts.status === 'pending' ? 'pending' : 'confirmed';
  let downgraded = false;
  if (status === 'confirmed' && (!items.length || totals.unpriced || (!q.phone && !q.email))) { status = 'pending'; downgraded = true; }

  const now = new Date().toISOString();
  const order = {
    site: SITE,
    status,
    source: 'quote',
    quote_id: q.id,
    customer_id: q.customer_id || null,
    customer_name: q.customer_name, company: q.company, phone: q.phone, email: q.email,
    delivery_method: 'delivery',
    items,
    ...pricing,
    subtotal: totals.subtotal,
    total: totals.total,
    customer_note: q.message,
    internal_note: q.notes,
    created_by: String(user.email).toLowerCase(),
    assigned_to: q.assigned_to || String(user.email).toLowerCase(),
    confirmed_at: status === 'confirmed' ? now : null,
    confirmed_by: status === 'confirmed' ? String(user.email).toLowerCase() : null,
    history: [historyEntry(user, 'created', `Commande créée depuis le devis ${q.number || ''}${status === 'confirmed' ? ', confirmée' : ''}.`.replace(/\s+,/, ','))],
  };
  if (!order.customer_id) order.customer_id = await linkCustomer(sb, { name: q.customer_name, company: q.company, phone: q.phone, email: q.email }, { source: 'quote' });
  const { data: o, error } = await sb.from('orders').insert(order).select('*').single();
  if (error) return fail('convertQuote/create', error, 'La commande');

  await sb.from('quote_requests').update({
    status: status === 'confirmed' ? 'won' : q.status === 'new' ? 'contacted' : q.status,
    updated_at: now,
    history: appendHistory(q.history, historyEntry(user, 'convert', `Converti en commande ${o.number || ''}.`)),
  }).eq('id', q.id);

  after(() => notifyQuoteConverted(q, o, user));
  revalidateCrm(`/admin/quotes/${q.id}`);
  return {
    ok: true, id: o.id, number: o.number, status,
    warn: downgraded ? 'Commande créée « À confirmer » : des prix ou les coordonnées du client manquent encore.' : null,
  };
}

/** Message de contact → nouvelle commande pré-remplie (à compléter). */
export async function createOrderFromMessage(messageId) {
  if (!isUuid(messageId)) return { ok: false, error: 'Message inconnu.' };
  const user = await guardAdmin('createOrderFromMessage', `message #${messageId}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: m, error: e1 } = await sb.from('contact_messages').select('*').eq('id', messageId).eq('site', SITE).maybeSingle();
  if (e1) return fail('orderFromMessage/read', e1, 'Le message');
  if (!m) return { ok: false, error: 'Message introuvable.' };
  const customer_id = m.customer_id || await linkCustomer(sb, m, { source: 'message' });
  const { data: o, error } = await sb.from('orders').insert({
    site: SITE, status: 'pending', source: 'message', customer_id,
    customer_name: m.name, company: m.company, phone: m.phone, email: m.email,
    customer_note: [m.subject, m.message].filter(Boolean).join(' — ').slice(0, 4000),
    created_by: String(user.email).toLowerCase(), assigned_to: String(user.email).toLowerCase(),
    history: [historyEntry(user, 'created', 'Commande créée depuis un message de contact.')],
  }).select('id,number').single();
  if (error) return fail('orderFromMessage', error, 'La commande');
  if (m.status === 'new') await sb.from('contact_messages').update({ status: 'read' }).eq('id', m.id);
  revalidateCrm();
  return { ok: true, id: o.id, number: o.number };
}

// ============================================================================
// DEVIS
// ============================================================================

/** Crée ou modifie un devis : coordonnées, lignes et prix, notes. */
export async function saveQuote(input = {}) {
  const isNew = !isUuid(input.id);
  const user = await guardAdmin(isNew ? 'createQuote' : 'updateQuote', s(input.number, 40) || s(input.customer_name, 80));
  if (!user) return denied;
  const sb = createAdminClient();
  const contact = {
    customer_name: s(input.customer_name, 200), company: s(input.company, 200),
    email: s(input.email, 200), phone: s(input.phone, 60),
  };
  if (!contact.customer_name && !contact.company && !contact.phone && !contact.email) {
    return { ok: false, error: 'Indiquez au moins le nom du client, sa société, son téléphone ou son e-mail.' };
  }
  const items = sanitizeLines(input.items);
  const pricing = sanitizePricing(input);
  const totals = computeTotals({ items, ...pricing });
  // Les lignes gardent aussi `id` (=produit) : c'est la forme que lit le reste
  // du site (tableau de bord, app mobile) depuis toujours.
  const lines = items.map((l) => ({ ...l, id: l.product_id }));
  const row = {
    ...contact,
    message: s(input.message, 4000),
    notes: s(input.notes, 4000),
    items: lines,
    ...pricing,
    subtotal: totals.subtotal,
    total: totals.total,
    valid_until: isDate(input.valid_until) ? input.valid_until : null,
    updated_at: new Date().toISOString(),
  };

  if (isNew) {
    const customer_id = await resolveCustomerId(sb, input, { ...contact }, 'manual');
    const source = SOURCE_VALUES.includes(input.source) ? input.source : 'manual';
    const ins = {
      site: SITE, ...row, source, customer_id,
      status: QUOTE_VALUES.includes(input.status) ? input.status : 'new',
      assigned_to: String(user.email).toLowerCase(),
      history: [historyEntry(user, 'created', 'Devis créé par l’équipe.')],
    };
    const { data, error } = await sb.from('quote_requests').insert(ins).select('id,number,updated_at').single();
    if (error) return fail('saveQuote/create', error, 'Le devis');
    revalidateCrm();
    return { ok: true, id: data.id, number: data.number, updated_at: data.updated_at };
  }

  const { data: cur, error: e1 } = await sb.from('quote_requests').select('*').eq('id', input.id).eq('site', SITE).maybeSingle();
  if (e1) return fail('saveQuote/read', e1, 'Le devis');
  if (!cur) return { ok: false, error: 'Devis introuvable (supprimé ?).' };
  if (input.expected_updated_at && cur.updated_at && new Date(cur.updated_at).getTime() !== new Date(input.expected_updated_at).getTime()) {
    const last = Array.isArray(cur.history) ? cur.history[cur.history.length - 1] : null;
    return { ok: false, conflict: true, error: `Ce devis vient d’être modifié${last?.name ? ` par ${last.name}` : ''}. Rechargez la page, puis refaites vos changements.` };
  }
  const customer_id = await resolveCustomerId(sb, input, contact, 'website');
  const patch = { ...row, customer_id: customer_id || cur.customer_id };
  const changed = changedFields(cur, patch);
  if (changed.length) patch.history = appendHistory(cur.history, historyEntry(user, 'edit', `Modifié : ${changed.join(', ')}.`));
  // Un devis chiffré et encore « nouveau » passe à « devis envoyé » ? Non :
  // c'est l'équipe qui décide quand il part au client. On ne touche pas au statut.
  const { data, error } = await sb.from('quote_requests').update(patch).eq('id', cur.id).eq('site', SITE).select('id,number,updated_at').single();
  if (error) return fail('saveQuote/update', error, 'Le devis');
  revalidateCrm(`/admin/quotes/${cur.id}`);
  return { ok: true, id: data.id, number: data.number, updated_at: data.updated_at, changed };
}

/** Notes internes d'un devis ou d'un message (sans toucher au reste). */
export async function saveNotes(kind, id, notes) {
  const table = { quote: 'quote_requests', message: 'contact_messages' }[kind];
  if (!table || !isUuid(id)) return { ok: false, error: 'Élément inconnu.' };
  const user = await guardAdmin('saveNotes', `${kind} #${id}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: cur, error: e1 } = await sb.from(table).select('id,notes,history').eq('id', id).eq('site', SITE).maybeSingle();
  if (e1) return fail('saveNotes/read', e1, 'La note');
  if (!cur) return { ok: false, error: 'Élément introuvable.' };
  const next = s(notes, 4000);
  if ((cur.notes || null) === next) return { ok: true, unchanged: true };
  const { error } = await sb.from(table).update({
    notes: next, updated_at: new Date().toISOString(),
    history: appendHistory(cur.history, historyEntry(user, 'note', next ? 'Note interne modifiée.' : 'Note interne effacée.')),
  }).eq('id', id).eq('site', SITE);
  if (error) return fail('saveNotes', error, 'La note');
  revalidateCrm(`/admin/${kind === 'quote' ? 'quotes' : 'messages'}/${id}`);
  return { ok: true };
}

/** Statut d'un devis ou d'un message, avec trace dans l'historique. */
export async function setLeadStatus(kind, id, status) {
  const conf = {
    quote: { table: 'quote_requests', values: QUOTE_VALUES, label: (v) => quoteStatus(v).label },
    message: { table: 'contact_messages', values: MESSAGE_VALUES, label: (v) => messageStatus(v).label },
  }[kind];
  if (!conf || !isUuid(id)) return { ok: false, error: 'Élément inconnu.' };
  if (!conf.values.includes(status)) return { ok: false, error: 'Statut inconnu.' };
  const user = await guardAdmin(kind === 'quote' ? 'updateQuoteStatus' : 'updateMessageStatus', `${kind} → ${conf.label(status)}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: cur, error: e1 } = await sb.from(conf.table).select('id,status,history,assigned_to').eq('id', id).eq('site', SITE).maybeSingle();
  // Base non migrée (pas de colonne history) : on se contente du statut.
  if (e1 && isNotMigrated(e1)) {
    const { error } = await sb.from(conf.table).update({ status }).eq('id', id).eq('site', SITE);
    if (error) return fail('setLeadStatus/legacy', error, 'Le statut');
    revalidateCrm();
    return { ok: true };
  }
  if (e1) return fail('setLeadStatus/read', e1, 'Le statut');
  if (!cur) return { ok: false, error: 'Élément introuvable.' };
  if (cur.status === status) return { ok: true, unchanged: true };
  const { error } = await sb.from(conf.table).update({
    status,
    updated_at: new Date().toISOString(),
    assigned_to: cur.assigned_to || String(user.email).toLowerCase(),
    history: appendHistory(cur.history, historyEntry(user, 'status', `${conf.label(cur.status)} → ${conf.label(status)}`, { from: cur.status, to: status })),
  }).eq('id', id).eq('site', SITE);
  if (error) return fail('setLeadStatus', error, 'Le statut');
  revalidateCrm(`/admin/${kind === 'quote' ? 'quotes' : 'messages'}/${id}`);
  return { ok: true };
}

// ============================================================================
// FICHES CLIENTS
// ============================================================================

async function findConflict(sb, field, value, exceptId) {
  if (!value) return null;
  let q = sb.from('customers').select('id,name,company').eq('site', SITE).eq(field, value).limit(1);
  if (exceptId) q = q.neq('id', exceptId);
  const { data } = await q;
  return data?.[0] || null;
}

/** Crée ou modifie une fiche client. */
export async function saveCustomer(input = {}) {
  const isNew = !isUuid(input.id);
  const user = await guardAdmin(isNew ? 'createCustomer' : 'updateCustomer', s(input.company, 80) || s(input.name, 80));
  if (!user) return denied;
  const row = {
    name: s(input.name, 200), company: s(input.company, 200),
    phone: s(input.phone, 60), phone2: s(input.phone2, 60), email: s(input.email, 200),
    wilaya: s(input.wilaya, 80), city: s(input.city, 120), address: s(input.address, 400),
    kind: KIND_VALUES.includes(input.kind) ? input.kind : null,
    nif: s(input.nif, 40), nis: s(input.nis, 40), rc: s(input.rc, 40), art: s(input.art, 40),
    notes: s(input.notes, 6000),
    updated_at: new Date().toISOString(),
  };
  if (!row.name && !row.company) return { ok: false, error: 'Indiquez le nom de l’interlocuteur ou de la société.' };
  if (row.email && !normEmail(row.email)) return { ok: false, error: 'Adresse e-mail invalide.' };
  const sb = createAdminClient();
  const exceptId = isNew ? null : input.id;
  const pn = normPhone(row.phone);
  const en = normEmail(row.email);
  if (row.phone && !pn) return { ok: false, error: 'Numéro de téléphone invalide.' };
  const byPhone = await findConflict(sb, 'phone_norm', pn, exceptId);
  if (byPhone) return { ok: false, conflictId: byPhone.id, error: `Ce téléphone est déjà sur la fiche « ${byPhone.company || byPhone.name || 'sans nom'} ». Ouvrez-la ou fusionnez les deux fiches.` };
  const byEmail = await findConflict(sb, 'email_norm', en, exceptId);
  if (byEmail) return { ok: false, conflictId: byEmail.id, error: `Cet e-mail est déjà sur la fiche « ${byEmail.company || byEmail.name || 'sans nom'} ». Ouvrez-la ou fusionnez les deux fiches.` };

  if (isNew) {
    const { data, error } = await sb.from('customers').insert({ site: SITE, ...row, source: 'manual' }).select('id').single();
    if (error) return fail('saveCustomer/create', error, 'Cette fiche');
    revalidateCrm();
    return { ok: true, id: data.id };
  }
  const { error } = await sb.from('customers').update(row).eq('id', input.id).eq('site', SITE);
  if (error) return fail('saveCustomer/update', error, 'Cette fiche');
  revalidateCrm(`/admin/customers/${input.id}`);
  return { ok: true, id: input.id };
}

/** Supprime une fiche. Ses devis, commandes et messages sont CONSERVÉS. */
export async function deleteCustomer(id) {
  if (!isUuid(id)) return { ok: false, error: 'Fiche inconnue.' };
  const user = await guardAdmin('deleteCustomer', `client #${id}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { error } = await sb.from('customers').delete().eq('id', id).eq('site', SITE);
  if (error) return fail('deleteCustomer', error, 'Cette fiche');
  revalidateCrm();
  return { ok: true };
}

/**
 * Fusionne deux fiches du même client : tout ce qui est rattaché à `sourceId`
 * passe sur `targetId`, les champs vides de la cible sont complétés, les notes
 * sont mises bout à bout, puis la fiche source est supprimée.
 */
export async function mergeCustomers(sourceId, targetId) {
  if (!isUuid(sourceId) || !isUuid(targetId) || sourceId === targetId) return { ok: false, error: 'Choisissez deux fiches différentes.' };
  const user = await guardAdmin('mergeCustomers', `${sourceId} → ${targetId}`);
  if (!user) return denied;
  const sb = createAdminClient();
  const { data: both, error: e1 } = await sb.from('customers').select('*').eq('site', SITE).in('id', [sourceId, targetId]);
  if (e1) return fail('mergeCustomers/read', e1, 'La fusion');
  const src = (both || []).find((c) => c.id === sourceId);
  const dst = (both || []).find((c) => c.id === targetId);
  if (!src || !dst) return { ok: false, error: 'Une des deux fiches est introuvable.' };

  for (const t of ['orders', 'quote_requests', 'contact_messages']) {
    const { error } = await sb.from(t).update({ customer_id: dst.id }).eq('customer_id', src.id).eq('site', SITE);
    if (error) return fail(`mergeCustomers/${t}`, error, 'La fusion');
  }
  // La source part d'abord : ses téléphone / e-mail libèrent l'index unique et
  // peuvent ensuite compléter la cible.
  const { error: eDel } = await sb.from('customers').delete().eq('id', src.id).eq('site', SITE);
  if (eDel) return fail('mergeCustomers/delete', eDel, 'La fusion');

  const fill = {};
  for (const k of ['name', 'company', 'email', 'wilaya', 'city', 'address', 'kind', 'nif', 'nis', 'rc', 'art']) {
    if (!dst[k] && src[k]) fill[k] = src[k];
  }
  if (!dst.phone && src.phone) fill.phone = src.phone;
  else if (src.phone && src.phone_norm !== dst.phone_norm && !dst.phone2) fill.phone2 = src.phone;
  const notes = [dst.notes, src.notes && `— Repris de la fiche fusionnée « ${src.company || src.name || ''} » —\n${src.notes}`].filter(Boolean).join('\n\n');
  if (notes !== (dst.notes || '')) fill.notes = notes.slice(0, 6000);
  fill.last_activity_at = [dst.last_activity_at, src.last_activity_at].filter(Boolean).sort().pop() || new Date().toISOString();
  fill.created_at = [dst.created_at, src.created_at].filter(Boolean).sort()[0] || dst.created_at;
  fill.updated_at = new Date().toISOString();
  const { error } = await sb.from('customers').update(fill).eq('id', dst.id);
  if (error) {
    // Les fiches sont déjà fusionnées ; seul le complément a échoué.
    console.warn('[mergeCustomers] complément:', error.message);
  }
  revalidateCrm(`/admin/customers/${dst.id}`);
  return { ok: true, id: dst.id };
}

// ============================================================================
// NOTIFICATIONS — « tout marquer comme lu »
// ============================================================================
export async function markNotificationsRead() {
  const user = await guardAdmin();
  if (!user) return denied;
  const sb = createAdminClient();
  const { error } = await sb.from('notification_reads').upsert(
    { site: SITE, user_email: String(user.email).toLowerCase(), last_read_at: new Date().toISOString() },
    { onConflict: 'site,user_email' },
  );
  if (error) return fail('markNotificationsRead', error, 'La lecture');
  revalidatePath('/admin/notifications');
  return { ok: true };
}

// Liste de l'équipe pour les sélecteurs « pris en charge par ».
export async function teamList() {
  const user = await guardAdmin();
  if (!user) return [];
  return adminEmails().map((email) => ({ email, name: displayName(email) }));
}
