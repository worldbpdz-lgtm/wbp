import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import ShowcaseManager from '@/components/admin/ShowcaseManager';
import { selectAll } from '@/lib/queries';
import { PRODUCT_IMAGES } from '@/lib/product-images.generated';
import { SITE } from '@/lib/site';

// Même repli que sur le site public : si products.image_url est vide, on
// utilise la photo livrée dans public/products. Sans cela, cet écran affichait
// une pastille grise pour la quasi-totalité du catalogue.
const withThumb = (p) => (p.image_url ? p : { ...p, image_url: (PRODUCT_IMAGES[p.id] || [])[0] || null });

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Vitrine' };

// ----------------------------------------------------------------------------
// `featured` et `images` n'existent QU'APRÈS la migration
// (supabase/fix-all.sql). PostgREST rejette la requête ENTIÈRE dès qu'une
// colonne citée est inconnue : la page se retrouvait alors sans aucun produit
// et sans le moindre message. On essaie donc du jeu de colonnes le plus riche
// au plus pauvre, jusqu'à ce que ça passe.
//
// `.limit(4000)` était par ailleurs trompeur : PostgREST plafonne de toute
// façon chaque réponse à 1000 lignes, donc le catalogue était tronqué en
// silence au-delà. selectAll() pagine jusqu'au dernier produit.
// ----------------------------------------------------------------------------
const BASE = 'id,name,code,cat,brand,image_url,active';
const TRIES = [`${BASE},images,featured`, `${BASE},featured`, `${BASE},images`, BASE];

// On ne dégrade le jeu de colonnes QUE sur une erreur « colonne inconnue ».
// Sinon une simple coupure réseau épuisait les quatre tentatives et affichait
// « Le catalogue n'a pas pu être chargé » sur une base pourtant à jour.
const missingColumn = (error) => error?.code === 'PGRST204'
  || /column .* does not exist|could not find the .* column/i.test(String(error?.message || ''));

async function loadProducts(sb) {
  let last = null;
  for (const cols of TRIES) {
    const res = await selectAll(() => sb.from('products').select(cols).order('sort').order('id'));
    if (!res.error) {
      return { rows: (res.data || []).map(withThumb), hasFeatured: cols.includes('featured'), error: null };
    }
    last = res.error;
    if (!missingColumn(res.error)) break; // vraie panne : inutile d'insister
  }
  return { rows: [], hasFeatured: false, error: last };
}

export default async function ShowcasePage() {
  if (!hasSupabase()) return null;

  // hasSupabase() ne vérifie que l'URL et la clé anon ; createAdminClient()
  // lève une exception si SUPABASE_SERVICE_ROLE_KEY manque. Sans ce garde-fou,
  // la page renvoyait une erreur 500 au lieu du message d'aide ci-dessous.
  let sb;
  try { sb = createAdminClient(); } catch (e) {
    return (
      <div className="adm-err" style={{ margin: 16 }}>
        Clé serveur Supabase absente : renseignez <b>SUPABASE_SERVICE_ROLE_KEY</b> dans les
        variables d’environnement, puis redéployez. ({e?.message})
      </div>
    );
  }

  const [prod, brandsRes, catsRes, picksRes] = await Promise.all([
    loadProducts(sb),
    sb.from('brands').select('id,name').order('sort').order('name'),
    sb.from('categories').select('id,name').order('sort'),
    sb.from('featured_picks').select('product_id,rank').eq('site', SITE).order('rank'),
  ]);

  const products = prod.rows;
  const loadError = prod.error?.message || brandsRes.error?.message || catsRes.error?.message || null;

  // Si la migration n'a pas encore été appliquée, on retombe sur la colonne
  // products.featured (si elle existe) pour ne pas afficher une page cassée.
  const migrated = !picksRes.error;
  const initial = migrated
    ? (picksRes.data || []).map((r) => r.product_id)
    : prod.hasFeatured ? products.filter((p) => p.featured).map((p) => p.id) : [];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Vitrine — priorité dans le catalogue</h1>
          <p className="adm-sub">
            Filtrez par catégorie et par marque, cliquez sur les produits à mettre en avant,
            puis glissez-les pour définir l’ordre exact. Ils remontent en tête de la page
            Produits du site. Le carrousel « Meilleures ventes » de la page d’accueil se
            règle à part, dans <b>Meilleures ventes</b>.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="adm-err" style={{ marginBottom: 16 }}>
          Le catalogue n’a pas pu être chargé : <b>{loadError}</b>
          <br />
          Vérifiez que l’application pointe bien vers le bon projet Supabase
          (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), puis rechargez la page.
        </div>
      )}

      {!loadError && products.length === 0 && (
        <div className="adm-err" style={{ marginBottom: 16 }}>
          Aucun produit dans cette base de données. Importez le catalogue
          (<b>node scripts/import-products.mjs</b>) ou vérifiez le projet Supabase utilisé.
        </div>
      )}

      {!migrated && (
        <div className="adm-err" style={{ marginBottom: 16 }}>
          <b>La base n’est pas encore à jour</b> — la table <code>featured_picks</code> manque,
          l’ordre exact des produits ne peut donc pas être enregistré.
          <br />
          Correction en 2 minutes : ouvrez <b>Supabase → SQL Editor → New query</b>, collez le
          fichier <b>supabase/fix-all.sql</b> du projet, puis cliquez <b>Run</b>. Une seule fois,
          sans risque pour vos données.
          <br />
          En attendant, votre sélection est bien enregistrée via la case « ★ mis en avant » —
          seul l’ordre précis est perdu.
        </div>
      )}

      <ShowcaseManager
        products={products}
        brands={brandsRes.data || []}
        categories={catsRes.data || []}
        initial={initial}
      />
    </>
  );
}
