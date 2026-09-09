import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import ShowcaseManager from '@/components/admin/ShowcaseManager';
import { selectAll } from '@/lib/queries';
import { PRODUCT_IMAGES } from '@/lib/product-images.generated';
import { SITE } from '@/lib/site';

// Même repli que sur le site public : si products.image_url est vide, on
// utilise la photo livrée dans public/products.
const withThumb = (p) => (p.image_url ? p : { ...p, image_url: (PRODUCT_IMAGES[p.id] || [])[0] || null });

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Meilleures ventes' };

// ----------------------------------------------------------------------------
// Même écran que la vitrine, mais branché sur la table `best_sellers`.
// La vitrine (/admin/showcase) ne règle QUE la priorité des produits dans le
// catalogue ; cette page-ci règle le carrousel « Meilleures ventes » de la
// page d'accueil. Les deux listes sont indépendantes.
// ----------------------------------------------------------------------------
// Voir showcase/page.js : une colonne inconnue fait échouer toute la requête,
// et PostgREST plafonne à 1000 lignes. On dégrade donc le jeu de colonnes
// jusqu'à ce que la requête passe, et on pagine.
const BASE = 'id,name,code,cat,brand,image_url,active,badge';
const TRIES = [`${BASE},images`, BASE, 'id,name,code,cat,brand,image_url,active'];

const missingColumn = (error) => error?.code === 'PGRST204'
  || /column .* does not exist|could not find the .* column/i.test(String(error?.message || ''));

async function loadProducts(sb) {
  let last = null;
  for (const cols of TRIES) {
    const res = await selectAll(() => sb.from('products').select(cols).order('sort').order('id'));
    if (!res.error) {
      return { rows: (res.data || []).map(withThumb), hasBadge: cols.includes('badge'), error: null };
    }
    last = res.error;
    if (!missingColumn(res.error)) break;
  }
  return { rows: [], hasBadge: false, error: last };
}

export default async function BestSellersPage() {
  if (!hasSupabase()) return null;

  // createAdminClient() lève si la clé service_role manque : sans ce garde-fou
  // la page renvoie une 500 au lieu du message d'aide ci-dessous.
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
    sb.from('best_sellers').select('product_id,rank').eq('site', SITE).order('rank'),
  ]);

  const products = prod.rows;
  const loadError = prod.error?.message || brandsRes.error?.message || catsRes.error?.message || null;

  const migrated = !picksRes.error;
  const initial = migrated
    ? (picksRes.data || []).map((r) => r.product_id)
    : prod.hasBadge ? products.filter((p) => p.badge === 'bestseller').map((p) => p.id) : [];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Meilleures ventes — section de la page d’accueil</h1>
          <p className="adm-sub">
            Choisissez les produits du carrousel « Meilleures ventes » de la page d’accueil,
            puis glissez-les pour définir l’ordre exact. Liste indépendante de la
            <b> Vitrine</b>, qui ne sert qu’à faire remonter des produits en tête du catalogue.
            Si vous n’en sélectionnez aucun, le site affiche les produits dont la fiche
            porte le badge « Best-seller ».
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
          <b>La base n’est pas encore à jour</b> — la table <code>best_sellers</code> manque,
          la sélection ne peut donc pas être enregistrée.
          <br />
          Correction en 2 minutes : ouvrez <b>Supabase → SQL Editor → New query</b>, collez le
          fichier <b>supabase/fix-all.sql</b> du projet, puis cliquez <b>Run</b>. Une seule fois,
          sans risque pour vos données.
          <br />
          En attendant, le site affiche les produits dont la fiche porte le badge « Best-seller »,
          puis la Vitrine.
        </div>
      )}

      <ShowcaseManager
        list="bestsellers"
        products={products}
        brands={brandsRes.data || []}
        categories={catsRes.data || []}
        initial={initial}
      />
    </>
  );
}
