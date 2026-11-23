import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { StatusBadge, Who, Chip } from '@/components/admin/crm/ui';
import { isNotMigrated, orLit } from '@/lib/crm-server';
import { adminRoster } from '@/lib/activity';
import { MESSAGE_STATUSES, personOf } from '@/lib/crm';
import { fmtDateTime } from '@/lib/dates';
import { normPhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Messages' };

const PER = 30;
const FILTERS = [['', 'Tous'], ...MESSAGE_STATUSES.map((s) => [s.value, s.label])];

export default async function MessagesPage({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const f = FILTERS.some(([k]) => k === sp.status) ? sp.status || '' : '';
  const q = String(sp.q || '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(sp.page, 10) || 1);
  const sb = createAdminClient();
  const team = adminRoster();

  const run = async (migrated) => {
    let query = sb.from('contact_messages').select('*', { count: 'exact' }).eq('site', SITE);
    if (f) query = query.eq('status', f);
    if (q) {
      const like = orLit(`%${q}%`);
      const ors = [`name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`, `subject.ilike.${like}`, `message.ilike.${like}`];
      const pn = normPhone(q);
      if (migrated && pn) ors.push(`phone_norm.eq.${pn}`);
      query = query.or(ors.join(','));
    }
    return query.order('created_at', { ascending: false }).order('id').range((page - 1) * PER, page * PER - 1);
  };
  let res = await run(true);
  if (res.error && isNotMigrated(res.error)) res = await run(false);
  const rows = res.data || [];

  const head = { count: 'exact', head: true };
  const [all, ...per] = await Promise.all([
    sb.from('contact_messages').select('id', head).eq('site', SITE),
    ...MESSAGE_STATUSES.map((s) => sb.from('contact_messages').select('id', head).eq('site', SITE).eq('status', s.value)),
  ]);
  const counts = { '': all.count || 0 };
  MESSAGE_STATUSES.forEach((s, i) => { counts[s.value] = per[i].count || 0; });
  const total = res.count || 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (extra) => {
    const u = new URLSearchParams({ ...(f ? { status: f } : {}), ...(q ? { q } : {}), ...extra });
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    const s = u.toString();
    return `/admin/messages${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <h1 className="adm-h1">Messages et questions</h1>
      <p className="adm-sub">{counts.new} nouveau{counts.new > 1 ? 'x' : ''} · {counts['']} au total. Ouvrez un message pour y répondre, le noter ou en faire une commande.</p>

      <div className="crm-toolbar" style={{ marginTop: 16 }}>
        <div className="crm-chips">
          {FILTERS.map(([k, label]) => (
            <Chip key={k || 'all'} href={qs({ status: k, page: '' })} on={f === k} hot={k === 'new' && counts.new > 0}>{label} <b>{counts[k] ?? 0}</b></Chip>
          ))}
        </div>
        <form className="crm-search" method="get" action="/admin/messages">
          {f && <input type="hidden" name="status" value={f} />}
          <input name="q" defaultValue={q} placeholder="Nom, société, téléphone, sujet…" aria-label="Rechercher" />
          <button className="adm-btn primary" type="submit">Rechercher</button>
          {q && <Link className="adm-btn" href={qs({ q: '', page: '' })}>Effacer</Link>}
        </form>
      </div>

      <div className="adm-panel">
        {rows.length === 0 ? <div className="adm-empty">{q || f ? 'Aucun message ne correspond.' : 'Aucun message pour l’instant.'}</div> : (
          <table className="adm-table crm-table">
            <thead><tr><th>Reçu</th><th>Expéditeur</th><th>Sujet / message</th><th>Statut</th><th>Pris en charge</th></tr></thead>
            <tbody>
              {rows.map((m) => {
                const href = `/admin/messages/${m.id}`;
                return (
                  <tr key={m.id} className={m.status === 'new' ? 'unread' : ''}>
                    <td className="nowrap"><Link className="rowlink" href={href}>{fmtDateTime(m.created_at)}</Link></td>
                    <td><Link className="rowlink" href={href}><b>{personOf(m)}</b><div className="muted">{[m.phone, m.email].filter(Boolean).join(' · ')}</div></Link></td>
                    <td style={{ maxWidth: 420 }}><Link className="rowlink" href={href}><b>{m.subject || 'Sans sujet'}</b><div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.message}</div></Link></td>
                    <td><StatusBadge kind="message" value={m.status} /></td>
                    <td><Who email={m.assigned_to} team={team} /></td>
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
          <span className="adm-muted">Page {page} / {pages}</span>
          {page < pages && <Link className="adm-btn sm" href={qs({ page: String(page + 1) })}>Suivant →</Link>}
        </div>
      )}
    </>
  );
}
