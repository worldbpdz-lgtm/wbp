import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { adminRoster } from '@/lib/activity';
import { Icon } from '@/components/primitives';
import { StatusBadge, ContactLinks, MigrationBanner } from '@/components/admin/crm/ui';
import MessageSide from '@/components/admin/crm/MessageSide';
import { fmtDateTime } from '@/lib/dates';
import { personOf } from '@/lib/crm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Message' };

export default async function MessagePage({ params }) {
  if (!hasSupabase()) return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = createAdminClient();
  const { data: m } = await sb.from('contact_messages').select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (!m) return <div className="adm-panel"><div className="adm-empty">Ce message n’existe plus. <Link href="/admin/messages">Retour aux messages</Link></div></div>;
  const migrated = 'history' in m;
  const { data: customer } = m.customer_id ? await sb.from('customers').select('id,name,company').eq('id', m.customer_id).maybeSingle() : { data: null };
  const subject = m.subject ? `Re : ${m.subject}` : 'Votre message à World Business Plus';

  return (
    <>
      {!migrated && <MigrationBanner />}
      <Link href="/admin/messages" className="crm-back"><Icon name="chevleft" size={15} /> Messages</Link>
      <div className="crm-head">
        <div>
          <h1>{m.subject || 'Message sans sujet'} <StatusBadge kind="message" value={m.status} /></h1>
          <div className="meta"><span>Reçu le {fmtDateTime(m.created_at)}</span><span>De : {personOf(m)}</span></div>
        </div>
      </div>
      <div className="crm-grid">
        <div className="crm-main">
          <section className="crm-card">
            <div className="hd"><h2>Message</h2></div>
            <div className="bd"><p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14.5, lineHeight: 1.6 }}>{m.message || 'Aucun texte.'}</p></div>
          </section>
          <section className="crm-card">
            <div className="hd"><h2>Expéditeur</h2>{customer && <span className="muted">Fiche : <Link href={`/admin/customers/${customer.id}`}>{customer.company || customer.name || 'voir'}</Link></span>}</div>
            <div className="bd">
              <dl className="crm-kv">
                <dt>Nom</dt><dd>{m.name || '—'}</dd>
                <dt>Société</dt><dd>{m.company || '—'}</dd>
                <dt>Téléphone</dt><dd>{m.phone || '—'}</dd>
                <dt>E-mail</dt><dd>{m.email || '—'}</dd>
              </dl>
              <ContactLinks phone={m.phone} email={m.email} subject={subject} waText={`Bonjour ${m.name || ''}, World Business Plus suite à votre message.`} />
            </div>
          </section>
        </div>
        <MessageSide message={m} team={adminRoster()} migrated={migrated} />
      </div>
    </>
  );
}
