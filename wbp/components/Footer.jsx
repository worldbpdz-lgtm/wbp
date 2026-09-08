'use client';
import React, { useState } from 'react';
import { useApp } from '@/components/ctx';
import { Icon } from '@/components/primitives';
import { subscribeNewsletter } from '@/app/actions';
import { CONTACT } from '@/lib/config';

export default function Footer() {
  const { t, lang, nav, wbp, settings, theme } = useApp();
  const [sub, setSub] = useState(false);
  const [already, setAlready] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  return (
    <footer className="ftr">
      <div className="ftr-top">
        <div className="ftr-brand">
          <button className="logo logo-ftr" onClick={() => nav('home')}>
            <img className="logo-img" src={theme === 'light' ? '/logos/wbp1.png' : '/logos/wbp.png'} alt="World Business Plus" width={40} height={40} />
            <span className="logo-txt"><b>World Business</b><i>Plus</i></span>
          </button>
          <p className="ftr-slogan">{t('foot_tag')}</p>
          <div className="ftr-contact">
            <a href={`https://wa.me/${wbp.WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="ftr-wa"><Icon name="whatsapp" size={16} /> +213 559 533 698</a>
            <span><Icon name="mail" size={15} /> {settings?.contact?.email || CONTACT.emailDisplay}</span>
            <span><Icon name="pin" size={15} /> Garidi 1, Kouba — Alger</span>
          </div>
        </div>
        <div className="ftr-cols">
          <div className="ftr-col">
            <h4>{t('foot_shop')}</h4>
            {wbp.categories.slice(0, 5).map((c) => (
              <button key={c.id} onClick={() => nav('catalog', { cat: c.id })}>{c[lang] || c.fr}</button>
            ))}
          </div>
          <div className="ftr-col">
            <h4>{t('foot_company')}</h4>
            <button onClick={() => nav('about')}>{t('nav_about')}</button>
            <button onClick={() => nav('brands')}>{t('nav_brands')}</button>
            <button onClick={() => nav('contact')}>{t('nav_contact')}</button>
            <button onClick={() => nav('catalog')}>{t('nav_catalog')}</button>
          </div>
          <div className="ftr-col ftr-news">
            <h4>{t('foot_newsletter')}</h4>
            <p>{t('foot_news_sub')}</p>
            {sub ? (
              <p className="ftr-news-ok"><Icon name="check" size={15} /> {already ? t('nl_already') : t('foot_check_email')}</p>
            ) : (
              <form className="ftr-form" onSubmit={async (e) => {
                e.preventDefault();
                if (sending) return;
                setSending(true); setErr('');
                try {
                  // L'action renvoie { ok:false, error } — elle ne lève pas d'exception.
                  const r = await subscribeNewsletter(email, lang);
                  if (r?.ok) { setAlready(!!r.already); setSub(true); }
                  else setErr(r?.error && r.error !== 'invalid' ? r.error : t('nl_err'));
                } catch { setErr(t('nl_err')); }
                finally { setSending(false); }
              }}>
                <input type="email" required placeholder="email@exemple.dz" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" disabled={sending}>{sending ? '…' : t('foot_sub')}</button>
              </form>
            )}
            {!sub && err && <p className="nl-err">{err}</p>}
          </div>
        </div>
      </div>
      <div className="ftr-bot">
        <span>© {new Date().getFullYear()} SARL World Business Plus. {t('rights')}</span>
        <span className="ftr-badge"><Icon name="badge" size={14} /> {t('agreed')}</span>
      </div>
    </footer>
  );
}
