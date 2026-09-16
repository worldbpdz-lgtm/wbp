import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { PRODUCT_IMAGES } from '@/lib/product-images.generated';
import { requireMobileEditor } from '@/app/mobile/guard';
import ProductForm from '@/components/mobile/ProductForm';

// ============================================================================
// Fiche produit (édition), version téléphone. `id = 'new'` crée une fiche.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche produit — WBP' };

export default async function MobileProductPage({ params }) {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const { id } = await params;
  const isNew = id === 'new';
  const sb = createAdminClient();

  const [{ data: brands }, { data: categories }] = await Promise.all([
    sb.from('brands').select('id,name').order('sort').order('name'),
    sb.from('categories').select('id,name').order('sort'),
  ]);

  let product = null;
  if (!isNew) {
    const { data } = await sb.from('products').select('*').eq('id', id).maybeSingle();
    product = data || null;
  }

  // Photos déjà livrées dans le dépôt (public/products/), hors base. Le site
  // public s'en sert comme repli quand la fiche n'a pas de photo ; l'éditeur lit
  // la base brute. Sans ce passage, une fiche déjà illustrée paraîtrait vide et
  // l'on téléverserait un doublon qui passerait devant le fichier du dépôt.
  const local = isNew ? [] : (PRODUCT_IMAGES[id] || []);

  return (
    <ProductForm
      isNew={isNew}
      product={product}
      localImages={local}
      brands={(brands || []).map((b) => ({ value: b.id, label: b.name }))}
      categories={(categories || []).map((c) => ({ value: c.id, label: c.name?.fr || c.id }))}
    />
  );
}
