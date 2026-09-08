'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { sendEmail, siteUrl } from '@/lib/email/send';
import { wrapEmail, rewriteLinksForTracking, trackingPixel } from '@/lib/email/template';

const s = (v, max = 4000) => (v == null || v === '' ? null : String(v).slice(0, max));

// Identifiant technique (slug) construit à partir d'un texte libre : « Hik Vision »
// devient « hik-vision ». Évite d'obliger l'admin à inventer un ID à la main.
function slug(v, max = 60) {
  const out = String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
  return out || null;
}

// Traduit les erreurs Postgres en français lisible : l'admin voyait
// « null value in column "short" violates not-null constraint », ce qui
// n'aide personne.
function friendly(error, what = 'Cet élément') {
  const m = String(error?.message || error || '');
  if (/duplicate key|already exists/i.test(m)) return `${what} existe déjà — choisissez un autre identifiant.`;
  if (/violates foreign key/i.test(m) && /products_cat_fkey/i.test(m)) return 'Catégorie inconnue.';
  if (/violates foreign key/i.test(m) && /products_brand_fkey/i.test(m)) return 'Marque inconnue.';
  if (/violates foreign key/i.test(m)) return `Impossible : ${what.toLowerCase()} est encore utilisé(e) par des produits.`;
  if (/null value in column "(\w+)"/i.test(m)) {
    const col = m.match(/null value in column "(\w+)"/i)[1];
    const fr = { id: 'identifiant', name: 'nom', short: 'abrégé', code: 'référence' }[col] || col;
    return `Le champ « ${fr} » est obligatoire.`;
  }
  if (/column "(\w+)" .*does not exist/i.test(m)) {
    return 'La base n\'est pas à jour. Ouvrez Supabase → SQL Editor → New query, collez le fichier '
      + 'supabase/fix-all.sql du projet, cliquez Run, puis réessayez.';
  }
  if (/relation "(\w+)" does not exist/i.test(m)) {
    return 'La base n\'est pas à jour. Ouvrez Supabase → SQL Editor → New query, collez le fichier '
      + 'supabase/fix-all.sql du projet, cliquez Run, puis réessayez.';
  }
  if (/JWT|Invalid API key/i.test(m)) return 'Clé Supabase invalide — vérifiez SUPABASE_SERVICE_ROLE_KEY.';
  return m || 'Erreur inconnue.';
}

export async function signOutAction() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/admin/login');
}

// ============================================================================
// Colonnes qui n'existent que sur une base MIGRÉE (supabase/fix-all.sql).
// ----------------------------------------------------------------------------
// PostgREST rejette la requête ENTIÈRE dès qu'une colonne citée est inconnue.
// Tant que la migration n'était pas appliquée, `images` et `featured` faisaient
// donc échouer CHAQUE enregistrement de produit — c'est la cause du
// « je modifie un produit et je ne peux pas l'enregistrer ». On réessaie
// maintenant sans les colonnes fautives : la fiche est sauvegardée dans tous
// les cas, et l'admin est prévenu de ce qui n'a pas pu être stocké.
// ============================================================================
const OPTIONAL_PRODUCT_COLS = ['images', 'featured', 'price'];

async function upsertTolerant(sb, table, row, onConflict, optional) {
  const attempt = { ...row };
  const dropped = [];
  for (let i = 0; i <= optional.length; i++) {
    const { error } = await sb.from(table).upsert(attempt, { onConflict });
    if (!error) return { error: null, dropped };
    // « column "x" does not exist » / « Could not find the 'x' column »
    const miss = optional.find((c) => c in attempt
      && new RegExp(`['"\`]?${c}['"\`]?\\s+column|column ['"\`]?${c}['"\`]?`, 'i').test(error.message || ''));
    if (!miss) return { error, dropped };
    delete attempt[miss];
    dropped.push(miss);
  }
  return { error: null, dropped };
}

