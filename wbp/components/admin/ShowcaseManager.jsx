'use client';
// ============================================================================
// VITRINE — « je choisis la catégorie, la marque, et les produits qui
// apparaissent en premier ».
// ----------------------------------------------------------------------------
// Deux colonnes : à gauche le catalogue filtré (catégorie + marque + recherche),
// à droite la sélection ordonnée. On ajoute d'un clic, on réordonne avec les
// flèches ou en glissant, on enregistre. L'ordre saisi ici est celui du site
// public.
//
// Le même écran sert à trois listes distinctes :
//   • VITRINE          → priorité des produits dans le catalogue
//   • MEILLEURES VENTES→ carrousel « Meilleures ventes » de l'accueil
//   • NOUVEAUTÉS       → carrousel « Nouveaux arrivages » de l'accueil
// On passe simplement l'action d'enregistrement et les libellés via `list`.
// ============================================================================
import React, { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveShowcase, saveBestSellers, saveArrivals } from '@/app/admin/actions';
import { Icon } from '@/components/primitives';

// Les trois listes gérées par cet écran.
const LISTS = {
  showcase: {
    save: saveShowcase,
    noun: 'Vitrine',
    addTitle: 'Ajouter à la vitrine',
    pickedTitle: 'Affichés en premier',
    emptyTitle: 'Vitrine vide',
    emptyHelp: 'Cliquez sur un produit à gauche pour le faire apparaître en premier sur le site.',
    savedText: (n) => `Vitrine enregistrée — ${n} produit(s) mis en avant.`,
    saveBtn: 'Enregistrer la vitrine',
    cleanText: 'Vitrine à jour',
  },
  bestsellers: {
    save: saveBestSellers,
    noun: 'Meilleures ventes',
    addTitle: 'Ajouter aux meilleures ventes',
    pickedTitle: 'Meilleures ventes',
    emptyTitle: 'Aucune meilleure vente sélectionnée',
    emptyHelp: 'Cliquez sur un produit à gauche pour l’afficher dans « Meilleures ventes » sur l’accueil. Tant que la liste est vide, le site affiche les produits marqués « Best-seller » dans leur fiche.',
    savedText: (n) => `Meilleures ventes enregistrées — ${n} produit(s) affiché(s).`,
    saveBtn: 'Enregistrer les meilleures ventes',
    cleanText: 'Meilleures ventes à jour',
  },
  arrivals: {
    save: saveArrivals,
    noun: 'Nouveautés',
    addTitle: 'Ajouter aux nouveautés',
    pickedTitle: 'Nouveaux arrivages',
    emptyTitle: 'Aucune nouveauté sélectionnée',
    emptyHelp: 'Cliquez sur un produit à gauche pour l’afficher dans « Nouveaux arrivages » sur l’accueil. Tant que la liste est vide, le site affiche les produits marqués « Nouveau » dans leur fiche.',
    savedText: (n) => `Nouveautés enregistrées — ${n} produit(s) affiché(s).`,
    saveBtn: 'Enregistrer les nouveautés',
    cleanText: 'Nouveautés à jour',
  },
};

