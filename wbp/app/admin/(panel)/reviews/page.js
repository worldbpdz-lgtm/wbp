import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { ReviewControls } from '@/components/admin/controls';
import { SITE } from '@/lib/site';
export const dynamic = 'force-dynamic';
export default async function Reviews() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const { data } = await sb.from('reviews').select('*').eq('site', SITE).order('created_at', { ascending: false });
  return (
    <>
      <h1 className="adm-h1">Avis clients</h1>
      <p className="adm-sub">{data?.length || 0} avis. Les avis masqués n’apparaissent pas sur le site.</p>
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
                  <td><span className={`adm-tag ${r.approved ? 'ok' : 'new'}`}>{r.approved ? 'Publié' : 'Masqué'}</span></td>
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