// ---------- Products ----------
export async function upsertProduct(p) {
  await requireAdmin();
  const sb = createAdminClient();
  const specs = Array.isArray(p.specs) ? p.specs.filter((r) => r[0] || r[1]).map((r) => [s(r[0], 120) || '', s(r[1], 300) || '']) : [];
  const row = {
    id: s(p.id, 60), cat: s(p.cat, 60), brand: s(p.brand, 60),
    name: s(p.name, 300), code: s(p.code, 120), badge: p.badge ? s(p.badge, 30) : null,
    rating: Math.min(5, Math.max(0, Number(p.rating) || 0)),
    reviews_count: Math.max(0, parseInt(p.reviews_count, 10) || 0),
    tag: { fr: s(p.tag_fr, 200) || '', en: s(p.tag_en, 200) || '', ar: s(p.tag_ar, 200) || '' },
    specs, price: (p.price === '' || p.price == null) ? null : Number(p.price), active: !!p.active, featured: !!p.featured, sort: parseInt(p.sort, 10) || 0,
    images: Array.isArray(p.images) ? p.images.filter(Boolean).slice(0, 12).map((u) => s(u, 600)) : [],
  };
  // Photo principale : celle choisie, sinon la 1ʳᵉ de la galerie.
  row.image_url = s(p.image_url, 600) || row.images[0] || null;
  // L'identifiant peut être déduit du nom lors d'une création.
  if (!row.id) row.id = slug(p.name, 60);
  if (!row.name) return { ok: false, error: 'Le nom du produit est obligatoire.' };
  if (!row.code) return { ok: false, error: 'La référence (code) est obligatoire.' };
  if (!row.id) return { ok: false, error: 'Identifiant impossible à déduire — saisissez-le manuellement.' };
  const { error, dropped } = await upsertTolerant(sb, 'products', row, 'id', OPTIONAL_PRODUCT_COLS);
  if (error) return { ok: false, error: friendly(error, 'Ce produit') };
  revalidatePath('/admin/products'); revalidatePath('/admin/showcase'); revalidatePath('/admin/arrivals'); revalidatePath('/', 'layout');
  return {
    ok: true,
    id: row.id,
    warn: dropped.length
      ? `Produit enregistré, mais ${dropped.join(', ')} n'a pas pu être stocké : lancez supabase/fix-all.sql une fois.`
      : null,
  };
}
export async function deleteProduct(id) {
  await requireAdmin();
  const sb = createAdminClient();
  const pid = s(id, 60);
  if (!pid) return { ok: false, error: 'Identifiant manquant.' };
  // Les listes de mise en avant référencent le produit. Selon l'ordre
  // d'application des migrations, la contrainte peut ne pas être en
  // « on delete cascade » : on nettoie donc explicitement avant de supprimer,
  // sinon la suppression échoue avec une erreur de clé étrangère illisible.
  for (const t of ['featured_picks', 'new_arrivals']) {
    try { await sb.from(t).delete().eq('product_id', pid); } catch { /* table absente */ }
  }
  const { error } = await sb.from('products').delete().eq('id', pid);
  if (error) return { ok: false, error: friendly(error, 'Ce produit') };
  revalidatePath('/admin/products'); revalidatePath('/admin/showcase'); revalidatePath('/admin/arrivals'); revalidatePath('/', 'layout');
  return { ok: true };
}
export async function toggleProductActive(id, active) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('products').update({ active: !!active }).eq('id', s(id, 60));
  if (error) return { ok: false, error: friendly(error, 'Ce produit') };
  revalidatePath('/admin/products'); revalidatePath('/', 'layout');
  return { ok: true };
}
// Mis en avant : le produit remonte en tête du catalogue public.
export async function toggleProductFeatured(id, featured) {
  await requireAdmin();
  const sb = createAdminClient();
  const pid = s(id, 60);
  const { error } = await sb.from('products').update({ featured: !!featured }).eq('id', pid);
  if (error) return { ok: false, error: friendly(error, 'Ce produit') };
  // On garde la vitrine cohérente avec l'étoile ★ (si la table existe).
  try {
    if (featured) await addToShowcase(pid);
    else await sb.from('featured_picks').delete().eq('site', SITE).eq('product_id', pid);
  } catch { /* table absente : la colonne `featured` suffit */ }
  revalidatePath('/admin/products'); revalidatePath('/admin/showcase'); revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------- Brands ----------
// Ajouter une marque échouait avant : « Abrégé » laissé vide déclenchait une
// contrainte NOT NULL sur brands.short, et l'identifiant devait être tapé à la
// main. Désormais : ID déduit du nom, abrégé rempli automatiquement, logo,
// ordre d'affichage, et messages d'erreur en français.
export async function updateBrand(b) {
  await requireAdmin();
  const sb = createAdminClient();
  const name = s(b.name, 200);
  if (!name) return { ok: false, error: 'Le nom de la marque est obligatoire.' };
  const id = s(b.id, 60) ? slug(b.id, 60) : slug(name, 60);
  if (!id) return { ok: false, error: 'Identifiant impossible à déduire du nom.' };
  const row = {
    id,
    name,
    short: s(b.short, 60) || name.slice(0, 14),
    color: s(b.color, 20) || '#FF5A1F',
    description: { fr: s(b.desc_fr, 1000) || '', en: s(b.desc_en, 1000) || '', ar: s(b.desc_ar, 1000) || '' },
    sort: Number.isFinite(parseInt(b.sort, 10)) ? parseInt(b.sort, 10) : 999,
  };
  if (b.logo_url !== undefined) row.logo_url = s(b.logo_url, 600);
  let { error } = await sb.from('brands').upsert(row, { onConflict: 'id' });
  // Base pas encore migrée (colonne logo_url absente) : on réessaie sans.
  if (error && /logo_url/.test(error.message || '')) {
    delete row.logo_url;
    ({ error } = await sb.from('brands').upsert(row, { onConflict: 'id' }));
    if (!error) {
      revalidatePath('/admin/brands'); revalidatePath('/', 'layout');
      return { ok: true, id, warn: 'Marque enregistrée, mais le logo demande apply-upgrade.bat.' };
    }
  }
  if (error) return { ok: false, error: friendly(error, 'Cette marque') };
  revalidatePath('/admin/brands'); revalidatePath('/', 'layout');
  return { ok: true, id };
}

export async function deleteBrand(id) {
  await requireAdmin();
  const sb = createAdminClient();
  const bid = s(id, 60);
  const { count } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('brand', bid);
  if (count) {
    return { ok: false, error: `Impossible : ${count} produit(s) utilisent encore cette marque. Changez leur marque d'abord.` };
  }
  const { error } = await sb.from('brands').delete().eq('id', bid);
  if (error) return { ok: false, error: friendly(error, 'Cette marque') };
  revalidatePath('/admin/brands'); revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------- Categories ----------
export async function updateCategory(c) {
  await requireAdmin();
  const sb = createAdminClient();
  const nameFr = s(c.name_fr, 200);
  if (!nameFr) return { ok: false, error: 'Le nom FR de la catégorie est obligatoire.' };
  const id = s(c.id, 60) ? slug(c.id, 60) : slug(nameFr, 60);
  if (!id) return { ok: false, error: 'Identifiant impossible à déduire du nom.' };
  const row = {
    id,
    icon: s(c.icon, 40) || 'box',
    name: { fr: nameFr, en: s(c.name_en, 200) || nameFr, ar: s(c.name_ar, 200) || '' },
    blurb: { fr: s(c.blurb_fr, 400) || '', en: s(c.blurb_en, 400) || '', ar: s(c.blurb_ar, 400) || '' },
    sort: Number.isFinite(parseInt(c.sort, 10)) ? parseInt(c.sort, 10) : 999,
  };
  if (c.image_url !== undefined) row.image_url = s(c.image_url, 600);
  let { error } = await sb.from('categories').upsert(row, { onConflict: 'id' });
  if (error && /image_url/.test(error.message || '')) {
    delete row.image_url;
    ({ error } = await sb.from('categories').upsert(row, { onConflict: 'id' }));
    if (!error) {
      revalidatePath('/admin/categories'); revalidatePath('/', 'layout');
      return { ok: true, id, warn: 'Catégorie enregistrée, mais l\'image demande apply-upgrade.bat.' };
    }
  }
  if (error) return { ok: false, error: friendly(error, 'Cette catégorie') };
  revalidatePath('/admin/categories'); revalidatePath('/', 'layout');
  return { ok: true, id };
}

export async function deleteCategory(id) {
  await requireAdmin();
  const sb = createAdminClient();
  const cid = s(id, 60);
  const { count } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('cat', cid);
  if (count) {
    return { ok: false, error: `Impossible : ${count} produit(s) sont encore dans cette catégorie. Déplacez-les d'abord.` };
  }
  const { error } = await sb.from('categories').delete().eq('id', cid);
  if (error) return { ok: false, error: friendly(error, 'Cette catégorie') };
  revalidatePath('/admin/categories'); revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------- Leads / moderation ----------
export async function updateQuoteStatus(id, status) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('quote_requests').update({ status: s(status, 30) }).eq('id', id);
  revalidatePath('/admin/quotes'); revalidatePath('/admin'); return { ok: true };
}
export async function deleteQuote(id) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('quote_requests').delete().eq('id', id);
  revalidatePath('/admin/quotes'); revalidatePath('/admin'); return { ok: true };
}
export async function updateMessageStatus(id, status) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('contact_messages').update({ status: s(status, 30) }).eq('id', id);
  revalidatePath('/admin/messages'); revalidatePath('/admin'); return { ok: true };
}
export async function deleteMessage(id) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('contact_messages').delete().eq('id', id);
  revalidatePath('/admin/messages'); revalidatePath('/admin'); return { ok: true };
}
export async function setReviewApproved(id, approved) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('reviews').update({ approved }).eq('id', id);
  revalidatePath('/admin/reviews'); return { ok: true };
}
export async function deleteReview(id) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('reviews').delete().eq('id', id);
  revalidatePath('/admin/reviews'); return { ok: true };
}
export async function deleteSubscriber(id) {
  await requireAdmin(); const sb = createAdminClient();
  await sb.from('newsletter_subscribers').delete().eq('id', id);
  revalidatePath('/admin/subscribers'); return { ok: true };
}

