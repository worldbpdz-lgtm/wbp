import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getDashboard, getAnalytics } from '@/lib/analytics';
import { displayName } from '@/lib/activity';

// ============================================================================
// Données de l'onglet « Stats » de l'application mobile.
// ----------------------------------------------------------------------------
// Renvoie exactement les mêmes chiffres que le tableau de bord web (mêmes
// fonctions, une seule source de vérité) dans un seul JSON, que le téléphone
// range ensuite dans son stockage local pour un affichage immédiat et hors
// connexion.
//
// Aucune journalisation ici : consulter des statistiques n'est pas une action
// à tracer, et ce point d'entrée est appelé à chaque ouverture de l'app.
// ============================================================================

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [dashboard, analytics] = await Promise.all([getDashboard(), getAnalytics()]);
  if (!dashboard) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  return NextResponse.json({
    me: { email: user.email, name: displayName(user) },
    generatedAt: new Date().toISOString(),
    kpis: dashboard.kpis,
    days14: dashboard.days14,
    visitsByDay: dashboard.visitsByDay,
    leadsByDay: dashboard.leadsByDay,
    topProd: dashboard.topProd,
    byCat: dashboard.byCat,
    devices: dashboard.devices,
    qStatus: dashboard.qStatus,
    reviewDist: dashboard.reviewDist,
    recent: dashboard.activity,
    month: analytics ? {
      days30: analytics.days30,
      visitsByDay: analytics.visitsByDay,
      totals: analytics.totals,
      topPages: analytics.topPages,
      topProd: analytics.topProd,
      referrers: analytics.referrers,
    } : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
