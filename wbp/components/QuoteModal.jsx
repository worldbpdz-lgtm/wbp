'use client';
// ============================================================================
// Formulaire du panier — deux façons d'aller au bout :
//   • « Demander un devis » : le client reçoit nos prix (comme avant) ;
//   • « Commander »        : la commande est enregistrée « À confirmer » et un
//                            conseiller rappelle pour valider prix et livraison.
// Le site reste « prix sur devis » : aucun prix n'est affiché, rien n'est payé
// en ligne. Le client repart avec un numéro (CMD-2026-0012) qu'il peut citer
// au téléphone ou envoyer sur WhatsApp.
// ============================================================================
import React, { useState, useEffect } from 'react';
import { useApp } from '@/components/ctx';
import { Icon } from '@/components/primitives';
import { submitQuote, submitOrder } from '@/app/actions';
import { WILAYAS } from '@/lib/wilayas';

const T = {
  fr: {
    mode_quote_sub: 'Recevoir nos prix par e-mail ou téléphone', mode_order: 'Commander', mode_order_sub: 'Un conseiller vous appelle pour confirmer',
    wilaya: 'Wilaya', city: 'Commune', address: 'Adresse de livraison', receive: 'Réception', dl_delivery: 'Livraison',
    dl_pickup: 'Retrait au dépôt (Kouba)', dl_installation: 'Livraison + installation', order_send: 'Envoyer ma commande',
    order_note: 'Prix et livraison confirmés par téléphone avant toute expédition — rien à payer en ligne.',
    done_order_t: 'Commande enregistrée ✓', done_order: 'Un conseiller vous appelle très vite pour confirmer le prix, le stock et la livraison.',
    done_quote_t: 'Demande envoyée ✓', number: 'Votre numéro', wa: 'Accélérer sur WhatsApp', close: 'Fermer',
    bad_phone: 'Numéro de téléphone invalide.', bad_email: 'Adresse e-mail invalide.', bad_name: 'Indiquez votre nom.',
    too_many: 'Vous avez déjà envoyé plusieurs commandes. Un conseiller vous recontacte très vite.', empty: 'Votre panier est vide.',
    wa_text: (n) => `Bonjour World Business Plus, je viens de passer la commande ${n} sur votre site.`,
    phone_hint: 'Pour vous rappeler et confirmer la commande',
  },
  en: {
    mode_quote_sub: 'Get our prices by e-mail or phone', mode_order: 'Place an order', mode_order_sub: 'An advisor calls you to confirm',
    wilaya: 'Province (wilaya)', city: 'Town', address: 'Delivery address', receive: 'Delivery', dl_delivery: 'Delivery',
    dl_pickup: 'Pick-up at our depot (Kouba)', dl_installation: 'Delivery + installation', order_send: 'Send my order',
    order_note: 'Price and delivery are confirmed by phone before shipping — nothing to pay online.',
    done_order_t: 'Order received ✓', done_order: 'An advisor will call you shortly to confirm price, stock and delivery.',
    done_quote_t: 'Request sent ✓', number: 'Your reference', wa: 'Speed it up on WhatsApp', close: 'Close',
    bad_phone: 'Invalid phone number.', bad_email: 'Invalid e-mail address.', bad_name: 'Please enter your name.',
    too_many: 'You have already sent several orders. An advisor will contact you very soon.', empty: 'Your cart is empty.',
    wa_text: (n) => `Hello World Business Plus, I have just placed order ${n} on your website.`,
    phone_hint: 'So we can call you to confirm the order',
  },
  ar: {
    mode_quote_sub: 'استلم أسعارنا عبر البريد أو الهاتف', mode_order: 'اطلب الآن', mode_order_sub: 'يتصل بك مستشار لتأكيد الطلب',
    wilaya: 'الولاية', city: 'البلدية', address: 'عنوان التوصيل', receive: 'طريقة الاستلام', dl_delivery: 'توصيل',
    dl_pickup: 'استلام من المستودع (القبة)', dl_installation: 'توصيل + تركيب', order_send: 'أرسل طلبي',
    order_note: 'يتم تأكيد السعر والتوصيل عبر الهاتف قبل الإرسال — لا دفع عبر الإنترنت.',
    done_order_t: 'تم تسجيل طلبك ✓', done_order: 'سيتصل بك أحد مستشارينا قريباً لتأكيد السعر والمخزون والتوصيل.',
    done_quote_t: 'تم إرسال الطلب ✓', number: 'رقم طلبك', wa: 'تسريع عبر واتساب', close: 'إغلاق',
    bad_phone: 'رقم الهاتف غير صالح.', bad_email: 'البريد الإلكتروني غير صالح.', bad_name: 'يرجى إدخال اسمك.',
    too_many: 'لقد أرسلت عدة طلبات بالفعل. سيتصل بك مستشار قريباً جداً.', empty: 'سلتك فارغة.',
    wa_text: (n) => `مرحباً World Business Plus، لقد قمت للتو بالطلب ${n} على موقعكم.`,
    phone_hint: 'لنتصل بك ونؤكد الطلب',
  },
};

