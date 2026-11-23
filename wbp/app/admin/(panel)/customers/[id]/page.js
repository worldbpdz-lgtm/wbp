import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/primitives';
import { StatusBadge, ContactLinks, MigrationBanner } from '@/components/admin/crm/ui';
import CustomerForm from '@/components/admin/crm/CustomerForm';
import { isNotMigrated } from '@/lib/crm-server';
import { REVENUE_STATUSES, kindLabel } from '@/lib/crm';
import { dzd } from '@/lib/pricing';
import { fmtDateTime, ago } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Fiche client' };

export default async function CustomerPage({ params }) {
  if (!hasSupabase()) return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = createAdminClient();
  const { data: c, error } = await sb.from('customers').select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (error && isNotMigrated(error)) return <MigrationBanner />;
  if (!c) return <div className="adm-panel"><div className="adm-empty">Cette fiche n’existe plus (fusionnée ou supprimée). <Link href="/admin/customers">Retour aux clients</Link></div></div>;

  const [orders, quotes, messages] = await Promise.all([
    sb.from('orders').select('id,number,status,total,items,created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(200),
    sb.from('quote_requests').select('id,number,status,total,items,message,created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(200),
    sb.from('contact_messages').select('id,subject,message,status,created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(200),
  ]);
  const O = orders.data || [], Q = quotes.data || [], M = messages.data || [];
  const revenue = O.filter((o) => REVENUE_STATUSES.includes(o.status)).reduce((a, o) => a + (Number(o.total) || 0), 0);
  const active = O.filter((o) => o.status !== 'cancelled').length;
  const won = Q.filter((q) => q.status === 'won').length;
  const feed = [
    ...O.map((o) => ({ at: o.created_at, href: `/admin/orders/${o.id}`, icon: 'truck', color: '#1F9D55', title: `Commande ${o.number || ''}`, sub: `${(o.items || []).length} article(s)`, right: Number(o.total) ? dzd(o.total) : '', kind: 'order', status: o.status })),
    ...Q.map((q) => ({ at: q.created_at, href: `/admin/quotes/${q.id}`, icon: 'receipt', color: '#7c3aed', title: `Demande de devis ${q.number || ''}`, sub: q.message || `${(q.items || []).length} article(s)`, right: Number(q.total) ? dzd(q.total) : '', kind: 'quote', status: q.status })),
    ...M.map((m) => ({ at: m.created_at, href: `/admin/messages/${m.id}`, icon: 'mail', color: '#3B82F6', title: m.subject || 'Message', sub: m.message, right: '', kind: 'message', status: m.status })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const title = c.company || c.name || 'Client sans nom';

  return (
    <>
      <Link href="/admin/customers" className="crm-back"><Icon name="chevleft" size={15} /> Clients</Link>
      <div className="crm-head">
        <div>
          <h1>{title}{c.kind && <span className="st off plain">{kindLabel(c.kind)}</span>}</h1>
          <div className="meta">
            {c.company && c.name && <span>{c.name}</span>}
            {c.wilaya && <span>{[c.city, c.wilaya].filter(Boolean).join(', ')}</span>}
            <span>Client depuis le {fmtDateTime(c.created_at).slice(0, 10)}</span>
            <span>Dernière activité {ago(c.last_activity_at)}</span>
          </div>
        </div>
        <div className="quick">
          <Link className="adm-btn" href={`/admin/quotes/new?customer=${c.id}`}><Icon name="receipt" size={15} /> Nouveau devis</Link>
          <Link className="adm-btn primary" href={`/admin/orders/new?customer=${c.id}`}><Icon name="plus" size={15} /> Nouvelle commande</Link>
        </div>
      </div>

      <div className="crm-kpis">
        <div className="crm-kpi ok"><div className="n">{dzd(revenue)}</div><div className="l">Chiffre d’affaires (commandes confirmées)</div></div>
        <div className="crm-kpi"><div className="n">{active}</div><div className="l">Commande{active > 1 ? 's' : ''}{O.length - active ? ` · ${O.length - active} annulée(s)` : ''}</div></div>
        <div className="crm-kpi"><div className="n">{Q.length}</div><div className="l">Demande{Q.length > 1 ? 's' : ''} de devis{won ? ` · ${won} acceptée(s)` : ''}</div></div>
        <div className="crm-kpi"><div className="n">{M.length}</div><div className="l">Message{M.length > 1 ? 's' : ''}</div></div>
      </div>

      <div className="crm-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="crm-main">
          <section className="crm-card">
            <div className="hd"><h2>Contacter</h2></div>
            <div className="bd"><ContactLinks phone={c.phone} email={c.email} waText={`Bonjour ${c.name || ''}, World Business Plus.`} />
              {!c.phone && !c.email && <span className="adm-muted">Aucun téléphone ni e-mail sur cette fiche.</span>}
            </div>
          </section>
          <section className="crm-card">
            <div className="hd"><h2>Historique avec WBP</h2><span className="muted">{feed.length} élément{feed.length > 1 ? 's' : ''}</span></div>
            {feed.length === 0 ? <div className="adm-empty">Rien pour l’instant.</div> : (
              <div className="crm-feed">
                {feed.map((it, i) => (
                  <Link key={i} href={it.href}>
                    <span className="ic" style={{ background: it.color }}><Icon name={it.icon} size={17} /></span>
                    <span className="tx"><b>{it.title}</b><small>{it.sub}</small></span>
                    <span className="rt"><StatusBadge kind={it.kind} value={it.status} />{it.right && <b style={{ color: 'var(--ink)' }}>{it.right}</b>}<span>{fmtDateTime(it.at)}</span></span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="crm-main"><CustomerForm customer={c} /></div>
      </div>
    </>
  );
}
