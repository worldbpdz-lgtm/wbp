import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { SITE } from '@/lib/site';
import { requireMobileEditor } from '@/app/mobile/guard';
import ReviewsScreen from '@/components/mobile/ReviewsScreen';

// ============================================================================
// Avis clients, version téléphone.
// ----------------------------------------------------------------------------
// Écran de modération : un avis arrive NON publié et reste invisible sur le site
// tant que personne ne l'a approuvé. C'est la seule raison d'ouvrir cet écran,
// donc le filtre par défaut est « En attente » — et non « Tous » comme sur
// l'ordinateur, où la fenêtre est assez grande pour tout montrer d'un coup.
//
// Le filtre passe par l'URL, comme sur l'écran Produits : la requête est faite
// en base, pas dans le téléphone. Un filtre local sur les 300 lignes ramenées
// laisserait hors d'atteinte un avis en attente plus ancien que la 300ᵉ ligne.
//
// 300 lignes : PostgREST plafonne chaque réponse à 1000 lignes et selectAll()
// pagine jusqu'au bout, ce qui est le bon comportement sur un ordinateur mais
// pas ici — 1 700 avis sur un réseau 3G, c'est plusieurs secondes d'attente
// pour une liste qu'on parcourt au pouce. On s'arrête donc à 300 (une seule
// requête) et l'écran le dit quand le filtre en compte davantage.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avis clients — WBP' };

const MAX_ROWS = 300;
const FILTERS = ['pending', 'approved', 'all'];

export default async function MobileReviews({ searchParams }) {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const sp = (await searchParams) || {};
  const filter = FILTERS.includes(sp.status) ? sp.status : 'pending';
  const sb = createAdminClient();

  // `.eq('site', SITE)` partout : la base est partagée avec l'autre site, et un
  // avis du voisin n'a rien à faire dans cette liste (les server actions
  // filtrent de leur côté, elles refuseraient l'écriture de toute façon).
  const { data, error } = await selectAll(() => {
    let qy = sb.from('reviews')
      .select('id,created_at,product_id,author,rating,title,body,approved')
      .eq('site', SITE);
    if (filter !== 'all') qy = qy.eq('approved', filter === 'approved');
    return qy.order('created_at', { ascending: false }).order('id');
  }, { pageSize: MAX_ROWS, max: MAX_ROWS });

  // Comptes exacts : `head: true` ne ramène aucune ligne, seulement le total.
  // Ils servent les pastilles du filtre, y compris pour les avis que la liste
  // ci-dessus ne contient pas.
  const [pendingRes, approvedRes] = await Promise.all([
    sb.from('reviews').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('approved', false),
    sb.from('reviews').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('approved', true),
  ]);
  const counts = {
    pending: pendingRes.count || 0,
    approved: approvedRes.count || 0,
  };
  counts.all = counts.pending + counts.approved;

  const rows = (data || []).map((r) => ({
    id: r.id,
    at: r.created_at || null,
    product: r.product_id || null,
    author: r.author || null,
    rating: Number(r.rating) || 0,
    title: r.title || '',
    body: r.body || '',
    approved: !!r.approved,
  }));

  return (
    <ReviewsScreen
      rows={rows}
      counts={counts}
      filter={filter}
      // Vrai quand le filtre compte plus d'avis que les 300 ramenés : l'écran
      // l'annonce au lieu de laisser croire que la liste est complète.
      capped={rows.length >= MAX_ROWS && counts[filter] > rows.length}
      max={MAX_ROWS}
      error={error ? (error.message || 'Erreur inconnue') : null}
    />
  );
}
