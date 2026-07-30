import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import ShowcaseManager from '@/components/admin/ShowcaseManager';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Vitrine' };

// ----------------------------------------------------------------------------
// Colonnes nécessaires à la vitrine. `featured` n'existe QU'APRÈS la migration
// (supabase/upgrade.sql). Or PostgREST rejette la requête entière dès qu'une
// colonne citée est inconnue : la page se retrouvait alors sans aucun produit,
// sans le moindre message. On tente donc avec `featured`, puis sans.
// ----------------------------------------------------------------------------
const COLS = 'id,name,code,cat,brand,image_url,active';

async function loadProducts(sb) {
  const withFeatured = await sb.from('products').select(`${COLS},featured`).order('sort').limit(4000);
  if (!withFeatured.error) return { rows: withFeatured.data || [], hasFeatured: true, error: null };

  const plain = await sb.from('products').select(COLS).order('sort').limit(4000);
  return { rows: plain.data || [], hasFeatured: false, error: plain.error || null };
}

export default async function ShowcasePage() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();

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
          <h1 className="adm-h1">Vitrine — produits affichés en premier</h1>
          <p className="adm-sub">
            Filtrez par catégorie et par marque, cliquez sur les produits à mettre en avant,
            puis glissez-les pour définir l’ordre exact. Ils apparaissent dans « Meilleures ventes »
            sur l’accueil et en tête du catalogue.
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
          La table de la vitrine (<b>featured_picks</b>) n’existe pas encore dans cette base :
          lancez <b>apply-upgrade.bat</b> une fois — ou collez <b>supabase/upgrade.sql</b> dans
          Supabase → SQL Editor → Run. En attendant, la sélection ci-dessous utilise l’ancienne
          case « ★ mis en avant » et l’enregistrement échouera.
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
