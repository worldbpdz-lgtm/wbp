import Link from 'next/link';
import { Icon } from '@/components/primitives';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { createCampaign } from '@/app/admin/actions';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Mêmes pastilles que les commandes et devis (classes .st du back-office).
const STATUS = {
  draft: { l: 'Brouillon', tone: 'off' },
  sending: { l: 'Envoi en cours', tone: 'warn' },
  sent: { l: 'Envoyée', tone: 'ok' },
};

export default async function Campaigns() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const { data } = await sb.from('email_campaigns').select('*').eq('site', SITE).order('created_at', { ascending: false }).limit(500);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Campagnes e-mail</h1>
          <p className="adm-sub">{data?.length || 0} campagne(s)</p>
        </div>
        <form action={createCampaign}><button className="adm-btn primary" type="submit"><Icon name="plus" size={16} /> Nouvelle campagne</button></form>
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
                    <td><span className={`st ${st.tone}`}>{st.l}</span></td>
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
