'use client';
import React from 'react';
import { useApp } from '@/components/ctx';
import { Reveal, Icon, Stars, fmtRating } from '@/components/primitives';
import ProductCard from '@/components/ProductCard';
import { brandLogo } from '@/lib/logos';
import { subcatsFor, subcatById, resolveSubcat, countSubcats } from '@/lib/subcategories';

export default function Catalog() {
  const { t, lang, route, nav, wbp } = useApp();
  const [cat, setCat] = React.useState(route.params.cat || 'all');
  const [sub, setSub] = React.useState(route.params.sub || 'all');
  const [brand, setBrand] = React.useState(route.params.brand || 'all');
  const [q, setQ] = React.useState(route.params.q || '');
  const [minRating, setMinRating] = React.useState(0);
  const [sort, setSort] = React.useState('relevance');
  const [showFilters, setShowFilters] = React.useState(false);
  const PAGE = 24; // mobile-friendly page size for "load more" pagination
  const [visible, setVisible] = React.useState(PAGE);

  React.useEffect(() => {
    setCat(route.params.cat || 'all'); setSub(route.params.sub || 'all');
    setBrand(route.params.brand || 'all'); setQ(route.params.q || '');
  }, [route.params.cat, route.params.sub, route.params.brand, route.params.q]);
  // Reset the visible window whenever the result set changes (filter / search / sort).
  React.useEffect(() => { setVisible(PAGE); }, [cat, sub, brand, q, minRating, sort]);

  // ── Sous-types (ex. incendie : adressable vs conventionnel) ────────────────
  // Une centrale adressable et une conventionnelle ne se montent pas ensemble :
  // on laisse donc l'utilisateur trancher avant de parcourir la liste.
  const subList = subcatsFor(cat);
  const subCounts = React.useMemo(() => (subList.length ? countSubcats(wbp.products, cat) : {}), [subList.length, wbp.products, cat]);
  const visibleSubs = subList.filter((s) => (subCounts[s.id] || 0) > 0);
  const activeSub = subList.length && sub !== 'all' ? subcatById(cat, sub) : null;
  // Un sous-type qui n'existe pas (URL bricolée, catégorie changée) est ignoré.
  const subFilter = activeSub && (subCounts[activeSub.id] || 0) > 0 ? activeSub.id : null;

  // Changer de catégorie remet toujours le sous-type à zéro : « adressable »
  // n'a aucun sens une fois qu'on est passé sur « Vidéosurveillance ».
  const pickCat = React.useCallback((id) => { setCat(id); setSub('all'); }, []);

  let list = wbp.products.filter((p) => {
    if (cat !== 'all' && p.cat !== cat) return false;
    if (subFilter && resolveSubcat(p) !== subFilter) return false;
    if (brand !== 'all' && p.brand !== brand) return false;
    if (p.rating < minRating) return false;
    if (q.trim()) {
      const s = (p.name + ' ' + p.code + ' ' + (wbp.brandById(p.brand)?.name || '') + ' ' + (wbp.categoryById(p.cat)?.[lang] || '')).toLowerCase();
      if (!q.toLowerCase().split(/\s+/).every((w) => s.includes(w))) return false;
    }
    return true;
  });
  // Ordre de la vitrine (/admin/showcase) : rang 0 devant, puis les produits
  // cochés « ★ mis en avant », puis les best-sellers. Vaut aussi bien pour
  // « tous les produits » que pour les résultats filtrés (catégorie / marque).
  const feat = (p) => (p.featured ? 1 : 0);
  const sorters = {
    relevance: (a, b) => wbp.byPick(a, b) || feat(b) - feat(a) || (b.badge === 'bestseller') - (a.badge === 'bestseller') || b.rating - a.rating,
    rating: (a, b) => b.rating - a.rating,
    az: (a, b) => a.name.localeCompare(b.name),
    new: (a, b) => (b.badge === 'new') - (a.badge === 'new') || b.reviews - a.reviews,
  };
  list = [...list].sort(sorters[sort]);

  const activeCat = cat !== 'all' ? wbp.categoryById(cat) : null;
  const heroTitle = activeCat ? activeCat[lang] : (brand !== 'all' ? wbp.brandById(brand)?.name : t('nav_catalog'));

  const FilterPanel = (
    <div className="cat-filters">
      <div className="filt-block">
        <h4>{t('categories')}</h4>
        <button className={`filt-opt ${cat === 'all' ? 'on' : ''}`} onClick={() => pickCat('all')}>{t('all_categories')}<span>{wbp.products.length}</span></button>
        {wbp.categories.map((c) => (
          <button key={c.id} className={`filt-opt ${cat === c.id ? 'on' : ''}`} onClick={() => pickCat(c.id)}>
            <Icon name={c.icon} size={16} />{c[lang]}<span>{wbp.products.filter((p) => p.cat === c.id).length}</span>
          </button>
        ))}
      </div>
      <div className="filt-block">
        <h4>{t('filter_stars')}</h4>
        <div className="filt-rating">
          {[0, 4, 4.5].map((r) => (
            <button key={r} className={`filt-opt ${minRating === r ? 'on' : ''}`} onClick={() => setMinRating(r)}>
              {r === 0 ? t('all_stars') : <><Stars value={r} size={14} /> {fmtRating(r)}+</>}
            </button>
          ))}
        </div>
      </div>
      <button className="filt-clear" onClick={() => { pickCat('all'); setBrand('all'); setMinRating(0); setQ(''); }}>
        <Icon name="close" size={14} /> {t('clear')}
      </button>
    </div>
  );

  // Rangée de marques : on suit le défilement pour afficher les flèches et les
  // fondus uniquement quand il reste des marques à découvrir.
  const brandRowRef = React.useRef(null);
  const [bScroll, setBScroll] = React.useState({ l: false, r: false });
  const syncBrandScroll = React.useCallback(() => {
    const el = brandRowRef.current; if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const x = Math.abs(el.scrollLeft);           // scrollLeft est négatif en RTL
    setBScroll({ l: x > 4, r: x < max - 4 });
  }, []);
  React.useEffect(() => {
    syncBrandScroll();
    window.addEventListener('resize', syncBrandScroll);
    return () => window.removeEventListener('resize', syncBrandScroll);
  }, [syncBrandScroll, wbp.brands.length]);
  const scrollBrands = (dir) => {
    const el = brandRowRef.current; if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * Math.max(220, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  // Filtre par marque — UNE seule rangée horizontale au-dessus de la barre de
  // recherche : logo réel + nom complet, avec défilement fléché si ça dépasse.
  const BrandBar = wbp.brands.length > 0 && (
    <div className={`brand-bar ${bScroll.l ? 'can-l' : ''} ${bScroll.r ? 'can-r' : ''}`} role="group" aria-label={t('nav_brands')}>
      <span className="brand-bar-label">{t('nav_brands')}</span>
      <div className="brand-bar-scroll">
        <button type="button" className="brand-bar-nav prev" onClick={() => scrollBrands(-1)} aria-label="prev" tabIndex={-1}>
          <Icon name="chevleft" size={16} />
        </button>
        <div className="brand-bar-chips" ref={brandRowRef} onScroll={syncBrandScroll}>
        <button className={`brand-chip brand-chip-all ${brand === 'all' ? 'on' : ''}`} onClick={() => setBrand('all')} aria-pressed={brand === 'all'}>
          <span className="brand-chip-plate brand-chip-mark"><Icon name="layers" size={15} /></span>
          <span className="brand-chip-name">{t('all_brands')}</span>
          <span className="brand-chip-n">{wbp.products.length}</span>
        </button>
        {wbp.brands.map((b) => {
          const logo = brandLogo(b);
          const n = wbp.products.filter((p) => p.brand === b.id).length;
          return (
            <button key={b.id} className={`brand-chip ${brand === b.id ? 'on' : ''}`} style={{ '--bc': b.color }}
              onClick={() => setBrand(b.id)} title={b.name} aria-pressed={brand === b.id}>
              {logo
                ? <span className="brand-chip-plate"><img src={logo} alt="" loading="lazy" /></span>
                : <span className="brand-chip-plate brand-chip-mark">{(b.short || b.name).slice(0, 2)}</span>}
              <span className="brand-chip-name">{b.name}</span>
              <span className="brand-chip-n">{n}</span>
            </button>
          );
        })}
        </div>
        <button type="button" className="brand-bar-nav next" onClick={() => scrollBrands(1)} aria-label="next" tabIndex={-1}>
          <Icon name="chevright" size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <main className="page-catalog">
      <div className="cat-hero">
        <div className="wrap">
          <nav className="crumbs">
            <button onClick={() => nav('home')}>{t('nav_home')}</button><Icon name="chevright" size={13} />
            {subFilter
              ? (<><button onClick={() => setSub('all')}>{heroTitle}</button><Icon name="chevright" size={13} /><span>{activeSub[lang] || activeSub.fr}</span></>)
              : <span>{heroTitle}</span>}
          </nav>
          <Reveal as="h1" className="cat-hero-title">
            {heroTitle}{subFilter && <span className="cat-hero-sub-tag"> · {activeSub[lang] || activeSub.fr}</span>}
          </Reveal>
          {activeCat && (
            <Reveal as="p" className="cat-hero-sub" delay={80}>
              {subFilter
                ? (activeSub.blurb?.[lang] || activeSub.blurb?.fr)
                : (activeCat.blurb[lang] || activeCat.blurb.fr)}
            </Reveal>
          )}
        </div>
      </div>
      <div className="wrap cat-layout">
        <aside className="cat-side">{FilterPanel}</aside>
        <div className="cat-main">
          <div className="catchips">
            <button className={`catchip ${cat === 'all' ? 'on' : ''}`} onClick={() => pickCat('all')}>{t('all_categories')}</button>
            {wbp.categories.map((c) => (
              <button key={c.id} className={`catchip ${cat === c.id ? 'on' : ''}`} onClick={() => pickCat(c.id)}>{c[lang]}</button>
            ))}
          </div>
          {visibleSubs.length > 1 && (
            <div className="subcat-bar" role="group" aria-label={t('sub_type')}>
              <span className="subcat-label"><Icon name="layers" size={14} /> {t('sub_type')}</span>
              <div className="subcat-chips">
                <button type="button" className={`subcat-chip ${!subFilter ? 'on' : ''}`}
                  onClick={() => setSub('all')} aria-pressed={!subFilter}>
                  {t('all_types')}<span className="subcat-n">{wbp.products.filter((p) => p.cat === cat).length}</span>
                </button>
                {visibleSubs.map((s) => (
                  <button key={s.id} type="button" className={`subcat-chip ${subFilter === s.id ? 'on' : ''}`}
                    onClick={() => setSub(subFilter === s.id ? 'all' : s.id)} aria-pressed={subFilter === s.id}
                    title={s.blurb?.[lang] || s.blurb?.fr || ''}>
                    <Icon name={s.icon} size={15} />{s[lang] || s.fr}<span className="subcat-n">{subCounts[s.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {BrandBar}
          <div className="cat-bar">
            <div className="cat-search">
              <Icon name="search" size={17} className="search-ico" />
              <input value={q} placeholder={t('search_ph')} onChange={(e) => setQ(e.target.value)} />
              {q && <button onClick={() => setQ('')} aria-label="clear"><Icon name="close" size={14} /></button>}
            </div>
            <button className="cat-filt-toggle" onClick={() => setShowFilters((s) => !s)}><Icon name="filter" size={16} /> {t('filters')}</button>
            <div className="cat-sort">
              <Icon name="layers" size={15} />
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">{t('sort_relevance')}</option>
                <option value="rating">{t('sort_rating')}</option>
                <option value="az">{t('sort_az')}</option>
                <option value="new">{t('sort_new')}</option>
              </select>
            </div>
          </div>
          <div className="cat-count-row"><span><b>{list.length}</b> {list.length > 1 ? t('results') : t('result_one')}</span></div>
          {showFilters && <div className="cat-filters-mobile">{FilterPanel}</div>}
          {list.length === 0 ? (
            <div className="cat-empty">
              <Icon name="search" size={40} stroke={1.2} /><p>{t('no_results')}</p>
              {subFilter && <button className="cat-more-btn" onClick={() => setSub('all')}>{t('all_types')}</button>}
            </div>
          ) : (
            <>
              <div className="prod-grid">{list.slice(0, visible).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
              {visible < list.length && (
                <div className="cat-more">
                  <button className="cat-more-btn" onClick={() => setVisible((v) => v + PAGE)}>
                    {t('load_more')} <Icon name="chevdown" size={16} />
                  </button>
                  <span className="cat-more-count">{Math.min(visible, list.length)} {t('showing_of')} {list.length}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
