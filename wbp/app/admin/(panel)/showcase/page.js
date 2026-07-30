import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import ShowcaseManager from '@/components/admin/ShowcaseManager';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Vitrine' };

export default async function ShowcasePage() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();

  const [{ data: products }, { data: brands }, { data: categories }, picksRes] = await Promise.all([
    sb.from('products').select('id,name,code,cat,brand,image_url,active,featured').order('sort').limit(4000),
    sb.from('brands').select('id,name').order('sort').order('name'),
    sb.from('categories').select('id,name').order('sort'),
    sb.from('featured_picks').select('product_id,rank').eq('site', SITE).order('rank'),
  ]);

  // Si la migration n'a pas encore été appliquée, on retombe sur la colonne
  // products.featured pour ne pas afficher une page cassée.
  const migrated = !picksRes.error;
  const initial = migrated
    ? (picksRes.data || []).map((r) => r.product_id)
    : (products || []).filter((p) => p.featured).map((p) => p.id);

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

      {!migrated && (
        <div className="adm-err" style={{ marginBottom: 16 }}>
          La table de la vitrine n’existe pas encore : lancez <b>apply-upgrade.bat</b> une fois.
          En attendant, la sélection ci-dessous utilise l’ancienne case « ★ mis en avant ».
        </div>
      )}

      <ShowcaseManager
        products={products || []}
        brands={brands || []}
        categories={categories || []}
        initial={initial}
      />
    </>
  );
}
