'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logSignOutAction } from '@/app/admin/actions';
import Splash, { SPLASH_MS } from '@/components/mobile/Splash';
import Login from '@/components/mobile/Login';
import { Icon } from '@/components/mobile/ui';
import { clearCache, readCache, writeCache } from '@/components/mobile/store';

// ============================================================================
// Coquille de l'application mobile : elle vit dans la mise en page de /mobile,
// donc elle est montée UNE FOIS par lancement. C'est ce qui fait que l'écran
// d'ouverture ne rejoue pas quand on passe de « Stats » à « Activité ».
//
// Elle porte cinq choses :
//   1. l'animation de démarrage, avec le prénom du compte de ce téléphone ;
//   2. l'enregistrement du service worker (mode hors connexion) ;
//   3. la barrière d'authentification — sans session, on affiche l'écran de
//      connexion à la place du contenu, quel que soit l'onglet demandé ;
//   4. le rôle du compte (propriétaire ou administrateur normal) ;
//   5. la barre d'onglets du bas, qui en découle.
//
// La session est lue avec getSession() et non getUser() : getSession lit le
// jeton déjà stocké, sans appel réseau. C'est indispensable pour qu'un
// téléphone hors connexion ouvre quand même l'application.
// ============================================================================

// role : 'owner' (propriétaire) · 'admin' (administrateur normal) · 'unknown'
// (pas encore établi — premier lancement sans réseau). Les écrans réservés
// attendent 'owner' explicitement : 'unknown' n'ouvre aucune porte.
const Ctx = createContext({ me: null, owner: false, role: 'unknown', signOut: () => {} });
export const useMobile = () => useContext(Ctx);

// « Stats » est l'application de tout le monde. « Activité » — qui a fait quoi
// dans le back-office — n'apparaît que pour le propriétaire du site ; pour les
// autres comptes, l'onglet n'existe pas et la route répond 403.
const TAB_STATS = ['/mobile', 'Stats', 'chart'];
const TAB_ACTIVITY = ['/mobile/activity', 'Activité', 'clock'];

export default function MobileApp({ children }) {
  const pathname = usePathname();
  const [splash, setSplash] = useState(true);
  const [session, setSession] = useState(undefined); // undefined = vérification en cours
  const [profile, setProfile] = useState(null);      // { email, name, owner }

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

  // --- rôle du compte -------------------------------------------------------
  // Le dernier rôle connu est relu dans le stockage local AVANT l'appel réseau,
  // pour que le propriétaire retrouve ses deux onglets même sans connexion. Le
  // serveur reste seul juge : la réponse écrase la mémoire du téléphone, et si
  // le rôle est inconnu on retombe sur « administrateur normal » (un onglet en
  // moins ne casse rien ; un onglet de trop montrerait le journal à tort).
  useEffect(() => {
    const cached = readCache('me');
    if (cached?.data?.email) setProfile(cached.data);
  }, []);

  useEffect(() => {
    // session === undefined : vérification en cours, on ne touche à rien — sinon
    // on effacerait le rôle relu juste avant, celui qui fait tenir le mode hors
    // connexion. session === null : personne n'est connecté, le rôle n'a plus
    // d'objet.
    if (session === undefined) return;
    if (session === null) { setProfile(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/mobile/me', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) return;                 // hors connexion : on garde la mémoire
        const json = await res.json();
        if (!json?.email) return;
        writeCache('me', json);
        if (alive) setProfile(json);
      } catch { /* réseau absent : le rôle en mémoire suffit */ }
    })();
    return () => { alive = false; };
  }, [session]);

  const signOut = useCallback(async () => {
    clearCache();
    setProfile(null);
    // Journalise « Déconnexion » puis ferme la session côté serveur. Variante
    // sans redirection : on reste dans l'app, qui repasse à son propre écran
    // de connexion.
    try { await logSignOutAction(); } catch { /* journal indisponible */ }
    try { await createClient().auth.signOut(); } catch { /* déjà déconnecté */ }
    setSession(null);
  }, []);

  // Le rôle en mémoire n'est retenu que s'il concerne bien le compte connecté :
  // deux personnes peuvent se succéder sur le même téléphone.
  const sessionEmail = session?.user?.email ? session.user.email.toLowerCase() : null;
  const known = profile?.email && sessionEmail && profile.email.toLowerCase() === sessionEmail
    ? profile
    : null;
  const role = known ? (known.owner === true ? 'owner' : 'admin') : 'unknown';
  const owner = role === 'owner';

  const me = session?.user
    ? {
      email: session.user.email,
      name: known?.name || session.user.user_metadata?.full_name || null,
      owner,
    }
    : null;

  const tabs = owner ? [TAB_STATS, TAB_ACTIVITY] : [TAB_STATS];
  const solo = tabs.length < 2;

  return (
    <Ctx.Provider value={{ me, owner, role, signOut }}>
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
          <div className={`mb${solo ? ' solo' : ''}`}>{children}</div>
          {!solo && (
            <nav className="mb-tabs" aria-label="Navigation principale">
              {tabs.map(([href, label, icon]) => (
                <Link key={href} href={href} className={`mb-tab ${pathname === href ? 'on' : ''}`}>
                  <Icon name={icon} size={21} />
                  {label}
                </Link>
              ))}
            </nav>
          )}
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
