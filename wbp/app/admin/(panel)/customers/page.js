import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/primitives';
import { Chip, MigrationBanner } from '@/components/admin/crm/ui';
import { isNotMigrated, orLit } from '@/lib/crm-server';
import { CUSTOMER_KINDS, REVENUE_STATUSES, kindLabel } from '@/lib/crm';
import { dzd } from '@/lib/pricing';
import { ago } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Clients' };

const PER = 30;
const SORTS = [['recent', 'Activité récente'], ['name', 'Nom (A → Z)'], ['new', 'Fiches récentes']];

export default async function CustomersPage({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const q = String(sp.q || '').trim().slice(0, 80);
  const kind = CUSTOMER_KINDS.some((k) => k.value === sp.kind) ? sp.kind : '';
  const sort = SORTS.some(([k]) => k === sp.sort) ? sp.sort : 'recent';
  const page = Math.max(1, parseInt(sp.page, 10) || 1);
  const sb = createAdminClient();

  let query = sb.from('customers').select('*', { count: 'exact' }).eq('site', SITE);
  if (kind) query = query.eq('kind', kind);
  if (q) {
    const like = orLit(`%${q}%`);
    const ors = [`name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`, `wilaya.ilike.${like}`, `city.ilike.${like}`, `nif.ilike.${like}`];
    const digits = q.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length >= 4) ors.push(`phone_norm.ilike.${orLit(`%${digits}%`)}`, `phone2_norm.ilike.${orLit(`%${digits}%`)}`);
    query = query.or(ors.join(','));
  }
  query = sort === 'name' ? query.order('company', { ascending: true, nullsFirst: false }).order('name')
    : sort === 'new' ? query.order('created_at', { ascending: false })
      : query.order('last_activity_at', { ascending: false });
  const { data: rows, count, error } = await query.order('id').range((page - 1) * PER, page * PER - 1);
  if (error && isNotMigrated(error)) {
    return (<><h1 className="adm-h1">Clients</h1><p className="adm-sub">Toutes les personnes et sociétés qui ont demandé un devis, commandé ou écrit.</p><MigrationBanner /></>);
  }
  const list = rows || [];

  // Totaux par client, pour la page affichée seulement.
  const ids = list.map((c) => c.id);
  const [ord, quo] = ids.length ? await Promise.all([
    sb.from('orders').select('customer_id,status,total').in('customer_id', ids).limit(5000),
    sb.from('quote_requests').select('customer_id').in('customer_id', ids).limit(5000),
  ]) : [{ data: [] }, { data: [] }];
  const stats = {};
  for (const id of ids) stats[id] = { orders: 0, revenue: 0, quotes: 0 };
  for (const o of ord.data || []) {
    const s = stats[o.customer_id]; if (!s) continue;
    if (o.status !== 'cancelled') s.orders += 1;
    if (REVENUE_STATUSES.includes(o.status)) s.revenue += Number(o.total) || 0;
  }
  for (const r of quo.data || []) { const s = stats[r.customer_id]; if (s) s.quotes += 1; }

  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (extra) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(kind ? { kind } : {}), ...(sort !== 'recent' ? { sort } : {}), ...extra });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    const s = u.toString();
    return `/admin/customers${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Clients</h1>
          <p className="adm-sub">{total} fiche{total > 1 ? 's' : ''}. Créées automatiquement à chaque devis, commande ou message (reconnues par le téléphone ou l’e-mail).</p>
        </div>
        <div className="quick">
          <a className="adm-btn" href="/api/admin/customers-export"><Icon name="download" size={15} /> Exporter (CSV)</a>
          <Link className="adm-btn primary" href="/admin/customers/new"><Icon name="plus" size={15} /> Nouvelle fiche</Link>
        </div>
      </div>

      <div className="crm-toolbar">
        <div className="crm-chips">
          <Chip href={qs({ kind: '', page: '' })} on={!kind}>Tous</Chip>
          {CUSTOMER_KINDS.map((k) => <Chip key={k.value} href={qs({ kind: k.value, page: '' })} on={kind === k.value}>{k.label}</Chip>)}
        </div>
        <form className="crm-search" method="get" action="/admin/customers">
          {kind && <input type="hidden" name="kind" value={kind} />}
          <select name="sort" defaultValue={sort} aria-label="Trier">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input name="q" defaultValue={q} placeholder="Nom, société, téléphone, wilaya, NIF…" aria-label="Rechercher" />
          <button className="adm-btn primary" type="submit">Rechercher</button>
          {q && <Link className="adm-btn" href={qs({ q: '', page: '' })}>Effacer</Link>}
        </form>
      </div>

      <div className="adm-panel">
        {list.length === 0 ? <div className="adm-empty">{q || kind ? 'Aucune fiche ne correspond.' : 'Aucune fiche client pour l’instant.'}</div> : (
          <table className="adm-table crm-table">
            <thead><tr><th>Client</th><th>Contact</th><th>Wilaya</th><th className="num">Commandes</th><th className="num">Chiffre d’affaires</th><th className="num">Devis</th><th>Dernière activité</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const s = stats[c.id] || {};
                const href = `/admin/customers/${c.id}`;
                return (
                  <tr key={c.id}>
                    <td><Link className="rowlink" href={href}><b>{c.company || c.name || 'Sans nom'}</b><div className="muted">{[c.company && c.name, kindLabel(c.kind)].filter(Boolean).join(' · ')}</div></Link></td>
                    <td><Link className="rowlink" href={href}>{c.phone || '—'}<div className="muted">{c.email || ''}</div></Link></td>
                    <td>{c.wilaya || <span className="muted">—</span>}</td>
                    <td className="num">{s.orders || 0}</td>
                    <td className="num"><b>{s.revenue ? dzd(s.revenue) : '—'}</b></td>
                    <td className="num">{s.quotes || 0}</td>
                    <td className="nowrap muted">{ago(c.last_activity_at)}</td>
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
          <span className="adm-muted">Page {page} / {pages}</span>
          {page < pages && <Link className="adm-btn sm" href={qs({ page: String(page + 1) })}>Suivant →</Link>}
        </div>
      )}
    </>
  );
}
