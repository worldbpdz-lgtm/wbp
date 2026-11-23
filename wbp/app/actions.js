'use server';
// ============================================================================
// Server actions PUBLIQUES (appelées depuis le site, sans authentification).
// ----------------------------------------------------------------------------
// Elles écrivent avec la clé service_role, qui contourne RLS : elles sont donc
// le seul endroit où un visiteur peut faire écrire la base. Chacune est
// désormais protégée par une limitation de débit par adresse IP et par un
// piège à robots, et aucune ne renvoie l'erreur Postgres brute au navigateur
// (ces messages révèlent noms de tables, de colonnes et de contraintes).
// ============================================================================
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { sendEmail, siteUrl } from '@/lib/email/send';
import { confirmEmailHtml } from '@/lib/email/template';
import { guard, isBot } from '@/lib/ratelimit';
import { SITE } from '@/lib/site';
import { normPhone, isPlausiblePhone } from '@/lib/phone';
import { computeTotals, sanitizeLines, cleanQty } from '@/lib/pricing';
import { linkCustomer, historyEntry, isNotMigrated } from '@/lib/crm-server';
import { notifyNewQuote, notifyNewMessage, notifyNewReview, notifyNewOrder } from '@/lib/notify';

const str = (v, max = 2000) => (v == null ? null : String(v).slice(0, max).trim() || null);
const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');
const normLang = (l) => (['fr', 'en', 'ar'].includes(l) ? l : 'fr');

// Message neutre côté visiteur ; le détail reste dans les journaux du serveur.
function oops(where, error) {
  console.error(`[${where}]`, error?.message || error);
  return { ok: false, error: 'Enregistrement impossible pour le moment. Réessayez dans un instant.' };
}

