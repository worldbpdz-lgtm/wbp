import { requireAdmin } from '@/lib/auth';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { selectAll } from '@/lib/queries';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="${SITE}-subscribers.csv"`,
  'Cache-Control': 'no-store',
};
const HEAD = 'email,status,lang,source,created_at,confirmed_at\n';
// Échappement CSV + protection contre l'injection de formules : Excel et
// LibreOffice EXÉCUTENT une cellule commençant par = + - @ (ou une tabulation).
// Une adresse e-mail malveillante saisie dans le formulaire d'inscription
// deviendrait donc une formule au moment où l'admin ouvre l'export. On préfixe
// ces valeurs d'une apostrophe, qui force le mode texte.
const cell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  try { await requireAdmin(); } catch { return new Response('Unauthorized', { status: 401 }); }
  if (!hasSupabase()) return new Response(HEAD, { headers: HEADERS });
  const sb = createAdminClient();
  // Paginé : PostgREST plafonne chaque réponse à 1000 lignes — l'export
  // s'arrêtait silencieusement au 1000ᵉ abonné.
  const { data, error } = await selectAll(() => sb.from('newsletter_subscribers')
    .select('email,status,lang,source,created_at,confirmed_at')
    .eq('site', SITE)
    .order('created_at', { ascending: false })
    .order('id'), { max: 200000 });
  // Plutôt qu'un fichier tronqué qui passerait inaperçu, on signale l'échec.
  if (error) return new Response('Export impossible — réessayez.', { status: 500 });
  const rows = (data || []).map((r) => [r.email, r.status, r.lang, r.source, r.created_at, r.confirmed_at].map(cell).join(','));
  return new Response(HEAD + rows.join('\n') + '\n', { headers: HEADERS });
}
