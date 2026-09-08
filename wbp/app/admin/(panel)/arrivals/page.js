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
export const metadata = { title: 'Admin — Nouveautés' };

// ----------------------------------------------------------------------------
// Même écran que la vitrine, mais branché sur la table `new_arrivals`.
// Si la migration n'a pas encore été appliquée, on affiche un message clair
// plutôt qu'une page vide, et on propose les produits marqués « Nouveau ».
// ----------------------------------------------------------------------------
// Même remarque que pour la vitrine : une colonne inconnue fait échouer toute
// la requête, et PostgREST plafonne à 1000 lignes. On dégrade donc le jeu de
// colonnes jusqu'à ce que la requête passe, et on pagine.
const BASE = 'id,name,code,cat,brand,image_url,active,badge';
const TRIES = [`${BASE},images`, BASE, 'id,name,code,cat,brand,image_url,active'];

async function loadProducts(sb) {
  let last = null;
  for (const cols of TRIES) {
    const res = await selectAll(() => sb.from('products').select(cols).order('sort').order('id'));
    if (!res.error) {
      return { rows: (res.data || []).map(withThumb), hasBadge: cols.includes('badge'), error: null };
    }
    last = res.error;
  }
  return { rows: [], hasBadge: false, error: last };
}

export default async function ArrivalsPage() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();

  const [prod, brandsRes, catsRes, picksRes] = await Promise.all([
    loadProducts(sb),
    sb.from('brands').select('id,name').order('sort').order('name'),
    sb.from('categories').select('id,name').order('sort'),
    sb.from('new_arrivals').select('product_id,rank').eq('site', SITE).order('rank'),
  ]);

  const products = prod.rows;
  const loadError = prod.error?.message || brandsRes.error?.message || catsRes.error?.message || null;

  const migrated = !picksRes.error;
  const initial = migrated
    ? (picksRes.data || []).map((r) => r.product_id)
    : prod.hasBadge ? products.filter((p) => p.badge === 'new').map((p) => p.id) : [];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Nouveautés — « Nouveaux arrivages »</h1>
          <p className="adm-sub">
            Choisissez les produits de la section « Nouveaux arrivages » de la page d’accueil,
            puis glissez-les pour définir l’ordre exact. Liste indépendante de la vitrine :
            un produit peut très bien être à la fois meilleure vente et nouveauté.
            Si vous n’en sélectionnez aucun, le site affiche les produits dont la fiche
            porte le badge « Nouveau ».
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
          <b>La base n’est pas encore à jour</b> — la table <code>new_arrivals</code> manque,
          la sélection ne peut donc pas être enregistrée.
          <br />
          Correction en 2 minutes : ouvrez <b>Supabase → SQL Editor → New query</b>, collez le
          fichier <b>supabase/fix-all.sql</b> du projet, puis cliquez <b>Run</b>. Une seule fois,
          sans risque pour vos données.
          <br />
          En attendant, le site affiche les produits dont la fiche porte le badge « Nouveau ».
        </div>
      )}

      <ShowcaseManager
        list="arrivals"
        products={products}
        brands={brandsRes.data || []}
        categories={catsRes.data || []}
        initial={initial}
      />
    </>
  );
}
