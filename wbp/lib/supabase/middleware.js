import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/admin';

// ============================================================================
// Filtre exécuté avant chaque page (Next 16 : fichier proxy.js à la racine).
// ----------------------------------------------------------------------------
// Deux corrections de sécurité par rapport à la version précédente :
//
//  1. Il ne vérifiait QUE l'existence d'une session Supabase, pas le fait
//     d'être administrateur. N'importe quel compte créé dans le projet
//     Supabase (y compris via une inscription publique) franchissait donc ce
//     filtre. Le contrôle e-mail est maintenant fait ici aussi, en plus du
//     layout — deux barrières valent mieux qu'une.
//
//  2. /admin n'était exclu ni de l'indexation ni du cache. On ajoute
//     X-Robots-Tag et Cache-Control : une page d'administration ne doit jamais
//     finir dans Google, ni rester dans le cache d'un poste partagé.
// ============================================================================

export async function updateSession(request) {
  const res = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isAdminArea = path.startsWith('/admin');

  if (isAdminArea) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('Cache-Control', 'no-store, max-age=0');
  }

  if (!url || !anon) return res; // Supabase pas encore configuré

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(list) { list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    },
  });

  // getUser() valide le jeton auprès de Supabase (contrairement à getSession(),
  // qui se contente de lire un cookie que le client contrôle).
  // Si Supabase est injoignable (projet en pause, réseau coupé), la promesse
  // est rejetée : sans ce garde-fou, l'exception remontait et TOUTE page
  // /admin renvoyait une erreur 500 au lieu de la page de connexion.
  const { data } = await supabase.auth.getUser().catch(() => ({ data: null }));
  const user = data?.user ?? null;

  if (isAdminArea && !path.startsWith('/admin/login')) {
    if (!user || !isAdminEmail(user.email)) {
      const u = request.nextUrl.clone();
      u.pathname = '/admin/login';
      u.searchParams.set('next', path);
      if (user) u.searchParams.set('denied', '1');
      // On repart d'une réponse neuve : il faut donc y recopier les cookies
      // d'authentification que Supabase vient éventuellement de renouveler
      // (sinon un jeton rafraîchi est perdu et l'utilisateur boucle sur la
      // page de connexion), ainsi que les en-têtes anti-indexation.
      const redirect = NextResponse.redirect(u);
      res.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      redirect.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      redirect.headers.set('Cache-Control', 'no-store, max-age=0');
      return redirect;
    }
  }
  return res;
}
