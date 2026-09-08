import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import CategoriesManager from '@/components/admin/CategoriesManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Catégories' };

export default async function CategoriesAdmin() {
  if (!hasSupabase()) return null;
  const sb = createAdminClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    // Paginé : PostgREST s'arrête à 1000 lignes, le catalogue en compte plus —
    // sinon le « {n} produit(s) » par catégorie est sous-évalué.
    selectAll(() => sb.from('products').select('cat').order('id')),
  ]);
  const counts = {};
  for (const p of products || []) counts[p.cat] = (counts[p.cat] || 0) + 1;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Catégories</h1>
          <p className="adm-sub">
            Le nom FR suffit pour créer une catégorie. Ajoutez une image pour remplacer
            l’icône sur les cartes de la page d’accueil.
          </p>
        </div>
      </div>
      <CategoriesManager categories={categories || []} counts={counts} />
    </>
  );
}
