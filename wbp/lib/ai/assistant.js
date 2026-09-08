// ============================================================================
// Assistant intégré (mode « builtin ») — répond à partir du catalogue réel.
// ----------------------------------------------------------------------------
// Sert deux rôles :
//   1. l'assistant fonctionne dès l'installation, sans plateforme externe ;
//   2. c'est le filet de sécurité quand la plateforme externe est
//      injoignable — le visiteur obtient toujours une réponse utile plutôt
//      qu'un message d'erreur.
// Aucun appel réseau : recherche par mots-clés dans le catalogue Supabase,
// réponse rédigée en FR / EN / AR avec liens produits et relance devis.
// ============================================================================
import { createClient, hasSupabase } from '@/lib/supabase/server';
import { fallbackCatalog } from '@/lib/fallback-catalog';
import { SITE } from '@/lib/site';

const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'pour', 'avec', 'sur', 'dans', 'et', 'ou', 'je', 'tu', 'il', 'nous', 'vous', 'quel', 'quelle', 'quels', 'quelles', 'est', 'ce', 'que', 'qui', 'quoi', 'combien', 'prix', 'the', 'a', 'an', 'of', 'for', 'with', 'on', 'in', 'and', 'or', 'i', 'you', 'what', 'which', 'how', 'much', 'is', 'are', 'do', 'does', 'my', 'me']);

const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Synonymes métier : « caméra de surveillance » doit trouver la catégorie
// « cameras », « alarme » la catégorie « alarm », etc.
const HINTS = [
  { cat: 'cameras', words: ['camera', 'cameras', 'surveillance', 'videosurveillance', 'video', 'nvr', 'xvr', 'dome', 'bullet', 'ptz', 'anpr', 'plaque', 'cctv', 'كاميرا', 'مراقبة'] },
  { cat: 'alarm', words: ['alarme', 'alarm', 'intrusion', 'sirene', 'detecteur', 'mouvement', 'hub', 'ajax', 'انذار', 'تسلل'] },
  { cat: 'access', words: ['acces', 'access', 'badge', 'rfid', 'biometrie', 'empreinte', 'lecteur', 'clavier', 'porte', 'دخول', 'بطاقة'] },
  { cat: 'intercom', words: ['interphone', 'intercom', 'platine', 'moniteur', 'visiophone', 'اتصال'] },
  { cat: 'displays', words: ['ecran', 'affichage', 'display', 'interactif', 'maxhub', 'visio', 'conference', 'reunion', 'tableau', 'شاشة', 'اجتماع'] },
  { cat: 'fire', words: ['incendie', 'fire', 'fumee', 'smoke', 'detection', 'apollo', 'حريق'] },
  { cat: 'network', words: ['reseau', 'network', 'wifi', 'switch', 'ubiquiti', 'unifi', 'routeur', 'point', 'acces', 'شبكة'] },
  { cat: 'storage', words: ['disque', 'stockage', 'storage', 'hdd', 'nas', 'seagate', 'purple', 'skyhawk', 'to', 'tb', 'تخزين'] },
];

const QUOTE_WORDS = ['devis', 'prix', 'tarif', 'cout', 'combien', 'quote', 'price', 'cost', 'سعر', 'عرض'];
const CONTACT_WORDS = ['contact', 'telephone', 'adresse', 'horaire', 'ou etes', 'address', 'phone', 'hours', 'هاتف', 'عنوان'];
const HELLO_WORDS = ['bonjour', 'salut', 'bonsoir', 'hello', 'hi', 'hey', 'salam', 'سلام', 'مرحبا'];

