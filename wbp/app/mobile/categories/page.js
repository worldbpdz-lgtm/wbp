import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { requireMobileEditor } from '@/app/mobile/guard';
import CategoriesScreen from '@/components/mobile/CategoriesScreen';

// ============================================================================
// Catégories, version téléphone.
// ----------------------------------------------------------------------------
// Mêmes requêtes que /admin/categories. Le comptage des produits passe par
// selectAll() pour la même raison que sur l'écran des marques : PostgREST
// s'arrête à 1000 lignes, et un « 0 produit » faux ferait croire qu'une
// catégorie pleine est supprimable.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catégories — WBP' };

export default async function MobileCategoriesPage() {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const sb = createAdminClient();
  const [{ data: categories, error }, { data: products }] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    selectAll(() => sb.from('products').select('cat').order('id')),
  ]);

  const counts = {};
  for (const p of products || []) counts[p.cat] = (counts[p.cat] || 0) + 1;

  return <CategoriesScreen categories={categories || []} counts={counts} error={error?.message || ''} />;
}
