// ============================================================================
// Téléphones et e-mails — formes canoniques et liens de contact.
// ----------------------------------------------------------------------------
// Module PUR (aucune dépendance) : utilisé par le serveur (rapprochement des
// fiches clients) ET par le navigateur (boutons Appeler / WhatsApp).
//
// ⚠️ normPhone() DOIT rester identique à la fonction SQL wbp_norm_phone()
// (supabase/commandes-notifications.sql) : la colonne customers.phone_norm est
// calculée par la base avec la version SQL, et le serveur y cherche la valeur
// calculée ici. Si les deux divergent, un client déjà connu n'est plus reconnu
// et une fiche en double est créée.
// ============================================================================

/**
 * Forme canonique d'un numéro : chiffres seuls, indicatif 213 en tête.
 *   « 0560 01 82 06 »   → 213560018206
 *   « +213 560018206 »  → 213560018206
 *   « 00213560018206 »  → 213560018206
 *   « 560018206 »       → 213560018206 (0 oublié)
 *   « +33 6 12 34 56 78 » → 33612345678 (étranger : laissé tel quel)
 * Renvoie null pour une saisie inexploitable (« 12 », vide…).
 */
// Chiffres arabes (٠١٢… et ۰۱۲…) tapés depuis un clavier arabe → 0-9.
const toAsciiDigits = (s) => String(s).replace(/[\u0660-\u0669\u06F0-\u06F9]/g,
  (c) => String((c.charCodeAt(0) & 0xF) % 10));

export function normPhone(p) {
  if (p == null) return null;
  let d = toAsciiDigits(p).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('213')) {
    if (d.startsWith('0')) d = `213${d.slice(1)}`;
    else if (d.length === 9) d = `213${d}`;
  }
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

/** E-mail en minuscules, ou null s'il n'a pas l'air d'une adresse. */
export function normEmail(e) {
  const s = String(e == null ? '' : e).trim();
  return s.indexOf('@') > 0 ? s.toLowerCase() : null;
}

/** Numéro pour le composeur (tel:) : on garde le « + », on jette le reste. */
export function telOf(phone) {
  const t = toAsciiDigits(phone || '').replace(/[^\d+]/g, '');
  return t.replace(/\+/g, '').length >= 6 ? t : null;
}

/**
 * Numéro WhatsApp (wa.me) : international, chiffres seuls, sans « + ».
 * Un numéro étranger est laissé tel quel — lui coller 213 ouvrirait une
 * conversation avec un inconnu.
 */
export function waOf(phone) {
  let d = toAsciiDigits(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('213')) {
    if (d.startsWith('0')) d = `213${d.slice(1)}`;
    else if (d.length === 9) d = `213${d}`;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Lien WhatsApp, avec un message prérempli facultatif. */
export function waLink(phone, text) {
  const n = waOf(phone);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Un numéro algérien plausible (au moins 9 chiffres utiles). */
export function isPlausiblePhone(p) {
  const n = normPhone(p);
  return !!n && n.length >= 11;
}