// ---------- Settings & clients ----------
export async function saveSetting(key, value) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('settings').upsert({ site: SITE, key: s(key, 60), value, updated_at: new Date().toISOString() }, { onConflict: 'site,key' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/settings'); revalidatePath('/', 'layout');
  return { ok: true };
}
export async function addClient(name) {
  await requireAdmin();
  const nm = s(name, 200); if (!nm) return { ok: false, error: 'Nom requis' };
  const sb = createAdminClient();
  const { error } = await sb.from('clients').insert({ name: nm, sort: 999, site: SITE });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/settings'); revalidatePath('/', 'layout');
  return { ok: true };
}
export async function deleteClient(id) {
  await requireAdmin();
  const sb = createAdminClient();
  await sb.from('clients').delete().eq('id', id);
  revalidatePath('/admin/settings'); revalidatePath('/', 'layout');
  return { ok: true };
}

// ---------- Email campaigns ----------
export async function createCampaign() {
  await requireAdmin();
  const sb = createAdminClient();
  const { data, error } = await sb.from('email_campaigns')
    .insert({ subject: 'Nouvelle campagne', body_html: '', site: SITE }).select('id').single();
  if (error) throw new Error(error.message);
  redirect(`/admin/campaigns/${data.id}`);
}

export async function updateCampaign(id, p) {
  await requireAdmin();
  const sb = createAdminClient();
  const row = {
    subject: s(p.subject, 300) || 'Sans objet',
    preheader: s(p.preheader, 300),
    body_html: s(p.body_html, 100000) || '',
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('email_campaigns').update(row).eq('id', s(id, 60));
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/campaigns/${id}`); revalidatePath('/admin/campaigns');
  return { ok: true };
}

export async function deleteCampaign(id) {
  await requireAdmin();
  const sb = createAdminClient();
  await sb.from('email_campaigns').delete().eq('id', s(id, 60));
  revalidatePath('/admin/campaigns');
  return { ok: true };
}

function renderCampaignHtml(campaign, { unsubscribeUrl, sendId }) {
  let body = campaign.body_html || '';
  if (sendId) body = rewriteLinksForTracking(body, sendId);
  body += trackingPixel(sendId);
  return wrapEmail({ title: campaign.subject, preheader: campaign.preheader, bodyHtml: body, unsubscribeUrl, lang: 'fr' });
}

export async function sendTestCampaign(id, email) {
  await requireAdmin();
  const to = s(email, 200);
  if (!to || !to.includes('@')) return { ok: false, error: 'E-mail invalide' };
  const sb = createAdminClient();
  const { data: c } = await sb.from('email_campaigns').select('*').eq('id', s(id, 60)).single();
  if (!c) return { ok: false, error: 'Campagne introuvable' };
  const html = renderCampaignHtml(c, { unsubscribeUrl: `${siteUrl()}/newsletter/unsubscribe?token=TEST`, sendId: null });
  const r = await sendEmail({ to, subject: `[TEST] ${c.subject}`, html });
  return r.ok ? { ok: true, dev: !!r.dev } : { ok: false, error: r.error };
}

export async function sendCampaign(id) {
  await requireAdmin();
  const sb = createAdminClient();
  const cid = s(id, 60);
  const { data: c } = await sb.from('email_campaigns').select('*').eq('id', cid).single();
  if (!c) return { ok: false, error: 'Campagne introuvable' };
  if (c.status === 'sent') return { ok: false, error: 'Campagne déjà envoyée' };
  const { data: subs } = await sb.from('newsletter_subscribers')
    .select('id,email,token,lang').eq('site', SITE).eq('status', 'subscribed');
  const list = subs || [];
  await sb.from('email_campaigns').update({ status: 'sending' }).eq('id', cid);
  let sent = 0, failed = 0;
  for (const sub of list) {
    // Insert the send row first (unique on campaign+email) to dedupe and get a tracking id.
    const { data: srow, error: insErr } = await sb.from('email_campaign_sends')
      .insert({ campaign_id: cid, subscriber_id: sub.id, email: sub.email }).select('id').single();
    if (insErr || !srow) continue; // already sent to this address
    const unsubscribeUrl = `${siteUrl()}/newsletter/unsubscribe?token=${sub.token}&lang=${sub.lang || 'fr'}`;
    const html = renderCampaignHtml(c, { unsubscribeUrl, sendId: srow.id });
    const r = await sendEmail({ to: sub.email, subject: c.subject, html, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } });
    if (r.ok) { sent++; }
    else { failed++; await sb.from('email_campaign_sends').update({ status: 'failed', error: s(r.error, 300) }).eq('id', srow.id); }
  }
  await sb.from('email_campaigns')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent }).eq('id', cid);
  revalidatePath(`/admin/campaigns/${id}`); revalidatePath('/admin/campaigns');
  return { ok: true, sent, failed, total: list.length };
}

// ============================================================================
// VITRINE — quels produits apparaissent EN PREMIER sur le site
// ----------------------------------------------------------------------------
// L'admin choisit une catégorie + une marque pour filtrer, puis sélectionne et
// ordonne les produits. L'ordre est propre à chaque site (le catalogue lui-même
// reste partagé avec Central Network).
// ============================================================================

// Plafond de la sélection — doit rester égal à MAX_PICKS dans
// components/admin/ShowcaseManager.jsx.
const MAX_PICKS = 200;

// « table absente » et non « colonne absente » : PGRST205 vise la table,
// PGRST204 vise une colonne. Confondre les deux masquerait une vraie erreur.
const missingTable = (error) => error?.code === 'PGRST205'
  || /relation .* does not exist|could not find the table/i.test(String(error?.message || error || ''));

/**
 * Écrit une liste ordonnée (vitrine ou nouveautés) dans sa table dédiée.
 * Si la table n'existe pas encore, on ne renvoie plus une erreur sèche :
 * la sélection est repliée sur products.featured pour la vitrine, et l'admin
 * reçoit un avertissement qui explique quoi faire.
 */
async function writeRankedList(sb, table, ids, label) {
  const del = await sb.from(table).delete().eq('site', SITE);
  if (del.error) {
    if (missingTable(del.error)) return { missing: true };
    return { error: friendly(del.error, label) };
  }
  if (ids.length) {
    const rows = ids.map((product_id, i) => ({ site: SITE, product_id, rank: i }));
    const { error } = await sb.from(table).insert(rows);
    if (error) {
      if (missingTable(error)) return { missing: true };
      return { error: friendly(error, label) };
    }
  }
  return { ok: true };
}

/** Synchronise products.featured avec la sélection (tri de secours + étoile ★). */
async function syncFeaturedColumn(sb, ids) {
  const off = await sb.from('products').update({ featured: false }).eq('featured', true);
  if (off.error) return false; // colonne absente : base non migrée
  if (ids.length) await sb.from('products').update({ featured: true }).in('id', ids);
  return true;
}

/** Remplace toute la vitrine par la liste ordonnée fournie. */
export async function saveShowcase(productIds) {
  await requireAdmin();
  const sb = createAdminClient();
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : [])
    .map((x) => s(x, 60)).filter(Boolean))).slice(0, MAX_PICKS);

  const res = await writeRankedList(sb, 'featured_picks', ids, 'La vitrine');
  if (res.error) return { ok: false, error: res.error };

  const synced = await syncFeaturedColumn(sb, ids);

  revalidatePath('/admin/showcase'); revalidatePath('/admin/products'); revalidatePath('/', 'layout');

  if (res.missing && !synced) {
    return {
      ok: false,
      error: 'La base n\'est pas à jour : ni la table featured_picks ni la colonne products.featured n\'existent. '
        + 'Collez supabase/fix-all.sql dans Supabase → SQL Editor → Run, puis réessayez.',
    };
  }
  return {
    ok: true,
    count: ids.length,
    warn: res.missing
      ? 'Sélection enregistrée via l\'étoile ★, mais l\'ORDRE exact demande la table featured_picks : '
        + 'collez supabase/fix-all.sql dans Supabase → SQL Editor → Run.'
      : null,
  };
}

/** Ajoute un produit à la fin de la vitrine. */
export async function addToShowcase(productId) {
  await requireAdmin();
  const sb = createAdminClient();
  const pid = s(productId, 60);
  if (!pid) return { ok: false, error: 'Produit manquant.' };
  const { data: last } = await sb.from('featured_picks').select('rank')
    .eq('site', SITE).order('rank', { ascending: false }).limit(1).maybeSingle();
  const { error } = await sb.from('featured_picks')
    .upsert({ site: SITE, product_id: pid, rank: (last?.rank ?? -1) + 1 }, { onConflict: 'site,product_id' });
  if (error && !missingTable(error)) return { ok: false, error: friendly(error, 'La vitrine') };
  await sb.from('products').update({ featured: true }).eq('id', pid);
  revalidatePath('/admin/showcase'); revalidatePath('/', 'layout');
  return { ok: true };
}

/** Retire un produit de la vitrine. */
export async function removeFromShowcase(productId) {
  await requireAdmin();
  const sb = createAdminClient();
  const pid = s(productId, 60);
  const { error } = await sb.from('featured_picks').delete().eq('site', SITE).eq('product_id', pid);
  if (error && !missingTable(error)) return { ok: false, error: friendly(error, 'La vitrine') };
  await sb.from('products').update({ featured: false }).eq('id', pid);
  revalidatePath('/admin/showcase'); revalidatePath('/', 'layout');
  return { ok: true };
}

// ============================================================================
// NOUVEAUTÉS — « Nouveaux arrivages » sur la page d'accueil
// ----------------------------------------------------------------------------
// Liste séparée de la vitrine (table new_arrivals) : un produit peut donc être
// à la fois « Meilleure vente » et « Nouveauté ». Sélection dans /admin/arrivals.
// ============================================================================

/** Remplace la liste des nouveautés par `productIds`, dans cet ordre. */
export async function saveArrivals(productIds) {
  await requireAdmin();
  const sb = createAdminClient();
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : [])
    .map((x) => s(x, 60)).filter(Boolean))).slice(0, MAX_PICKS);

  const res = await writeRankedList(sb, 'new_arrivals', ids, 'Les nouveautés');
  if (res.error) return { ok: false, error: res.error };
  if (res.missing) {
    return {
      ok: false,
      error: 'La table new_arrivals n\'existe pas encore. Collez supabase/fix-all.sql dans '
        + 'Supabase → SQL Editor → Run (une seule fois), puis réessayez.',
    };
  }

  // On ne touche PAS au champ `badge` de la fiche produit : la pastille
  // « Nouveau » reste un choix éditorial indépendant, et une liste vidée par
  // erreur ne doit pas effacer ces badges (ils servent justement de repli).
  revalidatePath('/admin/arrivals'); revalidatePath('/admin/products'); revalidatePath('/', 'layout');
  return { ok: true, count: ids.length };
}

// ============================================================================
// ASSISTANT IA — configuration (table privée ai_config, jamais exposée au client)
// ----------------------------------------------------------------------------
// Aucun fournisseur n'est nommé ni imposé : 'builtin' répond à partir du
// catalogue WBP, 'external' relaie vers la plateforme de chat que l'admin
// renseigne lui-même. 'dtech' est l'ancien nom de 'external', conservé
// uniquement pour ne pas casser les configurations déjà en base.
// ============================================================================
const AI_PROVIDERS = ['external', 'builtin', 'off'];
const normProvider = (v) => (v === 'dtech' ? 'external' : (AI_PROVIDERS.includes(v) ? v : 'builtin'));

export async function saveAiConfig(cfg) {
  await requireAdmin();
  const sb = createAdminClient();
  const provider = normProvider(cfg.provider);
  const row = {
    site: SITE,
    enabled: provider !== 'off' && !!cfg.enabled,
    provider: provider === 'off' ? 'builtin' : provider,
    base_url: (s(cfg.base_url, 300) || '').replace(/\/+$/, '') || null,
    widget_key: s(cfg.widget_key, 200),
    assistant: s(cfg.assistant, 80) || 'Assistant WBP',
    greeting: {
      fr: s(cfg.greeting_fr, 600) || '', en: s(cfg.greeting_en, 600) || '', ar: s(cfg.greeting_ar, 600) || '',
    },
    suggestions: {
      fr: splitLines(cfg.suggestions_fr), en: splitLines(cfg.suggestions_en), ar: splitLines(cfg.suggestions_ar),
    },
    accent: s(cfg.accent, 20) || '#FF5A1F',
    updated_at: new Date().toISOString(),
  };
  if (row.provider === 'external') {
    if (!row.base_url) return { ok: false, error: 'Renseignez l\'adresse de votre plateforme de chat.' };
    if (!/^https:\/\//i.test(row.base_url)) {
      // HTTPS obligatoire : la clé du widget transite dans cette requête.
      return { ok: false, error: 'L\'adresse doit commencer par https:// (le http simple n\'est pas chiffré).' };
    }
    if (!row.widget_key) return { ok: false, error: 'Renseignez la clé publique du widget.' };
  }
  const { error } = await sb.from('ai_config').upsert(row, { onConflict: 'site' });
  if (error) return { ok: false, error: friendly(error, 'La configuration IA') };
  revalidatePath('/admin/ai'); revalidatePath('/', 'layout');
  return { ok: true };
}

function splitLines(v) {
  return String(v || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
}

/**
 * Teste la connexion à la plateforme IA sans rien enregistrer : envoie un vrai
 * message « ping » et regarde si le flux répond. Renvoie un diagnostic clair.
 */
// Refuse les adresses internes. Sans ce garde-fou, cette action laisserait
// sonder le réseau privé de l'hébergeur depuis le serveur WBP — y compris les
// services de métadonnées cloud (169.254.169.254) qui distribuent des jetons
// d'accès. C'est la faille « SSRF ».
function isPrivateHost(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (/^\[?::1\]?$/.test(h) || /^\[?fd[0-9a-f]{2}:/i.test(h) || /^\[?fe80:/i.test(h)) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127
    || (a === 169 && b === 254)                  // métadonnées cloud
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

export async function testAiConnection({ base_url, widget_key }) {
  await requireAdmin();
  const base = (s(base_url, 300) || '').replace(/\/+$/, '');
  const key = s(widget_key, 200);
  if (!base || !/^https:\/\//i.test(base)) return { ok: false, error: 'Adresse invalide — elle doit commencer par https://' };
  let host = '';
  try { host = new URL(base).hostname; } catch { return { ok: false, error: 'Adresse invalide.' }; }
  if (isPrivateHost(host)) return { ok: false, error: 'Adresse réseau interne refusée. Indiquez l\'adresse publique de votre plateforme.' };
  if (!key) return { ok: false, error: 'Clé du widget manquante.' };

  const url = `${base}/api/widget/messages`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetKey: key,
        conversationId: null,
        message: 'Test de connexion depuis l\'administration World Business Plus.',
        customerExternalId: 'wbp-admin-test',
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (res.status === 404) return { ok: false, error: `404 sur ${url} — vérifiez l'URL : la plateforme doit exposer /api/widget/messages.` };
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Clé du widget refusée (401/403). Régénérez-la dans votre plateforme.' };
    if (res.status === 503) return { ok: false, error: 'Le canal « web » est en pause sur votre plateforme. Activez-le puis réessayez.' };
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error || ''; } catch { /* corps non JSON */ }
      return { ok: false, error: `Réponse HTTP ${res.status}${detail ? ` — ${detail}` : ''}` };
    }

    // On lit le début du flux pour confirmer qu'il s'agit bien d'événements SSE.
    const text = (await res.text()).slice(0, 2000);
    const sawEvent = /data:\s*\{/.test(text);
    let reply = '';
    for (const m of text.matchAll(/data:\s*(\{.*)$/gm)) {
      try { const ev = JSON.parse(m[1]); if (ev.type === 'delta' && ev.text) reply += ev.text; } catch { /* trame partielle */ }
    }
    if (!sawEvent) return { ok: false, error: 'Connecté, mais la réponse n\'est pas un flux d\'événements. Vérifiez la version de la plateforme.' };
    return { ok: true, reply: (reply || '').slice(0, 300) || 'Flux reçu (réponse vide).' };
  } catch (e) {
    const msg = e?.name === 'AbortError'
      ? 'Délai dépassé (12 s) — la plateforme ne répond pas.'
      : `Connexion impossible : ${e?.message || 'erreur réseau'}. Vérifiez que l'URL est publique et en HTTPS.`;
    return { ok: false, error: msg };
  }
}
