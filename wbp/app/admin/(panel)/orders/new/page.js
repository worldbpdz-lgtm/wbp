import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { adminRoster } from '@/lib/activity';
import OrderEditor from '@/components/admin/crm/OrderEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Nouvelle commande' };

// ?customer=<id> : nouvelle commande pré-remplie depuis une fiche client.
export default async function NewOrderPage({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  let customer = null;
  if (sp.customer && /^[0-9a-f-]{36}$/i.test(sp.customer)) {
    const sb = createAdminClient();
    const { data } = await sb.from('customers').select('*').eq('site', SITE).eq('id', sp.customer).maybeSingle();
    customer = data || null;
  }
  const prefill = customer ? {
    customer_id: customer.id, customer_name: customer.name || '', company: customer.company || '',
    phone: customer.phone || '', email: customer.email || '', wilaya: customer.wilaya || '',
    city: customer.city || '', address: customer.address || '', source: 'phone',
  } : { source: 'phone' };
  return <OrderEditor order={null} customer={customer} team={adminRoster()} prefill={prefill} />;
}
