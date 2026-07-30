import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { DeleteBtn } from '@/components/admin/controls';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

const STATUSES = ['subscribed', 'pending', 'unsubscribed', 'bounced'];
const LABEL = { subscribed: 'Abonné', pending: 'En attente', unsubscribed: 'Désinscrit', bounced: 'Rejeté' };
const TONE = {
  subscribed: { bg: 'rgba(31,157,85,.12)', fg: '#1f8a4c' },
  pending: { bg: 'rgba(255,159,28,.16)', fg: '#b9740a' },
  unsubscribed: { bg: 'rgba(22,18,14,.08)', fg: '#6E655C' },
  bounced: { bg: 'rgba(229,72,77,.12)', fg: '#c0392b' },
};
const chipStyle = (on) => ({
  display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 13px', borderRadius: 999,
  border: '1px solid var(--line, rgba(22,18,14,.12))', textDecoration: 'none', fontSize: 13, fontWeight: 600,
  background: on ? '#16120E' : '#fff', color: on ? '#fff' : '#6E655C',
});
const inputStyle = { width: '100%', height: 42, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(22,18,14,.14)', fontSize: 14, outline: 'none', background: '#fff' };

function Badge({ status }) {
  const tone = TONE[status] || TONE.unsubscribed;
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: tone.bg, color: tone.fg }}>{LABEL[status] || status}</span>;
}

export default async function Subscribers({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const q = (sp.q || '').trim();
  const status = STATUSES.includes(sp.status) ? sp.status : '';
  const sb = createAdminClient();

  let query = sb.from('newsletter_subscribers').select('*').eq('site', SITE).order('created_at', { ascending: false }).limit(2000);
  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('email', `%${q}%`);
  const { data } = await query;

  const counts = {};
  await Promise.all(STATUSES.map(async (st) => {
    const { count } = await sb.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('status', st);
    counts[st] = count || 0;
  }));
  const total = STATUSES.reduce((a, st) => a + counts[st], 0);

  const qs = (st) => {
    const p = new URLSearchParams();
    if (st) p.set('status', st);
    if (q) p.set('q', q);
    const s = p.toString();
    return `/admin/subscribers${s ? '?' + s : ''}`;
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="adm-h1">Newsletter — abonnés</h1>
          <p className="adm-sub">{total} au total · {counts.subscribed} actif(s)</p>
        </div>
        <a className="adm-btn" href="/api/admin/subscribers-export">Exporter CSV</a>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <Link style={chipStyle(!status)} href={qs('')}>Tous <b>{total}</b></Link>
        {STATUSES.map((st) => (
          <Link key={st} style={chipStyle(status === st)} href={qs(st)}>{LABEL[st]} <b>{counts[st]}</b></Link>
        ))}
      </div>

      <form style={{ marginBottom: 14 }} action="/admin/subscribers" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Rechercher un e-mail…" style={inputStyle} />
      </form>

      <div className="adm-panel">
        {(!data || data.length === 0) ? <div className="adm-empty">Aucun abonné.</div> : (
          <table className="adm-table">
            <thead><tr><th>Date</th><th>E-mail</th><th>Statut</th><th>Langue</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="adm-muted">{(s.created_at || '').slice(0, 10)}</td>
                  <td>{s.email}</td>
                  <td><Badge status={s.status || 'subscribed'} /></td>
                  <td className="adm-muted">{(s.lang || 'fr').toUpperCase()}</td>
                  <td className="adm-muted">{s.source || 'website'}</td>
                  <td><DeleteBtn kind="subscriber" id={s.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
