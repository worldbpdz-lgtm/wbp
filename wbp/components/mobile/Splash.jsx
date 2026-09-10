'use client';
import React from 'react';

// ============================================================================
// Écran d'ouverture — fond orange WBP, texte blanc, « Welcome Cherif ».
// ----------------------------------------------------------------------------
// Joué à chaque démarrage à froid de l'application installée (pas à chaque
// changement d'onglet : le composant vit dans la mise en page, il n'est monté
// qu'une fois par lancement).
//
// L'animation est 100 % CSS (styles/mobile.css) — aucune librairie, rien à
// télécharger, et elle démarre avant même que les données arrivent. Le seul
// calcul fait ici est le décalage lettre par lettre du prénom.
// ============================================================================

const WELCOME = 'Welcome';
const NAME = 'Cherif';

export default function Splash() {
  return (
    <div className="mb-splash" role="status" aria-label={`${WELCOME} ${NAME}`}>
      <span className="rings" aria-hidden="true" />
      <div className="inner">
        <div className="mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/wbp1.png" alt="" width={72} height={72} />
        </div>
        <div className="hello">{WELCOME}</div>
        <div className="who" aria-hidden="true">
          {NAME.split('').map((c, i) => (
            <span key={i} style={{ animationDelay: `${0.72 + i * 0.062}s` }}>{c}</span>
          ))}
        </div>
        <span className="rule" aria-hidden="true" />
      </div>
      <div className="foot">World Business Plus</div>
    </div>
  );
}

// Durée totale : dernière lettre (0.72 + 5×0.062 + 0.68) ≈ 1.71 s,
// trait 1.16 + 0.72 = 1.88 s, sortie déclenchée à 2.05 s sur 0.62 s.
export const SPLASH_MS = 2700;
