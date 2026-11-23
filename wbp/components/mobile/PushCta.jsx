'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/mobile/ui';
import { usePushDevice } from '@/components/push-client';

// ============================================================================
// Bandeau « Activez les notifications » — en tête des écrans Stats et
// Demandes, tant que CE téléphone ne reçoit pas les alertes.
// ----------------------------------------------------------------------------
// Le bouton « Activer » demande l'autorisation directement (geste de
// l'utilisateur : exigence d'iOS). Sur un iPhone où l'app n'est pas encore
// installée, il mène aux explications. Fermé, il revient au bout de 14 jours :
// un réglage oublié coûte une commande manquée.
// ============================================================================

const KEY = 'wbp.pushcta.hidden';
const DAYS = 14;

export default function PushCta() {
  const push = usePushDevice({ scope: '/mobile', swUrl: '/sw.js' });
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(KEY) || 0);
      setHidden(at > 0 && Date.now() - at < DAYS * 86400000);
    } catch { setHidden(false); }
  }, []);

  if (hidden) return null;
  if (push.state !== 'off' && push.state !== 'ios-install') return null;

  const close = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* stockage indisponible */ }
    setHidden(true);
  };

  const body = (
    <>
      <span className="ic"><Icon name="bell" size={18} /></span>
      <span style={{ minWidth: 0 }}>
        <b>{push.state === 'ios-install' ? 'Installez l’app pour être alerté' : 'Alertes de nouvelles commandes'}</b>
        <small>{push.state === 'ios-install'
          ? 'Commandes, devis et messages en notification.'
          : 'Commandes, devis, questions — même app fermée.'}</small>
      </span>
    </>
  );

  return (
    <div className="mbn-cta" role="status">
      {push.state === 'ios-install' ? (
        <Link href="/mobile/notifications" style={{ display: 'flex', gap: 11, alignItems: 'center', color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
          {body}
        </Link>
      ) : (
        <>
          {body}
          <button
            type="button"
            className="mbf-btn primary sm"
            style={{ marginInlineStart: 'auto', flexShrink: 0 }}
            disabled={push.busy}
            onClick={async () => { await push.enable(); }}
          >
            {push.busy ? '…' : 'Activer'}
          </button>
        </>
      )}
      <button type="button" className="x" onClick={close} aria-label="Masquer">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
