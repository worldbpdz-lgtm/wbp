'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/components/ctx';
import { Icon, ProductImage } from '@/components/primitives';
import { dict, langs } from '@/lib/i18n';

function LangSwitch() {
  const { lang, setLang } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="lang" ref={ref}>
      <button className="icon-btn lang-btn" onClick={() => setOpen((o) => !o)} aria-label="Language">
        <Icon name="globe" size={18} />
        <span className="lang-cur">{dict[lang].flag}</span>
        <Icon name="chevdown" size={13} className="lang-caret" style={{ opacity: 0.6 }} />
      </button>
      <div className={`lang-menu ${open ? 'open' : ''}`}>
        {langs.map((l) => (
          <button key={l} className={`lang-opt ${l === lang ? 'active' : ''}`} onClick={() => { setLang(l); setOpen(false); }}>
            <span className="lang-opt-flag">{dict[l].flag}</span>
            <span>{dict[l].label}</span>
            {l === lang && <Icon name="check" size={15} style={{ marginInlineStart: 'auto', color: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchBar({ variant = 'header' }) {
  const { t, nav, lang, wbp } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const results = q.trim().length < 1 ? [] : wbp.products.filter((p) => {
    const s = (p.name + ' ' + p.code + ' ' + (wbp.brandById(p.brand)?.name || '') + ' ' + (wbp.categoryById(p.cat)?.[lang] || '')).toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => s.includes(w));
  }).slice(0, 6);
  const submit = () => { if (q.trim()) { nav('catalog', { q: q.trim() }); setOpen(false); } };
  return (
    <div className={`search search-${variant}`} ref={ref}>
      <div className="search-field">
        <Icon name="search" size={18} className="search-ico" />
        <input value={q} placeholder={t('search_ph')}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        {q && <button className="search-clear" onClick={() => { setQ(''); setOpen(false); }} aria-label="clear"><Icon name="close" size={15} /></button>}
      </div>
      <div className={`search-pop ${open && results.length ? 'open' : ''}`}>
        {results.map((p) => (
          <button key={p.id} className="search-res" onClick={() => { nav('product', { id: p.id }); setOpen(false); setQ(''); }}>
            <div className="search-res-img"><ProductImage product={p} /></div>
            <div className="search-res-txt">
              <span className="search-res-name">{p.name}</span>
              <span className="search-res-meta">{[wbp.brandById(p.brand)?.short, p.code].filter(Boolean).join(' · ')}</span>
            </div>
            <Icon name="chevright" size={15} style={{ opacity: 0.4 }} />
          </button>
        ))}
        {open && results.length > 0 && (
          <button className="search-all" onClick={submit}><Icon name="search" size={14} /> {t('view_all')} — “{q}”</button>
        )}
      </div>
    </div>
  );
}

export default function Header() {
  const { t, nav, route, theme, setTheme, cartCount, setCartOpen } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mSearch, setMSearch] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12);
    h(); window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  const links = [
    ['home', t('nav_home')], ['catalog', t('nav_catalog')], ['brands', t('nav_brands')],
    ['about', t('nav_about')], ['contact', t('nav_contact')],
  ];
  return (
    <>
      <div className="annbar">
        <div className="annbar-track">
          <span><Icon name="badge" size={13} /> {t('agreed')}</span>
          <span><Icon name="truck" size={13} /> {t('quote_model')}</span>
          <span><Icon name="bolt" size={13} /> {t('foot_tag')}</span>
          <span><Icon name="badge" size={13} /> {t('agreed')}</span>
          <span><Icon name="truck" size={13} /> {t('quote_model')}</span>
          <span><Icon name="bolt" size={13} /> {t('foot_tag')}</span>
        </div>
      </div>
      <header className={`hdr ${scrolled ? 'scrolled' : ''}`}>
        <div className="hdr-inner">
          <button className="logo" onClick={() => nav('home')}>
            <img className="logo-img" src={theme === 'light' ? '/logos/wbp1.png' : '/logos/wbp.png'} alt="World Business Plus" width={40} height={40} />
            <span className="logo-txt"><b>World Business</b><i>Plus</i></span>
          </button>
          <nav className="hdr-nav">
            {links.map(([v, label]) => (
              <button key={v} className={`nav-link ${route.view === v ? 'active' : ''}`} onClick={() => nav(v)}>
                {label}<span className="nav-ink" />
              </button>
            ))}
          </nav>
          <div className="hdr-search"><SearchBar /></div>
          <div className="hdr-right">
            <button className="icon-btn only-mobile" onClick={() => setMSearch((s) => !s)} aria-label="Search"><Icon name="search" size={19} /></button>
            <LangSwitch />
            <button className="icon-btn theme-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Theme">
              <span className="theme-ico" data-theme={theme}>
                <Icon name="sun" size={18} className="ti-sun" />
                <Icon name="moon" size={17} className="ti-moon" />
              </span>
            </button>
            <button className="icon-btn only-desk" onClick={() => nav('contact')} aria-label={t('account')}><Icon name="user" size={19} /></button>
            <button className="icon-btn cart-btn" onClick={() => setCartOpen(true)} aria-label={t('cart')}>
              <Icon name="cart" size={19} />
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </button>
            <button className="icon-btn only-mobile burger" onClick={() => setMenu((m) => !m)} aria-label="Menu">
              <Icon name={menu ? 'close' : 'grid'} size={19} />
            </button>
          </div>
        </div>
        {mSearch && <div className="hdr-msearch"><SearchBar variant="mobile" /></div>}
        <div className={`hdr-drawer ${menu ? 'open' : ''}`}>
          {links.map(([v, label]) => (
            <button key={v} className={`drawer-link ${route.view === v ? 'active' : ''}`} onClick={() => { nav(v); setMenu(false); }}>
              {label}<Icon name="chevright" size={16} />
            </button>
          ))}
        </div>
      </header>
    </>
  );
}
