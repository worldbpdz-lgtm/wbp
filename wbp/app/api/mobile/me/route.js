import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail, isOwnerEmail } from '@/lib/admin';
import { displayName } from '@/lib/activity';

// ============================================================================
// « Qui suis-je » — appelé une fois par lancement de l'application mobile.
// ----------------------------------------------------------------------------
// Renvoie le nom affiché du compte connecté et son rôle :
//
//   owner: true   le propriétaire du site (première adresse d'ADMIN_EMAILS) :
//                 l'application affiche en plus l'onglet « Activité » ;
//   owner: false  un administrateur normal : application à un seul écran.
//
// C'est le serveur qui tranche, jamais le téléphone : la réponse est rangée
// dans le stockage local pour que l'app s'ouvre correctement hors connexion,
// mais elle ne sert qu'à dessiner la barre d'onglets. La vraie barrière est
// dans /api/mobile/activity, qui refuse un compte non propriétaire même si
// quelqu'un forçait l'adresse /mobile/activity à la main.
//
// Aucune journalisation : ouvrir l'app n'est pas une action à tracer, et la
// connexion est déjà enregistrée par logSignInAction().
// ============================================================================

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  return NextResponse.json({
    email: user.email,
    name: displayName(user),
    owner: isOwnerEmail(user.email),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
