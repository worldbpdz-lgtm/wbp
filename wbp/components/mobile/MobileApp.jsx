'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logSignOutAction } from '@/app/admin/actions';
import Splash, { SPLASH_MS } from '@/components/mobile/Splash';
import Login from '@/components/mobile/Login';
import { Icon } from '@/components/mobile/ui';
import { ToastHost, Confirm } from '@/components/mobile/form';
import { clearCache, readCache, writeCache } from '@/components/mobile/store';
import { useNotificationFeed, setAppBadge, forgetThisDevice } from '@/components/push-client';
import '@/styles/mobile-orders.css';

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

// Deux DROITS indépendants, et non un rôle unique :
//   owner   voit le journal d'activité ;
//   editor  voit les écrans d'édition.
// `ready` dit si le serveur a répondu. Tant qu'il vaut false, les deux droits
// sont faux : un onglet en moins ne casse rien, un onglet de trop montrerait à
// quelqu'un un écran qui n'est pas le sien.
//
// Les garder séparés n'est pas de la gymnastique : donner en plus l'édition au
// propriétaire (ou retirer le journal) se fait alors dans `lib/admin.js` seul,
// sans toucher cette coquille.
const Ctx = createContext({ me: null, owner: false, editor: false, ready: false, signOut: () => {}, counts: null, unread: 0, reloadFeed: () => {} });
export const useMobile = () => useContext(Ctx);

// ----------------------------------------------------------------------------
// Deux applications, une seule adresse.
//
//   PROPRIÉTAIRE  Stats · Demandes · Activité
//                 Il supervise : les chiffres, les commandes et demandes qui
//                 arrivent (en lecture seule — il peut appeler le client), et
//                 qui a fait quoi. Il modifie depuis /admin, sur ordinateur.
//
//   ÉQUIPE        Stats · Produits · Demandes · Plus
//                 Elle travaille : commandes, devis et messages, fiches et
//                 photos, avis, vitrine, marques, catégories, réglages.
//
// La cloche de l'en-tête (tous les comptes) mène aux notifications et à leurs
// réglages pour ce téléphone.
//
// Quatre onglets est la limite : au-delà, les libellés se tronquent sur un
// iPhone SE. Le reste vit derrière « Plus », qui est un écran, pas un menu
// flottant — plus facile à viser au pouce.
//
// La barre est COMPOSÉE à partir des droits, pas choisie dans une table de
// rôles : si demain le propriétaire doit aussi pouvoir modifier, la seule chose
// à changer est `isPhoneEditor()` dans lib/admin.js, et les onglets suivent.
// ----------------------------------------------------------------------------
const TAB_STATS = ['/mobile', 'Stats', 'chart'];
const TAB_ACTIVITY = ['/mobile/activity', 'Activité', 'clock'];
const TAB_PRODUCTS = ['/mobile/products', 'Produits', 'box'];
const TAB_INBOX = ['/mobile/inbox', 'Demandes', 'inbox'];
const TAB_MORE = ['/mobile/plus', 'Plus', 'dots'];

// Le propriétaire voit aussi les demandes et les commandes — en lecture seule
// (appeler, écrire sur WhatsApp) : c'est là que mènent ses notifications.
function tabsFor({ owner, editor }) {
  const tabs = [TAB_STATS];
  if (editor) tabs.push(TAB_PRODUCTS);
  if (editor || owner) tabs.push(TAB_INBOX);
  if (owner) tabs.push(TAB_ACTIVITY);
  if (editor) tabs.push(TAB_MORE);
  return tabs;
}

export default function MobileApp({ children }) {
  const pathname = usePathname();
  const router = useRouter();
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
    // Cet appareil cesse d'abord de recevoir les notifications du compte.
    await forgetThisDevice('/mobile');
    setAppBadge(0);
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
  const ready = !!known;
  const owner = ready && known.owner === true;
  const editor = ready && known.editor === true;

  const me = session?.user
    ? {
      email: session.user.email,
      name: known?.name || session.user.user_metadata?.full_name || null,
      owner,
      editor,
    }
    : null;

  const tabs = tabsFor({ owner, editor });
  const solo = tabs.length < 2;

  // Fil des notifications et compteurs « à traiter » : pastille de l'onglet
  // Demandes, point rouge de la cloche, badge de l'icône de l'app.
  const { data: feed, reload: reloadFeed } = useNotificationFeed({ every: 60000, enabled: !!session && ready });
  const counts = feed?.counts || null;
  const unread = feed?.unread || 0;
  useEffect(() => { if (counts) setAppBadge(counts.total || 0); }, [counts]);

  // Toucher une notification alors que l'app est déjà ouverte : le service
  // worker demande d'ouvrir l'écran concerné.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => {
      if (e?.data?.type !== 'wbp-open' || !e.data.url) return;
      try {
        const u = new URL(e.data.url, window.location.origin);
        if (u.origin === window.location.origin) router.push(u.pathname + u.search);
      } catch { /* adresse illisible */ }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [router]);

  // Un onglet actif inclut ses sous-pages : /mobile/products/xyz doit garder
  // « Produits » allumé, sinon la barre paraît éteinte dès qu'on ouvre une fiche.
  const isOn = (href) => (href === '/mobile'
    ? pathname === '/mobile'
    : pathname === href || pathname.startsWith(`${href}/`));

  // Documents imprimables (/mobile/print/…) : pleine page, sans onglets ni
  // écran d'ouverture — la page serveur contrôle elle-même la session.
  if (pathname?.startsWith('/mobile/print/')) return children;

  return (
    <Ctx.Provider value={{ me, owner, editor, ready, signOut, counts, unread, reloadFeed }}>
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
        <ToastHost>
          <div className={`mb${solo ? ' solo' : ''}`}>{children}</div>
          {!solo && (
            <nav className="mb-tabs" aria-label="Navigation principale">
              {tabs.map(([href, label, icon]) => {
                const badge = href === '/mobile/inbox' ? (counts?.total || 0) : 0;
                return (
                  <Link key={href} href={href} className={`mb-tab ${isOn(href) ? 'on' : ''}`}>
                    <span className="mb-tab-ic">
                      <Icon name={icon} size={21} />
                      {badge > 0 && <i className="mb-tab-badge" aria-label={`${badge} à traiter`}>{badge > 99 ? '99+' : badge}</i>}
                    </span>
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </ToastHost>
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
  const { signOut, unread } = useMobile();
  // Une déconnexion par erreur (le bouton est à côté de « rafraîchir ») coupe
  // aussi les notifications de l'appareil : on demande confirmation.
  const [askOut, setAskOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  return (
    <>
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
      <Link href="/mobile/notifications" className="mb-icbtn mb-bell" aria-label={unread ? `Notifications (${unread} non lues)` : 'Notifications'}>
        <Icon name="bell" size={18} />
        {unread > 0 && <i>{unread > 9 ? '9+' : unread}</i>}
      </Link>
      <button className="mb-icbtn" onClick={() => setAskOut(true)} aria-label="Se déconnecter">
        <Icon name="logout" size={18} />
      </button>
    </header>
    <Confirm
      open={askOut}
      onClose={() => setAskOut(false)}
      busy={leaving}
      title="Se déconnecter ?"
      body="Ce téléphone ne recevra plus les notifications de votre compte jusqu’à votre prochaine connexion."
      confirmLabel="Se déconnecter"
      danger
      onConfirm={async () => { setLeaving(true); try { await signOut(); } finally { setLeaving(false); setAskOut(false); } }}
    />
    </>
  );
}
