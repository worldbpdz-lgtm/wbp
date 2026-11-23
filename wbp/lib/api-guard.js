import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

// ============================================================================
// Garde commune des routes /api réservées à l'équipe.
// ----------------------------------------------------------------------------
//  • session Supabase valide ET adresse présente dans ADMIN_EMAILS ;
//  • pour les écritures (POST, PATCH, DELETE), l'en-tête Origin doit être celui
//    du site : une page tierce ne peut pas faire agir le navigateur d'un
//    administrateur connecté à sa place (CSRF). Les cookies de session sont
//    déjà SameSite=Lax, ceci en est la seconde barrière.
// ============================================================================
const NO_STORE = { 'Cache-Control': 'no-store' };

export const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function requireApiAdmin(request, { write = false } = {}) {
  if (write) {
    const origin = request.headers.get('origin');
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === request.nextUrl.host; } catch { same = false; }
      if (!same) return { res: json({ error: 'forbidden_origin' }, 403) };
    }
  }
  const user = await getSessionUser();
  if (!user) return { res: json({ error: 'unauthenticated' }, 401) };
  if (!isAdminEmail(user.email)) return { res: json({ error: 'forbidden' }, 403) };
  return { user };
}

export async function readJson(request, max = 20000) {
  try {
    const text = await request.text();
    if (text.length > max) return null;
    return JSON.parse(text || '{}');
  } catch { return null; }
}
