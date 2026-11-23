import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { adminRoster } from '@/lib/activity';
import QuoteEditor from '@/components/admin/crm/QuoteEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Nouveau devis' };

// ?customer=<id> : pré-rempli depuis une fiche client ; ?message=<id> : depuis
// un message de contact (le client demandait des prix par le formulaire).
export default async function NewQuotePage({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = (await searchParams) || {};
  const sb = createAdminClient();
  const uuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
  let customer = null;
  let prefill = {};
  if (uuid(sp.message)) {
    const { data: m } = await sb.from('contact_messages').select('*').eq('site', SITE).eq('id', sp.message).maybeSingle();
    if (m) {
      prefill = { customer_id: m.customer_id || null, customer_name: m.name || '', company: m.company || '', phone: m.phone || '', email: m.email || '', message: [m.subject, m.message].filter(Boolean).join(' — ') };
      if (m.customer_id) customer = (await sb.from('customers').select('*').eq('id', m.customer_id).maybeSingle()).data || null;
    }
  } else if (uuid(sp.customer)) {
    const { data } = await sb.from('customers').select('*').eq('site', SITE).eq('id', sp.customer).maybeSingle();
    customer = data || null;
    if (customer) prefill = { customer_id: customer.id, customer_name: customer.name || '', company: customer.company || '', phone: customer.phone || '', email: customer.email || '' };
  }
  return <QuoteEditor quote={null} customer={customer} team={adminRoster()} prefill={prefill} />;
}
