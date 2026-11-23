'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { GROUPS } from '@/components/admin/nav-model';

// ============================================================================
// Menu latéral du back-office.
//   • grand écran : colonne claire, réductible en icônes seules (bouton du
//     bas, mémorisé par un cookie — voir AdminShell) ;
//   • petit écran : tiroir qui s'ouvre depuis le bouton ☰ de la barre du haut
//     et se referme dès qu'on choisit une page.
// Les pastilles comptent ce qui attend : commandes à confirmer, devis et
// messages nouveaux, avis à modérer, notifications non lues.
// ============================================================================

export default function AdminNav({ counts = {}, mini = false, onToggleMini, onNavigate }) {
  const pathname = usePathname();
  return (
    <aside className="adm-side" aria-label="Menu du back-office">
      <div className="adm-brand">
        {/* Fond clair → variante sombre du logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="m"><img src="/logos/wbp1.png" alt="World Business Plus" width={32} height={32} /></span>
        <span>World Business Plus<small>Back-office</small></span>
      </div>
      <nav className="adm-side-nav" id="adm-side-nav">
        {GROUPS.map((g, gi) => (
          <React.Fragment key={gi}>
            {g.label && <div className="adm-navlabel">{g.label}</div>}
            {g.items.map(([href, label, icon, key]) => {
              const on = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
              const n = key ? counts[key] : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`adm-navlink ${on ? 'on' : ''}`}
                  aria-current={on ? 'page' : undefined}
                  title={mini ? `${label}${n ? ` (${n})` : ''}` : undefined}
                  onClick={onNavigate}
                >
                  <Icon name={icon} size={17} />
                  <span className="txt">{label}</span>
                  {n > 0 && <span className="badge-n" aria-label={`${n} à traiter`}>{n > 99 ? '99+' : n}</span>}
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </nav>
      <div className="adm-side-foot">
        <button type="button" className="adm-collapse" onClick={onToggleMini} aria-label={mini ? 'Déplier le menu' : 'Réduire le menu'} title={mini ? 'Déplier le menu' : 'Réduire le menu'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path d="m15 10-2 2 2 2" />
          </svg>
          <span className="txt">Réduire le menu</span>
        </button>
      </div>
    </aside>
  );
}
