import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { requireMobileAdmin } from '@/app/mobile/guard';
import { isPhoneEditor } from '@/lib/admin';
import { adminRoster } from '@/lib/activity';
import { isNotMigrated } from '@/lib/crm-server';
import Inbox from '@/components/mobile/Inbox';

// ============================================================================
// Demandes entrantes, version téléphone : COMMANDES, devis et messages.
// ----------------------------------------------------------------------------
// Le back-office web les sépare en trois pages parce qu'une souris survole
// trois entrées de menu sans effort. Sur un téléphone, c'est la MÊME tâche :
// quelqu'un a laissé son numéro, il faut le rappeler. Les séparer obligerait à
// vérifier trois écrans plusieurs fois par jour, et le dernier serait oublié.
//
// Pour chaque table : TOUT ce qui reste à traiter (même ancien — une demande
// oubliée depuis trois semaines est justement celle qu'il faut voir), plus les
// 200 plus récentes. Le filtre se fait ensuite dans le téléphone, sans
// aller-retour réseau.
//
// Le propriétaire voit l'écran en lecture seule (appeler, WhatsApp, e-mail) :
// c'est là que mènent ses notifications. Les écritures sont réservées aux
// comptes de l'équipe — voir isPhoneEditor() dans lib/admin.js.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Demandes — WBP' };

const LIMIT = 200;
const TODO_CAP = 500;

// Colonnes ajoutées par supabase/commandes-notifications.sql. Tant que la
// migration n'est pas passée, on relit l'ancienne forme au lieu d'afficher
// une liste vide.
const QUOTE_COLS = 'id,number,customer_name,company,email,phone,message,items,status,created_at,total,assigned_to,notes,customer_id';
const QUOTE_LEGACY = 'id,customer_name,company,email,phone,message,items,status,created_at';
const MSG_COLS = 'id,name,company,email,phone,subject,message,status,created_at,assigned_to,notes,customer_id';
const MSG_LEGACY = 'id,name,company,email,phone,subject,message,status,created_at';
const ORDER_COLS = 'id,number,status,customer_name,company,phone,email,wilaya,city,delivery_method,items,total,created_at,assigned_to,call_attempts,customer_note,quote_id';

// Les « à traiter » + les plus récentes, sans doublon, du plus récent au plus ancien.
async function both(sb, table, cols, todo) {
  const [a, b] = await Promise.all([
    todo(sb.from(table).select(cols).eq('site', SITE)).order('created_at', { ascending: false }).limit(TODO_CAP),
    sb.from(table).select(cols).eq('site', SITE).order('created_at', { ascending: false }).limit(LIMIT),
  ]);
  const error = a.error || b.error;
  if (error) return { data: null, error };
  const seen = new Map();
  for (const r of [...(a.data || []), ...(b.data || [])]) seen.set(r.id, r);
  return { data: [...seen.values()], error: null };
}

async function load(sb, table, cols, legacy, todo) {
  const res = await both(sb, table, cols, todo);
  if (res.error && legacy && isNotMigrated(res.error)) return { ...(await both(sb, table, legacy, todo)), legacy: true };
  return res;
}

const lines = (items) => (Array.isArray(items) ? items : []).map((it) => ({
  qty: Number(it?.qty) || 1,
  code: it?.code || null,
  name: it?.name || null,
  unit_price: it?.unit_price ?? null,
}));

// ?open=quote:<id> | message:<id>  ouvre directement la fiche (notification)
// ?f=todo|order|quote|message       filtre de départ (raccourcis de l'icône)
const OPEN_RE = /^(quote|message):[0-9a-f-]{36}$/i;
const FILTERS = ['all', 'todo', 'order', 'quote', 'message'];

export default async function MobileInbox({ searchParams }) {
  const user = await requireMobileAdmin();
  const sp = (await searchParams) || {};
  const open = typeof sp.open === 'string' && OPEN_RE.test(sp.open) ? sp.open.toLowerCase() : null;
  const filter = FILTERS.includes(sp.f) ? sp.f : null;
  if (!hasSupabase()) return null;
  const canEdit = isPhoneEditor(user.email);

  const sb = createAdminClient();
  const [quotes, messages, orders] = await Promise.all([
    load(sb, 'quote_requests', QUOTE_COLS, QUOTE_LEGACY, (q) => q.eq('status', 'new')),
    load(sb, 'contact_messages', MSG_COLS, MSG_LEGACY, (q) => q.eq('status', 'new')),
    load(sb, 'orders', ORDER_COLS, null, (q) => q.eq('status', 'pending')),
  ]);

  // Devis déjà convertis : lien direct vers leur commande.
  const quoteIds = (quotes.data || []).map((q) => q.id);
  const converted = {};
  if (quoteIds.length && !orders.error) {
    const { data } = await sb.from('orders').select('id,number,quote_id').eq('site', SITE).in('quote_id', quoteIds.slice(0, 400));
    for (const o of data || []) converted[o.quote_id] = { id: o.id, number: o.number };
  }

  // Une seule forme pour les trois tables : le composant client n'a aucun
  // branchement à faire pour AFFICHER une ligne.
  const rows = [
    ...(orders.data || []).map((o) => ({
      kind: 'order',
      id: o.id,
      at: o.created_at,
      number: o.number || null,
      name: o.customer_name || null,
      company: o.company || null,
      email: o.email || null,
      phone: o.phone || null,
      subject: null,
      body: o.customer_note || null,
      status: o.status || 'pending',
      items: lines(o.items),
      total: o.total ?? null,
      place: [o.city, o.wilaya].filter(Boolean).join(', ') || null,
      delivery: o.delivery_method || null,
      assigned: o.assigned_to || null,
      calls: o.call_attempts || 0,
    })),
    ...(quotes.data || []).map((q) => ({
      kind: 'quote',
      id: q.id,
      at: q.created_at,
      number: q.number || null,
      name: q.customer_name || null,
      company: q.company || null,
      email: q.email || null,
      phone: q.phone || null,
      subject: null,
      body: q.message || null,
      status: q.status || 'new',
      items: lines(q.items),
      total: q.total ?? null,
      assigned: q.assigned_to || null,
      notes: q.notes || null,
      customerId: q.customer_id || null,
      order: converted[q.id] || null,
    })),
    ...(messages.data || []).map((m) => ({
      kind: 'message',
      id: m.id,
      at: m.created_at,
      number: null,
      name: m.name || null,
      company: m.company || null,
      email: m.email || null,
      phone: m.phone || null,
      subject: m.subject || null,
      body: m.message || null,
      status: m.status || 'new',
      items: [],
      assigned: m.assigned_to || null,
      notes: m.notes || null,
      customerId: m.customer_id || null,
    })),
  ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

  const err = quotes.error || messages.error;
  const ordersMissing = !!orders.error && isNotMigrated(orders.error);
  const ordersErr = orders.error && !ordersMissing ? orders.error : null;

  return (
    <Inbox
      rows={rows}
      open={open}
      filter={filter}
      team={adminRoster()}
      me={String(user.email).toLowerCase()}
      canEdit={canEdit}
      migrated={!ordersMissing && !quotes.legacy && !messages.legacy}
      error={err ? (err.message || 'Erreur inconnue') : ordersErr ? (ordersErr.message || 'Erreur inconnue') : null}
    />
  );
}
