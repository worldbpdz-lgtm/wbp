'use client';
import '@/styles/mobile-vitrine.css';
import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, fmt } from '@/components/mobile/ui';
import { Banner, Btn, Empty, SaveBar, SearchBar, Sheet, SubTop, useToast } from '@/components/mobile/form';
import { saveArrivals, saveBestSellers, saveShowcase } from '@/app/admin/actions';

// ============================================================================
// Vitrine du site, version téléphone : trois listes ordonnées sur un écran.
// ----------------------------------------------------------------------------
// Mêmes tables et MÊMES server actions que les trois écrans du back-office web
// (/admin/showcase, /admin/best-sellers, /admin/arrivals) : chaque action reçoit
// la liste complète des identifiants DANS L'ORDRE et remplace la table, après
// avoir revérifié la session et écrit le journal.
//
// Trois écarts assumés par rapport à l'écran d'ordinateur :
//
//  1. Un seul écran pour les trois listes, avec un filtre en haut. Trois entrées
//     de menu pour trois variantes du même geste, sur un téléphone, c'est trois
//     fois l'occasion de se tromper d'écran.
//  2. Des flèches ↑ ↓ à la place du glisser-déposer : sur un téléphone, un
//     élément qu'on traîne se bat avec le défilement de la page, et la liste
//     saute sous le doigt. Deux boutons de 46 px sont plus lents mais ils
//     obéissent.
//  3. RIEN n'est enregistré avant d'avoir touché « Enregistrer ». Un
//     enregistrement à chaque déplacement, c'est une écriture par flèche — et
//     sur un réseau qui tombe au milieu, une liste à moitié réordonnée en base.
//     La barre d'enregistrement ne concerne que la liste affichée ; un point
//     orange signale les autres listes modifiées et non enregistrées.
//
// La recherche du bouton « Ajouter » se fait dans le téléphone, sur la tranche
// de catalogue envoyée par la page serveur. Une recherche en base (comme sur
// l'écran Produits) passerait par l'URL, donc par une navigation : l'ordre
// réorganisé mais pas encore enregistré n'y survivrait pas de façon fiable.
// ============================================================================

// Plafond du serveur (MAX_PICKS dans app/admin/actions.js). Sans le même
// plafond ici, l'écran laisserait ajouter 210 produits pour n'en enregistrer
// que 200, sans le dire.
const MAX_PICKS = 200;

const LISTS = {
  showcase: {
    tab: 'Vitrine',
    save: saveShowcase,
    table: 'featured_picks',
    saveLabel: 'Enregistrer la vitrine',
    saved: (n) => `Vitrine enregistrée — ${fmt(n)} produit${n > 1 ? 's' : ''}`,
    note: 'Ces produits remontent en tête de la page Produits du site, dans cet ordre.',
    emptyTitle: 'Vitrine vide : le catalogue s’affiche dans son ordre habituel.',
    addTitle: 'Ajouter à la vitrine',
  },
  bestsellers: {
    tab: 'Meilleures ventes',
    save: saveBestSellers,
    table: 'best_sellers',
    saveLabel: 'Enregistrer les meilleures ventes',
    saved: (n) => `Meilleures ventes enregistrées — ${fmt(n)} produit${n > 1 ? 's' : ''}`,
    note: 'Le carrousel « Meilleures ventes » de la page d’accueil, dans cet ordre.',
    emptyTitle: 'Aucune meilleure vente choisie : le site affiche les produits dont la fiche porte le badge « Best-seller ».',
    addTitle: 'Ajouter aux meilleures ventes',
  },
  arrivals: {
    tab: 'Nouveautés',
    save: saveArrivals,
    table: 'new_arrivals',
    saveLabel: 'Enregistrer les nouveautés',
    saved: (n) => `Nouveautés enregistrées — ${fmt(n)} produit${n > 1 ? 's' : ''}`,
    note: 'La section « Nouveaux arrivages » de la page d’accueil, dans cet ordre.',
    emptyTitle: 'Aucune nouveauté choisie : le site affiche les produits dont la fiche porte le badge « Nouveau ».',
    addTitle: 'Ajouter aux nouveautés',
  },
};

