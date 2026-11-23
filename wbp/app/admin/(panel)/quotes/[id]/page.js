import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { adminRoster } from '@/lib/activity';
import { isNotMigrated } from '@/lib/crm-server';
import { MigrationBanner } from '@/components/admin/crm/ui';
import QuoteEditor from '@/components/admin/crm/QuoteEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Devis' };

export default async function QuotePage({ params }) {
  if (!hasSupabase()) return null;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = createAdminClient();
  const { data: quote } = await sb.from('quote_requests').select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (!quote) {
    return <div className="adm-panel"><div className="adm-empty">Cette demande n’existe plus. <Link href="/admin/quotes">Retour aux demandes</Link></div></div>;
  }
  // Base non migrée : la fiche s'affiche, mais l'enregistrement demandera la migration.
  const migrated = 'number' in quote || 'history' in quote;
  const items = Array.isArray(quote.items) ? quote.items : [];
  const ids = [...new Set(items.map((i) => i.product_id ?? i.id).filter(Boolean))];
  const [{ data: customer }, { data: orders, error: oErr }, { data: prods }] = await Promise.all([
    quote.customer_id ? sb.from('customers').select('*').eq('id', quote.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('orders').select('id,number').eq('site', SITE).eq('quote_id', id).limit(1),
    ids.length ? sb.from('products').select('id,price').in('id', ids) : Promise.resolve({ data: [] }),
  ]);
  const catalogPrices = Object.fromEntries((prods || []).filter((p) => p.price != null).map((p) => [p.id, Number(p.price)]));
  return (
    <>
      {(!migrated || (oErr && isNotMigrated(oErr))) && <MigrationBanner />}
      <QuoteEditor quote={quote} customer={customer || null} order={orders?.[0] || null} team={adminRoster()} catalogPrices={catalogPrices} />
    </>
  );
}
