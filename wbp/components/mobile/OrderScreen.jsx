'use client';
import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '@/styles/mobile-inbox.css';
import { useMobile } from '@/components/mobile/MobileApp';
import { Icon } from '@/components/mobile/ui';
import {
  Banner, Btn, Confirm, Empty, Group, NumberInput, PickerInput, SaveBar, SearchBar, Sheet, SubTop, TextInput, useToast,
} from '@/components/mobile/form';
import { agoOf, dayLabelOf, timeOf } from '@/components/mobile/store';
import {
  saveOrder, setOrderStatus, logOrderCall, assignItem, deleteOrder, searchProducts,
} from '@/app/admin/crm-actions';
import {
  ORDER_STATUSES, ORDER_NEXT, CALL_OUTCOMES, CANCEL_REASONS, DELIVERY_METHODS, PAYMENT_METHODS,
  orderStatus, quoteStatus, deliveryLabel, sourceLabel, kindLabel,
} from '@/lib/crm';
import { computeTotals, dzd, fmtQty, lineTotal, parseNumber, paymentStatus } from '@/lib/pricing';
import { telOf, waLink } from '@/lib/phone';
import { WILAYAS } from '@/lib/wilayas';

// ============================================================================
// Fiche commande — téléphone.
// ----------------------------------------------------------------------------
// Deux sortes de gestes, et la distinction est voulue :
//   • les CHAMPS (articles, prix, client, livraison, paiement, notes) se
//     modifient en local puis s'enregistrent d'un coup avec la barre du bas —
//     une saisie de prix au pouce ne doit pas déclencher un aller-retour
//     réseau à chaque chiffre ;
//   • les ACTIONS (confirmer, noter un appel, prendre en charge, annuler)
//     partent tout de suite. Si des champs sont en cours de modification, ils
//     sont enregistrés d'abord : « Confirmer » confirme ce que l'on voit.
//
// Conflits : la version chargée (updated_at) accompagne chaque
// enregistrement. Si un collègue a modifié la commande entre-temps, le
// serveur refuse au lieu d'écraser son travail.
// ============================================================================

const FAIL = 'Pas de réseau ou serveur indisponible — réessayez.';
const CONFIRMING = ['confirmed', 'preparing', 'shipped', 'delivered'];
const CALLABLE = ['pending', 'confirmed', 'preparing', 'shipped'];

const toDraft = (o) => ({
  customer_name: o.customer_name || '',
  company: o.company || '',
  phone: o.phone || '',
  email: o.email || '',
  wilaya: o.wilaya || '',
  city: o.city || '',
  address: o.address || '',
  delivery_method: o.delivery_method || 'delivery',
  due_date: o.due_date || '',
  items: (Array.isArray(o.items) ? o.items : []).map((l, i) => ({
    key: l?.key || `l${i}`,
    product_id: l?.product_id || null,
    code: l?.code || null,
    name: l?.name || l?.code || '',
    qty: Number(l?.qty) || 1,
    unit_price: l?.unit_price == null || l.unit_price === '' ? null : Number(l.unit_price),
  })),
  discount_type: o.discount_type === 'percent' ? 'percent' : 'amount',
  discount_value: Number(o.discount_value) || 0,
  shipping_fee: Number(o.shipping_fee) || 0,
  tax_rate: Number(o.tax_rate) || 0,
  paid_amount: Number(o.paid_amount) || 0,
  payment_method: o.payment_method || '',
  customer_note: o.customer_note || '',
  internal_note: o.internal_note || '',
  customer_id: o.customer_id || null,
});
const snap = (d) => JSON.stringify(d);
const rnd = () => Math.random().toString(36).slice(2, 10);
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// Récapitulatif à envoyer au client (WhatsApp, SMS, e-mail).
function recapOf(order, d, t) {
  const lines = d.items.map((l) => `• ${fmtQty(l.qty)} × ${l.name || l.code}${l.unit_price != null ? ` — ${dzd(lineTotal(l))}` : ''}`);
  const out = [
    `Bonjour${d.customer_name ? ` ${first(d.customer_name)}` : ''}, voici le récapitulatif de votre commande${order.number ? ` ${order.number}` : ''} chez World Business Plus :`,
    '',
    ...lines,
  ];
  if (t.discount > 0) out.push(`Remise : − ${dzd(t.discount)}`);
  if (t.shipping > 0) out.push(`Livraison / installation : ${dzd(t.shipping)}`);
  if (t.tax > 0) out.push(`TVA ${d.tax_rate} % : ${dzd(t.tax)}`);
  if (!t.unpriced) out.push(`Total : ${dzd(t.total)}`);
  out.push('', `${deliveryLabel(d.delivery_method)}${[d.address, d.city, d.wilaya].filter(Boolean).length ? ` : ${[d.address, d.city, d.wilaya].filter(Boolean).join(', ')}` : ''}`);
  out.push('Merci de votre confiance.');
  return out.join('\n');
}

