'use client';
import React, { useState } from 'react';
import { useMobile } from '@/components/mobile/MobileApp';
import { Btn, Confirm } from '@/components/mobile/form';

// Déconnexion depuis l'onglet « Plus ». Le geste passe par la coquille de
// l'application (`useMobile().signOut`) et non par un simple signOut Supabase :
// elle désabonne ce téléphone des notifications, journalise la déconnexion et
// vide le cache local, pour qu'un appareil prêté n'affiche pas les chiffres —
// ni ne reçoive les alertes — du compte précédent.
export default function SignOutRow() {
  const { signOut, me } = useMobile();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      <Btn icon="logout" onClick={() => setAsk(true)}>Se déconnecter</Btn>
      <p className="mbf-hint" style={{ textAlign: 'center' }}>
        Connecté en tant que {me?.name || me?.email}
      </p>
      <Confirm
        open={ask}
        onClose={() => setAsk(false)}
        busy={busy}
        title="Se déconnecter ?"
        body="Ce téléphone ne recevra plus les notifications de votre compte jusqu’à votre prochaine connexion."
        confirmLabel="Se déconnecter"
        danger
        onConfirm={async () => { setBusy(true); try { await signOut(); } finally { setBusy(false); setAsk(false); } }}
      />
    </div>
  );
}
