import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { ReviewControls } from '@/components/admin/controls';
import { SITE } from '@/lib/site';
import { fmtDate } from '@/lib/dates';
export const dynamic = 'force-dynamic';

// Les avis arrivent désormais NON approuvés : sans filtre, ceux qui attendent
// une modération se perdaient au milieu des avis déjà publiés.
const FILTERS = ['pending', 'approved'];
const LABEL = { pending: 'En attente', approved: 'Publiés' };

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

  // Le produit s'affiche par son nom (et mène à sa fiche), plus par son
  // identifiant interne (« r0002 ») que personne ne sait relire.
  const ids = [...new Set((data || []).map((r) => r.product_id).filter(Boolean))];
  const names = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data: prods } = await sb.from('products').select('id,name,code').in('id', ids.slice(i, i + 200));
    for (const p of prods || []) names[p.id] = p.name || p.code || p.id;
  }

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

      <div className="crm-chips" style={{ margin: '4px 0 14px' }}>
        <Link className={`crm-chip ${(!filter) ? 'on' : ''}`} href={qs('')}>Tous <b>{total}</b></Link>
        {FILTERS.map((f) => (
          <Link key={f} className={`crm-chip ${(filter === f) ? 'on' : ''}`} href={qs(f)}>{LABEL[f]} <b>{counts[f]}</b></Link>
        ))}
      </div>

      <div className="adm-panel">
        {(!data || data.length === 0) ? <div className="adm-empty">Aucun avis.</div> : (
          <table className="adm-table">
            <thead><tr><th>Date</th><th>Produit</th><th>Auteur</th><th>Note</th><th>Avis</th><th>État</th><th></th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="adm-muted">{fmtDate(r.created_at)}</td>
                  <td style={{ maxWidth: 220 }}>
                    {names[r.product_id]
                      ? <Link href={`/admin/products/${encodeURIComponent(r.product_id)}`} style={{ color: 'inherit', fontWeight: 600 }}>{names[r.product_id]}</Link>
                      : <span className="adm-muted">{r.product_id || '—'}</span>}
                  </td>
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
