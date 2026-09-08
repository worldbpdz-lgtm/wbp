'use client';
import React, { useState, useEffect } from 'react';
import { useApp } from '@/components/ctx';
import { Icon } from '@/components/primitives';
import { submitQuote } from '@/app/actions';

export default function QuoteModal({ onClose, product = null, qty = 1 }) {
  const { t, cart } = useApp();
  // `website` = piège à robots (honeypot) : invisible pour les humains.
  const [form, setForm] = useState({ customer_name: '', company: '', email: '', phone: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const items = product ? [{ id: product.id, name: product.name, code: product.code, qty }] : cart;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setErr('');
    try {
      // L'action renvoie { ok:false, error } — elle ne lève pas d'exception.
      const res = await submitQuote({ ...form, items });
      if (res?.ok) setSent(true);
      else setErr(res?.error && res.error !== 'invalid' ? res.error : t('form_invalid'));
    } catch { setErr(t('form_error')); }
    finally { setSending(false); }
  };
  return (
    <div className="fiche-scrim" onClick={onClose}>
      <div className="fiche" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="fiche-hd">
          <div>
            <span className="fiche-kicker"><Icon name="mail" size={15} /> {t('request_quote')}</span>
            <h3>{t('cart')} · {items.reduce((a, c) => a + (c.qty || 1), 0)}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="close"><Icon name="close" size={18} /></button>
        </div>
        <div className="fiche-body" style={{ display: 'block' }}>
          {sent ? (
            <div className="contact-sent" style={{ padding: '20px 0' }}>
              <span className="contact-sent-ic"><Icon name="check" size={34} /></span>
              <p>{t('form_sent')}</p>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submit}>
              <div className="cf-grid">
                <label><span>{t('form_name')}</span><input required value={form.customer_name} onChange={set('customer_name')} /></label>
                <label><span>{t('form_company')}</span><input value={form.company} onChange={set('company')} /></label>
                <label><span>{t('form_email')}</span><input type="email" required value={form.email} onChange={set('email')} /></label>
                <label><span>{t('form_phone')}</span><input value={form.phone} onChange={set('phone')} /></label>
              </div>
              <label><span>{t('form_message')}</span><textarea rows={3} value={form.message} onChange={set('message')} /></label>
              {/* Champ piège : masqué aux humains, aux lecteurs d'écran et à l'auto-remplissage. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </div>
              <div className="quote-items">
                {items.map((i) => (<div key={i.id} className="quote-item-line"><span>{i.qty}×</span> {i.name} <i>({i.code})</i></div>))}
              </div>
              <button className="btn btn-primary btn-lg" type="submit" disabled={sending}>
                <Icon name="arrow" size={18} /> {sending ? '…' : t('form_send')}
              </button>
              {err && <p style={{ color: '#e5484d', fontSize: 13, margin: 0 }}>{err}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
