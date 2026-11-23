'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { crumbsOf } from '@/components/admin/nav-model';
import { signOutAction } from '@/app/admin/actions';
import { markNotificationsRead } from '@/app/admin/crm-actions';
import { ago } from '@/lib/dates';

// ============================================================================
// Barre du haut du back-office : fil d'Ariane, recherche (Ctrl/⌘ + K),
// notifications (aperçu des 8 dernières), lien vers le site, menu du compte.
// ============================================================================

const KIND = {
  order: ['truck', '#16A34A'], quote: ['receipt', '#7C3AED'], message: ['mail', '#2563EB'],
  review: ['star', '#D97706'], team: ['user', '#0D9488'],
};

// Ferme un menu au clic extérieur et à Échap.
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen, ref]);
}

function NotifMenu({ unread = 0 }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications?limit=8', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setItems(j.items || []); setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const readAll = async () => {
    try { await markNotificationsRead(); } catch { /* réessayé à la prochaine ouverture */ }
    setItems((l) => (l || []).map((n) => ({ ...n, unread: false })));
    router.refresh();
  };

  return (
    <div className="tb-wrap" ref={ref}>
      <button type="button" className="tb-iconbtn" aria-label={unread ? `Notifications (${unread} non lues)` : 'Notifications'}
        aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="tb-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="tb-pop" role="menu">
          <div className="tb-pop-hd">
            <b>Notifications</b>
            {items?.some((n) => n.unread) && <button type="button" className="adm-btn ghost sm" onClick={readAll}>Tout marquer lu</button>}
          </div>
          <div className="tb-pop-list">
            {!items && !failed && <div className="tb-pop-empty">Chargement…</div>}
            {failed && <div className="tb-pop-empty">Impossible de charger les notifications.</div>}
            {items && items.length === 0 && <div className="tb-pop-empty">Aucune notification pour l’instant.</div>}
            {(items || []).map((n) => {
              const [icon, color] = KIND[n.kind] || ['bell', '#64748B'];
              return (
                <Link key={n.id} href={n.admin_url || '/admin/notifications'} className={`tb-pop-item ${n.unread ? 'unread' : ''}`} onClick={() => setOpen(false)}>
                  <span className="ic" style={{ background: color }}><Icon name={icon} size={15} /></span>
                  <span className="bd"><b>{n.title}</b>{n.body && <span>{n.body}</span>}</span>
                  <time>{ago(n.created_at)}</time>
                </Link>
              );
            })}
          </div>
          <div className="tb-pop-ft"><Link href="/admin/notifications" onClick={() => setOpen(false)}>Toutes les notifications et réglages</Link></div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ email, name }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const initial = String(name || email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="tb-wrap" ref={ref}>
      <button type="button" className="tb-avatar" aria-label="Mon compte" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>{initial}</button>
      {open && (
        <div className="tb-pop sm" role="menu">
          <div className="tb-user"><b>{name || 'Compte'}</b><span>{email}</span></div>
          <div style={{ padding: '4px 0' }}>
            <Link className="tb-menu-item" href="/admin/notifications" onClick={() => setOpen(false)}><Icon name="bell" size={16} /> Notifications</Link>
            <Link className="tb-menu-item" href="/admin/settings" onClick={() => setOpen(false)}><Icon name="cog" size={16} /> Paramètres du site</Link>
            <a className="tb-menu-item" href="/" target="_blank" rel="noreferrer"><Icon name="globe" size={16} /> Voir le site</a>
            <div className="tb-sep" />
            <form action={signOutAction}>
              <button type="submit" className="tb-menu-item danger"><Icon name="logout" size={16} /> Se déconnecter</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTopbar({ counts = {}, email, name, onMenu, onSearch }) {
  const pathname = usePathname();
  const crumbs = crumbsOf(pathname);
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')); }, []);
  return (
    <header className="adm-topbar">
      <button type="button" className="tb-iconbtn tb-menu" aria-label="Ouvrir le menu" onClick={onMenu}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <nav className="tb-crumbs" aria-label="Fil d’Ariane">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevright" size={14} />}
            {c.href ? <Link href={c.href}>{c.label}</Link> : i === crumbs.length - 1 ? <b>{c.label}</b> : <span>{c.label}</span>}
          </React.Fragment>
        ))}
      </nav>
      <div className="tb-spacer" />
      <button type="button" className="tb-search" onClick={onSearch} aria-label="Rechercher (Ctrl K)">
        <Icon name="search" size={16} />
        <span>Rechercher…</span>
        <kbd className="tb-kbd">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <NotifMenu unread={counts.notifications || 0} />
      <a className="tb-iconbtn tb-site" href="/" target="_blank" rel="noreferrer" aria-label="Voir le site" title="Voir le site"><Icon name="globe" size={18} /></a>
      <UserMenu email={email} name={name} />
    </header>
  );
}