const KEYS = ['showcase', 'bestsellers', 'arrivals'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Nombre de résultats rendus d'un coup dans la feuille d'ajout : au-delà, la
// feuille devient longue à peindre et la recherche est de toute façon le bon
// outil.
const SHOWN = 40;

export default function VitrineScreen({ products, lists, missing, catalogShown, error }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState('showcase');
  // `base` = ce qui est en base, `work` = ce qu'on est en train de faire. Les
  // deux dans le même état : c'est ce qui permet de reprendre les données du
  // serveur (rafraîchissement, ou modification faite depuis /admin) sans écraser
  // une liste réorganisée mais pas encore enregistrée.
  const [st, setSt] = useState({ base: lists, work: lists });
  const { base, work } = st;
  const [add, setAdd] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState('');

  const serverSig = JSON.stringify(lists);
  useEffect(() => {
    setSt((s) => {
      const next = { ...s.work };
      // Une liste intacte suit le serveur ; une liste modifiée reste telle
      // quelle, et la barre d'enregistrement la compare désormais à la nouvelle
      // référence.
      for (const k of KEYS) if (same(s.work[k] || [], s.base[k] || [])) next[k] = lists[k] || [];
      return { base: lists, work: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  const L = LISTS[tab];
  const ids = work[tab] || [];
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const inList = useMemo(() => new Set(ids), [ids]);

  const dirty = !same(ids, base[tab] || []);
  // Une autre liste modifiée reste en mémoire mais n'est PAS enregistrée par la
  // barre du bas : on le dit, sinon on quitte l'écran en croyant avoir tout
  // enregistré.
  const otherDirty = KEYS.filter((k) => k !== tab && !same(work[k] || [], base[k] || []));

  const setList = (next) => setSt((s) => ({ ...s, work: { ...s.work, [tab]: next } }));

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const n = [...ids];
    [n[i], n[j]] = [n[j], n[i]];
    setList(n);
  };
  const remove = (id) => setList(ids.filter((x) => x !== id));
  const addOne = (id) => {
    if (inList.has(id)) return;
    if (ids.length >= MAX_PICKS) {
      toast(`Maximum ${MAX_PICKS} produits dans cette liste`, 'bad');
      return;
    }
    setList([...ids, id]);
  };

  // Candidats de la feuille d'ajout : la tranche de catalogue reçue, moins ce
  // qui est déjà dans la liste affichée.
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (inList.has(p.id)) return false;
      if (!s) return true;
      return `${p.name} ${p.code}`.toLowerCase().includes(s);
    });
  }, [products, inList, q]);

  const save = async () => {
    setWarn('');
    setBusy(true);
    try {
      // La server action reçoit la liste ORDONNÉE : elle vide la table du site
      // puis réécrit les rangs dans cet ordre.
      const res = await L.save(ids);
      if (!res?.ok) { toast(res?.error || 'Enregistrement impossible', 'bad'); return; }
      setSt((s) => ({ ...s, base: { ...s.base, [tab]: ids } }));
      if (res.warn) {
        // Base pas encore migrée : la sélection passe, l'ordre exact non.
        setWarn(res.warn);
        toast('Enregistré, mais l’ordre exact n’a pas pu être écrit', 'bad');
      } else {
        toast(L.saved(ids.length));
      }
      start(() => router.refresh());
    } catch (e) {
      toast(e?.message || 'Pas de réseau — rien n’a été enregistré', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SubTop
        title="Vitrine du site"
        subtitle={`${L.tab} · ${fmt(ids.length)} produit${ids.length > 1 ? 's' : ''}`}
        back="/mobile/plus"
        action={(
          <button
            className={`mb-icbtn ${pending ? 'spin' : ''}`}
            onClick={() => start(() => router.refresh())}
            aria-label="Rafraîchir"
          >
            <Icon name="refresh" size={18} />
          </button>
        )}
      />

      <div className="mb-wrap">
        <div className="mbl-seg" role="group" aria-label="Choisir la liste">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={tab === k ? 'on' : ''}
              onClick={() => { setTab(k); setWarn(''); }}
            >
              {LISTS[k].tab} {fmt((work[k] || []).length)}
              {!same(work[k] || [], base[k] || []) && <i className="mbv-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {error && <Banner kind="bad">Le catalogue n’a pas pu être chargé : {error}</Banner>}
        {warn && <Banner kind="warn" onClose={() => setWarn('')}>{warn}</Banner>}

        {missing[tab] && (
          <Banner kind="warn">
            La base n’est pas à jour : la table <b>{L.table}</b> est introuvable, cette liste ne peut
            pas être enregistrée depuis le téléphone. Collez <b>supabase/fix-all.sql</b> dans
            Supabase → SQL Editor → Run, une seule fois.
          </Banner>
        )}

        {otherDirty.length > 0 && (
          <Banner kind="info">
            {otherDirty.map((k) => LISTS[k].tab).join(' et ')} {otherDirty.length > 1 ? 'ont' : 'a'} des
            modifications non enregistrées : ouvrez {otherDirty.length > 1 ? 'ces onglets' : 'cet onglet'} pour
            les enregistrer.
          </Banner>
        )}

        <p className="mbv-hint">{L.note}</p>

        {ids.length === 0 ? (
          <Empty
            icon="spark"
            action={<Btn icon="plus" variant="primary" onClick={() => { setQ(''); setAdd(true); }}>Ajouter un produit</Btn>}
          >
            {L.emptyTitle}
          </Empty>
        ) : (
          <>
            <div className="mbv-list">
              {ids.map((id, i) => {
                const p = byId[id];
                return (
                  <div className="mbv-row" key={id}>
                    <span className="mbv-thumb">
                      {p?.thumb
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={p.thumb} alt="" loading="lazy" />
                        : <Icon name="image" size={20} />}
                    </span>
                    <span className="mbv-bd">
                      <b>{p ? p.name : `${id} (produit supprimé)`}</b>
                      <small>
                        <span className="mbv-rank">{i + 1}</span>
                        {p?.code ? ` · ${p.code}` : ''}
                        {p && !p.active ? ' · masqué' : ''}
                      </small>
                    </span>
                    <span className="mbv-ctrl">
                      <button type="button" aria-label={`Monter ${p?.name || id}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" aria-label={`Descendre ${p?.name || id}`} disabled={i === ids.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button type="button" className="rm" onClick={() => remove(id)}>Retirer</button>
                    </span>
                  </div>
                );
              })}
            </div>

            <Btn icon="plus" onClick={() => { setQ(''); setAdd(true); }}>Ajouter un produit</Btn>
          </>
        )}

        <div className="mbf-pad" />
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        onSave={save}
        onCancel={() => { setList(base[tab] || []); setWarn(''); }}
        saveLabel={L.saveLabel}
      />

      {/* ------------------------------------------------ ajout d'un produit -- */}
      <Sheet
        open={add}
        onClose={() => setAdd(false)}
        title={L.addTitle}
        footer={<Btn variant="primary" onClick={() => setAdd(false)}>Terminé</Btn>}
      >
        <SearchBar value={q} onChange={setQ} placeholder="Nom ou référence…" />

        {matches.length === 0 ? (
          <Empty icon="box">
            {q
              ? `Aucun produit pour « ${q} » parmi les ${fmt(catalogShown)} proposés ici.`
              : 'Tous les produits proposés sont déjà dans cette liste.'}
          </Empty>
        ) : (
          <div className="mbv-picks">
            {matches.slice(0, SHOWN).map((p) => (
              <button type="button" className="mbv-pick" key={p.id} onClick={() => addOne(p.id)}>
                <span className="mbv-thumb">
                  {p.thumb
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={p.thumb} alt="" loading="lazy" />
                    : <Icon name="image" size={20} />}
                </span>
                <span className="mbv-bd">
                  <b>{p.name}</b>
                  <small>{p.code}{p.active ? '' : ' · masqué'}</small>
                </span>
                <span className="mbv-plus" aria-hidden="true">+</span>
              </button>
            ))}
          </div>
        )}

        {/* Le catalogue complet (plus de 1 700 fiches) n'est pas envoyé au
            téléphone : on le dit, et on indique le chemin qui marche pour un
            produit plus loin dans le catalogue. */}
        <p className="mbv-hint">
          {matches.length > SHOWN
            ? `${fmt(SHOWN)} résultats sur ${fmt(matches.length)} — précisez la recherche. `
            : ''}
          Les {fmt(catalogShown)} premiers produits visibles du catalogue sont proposés ici.
          {tab === 'showcase'
            ? ' Pour un produit plus loin dans la liste, ouvrez sa fiche dans Produits et choisissez « Mettre en vitrine ».'
            : ' Pour un produit plus loin dans la liste, passez par le back-office sur ordinateur.'}
        </p>
      </Sheet>
    </>
  );
}
