import { hasSupabase, createAdminClient } from '@/lib/supabase/server';
import { getAiConfig } from '@/lib/queries';
import AiSettingsManager from '@/components/admin/AiSettingsManager';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Assistant IA' };

export default async function AiPage() {
  if (!hasSupabase()) return null;
  const config = await getAiConfig();

  // Derniers échanges, pour vérifier d'un coup d'œil que l'assistant tourne.
  let recent = [];
  try {
    const sb = createAdminClient();
    const { data } = await sb.from('ai_messages').select('role,content,created_at,session_id')
      .eq('site', SITE).order('created_at', { ascending: false }).limit(12);
    recent = data || [];
  } catch { /* table absente : migration non appliquée */ }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Assistant IA</h1>
          <p className="adm-sub">
            Branchez le chat du site sur votre plateforme d-tech-ai, ou laissez l’assistant
            répondre à partir du catalogue. Testez la connexion avant d’enregistrer.
          </p>
        </div>
        <span className={`adm-tag ${config.enabled ? 'ok' : 'gray'}`}>
          {config.enabled ? (config.provider === 'dtech' ? 'Plateforme connectée' : 'Assistant catalogue') : 'Chat désactivé'}
        </span>
      </div>

      {!config.configured && (
        <div className="adm-err" style={{ marginBottom: 16 }}>
          La table <code>ai_config</code> n’existe pas encore : lancez <b>apply-upgrade.bat</b> une fois
          pour pouvoir enregistrer vos réglages. En attendant, le chat fonctionne en mode catalogue.
        </div>
      )}

      <AiSettingsManager config={config} siteUrl={siteUrl} />

      {recent.length > 0 && (
        <div className="adm-panel" style={{ marginTop: 18 }}>
          <div className="adm-panel-hd">
            <h2>Derniers échanges</h2>
            <span className="muted">{recent.length} message(s)</span>
          </div>
          <table className="adm-table">
            <thead><tr><th>Quand</th><th>Qui</th><th>Message</th></tr></thead>
            <tbody>
              {recent.map((m, i) => (
                <tr key={i}>
                  <td className="adm-muted" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(m.created_at).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td><span className={`adm-tag ${m.role === 'user' ? 'blue' : 'gray'}`}>{m.role === 'user' ? 'Visiteur' : 'Assistant'}</span></td>
                  <td>{String(m.content).slice(0, 220)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
