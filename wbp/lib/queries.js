import { createClient, createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { fallbackCatalog } from '@/lib/fallback-catalog';
import { PRODUCT_IMAGES } from '@/lib/product-images.generated';
import { SITE } from '@/lib/site';

const mapBrand = (r) => ({ id: r.id, name: r.name, short: r.short || r.name, color: r.color, logo_url: r.logo_url || null, desc: r.description || {} });
const mapCategory = (r) => ({ id: r.id, icon: r.icon, image_url: r.image_url || null, fr: r.name?.fr, en: r.name?.en, ar: r.name?.ar, blurb: r.blurb || {} });

// ----------------------------------------------------------------------------
// Photos : 420 fichiers sont livrés dans public/products (nommés d'après
// l'identifiant produit) mais seule une quarantaine de lignes avait un
// products.image_url renseigné — d'où « les images ne s'affichent que sur
// quelques produits ». On complète donc ce qui vient de la base avec les
// fichiers réellement présents dans le dépôt (manifeste généré au build).
// La base reste maîtresse : une valeur saisie dans /admin gagne toujours.
// ----------------------------------------------------------------------------
function withLocalImages(r) {
  const local = PRODUCT_IMAGES[r.id] || [];
  const fromDb = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
  const images = Array.from(new Set([...fromDb, ...local]));
  return { image_url: r.image_url || images[0] || null, images };
}

const mapProduct = (r) => {
  const { image_url, images } = withLocalImages(r);
  return {
    id: r.id, cat: r.cat, brand: r.brand, name: r.name, code: r.code, badge: r.badge,
    rating: Number(r.rating) || 0, reviews: r.reviews_count || 0, featured: !!r.featured,
    tag: r.tag || {}, specs: r.specs || [], image_url, price: r.price ?? null, images,
  };
};

// ----------------------------------------------------------------------------
// PostgREST plafonne chaque réponse à 1000 lignes (db-max-rows). Un
// `select('*')` sans pagination tronque donc silencieusement le catalogue dès
// le 1001ᵉ produit — le site n'en affiche jamais plus, sans le moindre message.
// On pagine explicitement pour que le catalogue reste complet quelle que soit
// sa taille.
// ----------------------------------------------------------------------------
const PAGE_ROWS = 1000;
export async function selectAll(build, { pageSize = PAGE_ROWS, max = 50000 } = {}) {
  const out = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { data: out, error: null };
}

// Whole catalog. Falls back to the bundled static catalog if Supabase is unset.
export async function getCatalog() {
  if (!hasSupabase()) return { ...fallbackCatalog, picks: [], arrivals: [], source: 'fallback' };
  try {
    const sb = await createClient();
    const [b, c, p, cl, fp, na] = await Promise.all([
      sb.from('brands').select('*').order('sort'),
      sb.from('categories').select('*').order('sort'),
      // Paginé : au-delà de 1000 produits, un select simple s'arrêterait là.
      selectAll(() => sb.from('products').select('*').eq('active', true).order('sort').order('id')),
      sb.from('clients').select('name').eq('site', SITE).order('sort'),
      // Vitrine : ordre choisi dans /admin/showcase. La table peut ne pas
      // exister si la migration n'a pas encore été appliquée — on l'ignore.
      sb.from('featured_picks').select('product_id,rank').eq('site', SITE).order('rank'),
      // Nouveautés : ordre choisi dans /admin/arrivals. Même remarque —
      // requête séparée pour qu'une table absente ne casse jamais la vitrine.
      sb.from('new_arrivals').select('product_id,rank').eq('site', SITE).order('rank'),
    ]);
    if (b.error || c.error || p.error) throw (b.error || c.error || p.error);

    const products = (p.data || []).map(mapProduct);
    const live = new Set(products.map((x) => x.id));
    const picks = fp.error ? [] : (fp.data || []).map((r) => r.product_id).filter((id) => live.has(id));
    const arrivals = na.error ? [] : (na.data || []).map((r) => r.product_id).filter((id) => live.has(id));

    return {
      brands: (b.data || []).map(mapBrand),
      categories: (c.data || []).map(mapCategory),
      products,
      clients: (cl.data || []).map((x) => x.name),
      picks,
      arrivals,
      source: 'supabase',
    };
  } catch (e) {
    // Supabase IS configured but the query failed — show the real (empty) state
    // instead of the demo catalog, so the problem is visible rather than masked.
    console.error('getCatalog error:', e?.message);
    return { brands: [], categories: [], products: [], clients: [], picks: [], arrivals: [], source: 'error' };
  }
}

export async function getProduct(id) {
  if (!hasSupabase()) return fallbackCatalog.products.find((p) => p.id === id) || null;
  try {
    const sb = await createClient();
    const { data, error } = await sb.from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapProduct(data) : null;
  } catch {
    return fallbackCatalog.products.find((p) => p.id === id) || null;
  }
}

export async function getReviews(productId) {
  if (!hasSupabase()) return [];
  try {
    const sb = await createClient();
    const { data, error } = await sb.from('reviews').select('*')
      .eq('site', SITE)
      .eq('product_id', productId).eq('approved', true).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({
      _id: r.id, author: r.author, rating: r.rating, title: r.title, body: r.body,
      helpful: r.helpful, verified: r.verified, date: (r.created_at || '').slice(0, 10),
    }));
  } catch { return []; }
}

