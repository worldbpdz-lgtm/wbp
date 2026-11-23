import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { requireApiAdmin } from '@/lib/api-guard';
import { selectAll } from '@/lib/queries';
import { SITE } from '@/lib/site';
import { toCsv, csvHeaders } from '@/lib/csv';
import { kindLabel } from '@/lib/crm';
import { fmtDateTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireApiAdmin(request);
  if (g.res) return g.res;
  const day = new Date().toISOString().slice(0, 10);
  const head = ['Société', 'Interlocuteur', 'Type', 'Téléphone', 'Second téléphone', 'E-mail', 'Wilaya', 'Ville', 'Adresse', 'NIF', 'NIS', 'RC', 'AI', 'Notes', 'Créée le', 'Dernière activité'];
  if (!hasSupabase()) return new Response(toCsv(head, []), { headers: csvHeaders(`clients-${day}.csv`) });
  const sb = createAdminClient();
  const { data, error } = await selectAll(() => sb.from('customers').select('*').eq('site', SITE)
    .order('last_activity_at', { ascending: false }).order('id'), { max: 200000 });
  if (error) return new Response('Export impossible — réessayez.', { status: 500 });
  const rows = (data || []).map((c) => [
    c.company, c.name, kindLabel(c.kind), c.phone, c.phone2, c.email, c.wilaya, c.city, c.address,
    c.nif, c.nis, c.rc, c.art, c.notes, fmtDateTime(c.created_at), fmtDateTime(c.last_activity_at),
  ]);
  return new Response(toCsv(head, rows), { headers: csvHeaders(`clients-${day}.csv`) });
}
