/* ============================================================================
   World Business Plus — sous-catégories (types de système)
   ----------------------------------------------------------------------------
   Certaines catégories regroupent plusieurs familles techniques qui ne se
   montent pas ensemble. « Alarme incendie » en est le cas typique : une
   centrale ADRESSABLE et une centrale CONVENTIONNELLE ne sont pas compatibles,
   et l'installateur cherche l'une OU l'autre — jamais les deux mélangées.

   Le type est déduit du produit, dans cet ordre :
     1. une ligne de specs explicite   (« Type » / « Système » = Adressable…)
     2. le nom et la référence du produit
     3. la marque (Ajax = sans fil par nature)
     4. défaut → « autres »

   Aucune migration de base n'est nécessaire : ajoutez simplement une ligne de
   specs « Type : Adressable » sur un produit pour forcer son classement.
   ========================================================================== */

/** Clés de specs qui portent explicitement le type de système. */
const TYPE_KEYS = /^(type|syst[eè]me|technologie|famille)$/i;

/**
 * Sous-types par catégorie. L'ordre compte : le premier `match` qui répond
 * l'emporte, donc les règles les plus spécifiques passent en premier.
 * `match: null` = fourre-tout, toujours placé en dernier.
 */
export const SUBCATS = {
  fire: [
    {
      id: 'accessoires', icon: 'box',
      fr: 'Câbles & accessoires', en: 'Cables & accessories', ar: 'كابلات وملحقات',
      blurb: {
        fr: 'Câbles résistants au feu, supports et pièces de montage.',
        en: 'Fire-resistant cable, brackets and mounting parts.',
        ar: 'كابلات مقاومة للحريق ودعامات وقطع تركيب.',
      },
      match: /c[âa]bl|cable|support|goulotte|bo[îi]tier|batterie|accessoire|fixation/i,
    },
    {
      id: 'adressable', icon: 'bolt',
      fr: 'Adressable', en: 'Addressable', ar: 'نظام عنواني',
      blurb: {
        fr: 'Chaque point est identifié individuellement sur la boucle — localisation exacte du sinistre.',
        en: 'Every device is individually identified on the loop — exact fire location.',
        ar: 'كل جهاز معرّف بشكل فردي على الحلقة — تحديد دقيق لموقع الحريق.',
      },
      // « adressa » couvre adressable / adressage / les libellés tronqués.
      match: /adressa|addressa|analogique|\bloop\b|boucle/i,
    },
    {
      id: 'conventionnel', icon: 'layers',
      fr: 'Conventionnel', en: 'Conventional', ar: 'نظام تقليدي',
      blurb: {
        fr: 'Détection par zone, câblage simple — la solution économique pour les petits sites.',
        en: 'Zone-based detection with simple wiring — the cost-effective choice for small sites.',
        ar: 'كشف حسب المنطقة بأسلاك بسيطة — الحل الاقتصادي للمواقع الصغيرة.',
      },
      // Les centrales conventionnelles se comptent en ZONES (les adressables en
      // boucles, testées plus haut) : « 4 zones », « MAG8 »… tombent donc ici.
      match: /convention|\bzones?\b|\bmag ?\d/i,
    },
    {
      id: 'autonome', icon: 'wifi',
      fr: 'Autonome & sans fil', en: 'Standalone & wireless', ar: 'مستقل ولاسلكي',
      blurb: {
        fr: 'Détecteurs à pile, sans centrale ni câblage — logements et petits locaux.',
        en: 'Battery detectors, no panel or wiring — homes and small premises.',
        ar: 'كواشف بالبطارية دون لوحة أو أسلاك — للمنازل والمحلات الصغيرة.',
      },
      match: /autonome|sans[- ]fil|wireless|standalone/i,
      brands: ['ajax'],
    },
    {
      id: 'autres', icon: 'grid',
      fr: 'Autres', en: 'Other', ar: 'أخرى',
      blurb: {
        fr: 'Références incendie non rattachées à un type de système.',
        en: 'Fire items not tied to a specific system type.',
        ar: 'منتجات حريق غير مرتبطة بنوع نظام محدد.',
      },
      match: null,
    },
  ],
};

/** Les sous-types définis pour une catégorie (tableau vide si aucun). */
export function subcatsFor(catId) {
  return SUBCATS[catId] || [];
}

/** Un sous-type par son id. */
export function subcatById(catId, subId) {
  return subcatsFor(catId).find((s) => s.id === subId) || null;
}

/** Texte cherchable d'un produit : nom + référence + valeurs de specs. */
function haystack(product) {
  const specs = Array.isArray(product.specs) ? product.specs : [];
  return [product.name, product.code, ...specs.flat()].filter(Boolean).join(' ');
}

/** Valeur d'une spec explicite « Type » / « Système », si elle existe. */
function declaredType(product) {
  const specs = Array.isArray(product.specs) ? product.specs : [];
  const row = specs.find((s) => Array.isArray(s) && TYPE_KEYS.test(String(s[0] || '').trim()));
  return row ? String(row[1] || '') : '';
}

/**
 * Sous-type d'un produit dans sa catégorie.
 * @returns {string|null} l'id du sous-type, ou null si la catégorie n'en a pas.
 */
export function resolveSubcat(product) {
  if (!product) return null;
  const list = subcatsFor(product.cat);
  if (!list.length) return null;

  // 1. Spec explicite — prioritaire sur toute déduction.
  const declared = declaredType(product);
  if (declared) {
    const hit = list.find((s) => s.match && s.match.test(declared));
    if (hit) return hit.id;
  }

  // 2. Nom / référence / specs.
  const text = haystack(product);
  const byText = list.find((s) => s.match && s.match.test(text));
  if (byText) return byText.id;

  // 3. Marque (Ajax ne fait que du sans-fil).
  const byBrand = list.find((s) => Array.isArray(s.brands) && s.brands.includes(product.brand));
  if (byBrand) return byBrand.id;

  // 4. Fourre-tout.
  const fallback = list.find((s) => !s.match);
  return fallback ? fallback.id : null;
}

/** Nombre de produits par sous-type, pour afficher les compteurs. */
export function countSubcats(products, catId) {
  const counts = {};
  for (const p of products) {
    if (p.cat !== catId) continue;
    const s = resolveSubcat(p);
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}
