import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { StatusSelect, DeleteBtn } from '@/components/admin/controls';
import { SITE } from '@/lib/site';
export const dynamic = 'force-dynamic';
export default async function Quotes() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const { data } = await sb.from('quote_requests').select('*').eq('site', SITE).order('created_at', { ascending: false });
  return (
    <>
      <h1 className="adm-h1">Demandes de devis</h1>
      <p className="adm-sub">{data?.length || 0} demande(s).</p>
      <div className="adm-panel">
        {(!data || data.length === 0) ? <div className="adm-empty">Aucune demande.</div> : (
          <table className="adm-table">
            <thead><tr><th>Date</th><th>Client</th><th>Contact</th><th>Articles</th><th>Message</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {data.map((q) => (
                <tr key={q.id}>
                  <td className="adm-muted">{(q.created_at || '').slice(0, 10)}</td>
                  <td><b>{q.customer_name || '—'}</b><div className="adm-muted">{q.company || ''}</div></td>
                  <td>{q.email}<div className="adm-muted">{q.phone || ''}</div></td>
                  <td>{(q.items || []).map((it, i) => <div key={i} className="adm-muted">{it.qty}× {it.code}</div>)}</td>
                  <td style={{ maxWidth: 240 }}>{q.message || ''}</td>
                  <td><StatusSelect kind="quote" id={q.id} status={q.status} /></td>
                  <td><DeleteBtn kind="quote" id={q.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
