'use client';
import React, { useEffect, useState } from 'react';
import { readCache } from '@/components/mobile/store';

// ============================================================================
// Écran d'ouverture — fond orange WBP, texte blanc, « Welcome <prénom> ».
// ----------------------------------------------------------------------------
// Joué à chaque démarrage à froid de l'application installée (pas à chaque
// changement d'onglet : le composant vit dans la mise en page, il n'est monté
// qu'une fois par lancement).
//
// Le prénom est celui du compte de CE téléphone, relu dans le stockage local
// (le nom renvoyé par /api/mobile/me au lancement précédent) : chacun est
// accueilli par son prénom, sans attendre le réseau. Au tout premier
// lancement, et après une déconnexion qui vide la mémoire, on affiche
// simplement « Welcome ».
//
// L'animation est 100 % CSS (styles/mobile.css) — aucune librairie, rien à
// télécharger, et elle démarre avant même que les données arrivent. Le seul
// calcul fait ici est le décalage lettre par lettre du prénom.
// ============================================================================

const WELCOME = 'Welcome';

// « Abdenour Ague » → « Abdenour ». Un écran d'accueil dit un prénom, pas un
// état civil — et une seule ligne courte tient sur la largeur d'un téléphone.
const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || '';

export default function Splash() {
  const [name, setName] = useState('');

  useEffect(() => {
    const cached = readCache('me');
    setName(firstName(cached?.data?.name));
  }, []);

  return (
    <div className="mb-splash" role="status" aria-label={name ? `${WELCOME} ${name}` : WELCOME}>
      <span className="rings" aria-hidden="true" />
      <div className="inner">
        <div className="mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/wbp1.png" alt="" width={72} height={72} />
        </div>
        <div className="hello">{WELCOME}</div>
        {name && (
          <div className="who" aria-hidden="true">
            {name.split('').map((c, i) => (
              <span key={i} style={{ animationDelay: `${0.72 + i * 0.062}s` }}>{c}</span>
            ))}
          </div>
        )}
        <span className="rule" aria-hidden="true" />
      </div>
      <div className="foot">World Business Plus</div>
    </div>
  );
}

// Durée totale : dernière lettre (0.72 + 5×0.062 + 0.68) ≈ 1.71 s,
// trait 1.16 + 0.72 = 1.88 s, sortie déclenchée à 2.05 s sur 0.62 s.
export const SPLASH_MS = 2700;
