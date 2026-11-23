import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { adminRoster } from '@/lib/activity';
import { isNotMigrated } from '@/lib/crm-server';
import { MigrationBanner } from '@/components/admin/crm/ui';
import OrderEditor from '@/components/admin/crm/OrderEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Commande' };

export default async function OrderPage({ params, searchParams }) {
  if (!hasSupabase()) return null;
  const { id } = await params;
  const sp = (await searchParams) || {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = createAdminClient();
  const { data: order, error } = await sb.from('orders').select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (error && isNotMigrated(error)) return <MigrationBanner />;
  if (!order) {
    return (
      <div className="adm-panel"><div className="adm-empty">
        Cette commande n’existe plus (elle a peut-être été supprimée). <Link href="/admin/orders">Retour aux commandes</Link>
      </div></div>
    );
  }
  const [{ data: customer }, { data: quote }] = await Promise.all([
    order.customer_id ? sb.from('customers').select('*').eq('id', order.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    order.quote_id ? sb.from('quote_requests').select('id,number').eq('id', order.quote_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const notice = sp.created === 'pending'
    ? 'Commande créée « À confirmer » : des prix ou les coordonnées du client manquent encore. Complétez-les, puis confirmez.'
    : '';
  return <OrderEditor order={order} customer={customer || null} quote={quote || null} team={adminRoster()} notice={notice} />;
}