// Montant saisi au pouce : le texte tapé est gardé tel quel (« 12. » en cours
// de saisie), le nombre est remonté au brouillon à chaque frappe.
function MoneyField({ label, value, onChange, placeholder = '0', hint }) {
  const [text, setText] = useState(value ? String(value) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value ? String(value) : ''); }
  }, [value]);
  return (
    <NumberInput
      label={label}
      hint={hint}
      value={text}
      decimal
      placeholder={placeholder}
      onChange={(v) => { setText(v); const n = parseNumber(v) ?? 0; last.current = n; onChange(n); }}
    />
  );
}

function ReadRow({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="mbo-ro">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

export default function OrderScreen({ order, customer, quote, team = [], me, canEdit, created, missing, migrate }) {
  const router = useRouter();
  const toast = useToast();
  const { reloadFeed } = useMobile();
  const [, start] = useTransition();
  const refresh = () => start(() => router.refresh());

  // ------------------------------------------------------- commande absente --
  if (missing) {
    return (
      <>
        <SubTop title="Commande" back="/mobile/inbox" />
        <div className="mb-wrap">
          {migrate
            ? <Banner kind="warn">Les commandes ne sont pas encore activées : la base doit être mise à jour (fichier supabase/commandes-notifications.sql).</Banner>
            : <Empty icon="truck" action={<Link href="/mobile/inbox" className="mbf-btn">Retour aux demandes</Link>}>
                Cette commande n’existe plus — elle a peut-être été supprimée.
              </Empty>}
        </div>
      </>
    );
  }
  return <OrderBody {...{ order, customer, quote, team, me, canEdit, created, router, toast, reloadFeed, refresh }} />;
}

function OrderBody({ order, customer, quote, team, me, canEdit, created, router, toast, reloadFeed, refresh }) {
  const [draft, setDraft] = useState(() => toDraft(order));
  const [base, setBase] = useState(() => toDraft(order));
  const [updatedAt, setUpdatedAt] = useState(order.updated_at);
  const [busy, setBusy] = useState('');
  const [lineEdit, setLineEdit] = useState(null);        // { ...ligne, isNew }
  const [adding, setAdding] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [showCreated, setShowCreated] = useState(!!created);

  const dirty = snap(draft) !== snap(base);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Nouvelle version du serveur (après une action ou un rafraîchissement) :
  // reprise telle quelle… sauf pendant une modification en cours. Dans ce cas
  // on garde aussi l'ANCIENNE référence de version : si c'est un collègue qui
  // a modifié, l'enregistrement le détectera au lieu d'écraser son travail.
  useEffect(() => {
    const fresh = toDraft(order);
    setBase(fresh);
    if (!dirtyRef.current) { setDraft(fresh); setUpdatedAt(order.updated_at); }
  }, [order.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?created=1 : retiré de l'adresse pour qu'un rafraîchissement ne réaffiche
  // pas le bandeau.
  useEffect(() => { if (created) router.replace(`/mobile/orders/${order.id}`, { scroll: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useMemo(() => computeTotals(draft), [draft]);
  const st = orderStatus(order.status);
  const next = ORDER_NEXT[order.status] || null;
  const pay = paymentStatus(t.total, draft.paid_amount);
  const names = useMemo(() => Object.fromEntries(team.map((m) => [String(m.email).toLowerCase(), m.name])), [team]);
  const nameOf = (email) => (email ? names[String(email).toLowerCase()] || email : null);

  const missingForConfirm = [];
  if (!draft.items.length) missingForConfirm.push('au moins un article');
  if (t.unpriced) missingForConfirm.push(`le prix de ${t.unpriced} ligne${t.unpriced > 1 ? 's' : ''}`);
  if (!draft.phone.trim() && !draft.email.trim()) missingForConfirm.push('un téléphone ou un e-mail du client');
  const blocked = next && CONFIRMING.includes(next) && missingForConfirm.length > 0;

  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  // ----------------------------------------------------------- écritures --
  async function save({ quiet = false } = {}) {
    setBusy('save');
    try {
      const r = await saveOrder({ ...draft, id: order.id, number: order.number, expected_updated_at: updatedAt });
      if (!r?.ok) { toast(r?.error || FAIL, 'bad'); return false; }
      setBase(draft);
      setUpdatedAt(r.updated_at);
      if (!quiet) toast('Commande enregistrée');
      refresh();
      return true;
    } catch { toast(FAIL, 'bad'); return false; } finally { setBusy(''); }
  }

  async function act(name, fn, okMsg) {
    if (dirty) { const saved = await save({ quiet: true }); if (!saved) return null; }
    setBusy(name);
    try {
      const r = await fn();
      if (r && r.ok === false) { toast(r.error || FAIL, 'bad'); return null; }
      if (r?.updated_at) setUpdatedAt(r.updated_at);
      if (okMsg) toast(okMsg);
      refresh();
      reloadFeed?.();
      return r || { ok: true };
    } catch { toast(FAIL, 'bad'); return null; } finally { setBusy(''); }
  }

  const changeStatus = (status, opts) => act('status', () => setOrderStatus(order.id, status, opts), `Commande : ${orderStatus(status).label}`);

  // ------------------------------------------------------------- lignes --
  const openLine = (l) => canEdit && setLineEdit({ ...l, qtyText: String(l.qty ?? 1), priceText: l.unit_price == null ? '' : String(l.unit_price) });
  const applyLine = () => {
    const l = lineEdit;
    const name = String(l.name || '').trim();
    if (!name && !l.code) { toast('Indiquez une désignation.', 'bad'); return; }
    const clean = {
      key: l.key, product_id: l.product_id || null, code: l.code || null, name: name || l.code,
      qty: Math.max(0.01, parseNumber(l.qtyText) || 1),
      unit_price: parseNumber(l.priceText),
    };
    setDraft((d) => ({
      ...d,
      items: l.isNew ? [...d.items, clean] : d.items.map((x) => (x.key === l.key ? clean : x)),
    }));
    setLineEdit(null);
  };
  const removeLine = (key) => { setDraft((d) => ({ ...d, items: d.items.filter((x) => x.key !== key) })); setLineEdit(null); };
  const firstUnpriced = draft.items.find((l) => l.unit_price == null);

  // --------------------------------------------------------- contacts --
  const tel = telOf(draft.phone);
  const wa = waLink(draft.phone, `Bonjour${draft.customer_name ? ` ${first(draft.customer_name)}` : ''}, ici World Business Plus au sujet de votre commande${order.number ? ` ${order.number}` : ''}.`);
  const recap = recapOf(order, draft, t);
  const waRecap = waLink(draft.phone, recap);

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Copié'); } catch { toast('Copie impossible sur cet appareil', 'bad'); }
  };

  const history = Array.isArray(order.history) ? [...order.history].reverse() : [];
  const place = [draft.city, draft.wilaya].filter(Boolean).join(', ');

  const teamOptions = [
    { value: '', label: 'Personne' },
    ...team.map((m) => ({ value: String(m.email).toLowerCase(), label: m.name, note: String(m.email).toLowerCase() === me ? 'Vous' : m.email })),
  ];

  return (
    <>
      <SubTop
        title={order.number || 'Commande'}
        subtitle={`${st.label} · reçue ${dayLabelOf(order.created_at).toLowerCase()} à ${timeOf(order.created_at)}`}
        back="/mobile/inbox"
        onBack={dirty ? () => setLeaveOpen(true) : undefined}
      />

      <div className="mb-wrap">
        {showCreated && (
          <Banner kind="ok" onClose={() => setShowCreated(false)}>
            Commande créée. Vérifiez les articles et les prix avec le client, puis confirmez-la.
          </Banner>
        )}
        {!canEdit && (
          <div className="mb-ro"><Icon name="eye" size={16} /> Consultation : pour modifier une commande, utilisez le back-office sur ordinateur.</div>
        )}

        {/* ------------------------------------------------------- en-tête -- */}
        <section className="mbo-hero">
          <div className="row">
            <span className="who">{draft.customer_name || draft.company || 'Client sans nom'}</span>
            <span className={`mbl-tag ${st.tone}`}>{st.label}</span>
          </div>
          <div className="sub">
            {[draft.customer_name && draft.company, place, deliveryLabel(draft.delivery_method)].filter(Boolean).join(' · ')}
            <br />
            Origine : {sourceLabel(order.source)}{quote ? ` (${quote.number || 'devis'})` : ''}{order.call_attempts ? ` · ${order.call_attempts} appel${order.call_attempts > 1 ? 's' : ''}` : ''}
            {order.status === 'cancelled' && order.cancel_reason ? ` · motif : ${order.cancel_reason}` : ''}
          </div>
          {(tel || wa) && (
            <div className="mbi-two">
              {tel && <a className="mbf-btn" href={`tel:${tel}`} style={{ textDecoration: 'none' }}><Icon name="phone" size={18} /> Appeler</a>}
              {wa && <a className="mbf-btn wa" href={wa} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', background: '#E7F8EF', borderColor: '#BBE9CE', color: '#128C4B' }}><Icon name="whatsapp" size={18} /> WhatsApp</a>}
            </div>
          )}
          <div className="mbo-total">
            <span>{t.unpriced ? `Total (${t.unpriced} prix à fixer)` : 'Total'}</span>
            <b>{dzd(t.total)}</b>
          </div>
          {t.total > 0 && <span className={`mbl-tag ${pay.tone}`} style={{ width: 'fit-content' }}>{pay.label}{pay.value === 'partial' ? ` · reste ${dzd(pay.rest)}` : ''}</span>}
        </section>

        {/* ------------------------------------------------ étape suivante -- */}
        {canEdit && next && (
          <div style={{ display: 'grid', gap: 8 }}>
            {blocked && (
              <Banner kind="warn">
                Pour {next === 'confirmed' ? 'confirmer' : 'avancer'}, il manque : {missingForConfirm.join(', ')}.
              </Banner>
            )}
            {blocked && firstUnpriced ? (
              <Btn variant="primary" icon="pencil" onClick={() => openLine(firstUnpriced)}>Fixer les prix</Btn>
            ) : (
              <Btn variant="primary" icon="check" disabled={!!busy || blocked} onClick={() => changeStatus(next)}>
                {busy === 'status' ? 'Un instant…' : orderStatus(next).action}
              </Btn>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- appels -- */}
        {canEdit && CALLABLE.includes(order.status) && (
          <Group
            title="Appels au client"
            note={order.call_attempts ? `${order.call_attempts} appel${order.call_attempts > 1 ? 's' : ''} noté${order.call_attempts > 1 ? 's' : ''}. L’équipe voit qui a déjà appelé.` : 'Après chaque appel, notez le résultat : l’équipe voit qui a déjà appelé.'}
          >
            <div className="mbo-chips">
              {CALL_OUTCOMES.map((c) => (
                <button key={c.value} type="button" disabled={!!busy}
                  onClick={() => act('call', () => logOrderCall(order.id, c.value), `Appel noté : ${c.label}`)}>
                  {c.label}
                </button>
              ))}
            </div>
          </Group>
        )}

        {/* ------------------------------------------------------ articles -- */}
        <Group title={`Articles (${draft.items.length})`} note={canEdit ? 'Touchez une ligne pour changer la quantité ou le prix.' : null}>
          {draft.items.length === 0 ? (
            <p className="mbf-hint">Aucun article pour l’instant.</p>
          ) : (
            <div className="mbo-lines">
              {draft.items.map((l) => (
                <button key={l.key} type="button" className="mbo-line" onClick={() => openLine(l)} disabled={!canEdit}>
                  <span className="bd">
                    <b>{l.name || l.code}</b>
                    <small>{[l.code && l.code !== l.name ? l.code : null, `${fmtQty(l.qty)} × ${l.unit_price == null ? '?' : dzd(l.unit_price)}`].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="amt">
                    {l.unit_price == null ? <b className="miss">Prix à fixer</b> : <b>{dzd(lineTotal(l))}</b>}
                  </span>
                  {canEdit && <Icon name="chevright" size={16} />}
                </button>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="mbi-two">
              <Btn icon="plus" onClick={() => setAdding(true)}>Ajouter</Btn>
              <Btn icon="wallet" onClick={() => setPricing(true)}>Remise, frais</Btn>
            </div>
          )}
          <div className="mbo-sum">
            <div><span>Sous-total</span><b>{dzd(t.subtotal)}</b></div>
            {t.discount > 0 && <div><span>Remise{draft.discount_type === 'percent' ? ` (${draft.discount_value} %)` : ''}</span><b>− {dzd(t.discount)}</b></div>}
            {t.shipping > 0 && <div><span>Livraison / installation</span><b>{dzd(t.shipping)}</b></div>}
            {t.tax > 0 && <div><span>TVA {draft.tax_rate} %</span><b>{dzd(t.tax)}</b></div>}
            <div className="grand"><span>Total</span><b>{dzd(t.total)}</b></div>
          </div>
        </Group>

        {/* -------------------------------------------------------- client -- */}
        <Group title="Client">
          {canEdit ? (
            <>
              <TextInput label="Nom de l’interlocuteur" value={draft.customer_name} onChange={set('customer_name')} autoComplete="off" maxLength={200} />
              <TextInput label="Société / institution" value={draft.company} onChange={set('company')} autoComplete="off" maxLength={200} />
              <TextInput label="Téléphone" value={draft.phone} onChange={set('phone')} inputMode="tel" autoComplete="off" maxLength={60} />
              <TextInput label="E-mail" value={draft.email} onChange={set('email')} inputMode="email" autoCapitalize="none" autoComplete="off" maxLength={200} />
            </>
          ) : (
            <>
              <ReadRow label="Nom">{draft.customer_name}</ReadRow>
              <ReadRow label="Société">{draft.company}</ReadRow>
              <ReadRow label="Téléphone">{draft.phone}</ReadRow>
              <ReadRow label="E-mail">{draft.email}</ReadRow>
            </>
          )}
          {customer && (
            <div className="mbo-cust">
              <b>Fiche client{customer.kind ? ` · ${kindLabel(customer.kind)}` : ''}</b>
              <span>
                {customer.orders
                  ? `${customer.orders} autre${customer.orders > 1 ? 's' : ''} commande${customer.orders > 1 ? 's' : ''}${customer.revenue ? ` · ${dzd(customer.revenue)} confirmés` : ''}`
                  : 'Première commande de ce client'}
                {customer.quotes ? ` · ${customer.quotes} devis` : ''}
                {customer.created_at ? ` · client depuis ${new Date(customer.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Africa/Algiers' })}` : ''}
              </span>
              {customer.notes && <p className="mbi-note-ro">{customer.notes}</p>}
              {customer.recent?.length > 0 && (
                <div className="mbo-recent">
                  {customer.recent.map((r) => {
                    const s2 = r.kind === 'order' ? orderStatus(r.status) : quoteStatus(r.status);
                    return (
                      <Link key={`${r.kind}-${r.id}`} href={r.kind === 'order' ? `/mobile/orders/${r.id}` : `/mobile/inbox?open=quote:${r.id}`}>
                        <span>{r.number || (r.kind === 'order' ? 'Commande' : 'Devis')}</span>
                        <small>{new Date(r.at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Algiers' })}{r.kind === 'order' && Number(r.total) > 0 ? ` · ${dzd(r.total)}` : ''}</small>
                        <i className={`mbl-tag ${s2.tone}`}>{s2.label}</i>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Group>

        {/* ----------------------------------------------------- livraison -- */}
        <Group title="Livraison">
          {canEdit ? (
            <>
              <div className="mbf-options">
                {DELIVERY_METHODS.map((m) => (
                  <button key={m.value} type="button" className={`mbf-option ${draft.delivery_method === m.value ? 'on' : ''}`}
                    onClick={() => set('delivery_method')(m.value)}>
                    <span className="bd"><b>{m.label}</b><small>{m.hint}</small></span>
                    {draft.delivery_method === m.value && <Icon name="check" size={19} />}
                  </button>
                ))}
              </div>
              {draft.delivery_method !== 'pickup' && (
                <>
                  <PickerInput
                    label="Wilaya"
                    value={draft.wilaya}
                    placeholder="Choisir la wilaya"
                    options={[
                      ...(draft.wilaya && !WILAYAS.includes(draft.wilaya) ? [{ value: draft.wilaya, label: draft.wilaya, note: 'Saisie du client' }] : []),
                      ...WILAYAS.map((w, i) => ({ value: w, label: `${String(i + 1).padStart(2, '0')} · ${w}` })),
                    ]}
                    onChange={set('wilaya')}
                  />
                  <TextInput label="Commune / ville" value={draft.city} onChange={set('city')} maxLength={120} />
                  <TextInput label="Adresse de livraison" value={draft.address} onChange={set('address')} multiline rows={2} maxLength={400} />
                </>
              )}
              <div className="mbf-field">
                <label htmlFor="mbo-due">Date prévue</label>
                <input id="mbo-due" className="mbf-input" type="date" value={draft.due_date || ''} onChange={(e) => set('due_date')(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <ReadRow label="Mode">{deliveryLabel(draft.delivery_method)}</ReadRow>
              <ReadRow label="Wilaya">{draft.wilaya}</ReadRow>
              <ReadRow label="Commune">{draft.city}</ReadRow>
              <ReadRow label="Adresse">{draft.address}</ReadRow>
              <ReadRow label="Date prévue">{draft.due_date ? new Date(`${draft.due_date}T12:00:00`).toLocaleDateString('fr-FR') : null}</ReadRow>
            </>
          )}
        </Group>

        {/* ------------------------------------------------------ paiement -- */}
        <Group title="Paiement">
          {canEdit ? (
            <>
              <MoneyField label="Montant encaissé (DA)" value={draft.paid_amount} onChange={set('paid_amount')} />
              <PickerInput
                label="Mode de paiement"
                value={draft.payment_method}
                placeholder="Non précisé"
                options={[{ value: '', label: 'Non précisé' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m }))]}
                onChange={set('payment_method')}
              />
              <div className="mbo-sum" style={{ borderTop: 0, paddingTop: 0 }}>
                <div><span>Reste à payer</span><b>{dzd(pay.rest)}</b></div>
              </div>
              {t.total > 0 && pay.value !== 'paid' && (
                <Btn icon="check" onClick={() => set('paid_amount')(t.total)}>Tout est payé</Btn>
              )}
            </>
          ) : (
            <>
              <ReadRow label="Encaissé">{dzd(draft.paid_amount)}</ReadRow>
              <ReadRow label="Mode">{draft.payment_method || 'Non précisé'}</ReadRow>
              <ReadRow label="Reste">{dzd(pay.rest)}</ReadRow>
            </>
          )}
        </Group>

        {/* --------------------------------------------------------- notes -- */}
        <Group title="Notes">
          {canEdit ? (
            <>
              <TextInput label="Message du client" value={draft.customer_note} onChange={set('customer_note')} multiline rows={3} maxLength={4000} />
              <TextInput label="Note interne (jamais imprimée)" value={draft.internal_note} onChange={set('internal_note')} multiline rows={3} maxLength={4000}
                placeholder="Stock vérifié, technicien prévu, remise accordée par…" />
            </>
          ) : (
            <>
              {draft.customer_note ? <div><p className="mbi-lbl">Message du client</p><p className="mbi-body">{draft.customer_note}</p></div> : null}
              {draft.internal_note ? <div><p className="mbi-lbl">Note interne</p><p className="mbi-note-ro">{draft.internal_note}</p></div> : null}
              {!draft.customer_note && !draft.internal_note && <p className="mbf-hint">Aucune note.</p>}
            </>
          )}
        </Group>

        {/* ---------------------------------------------- prise en charge -- */}
        <Group title="Prise en charge">
          <div className="mbi-who">
            <span className="av">{order.assigned_to ? String(nameOf(order.assigned_to) || '?').charAt(0).toUpperCase() : <Icon name="hand" size={15} />}</span>
            <span className="bd">
              {order.assigned_to ? (order.assigned_to === me ? 'Vous vous en occupez' : `Pris en charge par ${nameOf(order.assigned_to)}`) : 'Personne ne s’en occupe encore'}
              {order.confirmed_by && <small>Confirmée par {nameOf(order.confirmed_by)}{order.confirmed_at ? ` · ${agoOf(order.confirmed_at)}` : ''}</small>}
            </span>
            {canEdit && order.assigned_to !== me && (
              <button type="button" className="mbf-btn sm primary" disabled={!!busy}
                onClick={() => act('assign', () => assignItem('order', order.id, 'me'), 'C’est noté : vous vous en occupez')}>
                Je m’en occupe
              </button>
            )}
          </div>
          {canEdit && (
            <PickerInput
              label="Confier à"
              value={order.assigned_to || ''}
              options={teamOptions}
              onChange={(v) => act('assign', () => assignItem('order', order.id, v || 'none'), v ? `Confiée à ${nameOf(v)}` : 'Prise en charge retirée')}
            />
          )}
        </Group>

        {/* ---------------------------------------------------- documents -- */}
        <Group title="Envoyer au client" note="Le récapitulatif reprend les articles, les prix et le total affichés ci-dessus.">
          {waRecap && (
            <a className="mbf-btn" href={waRecap} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', background: '#E7F8EF', borderColor: '#BBE9CE', color: '#128C4B' }}>
              <Icon name="whatsapp" size={18} /> Récapitulatif sur WhatsApp
            </a>
          )}
          <Btn icon="note" onClick={() => copy(recap)}>Copier le récapitulatif</Btn>
          <Link className="mbf-btn" href={`/mobile/print/order/${order.id}`} style={{ textDecoration: 'none' }}><Icon name="printer" size={18} /> Bon de commande (PDF)</Link>
          <Link className="mbf-btn" href={`/mobile/print/proforma/${order.id}`} style={{ textDecoration: 'none' }}><Icon name="receipt" size={18} /> Facture proforma (PDF)</Link>
        </Group>

        {/* ---------------------------------------------------- historique -- */}
        {history.length > 0 && (
          <Group title="Historique">
            <ul className="mbo-hist">
              {history.map((h, i) => (
                <li key={i} className={h.type || ''}>
                  <span><b>{h.name || 'Site web'}</b> — {h.text}</span>
                  <time>{h.at ? `${dayLabelOf(h.at)}, ${timeOf(h.at)}` : ''}</time>
                </li>
              ))}
            </ul>
          </Group>
        )}

        {/* --------------------------------------------------------- statut -- */}
        {canEdit && (
          <Group title="Statut">
            <Btn icon="history" onClick={() => setStatusOpen(true)}>Changer le statut…</Btn>
            {order.status !== 'cancelled' && (
              <Btn variant="danger" icon="close" onClick={() => setCancelOpen(true)}>Annuler la commande…</Btn>
            )}
            <Btn variant="danger" icon="trash" onClick={() => setDelOpen(true)}>Supprimer la commande</Btn>
          </Group>
        )}

        <div className="mbf-pad" />
      </div>

      {canEdit && (
        <SaveBar
          dirty={dirty}
          busy={busy === 'save'}
          onSave={() => save()}
          onCancel={() => setDraft(base)}
        />
      )}

      {/* ------------------------------------------------ feuille : ligne -- */}
      <Sheet open={!!lineEdit} onClose={() => setLineEdit(null)} title={lineEdit?.isNew ? 'Nouvelle ligne' : 'Modifier la ligne'}>
        {lineEdit && (
          <>
            <TextInput label="Désignation" value={lineEdit.name} onChange={(v) => setLineEdit((l) => ({ ...l, name: v }))} maxLength={300} />
            {lineEdit.code && <p className="mbf-hint">Référence : {lineEdit.code}</p>}
            <div className="mbi-two">
              <NumberInput label="Quantité" value={lineEdit.qtyText} decimal onChange={(v) => setLineEdit((l) => ({ ...l, qtyText: v }))} />
              <NumberInput label="Prix unitaire (DA)" value={lineEdit.priceText} decimal placeholder="À fixer" onChange={(v) => setLineEdit((l) => ({ ...l, priceText: v }))} />
            </div>
            <p className="mbf-hint">
              {parseNumber(lineEdit.priceText) == null
                ? 'Sans prix, la commande ne peut pas être confirmée.'
                : `Total de la ligne : ${dzd(lineTotal({ qty: parseNumber(lineEdit.qtyText) || 1, unit_price: parseNumber(lineEdit.priceText) }))}`}
            </p>
            <Btn variant="primary" onClick={applyLine}>{lineEdit.isNew ? 'Ajouter la ligne' : 'Valider'}</Btn>
            {!lineEdit.isNew && <Btn variant="danger" icon="trash" onClick={() => removeLine(lineEdit.key)}>Retirer cette ligne</Btn>}
          </>
        )}
      </Sheet>

      {/* -------------------------------------------- feuille : ajout produit -- */}
      <AddProduct
        open={adding}
        onClose={() => setAdding(false)}
        onPick={(p) => {
          setAdding(false);
          setLineEdit({
            key: rnd(), isNew: true, product_id: p.id || null, code: p.code || null, name: p.name || p.code || '',
            qtyText: '1', priceText: p.price != null ? String(p.price) : '',
          });
        }}
      />

      {/* ------------------------------------------- feuille : remise, frais -- */}
      <Sheet open={pricing} onClose={() => setPricing(false)} title="Remise, livraison et TVA">
        <div className="mbf-field">
          <label>Remise</label>
          <div className="mbl-seg" role="group" aria-label="Type de remise">
            <button type="button" className={draft.discount_type === 'amount' ? 'on' : ''} onClick={() => set('discount_type')('amount')}>Montant (DA)</button>
            <button type="button" className={draft.discount_type === 'percent' ? 'on' : ''} onClick={() => set('discount_type')('percent')}>Pourcentage</button>
          </div>
        </div>
        <MoneyField label={draft.discount_type === 'percent' ? 'Remise (%)' : 'Remise (DA)'} value={draft.discount_value} onChange={set('discount_value')} />
        <MoneyField label="Livraison / installation (DA)" value={draft.shipping_fee} onChange={set('shipping_fee')} />
        <div className="mbf-field">
          <label>TVA</label>
          <div className="mbl-seg" role="group" aria-label="TVA">
            {[[0, 'Prix TTC (pas de TVA ajoutée)'], [19, '+ 19 %'], [9, '+ 9 %']].map(([v, label]) => (
              <button key={v} type="button" className={Number(draft.tax_rate) === v ? 'on' : ''} onClick={() => set('tax_rate')(v)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="mbo-sum">
          <div><span>Sous-total</span><b>{dzd(t.subtotal)}</b></div>
          {t.discount > 0 && <div><span>Remise</span><b>− {dzd(t.discount)}</b></div>}
          {t.shipping > 0 && <div><span>Livraison</span><b>{dzd(t.shipping)}</b></div>}
          {t.tax > 0 && <div><span>TVA</span><b>{dzd(t.tax)}</b></div>}
          <div className="grand"><span>Total</span><b>{dzd(t.total)}</b></div>
        </div>
        <Btn variant="primary" onClick={() => setPricing(false)}>Valider</Btn>
      </Sheet>

      {/* ------------------------------------------------ feuille : statut -- */}
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Changer le statut">
        <div className="mbf-options">
          {ORDER_STATUSES.map((s) => (
            <button key={s.value} type="button" className={`mbf-option ${s.value === order.status ? 'on' : ''}`} disabled={!!busy}
              onClick={async () => {
                if (s.value === order.status) { setStatusOpen(false); return; }
                if (s.value === 'cancelled') { setStatusOpen(false); setCancelOpen(true); return; }
                const ok = await changeStatus(s.value);
                if (ok) setStatusOpen(false);
              }}>
              <span className="bd"><b>{s.label}</b><small>{s.hint}</small></span>
              {s.value === order.status && <Icon name="check" size={19} />}
            </button>
          ))}
        </div>
      </Sheet>

      {/* ---------------------------------------------- feuille : annulation -- */}
      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Annuler la commande">
        <p className="mbf-hint">Le motif est gardé dans l’historique et sert aux statistiques (prix refusé, client injoignable…).</p>
        <div className="mbf-options">
          {CANCEL_REASONS.map((r) => (
            <button key={r} type="button" className={`mbf-option ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>
              <span className="bd"><b>{r}</b></span>
              {reason === r && <Icon name="check" size={19} />}
            </button>
          ))}
        </div>
        <TextInput label="Précision (facultatif)" value={cancelNote} onChange={setCancelNote} maxLength={500} />
        <Btn variant="danger" disabled={!reason || !!busy}
          onClick={async () => {
            const ok = await changeStatus('cancelled', { reason, note: cancelNote });
            if (ok) { setCancelOpen(false); setReason(''); setCancelNote(''); }
          }}>
          {busy === 'status' ? 'Un instant…' : reason ? 'Annuler la commande' : 'Choisissez un motif'}
        </Btn>
      </Sheet>

      <Confirm
        open={delOpen}
        onClose={() => setDelOpen(false)}
        busy={busy === 'delete'}
        title="Supprimer cette commande ?"
        body={`La commande ${order.number || ''} et son historique seront effacés définitivement. Pour une commande qui n’aboutit pas, préférez « Annuler la commande » : elle reste visible dans les statistiques.`}
        confirmLabel="Supprimer définitivement"
        danger
        onConfirm={async () => {
          setBusy('delete');
          try {
            const r = await deleteOrder(order.id);
            if (!r?.ok) { toast(r?.error || FAIL, 'bad'); return; }
            toast('Commande supprimée');
            reloadFeed?.();
            router.push('/mobile/inbox');
          } catch { toast(FAIL, 'bad'); } finally { setBusy(''); setDelOpen(false); }
        }}
      />

      <Confirm
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Modifications non enregistrées"
        body="Vous avez modifié cette commande sans l’enregistrer. Quitter quand même ?"
        confirmLabel="Quitter sans enregistrer"
        danger
        onConfirm={() => { setLeaveOpen(false); setDraft(base); router.push('/mobile/inbox'); }}
      />
    </>
  );
}

// ----------------------------------------------------------------------------
// Recherche d'un produit du catalogue (visibles et masqués), ou ligne libre.
// ----------------------------------------------------------------------------
function AddProduct({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [state, setState] = useState('idle');   // idle | loading | done | error
  const seq = useRef(0);

  useEffect(() => { if (!open) { setQ(''); setItems([]); setState('idle'); } }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); setState('idle'); return undefined; }
    const my = ++seq.current;
    setState('loading');
    const h = setTimeout(async () => {
      try {
        const r = await searchProducts(term);
        if (my !== seq.current) return;
        setItems(r?.items || []);
        setState(r?.ok === false ? 'error' : 'done');
      } catch { if (my === seq.current) setState('error'); }
    }, 280);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <Sheet open={open} onClose={onClose} title="Ajouter un article">
      <SearchBar value={q} onChange={setQ} placeholder="Nom ou référence du produit" />
      <div className="mbo-search-res">
        {state === 'loading' && <p className="mbf-hint">Recherche…</p>}
        {state === 'error' && <p className="mbf-hint bad">Recherche impossible. Vérifiez la connexion.</p>}
        {state === 'done' && items.length === 0 && <p className="mbf-hint">Aucun produit trouvé.</p>}
        <div className="mbf-options">
          {items.map((p) => (
            <button key={p.id} type="button" className="mbf-option" onClick={() => onPick(p)}>
              <span className="bd">
                <b>{p.name}</b>
                <small>{[p.code, p.price != null ? dzd(p.price) : 'Prix sur devis', p.active === false ? 'masqué sur le site' : null].filter(Boolean).join(' · ')}</small>
              </span>
              <Icon name="plus" size={18} />
            </button>
          ))}
        </div>
      </div>
      <Btn icon="pencil" onClick={() => onPick({ name: q.trim() })}>
        {q.trim() ? `Ligne libre « ${q.trim().slice(0, 40)} »` : 'Ligne libre (hors catalogue)'}
      </Btn>
    </Sheet>
  );
}
