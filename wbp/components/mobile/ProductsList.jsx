'use client';
import React, { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/mobile/MobileApp';
import { Icon, fmt } from '@/components/mobile/ui';
import { Banner, Btn, Confirm, Empty, SearchBar, Sheet, useToast } from '@/components/mobile/form';
import { deleteProduct, toggleProductActive, toggleProductFeatured } from '@/app/admin/actions';

// ============================================================================
// Liste des produits (écran de travail principal de l'équipe).
// ----------------------------------------------------------------------------
// Ce composant ne détient AUCUNE donnée : la page serveur lui passe une page de
// résultats, et tout changement de recherche ou de filtre repasse par l'URL.
// Conséquences voulues :
//
//  • le bouton « retour » du téléphone remonte dans les recherches ;
//  • un résultat se partage ou s'ajoute à l'écran d'accueil tel quel ;
//  • après une modification, router.refresh() recharge la page courante sans
//    perdre ni la recherche, ni la position dans la liste.
//
// La recherche est temporisée (350 ms) : à chaque frappe, une requête partirait
// vers la base, et sur un réseau mobile les réponses reviendraient dans le
// désordre.
// ============================================================================

const FILTERS = [
  ['all', 'Tous'],
  ['active', 'Visibles'],
  ['hidden', 'Masqués'],
  ['featured', '★ En avant'],
];

const dz = (n) => (n == null || n === '' ? null : `${new Intl.NumberFormat('fr-DZ').format(n)} DA`);

export default function ProductsList({ items, total, page, pages, q, filter, error }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(q);
  const [active, setActive] = useState(null);   // produit dont les actions sont ouvertes
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);

  // Recherche temporisée → URL. On saute le premier passage, sinon l'écran se
  // recharge dès son ouverture.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (draft === q) return;
    const t = setTimeout(() => {
      const u = new URLSearchParams();
      if (draft.trim()) u.set('q', draft.trim());
      if (filter !== 'all') u.set('filter', filter);
      start(() => router.push(`/mobile/products${u.toString() ? `?${u}` : ''}`));
    }, 350);
    return () => clearTimeout(t);
  }, [draft, q, filter, router, start]);

  const go = (params) => {
    const u = new URLSearchParams();
    const next = { q: draft.trim(), filter, page: 1, ...params };
    if (next.q) u.set('q', next.q);
    if (next.filter && next.filter !== 'all') u.set('filter', next.filter);
    if (next.page && next.page > 1) u.set('page', String(next.page));
    start(() => router.push(`/mobile/products${u.toString() ? `?${u}` : ''}`));
  };

  // Toute action passe par la même mécanique : on appelle la server action (qui
  // revérifie la session et écrit le journal), on annonce le résultat, et on
  // recharge la page serveur. Pas de mise à jour optimiste : une bascule
  // « visible » qui s'affiche puis se rétracte est pire qu'une demi-seconde
  // d'attente.
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.ok === false) { toast(res.error || 'Action impossible', 'bad'); return false; }
      toast(okMsg);
      setActive(null);
      start(() => router.refresh());
      return true;
    } catch (e) {
      toast(e?.message || 'Pas de réseau', 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title="Produits"
        subtitle={`${fmt(total)} fiche${total > 1 ? 's' : ''}${q ? ` · « ${q} »` : ''}`}
        onRefresh={() => start(() => router.refresh())}
        busy={pending}
      />

      <div className="mb-wrap">
        <SearchBar value={draft} onChange={setDraft} placeholder="Nom ou référence…" />

        <div className="mbl-seg" role="group" aria-label="Filtrer">
          {FILTERS.map(([key, label]) => (
            <button key={key} className={filter === key ? 'on' : ''} onClick={() => go({ filter: key })}>
              {label}
            </button>
          ))}
        </div>

        {error && <Banner kind="bad">La liste n’a pas pu être chargée : {error}</Banner>}

        {items.length === 0 ? (
          <Empty icon="box">
            {q ? `Aucun produit pour « ${q} ».` : 'Aucun produit pour ce filtre.'}
          </Empty>
        ) : (
          <div className="mbl">
            {items.map((p) => (
              <div className="mbl-row" key={p.id}>
                <Link href={`/mobile/products/${encodeURIComponent(p.id)}`} className="mbl-thumb">
                  {p.thumb
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={p.thumb} alt="" loading="lazy" />
                    : <Icon name="image" size={22} />}
                </Link>
                <Link href={`/mobile/products/${encodeURIComponent(p.id)}`} className="mbl-bd">
                  <span className="t">{p.name}</span>
                  <span className="s">
                    {p.code}{p.brand ? ` · ${p.brand}` : ''}{dz(p.price) ? ` · ${dz(p.price)}` : ''}
                  </span>
                  <span className="s" style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                    <span className={`mbl-tag ${p.active ? 'ok' : 'off'}`}>{p.active ? 'Visible' : 'Masqué'}</span>
                    {p.featured && <span className="mbl-tag hot">★ En avant</span>}
                  </span>
                </Link>
                <button className="mb-icbtn" onClick={() => setActive(p)} aria-label={`Actions pour ${p.name}`}>
                  <Icon name="dots" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Btn variant="sm" disabled={page <= 1 || pending} onClick={() => go({ page: page - 1 })}>
              <Icon name="chevleft" size={17} /> Précédent
            </Btn>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{page} / {pages}</span>
            <Btn variant="sm" disabled={page >= pages || pending} onClick={() => go({ page: page + 1 })}>
              Suivant <Icon name="chevright" size={17} />
            </Btn>
          </div>
        )}

        <div className="mbf-pad" />
      </div>

      <Link href="/mobile/products/new" className="mbl-fab" aria-label="Nouveau produit">
        <Icon name="plus" size={26} />
      </Link>

      {/* ------------------------------------------------- actions rapides -- */}
      <Sheet open={!!active} onClose={() => setActive(null)} title={active?.name}>
        {active && (
          <div className="mbp-acts">
            <Btn icon="pencil" onClick={() => { setActive(null); router.push(`/mobile/products/${encodeURIComponent(active.id)}`); }}>
              Modifier la fiche
            </Btn>
            <Btn
              icon={active.active ? 'eyeoff' : 'eye'}
              disabled={busy}
              onClick={() => run(
                () => toggleProductActive(active.id, !active.active),
                active.active ? 'Produit masqué du site' : 'Produit visible sur le site',
              )}
            >
              {active.active ? 'Masquer du site' : 'Afficher sur le site'}
            </Btn>
            <Btn
              icon="star"
              disabled={busy}
              onClick={() => run(
                () => toggleProductFeatured(active.id, !active.featured),
                active.featured ? 'Retiré de la vitrine' : 'Ajouté à la vitrine',
              )}
            >
              {active.featured ? 'Retirer de la vitrine' : 'Mettre en vitrine'}
            </Btn>
            <Btn variant="danger" icon="trash" disabled={busy} onClick={() => setConfirmDel(true)}>
              Supprimer le produit
            </Btn>
          </div>
        )}
      </Sheet>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        busy={busy}
        onConfirm={async () => {
          const ok = await run(() => deleteProduct(active.id), 'Produit supprimé');
          if (ok) setConfirmDel(false);
        }}
        title="Supprimer ce produit ?"
        body={`« ${active?.name} » disparaîtra du site et du catalogue, avec ses photos et ses avis. C’est définitif — pour le retirer du site sans le perdre, utilisez « Masquer ».`}
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}
