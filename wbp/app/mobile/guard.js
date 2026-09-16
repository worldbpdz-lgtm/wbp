import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail, isOwnerEmail, isPhoneEditor } from '@/lib/admin';

// ============================================================================
// Barrière d'accès des écrans d'ÉDITION de l'application mobile.
// ----------------------------------------------------------------------------
// À appeler en PREMIÈRE ligne de chaque page serveur sous /mobile qui modifie
// quelque chose. Elle est la seule garantie réelle : la barre d'onglets du
// téléphone ne fait que cacher les liens, et une adresse tapée à la main, un
// raccourci enregistré ou un retour en arrière dans l'historique la
// contournent en une seconde.
//
// Rien n'est renvoyé au visiteur qui n'a pas le droit d'être là : on le
// redirige vers /mobile, qui affichera soit ses statistiques, soit l'écran de
// connexion. Pas de message d'erreur — il n'y a rien à lui expliquer.
//
// Les server actions appelées ensuite refont LEUR propre contrôle
// (`requireAdmin`), et c'est voulu : cette fonction protège l'affichage des
// pages, pas les écritures. Une page peut être obsolète dans un onglet resté
// ouvert ; une écriture, jamais.
// ============================================================================

export async function requireMobileEditor() {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) redirect('/mobile');
  // Le propriétaire supervise depuis le téléphone et modifie depuis /admin.
  if (!isPhoneEditor(user.email)) redirect('/mobile');
  return user;
}

// Pour les écrans que TOUT compte administrateur peut voir (statistiques).
export async function requireMobileAdmin() {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) redirect('/mobile');
  return user;
}

// Réservé au propriétaire (journal d'activité).
export async function requireMobileOwner() {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) redirect('/mobile');
  if (!isOwnerEmail(user.email)) redirect('/mobile');
  return user;
}