const T = {
  fr: {
    found: (n) => `J’ai trouvé ${n} référence${n > 1 ? 's' : ''} qui correspond${n > 1 ? 'ent' : ''} :`,
    none: 'Je n’ai pas trouvé de produit correspondant dans le catalogue en ligne. Décrivez-moi votre besoin en quelques mots (surface à couvrir, intérieur/extérieur, nombre de caméras…) ou demandez un devis : un ingénieur vous répond sous 24 h ouvrées.',
    more: (n) => `…et ${n} autre${n > 1 ? 's' : ''} référence${n > 1 ? 's' : ''} dans le catalogue.`,
    quote: 'Nos prix sont sur devis, adaptés au volume et au projet. Ajoutez les produits qui vous intéressent à votre demande de devis, ou écrivez-nous depuis la page Contact — réponse sous 24 h ouvrées.',
    contact: (c) => `Vous pouvez nous joindre au ${(c.phones || []).join(' / ')}, par e-mail à ${c.email}, ou sur WhatsApp.${c.address?.fr ? ` Adresse : ${c.address.fr}.` : ''} Ouvert dimanche – jeudi, 8h30 – 17h00.`,
    hello: 'Bonjour 👋 Dites-moi ce que vous cherchez — vidéosurveillance, alarme, contrôle d’accès, écran interactif, réseau ou stockage — et je vous oriente vers les bonnes références.',
    cats: (l) => `Notre catalogue couvre : ${l}. Sur quel domaine puis-je vous aider ?`,
    ask: 'Pour affiner : combien de points à couvrir, en intérieur ou en extérieur, et pour quel type de site (bureau, entrepôt, commerce, industrie) ?',
  },
  en: {
    found: (n) => `I found ${n} matching reference${n > 1 ? 's' : ''}:`,
    none: 'I couldn’t find a matching product in the live catalog. Describe your need in a few words (area to cover, indoor/outdoor, number of cameras…) or request a quote — an engineer replies within 24 business hours.',
    more: (n) => `…and ${n} more reference${n > 1 ? 's' : ''} in the catalog.`,
    quote: 'Our pricing is quote-based, tailored to volume and project. Add the products you are interested in to your quote request, or write to us from the Contact page — reply within 24 business hours.',
    contact: (c) => `You can reach us at ${(c.phones || []).join(' / ')}, by email at ${c.email}, or on WhatsApp.${(c.address?.en || c.address?.fr) ? ` Address: ${c.address.en || c.address.fr}.` : ''} Open Sunday – Thursday, 8:30 – 17:00.`,
    hello: 'Hi 👋 Tell me what you are looking for — video surveillance, alarm, access control, interactive display, network or storage — and I’ll point you to the right references.',
    cats: (l) => `Our catalog covers: ${l}. Which area can I help with?`,
    ask: 'To narrow it down: how many points to cover, indoor or outdoor, and what kind of site (office, warehouse, retail, industrial)?',
  },
  ar: {
    found: (n) => `وجدت ${n} مرجعاً مطابقاً:`,
    none: 'لم أجد منتجاً مطابقاً في الكتالوج. صف احتياجك بكلمات قليلة (المساحة، داخلي/خارجي، عدد الكاميرات…) أو اطلب عرض سعر — يردّ مهندسونا خلال 24 ساعة عمل.',
    more: (n) => `…و${n} مرجعاً آخر في الكتالوج.`,
    quote: 'أسعارنا حسب الطلب، وفق الكمية والمشروع. أضف المنتجات التي تهمّك إلى طلب عرض السعر، أو اكتب لنا من صفحة الاتصال — الرد خلال 24 ساعة عمل.',
    contact: (c) => `يمكنك الاتصال بنا على ${(c.phones || []).join(' / ')}، أو بالبريد ${c.email}، أو عبر واتساب.${c.address?.ar ? ` العنوان: ${c.address.ar}.` : ''} من الأحد إلى الخميس، 8:30 – 17:00.`,
    hello: 'مرحباً 👋 أخبرني بما تبحث عنه — مراقبة بالفيديو، إنذار، تحكم في الدخول، شاشة تفاعلية، شبكة أو تخزين — وسأرشدك إلى المراجع المناسبة.',
    cats: (l) => `يغطي كتالوجنا: ${l}. في أي مجال أستطيع مساعدتك؟`,
    ask: 'لتحديد أدق: كم نقطة تريد تغطيتها، داخلي أم خارجي، وأي نوع من المواقع (مكتب، مستودع، متجر، صناعة)؟',
  },
};

