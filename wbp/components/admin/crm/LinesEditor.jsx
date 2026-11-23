'use client';
// ============================================================================
// Lignes d'un devis ou d'une commande + bloc des montants (remise, livraison,
// TVA). Partagé par les fiches commande et devis du back-office.
//
// Les montants affichés sont calculés ici à chaque frappe (lib/pricing.js),
// mais ce n'est qu'un aperçu : le serveur recalcule tout à l'enregistrement.
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/primitives';
import { computeTotals, lineTotal, dzd, parseNumber } from '@/lib/pricing';
import { lineKey } from '@/lib/crm';
import { searchProducts, searchCustomers } from '@/app/admin/crm-actions';

// ----------------------------------------------------- recherche (générique) --
function usePicker(search) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); return undefined; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await search(term);
        if (my === seq.current) { setItems(r?.items || []); setActive(0); }
      } catch { if (my === seq.current) setItems([]); }
      finally { if (my === seq.current) setBusy(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, search]);
  return { q, setQ, items, open, setOpen, busy, active, setActive };
}

function PickList({ p, render, onPick, empty }) {
  if (!p.open || p.q.trim().length < 2) return null;
  return (
    <div className="crm-pick-list" role="listbox">
      {p.busy && !p.items.length && <div className="empty">Recherche…</div>}
      {!p.busy && !p.items.length && <div className="empty">{empty}</div>}
      {p.items.map((it, i) => (
        <button type="button" key={it.id} className={i === p.active ? 'on' : ''}
          onMouseDown={(e) => { e.preventDefault(); onPick(it); }}
          onMouseEnter={() => p.setActive(i)}>
          {render(it)}
        </button>
      ))}
    </div>
  );
}

const keyNav = (p, onPick) => (e) => {
  if (!p.items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); p.setActive((a) => Math.min(a + 1, p.items.length - 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); p.setActive((a) => Math.max(a - 1, 0)); }
  else if (e.key === 'Enter') { e.preventDefault(); onPick(p.items[p.active]); }
  else if (e.key === 'Escape') p.setOpen(false);
};

// ------------------------------------------------------- sélecteur produit --
export function ProductPicker({ onPick, placeholder = 'Ajouter un produit : nom ou référence…' }) {
  const p = usePicker(searchProducts);
  const pick = (it) => { if (!it) return; onPick(it); p.setQ(''); p.setOpen(false); };
  return (
    <div className="crm-pick">
      <input value={p.q} placeholder={placeholder} aria-label="Rechercher un produit"
        onChange={(e) => { p.setQ(e.target.value); p.setOpen(true); }}
        onFocus={() => p.setOpen(true)} onBlur={() => setTimeout(() => p.setOpen(false), 150)}
        onKeyDown={keyNav(p, pick)} />
      <PickList p={p} onPick={pick} empty="Aucun produit trouvé — ajoutez une ligne libre."
        render={(it) => (<>
          {it.image_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={it.image_url} alt="" loading="lazy" />
            : <span className="ph" />}
          <span className="tx"><b>{it.name}</b><small>{it.code}{it.active === false ? ' · masqué sur le site' : ''}</small></span>
          <span className="pr">{it.price != null ? dzd(it.price) : 'sans prix'}</span>
        </>)} />
    </div>
  );
}

// -------------------------------------------------------- sélecteur client --
export function CustomerPicker({ onPick, placeholder = 'Rechercher une fiche client : nom, société, téléphone…' }) {
  const p = usePicker(searchCustomers);
  const pick = (it) => { if (!it) return; onPick(it); p.setQ(''); p.setOpen(false); };
  return (
    <div className="crm-pick">
      <input value={p.q} placeholder={placeholder} aria-label="Rechercher un client"
        onChange={(e) => { p.setQ(e.target.value); p.setOpen(true); }}
        onFocus={() => p.setOpen(true)} onBlur={() => setTimeout(() => p.setOpen(false), 150)}
        onKeyDown={keyNav(p, pick)}
        style={{ font: 'inherit', fontSize: 13.5, width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }} />
      <PickList p={p} onPick={pick} empty="Aucune fiche trouvée."
        render={(it) => (<>
          <span className="ph" style={{ display: 'grid', placeItems: 'center' }}><Icon name="user" size={17} /></span>
          <span className="tx"><b>{it.company || it.name || 'Sans nom'}</b><small>{[it.company && it.name, it.phone, it.email, it.wilaya].filter(Boolean).join(' · ')}</small></span>
        </>)} />
    </div>
  );
}

