import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { ReviewControls } from '@/components/admin/controls';
import { SITE } from '@/lib/site';
export const dynamic = 'force-dynamic';

// Les avis arrivent désormais NON approuvés : sans filtre, ceux qui attendent
// une modération se perdaient au milieu des avis déjà publiés.
const FILTERS = ['pending', 'approved'];
const LABEL = { pending: 'En attente', approved: 'Publiés' };
const chipStyle = (on) => ({
  display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 13px', borderRadius: 999,
  border: '1px solid var(--line, rgba(22,18,14,.12))', textDecoration: 'none', fontSize: 13, fontWeight: 600,
  background: on ? '#16120E' : '#fff', color: on ? '#fff' : '#6E655C',
});

export default async function Reviews({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const filter = FILTERS.includes(sp.status) ? sp.status : '';
  const sb = createAdminClient();

  // Paginé : PostgREST plafonne chaque réponse à 1000 lignes.
  const { data } = await selectAll(() => {
    let qy = sb.from('reviews').select('*').eq('site', SITE);
    if (filter) qy = qy.eq('approved', filter === 'approved');
    return qy.order('created_at', { ascending: false }).order('id');
  });

  const counts = {};
  await Promise.all(FILTERS.map(async (f) => {
    const { count } = await sb.from('reviews').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('approved', f === 'approved');
    counts[f] = count || 0;
  }));
  const total = counts.pending + counts.approved;
  const qs = (f) => `/admin/reviews${f ? `?status=${f}` : ''}`;

  return (
    <>
      <h1 className="adm-h1">Avis clients</h1>
      <p className="adm-sub">{total} avis · {counts.pending} en attente de modération. Un avis n’apparaît sur le site qu’une fois publié.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <Link style={chipStyle(!filter)} href={qs('')}>Tous <b>{total}</b></Link>
        {FILTERS.map((f) => (
          <Link key={f} style={chipStyle(filter === f)} href={qs(f)}>{LABEL[f]} <b>{counts[f]}</b></Link>
        ))}
      </div>

      <div className="adm-panel">
        {(!data || data.length === 0) ? <div className="adm-empty">Aucun avis.</div> : (
          <table className="adm-table">
            <thead><tr><th>Date</th><th>Produit</th><th>Auteur</th><th>Note</th><th>Avis</th><th>État</th><th></th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="adm-muted">{(r.created_at || '').slice(0, 10)}</td>
                  <td className="adm-muted">{r.product_id}</td>
                  <td>{r.author}</td>
                  <td>{r.rating}★</td>
                  <td style={{ maxWidth: 320 }}><b>{r.title || ''}</b><div>{r.body}</div></td>
                  <td><span className={`adm-tag ${r.approved ? 'ok' : 'warn'}`}>{r.approved ? 'Publié' : 'En attente'}</span></td>
                  <td><ReviewControls id={r.id} approved={r.approved} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
