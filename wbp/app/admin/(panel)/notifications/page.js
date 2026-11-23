import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { isNotMigrated } from '@/lib/crm-server';
import { MigrationBanner } from '@/components/admin/crm/ui';
import NotificationsCenter from '@/components/admin/crm/NotificationsCenter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Notifications' };

export default async function NotificationsPage() {
  if (!hasSupabase()) return null;
  const user = await getSessionUser();
  const email = String(user?.email || '').toLowerCase();
  const sb = createAdminClient();
  const [list, read] = await Promise.all([
    sb.from('notifications').select('id,kind,title,body,admin_url,actor_email,created_at').eq('site', SITE).order('id', { ascending: false }).limit(150),
    sb.from('notification_reads').select('last_read_at').eq('site', SITE).eq('user_email', email).maybeSingle(),
  ]);
  const ready = !(list.error && isNotMigrated(list.error));
  const lastRead = read.data?.last_read_at ? new Date(read.data.last_read_at).getTime() : 0;
  const items = (list.data || []).map((n) => ({
    ...n,
    unread: new Date(n.created_at).getTime() > lastRead && String(n.actor_email || '').toLowerCase() !== email,
  }));
  const unread = items.filter((n) => n.unread).length;
  return (
    <>
      <h1 className="adm-h1">Notifications</h1>
      <p className="adm-sub">Chaque commande, demande de devis et message arrive ici, sur les téléphones de l’équipe et en alerte dans le back-office.</p>
      <div style={{ height: 16 }} />
      {!ready && <MigrationBanner />}
      <NotificationsCenter items={items} unread={unread} ready={ready} />
    </>
  );
}
