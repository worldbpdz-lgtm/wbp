import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { requireMobileAdmin } from '@/app/mobile/guard';
import { isPhoneEditor } from '@/lib/admin';
import { adminRoster } from '@/lib/activity';
import { isNotMigrated } from '@/lib/crm-server';
import { REVENUE_STATUSES } from '@/lib/crm';
import OrderScreen from '@/components/mobile/OrderScreen';

// ============================================================================
// Fiche commande, version téléphone : appeler le client, fixer les prix,
// confirmer, suivre la livraison et le paiement.
// ----------------------------------------------------------------------------
// C'est l'écran qu'ouvre la notification « Nouvelle commande ». Il passe par
// les mêmes server actions que le back-office web (crm-actions.js) : mêmes
// contrôles avant confirmation, même historique, mêmes notifications.
//
// Le propriétaire le voit en lecture seule (isPhoneEditor) ; les comptes de
// l'équipe peuvent tout faire.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commande — WBP' };

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

export default async function MobileOrderPage({ params, searchParams }) {
  const user = await requireMobileAdmin();
  if (!hasSupabase()) return null;
  const { id } = await params;
  const sp = (await searchParams) || {};
  const canEdit = isPhoneEditor(user.email);
  const me = String(user.email).toLowerCase();

  if (!isUuid(id)) return <OrderScreen missing canEdit={canEdit} me={me} />;

  const sb = createAdminClient();
  const { data: order, error } = await sb.from('orders').select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (error) {
    return <OrderScreen missing migrate={isNotMigrated(error)} canEdit={canEdit} me={me} />;
  }
  if (!order) return <OrderScreen missing canEdit={canEdit} me={me} />;

  // Ce qu'on sait déjà du client : utile au moment de l'appeler (« il nous a
  // déjà commandé trois fois », « il a un devis en attente »).
  let customer = null;
  if (order.customer_id) {
    const [c, os, qs] = await Promise.all([
      sb.from('customers').select('id,name,company,kind,wilaya,notes,created_at').eq('site', SITE).eq('id', order.customer_id).maybeSingle(),
      sb.from('orders').select('id,number,status,total,created_at').eq('site', SITE).eq('customer_id', order.customer_id)
        .neq('id', order.id).order('created_at', { ascending: false }).limit(50),
      sb.from('quote_requests').select('id,number,status,created_at').eq('site', SITE).eq('customer_id', order.customer_id)
        .order('created_at', { ascending: false }).limit(20),
    ]);
    if (c.data) {
      const others = os.data || [];
      const won = others.filter((o) => REVENUE_STATUSES.includes(o.status));
      customer = {
        ...c.data,
        orders: others.length,
        revenue: won.reduce((a, o) => a + (Number(o.total) || 0), 0),
        quotes: (qs.data || []).length,
        recent: [
          ...others.slice(0, 6).map((o) => ({ kind: 'order', id: o.id, number: o.number, status: o.status, total: o.total, at: o.created_at })),
          ...(qs.data || []).slice(0, 4).map((q) => ({ kind: 'quote', id: q.id, number: q.number, status: q.status, at: q.created_at })),
        ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6),
      };
    }
  }

  let quote = null;
  if (order.quote_id) {
    const { data } = await sb.from('quote_requests').select('id,number').eq('site', SITE).eq('id', order.quote_id).maybeSingle();
    quote = data || null;
  }

  return (
    <OrderScreen
      order={order}
      customer={customer}
      quote={quote}
      team={adminRoster()}
      me={me}
      canEdit={canEdit}
      created={sp.created === '1'}
    />
  );
}