function tokens(q) {
  return norm(q).split(/[^a-z0-9\u0600-\u06ff]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Un mot compte s'il apparaît tel quel OU sans son « s » final : « caméras »
 * doit trouver « Caméra Dahua Dome », « écrans » doit trouver « Écran Tactile ».
 */
function hit(hay, w) {
  if (hay.includes(w)) return true;
  return w.length > 3 && w.endsWith('s') && hay.includes(w.slice(0, -1));
}

/**
 * Classement en deux temps :
 *   1. les produits dont le NOM contient un mot de la question passent devant —
 *      sinon une « Armoire d'alimentation », rangée dans la catégorie caméras,
 *      remontait au même rang qu'une vraie caméra ;
 *   2. à égalité, on départage au score (référence exacte, marque, catégorie
 *      devinée, mise en avant).
 */
function search(products, brands, categories, q, lang) {
  const toks = tokens(q);
  if (!toks.length) return [];
  const nq = norm(q);
  const guessedCats = HINTS.filter((h) => h.words.some((w) => nq.includes(w))).map((h) => h.cat);
  const guessedBrand = brands.find((b) => nq.includes(norm(b.name)) || (norm(b.short || '').length > 2 && nq.includes(norm(b.short))));

  return products.map((p) => {
    const name = norm(p.name);
    const code = norm(p.code);
    const rest = norm(`${p.tag?.[lang] || ''} ${p.tag?.fr || ''} ${(p.specs || []).flat().join(' ')}`);
    let nameHits = 0, score = 0;
    for (const w of toks) {
      if (hit(name, w)) { nameHits += 1; score += 6; }
      else if (hit(rest, w)) score += 3;
      if (hit(code, w)) score += 8;
    }
    if (guessedCats.includes(p.cat)) score += 4;
    if (guessedBrand && p.brand === guessedBrand.id) score += 4;
    if (p.featured) score += 2;
    if (p.badge === 'bestseller') score += 1;
    return { p, score, nameHits };
  }).filter((x) => x.score >= 4)
    .sort((a, b) => b.nameHits - a.nameHits || b.score - a.score)
    .map((x) => x.p);
}

/**
 * Fabrique une réponse. Renvoie { text, products } — `products` alimente les
 * petites cartes cliquables affichées sous la réponse dans le chat.
 */
/** Catalogue de secours intégré, remis au format attendu par la recherche. */
function bundledCatalog() {
  return {
    products: (fallbackCatalog.products || []).map((p) => ({ ...p, featured: false })),
    brands: fallbackCatalog.brands || [],
    categories: (fallbackCatalog.categories || []).map((c) => ({
      id: c.id, name: { fr: c.fr, en: c.en, ar: c.ar },
    })),
  };
}

export async function answer(message, lang = 'fr') {
  const L = T[lang] || T.fr;
  const nq = norm(message);

  let products = [], brands = [], categories = [], contact = {};

  if (hasSupabase()) {
    try {
      const sb = await createClient();
      const [p, b, c, st] = await Promise.all([
        sb.from('products').select('id,name,code,cat,brand,tag,specs,image_url,featured,badge,rating').eq('active', true).limit(2000),
        sb.from('brands').select('id,name,short'),
        sb.from('categories').select('id,name'),
        sb.from('settings').select('key,value').eq('site', SITE).eq('key', 'contact').maybeSingle(),
      ]);
      products = p.data || []; brands = b.data || []; categories = c.data || [];
      contact = st.data?.value || {};
    } catch { /* base injoignable : on bascule sur le catalogue intégré */ }
  }

  // Mode démo, ou base momentanément injoignable : plutôt que de répondre
  // « je n'ai rien trouvé », on cherche dans le catalogue livré avec le site.
  if (!products.length) {
    const b = bundledCatalog();
    products = b.products; brands = b.brands; categories = b.categories;
  }

  const catList = categories.map((c) => c.name?.[lang] || c.name?.fr).filter(Boolean).join(' · ');

  // Salutation seule
  if (HELLO_WORDS.some((w) => nq.startsWith(w)) && nq.split(/\s+/).length <= 3) {
    return { text: `${L.hello}\n\n${catList ? L.cats(catList) : ''}`.trim(), products: [] };
  }
  // Coordonnées
  if (CONTACT_WORDS.some((w) => nq.includes(w))) {
    const c = {
      phones: contact.phones || ['0559 533 698', '0560 061 082'],
      email: contact.email || 'commercial@wbp-dz.com',
      address: contact.address || {},
    };
    return { text: L.contact(c), products: [] };
  }

  const hits = search(products, brands, categories, message, lang);

  // Question de prix sans produit identifié
  if (!hits.length && QUOTE_WORDS.some((w) => nq.includes(w))) {
    return { text: L.quote, products: [] };
  }
  if (!hits.length) {
    return { text: `${L.none}\n\n${catList ? L.cats(catList) : ''}`.trim(), products: [] };
  }

  const top = hits.slice(0, 4);
  const bmap = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const lines = top.map((p) => `• ${p.name} — ${bmap[p.brand] || ''} · réf. ${p.code}`);
  const parts = [L.found(hits.length), lines.join('\n')];
  if (hits.length > top.length) parts.push(L.more(hits.length - top.length));
  parts.push(QUOTE_WORDS.some((w) => nq.includes(w)) ? L.quote : L.ask);

  return {
    text: parts.filter(Boolean).join('\n\n'),
    products: top.map((p) => ({ id: p.id, name: p.name, code: p.code, image_url: p.image_url, brand: bmap[p.brand] || '' })),
  };
}
