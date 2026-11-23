'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { GROUPS, CREATE_ACTIONS } from '@/components/admin/nav-model';
import { adminSearch } from '@/app/admin/search-actions';
import { orderStatus, quoteStatus, messageStatus } from '@/lib/crm';
import { dzd } from '@/lib/pricing';

// ============================================================================
// Palette de commandes — Ctrl/⌘ + K (ou « / ») depuis n'importe quelle page.
//   • sans saisie : actions rapides (créer…) et toutes les pages ;
//   • avec saisie : pages correspondantes + recherche dans les commandes,
//     devis, clients, messages et produits (nom, société, téléphone,
//     numéro CMD-/DEV-…).
// Clavier : ↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer.
// ============================================================================

const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PAGES = GROUPS.flatMap((g) => g.items.map(([href, label, icon, , kw]) => ({
  id: `p:${href}`, href, title: label, sub: g.label || 'Général', icon, kw: fold(`${label} ${g.label || ''} ${kw || ''}`),
})));
const ACTIONS = CREATE_ACTIONS.map(([href, label, icon, kw]) => ({ id: `a:${href}`, href, title: label, sub: 'Créer', icon, kw: fold(`${label} ${kw}`) }));

export default function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ(''); setFound(null); setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, [open]);

  // Recherche serveur, 220 ms après la dernière frappe.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setFound(null); setLoading(false); return undefined; }
    const my = ++seq.current;
    setLoading(true);
    const h = setTimeout(async () => {
      try {
        const r = await adminSearch(term);
        if (my === seq.current) setFound(r?.ok ? r.groups : {});
      } catch { if (my === seq.current) setFound({}); }
      finally { if (my === seq.current) setLoading(false); }
    }, 220);
    return () => clearTimeout(h);
  }, [q, open]);

  const sections = useMemo(() => {
    const term = fold(q.trim());
    const out = [];
    if (!term) {
      out.push({ label: 'Actions rapides', items: ACTIONS });
      out.push({ label: 'Pages', items: PAGES });
      return out;
    }
    const pages = [...ACTIONS, ...PAGES].filter((p) => p.kw.includes(term));
    if (pages.length) out.push({ label: 'Pages et actions', items: pages.slice(0, 6) });
    const g = found || {};
    if (g.orders?.length) out.push({ label: 'Commandes', items: g.orders.map((o) => ({
      id: `o:${o.id}`, href: `/admin/orders/${o.id}`, icon: 'truck',
      title: `${o.number || 'Commande'} · ${o.company || o.customer_name || 'Client'}`,
      sub: [orderStatus(o.status).label, Number(o.total) > 0 ? dzd(o.total) : null].filter(Boolean).join(' · '),
    })) });
    if (g.quotes?.length) out.push({ label: 'Devis', items: g.quotes.map((x) => ({
      id: `q:${x.id}`, href: `/admin/quotes/${x.id}`, icon: 'receipt',
      title: `${x.number || 'Devis'} · ${x.company || x.customer_name || 'Client'}`, sub: quoteStatus(x.status).label,
    })) });
    if (g.customers?.length) out.push({ label: 'Clients', items: g.customers.map((c) => ({
      id: `c:${c.id}`, href: `/admin/customers/${c.id}`, icon: 'user',
      title: c.company || c.name || c.phone || 'Client', sub: [c.company && c.name, c.phone, c.wilaya].filter(Boolean).join(' · '),
    })) });
    if (g.messages?.length) out.push({ label: 'Messages', items: g.messages.map((m) => ({
      id: `m:${m.id}`, href: `/admin/messages/${m.id}`, icon: 'mail',
      title: `${m.name || 'Contact'}${m.company ? ` · ${m.company}` : ''}`, sub: [messageStatus(m.status).label, m.subject].filter(Boolean).join(' · '),
    })) });
    if (g.products?.length) out.push({ label: 'Produits', items: g.products.map((p) => ({
      id: `pr:${p.id}`, href: `/admin/products/${encodeURIComponent(p.id)}`, icon: 'box',
      title: p.name || p.code, sub: [p.code, p.active === false ? 'masqué' : null].filter(Boolean).join(' · '),
    })) });
    return out;
  }, [q, found]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  useEffect(() => { setActive(0); }, [q, found]);
  useEffect(() => {
    const el = listRef.current?.querySelector('.cmdk-item.on');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (it) => { if (!it) return; onClose(); router.push(it.href); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let idx = -1;
  return (
    <div className="cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Rechercher dans le back-office">
        <div className="cmdk-in">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Rechercher une commande, un client, un produit, une page…"
            aria-label="Rechercher"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span className="cmdk-spin" aria-label="Recherche en cours" />}
          <kbd className="tb-kbd">Échap</kbd>
        </div>
        <div className="cmdk-list" ref={listRef} role="listbox">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="cmdk-group">{s.label}</div>
              {s.items.map((it) => {
                idx += 1;
                const i = idx;
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={`cmdk-item ${i === active ? 'on' : ''}`}
                    onMouseMove={() => { if (active !== i) setActive(i); }}
                    onClick={() => go(it)}
                  >
                    <span className="ic"><Icon name={it.icon} size={15} /></span>
                    <span className="bd"><b>{it.title}</b>{it.sub && <span>{it.sub}</span>}</span>
                    {i === active && <span className="hint">↵</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {q.trim().length >= 2 && !loading && found && flat.length === 0 && (
            <div className="cmdk-empty">Aucun résultat pour « {q.trim()} ».</div>
          )}
        </div>
        <div className="cmdk-ft">
          <span><kbd className="tb-kbd">↑</kbd><kbd className="tb-kbd">↓</kbd> naviguer</span>
          <span><kbd className="tb-kbd">↵</kbd> ouvrir</span>
          <span>Téléphone, nom, société ou n° CMD- / DEV-</span>
        </div>
      </div>
    </div>
  );
}
