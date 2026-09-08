'use client';
import React from 'react';
import { useApp } from '@/components/ctx';
import { Reveal, Icon, Stars, Badge, ProductImage, SectionHead, Btn, fmtRating, scrollTopSmooth } from '@/components/primitives';
import ProductCard from '@/components/ProductCard';
import { submitReview } from '@/app/actions';
import { resolveSubcat, subcatById } from '@/lib/subcategories';

/* ============================================================================
   GALERIE PRODUIT — vrai carrousel
   ----------------------------------------------------------------------------
   Une piste en scroll-snap : le glissement tactile est natif (donc fluide sur
   mobile), et on ajoute par-dessus les flèches, le clavier, le glisser-déposer
   à la souris, la loupe au survol et une vue plein écran.
   ========================================================================== */
function useRtl(ref) {
  const [rtl, setRtl] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    setRtl(getComputedStyle(el).direction === 'rtl');
  }, [ref]);
  return rtl;
}

/* La vue plein écran garde son propre index : le carrousel du fond n'est
   repositionné qu'à la fermeture, pour ne pas l'animer derrière la modale. */
function Lightbox({ shots, start, onClose, alt }) {
  const [n, setN] = React.useState(start);
  const step = React.useCallback((d) => setN((c) => (c + d + shots.length) % shots.length), [shots.length]);

  // Refs pour que le gestionnaire clavier (attaché une seule fois) voie
  // toujours l'index courant et la dernière closure onClose.
  const latest = React.useRef({ n, onClose });
  latest.current = { n, onClose };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); latest.current.onClose(latest.current.n); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [step]);

  const close = () => onClose(n);
  return (
    <div className="lbx" onClick={close} role="dialog" aria-modal="true" aria-label={alt}>
      <button className="lbx-close" onClick={close} aria-label="Fermer"><Icon name="close" size={20} /></button>
      {shots.length > 1 && (
        <button className="lbx-nav prev" aria-label="Précédent"
          onClick={(e) => { e.stopPropagation(); step(-1); }}>
          <Icon name="chevleft" size={26} />
        </button>
      )}
      <img className="lbx-img" src={shots[n]} alt={alt} onClick={(e) => e.stopPropagation()} />
      {shots.length > 1 && (
        <button className="lbx-nav next" aria-label="Suivant"
          onClick={(e) => { e.stopPropagation(); step(1); }}>
          <Icon name="chevright" size={26} />
        </button>
      )}
      {shots.length > 1 && <span className="lbx-count">{n + 1} / {shots.length}</span>}
    </div>
  );
}

