import { notFound, redirect } from 'next/navigation';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getSettings } from '@/lib/queries';
import { SITE } from '@/lib/site';
import { computeTotals, dzd, fmtQty, lineTotal } from '@/lib/pricing';
import { amountInWords } from '@/lib/amount-words';
import { deliveryLabel } from '@/lib/crm';
import { fmtDate } from '@/lib/dates';
import PrintBar from '@/components/admin/crm/PrintBar';

// ============================================================================
// Documents imprimables : bon de commande, facture proforma, devis.
// ----------------------------------------------------------------------------
// Composant SERVEUR partagé par deux adresses :
//   /admin/print/<kind>/<id>    depuis le back-office (ordinateur)
//   /mobile/print/<kind>/<id>   depuis l'application mobile — même document,
//                               mais l'adresse reste dans la portée de l'app
//                               installée (sur iPhone, une page hors portée
//                               s'ouvrirait sans la session de l'app).
// kind : order (bon de commande) · proforma (facture proforma, commande) ·
//        quote (devis / facture proforma d'une demande de devis).
// La page refait elle-même le contrôle d'accès.
// « Imprimer » → « Enregistrer au format PDF » donne le fichier à envoyer.
// ============================================================================

export const PRINT_TITLES = { order: 'Bon de commande', proforma: 'Facture proforma', quote: 'Devis' };

