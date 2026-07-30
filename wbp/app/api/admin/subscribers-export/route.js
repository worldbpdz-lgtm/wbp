import { requireAdmin } from '@/lib/auth';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="${SITE}-subscribers.csv"`,
  'Cache-Control': 'no-store',
};
const HEAD = 'email,status,lang,source,created_at,confirmed_at\n';
const cell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  try { await requireAdmin(); } catch { return new Response('Unauthorized', { status: 401 }); }
  if (!hasSupabase()) return new Response(HEAD, { headers: HEADERS });
  const sb = createAdminClient();
  const { data } = await sb.from('newsletter_subscribers')
    .select('email,status,lang,source,created_at,confirmed_at')
    .eq('site', SITE)
    .order('created_at', { ascending: false });
  const rows = (data || []).map((r) => [r.email, r.status, r.lang, r.source, r.created_at, r.confirmed_at].map(cell).join(','));
  return new Response(HEAD + rows.join('\n') + '\n', { headers: HEADERS });
}
