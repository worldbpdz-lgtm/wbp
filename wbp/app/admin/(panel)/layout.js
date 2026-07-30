import { redirect } from 'next/navigation';
import '../admin.css';
// Chargée APRÈS admin.css : sélecteur d'images, cartes d'édition, vitrine, IA.
import '../../../styles/admin-2026.css';
import { hasSupabase, createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import AdminNav from '@/components/AdminNav';
import { signOutAction } from '@/app/admin/actions';
import { SITE } from '@/lib/site';

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
  const [q, m, r] = await Promise.all([
    sb.from('quote_requests').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('status', 'new'),
    sb.from('contact_messages').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('status', 'new'),
    sb.from('reviews').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('approved', false),
  ]);
  const counts = { quotes: q.count || 0, messages: m.count || 0, reviews: r.count || 0 };
  return (
    <div className="adm">
      <AdminNav counts={counts} email={user.email} />
      <main className="adm-main">{children}</main>
    </div>
  );
}
