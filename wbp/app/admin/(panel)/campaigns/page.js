import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { createCampaign } from '@/app/admin/actions';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

const STATUS = {
  draft: { l: 'Brouillon', bg: 'rgba(22,18,14,.08)', fg: '#6E655C' },
  sending: { l: 'Envoi en cours', bg: 'rgba(255,159,28,.16)', fg: '#b9740a' },
  sent: { l: 'Envoyée', bg: 'rgba(31,157,85,.12)', fg: '#1f8a4c' },
};

export default async function Campaigns() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const { data } = await sb.from('email_campaigns').select('*').eq('site', SITE).order('created_at', { ascending: false }).limit(500);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="adm-h1">Campagnes e-mail</h1>
          <p className="adm-sub">{data?.length || 0} campagne(s)</p>
        </div>
        <form action={createCampaign}><button className="adm-btn primary" type="submit">+ Nouvelle campagne</button></form>
      </div>

      <div className="adm-panel" style={{ marginTop: 16 }}>
        {(!data || data.length === 0) ? <div className="adm-empty">Aucune campagne. Créez-en une pour commencer.</div> : (
          <table className="adm-table">
            <thead><tr><th>Objet</th><th>Statut</th><th>Envoyés</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {data.map((c) => {
                const st = STATUS[c.status] || STATUS.draft;
                return (
                  <tr key={c.id}>
                    <td><b>{c.subject || 'Sans objet'}</b>{c.preheader ? <div className="adm-muted" style={{ fontSize: 12 }}>{c.preheader}</div> : null}</td>
                    <td><span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: st.bg, color: st.fg }}>{st.l}</span></td>
                    <td className="adm-muted">{c.sent_count || 0}</td>
                    <td className="adm-muted">{(c.created_at || '').slice(0, 10)}</td>
                    <td><Link className="adm-btn sm" href={`/admin/campaigns/${c.id}`}>Ouvrir</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
