'use client';
import React, { useState } from 'react';
import { useApp } from '@/components/ctx';
import { Icon, ProductImage, Btn } from '@/components/primitives';
import QuoteModal from '@/components/QuoteModal';
import QtyField from '@/components/QtyField';

export default function CartDrawer() {
  const { t, cart, cartOpen, setCartOpen, removeFromCart, setQty, nav, wbp } = useApp();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const count = cart.reduce((a, c) => a + c.qty, 0);
  const waText = encodeURIComponent(
    `Bonjour World Business Plus,\nJe souhaite un devis pour :\n` +
    cart.map((c) => `• ${c.qty}× ${c.name} (${c.code})`).join('\n') + `\nMerci.`
  );
  const waLink = `https://wa.me/${wbp.WHATSAPP}?text=${waText}`;
  return (
    <>
      <div className={`scrim ${cartOpen ? 'show' : ''}`} onClick={() => setCartOpen(false)} />
      <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`} aria-hidden={!cartOpen}>
        <div className="cart-hd">
          <h3><Icon name="cart" size={18} /> {t('cart')} <span className="cart-hd-n">{count}</span></h3>
          <button className="icon-btn" onClick={() => setCartOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        {cart.length === 0 ? (
          <div className="cart-empty">
            <Icon name="cart" size={44} stroke={1.2} />
            <p>{t('cart_empty')}</p>
            <Btn variant="primary" onClick={() => { setCartOpen(false); nav('catalog'); }}>{t('nav_catalog')}</Btn>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cart.map((c) => (
                <div className="cart-item" key={c.id}>
                  <div className="cart-item-img"><ProductImage product={wbp.productById(c.id) || c} /></div>
                  <div className="cart-item-info">
                    <button className="cart-item-name" onClick={() => { setCartOpen(false); nav('product', { id: c.id }); }}>{c.name}</button>
                    <span className="cart-item-code">{c.code}</span>
                    <div className="cart-item-row">
                      {/* min=0 : le « − » à 1 retire la ligne du panier, comme
                          avant — et taper 0 fait la même chose. */}
                      <QtyField
                        className="qty"
                        size={14}
                        value={c.qty}
                        min={0}
                        onChange={(n) => setQty(c.id, n)}
                        label={`${t('quantity')} — ${c.name}`}
                      />
                      <button className="cart-item-del" onClick={() => removeFromCart(c.id)} aria-label="remove"><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-foot">
              <div className="cart-foot-note"><Icon name="badge" size={15} /> {t('price_quote')}</div>
              <Btn variant="primary" icon="mail" onClick={() => setQuoteOpen(true)}>{t('request_quote')}</Btn>
              <a className="btn btn-whatsapp btn-md cart-wa" href={waLink} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={18} /><span>{t('shop_whatsapp')}</span>
              </a>
            </div>
          </>
        )}
      </aside>
      {quoteOpen && <QuoteModal onClose={() => setQuoteOpen(false)} />}
    </>
  );
}