function Gallery({ product, brand }) {
  const shots = React.useMemo(() => {
    const imgs = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    if (imgs.length) return imgs;
    return product.image_url ? [product.image_url] : [];
  }, [product.images, product.image_url]);

  const many = shots.length > 1;
  const [i, setI] = React.useState(0);
  const [zoom, setZoom] = React.useState(null);   // { x, y } en %
  const [box, setBox] = React.useState(false);    // plein écran
  const trackRef = React.useRef(null);
  const thumbsRef = React.useRef(null);
  const rtl = useRtl(trackRef);

  React.useEffect(() => { setI(0); setZoom(null); }, [product.id]);

  const goTo = React.useCallback((n, smooth = true) => {
    const el = trackRef.current;
    const next = Math.max(0, Math.min(shots.length - 1, n));
    setI(next);
    if (!el) return;
    // « instant » et pas « auto » : auto délègue au scroll-behavior CSS (smooth).
    el.scrollTo({ left: (rtl ? -1 : 1) * next * el.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
  }, [rtl, shots.length]);

  // La piste fait foi : on lit l'index depuis la position réelle du scroll,
  // ce qui garde les puces et les vignettes justes après un swipe.
  const onScroll = React.useCallback(() => {
    const el = trackRef.current; if (!el || !el.clientWidth) return;
    const n = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    setI((cur) => (n !== cur && n >= 0 && n < shots.length ? n : cur));
  }, [shots.length]);

  // Vignette active toujours visible dans la bande.
  React.useEffect(() => {
    const strip = thumbsRef.current; if (!strip) return;
    const btn = strip.children[i];
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [i]);

  // Glisser-déposer à la souris (le tactile est déjà géré nativement).
  // Un déplacement de 15 % de la largeur suffit à changer de vue : exiger la
  // moitié donnerait l'impression que le glissement « ne prend pas ».
  const drag = React.useRef(null);
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch' || !many) return;
    drag.current = { x: e.clientX, left: trackRef.current.scrollLeft, from: i, moved: false };
    trackRef.current.classList.add('dragging');
  };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    trackRef.current.scrollLeft = d.left - dx;
  };
  const endDrag = (e) => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    const el = trackRef.current;
    el.classList.remove('dragging');
    if (!d.moved) return;
    const dx = (e && typeof e.clientX === 'number' ? e.clientX : d.x) - d.x;
    const step = Math.abs(dx) > el.clientWidth * 0.15 ? (dx < 0 ? 1 : -1) : 0;
    goTo(d.from + (rtl ? -step : step));
  };

  const onKey = (e) => {
    if (!many) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(rtl ? i - 1 : i + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(rtl ? i + 1 : i - 1); }
  };

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  // Aucune photo : on garde le visuel de repli généré (icône + logo de marque).
  if (!shots.length) {
    return (
      <div className="pp-gallery">
        <Reveal className="pp-stage">
          <Badge kind={product.badge} />
          <div className="pp-stage-img"><ProductImage product={product} size="hero" /></div>
          <span className="pp-brand-chip" style={{ '--bc': brand.color }}>{brand.short}</span>
        </Reveal>
      </div>
    );
  }

  return (
    <div className="pp-gallery">
      <Reveal className={`pp-stage ${many ? 'has-nav' : ''}`}>
        <Badge kind={product.badge} />
        <div
          className="pp-track" ref={trackRef} onScroll={onScroll} onKeyDown={onKey}
          tabIndex={0} role="region" aria-roledescription="carousel" aria-label={product.name}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
        >
          {shots.map((src, n) => (
            <div className="pp-slide" key={n} role="group" aria-roledescription="slide"
              aria-label={`${n + 1} / ${shots.length}`}
              onMouseMove={onMove} onMouseLeave={() => setZoom(null)}>
              <img
                src={src} alt={`${product.name} — vue ${n + 1}`} draggable="false"
                loading={n === 0 ? 'eager' : 'lazy'}
                style={n === i && zoom ? { transform: 'scale(2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              />
            </div>
          ))}
        </div>

        {many && (
          <>
            <button type="button" className="pp-arrow prev" onClick={() => goTo(i - 1)} disabled={i === 0} aria-label="Image précédente">
              <Icon name="chevleft" size={20} />
            </button>
            <button type="button" className="pp-arrow next" onClick={() => goTo(i + 1)} disabled={i === shots.length - 1} aria-label="Image suivante">
              <Icon name="chevright" size={20} />
            </button>
            <div className="pp-dots" role="tablist">
              {shots.map((_, n) => (
                <button key={n} type="button" className={`pp-dot ${n === i ? 'on' : ''}`} role="tab"
                  aria-selected={n === i} aria-label={`Image ${n + 1}`} onClick={() => goTo(n)} />
              ))}
            </div>
            <span className="pp-counter">{i + 1} / {shots.length}</span>
          </>
        )}

        <button type="button" className="pp-expand" onClick={() => setBox(true)} aria-label="Agrandir l’image">
          <Icon name="zoom" size={17} />
        </button>
        <span className="pp-brand-chip" style={{ '--bc': brand.color }}>{brand.short}</span>
      </Reveal>

      {many && (
        <div className="pp-thumbs" ref={thumbsRef}>
          {shots.map((src, n) => (
            <button key={n} type="button" className={`pp-thumb ${i === n ? 'on' : ''}`}
              onClick={() => goTo(n)} aria-label={`Voir l’image ${n + 1}`} aria-current={i === n}>
              <img src={src} alt="" loading="lazy" draggable="false" />
            </button>
          ))}
        </div>
      )}

      {box && <Lightbox shots={shots} start={i} alt={product.name}
        onClose={(n) => { setBox(false); goTo(n, false); }} />}
    </div>
  );
}

/* ============================================================================
   RAIL — carrousel horizontal de cartes produit (« Produits similaires »)
   ========================================================================== */
function Rail({ children, label }) {
  const ref = React.useRef(null);
  const [edge, setEdge] = React.useState({ l: false, r: false });

  const sync = React.useCallback(() => {
    const el = ref.current; if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const x = Math.abs(el.scrollLeft);          // scrollLeft est négatif en RTL
    setEdge({ l: x > 6, r: x < max - 6 });
  }, []);

  React.useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync, children]);

  const scroll = (dir) => {
    const el = ref.current; if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const card = el.firstElementChild?.getBoundingClientRect().width || 260;
    const step = Math.max(card + 18, el.clientWidth * 0.8);
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * step, behavior: 'smooth' });
  };

  return (
    <div className={`rail ${edge.l ? 'can-l' : ''} ${edge.r ? 'can-r' : ''}`}>
      <button type="button" className="rail-nav prev" onClick={() => scroll(-1)} aria-label="Précédent" tabIndex={-1}>
        <Icon name="chevleft" size={18} />
      </button>
      <div className="rail-track" ref={ref} onScroll={sync} role="group" aria-label={label}>
        {children}
      </div>
      <button type="button" className="rail-nav next" onClick={() => scroll(1)} aria-label="Suivant" tabIndex={-1}>
        <Icon name="chevright" size={18} />
      </button>
    </div>
  );
}

