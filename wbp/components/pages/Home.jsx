'use client';
import React, { useRef, useState, useEffect } from 'react';
import { useApp } from '@/components/ctx';
import { Reveal, Kicker, Btn, Icon, SectionHead, useCountUp } from '@/components/primitives';
import ProductCard from '@/components/ProductCard';
import { brandLogo, CLIENTS } from '@/lib/logos';
import NewsletterCTA from '@/components/NewsletterCTA';

function HeroStat({ n, suf, label }) {
  const [ref, v] = useCountUp(n, 1500);
  return (<div className="hstat" ref={ref}><span className="hstat-n">{Math.round(v)}{suf}</span><span className="hstat-l">{label}</span></div>);
}

function Hero() {
  const { t, nav, wbp, lang, settings } = useApp();
  const heroOv = (settings?.hero && settings.hero[lang]) || {};
  const videoRef = useRef(null);
  const [videoOk, setVideoOk] = useState(false);
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onData = () => { if (v.videoWidth > 0) setVideoOk(true); };
    v.addEventListener('loadeddata', onData);
    if (v.readyState >= 2) setVideoOk(true);
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    return () => v.removeEventListener('loadeddata', onData);
  }, []);
  const stats = [
    [wbp.brands.length + '', '+', t('stat_brands')],
    ['18', '+', t('stat_clients')],
    ['7', '', t('stat_years')],
    [wbp.products.length + '', '+', t('stat_products')],
  ];
  return (
    <section className="hero hero-video-mode">
      <div className="hero-bg">
        <video ref={videoRef} className={`hero-video ${videoOk ? 'ready' : ''}`} src="/hero-video.mp4" autoPlay muted loop playsInline preload="auto" />
        <div className="hero-fallback" aria-hidden="true">
          <span className="hf-grid" /><span className="hf-blob hf-blob-1" /><span className="hf-blob hf-blob-2" /><span className="hf-scan" /><span className="hf-noise" />
        </div>
        <div className="hero-overlay" />
      </div>
      <div className="hero-inner hero-inner-v">
        <div className="hero-content">
          <Reveal as="div" delay={40}><Kicker icon="bolt">{t('hero_kicker')}</Kicker></Reveal>
          <Reveal as="h1" className="hero-title" delay={120}>{heroOv.title || t('hero_title')}</Reveal>
          <Reveal as="p" className="hero-sub" delay={200}>{heroOv.sub || t('hero_sub')}</Reveal>
          <Reveal className="hero-cta" delay={280}>
            <Btn variant="primary" size="lg" iconRight="arrow" onClick={() => nav('catalog')}>{t('hero_cta1')}</Btn>
            <Btn variant="glass" size="lg" icon="mail" onClick={() => nav('contact')}>{t('hero_cta2')}</Btn>
          </Reveal>
          <Reveal className="hero-stats" delay={360}>
            {stats.map(([n, suf, label], i) => <HeroStat key={i} n={n} suf={suf} label={label} />)}
          </Reveal>
        </div>
      </div>
      <div className="hero-scroll"><span /></div>
    </section>
  );
}

