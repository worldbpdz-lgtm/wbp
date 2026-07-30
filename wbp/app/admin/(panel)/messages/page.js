import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { StatusSelect, DeleteBtn } from '@/components/admin/controls';
import { SITE } from '@/lib/site';
export const dynamic = 'force-dynamic';
export default async function Messages() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const { data } = await sb.from('contact_messages').select('*').eq('site', SITE).order('created_at', { ascending: false });
  return (
    <>
      <h1 className="adm-h1">Messages de contact</h1>
      <p className="adm-sub">{data?.length || 0} message(s).</p>
      <div className="adm-panel">
        {(!data || data.length === 0) ? <div className="adm-empty">Aucun message.</div> : (
          <table className="adm-table">
            <thead><tr><th>Date</th><th>Expéditeur</th><th>Contact</th><th>Sujet / message</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td className="adm-muted">{(m.created_at || '').slice(0, 10)}</td>
                  <td><b>{m.name || '—'}</b><div className="adm-muted">{m.company || ''}</div></td>
                  <td>{m.email}<div className="adm-muted">{m.phone || ''}</div></td>
                  <td style={{ maxWidth: 320 }}><b>{m.subject || ''}</b><div>{m.message || ''}</div></td>
                  <td><StatusSelect kind="message" id={m.id} status={m.status} /></td>
                  <td><DeleteBtn kind="message" id={m.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
