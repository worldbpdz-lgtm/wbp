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

   Pour forcer la mise à jour de tous les téléphones après un déploiement :
   incrémenter VERSION ci-dessous.
   ============================================================================ */

const VERSION = 'wbp-mobile-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

// Pages et images indispensables au premier affichage hors connexion.
const PRECACHE = [
  '/mobile',
  '/mobile/activity',
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
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || (await caches.match('/mobile')) || Response.error();
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