function Thumb({ p }) {
  const [broken, setBroken] = React.useState(false);
  if (p.image_url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="shw-thumb" src={p.image_url} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  return <span className="shw-thumb shw-thumb-ph"><Icon name="box" size={16} /></span>;
}

// Nombre de lignes rendues d'un coup dans la colonne de gauche. Le catalogue
// n'est plus tronqué à 200 : on affiche par tranches avec un bouton
// « Afficher plus », donc tous les produits restent atteignables.
const CHUNK = 100;

// Plafond de la sélection. Doit rester identique à MAX_PICKS dans
// app/admin/actions.js, sinon l'écran promet plus que le serveur n'enregistre.
const MAX_PICKS = 200;

export default function ShowcaseManager({ products = [], brands = [], categories = [], initial = [], list = 'showcase' }) {
  const L = LISTS[list] || LISTS.showcase;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState(initial);
  const [cat, setCat] = useState('all');
  const [brand, setBrand] = useState('all');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState(null);
  const [drag, setDrag] = useState(null);
  const [shown, setShown] = useState(CHUNK);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const catName = (id) => categories.find((c) => c.id === id)?.name?.fr || id;
  const brandName = (id) => brands.find((b) => b.id === id)?.name || id;

  const pickedSet = useMemo(() => new Set(picked), [picked]);

  // Tous les produits correspondant aux filtres — plus aucune limite à 200.
  const available = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (pickedSet.has(p.id)) return false;
      if (cat !== 'all' && p.cat !== cat) return false;
      if (brand !== 'all' && p.brand !== brand) return false;
      if (s && !`${p.name} ${p.code}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [products, pickedSet, cat, brand, q]);

  // Seule la portion affichée est limitée (performance du rendu), et le bouton
  // « Afficher plus » descend jusqu'au bout de la liste.
  const visible = available.slice(0, shown);
  React.useEffect(() => { setShown(CHUNK); }, [cat, brand, q]);

  // Le serveur tronque la sélection à MAX_PICKS. Sans le même plafond ici,
  // l'écran laissait ajouter 210 produits puis annonçait « 200 enregistrés »
  // en en perdant 10 sans le dire.
  const room = Math.max(0, MAX_PICKS - picked.length);
  const full = () => setMsg({ kind: 'err', text: `Maximum ${MAX_PICKS} produits dans cette liste.` });
  const add = (id) => {
    if (picked.includes(id)) return;
    if (picked.length >= MAX_PICKS) { full(); return; }
    setPicked((v) => (v.includes(id) ? v : [...v, id]));
    setMsg(null);
  };
  const remove = (id) => { setPicked((v) => v.filter((x) => x !== id)); setMsg(null); };
  const move = (i, d) => {
    setPicked((v) => {
      const j = i + d; if (j < 0 || j >= v.length) return v;
      const n = [...v]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
    setMsg(null);
  };
  // Les deux boutons d'ajout en masse respectent la place restante.
  const addMany = (rows) => {
    if (room === 0) { full(); return; }
    const toAdd = rows.map((p) => p.id).filter((id) => !picked.includes(id)).slice(0, room);
    if (!toAdd.length) return;
    setPicked((v) => [...v, ...toAdd.filter((id) => !v.includes(id))].slice(0, MAX_PICKS));
    setMsg(null);
  };
  const addAllVisible = () => addMany(available.slice(0, 24));
  const addEveryMatch = () => addMany(available);

  // Glisser-déposer dans la colonne de droite.
  const onDrop = (to) => {
    if (drag === null || drag === to) return;
    setPicked((v) => { const n = [...v]; const [it] = n.splice(drag, 1); n.splice(to, 0, it); return n; });
    setDrag(null);
  };

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await L.save(picked);
      if (res?.ok) {
        setMsg(res.warn
          ? { kind: 'err', text: res.warn }
          : { kind: 'ok', text: L.savedText(res.count) });
        router.refresh();
      } else setMsg({ kind: 'err', text: res?.error || 'Enregistrement impossible.' });
    });
  };

  const dirty = JSON.stringify(picked) !== JSON.stringify(initial);

  return (
    <div className="shw">
      {/* ---- Filtres ---- */}
      <div className="adm-panel shw-filters">
        <div className="shw-filters-bd">
          <label>Catégorie
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name?.fr || c.id} ({products.filter((p) => p.cat === c.id).length})
                </option>
              ))}
            </select>
          </label>
          <label>Marque
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="all">Toutes les marques</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({products.filter((p) => p.brand === b.id).length})
                </option>
              ))}
            </select>
          </label>
          <label>Recherche
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou référence…" />
          </label>
          {(cat !== 'all' || brand !== 'all' || q) && (
            <button type="button" className="adm-btn" onClick={() => { setCat('all'); setBrand('all'); setQ(''); }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* ---- Deux colonnes ---- */}
      <div className="shw-cols">
        <div className="adm-panel shw-col">
          <div className="adm-panel-hd">
            <h2>Catalogue <span className="adm-count">{available.length}</span></h2>
            {available.length > 0 && (
              <span className="adm-actions">
                <button type="button" className="adm-btn sm" onClick={addAllVisible}>+ 24 premiers</button>
                <button type="button" className="adm-btn sm" onClick={addEveryMatch} disabled={room === 0}>
                  + Tout ajouter ({Math.min(available.length, room)})
                </button>
              </span>
            )}
          </div>
          <div className="shw-list">
            {available.length === 0 ? (
              <div className="adm-empty">Aucun produit disponible avec ces filtres.</div>
            ) : visible.map((p) => (
              <button type="button" key={p.id} className="shw-row" onClick={() => add(p.id)} title={L.addTitle}>
                <Thumb p={p} />
                <span className="shw-row-txt">
                  <b>{p.name}</b>
                  <small>{p.code} · {brandName(p.brand)} · {catName(p.cat)}{p.active ? '' : ' · masqué'}</small>
                </span>
                <span className="shw-add" aria-hidden="true">+</span>
              </button>
            ))}
            {available.length > visible.length && (
              <button type="button" className="adm-btn" style={{ margin: '10px auto', display: 'block' }}
                onClick={() => setShown((v) => v + CHUNK)}>
                Afficher plus ({visible.length} / {available.length})
              </button>
            )}
          </div>
        </div>

        <div className="adm-panel shw-col shw-col-picked">
          <div className="adm-panel-hd">
            <h2>{L.pickedTitle} <span className="adm-count on">{picked.length}</span></h2>
            {picked.length > 0 && <button type="button" className="adm-btn sm danger" onClick={() => setPicked([])}>Tout vider</button>}
          </div>
          <div className="shw-list">
            {picked.length === 0 ? (
              <div className="adm-empty">
                <b>{L.emptyTitle}</b>
                <p>{L.emptyHelp}</p>
              </div>
            ) : picked.map((id, i) => {
              const p = byId[id];
              return (
                <div key={id} className={`shw-row picked ${drag === i ? 'dragging' : ''}`}
                  draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}>
                  <span className="shw-rank">{i + 1}</span>
                  {p ? <Thumb p={p} /> : <span className="shw-thumb shw-thumb-ph">?</span>}
                  <span className="shw-row-txt">
                    <b>{p ? p.name : `${id} (produit supprimé)`}</b>
                    {p && <small>{p.code} · {brandName(p.brand)}</small>}
                  </span>
                  <span className="shw-ctrl">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === picked.length - 1} title="Descendre">↓</button>
                    <button type="button" className="danger" onClick={() => remove(id)} title="Retirer">×</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- Barre d'enregistrement ---- */}
      <div className={`shw-save ${dirty ? 'dirty' : ''}`}>
        <span className="shw-save-txt">
          {dirty ? 'Modifications non enregistrées' : L.cleanText}
          {msg && <em className={`adm-flash ${msg.kind}`}>{msg.text}</em>}
        </span>
        <div className="adm-actions">
          {dirty && <button type="button" className="adm-btn" onClick={() => { setPicked(initial); setMsg(null); }}>Annuler</button>}
          <button type="button" className="adm-btn primary" onClick={save} disabled={pending || !dirty}>
            {pending ? 'Enregistrement…' : L.saveBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