function CategoriesGrid() {
  const { t, nav, lang, wbp } = useApp();
  return (
    <section className="sec sec-cats">
      <div className="wrap">
        <SectionHead kicker={t('sec_cat_kicker')} kickerIcon="layers" title={t('sec_cat_title')} sub={t('sec_cat_sub')} action={t('view_all')} onAction={() => nav('catalog')} />
        <div className="cat-grid">
          {wbp.categories.map((c, i) => {
            const count = wbp.products.filter((p) => p.cat === c.id).length;
            return (
              <Reveal key={c.id} delay={(i % 4) * 60}>
                <button className={`cat-card ${c.image_url ? 'has-img' : ''}`} onClick={() => nav('catalog', { cat: c.id })}>
                  {/* Image uploadée dans /admin/categories ; sinon l'icône seule. */}
                  {c.image_url && (
                    <span className="cat-photo" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.image_url} alt="" loading="lazy" />
                    </span>
                  )}
                  <span className="cat-ico"><Icon name={c.icon} size={26} /></span>
                  <span className="cat-name">{c[lang]}</span>
                  <span className="cat-blurb">{c.blurb[lang] || c.blurb.fr}</span>
                  <span className="cat-foot"><span className="cat-count">{count}</span><Icon name="arrow" size={16} /></span>
                  <span className="cat-shine" />
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BestSellers() {
  const { t, nav, wbp } = useApp();
  // Vitrine choisie dans /admin/showcase, dans l'ordre exact défini par l'admin.
  // Si elle est vide, on retombe sur les best-sellers puis sur le catalogue.
  const items = wbp.showcase(8);
  const trackRef = useRef(null);
  const scroll = (dir) => { const el = trackRef.current; if (!el) return; el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' }); };
  return (
    <section className="sec sec-best">
      <div className="wrap">
        <SectionHead kicker={t('sec_best_kicker')} kickerIcon="bolt" title={t('sec_best_title')} sub={t('sec_best_sub')} action={t('view_all')} onAction={() => nav('catalog')} />
        <div className="carousel">
          <button className="car-nav car-prev" onClick={() => scroll(-1)} aria-label="prev"><Icon name="chevleft" size={20} /></button>
          <div className="car-track" ref={trackRef}>
            {items.map((p, i) => <div className="car-cell" key={p.id}><ProductCard product={p} index={i} /></div>)}
          </div>
          <button className="car-nav car-next" onClick={() => scroll(1)} aria-label="next"><Icon name="chevright" size={20} /></button>
        </div>
      </div>
    </section>
  );
}

function WhyWBP() {
  const { t } = useApp();
  const feats = [['badge', t('why1_t'), t('why1_d')], ['box', t('why2_t'), t('why2_d')], ['headset', t('why3_t'), t('why3_d')], ['truck', t('why4_t'), t('why4_d')]];
  return (
    <section className="sec sec-why">
      <div className="wrap">
        <SectionHead kicker={t('sec_why_kicker')} kickerIcon="shield" title={t('sec_why_title')} />
        <div className="why-grid">
          {feats.map(([ic, ti, de], i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="why-card">
                <span className="why-ico"><Icon name={ic} size={24} /></span>
                <h3>{ti}</h3><p>{de}</p><span className="why-num">0{i + 1}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrandsShowcase() {
  const { t, nav, wbp } = useApp();
  return (
    <section className="sec sec-brands">
      <div className="wrap">
        <SectionHead kicker={t('sec_brand_kicker')} kickerIcon="badge" title={t('sec_brand_title')} sub={t('sec_brand_sub')} action={t('view_all')} onAction={() => nav('brands')} />
        <div className="brand-grid">
          {wbp.brands.map((b, i) => (
            <Reveal key={b.id} delay={(i % 4) * 55}>
              <button className="brand-card" style={{ '--bc': b.color }} onClick={() => nav('catalog', { brand: b.id })}>
                {brandLogo(b)
                  ? <span className="brand-card-logo"><img src={brandLogo(b)} alt={b.name} loading="lazy" /></span>
                  : <span className="brand-card-mark">{b.short.slice(0, 2)}</span>}
                <span className="brand-card-name">{b.name}</span>
                <span className="brand-card-go"><Icon name="arrow" size={15} /></span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClientStrip() {
  const { t } = useApp();
  const row = [...CLIENTS, ...CLIENTS];
  return (
    <section className="sec sec-clients">
      <div className="wrap">
        <Reveal className="clients-head"><Kicker icon="badge">{t('sec_client_kicker')}</Kicker><h2 className="sec-title">{t('sec_client_title')}</h2></Reveal>
      </div>
      <div className="cmarquee"><div className="cmarquee-track">{row.map((c, i) => (
        <span className="client-logo" key={i} title={c.name}><img src={c.logo} alt={c.name} loading="lazy" /></span>
      ))}</div></div>
    </section>
  );
}

export function CTABand() {
  const { t, nav, wbp } = useApp();
  return (
    <section className="sec">
      <div className="wrap">
        <Reveal className="ctaband">
          <div className="ctaband-bg" />
          <div className="ctaband-in">
            <div><h2>{t('cta_band_title')}</h2><p>{t('cta_band_sub')}</p></div>
            <div className="ctaband-actions">
              <Btn variant="light" size="lg" icon="mail" onClick={() => nav('contact')}>{t('hero_cta2')}</Btn>
              <a className="btn btn-whatsapp btn-lg" href={`https://wa.me/${wbp.WHATSAPP}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20} /><span>WhatsApp</span></a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="page-home">
      <Hero /><ClientStrip /><CategoriesGrid /><BestSellers /><BrandsShowcase /><WhyWBP /><NewsletterCTA /><CTABand />
    </main>
  );
}
