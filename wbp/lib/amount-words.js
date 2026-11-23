// ============================================================================
// Montant en toutes lettres (français), pour la mention des documents :
// « Arrêté le présent document à la somme de : douze mille cinq cents dinars
// algériens et cinquante centimes ».
// Règles : traits d'union (rectifications de 1990), « et » pour 21, 31… 71,
// « quatre-vingts » / « cent » prennent un s seulement en fin de nombre,
// « mille » est invariable, « million / milliard » s'accordent.
// ============================================================================
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function below100(n) {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  let u = n % 10;
  if (t === 7 || t === 9) u += 10;            // soixante-dix, quatre-vingt-dix…
  let word = TENS[t];
  if (u === 0) return t === 8 ? 'quatre-vingts' : word;
  if ((u === 1 || u === 11) && t !== 8 && t !== 9) return `${word}-et-${UNITS[u]}`;
  return `${word}-${UNITS[u]}`;
}

function below1000(n, final) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = '';
  if (h === 1) out = 'cent';
  else if (h > 1) out = `${UNITS[h]}-cent${r === 0 && final ? 's' : ''}`;
  if (r) {
    let w = below100(r);
    // « quatre-vingts » perd son s s'il n'est pas en fin de nombre.
    if (!final && w === 'quatre-vingts') w = 'quatre-vingt';
    out = out ? `${out}-${w}` : w;
  }
  return out;
}

export function integerToWords(num) {
  let n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'zéro';
  const parts = [];
  const scales = [
    [1e9, 'milliard', 'milliards'],
    [1e6, 'million', 'millions'],
    [1e3, 'mille', 'mille'],
  ];
  for (const [value, one, many] of scales) {
    const q = Math.floor(n / value);
    if (!q) continue;
    n %= value;
    if (value === 1e3) parts.push(q === 1 ? 'mille' : `${below1000(q, false)}-mille`);
    else parts.push(`${below1000(q, true)}-${q > 1 ? many : one}`);
  }
  if (n) parts.push(below1000(n, true));
  return parts.join('-');
}

/** 12500.5 → « douze-mille-cinq-cents dinars algériens et cinquante centimes ». */
export function amountInWords(amount) {
  const total = Math.round((Number(amount) || 0) * 100);
  const dinars = Math.floor(total / 100);
  const cents = total % 100;
  let s = `${integerToWords(dinars)} dinar${dinars > 1 ? 's' : ''} algérien${dinars > 1 ? 's' : ''}`;
  if (cents) s += ` et ${integerToWords(cents)} centime${cents > 1 ? 's' : ''}`;
  // Majuscule initiale pour la mention imprimée.
  return s.charAt(0).toUpperCase() + s.slice(1);
}
