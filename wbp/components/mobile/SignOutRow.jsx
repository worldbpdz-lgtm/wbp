'use client';
import React from 'react';
import { useMobile } from '@/components/mobile/MobileApp';
import { Btn } from '@/components/mobile/form';

// Déconnexion depuis l'onglet « Plus ». Le geste passe par la coquille de
// l'application (`useMobile().signOut`) et non par un simple signOut Supabase :
// elle journalise la déconnexion et vide le cache local du téléphone, pour
// qu'un appareil prêté n'affiche pas les chiffres du compte précédent.
export default function SignOutRow() {
  const { signOut, me } = useMobile();
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      <Btn icon="logout" onClick={signOut}>Se déconnecter</Btn>
      <p className="mbf-hint" style={{ textAlign: 'center' }}>
        Connecté en tant que {me?.name || me?.email}
      </p>
    </div>
  );
}
