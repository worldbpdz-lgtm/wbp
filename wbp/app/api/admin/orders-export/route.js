import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { requireApiAdmin } from '@/lib/api-guard';
import { selectAll } from '@/lib/queries';
import { SITE } from '@/lib/site';
import { toCsv, csvHeaders } from '@/lib/csv';
import { orderStatus, deliveryLabel, sourceLabel, OPEN_ORDER_STATUSES } from '@/lib/crm';
import { paymentStatus } from '@/lib/pricing';
import { fmtDateTime } from '@/lib/dates';
import { normPhone } from '@/lib/phone';
import { orLit } from '@/lib/crm-server';

// GET /api/admin/orders-export?status=&q=&days= — mêmes filtres que la liste.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireApiAdmin(request);
  if (g.res) return g.res;
  const day = new Date().toISOString().slice(0, 10);
  const head = ['N°', 'Date', 'Statut', 'Origine', 'Client', 'Société', 'Téléphone', 'E-mail', 'Wilaya', 'Ville', 'Adresse', 'Livraison', 'Articles', 'Sous-total', 'Total', 'Encaissé', 'Paiement', 'Mode de paiement', 'Pris en charge', 'Motif d’annulation'];
  if (!hasSupabase()) return new Response(toCsv(head, []), { headers: csvHeaders(`commandes-${day}.csv`) });
  const sp = request.nextUrl.searchParams;
  const status = sp.get('status') || '';
  const q = String(sp.get('q') || '').trim().slice(0, 80);
  const days = Number(sp.get('days')) || 0;
  const sb = createAdminClient();
  const { data, error } = await selectAll(() => {
    let query = sb.from('orders').select('*').eq('site', SITE);
    if (status === 'open') query = query.in('status', OPEN_ORDER_STATUSES);
    else if (status) query = query.eq('status', status);
    if (days) query = query.gte('created_at', new Date(Date.now() - days * 86400000).toISOString());
    if (q) {
      const like = orLit(`%${q}%`);
      const ors = [`number.ilike.${like}`, `customer_name.ilike.${like}`, `company.ilike.${like}`, `email.ilike.${like}`, `wilaya.ilike.${like}`];
      const pn = normPhone(q);
      if (pn) ors.push(`phone_norm.eq.${pn}`);
      query = query.or(ors.join(','));
    }
    return query.order('created_at', { ascending: false }).order('id');
  }, { max: 100000 });
  if (error) return new Response('Export impossible — réessayez.', { status: 500 });
  const rows = (data || []).map((o) => [
    o.number, fmtDateTime(o.created_at), orderStatus(o.status).label, sourceLabel(o.source),
    o.customer_name, o.company, o.phone, o.email, o.wilaya, o.city, o.address, deliveryLabel(o.delivery_method),
    (o.items || []).map((l) => `${l.qty}× ${l.name}${l.code ? ` (${l.code})` : ''}`).join(' | '),
    o.subtotal, o.total, o.paid_amount, paymentStatus(o.total, o.paid_amount).label, o.payment_method, o.assigned_to, o.cancel_reason,
  ]);
  return new Response(toCsv(head, rows), { headers: csvHeaders(`commandes-${day}.csv`) });
}