function FicheModal({ product, brand, onClose }) {
  const { t, lang, wbp } = useApp();
  const cat = wbp.categoryById(product.cat);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fiche-scrim" onClick={onClose}>
      <div className="fiche" onClick={(e) => e.stopPropagation()}>
        <div className="fiche-hd">
          <div><span className="fiche-kicker"><Icon name="pdf" size={15} /> {t('fiche_technique')}</span><h3>{product.name}</h3></div>
          <button className="icon-btn" onClick={onClose} aria-label="close"><Icon name="close" size={18} /></button>
        </div>
        <div className="fiche-body">
          <div className="fiche-img"><ProductImage product={product} size="hero" /></div>
          <div className="fiche-meta">
            <div className="fiche-meta-row"><span>{t('ref')}</span><b>{product.code}</b></div>
            <div className="fiche-meta-row"><span>{t('brands')}</span><b>{brand.name}</b></div>
            <div className="fiche-meta-row"><span>{t('categories')}</span><b>{cat[lang]}</b></div>
            <table className="pp-spec-table fiche-specs"><tbody>{product.specs.map(([k, v], i) => <tr key={i}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
          </div>
        </div>
        <div className="fiche-foot">
          <span><Icon name="badge" size={14} /> World Business Plus — {t('agreed')}</span>
          <button className="btn btn-primary btn-md" onClick={() => window.print()}><Icon name="pdf" size={16} /> PDF</button>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ onSubmit, onCancel }) {
  const { t } = useApp();
  const [rating, setRating] = React.useState(5);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [website, setWebsite] = React.useState('');   // piège à robots (honeypot)
  // Sans ce verrou, un double-clic envoyait deux fois l'avis et consommait le
  // quota anti-spam : le visiteur voyait « trop de tentatives » au lieu du merci.
  const [sending, setSending] = React.useState(false);
  const valid = body.trim().length > 4 && author.trim().length > 1;
  const send = async (e) => {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    try { await onSubmit({ rating, title: title.trim(), body: body.trim(), author: author.trim(), website }); }
    finally { setSending(false); }
  };
  return (
    <form className="rv-form" onSubmit={send}>
      <div className="rv-form-rate"><span>{t('your_rating')}</span><Stars value={rating} size={26} onPick={setRating} /></div>
      <div className="rv-form-grid">
        <input className="rv-input" placeholder={t('your_name')} value={author} onChange={(e) => setAuthor(e.target.value)} />
        <input className="rv-input" placeholder={t('review_title_ph')} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className="rv-input rv-textarea" placeholder={t('review_body_ph')} value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
      {/* Champ piège : masqué aux humains, aux lecteurs d'écran et à l'auto-remplissage. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <div className="rv-form-actions">
        <Btn variant="ghost" onClick={onCancel} type="button">{t('clear')}</Btn>
        <button className="btn btn-primary btn-md" type="submit" disabled={!valid || sending}>{sending ? '…' : t('submit_review')}</button>
      </div>
    </form>
  );
}

function ReviewSystem({ product, initialReviews }) {
  const { t } = useApp();
  const base = initialReviews || [];
  const [helpful, setHelpful] = React.useState({});
  const [filter, setFilter] = React.useState(0);
  const [sort, setSort] = React.useState('recent');
  const [showForm, setShowForm] = React.useState(false);
  const [thanks, setThanks] = React.useState(false);
  const [err, setErr] = React.useState('');

  React.useEffect(() => { setHelpful({}); setFilter(0); setShowForm(false); setThanks(false); setErr(''); }, [product.id]);

  // L'avis n'apparaît publiquement qu'après validation : rien n'est ajouté ici.
  const all = base;
  const dist = [5, 4, 3, 2, 1].map((s) => all.filter((r) => Math.round(r.rating) === s).length);
  const total = all.length || product.reviews;
  const avg = all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : product.rating;

  let view = all.filter((r) => !filter || Math.round(r.rating) === filter);
  const sorters = {
    recent: (a, b) => new Date(b.date) - new Date(a.date),
    helpful: (a, b) => (b.helpful + (helpful[b._id] ? 1 : 0)) - (a.helpful + (helpful[a._id] ? 1 : 0)),
    high: (a, b) => b.rating - a.rating,
    low: (a, b) => a.rating - b.rating,
  };
  view = [...view].sort(sorters[sort]);

  const submit = async (rev) => {
    setErr('');
    let res = null;
    // L'action renvoie { ok:false, error } — elle ne lève pas d'exception.
    try { res = await submitReview({ ...rev, product_id: product.id }); } catch { setErr(t('form_error')); return; }
    if (!res?.ok) { setErr(res?.error && res.error !== 'invalid' ? res.error : t('form_invalid')); return; }
    setShowForm(false); setThanks(true); setTimeout(() => setThanks(false), 4000);
  };

  return (
    <div className="rv">
      <SectionHead kicker={t('sec_client_kicker')} kickerIcon="badge" title={t('reviews_title')} />
      <div className="rv-top">
        <Reveal className="rv-summary">
          <div className="rv-avg">
            <span className="rv-avg-n">{fmtRating(avg)}</span>
            <Stars value={avg} size={20} />
            <span className="rv-avg-c">{t('reviews_sub')} {total} {total > 1 ? t('reviews') : t('review_one')}</span>
          </div>
          <div className="rv-bars">
            {[5, 4, 3, 2, 1].map((s, i) => {
              const c = dist[i]; const pct = total ? (c / Math.max(total, all.length)) * 100 : 0;
              return (
                <button key={s} className={`rv-bar ${filter === s ? 'on' : ''}`} onClick={() => setFilter(filter === s ? 0 : s)}>
                  <span className="rv-bar-l">{s} <Icon name="star" size={12} style={{ color: 'var(--star)' }} /></span>
                  <span className="rv-bar-track"><span className="rv-bar-fill" style={{ width: pct + '%' }} /></span>
                  <span className="rv-bar-c">{c}</span>
                </button>
              );
            })}
          </div>
          <Btn variant="primary" icon="plus" onClick={() => setShowForm((s) => !s)}>{t('write_review')}</Btn>
        </Reveal>
        <div className="rv-list-col">
          <div className="rv-toolbar">
            <div className="rv-filter-chips">
              <button className={`rv-chip ${filter === 0 ? 'on' : ''}`} onClick={() => setFilter(0)}>{t('all_stars')}</button>
              {[5, 4, 3].map((s) => (<button key={s} className={`rv-chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(filter === s ? 0 : s)}>{s} ★</button>))}
            </div>
            <div className="rv-sort">
              <Icon name="layers" size={14} />
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">{t('sort_recent')}</option>
                <option value="helpful">{t('sort_helpful')}</option>
                <option value="high">{t('sort_high')}</option>
                <option value="low">{t('sort_low')}</option>
              </select>
            </div>
          </div>
          {thanks && <div className="rv-thanks"><Icon name="check" size={16} /> {t('review_thanks')}</div>}
          {err && <p style={{ color: '#e5484d', fontSize: 13, padding: '4px 2px' }}>{err}</p>}
          {showForm && <ReviewForm onSubmit={submit} onCancel={() => setShowForm(false)} />}
          <div className="rv-list">
            {view.length === 0 && <p className="sec-sub" style={{ padding: '8px 2px' }}>{t('reviews_sub')} 0 {t('reviews')}.</p>}
            {view.map((r) => {
              const voted = !!helpful[r._id];
              return (
                <Reveal className="rv-item" key={r._id}>
                  <div className="rv-item-hd">
                    <span className="rv-ava">{r.author.slice(0, 1)}</span>
                    <div className="rv-who"><b>{r.author}</b>{r.verified && <span className="rv-verified"><Icon name="check" size={12} /> {t('verified')}</span>}</div>
                    <span className="rv-date">{new Date(r.date).toLocaleDateString(t.lang === 'ar' ? 'ar' : (t.lang === 'en' ? 'en-GB' : 'fr-FR'), { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="rv-item-stars"><Stars value={r.rating} size={14} /></div>
                  {r.title && <h4 className="rv-item-title">{r.title}</h4>}
                  <p className="rv-item-body">{r.body}</p>
                  <div className="rv-item-foot">
                    <span className="rv-helpq">{t('was_helpful')}</span>
                    <button className={`rv-help ${voted ? 'on' : ''}`} onClick={() => setHelpful((h) => ({ ...h, [r._id]: !h[r._id] }))}>
                      <Icon name="check" size={14} /> {t('helpful')} ({r.helpful + (voted ? 1 : 0)})
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Product({ product, initialReviews }) {
  const { t, lang, nav, addToCart, wbp } = useApp();
  const brand = wbp.brandById(product.brand);
  const cat = wbp.categoryById(product.cat);
  const [qty, setQty] = React.useState(1);
  const [tab, setTab] = React.useState('overview');
  const [added, setAdded] = React.useState(false);
  const [ficheOpen, setFicheOpen] = React.useState(false);
  const reviewsRef = React.useRef(null);

  React.useEffect(() => { setQty(1); setTab('overview'); scrollTopSmooth(); }, [product.id]);

  // Sous-type (ex. incendie adressable / conventionnel) : deux systèmes qui ne
  // se montent pas ensemble, on le signale et on privilégie les mêmes en bas.
  const subId = resolveSubcat(product);
  const sub = subId ? subcatById(product.cat, subId) : null;

  // « Similaires » : même sous-type d'abord, puis même marque, puis le reste de
  // la catégorie. Jusqu'à 12 références — le rail en montre autant qu'il peut.
  const similar = React.useMemo(() => {
    const pool = wbp.products.filter((p) => p.cat === product.cat && p.id !== product.id);
    const score = (p) => (subId && resolveSubcat(p) === subId ? 4 : 0) + (p.brand === product.brand ? 2 : 0) + (p.badge === 'bestseller' ? 1 : 0);
    return [...pool].sort((a, b) => score(b) - score(a) || b.rating - a.rating).slice(0, 12);
  }, [wbp.products, product.cat, product.id, product.brand, subId]);

  const waText = encodeURIComponent(`Bonjour World Business Plus,\nJe suis intéressé par : ${product.name} (${product.code}).\nQuantité souhaitée : ${qty}.\nMerci de m'envoyer un devis.`);
  const waLink = `https://wa.me/${wbp.WHATSAPP}?text=${waText}`;
  const tag = product.tag[lang] || product.tag.fr;

  return (
    <main className="page-product">
      <div className="wrap">
        <nav className="crumbs pp-crumbs">
          <button onClick={() => nav('home')}>{t('nav_home')}</button><Icon name="chevright" size={13} />
          <button onClick={() => nav('catalog', { cat: product.cat })}>{cat[lang]}</button><Icon name="chevright" size={13} />
          {sub && (<><button onClick={() => nav('catalog', { cat: product.cat, sub: sub.id })}>{sub[lang] || sub.fr}</button><Icon name="chevright" size={13} /></>)}
          <span>{product.code}</span>
        </nav>
        <div className="pp-top">
          <Gallery product={product} brand={brand} />
          <div className="pp-info">
            <Reveal as="div" className="pp-info-head">
              <div className="pp-brand-row">
                <span className="pp-brand-tag" style={{ '--bc': brand.color }} onClick={() => nav('catalog', { brand: brand.id })}>{brand.name}</span>
                <span className="pp-stock"><span className="dot" /> {t('in_stock')}</span>
              </div>
              <h1 className="pp-title">{product.name}</h1>
              <p className="pp-tag">{tag}</p>
              <button className="pp-rating-link" onClick={() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {product.rating > 0
                  ? (<><Stars value={product.rating} size={16} /><b>{fmtRating(product.rating)}</b><span>· {product.reviews} {product.reviews > 1 ? t('reviews') : t('review_one')}</span></>)
                  : (<span>{t('write_review')}</span>)}
              </button>
            </Reveal>
            <Reveal className="pp-price-card" delay={80}>
              <div className="pp-price-row">
                <div><span className="pp-price">{t('price_quote')}</span><span className="pp-price-note"><Icon name="badge" size={13} /> {t('quote_model')}</span></div>
                <div className="pp-qty">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="-"><Icon name="minus" size={15} /></button>
                  <span>{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="+"><Icon name="plus" size={15} /></button>
                </div>
              </div>
              <div className="pp-actions">
                <button className="btn btn-primary btn-lg pp-add" onClick={() => { addToCart(product, qty); setAdded(true); setTimeout(() => setAdded(false), 1400); }}>
                  <Icon name={added ? 'check' : 'cart'} size={19} /><span>{added ? t('added') : t('add_to_cart')}</span>
                </button>
                <a className="btn btn-whatsapp btn-lg pp-wa" href={waLink} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={19} /><span>{t('shop_whatsapp')}</span></a>
              </div>
              <div className="pp-mini-actions">
                <button className="pp-mini-btn" onClick={() => setFicheOpen(true)}><Icon name="pdf" size={15} /> {t('fiche_technique')}</button>
                <button className="pp-mini-btn" onClick={() => nav('catalog', { cat: product.cat })}><Icon name="layers" size={15} /> {cat[lang]}</button>
                {sub && <button className="pp-mini-btn" onClick={() => nav('catalog', { cat: product.cat, sub: sub.id })}><Icon name={sub.icon} size={15} /> {sub[lang] || sub.fr}</button>}
                <button className="pp-mini-btn" aria-label={t('save')}><Icon name="heart" size={15} /> {t('save')}</button>
              </div>
            </Reveal>
            <Reveal className="pp-trust" delay={140}>
              <div className="pp-trust-item"><span className="pp-trust-ic"><Icon name="badge" size={17} /></span><span>{t('agreed')}</span></div>
              <div className="pp-trust-item"><span className="pp-trust-ic"><Icon name="headset" size={17} /></span><span>{t('why3_t')}</span></div>
              <div className="pp-trust-item"><span className="pp-trust-ic"><Icon name="truck" size={17} /></span><span>{t('why4_t')}</span></div>
            </Reveal>
          </div>
        </div>
        <div className="pp-tabs-wrap">
          <div className="pp-tabs">
            {['overview', 'specifications', 'documents'].map((tb) => (<button key={tb} className={`pp-tab ${tab === tb ? 'on' : ''}`} onClick={() => setTab(tb)}>{t(tb)}</button>))}
          </div>
          <div className="pp-tab-body">
            {tab === 'overview' && (
              <div className="pp-overview">
                <p className="pp-desc">{t('desc_generic')}</p>
                <div className="pp-highlights">
                  {product.specs.slice(0, 4).map(([k, v], i) => (<div className="pp-hl" key={i}><span className="pp-hl-k">{k}</span><span className="pp-hl-v">{v}</span></div>))}
                </div>
              </div>
            )}
            {tab === 'specifications' && (
              <table className="pp-spec-table"><tbody>
                {product.specs.map(([k, v], i) => (<tr key={i}><th>{k}</th><td>{v}</td></tr>))}
                <tr><th>{t('ref')}</th><td>{product.code}</td></tr>
                <tr><th>{t('brands')}</th><td>{brand.name}</td></tr>
              </tbody></table>
            )}
            {tab === 'documents' && (
              <div className="pp-docs">
                <button className="pp-doc" onClick={() => setFicheOpen(true)}>
                  <span className="pp-doc-ic"><Icon name="pdf" size={22} /></span>
                  <span className="pp-doc-txt"><b>{t('fiche_technique')}</b><i>{product.code}.pdf</i></span><Icon name="arrow" size={16} />
                </button>
                <a className="pp-doc" href={waLink} target="_blank" rel="noopener noreferrer">
                  <span className="pp-doc-ic"><Icon name="whatsapp" size={22} /></span>
                  <span className="pp-doc-txt"><b>{t('whatsapp_chat')}</b><i>commercial@wbp-dz.com</i></span><Icon name="arrow" size={16} />
                </a>
              </div>
            )}
          </div>
        </div>
        {similar.length > 0 && (
          <section className="pp-similar">
            <SectionHead kicker={cat[lang]} kickerIcon={cat.icon} title={t('similar')}
              action={t('view_all')} onAction={() => nav('catalog', { cat: product.cat, ...(sub ? { sub: sub.id } : {}) })} />
            <Rail label={t('similar')}>
              {similar.map((p) => (<div className="rail-item" key={p.id}><ProductCard product={p} index={0} /></div>))}
            </Rail>
          </section>
        )}
        <section className="pp-reviews" ref={reviewsRef}><ReviewSystem product={product} initialReviews={initialReviews} /></section>
      </div>
      <div className="pp-sticky-cta">
        <button className="btn btn-primary btn-lg" onClick={() => { addToCart(product, qty); setAdded(true); setTimeout(() => setAdded(false), 1400); }}>
          <Icon name={added ? 'check' : 'cart'} size={19} /><span>{added ? t('added') : t('add_to_cart')}</span>
        </button>
        <a className="btn btn-whatsapp btn-lg" href={waLink} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size={19} /><span>WhatsApp</span>
        </a>
      </div>
      {ficheOpen && <FicheModal product={product} brand={brand} onClose={() => setFicheOpen(false)} />}
    </main>
  );
}
