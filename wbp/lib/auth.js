import { createClient, hasSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { logActivity } from '@/lib/activity';

export async function getSessionUser() {
  if (!hasSupabase()) return null;
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    return user || null;
  } catch { return null; }
}

// ----------------------------------------------------------------------------
// Barrière d'accès de TOUTES les server actions du back-office.
//
// `action` (facultatif) est la clé du journal d'activité : chaque appel écrit
// une ligne « qui · quoi · quand » dans admin_activity, lue par l'application
// mobile. On journalise APRÈS avoir validé l'identité — un appel refusé ne
// laisse pas de trace d'action, seulement une erreur.
//
// L'écriture est attendue (`await`) exprès : sur Vercel, la fonction serverless
// peut être gelée dès la réponse renvoyée, et une promesse laissée en suspens
// n'aurait aucune garantie d'aboutir. Le coût est une insertion, ~15 ms.
// ----------------------------------------------------------------------------
export async function requireAdmin(action, target) {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorized');
  if (action) await logActivity(user, action, target);
  return user;
}
