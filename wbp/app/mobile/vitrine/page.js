import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { PRODUCT_IMAGES } from '@/lib/product-images.generated';
import { SITE } from '@/lib/site';
import { requireMobileEditor } from '@/app/mobile/guard';
import VitrineScreen from '@/components/mobile/VitrineScreen';

// ============================================================================
// Vitrine du site, version téléphone.
// ----------------------------------------------------------------------------
// TROIS listes ordonnées, indépendantes les unes des autres, chacune dans sa
// propre table (toutes filtrées par `site` : la base est partagée avec l'autre
// site) — exactement les mêmes que les trois écrans du back-office web :
//
//   Vitrine           → table featured_picks  → /admin/showcase
//                       priorité des produits dans le catalogue du site
//   Meilleures ventes → table best_sellers    → /admin/best-sellers
//                       carrousel « Meilleures ventes » de la page d'accueil
//   Nouveautés        → table new_arrivals    → /admin/arrivals
//                       section « Nouveaux arrivages » de la page d'accueil
//
// Un produit peut figurer dans les trois : ce sont trois sélections, pas trois
// niveaux d'une même sélection.
//
// Comme sur les écrans d'ordinateur, une table absente (migration
// supabase/fix-all.sql pas encore appliquée) ne fait pas planter la page : la
// liste s'affiche vide et l'écran explique quoi faire.
//
// Le catalogue n'est PAS envoyé en entier au téléphone (plus de 1 700 fiches) :
// on transmet les CATALOG premiers produits visibles dans l'ordre du catalogue,
// plus les produits déjà choisis dans les trois listes même s'ils sont au-delà
// (ou masqués) — sinon une ligne déjà enregistrée s'afficherait sans nom ni
// photo. La recherche du bouton « Ajouter » se fait ensuite dans le téléphone,
// sans aller-retour : une navigation en pleine réorganisation ferait perdre
// l'ordre non enregistré.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vitrine du site — WBP' };

const CATALOG = 300;

// `images` n'existe QU'APRÈS la migration (supabase/fix-all.sql), et PostgREST
// rejette la requête ENTIÈRE dès qu'une colonne citée est inconnue — l'écran se
// retrouverait sans aucun produit et sans message. Même dégradation que
// app/admin/(panel)/showcase/page.js, et seulement sur une erreur
// « colonne inconnue » : une coupure réseau ne doit pas déclencher un second
// essai inutile. Sans `images`, le repli PRODUCT_IMAGES donne encore la vignette.
const BASE_COLS = 'id,name,code,active,image_url';
const COLS = `${BASE_COLS},images`;
const missingColumn = (error) => error?.code === 'PGRST204'
  || /column .* does not exist|could not find the .* column/i.test(String(error?.message || ''));

async function pick(build) {
  const res = await build(COLS);
  if (!res.error || !missingColumn(res.error)) return res;
  return build(BASE_COLS);
}

// Même règle de vignette que partout ailleurs dans le projet : la photo de la
// base, puis la 1ʳᵉ de la galerie, puis le fichier livré dans public/products.
// Sans ce dernier repli, la quasi-totalité du catalogue paraîtrait sans photo.
const thumbOf = (p) => p.image_url || p.images?.[0] || PRODUCT_IMAGES[p.id]?.[0] || null;
const slim = (p) => ({
  id: p.id,
  name: p.name,
  code: p.code,
  active: !!p.active,
  thumb: thumbOf(p),
});

export default async function MobileVitrine() {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const sb = createAdminClient();

  // Trois requêtes séparées : une table absente ne doit pas emporter les deux
  // autres listes avec elle.
  const [picksRes, bestRes, arrRes, sliceRes] = await Promise.all([
    sb.from('featured_picks').select('product_id,rank').eq('site', SITE).order('rank'),
    sb.from('best_sellers').select('product_id,rank').eq('site', SITE).order('rank'),
    sb.from('new_arrivals').select('product_id,rank').eq('site', SITE).order('rank'),
    pick((c) => sb.from('products').select(c).eq('active', true).order('sort').order('id').limit(CATALOG)),
  ]);

  const idsOf = (res) => (res.error ? [] : (res.data || []).map((r) => r.product_id).filter(Boolean));
  const lists = {
    showcase: idsOf(picksRes),
    bestsellers: idsOf(bestRes),
    arrivals: idsOf(arrRes),
  };
  // Comme sur les écrans d'ordinateur : toute erreur de lecture sur ces tables
  // est traitée comme « table absente », le cas de loin le plus fréquent
  // (migration pas encore appliquée).
  const missing = {
    showcase: !!picksRes.error,
    bestsellers: !!bestRes.error,
    arrivals: !!arrRes.error,
  };

  const products = (sliceRes.data || []).map(slim);
  const known = new Set(products.map((p) => p.id));

  // Les produits choisis qui ne sont pas dans la tranche ci-dessus (plus loin
  // dans le catalogue, ou masqués du site) : sans eux, la liste enregistrée
  // afficherait des identifiants nus.
  const rest = [...new Set([...lists.showcase, ...lists.bestsellers, ...lists.arrivals])]
    .filter((id) => !known.has(id));
  if (rest.length) {
    const { data } = await pick((c) => sb.from('products').select(c).in('id', rest));
    for (const p of data || []) { products.push(slim(p)); known.add(p.id); }
  }

  return (
    <VitrineScreen
      products={products}
      lists={lists}
      missing={missing}
      catalogShown={sliceRes.data?.length || 0}
      error={sliceRes.error ? (sliceRes.error.message || 'Erreur inconnue') : null}
    />
  );
}
