import { redirect } from 'next/navigation';
// admin.css → admin-2026.css (éditeurs) → admin-crm.css (commandes, clients)
// → admin-modern.css (système de design 2026), dans cet ordre garanti.
import '../../../styles/admin-bundle.css';
import { cookies } from 'next/headers';
import { hasSupabase, createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import AdminShell from '@/components/admin/AdminShell';
import { signOutAction } from '@/app/admin/actions';
import { displayName } from '@/lib/activity';
import { SITE } from '@/lib/site';
import { todoCounts, orLit } from '@/lib/crm-server';
import AdminLive from '@/components/admin/crm/AdminLive';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }) {
  if (!hasSupabase()) {
    return (
      <div className="adm-login"><div className="adm-login-card">
        <h1>Configuration requise</h1>
        <p>Les variables d’environnement Supabase ne sont pas définies. Renseignez <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> et <code>ADMIN_EMAILS</code>, puis redéployez.</p>
      </div></div>
    );
  }
  const user = await getSessionUser();
  if (!user) redirect('/admin/login');
  if (!isAdminEmail(user.email)) {
    return (
      <div className="adm-login"><div className="adm-login-card">
        <h1>Accès refusé</h1>
        <p>Le compte <b>{user.email}</b> n’est pas administrateur. Ajoutez cet e-mail à la variable <code>ADMIN_EMAILS</code>.</p>
        <form action={signOutAction}><button className="adm-btn" type="submit">Déconnexion</button></form>
      </div></div>
    );
  }
  const sb = createAdminClient();
  // Pastilles du menu : nouveaux devis, commandes à confirmer, messages, avis,
  // et notifications non lues de CE compte.
  const email = String(user.email).toLowerCase();
  const [todo, read] = await Promise.all([
    todoCounts(sb).catch(() => ({ quotes: 0, orders: 0, messages: 0, reviews: 0, total: 0 })),
    sb.from('notification_reads').select('last_read_at').eq('site', SITE).eq('user_email', email).maybeSingle(),
  ]);
  let unread = 0;
  {
    const since = read.data?.last_read_at || '1970-01-01T00:00:00Z';
    const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true })
      .eq('site', SITE).gt('created_at', since)
      .or(`actor_email.is.null,actor_email.neq.${orLit(email)}`);
    if (!error) unread = count || 0;
  }
  const counts = { ...todo, notifications: unread };
  const mini = (await cookies()).get('wbp_adm_side')?.value === 'mini';
  return (
    <AdminShell
      counts={counts}
      email={user.email}
      name={displayName(user)}
      mini={mini}
      overlay={<AdminLive initialCounts={todo} />}
    >
      {children}
    </AdminShell>
  );
}
