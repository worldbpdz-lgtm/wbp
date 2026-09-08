'use client';
import React, { useState } from 'react';
import { useApp } from '@/components/ctx';
import { Icon } from '@/components/primitives';
import { subscribeNewsletter } from '@/app/actions';

// Inline newsletter sign-up banner (home + reusable). Double opt-in: shows a
// "check your inbox" confirmation after submit. Mobile-first, RTL-aware.
export default function NewsletterCTA() {
  const { t, lang } = useApp();
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | ok | error
  const [already, setAlready] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setErr('');
    try {
      // L'action renvoie { ok:false, error } — elle ne lève pas d'exception.
      const r = await subscribeNewsletter(email, lang);
      if (r && r.ok) { setAlready(!!r.already); setState('ok'); }
      else { setErr(r?.error && r.error !== 'invalid' ? r.error : t('nl_err')); setState('error'); }
    } catch { setErr(t('nl_err')); setState('error'); }
  };
  return (
    <section className="sec nl-sec">
      <div className="wrap">
        <div className="nl-card">
          <div className="nl-card-txt">
            <span className="kicker"><Icon name="mail" size={14} /> {t('nl_kicker')}</span>
            <h2 className="nl-title">{t('nl_title')}</h2>
            <p className="nl-sub">{t('nl_sub')}</p>
          </div>
          {state === 'ok' ? (
            <div className="nl-ok"><Icon name="check" size={20} /> <span>{already ? t('nl_already') : t('foot_check_email')}</span></div>
          ) : (
            <form className="nl-form" onSubmit={submit} noValidate>
              <div className="nl-field">
                <Icon name="mail" size={18} className="nl-field-ic" />
                <input type="email" required placeholder={t('nl_ph')} value={email}
                  onChange={(e) => setEmail(e.target.value)} aria-label={t('nl_ph')} />
              </div>
              <button type="submit" className="btn btn-primary btn-lg nl-btn" disabled={state === 'sending'}>
                <span>{state === 'sending' ? '…' : t('foot_sub')}</span><Icon name="arrow" size={17} />
              </button>
              {state === 'error' && <span className="nl-err">{err || t('nl_err')}</span>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