export async function submitQuote(payload) {
  const limited = await guard('quote', { limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (isBot(payload)) return { ok: true, stored: false };
  const row = {
    site: SITE,
    customer_name: str(payload.customer_name, 200),
    company: str(payload.company, 200),
    email: str(payload.email, 200),
    phone: str(payload.phone, 60),
    message: str(payload.message, 4000),
    items: Array.isArray(payload.items)
      ? payload.items.slice(0, 200).map((i) => ({ id: str(i.id, 60), name: str(i.name, 300), code: str(i.code, 120), qty: Math.max(1, parseInt(i.qty, 10) || 1) }))
      : [],
  };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  // select('*') et non une liste de colonnes : sur une base pas encore migrée,
  // citer une colonne absente (number…) ferait échouer — et annuler — l'insertion.
  const { data: saved, error } = await sb.from('quote_requests').insert(row).select('*').single();
  if (error) return oops('submitQuote', error);
  // Après la réponse au visiteur : fiche client + notification de l'équipe.
  after(() => linkAndNotify(sb, 'quote_requests', saved, { name: row.customer_name, company: row.company, phone: row.phone, email: row.email }, notifyNewQuote));
  return { ok: true, stored: true, number: saved?.number || null };
}

// Rattache la demande à sa fiche client, puis prévient l'équipe. Appelé dans
// `after()` : le visiteur a déjà sa confirmation, rien ici ne peut la lui retirer.
async function linkAndNotify(sb, table, saved, contact, notifyFn) {
  try {
    if (saved?.id) {
      const cid = await linkCustomer(sb, contact, { source: 'website' });
      if (cid) {
        const { error } = await sb.from(table).update({ customer_id: cid }).eq('id', saved.id);
        if (!error) saved.customer_id = cid;
      }
    }
  } catch (e) { console.warn(`[${table}] fiche client:`, e?.message); }
  try { if (saved) await notifyFn(saved); } catch (e) { console.warn(`[${table}] notification:`, e?.message); }
}

export async function submitContact(payload) {
  const limited = await guard('contact', { limit: 5, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (isBot(payload)) return { ok: true, stored: false };
  const row = {
    site: SITE,
    name: str(payload.name, 200), company: str(payload.company, 200),
    email: str(payload.email, 200), phone: str(payload.phone, 60),
    subject: str(payload.subject, 300), message: str(payload.message, 5000),
  };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { data: saved, error } = await sb.from('contact_messages').insert(row).select('*').single();
  if (error) return oops('submitContact', error);
  after(() => linkAndNotify(sb, 'contact_messages', saved, { name: row.name, company: row.company, phone: row.phone, email: row.email }, notifyNewMessage));
  return { ok: true, stored: true };
}

export async function submitReview(payload) {
  const limited = await guard('review', { limit: 3, windowMs: 60 * 60_000 });
  if (limited) return limited;
  if (isBot(payload)) return { ok: true, stored: false, pending: true };
  const rating = Math.min(5, Math.max(1, parseInt(payload.rating, 10) || 0));
  if (!payload.product_id || !rating || !str(payload.body)) return { ok: false, error: 'invalid' };
  const row = {
    site: SITE,
    product_id: str(payload.product_id, 60), author: str(payload.author, 120) || 'Anonyme',
    rating, title: str(payload.title, 200), body: str(payload.body, 4000),
    verified: false,
    // MODÉRATION : l'avis attend une validation dans /admin/reviews.
    // Il était publié directement en ligne — n'importe qui pouvait donc écrire
    // ce qu'il voulait sur une fiche produit, insultes ou spam compris.
    approved: false,
  };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { data: saved, error } = await sb.from('reviews').insert(row).select('*').single();
  if (error) return oops('submitReview', error);
  after(async () => {
    try {
      const { data: p } = await sb.from('products').select('name').eq('id', row.product_id).maybeSingle();
      await notifyNewReview(saved, p?.name);
    } catch (e) { console.warn('[submitReview] notification:', e?.message); }
  });
  return { ok: true, stored: true, pending: true };
}

// ============================================================================
// COMMANDE passée depuis le panier du site.
// ----------------------------------------------------------------------------
// Le site reste « prix sur devis » : le client ne voit aucun prix. Sa commande
// arrive « À confirmer » ; un conseiller l'appelle pour valider prix, stock et
// livraison, puis la confirme dans /admin ou l'app mobile.
//
// Protections contre les fausses commandes (en plus du piège à robots) :
//   • limitation de débit par adresse IP ;
//   • 3 commandes maximum par heure et par numéro de téléphone — compté EN BASE,
//     donc valable sur toutes les instances du serveur ;
//   • double envoi (double clic, réseau qui hésite) : la même commande depuis le
//     même numéro dans le quart d'heure renvoie la commande déjà enregistrée ;
//   • les noms, références et prix viennent du catalogue en base, jamais du
//     navigateur.
// Si la migration n'est pas encore appliquée, la commande est enregistrée comme
// demande de devis : aucun client n'est jamais perdu.
// ============================================================================
const DELIVERY = ['delivery', 'pickup', 'installation'];
const ORDER_PER_PHONE_HOUR = 3;

export async function submitOrder(payload = {}) {
  const limited = await guard('order', { limit: 4, windowMs: 10 * 60_000 });
  if (limited) return limited;
  if (isBot(payload)) return { ok: true, stored: false, number: null };

  const name = str(payload.customer_name, 200);
  const phone = str(payload.phone, 60);
  const email = str(payload.email, 200);
  if (!name) return { ok: false, error: 'invalid_name' };
  if (!isPlausiblePhone(phone)) return { ok: false, error: 'invalid_phone' };
  if (email && !isEmail(email)) return { ok: false, error: 'invalid_email' };
  const raw = Array.isArray(payload.items) ? payload.items.slice(0, 60) : [];
  if (!raw.length) return { ok: false, error: 'empty_cart' };

  const contact = {
    customer_name: name,
    company: str(payload.company, 200),
    phone,
    email,
    wilaya: str(payload.wilaya, 80),
    city: str(payload.city, 120),
    address: str(payload.address, 400),
  };
  const delivery_method = DELIVERY.includes(payload.delivery_method) ? payload.delivery_method : 'delivery';
  const customer_note = str(payload.message, 4000);
  if (!hasSupabase()) return { ok: true, stored: false, number: null };
  const sb = createAdminClient();

  // ---- lignes : catalogue en base, quantités du client -----------------------
  const ids = [...new Set(raw.map((i) => str(i?.id, 60)).filter(Boolean))];
  const { data: prods } = ids.length
    ? await sb.from('products').select('id,name,code,price').in('id', ids)
    : { data: [] };
  const byId = Object.fromEntries((prods || []).map((p) => [p.id, p]));
  const items = sanitizeLines(raw.map((i) => {
    const p = byId[str(i?.id, 60)];
    return {
      product_id: p?.id || str(i?.id, 60),
      code: p?.code || str(i?.code, 120),
      name: p?.name || str(i?.name, 300),
      qty: cleanQty(i?.qty),
      // Prix de vente du catalogue s'il est renseigné : l'équipe n'a plus qu'à
      // le confirmer. Jamais un prix venu du navigateur.
      unit_price: p?.price != null ? Number(p.price) : null,
    };
  }));
  if (!items.length) return { ok: false, error: 'empty_cart' };

  // ---- anti-spam et double envoi (en base) -----------------------------------
  const pn = normPhone(phone);
  const signature = (list) => list.map((l) => `${l.product_id || l.code}×${l.qty}`).sort().join('|');
  const sig = signature(items);
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const recent = await sb.from('orders').select('id,number,items,created_at')
    .eq('site', SITE).eq('phone_norm', pn).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(10);
  if (!recent.error && recent.data?.length) {
    const dup = recent.data.find((o) => Date.now() - new Date(o.created_at).getTime() < 15 * 60_000
      && signature(sanitizeLines(o.items)) === sig);
    if (dup) return { ok: true, stored: true, number: dup.number, duplicate: true };
    if (recent.data.length >= ORDER_PER_PHONE_HOUR) return { ok: false, error: 'too_many' };
  }

  const totals = computeTotals({ items });
  const order = {
    site: SITE,
    status: 'pending',
    source: 'website',
    ...contact,
    delivery_method,
    items,
    subtotal: totals.subtotal,
    total: totals.total,
    customer_note,
    history: [historyEntry(null, 'created', 'Commande passée sur le site web.')],
  };

  const { data: saved, error } = await sb.from('orders').insert(order).select('*').single();
  if (error) {
    if (!isNotMigrated(error)) return oops('submitOrder', error);
    // Base pas encore migrée : la commande devient une demande de devis
    // détaillée, pour que l'équipe la voie et rappelle le client.
    const DL = { delivery: 'Livraison', pickup: 'Retrait au dépôt', installation: 'Livraison + installation' };
    const note = [
      'COMMANDE À CONFIRMER (passée sur le site)',
      `Mode : ${DL[delivery_method]}`,
      contact.wilaya && `Wilaya : ${contact.wilaya}`,
      contact.address && `Adresse : ${contact.address}`,
      customer_note && `Message : ${customer_note}`,
    ].filter(Boolean).join('\n');
    const fb = await sb.from('quote_requests').insert({
      site: SITE, customer_name: name, company: contact.company, email, phone,
      message: note.slice(0, 4000),
      items: items.map((l) => ({ id: l.product_id, name: l.name, code: l.code, qty: l.qty })),
    });
    if (fb.error) return oops('submitOrder/fallback', fb.error);
    return { ok: true, stored: true, number: null };
  }

  after(() => linkAndNotify(sb, 'orders', saved, { name, company: contact.company, phone, email, wilaya: contact.wilaya, city: contact.city, address: contact.address }, notifyNewOrder));
  return { ok: true, stored: true, number: saved.number };
}

// Double opt-in: create/refresh a PENDING subscriber and email a confirmation link.
export async function subscribeNewsletter(email, lang = 'fr') {
  // Sans limite, cette action était un envoyeur d'e-mails gratuit : un script
  // pouvait faire partir des milliers de « confirmez votre inscription » vers
  // des adresses tierces, depuis le domaine WBP (réputation d'envoi grillée).
  const limited = await guard('newsletter', { limit: 3, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const e = (str(email, 200) || '').toLowerCase();
  if (!isEmail(e)) return { ok: false, error: 'invalid' };
  const L = normLang(lang);
  if (!hasSupabase()) return { ok: true, stored: false, pending: true };
  const sb = createAdminClient();
  const { data: existing } = await sb
    .from('newsletter_subscribers').select('id,status,token').eq('site', SITE).eq('email', e).maybeSingle();
  if (existing && existing.status === 'subscribed') return { ok: true, stored: true, already: true };
  const token = existing?.token || randomUUID().replace(/-/g, '');
  const { error } = await sb
    .from('newsletter_subscribers')
    .upsert({ site: SITE, email: e, status: 'pending', token, lang: L, source: 'website' }, { onConflict: 'site,email' });
  if (error) return oops('subscribeNewsletter', error);
  const confirmUrl = `${siteUrl()}/newsletter/confirm?token=${token}&lang=${L}`;
  const subject = L === 'ar' ? 'أكد اشتراكك — World Business Plus'
    : L === 'en' ? 'Confirm your subscription — World Business Plus'
    : 'Confirmez votre inscription — World Business Plus';
  // Le résultat de l'envoi était ignoré : on annonçait « vérifiez votre boîte
  // mail » même quand aucun message n'était parti.
  const sent = await sendEmail({ to: e, subject, html: confirmEmailHtml({ confirmUrl, lang: L }) });
  if (!sent.ok) {
    console.error('[subscribeNewsletter] envoi échoué:', sent.error);
    return { ok: false, error: 'Inscription enregistrée, mais l\'e-mail de confirmation n\'a pas pu être envoyé. Réessayez plus tard.' };
  }
  return { ok: true, stored: true, pending: true };
}

// Double opt-in confirmation (token from the confirmation email link).
export async function confirmSubscription(token) {
  const tk = str(token, 80);
  if (!tk) return { ok: false, error: 'invalid' };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .update({ status: 'subscribed', confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq('token', tk).select('email').maybeSingle();
  if (error) return oops('confirmSubscription', error);
  if (!data) return { ok: false, error: 'notfound' };
  return { ok: true, email: data.email };
}

// One-click unsubscribe (token from the email footer link).
export async function unsubscribeByToken(token) {
  const tk = str(token, 80);
  if (!tk) return { ok: false, error: 'invalid' };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('token', tk).select('email').maybeSingle();
  if (error) return oops('unsubscribeByToken', error);
  if (!data) return { ok: false, error: 'notfound' };
  return { ok: true, email: data.email };
}

// ---------- Analytics ----------
function parseDevice(ua = '') {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(s)) return 'mobile';
  return 'desktop';
}

export async function trackEvent({ type, path, productId, sessionId } = {}) {
  try {
    if (!hasSupabase()) return { ok: true, stored: false };
    // Plafond PAR VISITEUR (sessionId), pas par adresse IP : derrière le NAT
    // d'une entreprise ou d'un opérateur mobile, des centaines de visiteurs
    // partagent une seule IP et un plafond par IP les couperait tous, ce qui
    // fausserait les statistiques au lieu de les protéger. Un visiteur sans
    // sessionId retombe sur l'IP, avec un plafond large.
    const sid = str(sessionId, 60);
    const limited = sid
      ? await guard('track', { limit: 40, windowMs: 60_000, subject: sid })
      : await guard('track-ip', { limit: 600, windowMs: 60_000 });
    if (limited) return { ok: false, stored: false, rateLimited: true };
    const t = type === 'product_view' ? 'product_view' : 'page_view';
    const { headers } = await import('next/headers');
    const h = await headers();
    const ua = h.get('user-agent') || '';
    const referrer = h.get('referer') || null;
    const sb = createAdminClient();
    await sb.from('events').insert({
      site: SITE,
      type: t,
      path: str(path, 300),
      product_id: str(productId, 60),
      referrer: str(referrer, 400),
      device: parseDevice(ua),
      session_id: str(sessionId, 60),
    });
    return { ok: true, stored: true };
  } catch {
    return { ok: false };
  }
}
