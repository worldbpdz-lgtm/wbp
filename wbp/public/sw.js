/* ============================================================================
   WBP — service worker de l'application mobile.
   ----------------------------------------------------------------------------
   Enregistré UNIQUEMENT avec la portée /mobile (voir components/mobile/
   MobileApp.jsx) : le site public, le back-office web et les e-mails ne sont
   jamais interceptés. Un bug ici ne peut donc pas casser wbp-dz.com.

   Ce qu'il fait :
     • il met en cache la coquille de l'app (HTML des deux écrans, icônes,
       fichiers statiques de Next) pour que l'app s'ouvre sans réseau ;
     • il ne met JAMAIS en cache /api/* ni Supabase : les chiffres viennent du
       stockage local géré par l'app, jamais d'une réponse HTTP périmée qu'on
       croirait fraîche ;
     • il supprime ses anciens caches à chaque nouvelle version.

   Il reçoit aussi les NOTIFICATIONS PUSH (nouvelle commande, devis, message) :
   voir la fin du fichier.

   Pour forcer la mise à jour de tous les téléphones après un déploiement :
   incrémenter VERSION ci-dessous.
   ============================================================================ */

const VERSION = 'wbp-mobile-v5';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

// Pages et images indispensables au premier affichage hors connexion.
//
// /mobile/activity n'est PAS pré-chargé : cet écran n'existe que pour le
// propriétaire du site, et il n'y a pas de raison de déposer sa page dans le
// cache des téléphones de toute l'équipe. Il est mis en cache normalement, à la
// première visite de celui qui y a droit (navigation = réseau puis cache).
const PRECACHE = [
  '/mobile',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/logos/wbp1.png',
  '/wbp-app.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll échoue en bloc si UNE seule ressource manque : on ajoute donc une
    // par une, pour qu'une icône absente n'empêche pas l'installation.
    await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Permet à l'app de demander une mise à jour immédiate.
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Supabase & co : jamais touché
  if (url.pathname.startsWith('/api/')) return;         // données : toujours le réseau
  if (url.pathname.startsWith('/admin')) return;        // back-office web : hors sujet

  // -- Navigation (ouverture de l'app, changement d'écran) --------------------
  // Réseau d'abord pour rester à jour, cache en secours quand il n'y a rien.
  //
  // Seuls les écrans de LECTURE sont mis en cache. Les écrans d'édition ne le
  // sont jamais, et c'est une décision de fond : une fiche produit servie depuis
  // le cache afficherait l'ancien prix, l'ancienne photo, l'ancien stock — et
  // l'enregistrement écraserait alors le travail de quelqu'un d'autre avec des
  // valeurs périmées, sans que personne ne voie l'erreur. Mieux vaut un écran
  // qui dit « pas de réseau » qu'un formulaire qui ment.
  const CACHEABLE = ['/mobile', '/mobile/activity'];
  if (req.mode === 'navigate') {
    const cacheable = CACHEABLE.includes(url.pathname);
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (cacheable) {
          const cache = await caches.open(SHELL);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        if (cacheable) {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
        }
        // Hors connexion sur un écran d'édition : on renvoie l'écran d'accueil
        // de l'app plutôt que la page d'erreur du navigateur, qui donne
        // l'impression que l'application est cassée.
        return (await caches.match('/mobile')) || Response.error();
      }
    })());
    return;
  }

  // -- Fichiers statiques (JS/CSS de Next, polices, images) -------------------
  // Cache d'abord — ils sont versionnés par leur nom, donc jamais périmés —
  // puis rafraîchissement silencieux en arrière-plan.
  const isStatic = url.pathname.startsWith('/_next/static/')
    || /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|ico)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});


/* ============================================================================
   NOTIFICATIONS PUSH
   ----------------------------------------------------------------------------
   Le serveur (lib/push.js) envoie un JSON chiffré :
     { title, body, url, tag, kind, id, badge, at }
   • `tag` regroupe les notifications d'un même élément : une commande mise à
     jour remplace sa notification au lieu d'en empiler une seconde ;
   • `badge` est le nombre de demandes à traiter, affiché sur l'icône de l'app.
   Règle d'Apple : chaque push DOIT afficher une notification, sinon iOS finit
   par couper l'abonnement. On en affiche donc toujours une, même illisible.
   ============================================================================ */
const SCOPE_PATH = '/mobile';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {
    try { data = { body: event.data ? event.data.text() : '' }; } catch { data = {}; }
  }
  const title = data.title || 'WBP';
  const options = {
    body: data.body || '',
    icon: '/app-icon-192.png',
    data: { url: data.url || `${SCOPE_PATH}/notifications`, id: data.id || null, kind: data.kind || null },
    timestamp: data.at ? Date.parse(data.at) : Date.now(),
  };
  if (data.tag) { options.tag = data.tag; options.renotify = true; }

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if (typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
      try {
        if (data.badge > 0) await self.navigator.setAppBadge(data.badge);
        else await self.navigator.clearAppBadge();
      } catch { /* non pris en charge */ }
    }
    // L'app est peut-être ouverte : on lui dit de rafraîchir ses compteurs.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) w.postMessage({ type: 'wbp-push', payload: data });
  })());
});

// Toucher la notification ouvre l'écran concerné — dans la fenêtre de l'app
// déjà ouverte s'il y en a une, sinon en lançant l'app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || SCOPE_PATH, self.location.origin);
  // On n'ouvre jamais d'adresse hors du site.
  const url = target.origin === self.location.origin ? target.href : new URL(SCOPE_PATH, self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find((w) => new URL(w.url).pathname.startsWith(SCOPE_PATH));
    if (app) {
      try { await app.focus(); } catch { /* déjà au premier plan */ }
      // L'app ouverte change d'écran elle-même (navigation interne, sans
      // rejouer l'écran d'ouverture) ; rechargement complet en dernier recours.
      try { app.postMessage({ type: 'wbp-open', url }); return; } catch { /* fenêtre inaccessible */ }
      try { await app.navigate(url); return; } catch { /* fenêtre non contrôlée */ }
    }
    await self.clients.openWindow(url);
  })());
});

// Le service push a renouvelé l'abonnement (rare) : on prévient le serveur,
// qui reprend les préférences de l'ancien.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch('/api/push', { credentials: 'include', cache: 'no-store' });
      const info = await res.json();
      if (!info?.publicKey) return;
      const pad = '='.repeat((4 - (info.publicKey.length % 4)) % 4);
      const raw = atob((info.publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch('/api/push', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), scope: SCOPE_PATH, oldEndpoint: event.oldSubscription?.endpoint || null }),
      });
    } catch { /* hors connexion : l'app se réabonnera à sa prochaine ouverture */ }
  })());
});
