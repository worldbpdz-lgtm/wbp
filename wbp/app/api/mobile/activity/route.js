import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getActivity, displayName } from '@/lib/activity';

// ============================================================================
// Données de l'onglet « Activité » de l'application mobile.
// « Qui · quoi · quel jour · à quelle heure » pour chaque compte.
//
// ?days=30    fenêtre (1 à 365)
// ?actor=...  filtre sur un compte (adresse e-mail)
// ============================================================================

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(sp.get('days')) || 30, 1), 365);
  const actor = sp.get('actor') || null;

  const data = await getActivity({ days, actor, limit: 400 });

  return NextResponse.json({
    me: { email: user.email, name: displayName(user) },
    generatedAt: new Date().toISOString(),
    ...data,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
