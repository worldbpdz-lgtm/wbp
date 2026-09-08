'use client';
import React from 'react';
import { useApp } from '@/components/ctx';
import { Reveal, Kicker, Icon, Btn } from '@/components/primitives';
import { submitContact } from '@/app/actions';
import { CONTACT } from '@/lib/config';

export default function Contact() {
  const { t, lang, nav, wbp, settings } = useApp();
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [err, setErr] = React.useState('');
  // `website` = piège à robots (honeypot) : invisible pour les humains.
  const [form, setForm] = React.useState({ name: '', company: '', email: '', phone: '', subject: '', message: '', website: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ct = settings?.contact || {};
  const email = ct.email || CONTACT.emailDisplay;
  const phones = (ct.phones && ct.phones.length ? ct.phones : CONTACT.phones).join(' · ');
  const phoneVal = phones + (ct.fax ? `\n${ct.fax}` : '');
  const address = (ct.address && ct.address[lang]) || t('address_v');
  const cards = [
    ['pin', t('c_address'), address, null],
    ['phone', t('c_phone'), phoneVal, `tel:${CONTACT.tel}`],
    ['mail', t('c_email'), email, `mailto:${email}`],
    ['clock', t('c_hours'), t('c_hours_v'), null],
  ];
  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setErr('');
    let ok = false;
    try {
      // L'action renvoie { ok:false, error } — elle ne lève pas d'exception.
      const res = await submitContact(form);
      ok = !!res?.ok;
      if (!ok) setErr(res?.error && res.error !== 'invalid' ? res.error : t('form_invalid'));
    } catch { setErr(t('form_error')); }
    finally { setSending(false); }
    if (!ok) return;
    setSent(true);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ }
  };
  return (
    <main className="page-contact">
      <section className="about-hero contact-hero">
        <div className="hero-aura" />
        <div className="wrap">
          <Reveal><Kicker icon="headset">{t('contact_kicker')}</Kicker></Reveal>
          <Reveal as="h1" className="about-h1" delay={90}>{t('contact_title')}</Reveal>
          <Reveal as="p" className="about-lead" delay={160}>{t('contact_sub')}</Reveal>
        </div>
      </section>
      <div className="wrap contact-layout">
        <div className="contact-info">
          {cards.map(([ic, label, val, href], i) => (
            <Reveal key={i} delay={i * 70}>
              <a className="contact-card" href={href || undefined} onClick={href ? undefined : (e) => e.preventDefault()}>
                <span className="contact-card-ic"><Icon name={ic} size={20} /></span>
                <div><span className="contact-card-l">{label}</span><span className="contact-card-v">{val}</span></div>
              </a>
            </Reveal>
          ))}
          <Reveal delay={300}>
            <a className="btn btn-whatsapp btn-lg contact-wa" href={`https://wa.me/${wbp.WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={20} /><span>{t('whatsapp_chat')}</span>
            </a>
          </Reveal>
        </div>
        <Reveal className="contact-form-wrap" delay={120}>
          {sent ? (
            <div className="contact-sent"><span className="contact-sent-ic"><Icon name="check" size={34} /></span><p>{t('form_sent')}</p><Btn variant="outline" onClick={() => nav('catalog')}>{t('nav_catalog')}</Btn></div>
          ) : (
            <form className="contact-form" onSubmit={submit}>
              <div className="cf-grid">
                <label><span>{t('form_name')}</span><input required value={form.name} onChange={set('name')} /></label>
                <label><span>{t('form_company')}</span><input value={form.company} onChange={set('company')} /></label>
                <label><span>{t('form_email')}</span><input type="email" required value={form.email} onChange={set('email')} /></label>
                <label><span>{t('form_phone')}</span><input value={form.phone} onChange={set('phone')} /></label>
              </div>
              <label><span>{t('form_subject')}</span><input value={form.subject} onChange={set('subject')} /></label>
              <label><span>{t('form_message')}</span><textarea rows={5} required value={form.message} onChange={set('message')} /></label>
              {/* Champ piège : masqué aux humains, aux lecteurs d'écran et à l'auto-remplissage. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </div>
              <button className="btn btn-primary btn-lg" type="submit" disabled={sending}><Icon name="arrow" size={18} /> {sending ? '…' : t('form_send')}</button>
              {err && <p style={{ color: '#e5484d', fontSize: 13, margin: 0 }}>{err}</p>}
            </form>
          )}
        </Reveal>
      </div>
    </main>
  );
}
