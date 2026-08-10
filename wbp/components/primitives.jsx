'use client';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ICON_PATHS } from '@/lib/icons';
import { useApp } from '@/components/ctx';
import { brandLogo } from '@/lib/logos';

// ── utils ──────────────────────────────────────────────────────────────────
export const fmtRating = (n) => (Math.round(n * 10) / 10).toFixed(1);
export function scrollTopSmooth() {
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
}

// ── reveal-on-scroll ─────────────────────────────────────────────────────────
export function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const r = el.getBoundingClientRect();
    if (r.top <= vh - 30) return;
    setShown(false);
    let done = false;
    const reveal = () => { if (done) return; done = true; setShown(true); cleanup(); };
    const check = () => { const b = el.getBoundingClientRect(); if (b.top <= (window.innerHeight || 0) - 40) reveal(); };
    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) reveal(); }), { rootMargin: '0px 0px -5% 0px' });
      io.observe(el);
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    const t = setTimeout(reveal, 1600);
    function cleanup() { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); clearTimeout(t); if (io) io.disconnect(); }
    return cleanup;
  }, []);
  return [ref, shown];
}

export function Reveal({ as = 'div', delay = 0, y = 22, className = '', style = {}, children, ...rest }) {
  const [ref, shown] = useReveal();
  const Tag = as;
  return (
    <Tag ref={ref} className={className}
      style={{ ...style, opacity: shown ? 1 : 0, transform: shown ? 'none' : `translateY(${y}px)`,
        transition: `opacity .7s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .7s cubic-bezier(.22,1,.36,1) ${delay}ms`,
        willChange: 'opacity, transform' }} {...rest}>
      {children}
    </Tag>
  );
}

export function useCountUp(target, dur = 1400) {
  const [val, setVal] = useState(0);
  const [ref, shown] = useReveal();
  useEffect(() => {
    if (!shown) return;
    let raf, start;
    const num = parseFloat(target) || 0;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      setVal(num * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shown, target, dur]);
  return [ref, val];
}

export function useTilt(max = 6) {
  const ref = useRef(null);
  const onMouseMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateY(-6px)`;
  };
  const onMouseLeave = () => { const el = ref.current; if (el) el.style.transform = ''; };
  return { ref, onMouseMove, onMouseLeave };
}

// ── icon + stars + product image ─────────────────────────────────────────────
export function Icon({ name, size = 20, stroke = 1.7, className = '', style = {} }) {
  const p = ICON_PATHS[name] || ICON_PATHS.box;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }} dangerouslySetInnerHTML={{ __html: p }} />
  );
}

export function Stars({ value = 0, size = 16, onPick = null, gap = 2 }) {
  const [hover, setHover] = useState(0);
  const v = hover || value;
  return (
    <span style={{ display: 'inline-flex', gap, lineHeight: 0 }} role="img" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = v >= i ? 1 : (v >= i - 0.5 ? 0.5 : 0);
        return (
          <span key={i}
            onMouseEnter={onPick ? () => setHover(i) : undefined}
            onMouseLeave={onPick ? () => setHover(0) : undefined}
            onClick={onPick ? () => onPick(i) : undefined}
            style={{ position: 'relative', width: size, height: size, cursor: onPick ? 'pointer' : 'default', display: 'inline-block' }}>
            <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }}
              fill="var(--star-empty)" dangerouslySetInnerHTML={{ __html: ICON_PATHS.star }} />
            <span style={{ position: 'absolute', inset: 0, width: fill === 0.5 ? '50%' : '100%', overflow: 'hidden', display: fill ? 'block' : 'none' }}>
              <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--star)" dangerouslySetInnerHTML={{ __html: ICON_PATHS.star }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ProductImage({ product, size = 'card' }) {
  const { wbp } = useApp();
  const cat = wbp.categoryById(product.cat);
  const brand = wbp.brandById(product.brand);
  const glyph = cat ? cat.icon : 'box';
  const tint = brand ? brand.color : '#FF5A1F';
  const big = size === 'hero';
  if (product.image_url) {
    return (
      <div className={`prod-img prod-img-photo ${big ? 'prod-img-hero' : ''}`} style={{ '--tint': tint }}>
        <img src={product.image_url} alt={product.name} loading="lazy" />
      </div>
    );
  }
  const logo = brand ? brandLogo(brand) : null;
  return (
    <div className={`prod-img ${big ? 'prod-img-hero' : ''}`} style={{ '--tint': tint }}>
      <div className="prod-img-grid" />
      <div className="prod-img-glow" />
      <div className="prod-img-glyph"><Icon name={glyph} size={big ? 116 : 60} stroke={1.2} /></div>
      {logo
        ? <img className="prod-img-logo" src={logo} alt={brand.name} loading="lazy" />
        : <span className="prod-img-brand">{brand ? brand.short : ''}</span>}
      <span className="prod-img-code">{product.code}</span>
    </div>
  );
}

// ── buttons / headings ───────────────────────────────────────────────────────
export function Btn({ variant = 'primary', size = 'md', icon, iconRight, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} className="btn-ir" />}
    </button>
  );
}

export function Kicker({ children, icon }) {
  return (<span className="kicker">{icon && <Icon name={icon} size={14} />}{children}</span>);
}

export function Badge({ kind }) {
  const { t } = useApp();
  if (!kind) return null;
  return <span className={`pbadge pbadge-${kind}`}>{kind === 'bestseller' ? t('badge_best') : t('badge_new')}</span>;
}

export function SectionHead({ kicker, kickerIcon, title, sub, action, onAction }) {
  return (
    <div className="sec-head">
      <Reveal className="sec-head-l">
        {kicker && <Kicker icon={kickerIcon}>{kicker}</Kicker>}
        <h2 className="sec-title">{title}</h2>
        {sub && <p className="sec-sub">{sub}</p>}
      </Reveal>
      {action && (<Reveal delay={120}><Btn variant="ghost" iconRight="arrow" onClick={onAction}>{action}</Btn></Reveal>)}
    </div>
  );
}
