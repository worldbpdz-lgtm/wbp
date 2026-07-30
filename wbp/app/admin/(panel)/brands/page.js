import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import BrandsManager from '@/components/admin/BrandsManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Marques' };

export default async function BrandsAdmin() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const [{ data: brands }, { data: products }] = await Promise.all([
    sb.from('brands').select('*').order('sort').order('name'),
    sb.from('products').select('brand'),
  ]);
  // Nombre de produits par marque : sert à afficher l'usage et à bloquer une
  // suppression qui casserait le catalogue.
  const counts = {};
  for (const p of products || []) counts[p.brand] = (counts[p.brand] || 0) + 1;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Marques</h1>
          <p className="adm-sub">
            Ajoutez une marque en saisissant simplement son nom — l’identifiant est généré tout seul.
            Glissez un logo : il s’affiche sur la page Marques, les filtres du catalogue et les cartes produit.
          </p>
        </div>
      </div>
      <BrandsManager brands={brands || []} counts={counts} />
    </>
  );
}
