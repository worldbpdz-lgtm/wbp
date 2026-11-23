import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/primitives';
import { StatusBadge, Who, Chip, MigrationBanner } from '@/components/admin/crm/ui';
import { isNotMigrated, orLit } from '@/lib/crm-server';
import { adminRoster } from '@/lib/activity';
import { ORDER_STATUSES, REVENUE_STATUSES, OPEN_ORDER_STATUSES, deliveryLabel, sourceLabel, personOf } from '@/lib/crm';
import { dzd } from '@/lib/pricing';
import { fmtDateTime } from '@/lib/dates';
import { normPhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Commandes' };

const PER = 30;
// Groupes de filtres : « en cours » réunit confirmée / préparation / livraison.
const FILTERS = [
  ['', 'Toutes'],
  ['pending', 'À confirmer'],
  ['open', 'En cours'],
  ['delivered', 'Livrées'],
  ['cancelled', 'Annulées'],
];
const PERIODS = [['', 'Toute période'], ['7', '7 derniers jours'], ['30', '30 derniers jours'], ['90', '90 derniers jours'], ['365', '12 derniers mois']];

function applyFilter(q, f) {
  if (f === 'open') return q.in('status', OPEN_ORDER_STATUSES);
  if (f) return q.eq('status', f);
  return q;
}

export default async function OrdersPage({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const f = FILTERS.some(([k]) => k === sp.status) ? sp.status || '' : '';
  const q = String(sp.q || '').trim().slice(0, 80);
  const days = PERIODS.some(([k]) => k === sp.days) ? sp.days || '' : '';
  const page = Math.max(1, parseInt(sp.page, 10) || 1);
  const sb = createAdminClient();
  const team = adminRoster();

  const build = () => {
    let query = sb.from('orders')
      .select('id,number,status,source,customer_name,company,phone,wilaya,delivery_method,items,total,paid_amount,assigned_to,call_attempts,created_at', { count: 'exact' })
      .eq('site', SITE);
    query = applyFilter(query, f);
    if (days) query = query.gte('created_at', new Date(Date.now() - Number(days) * 86400000).toISOString());
    if (q) {
      const like = orLit(`%${q}%`);
      const ors = [`number.ilike.${like}`, `customer_name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`, `wilaya.ilike.${like}`];
      const pn = normPhone(q);
      const digits = q.replace(/\D/g, '');
      if (pn) ors.push(`phone_norm.eq.${pn}`);
      else if (digits.length >= 4) ors.push(`phone_norm.ilike.${orLit(`%${digits.replace(/^0+/, '')}%`)}`);
      query = query.or(ors.join(','));
    }
    return query;
  };

  const { data: rows, count, error } = await build()
    .order('created_at', { ascending: false }).order('id')
    .range((page - 1) * PER, page * PER - 1);
  if (error && isNotMigrated(error)) {
    return (<><h1 className="adm-h1">Commandes</h1><p className="adm-sub">Commandes du site et commandes prises par téléphone.</p><MigrationBanner /></>);
  }

  // Compteurs des filtres et indicateurs du mois.
  const head = { count: 'exact', head: true };
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [cAll, cPending, cOpen, cDelivered, cCancelled, rev] = await Promise.all([
    sb.from('orders').select('id', head).eq('site', SITE),
    sb.from('orders').select('id', head).eq('site', SITE).eq('status', 'pending'),
    sb.from('orders').select('id', head).eq('site', SITE).in('status', OPEN_ORDER_STATUSES),
    sb.from('orders').select('id', head).eq('site', SITE).eq('status', 'delivered'),
    sb.from('orders').select('id', head).eq('site', SITE).eq('status', 'cancelled'),
    sb.from('orders').select('total').eq('site', SITE).in('status', REVENUE_STATUSES).gte('created_at', since30).limit(5000),
  ]);
  const counts = { '': cAll.count || 0, pending: cPending.count || 0, open: cOpen.count || 0, delivered: cDelivered.count || 0, cancelled: cCancelled.count || 0 };
  const revenue30 = (rev.data || []).reduce((a, r) => a + (Number(r.total) || 0), 0);
  const list = rows || [];
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (extra) => {
    const u = new URLSearchParams({ ...(f ? { status: f } : {}), ...(q ? { q } : {}), ...(days ? { days } : {}), ...extra });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    const s = u.toString();
    return `/admin/orders${s ? `?${s}` : ''}`;
  };
  const exportHref = `/api/admin/orders-export?${new URLSearchParams({ ...(f ? { status: f } : {}), ...(q ? { q } : {}), ...(days ? { days } : {}) })}`;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Commandes</h1>
          <p className="adm-sub">Commandes passées sur le site, et celles prises par téléphone, WhatsApp ou sur place.</p>
        </div>
        <div className="quick">
          <a className="adm-btn" href={exportHref}><Icon name="download" size={15} /> Exporter (CSV)</a>
          <Link className="adm-btn primary" href="/admin/orders/new"><Icon name="plus" size={15} /> Nouvelle commande</Link>
        </div>
      </div>

      <div className="crm-kpis">
        <Link className="crm-kpi warn" href="/admin/orders?status=pending"><div className="n">{counts.pending}</div><div className="l">À confirmer — appeler le client</div></Link>
        <Link className="crm-kpi" href="/admin/orders?status=open"><div className="n">{counts.open}</div><div className="l">En cours (confirmées, en préparation, en livraison)</div></Link>
        <div className="crm-kpi ok"><div className="n">{dzd(revenue30)}</div><div className="l">Chiffre d’affaires confirmé — 30 jours</div></div>
      </div>

      <div className="crm-toolbar">
        <div className="crm-chips">
          {FILTERS.map(([k, label]) => (
            <Chip key={k || 'all'} href={qs({ status: k, page: '' })} on={f === k} hot={k === 'pending' && counts.pending > 0}>{label} <b>{counts[k] ?? 0}</b></Chip>
          ))}
        </div>
        <form className="crm-search" method="get" action="/admin/orders">
          {f && <input type="hidden" name="status" value={f} />}
          <select name="days" defaultValue={days} aria-label="Période">
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder="N°, client, société, téléphone…" aria-label="Rechercher" />
          <button className="adm-btn primary" type="submit">Rechercher</button>
          {(q || days) && <Link className="adm-btn" href={qs({ q: '', days: '', page: '' })}>Effacer</Link>}
        </form>
      </div>

      {error && <div className="adm-err">La liste n’a pas pu être chargée. Réessayez dans un instant.</div>}

      <div className="adm-panel">
        {list.length === 0 ? (
          <div className="adm-empty">
            {q || f || days ? 'Aucune commande ne correspond à ces filtres.' : 'Aucune commande pour l’instant. Les commandes passées sur le site arrivent ici — vous pouvez aussi en saisir une.'}
          </div>
        ) : (
          <table className="adm-table crm-table">
            <thead><tr><th>N°</th><th>Reçue</th><th>Client</th><th>Articles</th><th className="num">Total</th><th>Livraison</th><th>Statut</th><th>Pris en charge</th></tr></thead>
            <tbody>
              {list.map((o) => {
                const n = Array.isArray(o.items) ? o.items.length : 0;
                const href = `/admin/orders/${o.id}`;
                return (
                  <tr key={o.id}>
                    <td className="nowrap"><Link className="rowlink" href={href}><b>{o.number || '—'}</b></Link><div className="muted">{sourceLabel(o.source)}</div></td>
                    <td className="nowrap"><Link className="rowlink" href={href}>{fmtDateTime(o.created_at)}</Link></td>
                    <td><Link className="rowlink" href={href}><b>{personOf(o)}</b><div className="muted">{o.phone || ''}</div></Link></td>
                    <td className="nowrap"><Link className="rowlink" href={href}>{n} article{n > 1 ? 's' : ''}</Link></td>
                    <td className="num"><Link className="rowlink" href={href}><b>{Number(o.total) ? dzd(o.total) : '—'}</b></Link></td>
                    <td><Link className="rowlink" href={href}>{deliveryLabel(o.delivery_method)}<div className="muted">{o.wilaya || ''}</div></Link></td>
                    <td><StatusBadge kind="order" value={o.status} />{o.status === 'pending' && o.call_attempts > 0 && <div className="muted">{o.call_attempts} appel{o.call_attempts > 1 ? 's' : ''}</div>}</td>
                    <td><Who email={o.assigned_to} team={team} empty="—" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="crm-pager">
          {page > 1 && <Link className="adm-btn sm" href={qs({ page: String(page - 1) })}>← Précédent</Link>}
          <span className="adm-muted">Page {page} / {pages} · {total} commande{total > 1 ? 's' : ''}</span>
          {page < pages && <Link className="adm-btn sm" href={qs({ page: String(page + 1) })}>Suivant →</Link>}
        </div>
      )}
      <p className="adm-muted" style={{ textAlign: 'center' }}>Les statuts : {ORDER_STATUSES.map((s) => s.label).join(' → ').replace('→ Annulée', '· Annulée')}</p>
    </>
  );
}
