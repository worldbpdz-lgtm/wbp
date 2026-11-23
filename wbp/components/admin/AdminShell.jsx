'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminNav from '@/components/AdminNav';
import AdminTopbar from '@/components/admin/AdminTopbar';
import CommandPalette from '@/components/admin/CommandPalette';

// ============================================================================
// Coquille du back-office : menu latéral + barre du haut + palette (Ctrl/⌘+K).
// L'état « menu réduit » est gardé dans un cookie, relu par le serveur : la
// page s'affiche directement dans la bonne largeur, sans saut au chargement.
// ============================================================================

const COOKIE = 'wbp_adm_side';

export default function AdminShell({ counts, email, name, mini: initialMini = false, overlay = null, children }) {
  const pathname = usePathname();
  const [mini, setMini] = useState(initialMini);
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => { setNavOpen(false); }, [pathname]);

  const toggleMini = useCallback(() => {
    setMini((m) => {
      const next = !m;
      try { document.cookie = `${COOKIE}=${next ? 'mini' : 'full'}; path=/admin; max-age=31536000; samesite=lax`; } catch { /* cookies bloqués */ }
      return next;
    });
  }, []);

  // Raccourcis : Ctrl/⌘ + K partout, « / » hors d'un champ de saisie.
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key?.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      if (k === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target;
        const typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
        if (!typing) { e.preventDefault(); setPalette(true); }
      }
      if (k === 'escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`adm${mini ? ' mini' : ''}${navOpen ? ' nav-open' : ''}`}>
      <AdminNav counts={counts} mini={mini} onToggleMini={toggleMini} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="adm-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="adm-col">
        <AdminTopbar counts={counts} email={email} name={name} onMenu={() => setNavOpen(true)} onSearch={() => setPalette(true)} />
        <main className="adm-main" id="adm-main">{children}</main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {overlay}
    </div>
  );
}