export default function QuoteModal({ onClose, product = null, qty = 1, mode: initialMode = 'quote' }) {
  const { t, cart, lang, wbp, clearCart } = useApp();
  const L = T[lang] || T.fr;
  const [mode, setMode] = useState(initialMode === 'order' ? 'order' : 'quote');
  // `website` = piège à robots (honeypot) : invisible pour les humains.
  const [form, setForm] = useState({
    customer_name: '', company: '', email: '', phone: '', message: '', website: '',
    wilaya: '', city: '', address: '', delivery_method: 'delivery',
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);      // { kind, number }
  const [err, setErr] = useState('');
  const items = product ? [{ id: product.id, name: product.name, code: product.code, qty }] : cart;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const order = mode === 'order';

  const submit = async (e) => {
    e.preventDefault();
    if (!items.length) { setErr(L.empty); return; }
    setSending(true);
    setErr('');
    try {
      // Les actions renvoient { ok:false, error } — elles ne lèvent pas d'exception.
      const res = order
        ? await submitOrder({ ...form, items: items.map((i) => ({ id: i.id, name: i.name, code: i.code, qty: i.qty })) })
        : await submitQuote({ ...form, items });
      if (res?.ok) {
        setSent({ kind: mode, number: res.number || null });
        // La demande est partie : on vide le panier (pas pour une demande
        // faite depuis une fiche produit, qui n'a pas touché au panier).
        if (!product && clearCart) clearCart();
        return;
      }
      const map = {
        invalid_phone: L.bad_phone, invalid_email: L.bad_email, invalid_name: L.bad_name,
        too_many: L.too_many, empty_cart: L.empty, invalid: t('form_invalid'),
      };
      setErr(map[res?.error] || res?.error || t('form_error'));
    } catch { setErr(t('form_error')); }
    finally { setSending(false); }
  };

  const waNumber = wbp?.WHATSAPP;
  const count = items.reduce((a, c) => a + (c.qty || 1), 0);

  return (
    <div className="fiche-scrim" onClick={onClose}>
      <div className="fiche" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }} role="dialog" aria-modal="true" aria-label={order ? L.mode_order : t('request_quote')}>
        <div className="fiche-hd">
          <div>
            <span className="fiche-kicker"><Icon name={order ? 'cart' : 'mail'} size={15} /> {order ? L.mode_order : t('request_quote')}</span>
            <h3>{t('cart')} · {count}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={L.close}><Icon name="close" size={18} /></button>
        </div>
        <div className="fiche-body" style={{ display: 'block' }}>
          {sent ? (
            <div className="of-done">
              <span className="contact-sent-ic"><Icon name="check" size={34} /></span>
              <h4>{sent.kind === 'order' ? L.done_order_t : L.done_quote_t}</h4>
              <p>{sent.kind === 'order' ? L.done_order : t('form_sent')}</p>
              {sent.number && <div className="of-num"><small>{L.number}</small><b>{sent.number}</b></div>}
              {sent.kind === 'order' && sent.number && waNumber && (
                <a className="btn btn-whatsapp btn-md" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(L.wa_text(sent.number))}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" size={18} /><span>{L.wa}</span>
                </a>
              )}
              <button className="btn btn-outline btn-md" type="button" onClick={onClose}>{L.close}</button>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submit}>
              <div className="of-mode" role="radiogroup" aria-label={t('request_quote')}>
                <button type="button" role="radio" aria-checked={!order} className={!order ? 'on' : ''} onClick={() => setMode('quote')}>
                  <b><Icon name="mail" size={16} /> {t('request_quote')}</b><small>{L.mode_quote_sub}</small>
                </button>
                <button type="button" role="radio" aria-checked={order} className={order ? 'on' : ''} onClick={() => setMode('order')}>
                  <b><Icon name="cart" size={16} /> {L.mode_order}</b><small>{L.mode_order_sub}</small>
                </button>
              </div>
              <div className="cf-grid">
                <label><span>{t('form_name')} <i className="of-req">*</i></span><input required value={form.customer_name} onChange={set('customer_name')} autoComplete="name" /></label>
                <label><span>{t('form_company')}</span><input value={form.company} onChange={set('company')} autoComplete="organization" /></label>
                <label><span>{t('form_phone')}{order && <> <i className="of-req">*</i></>}</span>
                  <input value={form.phone} onChange={set('phone')} required={order} inputMode="tel" autoComplete="tel" placeholder={order ? '0560 00 00 00' : ''} title={order ? L.phone_hint : undefined} />
                </label>
                <label><span>{t('form_email')}{!order && <> <i className="of-req">*</i></>}</span><input type="email" required={!order} value={form.email} onChange={set('email')} autoComplete="email" /></label>
              </div>
              {order && (
                <>
                  <p className="of-legend">{L.receive}</p>
                  <div className="of-dl" role="radiogroup" aria-label={L.receive}>
                    {[['delivery', L.dl_delivery], ['pickup', L.dl_pickup], ['installation', L.dl_installation]].map(([v, label]) => (
                      <button key={v} type="button" role="radio" aria-checked={form.delivery_method === v} className={form.delivery_method === v ? 'on' : ''}
                        onClick={() => setForm((f) => ({ ...f, delivery_method: v }))}>{label}</button>
                    ))}
                  </div>
                  <div className="cf-grid">
                    <label><span>{L.wilaya} <i className="of-req">*</i></span><input required value={form.wilaya} onChange={set('wilaya')} list="of-wilayas" autoComplete="address-level1" /></label>
                    <label><span>{L.city}</span><input value={form.city} onChange={set('city')} autoComplete="address-level2" /></label>
                  </div>
                  <datalist id="of-wilayas">{WILAYAS.map((w) => <option key={w} value={w} />)}</datalist>
                  {form.delivery_method !== 'pickup' && (
                    <label><span>{L.address}</span><input value={form.address} onChange={set('address')} autoComplete="street-address" /></label>
                  )}
                </>
              )}
              <label><span>{t('form_message')}</span><textarea rows={3} value={form.message} onChange={set('message')} /></label>
              {/* Champ piège : masqué aux humains, aux lecteurs d'écran et à l'auto-remplissage. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </div>
              <div className="quote-items">
                {items.map((i) => (<div key={i.id} className="quote-item-line"><span>{i.qty}×</span> {i.name} <i>({i.code})</i></div>))}
              </div>
              {order && <div className="of-note"><Icon name="badge" size={16} /><span>{L.order_note}</span></div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={sending}>
                <Icon name="arrow" size={18} /> {sending ? '…' : order ? L.order_send : t('form_send')}
              </button>
              {err && <p className="of-err" role="alert">{err}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
