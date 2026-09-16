'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Stockage local du téléphone.
// ----------------------------------------------------------------------------
// Chaque écran garde sa dernière réponse dans localStorage. Conséquences :
//
//  • ouverture instantanée — les chiffres s'affichent pendant que le
//    rafraîchissement part en arrière-plan, au lieu d'un écran vide ;
//  • hors connexion (ascenseur, tunnel, dépôt) — l'app reste consultable et
//    indique depuis quand les données datent ;
//  • pas de données sensibles : ce sont les mêmes indicateurs que le tableau
//    de bord web, et la session Supabase reste dans son propre cookie.
//
// localStorage peut lever une exception (mode privé, quota, réglages qui
// bloquent le stockage) : toutes les lectures et écritures sont protégées, et
// l'app fonctionne normalement — simplement sans cache.
// ============================================================================

const PREFIX = 'wbp.mobile.';

export function readCache(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch { return null; }
}

export function writeCache(key, data) {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: new Date().toISOString(), data }));
  } catch { /* quota plein ou stockage refusé : on continue sans cache */ }
}

export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch { /* rien à faire */ }
}

// ----------------------------------------------------------------------------
// Hook « cache d'abord, réseau ensuite ».
// status : 'fresh' (réponse du serveur) · 'cached' (mémoire du téléphone)
//          · 'empty' (rien encore) · 'offline' · 'error' · 'unauthorized'
//
// `url` à null met le hook en veille : ni lecture du cache, ni appel réseau.
// C'est ce qui permet à un écran réservé de ne rien demander tant que le rôle
// du compte n'est pas établi — un 403 inutile dans les journaux du serveur, et
// une requête de plus au démarrage, pour un écran qu'on ne montrera pas.
// ----------------------------------------------------------------------------
export function useCached(key, url) {
  const [data, setData] = useState(null);
  const [cachedAt, setCachedAt] = useState(null);
  const [status, setStatus] = useState('empty');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  // Lecture du cache au montage (et à chaque changement d'URL : la fenêtre
  // 7/30/90 jours ou le filtre par personne changent la clé).
  useEffect(() => {
    const c = readCache(key);
    if (c) { setData(c.data); setCachedAt(c.at); setStatus('cached'); }
    else { setData(null); setCachedAt(null); setStatus('empty'); }
  }, [key]);

  const refresh = useCallback(async () => {
    if (!url) return;
    setBusy(true);
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) {
        if (alive.current) setStatus('unauthorized');
        return;
      }
      if (!res.ok) { if (alive.current) setStatus((s) => (s === 'cached' ? 'cached' : 'error')); return; }
      const json = await res.json();
      writeCache(key, json);
      if (!alive.current) return;
      setData(json); setCachedAt(new Date().toISOString()); setStatus('fresh');
    } catch {
      // Échec réseau : on garde ce qui est en mémoire et on le signale.
      if (alive.current) setStatus((s) => (s === 'empty' ? 'offline' : 'cached'));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [key, url]);

  useEffect(() => { refresh(); }, [refresh]);

  // Nouvelle tentative dès que le téléphone retrouve du réseau, et à chaque
  // retour au premier plan (l'app installée n'est jamais « rechargée »).
  useEffect(() => {
    const onBack = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [refresh]);

  return { data, status, cachedAt, busy, refresh };
}

// ----------------------------------------------------------------------- dates
const TZ = 'Africa/Algiers';

export const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const dayKeyOf = (iso) =>
  new Date(iso).toLocaleDateString('fr-CA', { timeZone: TZ }); // AAAA-MM-JJ, triable

export function dayLabelOf(iso) {
  const key = dayKeyOf(iso);
  const today = dayKeyOf(new Date().toISOString());
  const yest = dayKeyOf(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Aujourd'hui";
  if (key === yest) return 'Hier';
  return new Date(iso).toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
}

export function agoOf(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