const POPUP_DEFAULTS = {
  enabled: true,
  delay: 2200,
  days: 7,
  image_url: null,
  title: { fr: 'Rejoignez la newsletter WBP', en: 'Join the WBP newsletter', ar: 'انضم إلى نشرة WBP' },
  sub: {
    fr: 'Nouveautés produits, arrivages et offres réservées aux professionnels — une fois par mois, sans spam.',
    en: 'New products, fresh stock and pro-only offers — once a month, no spam.',
    ar: 'منتجات جديدة ووصولات وعروض خاصة بالمهنيين — مرة في الشهر، بدون إزعاج.',
  },
  cta: { fr: 'Je m’inscris', en: 'Subscribe', ar: 'اشترك' },
  perks: {
    fr: ['Nouveaux produits en avant-première', 'Offres réservées aux professionnels', 'Conseils de nos ingénieurs'],
    en: ['Early access to new products', 'Pro-only offers', 'Tips from our engineers'],
    ar: ['وصول مبكر للمنتجات الجديدة', 'عروض خاصة بالمهنيين', 'نصائح من مهندسينا'],
  },
};

const SETTINGS_DEFAULTS = {
  whatsapp: '213559533698',
  contact: {
    email: 'commercial@wbp-dz.com',
    phones: ['0559 533 698', '0560 061 082'],
    fax: 'Tél/Fax : 023 70 80 21',
    address: { fr: 'Cité DNC G8, Bt D, N°07, Garidi 1, Kouba, 16006 Alger, Algérie', en: 'Cité DNC G8, Bt D, N°07, Garidi 1, Kouba, 16006 Algiers, Algeria', ar: 'حي DNC G8، عمارة D، رقم 07، قاريدي 1، القبة، 16006 الجزائر العاصمة' },
  },
  hero: { fr: { title: '', sub: '' }, en: { title: '', sub: '' }, ar: { title: '', sub: '' } },
  popup: POPUP_DEFAULTS,
};

export async function getSettings() {
  if (!hasSupabase()) return { ...SETTINGS_DEFAULTS };
  try {
    const sb = await createClient();
    const { data, error } = await sb.from('settings').select('key,value').eq('site', SITE);
    if (error) throw error;
    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    return {
      whatsapp: map.whatsapp || SETTINGS_DEFAULTS.whatsapp,
      contact: { ...SETTINGS_DEFAULTS.contact, ...(map.contact || {}) },
      hero: map.hero || SETTINGS_DEFAULTS.hero,
      popup: { ...POPUP_DEFAULTS, ...(map.popup || {}) },
    };
  } catch { return { ...SETTINGS_DEFAULTS }; }
}

// ============================================================================
// Assistant IA
// ----------------------------------------------------------------------------
// ai_config est une table PRIVÉE (RLS sans policy) : elle n'est lisible qu'avec
// la clé service_role, côté serveur. getAiPublic() renvoie uniquement ce que le
// navigateur a besoin de connaître — jamais l'URL de la plateforme ni la clé.
// Aucun fournisseur n'est nommé : 'builtin' = réponses issues du catalogue,
// toute autre valeur = plateforme externe choisie par l'administrateur.
// ============================================================================
export const AI_DEFAULTS = {
  enabled: true,
  provider: 'builtin',
  base_url: null,
  widget_key: null,
  assistant: 'Assistant WBP',
  greeting: {
    fr: 'Bonjour 👋 Je suis l’assistant World Business Plus. Dites-moi ce que vous cherchez — caméra, alarme, écran interactif, réseau — et je vous guide vers le bon produit.',
    en: 'Hi 👋 I’m the World Business Plus assistant. Tell me what you need — camera, alarm, interactive display, network — and I’ll point you to the right product.',
    ar: 'مرحباً 👋 أنا مساعد World Business Plus. أخبرني بما تبحث عنه — كاميرا، إنذار، شاشة تفاعلية، شبكة — وسأرشدك إلى المنتج المناسب.',
  },
  suggestions: {
    fr: ['Quelles caméras pour un entrepôt ?', 'Kit alarme pour un bureau', 'Écran interactif pour salle de réunion', 'Demander un devis'],
    en: ['Which cameras for a warehouse?', 'Alarm kit for an office', 'Interactive display for a meeting room', 'Request a quote'],
    ar: ['أي كاميرات لمستودع؟', 'طقم إنذار لمكتب', 'شاشة تفاعلية لقاعة اجتماعات', 'طلب عرض سعر'],
  },
  accent: '#FF5A1F',
};

/** Configuration complète — SERVEUR UNIQUEMENT (contient la clé du widget). */
export async function getAiConfig() {
  if (!hasSupabase()) return { ...AI_DEFAULTS, configured: false };
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from('ai_config').select('*').eq('site', SITE).maybeSingle();
    if (error) throw error;
    if (!data) return { ...AI_DEFAULTS, configured: false };
    return {
      ...AI_DEFAULTS,
      ...data,
      greeting: { ...AI_DEFAULTS.greeting, ...(data.greeting || {}) },
      suggestions: { ...AI_DEFAULTS.suggestions, ...(data.suggestions || {}) },
      configured: true,
    };
  } catch {
    // Table absente (migration non appliquée) : l'assistant local prend le relais.
    return { ...AI_DEFAULTS, configured: false };
  }
}

/** Sous-ensemble sûr, transmis au navigateur. */
export async function getAiPublic() {
  const c = await getAiConfig();
  return {
    enabled: !!c.enabled,
    assistant: c.assistant,
    greeting: c.greeting,
    suggestions: c.suggestions,
    accent: c.accent,
    live: c.provider !== 'builtin' && !!c.base_url && !!c.widget_key,
  };
}
