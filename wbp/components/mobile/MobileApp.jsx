'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logSignOutAction } from '@/app/admin/actions';
import Splash, { SPLASH_MS } from '@/components/mobile/Splash';
import Login from '@/components/mobile/Login';
import { Icon } from '@/components/mobile/ui';
import { clearCache } from '@/components/mobile/store';

// ============================================================================
// Coquille de l'application mobile : elle vit dans la mise en page de /mobile,
// donc elle est montée UNE FOIS par lancement. C'est ce qui fait que l'écran
// d'ouverture ne rejoue pas quand on passe de « Stats » à « Activité ».
//
// Elle porte quatre choses :
//   1. l'animation de démarrage ;
//   2. l'enregistrement du service worker (mode hors connexion) ;
//   3. la barrière d'authentification — sans session, on affiche l'écran de
//      connexion à la place du contenu, quel que soit l'onglet demandé ;
//   4. la barre d'onglets du bas.
//
// La session est lue avec getSession() et non getUser() : getSession lit le
// jeton déjà stocké, sans appel réseau. C'est indispensable pour qu'un
// téléphone hors connexion ouvre quand même l'application.
// ============================================================================

const Ctx = createContext({ me: null, signOut: () => {} });
export const useMobile = () => useContext(Ctx);

const TABS = [
  ['/mobile', 'Stats', 'chart'],
  ['/mobile/activity', 'Activité', 'clock'],
];

export default function MobileApp({ children }) {
  const pathname = usePathname();
  const [splash, setSplash] = useState(true);
  const [session, setSession] = useState(undefined); // undefined = vérification en cours

  // --- écran d'ouverture ----------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // --- service worker (coquille hors connexion) -----------------------------
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Portée limitée à /mobile : le site public garde son comportement normal.
    navigator.serviceWorker.register('/sw.js', { scope: '/mobile' }).catch(() => {});
  }, []);

  // --- session --------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSession(data?.session ?? null); })
      .catch(() => { if (alive) setSession(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setSession(s ?? null); });
    return () => { alive = false; sub?.subscription?.unsubscribe(); };
  }, []);

  const signOut = useCallback(async () => {
    clearCache();
    // Journalise « Déconnexion » puis ferme la session côté serveur. Variante
    // sans redirection : on reste dans l'app, qui repasse à son propre écran
    // de connexion.
    try { await logSignOutAction(); } catch { /* journal indisponible */ }
    try { await createClient().auth.signOut(); } catch { /* déjà déconnecté */ }
    setSession(null);
  }, []);

  const me = session?.user
    ? { email: session.user.email, name: session.user.user_metadata?.full_name || null }
    : null;

  return (
    <Ctx.Provider value={{ me, signOut }}>
      {splash && <Splash />}
      {session === undefined ? (
        <div className="mb-login"><div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-icon-192.png" alt="" width={78} height={78} />
          <p>Ouverture…</p>
        </div></div>
      ) : !session ? (
        <Login onSignedIn={setSession} />
      ) : (
        <>
          <div className="mb">{children}</div>
          <nav className="mb-tabs" aria-label="Navigation principale">
            {TABS.map(([href, label, icon]) => (
              <Link key={href} href={href} className={`mb-tab ${pathname === href ? 'on' : ''}`}>
                <Icon name={icon} size={21} />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </Ctx.Provider>
  );
}

// ----------------------------------------------------------------------------
// En-tête commun aux écrans : logo, titre, bouton de rafraîchissement,
// déconnexion. Le bouton appelle le rafraîchissement de l'écran courant, que
// chaque page lui passe.
// ----------------------------------------------------------------------------
export function TopBar({ title, subtitle, onRefresh, busy }) {
  const { signOut } = useMobile();
  return (
    <header className="mb-top">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/app-icon-192.png" alt="" width={34} height={34} />
      <div className="grow">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {onRefresh && (
        <button className={`mb-icbtn ${busy ? 'spin' : ''}`} onClick={onRefresh} aria-label="Rafraîchir">
          <Icon name="refresh" size={18} />
        </button>
      )}
      <button className="mb-icbtn" onClick={signOut} aria-label="Se déconnecter">
        <Icon name="logout" size={18} />
      </button>
    </header>
  );
}
