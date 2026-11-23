'use client';
// ============================================================================
// Le back-office « vivant » : toutes les 30 secondes (onglet visible), et à
// chaque push reçu, il relit le fil des notifications.
//   • une alerte s'affiche en bas à droite pour chaque nouvelle demande, avec
//     un petit son (désactivable dans /admin/notifications) ;
//   • le titre de l'onglet affiche le nombre de demandes à traiter : on le
//     voit même depuis un autre onglet ;
//   • quand les compteurs changent, la page est rafraîchie (pastilles du menu,
//     listes) — sans perdre ce qui est en cours de saisie.
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { useNotificationFeed } from '@/components/push-client';

const ICON = { order: 'cart', quote: 'receipt', message: 'mail', review: 'star', team: 'user' };
export const SOUND_KEY = 'wbp.admin.sound';

export function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const play = (freq, at, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + dur + 0.05);
    };
    play(880, 0, 0.16); play(1320, 0.14, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* son indisponible */ }
}

export default function AdminLive({ initialCounts }) {
  const router = useRouter();
  const { data, fresh, clearFresh } = useNotificationFeed({ every: 30000 });
  const [toasts, setToasts] = useState([]);
  const seen = useRef(JSON.stringify(initialCounts || {}));
  const baseTitle = useRef('');

  // Nouvelles notifications → alertes (et son).
  useEffect(() => {
    if (!fresh.length) return;
    setToasts((t) => [...fresh.slice(0, 3).map((n) => ({ ...n, key: `${n.id}-${Date.now()}` })), ...t].slice(0, 4));
    try { if (localStorage.getItem(SOUND_KEY) !== 'off') beep(); } catch { beep(); }
    clearFresh();
  }, [fresh, clearFresh]);

  // Les alertes disparaissent seules après 12 s.
  useEffect(() => {
    if (!toasts.length) return undefined;
    const t = setTimeout(() => setToasts((list) => list.slice(0, -1)), 12000);
    return () => clearTimeout(t);
  }, [toasts]);

  // Compteurs changés → la page se met à jour (menu, listes).
  useEffect(() => {
    const counts = data?.counts;
    if (!counts) return;
    const key = JSON.stringify({ quotes: counts.quotes, orders: counts.orders, messages: counts.messages, reviews: counts.reviews });
    const was = JSON.stringify({ quotes: initialCounts?.quotes, orders: initialCounts?.orders, messages: initialCounts?.messages, reviews: initialCounts?.reviews });
    if (key !== seen.current && key !== was) { seen.current = key; router.refresh(); }
  }, [data, initialCounts, router]);

  // « (3) Commandes — Admin » dans le titre de l'onglet.
  useEffect(() => {
    const n = data?.counts?.total ?? initialCounts?.total ?? 0;
    const apply = () => {
      const t = document.title.replace(/^\(\d+\)\s*/, '');
      baseTitle.current = t;
      document.title = n > 0 ? `(${n}) ${t}` : t;
    };
    apply();
    // Next remplace le titre à chaque navigation : on le surveille pour remettre le compteur.
    const obs = new MutationObserver(() => { if (!/^\(\d+\)/.test(document.title) && n > 0) apply(); });
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [data, initialCounts]);

  if (!toasts.length) return null;
  return (
    <div className="crm-toasts" aria-live="polite">
      {toasts.map((n) => (
        <a key={n.key} className="crm-toast" href={n.admin_url || '/admin/notifications'}>
          <span className="ic"><Icon name={ICON[n.kind] || 'bell'} size={17} /></span>
          <span><b>{n.title}</b>{n.body && <p>{n.body}</p>}</span>
          <button type="button" aria-label="Fermer" onClick={(e) => { e.preventDefault(); setToasts((t) => t.filter((x) => x.key !== n.key)); }}>
            <Icon name="close" size={15} />
          </button>
        </a>
      ))}
    </div>
  );
}
