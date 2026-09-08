import Link from 'next/link';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { ToggleActive, ToggleFeatured, DeleteBtn } from '@/components/admin/controls';

export const dynamic = 'force-dynamic';
const PER = 50;
const dz = (n) => n == null ? '—' : new Intl.NumberFormat('fr-DZ').format(n) + ' DA';
// Dans la grammaire `or(...)` de PostgREST, « , ) ( . » sont structurels : une
// référence contenant une virgule ou une parenthèse produisait un filtre
// invalide (et donc un tableau vide). On entoure la valeur de guillemets
// doubles, en échappant les guillemets et antislashs internes.
const orLit = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export default async function ProductsAdmin({ searchParams }) {
  if (!hasSupabase()) return null;
  const sp = await searchParams;
  const q = (sp?.q || '').trim();
  const filter = sp?.filter || 'all';
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const sb = createAdminClient();

  let query = sb.from('products').select('*', { count: 'exact' });
  if (q) { const like = orLit(`%${q}%`); query = query.or(`name.ilike.${like},code.ilike.${like}`); }
  if (filter === 'active') query = query.eq('active', true);
  if (filter === 'hidden') query = query.eq('active', false);
  if (filter === 'featured') query = query.eq('featured', true);
  // Les produits mis en avant remontent en tête : tri fait par la base, sinon
  // il ne porterait que sur les 50 lignes de la page courante.
  const { data: products, count, error } = await query
    .order('featured', { ascending: false }).order('active', { ascending: false }).order('sort').order('id')
    .range((page - 1) * PER, page * PER - 1);
  const { data: brands } = await sb.from('brands').select('id,name');
  const bmap = Object.fromEntries((brands || []).map((b) => [b.id, b.name]));
  const total = count || 0; const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (extra) => { const u = new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== 'all' ? { filter } : {}), ...extra }); return u.toString() ? '?' + u : ''; };

  return (
    <>
      <div className="adm-head">
        <div><h1 className="adm-h1">Produits</h1><p className="adm-sub">{error ? 'Liste indisponible — voir le message ci-dessous.' : <>{total} produit(s){filter !== 'all' ? ` · ${{ active: 'visibles', hidden: 'masqués', featured: 'mis en avant' }[filter] || filter}` : ''}{q ? ` · recherche « ${q} »` : ''}. L’étoile ★ met un produit en avant : il apparaît en premier dans le catalogue.</>}</p></div>
        <Link className="adm-btn primary" href="/admin/products/new">+ Nouveau produit</Link>
      </div>

      <form className="adm-actions" style={{ marginBottom: 16 }} method="get">
        <input name="q" defaultValue={q} placeholder="Rechercher nom ou référence…" style={{ minWidth: 280, padding: '9px 13px', border: '1px solid var(--line)', borderRadius: 11, font: 'inherit' }} />
        <select name="filter" defaultValue={filter} className="adm-btn" style={{ paddingInlineEnd: 30 }}>
          <option value="all">Tous</option>
          <option value="active">Visibles</option>
          <option value="hidden">Masqués</option>
          <option value="featured">Mis en avant ★</option>
        </select>
        <button className="adm-btn primary" type="submit">Filtrer</button>
        {(q || filter !== 'all') && <Link className="adm-btn" href="/admin/products">Réinitialiser</Link>}
      </form>

      {error && (
        <div className="adm-err">
          La liste n’a pas pu être chargée{q ? ` pour la recherche « ${q} »` : ''} : {error.message || 'erreur inconnue'}.
          {q ? ' Essayez une recherche sans caractères spéciaux, ou réinitialisez le filtre.' : ' Réessayez dans un instant.'}
        </div>
      )}

      <div className="adm-panel">
        <table className="adm-table">
          <thead><tr><th>Référence</th><th>Nom</th><th>Catégorie</th><th>Marque</th><th>Prix</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {(products || []).map((p) => (
              <tr key={p.id}>
                <td className="adm-muted">{p.code}</td>
                <td><b>{p.name}</b></td>
                <td><span className="adm-muted">{p.cat}</span></td>
                <td>{bmap[p.brand] || '—'}</td>
                <td className="adm-muted">{dz(p.price)}</td>
                <td>
                  <span className={`adm-tag ${p.active ? 'ok' : 'gray'}`}>{p.active ? 'Visible' : 'Masqué'}</span>
                  {p.featured && <span className="adm-tag warn" style={{ marginInlineStart: 6 }}>★ En avant</span>}
                </td>
                <td><div className="adm-actions">
                  <ToggleFeatured id={p.id} featured={!!p.featured} />
                  <Link className="adm-btn sm" href={`/admin/products/${p.id}`}>Éditer</Link>
                  <ToggleActive id={p.id} active={p.active} />
                  <DeleteBtn kind="product" id={p.id} />
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="adm-actions" style={{ justifyContent: 'center' }}>
          {page > 1 && <Link className="adm-btn sm" href={qs({ page: page - 1 })}>← Précédent</Link>}
          <span className="adm-muted" style={{ alignSelf: 'center' }}>Page {page} / {pages}</span>
          {page < pages && <Link className="adm-btn sm" href={qs({ page: page + 1 })}>Suivant →</Link>}
        </div>
      )}
    </>
  );
}
