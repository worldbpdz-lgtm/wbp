import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import ShowcaseManager from '@/components/admin/ShowcaseManager';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Nouveautés' };

// ----------------------------------------------------------------------------
// Même écran que la vitrine, mais branché sur la table `new_arrivals`.
// Si la migration n'a pas encore été appliquée, on affiche un message clair
// plutôt qu'une page vide, et on propose les produits marqués « Nouveau ».
// ----------------------------------------------------------------------------
const COLS = 'id,name,code,cat,brand,image_url,active';

async function loadProducts(sb) {
  const withBadge = await sb.from('products').select(`${COLS},badge`).order('sort').limit(4000);
  if (!withBadge.error) return { rows: withBadge.data || [], hasBadge: true, error: null };

  const plain = await sb.from('products').select(COLS).order('sort').limit(4000);
  return { rows: plain.data || [], hasBadge: false, error: plain.error || null };
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
          La table des nouveautés (<b>new_arrivals</b>) n’existe pas encore dans cette base :
          lancez <b>apply-arrivals.bat</b> une fois — ou collez <b>supabase/new-arrivals.sql</b>
          dans Supabase → SQL Editor → Run. En attendant, la sélection ci-dessous reprend les
          produits badgés « Nouveau » et l’enregistrement échouera.
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
