import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { PRODUCT_IMAGES } from '@/lib/product-images.generated';
import { SITE } from '@/lib/site';
import { requireMobileEditor } from '@/app/mobile/guard';
import ProductsList from '@/components/mobile/ProductsList';

// ============================================================================
// Liste des produits, version téléphone.
// ----------------------------------------------------------------------------
// Composant SERVEUR : la recherche, le filtre et la pagination se font en base,
// pas dans le téléphone. Le catalogue dépasse le millier de fiches — le charger
// entièrement pour filtrer en JavaScript coûterait plusieurs mégaoctets sur un
// réseau 3G, et bloquerait l'écran le temps du téléchargement.
//
// 30 fiches par page : assez pour remplir plusieurs écrans de défilement, assez
// peu pour que la page arrive vite en 3G.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Produits — WBP' };

const PER = 30;

// Dans la grammaire `or(...)` de PostgREST, « , ) ( . » sont structurels : une
// référence contenant une virgule produisait un filtre invalide, donc une liste
// vide. Même échappement que le back-office web.
const orLit = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export default async function MobileProducts({ searchParams }) {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const sp = (await searchParams) || {};
  const q = (sp.q || '').trim();
  const filter = ['active', 'hidden', 'featured'].includes(sp.filter) ? sp.filter : 'all';
  const page = Math.max(1, parseInt(sp.page, 10) || 1);
  const sb = createAdminClient();

  // ★ « mis en avant » = appartenance à la vitrine DE CE SITE (featured_picks).
  // La colonne products.featured appartient au catalogue partagé avec l'autre
  // site : s'y fier afficherait ici l'étoile du voisin.
  const picksRes = await selectAll(() => sb.from('featured_picks')
    .select('product_id').eq('site', SITE).order('product_id'));
  const picked = new Set((picksRes.data || []).map((r) => r.product_id));

  let query = sb.from('products').select('id,name,code,cat,brand,price,active,image_url,images', { count: 'exact' });
  if (q) { const like = orLit(`%${q}%`); query = query.or(`name.ilike.${like},code.ilike.${like}`); }
  if (filter === 'active') query = query.eq('active', true);
  if (filter === 'hidden') query = query.eq('active', false);
  if (filter === 'featured') query = query.in('id', picked.size ? [...picked] : ['']);

  const { data, count, error } = await query
    .order('active', { ascending: false }).order('sort').order('id')
    .range((page - 1) * PER, page * PER - 1);

  const { data: brands } = await sb.from('brands').select('id,name');
  const bmap = Object.fromEntries((brands || []).map((b) => [b.id, b.name]));

  // La vignette suit la même règle que le site public : la photo de la base
  // d'abord, puis la 1ʳᵉ de la galerie, puis le fichier livré dans le dépôt
  // (public/products/). Sans ce dernier repli, des centaines de fiches
  // paraîtraient sans photo alors qu'elles en ont une en ligne.
  const items = (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    price: p.price,
    active: !!p.active,
    featured: picked.has(p.id),
    brand: bmap[p.brand] || null,
    cat: p.cat,
    thumb: p.image_url || (Array.isArray(p.images) && p.images[0]) || (PRODUCT_IMAGES[p.id] || [])[0] || null,
  }));

  return (
    <ProductsList
      items={items}
      total={count || 0}
      page={page}
      pages={Math.max(1, Math.ceil((count || 0) / PER))}
      q={q}
      filter={filter}
      error={error ? (error.message || 'Erreur inconnue') : null}
    />
  );
}