export default async function PrintDocument({ kind, id, backHref, loginHref = '/admin/login', hint }) {
  if (!PRINT_TITLES[kind] || !/^[0-9a-f-]{36}$/i.test(String(id || ''))) notFound();
  if (!hasSupabase()) notFound();
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) redirect(loginHref);

  const sb = createAdminClient();
  const table = kind === 'quote' ? 'quote_requests' : 'orders';
  const { data: doc } = await sb.from(table).select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (!doc) notFound();
  const [{ data: customer }, settings] = await Promise.all([
    doc.customer_id ? sb.from('customers').select('*').eq('id', doc.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    getSettings(),
  ]);
  const D = settings.documents || {};
  const contact = settings.contact || {};
  const items = Array.isArray(doc.items) ? doc.items : [];
  const t = computeTotals({ ...doc, items });
  const taxed = Number(doc.tax_rate) > 0;
  const number = doc.number || '';
  const date = fmtDate(kind === 'quote' ? doc.updated_at || doc.created_at : doc.confirmed_at || doc.created_at);
  const validity = kind !== 'order'
    ? (doc.valid_until ? fmtDate(doc.valid_until) : fmtDate(new Date(Date.now() + (Number(D.validity_days) || 15) * 86400000).toISOString()))
    : null;
  const back = backHref || (kind === 'quote' ? `/admin/quotes/${id}` : `/admin/orders/${id}`);
  const c = customer || {};
  const ids = [c.nif && `NIF : ${c.nif}`, c.nis && `NIS : ${c.nis}`, c.rc && `RC : ${c.rc}`, c.art && `AI : ${c.art}`].filter(Boolean);
  const legal = String(D.legal || '').split('\n').map((x) => x.trim()).filter(Boolean);

  return (
    <div className="pdoc-page">
      <style>{CSS}</style>
      <PrintBar backHref={back} hint={hint} />
      <article className="pdoc">
        <header className="pdoc-hd">
          <div className="pdoc-co">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/wbp1.png" alt="" width={64} height={64} />
            <div>
              <b>{D.company || 'SARL World Business Plus'}</b>
              <span>{D.activity}</span>
              <span>{contact.address?.fr}</span>
              <span>{[...(contact.phones || []), contact.fax].filter(Boolean).join(' · ')}</span>
              <span>{contact.email}</span>
            </div>
          </div>
          <div className="pdoc-title">
            <h1>{PRINT_TITLES[kind]}</h1>
            <dl>
              <dt>N°</dt><dd>{number || '—'}</dd>
              <dt>Date</dt><dd>{date}</dd>
              {validity && (<><dt>Valable jusqu’au</dt><dd>{validity}</dd></>)}
              {kind !== 'quote' && doc.due_date && (<><dt>Livraison prévue</dt><dd>{fmtDate(doc.due_date)}</dd></>)}
            </dl>
          </div>
        </header>

        <section className="pdoc-parties">
          <div>
            <h2>Client</h2>
            <b>{doc.company || doc.customer_name || '—'}</b>
            {doc.company && doc.customer_name && <span>À l’attention de : {doc.customer_name}</span>}
            {kind !== 'quote' && (doc.address || doc.city || doc.wilaya) && <span>{[doc.address, doc.city, doc.wilaya].filter(Boolean).join(', ')}</span>}
            {kind === 'quote' && (c.address || c.city || c.wilaya) && <span>{[c.address, c.city, c.wilaya].filter(Boolean).join(', ')}</span>}
            {doc.phone && <span>Tél. : {doc.phone}</span>}
            {doc.email && <span>{doc.email}</span>}
            {ids.length > 0 && <span className="ids">{ids.join(' · ')}</span>}
          </div>
          {kind !== 'quote' && (
            <div>
              <h2>Livraison</h2>
              <b>{deliveryLabel(doc.delivery_method)}</b>
              {doc.delivery_method === 'pickup' && <span>Au dépôt : {contact.address?.fr}</span>}
              {doc.payment_method && <span>Paiement : {doc.payment_method}</span>}
            </div>
          )}
        </section>

        <table className="pdoc-lines">
          <thead>
            <tr><th style={{ width: '4%' }}>#</th><th style={{ width: '18%' }}>Référence</th><th>Désignation</th><th className="r" style={{ width: '8%' }}>Qté</th><th className="r" style={{ width: '15%' }}>P.U.{taxed ? ' HT' : ''}</th><th className="r" style={{ width: '15%' }}>Montant{taxed ? ' HT' : ''}</th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="empty">Aucun article.</td></tr>}
            {items.map((l, i) => {
              const priced = l.unit_price != null && l.unit_price !== '';
              return (
                <tr key={l.key || i}>
                  <td>{i + 1}</td>
                  <td className="code">{l.code || ''}</td>
                  <td>{l.name}</td>
                  <td className="r">{fmtQty(l.qty)}</td>
                  <td className="r">{priced ? dzd(l.unit_price) : 'à définir'}</td>
                  <td className="r">{priced ? dzd(lineTotal(l)) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className="pdoc-sum">
          <div className="pdoc-words">
            {t.unpriced > 0 ? (
              <p><b>Document provisoire :</b> {t.unpriced} ligne{t.unpriced > 1 ? 's' : ''} sans prix. Le montant total sera confirmé par nos services.</p>
            ) : (
              <p>Arrêté{kind === 'order' ? ' le présent bon de commande' : kind === 'proforma' ? 'e la présente facture proforma' : ' le présent devis'} à la somme de :<br /><b>{amountInWords(t.total)}</b>{taxed ? ' (TTC)' : ''}.</p>
            )}
            {kind === 'order' && D.terms_order && <p className="terms">{D.terms_order}</p>}
            {kind !== 'order' && D.terms_quote && <p className="terms">{D.terms_quote}</p>}
            {kind === 'quote' && doc.message && <p className="terms">Votre demande : « {String(doc.message).slice(0, 400)} »</p>}
          </div>
          <dl className="pdoc-totals">
            <dt>Total{taxed ? ' HT' : ''}</dt><dd>{dzd(t.subtotal)}</dd>
            {t.discount > 0 && (<><dt>Remise{doc.discount_type === 'percent' ? ` ${Number(doc.discount_value)} %` : ''}</dt><dd>− {dzd(t.discount)}</dd></>)}
            {t.shipping > 0 && (<><dt>Livraison / installation</dt><dd>{dzd(t.shipping)}</dd></>)}
            {taxed && (<><dt>TVA {Number(doc.tax_rate)} %</dt><dd>{dzd(t.tax)}</dd></>)}
            <dt className="g">Net à payer{taxed ? ' TTC' : ''}</dt><dd className="g">{dzd(t.total)}</dd>
            {kind !== 'quote' && Number(doc.paid_amount) > 0 && (<><dt>Déjà réglé</dt><dd>{dzd(doc.paid_amount)}</dd><dt>Reste à payer</dt><dd>{dzd(Math.max(0, t.total - Number(doc.paid_amount)))}</dd></>)}
          </dl>
        </section>

        <section className="pdoc-sign">
          <div><span>Le client</span><i>Cachet et signature</i></div>
          <div><span>{D.company || 'World Business Plus'}</span><i>Cachet et signature</i></div>
        </section>

        <footer className="pdoc-ft">
          {legal.length ? legal.map((l) => <span key={l}>{l}</span>) : <span>{D.company || 'SARL World Business Plus'} — {contact.address?.fr}</span>}
        </footer>
      </article>
    </div>
  );
}

const CSS = `
.pdoc-page{background:#eceae6;min-height:100vh;padding:24px 12px 48px;font-family:Arial,Helvetica,sans-serif;color:#1b1410}
.pdoc-bar{max-width:794px;margin:0 auto 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.pdoc-bar button{background:#FF5A1F;color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:700;font-size:14px;cursor:pointer}
.pdoc-bar a{color:#1b1410;font-weight:700;font-size:14px}
.pdoc-bar span{font-size:12px;color:#6f6359;flex:1;min-width:220px}
.pdoc{max-width:794px;margin:0 auto;background:#fff;padding:40px 44px;box-shadow:0 20px 50px -30px rgba(0,0,0,.45);font-size:12.5px;line-height:1.45}
.pdoc-hd{display:flex;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:3px solid #FF5A1F}
.pdoc-co{display:flex;gap:14px;align-items:flex-start}
.pdoc-co img{width:64px;height:64px;object-fit:contain}
.pdoc-co div{display:flex;flex-direction:column;gap:1px;font-size:11.5px;color:#4a3f37}
.pdoc-co b{font-size:15px;color:#1b1410;margin-bottom:2px}
.pdoc-title{text-align:right}
.pdoc-title h1{margin:0 0 8px;font-size:22px;letter-spacing:.04em;text-transform:uppercase;color:#FF5A1F}
.pdoc-title dl{display:grid;grid-template-columns:auto auto;gap:2px 10px;margin:0;justify-content:end;font-size:12px}
.pdoc-title dt{color:#6f6359}.pdoc-title dd{margin:0;font-weight:700}
.pdoc-parties{display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin:20px 0}
.pdoc-parties>div{border:1px solid #e6ded2;border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.pdoc-parties h2{margin:0 0 4px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#a89c8d}
.pdoc-parties b{font-size:13.5px}
.pdoc-parties .ids{font-size:11px;color:#6f6359;margin-top:4px}
.pdoc-lines{width:100%;border-collapse:collapse;margin-top:4px}
.pdoc-lines th{background:#1b1410;color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:8px}
.pdoc-lines td{padding:8px;border-bottom:1px solid #eee5d9;vertical-align:top}
.pdoc-lines tr:nth-child(even) td{background:#fbf8f3}
.pdoc-lines .r{text-align:right;white-space:nowrap}
.pdoc-lines .code{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#4a3f37}
.pdoc-lines .empty{text-align:center;color:#a89c8d;padding:20px}
.pdoc-sum{display:grid;grid-template-columns:1fr 280px;gap:20px;margin-top:16px;align-items:start}
.pdoc-words p{margin:0 0 8px}
.pdoc-words .terms{font-size:11px;color:#6f6359}
.pdoc-totals{display:grid;grid-template-columns:1fr auto;gap:5px 12px;margin:0;border:1px solid #e6ded2;border-radius:8px;padding:12px 14px}
.pdoc-totals dt{color:#4a3f37}.pdoc-totals dd{margin:0;text-align:right;font-weight:700;white-space:nowrap}
.pdoc-totals .g{font-size:15px;color:#1b1410;border-top:2px solid #FF5A1F;padding-top:7px;margin-top:3px}
.pdoc-sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:30px}
.pdoc-sign div{border:1px dashed #d8cfc2;border-radius:8px;height:96px;padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between}
.pdoc-sign span{font-weight:700;font-size:12px}.pdoc-sign i{font-size:10.5px;color:#a89c8d}
.pdoc-ft{margin-top:26px;padding-top:10px;border-top:1px solid #eee5d9;display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;font-size:10px;color:#6f6359;text-align:center}
@media screen and (max-width:700px){.pdoc-page{padding:14px 8px 36px}.pdoc{padding:22px 16px}.pdoc-hd,.pdoc-parties,.pdoc-sum{grid-template-columns:1fr;flex-direction:column}.pdoc-sign{gap:10px}.pdoc-title{text-align:left}.pdoc-title dl{justify-content:start}.pdoc-lines{font-size:11.5px}.pdoc-lines th:nth-child(2),.pdoc-lines td:nth-child(2){display:none}.pdoc-lines th,.pdoc-lines td{padding:7px 5px}.pdoc-bar button{width:100%}}
@page{size:A4;margin:12mm}
@media print{
  .pdoc-page{background:#fff;padding:0}
  .pdoc-bar{display:none}
  .pdoc{box-shadow:none;padding:0;max-width:none}
  .pdoc-lines th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pdoc-lines tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pdoc-lines tr{break-inside:avoid}
}
`;
