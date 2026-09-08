'use client';
// ============================================================================
// Pop-up newsletter — s'affiche une fois à l'ouverture du site.
// ----------------------------------------------------------------------------
//  • apparaît après un court délai (réglable dans /admin/settings)
//  • ne revient pas avant N jours après une fermeture, et jamais après une
//    inscription réussie (mémorisé dans localStorage)
//  • fermeture : croix, clic sur le fond, ou touche Échap ; focus piégé dans la
//    carte, focus rendu à l'élément précédent à la fermeture
//  • carte colorée : dégradé de marque, halo animé, liste d'avantages, RTL
//  • sur mobile, s'affiche comme une feuille qui monte du bas
// ============================================================================
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '@/components/ctx';
import { Icon } from '@/components/primitives';
import { subscribeNewsletter } from '@/app/actions';

const KEY = 'wbp_nlpop';

function readState() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeState(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* mode privé */ }
}

export default function NewsletterPopup() {
  const { t, lang, settings, nav } = useApp();
  const cfg = settings?.popup || {};
  const enabled = cfg.enabled !== false;
  const delay = Math.max(300, Number(cfg.delay) || 2200);
  // `Number(undefined)` vaut NaN, et NaN n'est ni null ni undefined : le `??`
  // ne rattrapait donc rien et `days` restait NaN quand le réglage était absent.
  // La comparaison `Date.now() - closedAt < NaN` étant toujours fausse, le
  // pop-up réapparaissait à CHAQUE visite malgré la fermeture par le visiteur.
  const days = Math.max(0, Number(cfg.days ?? 7) || 0);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');   // idle | sending | ok | error
  const [already, setAlready] = useState(false);
  const [err, setErr] = useState('');
  const card = useRef(null);
  const restoreFocus = useRef(null);

  const pick = (obj, fb = '') => (obj && (obj[lang] || obj.fr)) || fb;

  // ---- Déclenchement -------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const st = readState();
    if (st.subscribed) return;                                  // déjà inscrit
    if (st.closedAt && days > 0 && Date.now() - st.closedAt < days * 864e5) return;
    const timer = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(timer);
  }, [enabled, delay, days]);

  const close = useCallback((remember = true) => {
    setOpen(false);
    if (remember) writeState({ ...readState(), closedAt: Date.now() });
    const el = restoreFocus.current;
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0);
  }, []);

  // ---- Échap, focus, scroll ------------------------------------------------
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !card.current) return;
      const nodes = card.current.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])');
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const focusTimer = setTimeout(() => {
      card.current?.querySelector('input[type=email]')?.focus({ preventScroll: true });
    }, 420);

    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const submit = async (e) => {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setErr('');
    try {
      // L'action renvoie { ok:false, error } — elle ne lève pas d'exception.
      const r = await subscribeNewsletter(email, lang);
      if (r?.ok) {
        setAlready(!!r.already);
        setState('ok');
        // On ne mémorise l'inscription que si elle a réellement eu lieu.
        if (r.pending || r.already) writeState({ ...readState(), subscribed: true, closedAt: Date.now() });
        else writeState({ ...readState(), closedAt: Date.now() });
        setTimeout(() => close(false), 3800);
      } else { setErr(r?.error && r.error !== 'invalid' ? r.error : t('nl_err')); setState('error'); }
    } catch { setErr(t('nl_err')); setState('error'); }
  };

  if (!open) return null;
  const perks = (cfg.perks && (cfg.perks[lang] || cfg.perks.fr)) || [];

  return (
    <div className="nlpop-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="nlpop" role="dialog" aria-modal="true" aria-labelledby="nlpop-title" ref={card}>
        <button className="nlpop-x" onClick={() => close()} aria-label={t('clear') || 'Fermer'}>
          <Icon name="close" size={17} />
        </button>

        {/* Colonne visuelle */}
        <div className="nlpop-art" aria-hidden="true">
          <span className="nlpop-blob b1" /><span className="nlpop-blob b2" /><span className="nlpop-blob b3" />
          <span className="nlpop-grid" />
          {cfg.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="nlpop-photo" src={cfg.image_url} alt="" />
          ) : (
            <span className="nlpop-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/wbp.png" alt="" width={62} height={62} />
            </span>
          )}
          <span className="nlpop-shine" />
        </div>

        {/* Colonne contenu */}
        <div className="nlpop-body">
          {state === 'ok' ? (
            <div className="nlpop-done">
              <span className="nlpop-done-ic"><Icon name="check" size={30} /></span>
              <h3>{t('foot_subscribed')}</h3>
              <p>{already ? t('nl_already') : t('foot_check_email')}</p>
              <button className="btn btn-primary btn-md" onClick={() => close(false)}>{t('explore')}</button>
            </div>
          ) : (
            <>
              <span className="nlpop-kicker"><Icon name="mail" size={13} /> {t('nl_kicker')}</span>
              <h2 className="nlpop-title" id="nlpop-title">{pick(cfg.title, t('nl_title'))}</h2>
              <p className="nlpop-sub">{pick(cfg.sub, t('nl_sub'))}</p>

              {perks.length > 0 && (
                <ul className="nlpop-perks">
                  {perks.slice(0, 4).map((p, i) => (
                    <li key={i} style={{ '--d': `${i * 70 + 240}ms` }}>
                      <span className="nlpop-tick"><Icon name="check" size={12} /></span>{p}
                    </li>
                  ))}
                </ul>
              )}

              <form className="nlpop-form" onSubmit={submit} noValidate>
                <div className="nlpop-field">
                  <Icon name="mail" size={17} className="nlpop-field-ic" />
                  <input type="email" required value={email} placeholder={t('nl_ph')}
                    onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
                    aria-label={t('nl_ph')} autoComplete="email" />
                </div>
                <button type="submit" className="btn btn-primary btn-lg nlpop-cta" disabled={state === 'sending'}>
                  <span>{state === 'sending' ? '…' : pick(cfg.cta, t('foot_sub'))}</span>
                  <Icon name="arrow" size={17} />
                </button>
                {state === 'error' && <span className="nlpop-err">{err || t('nl_err')}</span>}
              </form>

              <div className="nlpop-foot">
                <button type="button" className="nlpop-later" onClick={() => close()}>
                  {lang === 'ar' ? 'ليس الآن' : lang === 'en' ? 'Maybe later' : 'Plus tard'}
                </button>
                <button type="button" className="nlpop-link" onClick={() => { close(false); nav('catalog'); }}>
                  {t('hero_cta1')} <Icon name="arrow" size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