// ------------------------------------------------------------------ lignes --
export function LinesEditor({ items, onChange, readOnly = false }) {
  const set = (key, patch) => onChange(items.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key) => onChange(items.filter((l) => l.key !== key));
  const move = (key, dir) => {
    const i = items.findIndex((l) => l.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addProduct = (p) => {
    // Même produit déjà présent : on augmente la quantité au lieu de doubler la ligne.
    const ex = items.find((l) => l.product_id && l.product_id === p.id);
    if (ex) { set(ex.key, { qty: (Number(ex.qty) || 0) + 1 }); return; }
    onChange([...items, { key: lineKey(), product_id: p.id, code: p.code, name: p.name, qty: 1, unit_price: p.price ?? null }]);
  };
  const addFree = () => onChange([...items, { key: lineKey(), product_id: null, code: '', name: '', qty: 1, unit_price: null, free: true }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.length === 0 ? (
        <div className="crm-lines-empty">Aucun article. Recherchez un produit ci-dessous ou ajoutez une ligne libre (main-d’œuvre, câble au mètre…).</div>
      ) : (
        <table className="crm-lines">
          <thead><tr><th>Désignation</th><th className="c-qty">Qté</th><th className="c-price">Prix unitaire</th><th className="c-total" style={{ textAlign: 'end' }}>Total</th><th className="c-x" /></tr></thead>
          <tbody>
            {items.map((l, i) => {
              const priced = l.unit_price != null && l.unit_price !== '';
              return (
                <tr key={l.key}>
                  <td className="c-name">
                    {readOnly ? (
                      <div className="nm"><b>{l.name}</b><small>{l.code}</small></div>
                    ) : (l.free || !l.product_id) ? (
                      <div className="nm">
                        <input value={l.name || ''} placeholder="Désignation (ex. Installation et câblage)" onChange={(e) => set(l.key, { name: e.target.value })} aria-label="Désignation" />
                        <input value={l.code || ''} placeholder="Référence (facultatif)" onChange={(e) => set(l.key, { code: e.target.value })} aria-label="Référence" style={{ height: 30, fontSize: 12 }} />
                      </div>
                    ) : (
                      <div className="nm">
                        <b style={{ fontSize: 13.5 }}>{l.name}</b>
                        <small>{l.code}{' · '}<a href={`/admin/products/${encodeURIComponent(l.product_id)}`} target="_blank" rel="noreferrer">fiche produit</a></small>
                      </div>
                    )}
                  </td>
                  <td className="c-qty">
                    {readOnly ? <b>{l.qty}</b> : (
                      <input className="nb" inputMode="decimal" value={l.qty ?? ''} aria-label="Quantité"
                        onChange={(e) => set(l.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })}
                        onBlur={(e) => { const n = parseNumber(e.target.value); set(l.key, { qty: n && n > 0 ? n : 1 }); }} />
                    )}
                  </td>
                  <td className="c-price">
                    {readOnly ? (priced ? dzd(l.unit_price) : '—') : (
                      <input className={`nb ${priced ? '' : 'missing'}`} inputMode="decimal" value={l.unit_price ?? ''} placeholder="à définir" aria-label="Prix unitaire (DA)"
                        onChange={(e) => set(l.key, { unit_price: e.target.value.replace(/[^\d.,\s]/g, '') })}
                        onBlur={(e) => { const n = parseNumber(e.target.value); set(l.key, { unit_price: n == null ? null : Math.max(0, n) }); }} />
                    )}
                  </td>
                  <td className="c-total">{priced ? dzd(lineTotal({ qty: parseNumber(l.qty) || 0, unit_price: parseNumber(l.unit_price) || 0 })) : <span className="muted">—</span>}</td>
                  <td className="c-x">
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {items.length > 1 && <button type="button" className="crm-x" onClick={() => move(l.key, i === 0 ? 1 : -1)} title={i === 0 ? 'Descendre' : 'Monter'} aria-label="Déplacer">{i === 0 ? '↓' : '↑'}</button>}
                        <button type="button" className="crm-x" onClick={() => remove(l.key)} title="Retirer la ligne" aria-label="Retirer la ligne"><Icon name="close" size={15} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!readOnly && (
        <div className="crm-addrow">
          <ProductPicker onPick={addProduct} />
          <button type="button" className="adm-btn" onClick={addFree}><Icon name="plus" size={15} /> Ligne libre</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- montants --
export function PricingBox({ value, onChange, items, readOnly = false, children }) {
  const t = computeTotals({
    items: items.map((l) => ({ qty: parseNumber(l.qty) || 0, unit_price: l.unit_price === '' || l.unit_price == null ? null : parseNumber(l.unit_price) })),
    discount_type: value.discount_type,
    discount_value: parseNumber(value.discount_value) || 0,
    shipping_fee: parseNumber(value.shipping_fee) || 0,
    tax_rate: parseNumber(value.tax_rate) || 0,
  });
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="crm-money">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="crm-row3">
          <label className="crm-f"><span>Remise</span>
            <div className="crm-inline">
              <input inputMode="decimal" value={value.discount_value ?? ''} onChange={set('discount_value')} disabled={readOnly} placeholder="0" style={{ textAlign: 'end' }} />
              <select value={value.discount_type} onChange={set('discount_type')} disabled={readOnly} aria-label="Type de remise">
                <option value="amount">DA</option><option value="percent">%</option>
              </select>
            </div>
          </label>
          <label className="crm-f"><span>Frais de livraison / pose (DA)</span>
            <input inputMode="decimal" value={value.shipping_fee ?? ''} onChange={set('shipping_fee')} disabled={readOnly} placeholder="0" style={{ textAlign: 'end' }} />
          </label>
          <label className="crm-f"><span>TVA</span>
            <select value={String(Number(value.tax_rate) || 0)} onChange={set('tax_rate')} disabled={readOnly}>
              <option value="0">Prix TTC</option>
              <option value="19">HT + TVA 19 %</option>
              <option value="9">HT + TVA 9 %</option>
            </select>
          </label>
        </div>
        {children}
        {t.unpriced > 0 && (
          <div className="crm-warn"><Icon name="alert" size={17} />
            <span>{t.unpriced} ligne{t.unpriced > 1 ? 's' : ''} sans prix : le total est provisoire. Renseignez les prix avant de confirmer.</span>
          </div>
        )}
      </div>
      <div className="crm-totals" aria-live="polite">
        <div><span>Sous-total{Number(value.tax_rate) ? ' HT' : ''}</span><b>{dzd(t.subtotal)}</b></div>
        {t.discount > 0 && <div><span>Remise{value.discount_type === 'percent' ? ` (${parseNumber(value.discount_value)} %)` : ''}</span><b>− {dzd(t.discount)}</b></div>}
        {t.shipping > 0 && <div><span>Livraison / installation</span><b>{dzd(t.shipping)}</b></div>}
        {Number(value.tax_rate) > 0 && <div><span>TVA {Number(value.tax_rate)} %</span><b>{dzd(t.tax)}</b></div>}
        <div className="grand"><span>Total{Number(value.tax_rate) ? ' TTC' : ''}</span><b>{dzd(t.total)}</b></div>
      </div>
    </div>
  );
}

export function totalsOf(items, pricing) {
  return computeTotals({
    items: items.map((l) => ({ qty: parseNumber(l.qty) || 0, unit_price: l.unit_price === '' || l.unit_price == null ? null : parseNumber(l.unit_price) })),
    discount_type: pricing.discount_type,
    discount_value: parseNumber(pricing.discount_value) || 0,
    shipping_fee: parseNumber(pricing.shipping_fee) || 0,
    tax_rate: parseNumber(pricing.tax_rate) || 0,
  });
}
