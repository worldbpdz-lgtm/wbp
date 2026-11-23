'use client';
// ============================================================================
// Fiche DEVIS du back-office : la demande du client, ses articles, les prix
// proposés, l'impression du devis / de la facture proforma, et la conversion
// en commande quand le client accepte.
// ============================================================================
import React, { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { LinesEditor, PricingBox, CustomerPicker, totalsOf } from '@/components/admin/crm/LinesEditor';
import { StatusBadge, ContactLinks, Who } from '@/components/admin/crm/ui';
import { saveQuote, setLeadStatus, assignItem, convertQuoteToOrder } from '@/app/admin/crm-actions';
import { deleteQuote } from '@/app/admin/actions';
import { QUOTE_STATUSES, quoteStatus, sourceLabel, lineKey } from '@/lib/crm';
import { parseNumber, dzd } from '@/lib/pricing';
import { fmtDateTime, addDaysYmd } from '@/lib/dates';

const FAIL = 'Action impossible — session expirée ? Rechargez la page.';

function initialState(q, prefill) {
  const o = q || {};
  const p = prefill || {};
  return {
    form: {
      customer_id: o.customer_id || p.customer_id || null,
      customer_name: o.customer_name ?? p.customer_name ?? '',
      company: o.company ?? p.company ?? '',
      phone: o.phone ?? p.phone ?? '',
      email: o.email ?? p.email ?? '',
      message: o.message ?? p.message ?? '',
      notes: o.notes ?? '',
      valid_until: o.valid_until || '',
    },
    // Anciennes demandes : lignes { id, name, code, qty } sans prix.
    items: (Array.isArray(o.items) ? o.items : (p.items || [])).map((l) => ({
      key: l.key || lineKey(),
      product_id: l.product_id ?? l.id ?? null,
      code: l.code || '',
      name: l.name || l.code || '',
      qty: l.qty ?? 1,
      unit_price: l.unit_price ?? null,
    })),
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

export default function QuoteEditor({ quote = null, customer = null, order = null, team = [], prefill = null, catalogPrices = {} }) {
  const router = useRouter();
  const isNew = !quote;
  const [st, setSt] = useState(() => initialState(quote, prefill));
  const [base, setBase] = useState(() => snapshot(initialState(quote, prefill)));
  const [updatedAt, setUpdatedAt] = useState(quote?.updated_at || null);
  const [linked, setLinked] = useState(customer);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [, startRefresh] = useTransition();

  const dirty = snapshot(st) !== base;
  const totals = totalsOf(st.items, st.pricing);

  useEffect(() => {
    if (!quote || dirty) return;
    const fresh = initialState(quote, null);
    setSt(fresh); setBase(snapshot(fresh)); setUpdatedAt(quote.updated_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.updated_at]);
  useEffect(() => { setLinked(customer); }, [customer]);
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const setF = (k) => (e) => setSt((s) => ({ ...s, form: { ...s.form, [k]: e?.target ? e.target.value : e } }));
  const flash = (m) => { setInfo(m); setTimeout(() => setInfo(''), 3500); };

  async function save({ quiet = false } = {}) {
    setErr(''); setBusy('save');
    try {
      const r = await saveQuote({
        id: quote?.id, expected_updated_at: updatedAt, ...st.form,
        items: st.items.map((l) => ({ ...l, qty: parseNumber(l.qty) || 1, unit_price: l.unit_price === '' || l.unit_price == null ? null : parseNumber(l.unit_price) })),
        ...st.pricing,
      });
      if (!r?.ok) { setErr(r?.error || FAIL); return false; }
      if (isNew) { router.push(`/admin/quotes/${r.id}`); return true; }
      setBase(snapshot(st)); setUpdatedAt(r.updated_at);
      if (!quiet) flash('Devis enregistré ✓');
      startRefresh(() => router.refresh());
      return true;
    } catch { setErr(FAIL); return false; } finally { setBusy(''); }
  }

  async function act(name, fn, okMsg) {
    setErr('');
    if (dirty) { const ok = await save({ quiet: true }); if (!ok) return null; }
    setBusy(name);
    try {
      const r = await fn();
      if (r && r.ok === false) { setErr(r.error || FAIL); return null; }
      if (okMsg) flash(okMsg);
      startRefresh(() => router.refresh());
      return r || { ok: true };
    } catch { setErr(FAIL); return null; } finally { setBusy(''); }
  }

  const pickCustomer = (c) => {
    setLinked(c);
    setSt((s) => ({ ...s, form: { ...s.form, customer_id: c.id, customer_name: c.name || s.form.customer_name, company: c.company || s.form.company, phone: c.phone || s.form.phone, email: c.email || s.form.email } }));
  };

  // Remplit les prix manquants avec le prix de vente du catalogue.
  const missing = st.items.filter((l) => (l.unit_price == null || l.unit_price === '') && l.product_id && catalogPrices[l.product_id] != null);
  const fillPrices = () => setSt((s) => ({
    ...s,
    items: s.items.map((l) => ((l.unit_price == null || l.unit_price === '') && l.product_id && catalogPrices[l.product_id] != null
      ? { ...l, unit_price: catalogPrices[l.product_id] } : l)),
  }));

  const status = quote?.status || 'new';
  const history = useMemo(() => (Array.isArray(quote?.history) ? [...quote.history].reverse() : []), [quote?.history]);
  const waText = quote ? `Bonjour ${quote.customer_name || ''}, World Business Plus concernant votre demande de devis ${quote.number || ''}.` : '';

  return (
    <>
      <Link href="/admin/quotes" className="crm-back"><Icon name="chevleft" size={15} /> Demandes de devis</Link>
      <div className="crm-head">
        <div>
          <h1>{isNew ? 'Nouveau devis' : `Devis ${quote.number || ''}`}{quote && <StatusBadge kind="quote" value={status} />}</h1>
          <div className="meta">
            {quote ? (<>
              <span>Reçu le {fmtDateTime(quote.created_at)}</span>
              <span>Origine : {sourceLabel(quote.source || 'website')}</span>
              {order && <span>Commande : <Link href={`/admin/orders/${order.id}`}>{order.number || 'voir'}</Link></span>}
            </>) : <span>Devis préparé pour un client qui a appelé, écrit ou est passé au dépôt.</span>}
          </div>
        </div>
        {quote && (
          <div className="adm-actions">
            <a className="adm-btn" href={`/admin/print/quote/${quote.id}`} target="_blank" rel="noreferrer"><Icon name="printer" size={15} /> Imprimer le devis</a>
          </div>
        )}
      </div>

      {err && <div className="crm-err" role="alert" style={{ marginBottom: 14 }}><Icon name="alert" size={17} /><span>{err}</span></div>}
      {info && <div className="crm-ok" role="status" style={{ marginBottom: 14 }}><Icon name="check" size={17} /><span>{info}</span></div>}

      <div className="crm-grid">
        <div className="crm-main">
          <section className="crm-card">
            <div className="hd"><h2>Client</h2>
              {linked?.id
                ? <span className="muted">Fiche : <Link href={`/admin/customers/${linked.id}`}>{linked.company || linked.name || 'voir'}</Link></span>
                : <span className="muted">Fiche retrouvée ou créée à l’enregistrement</span>}
            </div>
            <div className="bd">
              <CustomerPicker onPick={pickCustomer} />
              <div className="crm-row2">
                <label className="crm-f"><span>Nom</span><input value={st.form.customer_name} onChange={setF('customer_name')} /></label>
                <label className="crm-f"><span>Société</span><input value={st.form.company} onChange={setF('company')} /></label>
              </div>
              <div className="crm-row2">
                <label className="crm-f"><span>Téléphone</span><input value={st.form.phone} onChange={setF('phone')} inputMode="tel" /></label>
                <label className="crm-f"><span>E-mail</span><input value={st.form.email} onChange={setF('email')} type="email" /></label>
              </div>
              <ContactLinks phone={st.form.phone} email={st.form.email} waText={waText} subject={quote ? `Votre demande de devis ${quote.number || ''}` : ''} />
              <label className="crm-f"><span>Demande du client</span><textarea value={st.form.message} onChange={setF('message')} rows={3} /></label>
            </div>
          </section>

          <section className="crm-card">
            <div className="hd"><h2>Articles et prix proposés</h2>
              {missing.length > 0 && <button type="button" className="adm-btn sm" onClick={fillPrices}>Reprendre les prix du catalogue ({missing.length})</button>}
            </div>
            <div className="bd">
              <LinesEditor items={st.items} onChange={(items) => setSt((s) => ({ ...s, items }))} />
              <PricingBox value={st.pricing} onChange={(pricing) => setSt((s) => ({ ...s, pricing }))} items={st.items}>
                <div className="crm-row2">
                  <label className="crm-f"><span>Valable jusqu’au</span>
                    <input type="date" value={st.form.valid_until || ''} onChange={setF('valid_until')} />
                  </label>
                  <div className="crm-f"><span>&nbsp;</span>
                    <div className="adm-actions">
                      {[15, 30].map((d) => <button key={d} type="button" className="adm-btn sm" onClick={() => setF('valid_until')(addDaysYmd(d))}>{d} jours</button>)}
                    </div>
                  </div>
                </div>
              </PricingBox>
            </div>
          </section>

          <section className="crm-card">
            <div className="hd"><h2>Note interne</h2><span className="muted">Jamais visible par le client, jamais imprimée</span></div>
            <div className="bd">
              <label className="crm-f"><textarea value={st.form.notes} onChange={setF('notes')} rows={3} placeholder="Ex. rappeler jeudi, attend validation de sa direction…" /></label>
            </div>
          </section>

          {(dirty || isNew) && (
            <div className="crm-savebar">
              <span>{isNew ? 'Nouveau devis — pas encore enregistré' : 'Modifications non enregistrées'}</span>
              <div className="adm-actions">
                {!isNew && <button type="button" className="adm-btn" onClick={() => setSt(initialState(quote, null))} disabled={!!busy}>Annuler</button>}
                <button type="button" className="adm-btn primary" onClick={() => save()} disabled={!!busy}>{busy === 'save' ? 'Enregistrement…' : isNew ? 'Créer le devis' : 'Enregistrer'}</button>
              </div>
            </div>
          )}
        </div>

        <aside className="crm-side">
          {!isNew && (
            <>
              <section className="crm-card">
                <div className="hd"><h2>Suite à donner</h2></div>
                <div className="bd">
                  {order ? (
                    <Link className="adm-btn primary crm-bigbtn" href={`/admin/orders/${order.id}`}><Icon name="arrow" size={16} /> Ouvrir la commande {order.number}</Link>
                  ) : (
                    <button type="button" className="adm-btn primary crm-bigbtn" disabled={!!busy}
                      onClick={async () => {
                        const r = await act('convert', () => convertQuoteToOrder(quote.id, { status: 'confirmed' }));
                        if (r?.id) router.push(`/admin/orders/${r.id}${r.warn ? '?created=pending' : ''}`);
                      }}>
                      <Icon name="check" size={17} /> {busy === 'convert' ? 'Un instant…' : 'Le client accepte : créer la commande'}
                    </button>
                  )}
                  <p className="adm-muted" style={{ margin: 0 }}>
                    {order ? 'Ce devis a déjà été converti.' : `Les lignes et les prix (${dzd(totals.total)}) sont repris dans une nouvelle commande, confirmée si tous les prix sont renseignés.`}
                  </p>
                  <label className="crm-f"><span>Statut du devis</span>
                    <select value={status} disabled={!!busy}
                      onChange={(e) => act('status', () => setLeadStatus('quote', quote.id, e.target.value), `Statut : ${quoteStatus(e.target.value).label}`)}>
                      {QUOTE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              <section className="crm-card">
                <div className="hd"><h2>Pris en charge par</h2></div>
                <div className="bd">
                  <Who email={quote.assigned_to} team={team} empty="Personne pour l’instant" />
                  <select className="adm-btn" style={{ width: '100%' }} value={quote.assigned_to || ''} disabled={!!busy}
                    onChange={(e) => act('assign', () => assignItem('quote', quote.id, e.target.value || 'none'), 'Prise en charge mise à jour')}>
                    <option value="">Personne</option>
                    {team.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
                  </select>
                </div>
              </section>

              <section className="crm-card">
                <div className="hd"><h2>Historique</h2></div>
                <div className="bd">
                  {history.length === 0 ? <span className="adm-muted">Demande reçue le {fmtDateTime(quote.created_at)}. Aucun autre événement.</span> : (
                    <ul className="crm-hist">
                      {history.slice(0, 40).map((h, i) => <li key={i} className={h.type}><b>{h.name || 'Système'}</b> — {h.text}<time>{fmtDateTime(h.at)}</time></li>)}
                    </ul>
                  )}
                </div>
              </section>

              <button type="button" className="adm-btn danger" disabled={!!busy}
                onClick={async () => {
                  if (!window.confirm(`Supprimer définitivement le devis ${quote.number || ''} ?\n\nPour le ranger sans le perdre, choisissez plutôt le statut « Clôturé » ou « Perdu ».`)) return;
                  setBusy('delete');
                  try {
                    const r = await deleteQuote(quote.id);
                    if (!r?.ok) { setErr(r?.error || FAIL); return; }
                    router.push('/admin/quotes'); router.refresh();
                  } catch { setErr(FAIL); } finally { setBusy(''); }
                }}>
                <Icon name="trash" size={15} /> Supprimer le devis
              </button>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
