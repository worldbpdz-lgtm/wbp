'use client';
// ============================================================================
// Fiche COMMANDE du back-office (création et modification).
// ----------------------------------------------------------------------------
// Colonne principale : client, articles et prix, livraison, paiement.
// Colonne de droite : statut et prochaine étape, appels, prise en charge,
// historique, impression.
//
// Ce qui est saisi n'est écrit qu'au clic sur « Enregistrer » (barre collante
// qui apparaît dès la première modification). Les actions de la colonne de
// droite (confirmer, annuler, noter un appel…) enregistrent d'abord les
// modifications en cours : on ne confirme jamais une commande avec des prix
// que le serveur n'a pas encore reçus.
// ============================================================================
import React, { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { LinesEditor, PricingBox, CustomerPicker, totalsOf } from '@/components/admin/crm/LinesEditor';
import { StatusBadge, ContactLinks, Who } from '@/components/admin/crm/ui';
import {
  saveOrder, setOrderStatus, logOrderCall, assignItem, deleteOrder,
} from '@/app/admin/crm-actions';
import {
  ORDER_STATUSES, ORDER_NEXT, DELIVERY_METHODS, ORDER_SOURCES, CANCEL_REASONS, CALL_OUTCOMES,
  PAYMENT_METHODS, orderStatus, sourceLabel, lineKey,
} from '@/lib/crm';
import { paymentStatus, dzd, parseNumber } from '@/lib/pricing';
import { WILAYAS } from '@/lib/wilayas';
import { fmtDateTime, fmtDate } from '@/lib/dates';

const FAIL = 'Action impossible — session expirée ? Rechargez la page.';

function initialState(order, prefill) {
  const o = order || {};
  const p = prefill || {};
  return {
    form: {
      customer_id: o.customer_id || p.customer_id || null,
      customer_name: o.customer_name ?? p.customer_name ?? '',
      company: o.company ?? p.company ?? '',
      phone: o.phone ?? p.phone ?? '',
      email: o.email ?? p.email ?? '',
      wilaya: o.wilaya ?? p.wilaya ?? '',
      city: o.city ?? p.city ?? '',
      address: o.address ?? p.address ?? '',
      delivery_method: o.delivery_method || 'delivery',
      due_date: o.due_date || '',
      customer_note: o.customer_note ?? p.customer_note ?? '',
      internal_note: o.internal_note ?? '',
      paid_amount: o.paid_amount ? String(o.paid_amount) : '',
      payment_method: o.payment_method || '',
      source: o.source || p.source || 'phone',
    },
    items: (Array.isArray(o.items) ? o.items : (p.items || [])).map((l) => ({ ...l, key: l.key || lineKey() })),
    pricing: {
      discount_type: o.discount_type || 'amount',
      discount_value: o.discount_value ? String(o.discount_value) : '',
      shipping_fee: o.shipping_fee ? String(o.shipping_fee) : '',
      tax_rate: String(Number(o.tax_rate) || 0),
    },
  };
}

const snapshot = (st) => JSON.stringify({
  ...st.form,
  items: st.items.map(({ key, free, ...l }) => ({ ...l, qty: parseNumber(l.qty), unit_price: l.unit_price === '' || l.unit_price == null ? null : parseNumber(l.unit_price) })),
  ...st.pricing,
});

export default function OrderEditor({ order = null, customer = null, team = [], quote = null, prefill = null, notice = '' }) {
  const router = useRouter();
  const isNew = !order;
  const [st, setSt] = useState(() => initialState(order, prefill));
  const [base, setBase] = useState(() => snapshot(initialState(order, prefill)));
  const [updatedAt, setUpdatedAt] = useState(order?.updated_at || null);
  const [linked, setLinked] = useState(customer);
  const [createAs, setCreateAs] = useState('pending');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState(notice || '');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [, startRefresh] = useTransition();

  const dirty = snapshot(st) !== base;
  const totals = totalsOf(st.items, st.pricing);

  // Nouvelle version reçue du serveur (après une action, ou rafraîchissement
  // automatique) : on la reprend… sauf si l'on est en train de modifier.
  useEffect(() => {
    if (!order || dirty) return;
    const fresh = initialState(order, null);
    setSt(fresh);
    setBase(snapshot(fresh));
    setUpdatedAt(order.updated_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.updated_at]);
  useEffect(() => { setLinked(customer); }, [customer]);

  // Prévenir avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const setF = (k) => (e) => setSt((s) => ({ ...s, form: { ...s.form, [k]: e?.target ? e.target.value : e } }));
  const flash = (m) => { setInfo(m); setTimeout(() => setInfo(''), 3500); };

  const payload = () => ({
    id: order?.id,
    expected_updated_at: updatedAt,
    ...st.form,
    items: st.items.map((l) => ({ ...l, qty: parseNumber(l.qty) || 1, unit_price: l.unit_price === '' || l.unit_price == null ? null : parseNumber(l.unit_price) })),
    ...st.pricing,
    status: isNew ? createAs : undefined,
  });

  async function save({ quiet = false } = {}) {
    setErr('');
    setBusy('save');
    try {
      const r = await saveOrder(payload());
      if (!r?.ok) { setErr(r?.error || FAIL); return false; }
      if (isNew) { router.push(`/admin/orders/${r.id}`); return true; }
      setBase(snapshot(st));
      setUpdatedAt(r.updated_at);
      if (!quiet) flash('Commande enregistrée ✓');
      startRefresh(() => router.refresh());
      return true;
    } catch { setErr(FAIL); return false; } finally { setBusy(''); }
  }

  async function act(name, fn, okMsg) {
    setErr('');
    if (dirty) { const saved = await save({ quiet: true }); if (!saved) return false; }
    setBusy(name);
    try {
      const r = await fn();
      if (r && r.ok === false) { setErr(r.error || FAIL); return false; }
      if (r?.updated_at) setUpdatedAt(r.updated_at);
      if (okMsg) flash(okMsg);
      startRefresh(() => router.refresh());
      return true;
    } catch { setErr(FAIL); return false; } finally { setBusy(''); }
  }

  const pickCustomer = (c) => {
    setLinked(c);
    setSt((s) => ({
      ...s,
      form: {
        ...s.form,
        customer_id: c.id,
        customer_name: c.name || s.form.customer_name,
        company: c.company || s.form.company,
        phone: c.phone || s.form.phone,
        email: c.email || s.form.email,
        wilaya: c.wilaya || s.form.wilaya,
        city: c.city || s.form.city,
        address: c.address || s.form.address,
      },
    }));
  };

  const status = order?.status || 'pending';
  const next = order ? ORDER_NEXT[status] : null;
  const pay = paymentStatus(totals.total, parseNumber(st.form.paid_amount) || 0);
  const history = useMemo(() => (Array.isArray(order?.history) ? [...order.history].reverse() : []), [order?.history]);
  const title = isNew ? 'Nouvelle commande' : order.number || 'Commande';
  const waText = order ? `Bonjour ${order.customer_name || ''}, World Business Plus au sujet de votre commande ${order.number || ''}.` : '';

  return (
    <>
      <Link href="/admin/orders" className="crm-back"><Icon name="chevleft" size={15} /> Commandes</Link>
      <div className="crm-head">
        <div>
          <h1>{title}{order && <StatusBadge kind="order" value={status} />}</h1>
          <div className="meta">
            {order ? (
              <>
                <span>Reçue le {fmtDateTime(order.created_at)}</span>
                <span>Origine : {sourceLabel(order.source)}</span>
                {quote && <span>Devis : <Link href={`/admin/quotes/${quote.id}`}>{quote.number || 'voir'}</Link></span>}
                {order.call_attempts > 0 && <span>{order.call_attempts} appel{order.call_attempts > 1 ? 's' : ''}</span>}
              </>
            ) : <span>Commande prise par téléphone, WhatsApp, sur place…</span>}
          </div>
        </div>
        {order && (
          <div className="adm-actions">
            <a className="adm-btn" href={`/admin/print/order/${order.id}`} target="_blank" rel="noreferrer"><Icon name="printer" size={15} /> Bon de commande</a>
            <a className="adm-btn" href={`/admin/print/proforma/${order.id}`} target="_blank" rel="noreferrer"><Icon name="receipt" size={15} /> Facture proforma</a>
          </div>
        )}
      </div>

      {err && <div className="crm-err" role="alert" style={{ marginBottom: 14 }}><Icon name="alert" size={17} /><span>{err}</span></div>}
      {info && <div className="crm-ok" role="status" style={{ marginBottom: 14 }}><Icon name="check" size={17} /><span>{info}</span></div>}

      <div className="crm-grid">
        <div className="crm-main">
          {/* ------------------------------------------------------- client */}
          <section className="crm-card">
            <div className="hd"><h2>Client</h2>
              {linked?.id
                ? <span className="muted">Fiche : <Link href={`/admin/customers/${linked.id}`}>{linked.company || linked.name || 'voir'}</Link>{' · '}
                    <button type="button" className="adm-btn sm" onClick={() => { setLinked(null); setSt((s) => ({ ...s, form: { ...s.form, customer_id: null } })); }}>Détacher</button></span>
                : <span className="muted">La fiche client est retrouvée ou créée à l’enregistrement</span>}
            </div>
            <div className="bd">
              <CustomerPicker onPick={pickCustomer} />
              <div className="crm-row2">
                <label className="crm-f"><span>Nom de l’interlocuteur</span><input value={st.form.customer_name} onChange={setF('customer_name')} autoComplete="off" /></label>
                <label className="crm-f"><span>Société / institution</span><input value={st.form.company} onChange={setF('company')} autoComplete="off" /></label>
              </div>
              <div className="crm-row2">
                <label className="crm-f"><span>Téléphone</span><input value={st.form.phone} onChange={setF('phone')} inputMode="tel" autoComplete="off" /></label>
                <label className="crm-f"><span>E-mail</span><input value={st.form.email} onChange={setF('email')} type="email" autoComplete="off" /></label>
              </div>
              <ContactLinks phone={st.form.phone} email={st.form.email} waText={waText} subject={order ? `Votre commande ${order.number || ''}` : ''} />
            </div>
          </section>

          {/* ------------------------------------------------------ articles */}
          <section className="crm-card">
            <div className="hd"><h2>Articles et prix</h2><span className="muted">{st.items.length} ligne{st.items.length > 1 ? 's' : ''}</span></div>
            <div className="bd">
              <LinesEditor items={st.items} onChange={(items) => setSt((s) => ({ ...s, items }))} />
              <PricingBox value={st.pricing} onChange={(pricing) => setSt((s) => ({ ...s, pricing }))} items={st.items} />
            </div>
          </section>

          {/* ----------------------------------------------------- livraison */}
          <section className="crm-card">
            <div className="hd"><h2>Livraison</h2></div>
            <div className="bd">
              <div className="crm-choice" role="radiogroup" aria-label="Mode de livraison">
                {DELIVERY_METHODS.map((d) => (
                  <button key={d.value} type="button" role="radio" aria-checked={st.form.delivery_method === d.value}
                    className={st.form.delivery_method === d.value ? 'on' : ''} onClick={() => setF('delivery_method')(d.value)}>
                    <b>{d.label}</b><small>{d.hint}</small>
                  </button>
                ))}
              </div>
              <div className="crm-row3">
                <label className="crm-f"><span>Wilaya</span><input value={st.form.wilaya} onChange={setF('wilaya')} list="crm-wilayas" autoComplete="off" /></label>
                <label className="crm-f"><span>Commune / ville</span><input value={st.form.city} onChange={setF('city')} autoComplete="off" /></label>
                <label className="crm-f"><span>Date prévue</span><input type="date" value={st.form.due_date || ''} onChange={setF('due_date')} /></label>
              </div>
              {st.form.delivery_method !== 'pickup' && (
                <label className="crm-f"><span>Adresse de livraison</span><input value={st.form.address} onChange={setF('address')} autoComplete="off" /></label>
              )}
              <datalist id="crm-wilayas">{WILAYAS.map((w) => <option key={w} value={w} />)}</datalist>
              <div className="crm-row2">
                <label className="crm-f"><span>Message du client</span><textarea value={st.form.customer_note} onChange={setF('customer_note')} rows={3} /></label>
                <label className="crm-f"><span>Note interne (jamais imprimée)</span><textarea value={st.form.internal_note} onChange={setF('internal_note')} rows={3} placeholder="Stock à vérifier, technicien prévu, remise accordée par…" /></label>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------ paiement */}
          <section className="crm-card">
            <div className="hd"><h2>Paiement</h2><span className={`st ${pay.tone}`}>{pay.label}</span></div>
            <div className="bd">
              <div className="crm-row3">
                <label className="crm-f"><span>Montant encaissé (DA)</span>
                  <input inputMode="decimal" value={st.form.paid_amount} onChange={setF('paid_amount')} placeholder="0" style={{ textAlign: 'end' }} />
                </label>
                <label className="crm-f"><span>Mode de paiement</span>
                  <select value={st.form.payment_method} onChange={setF('payment_method')}>
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <div className="crm-f"><span>Reste à payer</span>
                  <div style={{ height: 42, display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 15 }}>{dzd(pay.rest)}</div>
                </div>
              </div>
              {totals.total > 0 && !pay.rest ? null : totals.total > 0 && (
                <div className="adm-actions">
                  <button type="button" className="adm-btn sm" onClick={() => setF('paid_amount')(String(totals.total))}>Tout est payé</button>
                </div>
              )}
            </div>
          </section>

          {(dirty || isNew) && (
            <div className="crm-savebar">
              <span>{isNew ? 'Nouvelle commande — pas encore enregistrée' : 'Modifications non enregistrées'}</span>
              <div className="adm-actions">
                {!isNew && <button type="button" className="adm-btn" onClick={() => setSt(initialState(order, null))} disabled={!!busy}>Annuler</button>}
                <button type="button" className="adm-btn primary" onClick={() => save()} disabled={!!busy}>
                  {busy === 'save' ? 'Enregistrement…' : isNew ? 'Créer la commande' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =================================================== colonne droite */}
        <aside className="crm-side">
          {isNew ? (
            <section className="crm-card">
              <div className="hd"><h2>Création</h2></div>
              <div className="bd">
                <label className="crm-f"><span>Origine</span>
                  <select value={st.form.source} onChange={setF('source')}>
                    {ORDER_SOURCES.filter((s) => !['website', 'quote', 'message'].includes(s.value)).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                <div className="crm-f"><span>Statut à la création</span>
                  <div className="crm-choice">
                    <button type="button" className={createAs === 'pending' ? 'on' : ''} onClick={() => setCreateAs('pending')}><b>À confirmer</b><small>On rappellera le client</small></button>
                    <button type="button" className={createAs === 'confirmed' ? 'on' : ''} onClick={() => setCreateAs('confirmed')}><b>Confirmée</b><small>Prix et livraison déjà validés</small></button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="crm-card">
                <div className="hd"><h2>Statut</h2></div>
                <div className="bd">
                  <div className="crm-status-now">
                    <StatusBadge kind="order" value={status} />
                    <span className="muted" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{orderStatus(status).hint}</span>
                  </div>
                  {status === 'cancelled' && order.cancel_reason && <div className="crm-warn"><Icon name="alert" size={16} /><span>Motif : {order.cancel_reason}</span></div>}
                  {next && (
                    <button type="button" className="adm-btn primary crm-bigbtn" disabled={!!busy}
                      onClick={() => act('next', () => setOrderStatus(order.id, next), `Commande : ${orderStatus(next).label}`)}>
                      <Icon name="check" size={17} /> {busy === 'next' ? 'Un instant…' : orderStatus(next).action}
                    </button>
                  )}
                  <label className="crm-f"><span>Changer le statut</span>
                    <select value={status} disabled={!!busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'cancelled') { setCancelOpen(true); return; }
                        act('status', () => setOrderStatus(order.id, v), `Commande : ${orderStatus(v).label}`);
                      }}>
                      {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  {status !== 'cancelled' && status !== 'delivered' && !cancelOpen && (
                    <button type="button" className="adm-btn danger" onClick={() => setCancelOpen(true)} disabled={!!busy}>Annuler la commande…</button>
                  )}
                  {cancelOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <b style={{ fontSize: 13 }}>Motif de l’annulation</b>
                      <div className="crm-reasons">
                        {CANCEL_REASONS.map((r) => <button type="button" key={r} className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>{r}</button>)}
                      </div>
                      <div className="crm-btnrow">
                        <button type="button" className="adm-btn" onClick={() => { setCancelOpen(false); setReason(''); }}>Retour</button>
                        <button type="button" className="adm-btn danger" disabled={!reason || !!busy}
                          onClick={async () => { const ok = await act('cancel', () => setOrderStatus(order.id, 'cancelled', { reason }), 'Commande annulée'); if (ok) { setCancelOpen(false); setReason(''); } }}>
                          {busy === 'cancel' ? '…' : 'Confirmer l’annulation'}
                        </button>
                      </div>
                    </div>
                  )}
                  {order.confirmed_at && <p className="adm-muted" style={{ margin: 0 }}>Confirmée le {fmtDateTime(order.confirmed_at)}</p>}
                  {order.delivered_at && <p className="adm-muted" style={{ margin: 0 }}>Livrée le {fmtDateTime(order.delivered_at)}</p>}
                </div>
              </section>

              <section className="crm-card">
                <div className="hd"><h2>Appels au client</h2><span className="muted">{order.call_attempts || 0} noté{order.call_attempts > 1 ? 's' : ''}</span></div>
                <div className="bd">
                  <ContactLinks phone={order.phone} waText={waText} />
                  <div className="crm-reasons">
                    {CALL_OUTCOMES.map((c) => (
                      <button type="button" key={c.value} disabled={!!busy}
                        onClick={() => act('call', () => logOrderCall(order.id, c.value), `Appel noté : ${c.label}`)}>{c.label}</button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="crm-card">
                <div className="hd"><h2>Pris en charge par</h2></div>
                <div className="bd">
                  <Who email={order.assigned_to} team={team} empty="Personne pour l’instant" />
                  <select className="adm-btn" style={{ width: '100%' }} value={order.assigned_to || ''} disabled={!!busy}
                    onChange={(e) => act('assign', () => assignItem('order', order.id, e.target.value || 'none'), 'Prise en charge mise à jour')}>
                    <option value="">Personne</option>
                    {team.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
                  </select>
                </div>
              </section>

              <section className="crm-card">
                <div className="hd"><h2>Historique</h2></div>
                <div className="bd">
                  {history.length === 0 ? <span className="adm-muted">Aucun événement.</span> : (
                    <ul className="crm-hist">
                      {history.slice(0, 40).map((h, i) => (
                        <li key={i} className={h.type}><b>{h.name || 'Système'}</b> — {h.text}<time>{fmtDateTime(h.at)}</time></li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <button type="button" className="adm-btn danger" disabled={!!busy}
                onClick={async () => {
                  if (!window.confirm(`Supprimer définitivement la commande ${order.number || ''} ?\n\nPour la garder dans l’historique, choisissez plutôt « Annuler la commande ».`)) return;
                  setBusy('delete');
                  try {
                    const r = await deleteOrder(order.id);
                    if (!r?.ok) { setErr(r?.error || FAIL); return; }
                    router.push('/admin/orders'); router.refresh();
                  } catch { setErr(FAIL); } finally { setBusy(''); }
                }}>
                <Icon name="trash" size={15} /> Supprimer la commande
              </button>
              {order.due_date && <p className="adm-muted" style={{ margin: 0, textAlign: 'center' }}>Prévue le {fmtDate(order.due_date)}</p>}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
