import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/primitives';
import { StatusBadge, Who, Chip } from '@/components/admin/crm/ui';
import { isNotMigrated, orLit } from '@/lib/crm-server';
import { adminRoster } from '@/lib/activity';
import { QUOTE_STATUSES, personOf } from '@/lib/crm';
import { dzd } from '@/lib/pricing';
import { fmtDateTime } from '@/lib/dates';
import { normPhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Demandes de devis' };

const PER = 30;
const FILTERS = [['', 'Toutes'], ...QUOTE_STATUSES.map((s) => [s.value, s.label])];

// ============================================================================
// Demandes de devis. Avant : un tableau unique, chargé en entier (et donc
// tronqué en silence à 1000 lignes par PostgREST), statuts en codes bruts
// (« new », « contacted »), pas de recherche ni de fiche. Maintenant : filtres
// par statut avec compteurs, recherche (nom, société, e-mail, téléphone, n°),
// pagination, et une fiche complète par demande.
// ============================================================================
export default async function QuotesPage({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const f = FILTERS.some(([k]) => k === sp.status) ? sp.status || '' : '';
  const q = String(sp.q || '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page, 10) || 1);
  const sb = createAdminClient();
  const team = adminRoster();

  // Base non migrée : pas de colonnes number / phone_norm → recherche réduite.
  const run = async (migrated) => {
    let query = sb.from('quote_requests').select('*', { count: 'exact' }).eq('site', SITE);
    if (f) query = query.eq('status', f);
    if (q) {
      const like = orLit(`%${q}%`);
      const ors = [`customer_name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`, `message.ilike.${like}`];
      if (migrated) {
        ors.push(`number.ilike.${like}`);
        const pn = normPhone(q);
        if (pn) ors.push(`phone_norm.eq.${pn}`);
      }
      query = query.or(ors.join(','));
    }
    return query.order('created_at', { ascending: false }).order('id').range((page - 1) * PER, page * PER - 1);
  };
  let res = await run(true);
  if (res.error && isNotMigrated(res.error)) res = await run(false);
  const rows = res.data || [];

  const head = { count: 'exact', head: true };
  const countRes = await Promise.all(QUOTE_STATUSES.map((s) => sb.from('quote_requests').select('id', head).eq('site', SITE).eq('status', s.value)));
  const allRes = await sb.from('quote_requests').select('id', head).eq('site', SITE);
  const counts = { '': allRes.count || 0 };
  QUOTE_STATUSES.forEach((s, i) => { counts[s.value] = countRes[i].count || 0; });

  // Devis déjà convertis en commande (lien direct dans la liste).
  const ids = rows.map((r) => r.id);
  const conv = ids.length ? await sb.from('orders').select('id,number,quote_id').in('quote_id', ids) : { data: [] };
  const orderOf = Object.fromEntries((conv.data || []).map((o) => [o.quote_id, o]));

  const total = res.count || 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (extra) => {
    const u = new URLSearchParams({ ...(f ? { status: f } : {}), ...(q ? { q } : {}), ...extra });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    const s = u.toString();
    return `/admin/quotes${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Demandes de devis</h1>
          <p className="adm-sub">{counts.new} nouvelle{counts.new > 1 ? 's' : ''} à traiter · {counts[''] } au total. Ouvrez une demande pour la chiffrer, l’imprimer ou la convertir en commande.</p>
        </div>
        <Link className="adm-btn primary" href="/admin/quotes/new"><Icon name="plus" size={15} /> Nouveau devis</Link>
      </div>

      <div className="crm-toolbar">
        <div className="crm-chips">
          {FILTERS.map(([k, label]) => (
            <Chip key={k || 'all'} href={qs({ status: k, page: '' })} on={f === k} hot={k === 'new' && counts.new > 0}>{label} <b>{counts[k] ?? 0}</b></Chip>
          ))}
        </div>
        <form className="crm-search" method="get" action="/admin/quotes">
          {f && <input type="hidden" name="status" value={f} />}
          <input name="q" defaultValue={q} placeholder="Client, société, e-mail, téléphone, n°…" aria-label="Rechercher" />
          <button className="adm-btn primary" type="submit">Rechercher</button>
          {q && <Link className="adm-btn" href={qs({ q: '', page: '' })}>Effacer</Link>}
        </form>
      </div>

      {res.error && <div className="adm-err">La liste n’a pas pu être chargée. Réessayez dans un instant.</div>}

      <div className="adm-panel">
        {rows.length === 0 ? (
          <div className="adm-empty">{q || f ? 'Aucune demande ne correspond.' : 'Aucune demande de devis pour l’instant.'}</div>
        ) : (
          <table className="adm-table crm-table">
            <thead><tr><th>N°</th><th>Reçue</th><th>Client</th><th>Demande</th><th className="num">Montant</th><th>Statut</th><th>Pris en charge</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const items = Array.isArray(r.items) ? r.items : [];
                const href = `/admin/quotes/${r.id}`;
                const o = orderOf[r.id];
                return (
                  <tr key={r.id} className={r.status === 'new' ? 'unread' : ''}>
                    <td className="nowrap"><Link className="rowlink" href={href}><b>{r.number || 'Ouvrir'}</b></Link></td>
                    <td className="nowrap"><Link className="rowlink" href={href}>{fmtDateTime(r.created_at)}</Link></td>
                    <td><Link className="rowlink" href={href}><b>{personOf(r)}</b><div className="muted">{[r.phone, r.email].filter(Boolean).join(' · ')}</div></Link></td>
                    <td style={{ maxWidth: 340 }}>
                      <Link className="rowlink" href={href}>
                        {items.length > 0 && <div>{items.slice(0, 2).map((it, i) => <div key={i} className="muted">{it.qty}× {it.name || it.code}</div>)}{items.length > 2 && <div className="muted">+ {items.length - 2} autre{items.length > 3 ? 's' : ''}</div>}</div>}
                        {r.message && <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>« {r.message} »</div>}
                      </Link>
                    </td>
                    <td className="num">{Number(r.total) ? dzd(r.total) : <span className="muted">—</span>}</td>
                    <td><StatusBadge kind="quote" value={r.status} />{o && <div className="muted"><Link href={`/admin/orders/${o.id}`}>→ {o.number}</Link></div>}</td>
                    <td><Who email={r.assigned_to} team={team} /></td>
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
          <span className="adm-muted">Page {page} / {pages} · {total} demande{total > 1 ? 's' : ''}</span>
          {page < pages && <Link className="adm-btn sm" href={qs({ page: String(page + 1) })}>Suivant →</Link>}
        </div>
      )}
    </>
  );
}
