'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Notifications push — logique côté NAVIGATEUR, partagée par l'app mobile
// (/mobile) et le back-office web (/admin).
// ----------------------------------------------------------------------------
// États possibles de CET appareil :
//   loading      vérification en cours
//   unsupported  navigateur sans notifications push (vieil iPhone < iOS 16.4…)
//   ios-install  iPhone/iPad dans Safari : il faut d'abord installer l'app
//                (Partager → Sur l'écran d'accueil). Apple n'autorise les
//                notifications qu'aux apps installées.
//   unavailable  le serveur n'est pas prêt (migration de la base à appliquer)
//   denied       l'utilisateur a refusé — seuls les Réglages du téléphone
//                peuvent revenir dessus
//   off          possible, pas encore activé
//   on           abonné : cet appareil reçoit les notifications
//
// iOS : la demande d'autorisation DOIT partir d'un geste (toucher un bouton).
// La clé publique est donc chargée à l'avance, pour que enable() puisse
// appeler Notification.requestPermission() immédiatement dans le clic.
// ============================================================================

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function bytesToB64(buf) {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  return { ok: res.ok, status: res.status, json: json || {} };
}

/**
 * @param scope  '/mobile' ou '/admin'
 * @param swUrl  fichier du service worker à enregistrer pour cette portée
 */
export function usePushDevice({ scope = '/mobile', swUrl = '/sw.js' } = {}) {
  const [state, setState] = useState('loading');
  const [prefs, setPrefs] = useState(null);
  const [device, setDevice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef(null);
  const regRef = useRef(null);

  const registration = useCallback(async () => {
    if (regRef.current) return regRef.current;
    const swScope = scope === '/admin' ? '/admin/' : '/mobile';
    let reg = await navigator.serviceWorker.getRegistration(swScope);
    if (!reg) reg = await navigator.serviceWorker.register(swUrl, { scope: swScope });
    regRef.current = reg;
    return reg;
  }, [scope, swUrl]);

  const refresh = useCallback(async () => {
    setError('');
    if (!pushSupported()) { setState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported'); return; }
    if (isIos() && !isStandalone()) { setState('ios-install'); return; }
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      const r = await api('GET', `/api/push${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ''}`);
      if (!r.ok || !r.json.available) { setState('unavailable'); return; }
      keyRef.current = r.json.publicKey;
      setPrefs(r.json.prefs || null);
      setDevice(r.json.device || null);
      if (Notification.permission === 'denied') { setState('denied'); return; }
      if (!sub || Notification.permission !== 'granted') { setState('off'); return; }

      // Abonnement créé avec d'anciennes clés : on le remplace.
      const used = bytesToB64(sub.options?.applicationServerKey);
      if (used && used !== r.json.publicKey) {
        await sub.unsubscribe().catch(() => {});
        setState('off');
        return;
      }
      if (!r.json.subscribed) {
        // Abonné côté téléphone mais inconnu du serveur (supprimé, changé de
        // compte) : on le réenregistre sans rien demander.
        const s2 = await api('POST', '/api/push', { subscription: sub.toJSON(), scope, prefs: r.json.prefs });
        if (!s2.ok) { setState('off'); return; }
        setPrefs(s2.json.prefs || r.json.prefs);
        setDevice(s2.json.device || null);
      }
      setState('on');
    } catch {
      setState('unsupported');
    }
  }, [registration, scope]);

  useEffect(() => { refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    setError('');
    if (!pushSupported()) return false;
    setBusy(true);
    try {
      // Premier appel du geste : la demande d'autorisation (exigence iOS).
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return false; }
      if (!keyRef.current) {
        const r = await api('GET', '/api/push');
        if (!r.ok || !r.json.available) { setState('unavailable'); return false; }
        keyRef.current = r.json.publicKey;
        setPrefs(r.json.prefs || null);
      }
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(keyRef.current) });
      }
      const s = await api('POST', '/api/push', { subscription: sub.toJSON(), scope, prefs });
      if (!s.ok) {
        setError(s.status === 503 ? 'Le serveur n’est pas encore prêt (base à mettre à jour).' : 'Impossible d’enregistrer cet appareil. Réessayez.');
        return false;
      }
      setPrefs(s.json.prefs || prefs);
      setDevice(s.json.device || null);
      setState('on');
      // Confirmation immédiate que toute la chaîne fonctionne.
      api('POST', '/api/push/test', { endpoint: sub.endpoint }).catch(() => {});
      return true;
    } catch (e) {
      setError(e?.message?.includes('denied') ? 'Autorisation refusée.' : 'Activation impossible sur cet appareil.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [registration, scope, prefs]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('DELETE', '/api/push', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
      return true;
    } finally { setBusy(false); }
  }, [registration]);

  const savePrefs = useCallback(async (next) => {
    setPrefs(next);
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const r = await api('PATCH', '/api/push', { endpoint: sub.endpoint, prefs: next });
    if (!r.ok) { setError('Préférences non enregistrées. Réessayez.'); return false; }
    return true;
  }, [registration]);

  const test = useCallback(async () => {
    setError('');
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { setState('off'); return { ok: false, error: 'Cet appareil n’est pas abonné.' }; }
    const r = await api('POST', '/api/push/test', { endpoint: sub.endpoint });
    if (!r.ok && r.json?.gone) setState('off');
    return r.json?.ok ? { ok: true } : { ok: false, error: r.json?.error || 'Échec de l’envoi.' };
  }, [registration]);

  return { state, prefs, device, busy, error, enable, disable, savePrefs, test, refresh };
}

/** Désabonne CET appareil (déconnexion) — un téléphone prêté ne reçoit plus rien. */
export async function forgetThisDevice(scope = '/mobile') {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration(scope === '/admin' ? '/admin/' : '/mobile');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api('DELETE', '/api/push', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch { /* rien à faire */ }
}

/** Badge de l'icône de l'app (iOS 16.4+ installée, Android, ordinateur). */
export function setAppBadge(n) {
  try {
    if (typeof navigator === 'undefined') return;
    if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch { /* non pris en charge */ }
}

// ----------------------------------------------------------------------------
// Fil de notifications + compteurs « à traiter », rafraîchis :
//   • à l'ouverture, au retour au premier plan, au retour du réseau ;
//   • à chaque push reçu pendant que l'app est ouverte (message du SW) ;
//   • toutes les `every` ms tant que l'onglet est visible (back-office).
// ----------------------------------------------------------------------------
export function useNotificationFeed({ every = 0, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [fresh, setFresh] = useState([]);     // arrivées depuis le dernier passage
  const lastId = useRef(0);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await api('GET', '/api/notifications?limit=30');
      if (!r.ok) return;
      const items = r.json.items || [];
      const top = items[0]?.id || 0;
      if (lastId.current && top > lastId.current) {
        setFresh(items.filter((n) => n.id > lastId.current && n.unread));
      }
      if (top) lastId.current = Math.max(lastId.current, top);
      setData(r.json);
    } catch { /* hors connexion : on garde le dernier état */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    const onMsg = (e) => { if (e?.data?.type === 'wbp-push') load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', load);
    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    if (every) {
      timer.current = setInterval(() => { if (document.visibilityState === 'visible') load(); }, every);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', load);
      navigator.serviceWorker?.removeEventListener?.('message', onMsg);
      clearInterval(timer.current);
    };
  }, [load, every, enabled]);

  return { data, fresh, clearFresh: () => setFresh([]), reload: load };
}
