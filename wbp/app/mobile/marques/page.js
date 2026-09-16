import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { requireMobileEditor } from '@/app/mobile/guard';
import BrandsScreen from '@/components/mobile/BrandsScreen';

// ============================================================================
// Marques, version téléphone.
// ----------------------------------------------------------------------------
// Mêmes données et mêmes requêtes que /admin/brands, y compris le comptage
// PAGINÉ des produits : PostgREST s'arrête à 1000 lignes et le catalogue en
// compte davantage. Sans selectAll(), une marque très utilisée afficherait
// « 0 produit » et paraîtrait supprimable sans conséquence — exactement le
// piège que le garde-fou de deleteBrand existe pour éviter.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marques — WBP' };

export default async function MobileBrandsPage() {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const sb = createAdminClient();
  const [{ data: brands, error }, { data: products }] = await Promise.all([
    sb.from('brands').select('*').order('sort').order('name'),
    selectAll(() => sb.from('products').select('brand').order('id')),
  ]);

  const counts = {};
  for (const p of products || []) counts[p.brand] = (counts[p.brand] || 0) + 1;

  return <BrandsScreen brands={brands || []} counts={counts} error={error?.message || ''} />;
}
