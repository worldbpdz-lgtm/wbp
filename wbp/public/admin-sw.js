/* ============================================================================
   WBP — service worker du BACK-OFFICE WEB (/admin), notifications seulement.
   ----------------------------------------------------------------------------
   Enregistré avec la portée /admin/ quand un membre de l'équipe active les
   notifications sur son ordinateur (page /admin/notifications).

   Il ne met RIEN en cache et n'intercepte aucune requête : le back-office
   reste toujours servi en direct. Il affiche seulement les notifications push
   (nouvelle commande, devis, message) et ouvre le bon écran au clic.
   ============================================================================ */
const SCOPE_PATH = '/admin';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {
    try { data = { body: event.data ? event.data.text() : '' }; } catch { data = {}; }
  }
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    data: { url: data.url || `${SCOPE_PATH}/notifications` },
    timestamp: data.at ? Date.parse(data.at) : Date.now(),
    requireInteraction: data.kind === 'order',   // une commande reste affichée jusqu'au clic
  };
  if (data.tag) { options.tag = data.tag; options.renotify = true; }
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'World Business Plus', options);
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) w.postMessage({ type: 'wbp-push', payload: data });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || SCOPE_PATH, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL(SCOPE_PATH, self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = wins.find((w) => new URL(w.url).pathname.startsWith(SCOPE_PATH));
    if (tab) {
      try { await tab.focus(); } catch { /* déjà au premier plan */ }
      try { await tab.navigate(url); return; } catch { /* onglet non contrôlé */ }
      tab.postMessage({ type: 'wbp-open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

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
    } catch { /* l'onglet se réabonnera à sa prochaine ouverture */ }
  })());
});
