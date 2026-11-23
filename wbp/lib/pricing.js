// ============================================================================
// Calcul des montants d'un devis ou d'une commande.
// ----------------------------------------------------------------------------
// Module PUR, exécuté à l'identique dans le navigateur (aperçu en direct
// pendant la saisie) et sur le serveur (seule valeur enregistrée : le serveur
// ne fait JAMAIS confiance à un total envoyé par le navigateur).
//
//   sous-total   = Σ quantité × prix unitaire
//   remise       = montant (DA) ou pourcentage du sous-total
//   base         = sous-total − remise + frais de livraison / installation
//   TVA          = base × taux      (0 % = prix TTC, pas de ligne de TVA)
//   total        = base + TVA
//
// Une ligne sans prix (prix « à définir ») compte pour 0 et est signalée par
// `unpriced` : une commande ne peut pas être confirmée tant qu'il en reste.
// ============================================================================

export const MAX_LINES = 100;
const MAX_MONEY = 1e11;      // 100 milliards de DA : au-delà, c'est une faute de frappe
const MAX_QTY = 1e6;

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** « 12 500,5 » ou « 12500.5 » → 12500.5 ; vide → null. */
export function parseNumber(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s| | /g, '').replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(s) || s === '' || s === '.' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function cleanMoney(v, { allowNull = true } = {}) {
  const n = parseNumber(v);
  if (n == null) return allowNull ? null : 0;
  return round2(clamp(n, 0, MAX_MONEY));
}

export function cleanQty(v) {
  const n = parseNumber(v);
  if (n == null || n <= 0) return 1;
  return round2(clamp(n, 0.01, MAX_QTY));
}

const str = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};

/**
 * Nettoie les lignes reçues du navigateur : bornes, types, champs autorisés.
 * Une ligne sans désignation ni référence est ignorée.
 */
export function sanitizeLines(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input.slice(0, MAX_LINES)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = str(raw.name, 300);
    const code = str(raw.code, 120);
    if (!name && !code) continue;
    out.push({
      key: str(raw.key, 24) || Math.random().toString(36).slice(2, 10),
      product_id: str(raw.product_id ?? raw.id, 60),
      code,
      name: name || code,
      qty: cleanQty(raw.qty),
      unit_price: cleanMoney(raw.unit_price),
    });
  }
  return out;
}

export function lineTotal(l) {
  return round2((Number(l?.qty) || 0) * (Number(l?.unit_price) || 0));
}

/**
 * @returns {{subtotal:number, discount:number, shipping:number, base:number,
 *            tax:number, total:number, unpriced:number, lines:number}}
 */
export function computeTotals({ items = [], discount_type = 'amount', discount_value = 0, shipping_fee = 0, tax_rate = 0 } = {}) {
  const lines = Array.isArray(items) ? items : [];
  const subtotal = round2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const dv = Math.max(0, Number(discount_value) || 0);
  const discount = round2(discount_type === 'percent'
    ? subtotal * clamp(dv, 0, 100) / 100
    : clamp(dv, 0, subtotal));
  const shipping = round2(Math.max(0, Number(shipping_fee) || 0));
  const base = round2(subtotal - discount + shipping);
  const rate = clamp(Number(tax_rate) || 0, 0, 100);
  const tax = round2(base * rate / 100);
  const total = round2(base + tax);
  const unpriced = lines.filter((l) => l?.unit_price == null || l.unit_price === '').length;
  return { subtotal, discount, shipping, base, tax, total, unpriced, lines: lines.length };
}

/** Nettoie le bloc « montants » d'un devis ou d'une commande. */
export function sanitizePricing(p = {}) {
  return {
    discount_type: p.discount_type === 'percent' ? 'percent' : 'amount',
    discount_value: cleanMoney(p.discount_value, { allowNull: false }),
    shipping_fee: cleanMoney(p.shipping_fee, { allowNull: false }),
    tax_rate: round2(clamp(parseNumber(p.tax_rate) || 0, 0, 100)),
  };
}

// ---------------------------------------------------------------- paiement --
export function paymentStatus(total, paid) {
  const t = Number(total) || 0;
  const p = Number(paid) || 0;
  if (p <= 0) return { value: 'unpaid', label: 'Non payé', tone: 'warn', rest: round2(t) };
  if (p + 0.009 >= t) return { value: 'paid', label: 'Payé', tone: 'ok', rest: 0 };
  return { value: 'partial', label: 'Acompte versé', tone: 'info', rest: round2(t - p) };
}

// -------------------------------------------------------------- affichage --
const NF = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 12500.5 → « 12 500,5 DA » ; null → « — ». */
export function dzd(n, { empty = '—' } = {}) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return empty;
  return `${NF.format(Number(n)).replace(/ /g, ' ')} DA`;
}

export const fmtQty = (n) => NF.format(Number(n) || 0);
