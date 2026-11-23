import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { todoCounts, isNotMigrated, orLit } from '@/lib/crm-server';
import { requireApiAdmin, json } from '@/lib/api-guard';

// ============================================================================
// GET /api/notifications — fil de la cloche + compteurs « à traiter ».
//   ?limit=50     nombre de notifications (max 100)
//   ?since=<id>   seulement les plus récentes que <id> (alertes en direct)
//   ?counts=1     seulement les compteurs (rafraîchissement léger)
// Lu par le back-office web (toutes les 30 s, onglet visible) et par l'app
// mobile (à l'ouverture et au retour au premier plan).
// ============================================================================

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireApiAdmin(request);
  if (g.res) return g.res;
  if (!hasSupabase()) return json({ items: [], unread: 0, counts: null, ready: false });
  const sb = createAdminClient();
  const sp = request.nextUrl.searchParams;
  const email = String(g.user.email).toLowerCase();

  const counts = await todoCounts(sb).catch(() => null);
  if (sp.get('counts') === '1') return json({ counts });

  const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 100);
  const since = Number(sp.get('since')) || 0;

  const [readRes, listRes] = await Promise.all([
    sb.from('notification_reads').select('last_read_at').eq('site', SITE).eq('user_email', email).maybeSingle(),
    (() => {
      let q = sb.from('notifications')
        .select('id,kind,ref_type,ref_id,title,body,url,admin_url,actor_email,created_at')
        .eq('site', SITE).order('id', { ascending: false }).limit(limit);
      if (since) q = q.gt('id', since);
      return q;
    })(),
  ]);
  if (listRes.error) {
    if (isNotMigrated(listRes.error)) return json({ items: [], unread: 0, counts, ready: false });
    return json({ error: 'read_failed' }, 500);
  }
  const lastRead = readRes.data?.last_read_at ? new Date(readRes.data.last_read_at).getTime() : 0;
  // Ses propres actions ne sont jamais « non lues ».
  const items = (listRes.data || []).map((n) => ({
    ...n,
    unread: new Date(n.created_at).getTime() > lastRead && String(n.actor_email || '').toLowerCase() !== email,
  }));

  let unread = items.filter((n) => n.unread).length;
  if (since || items.length === limit) {
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true })
      .eq('site', SITE).gt('created_at', new Date(lastRead || 0).toISOString())
      .or(`actor_email.is.null,actor_email.neq.${orLit(email)}`);
    if (typeof count === 'number') unread = count;
  }
  return json({ items, unread, counts, ready: true, lastReadAt: readRes.data?.last_read_at || null });
}
