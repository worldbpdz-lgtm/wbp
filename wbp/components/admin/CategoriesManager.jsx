'use client';
// ============================================================================
// Catégories — création, édition, image et suppression.
// Même logique que les marques : formulaire d'ajout en haut, identifiant déduit
// du nom FR, image en glisser-déposer, erreurs en français.
// ============================================================================
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCategory, deleteCategory } from '@/app/admin/actions';
import ImageUpload from '@/components/admin/ImageUpload';
import { Icon } from '@/components/primitives';

const slugify = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const ICONS = ['camera', 'shield', 'fingerprint', 'door', 'monitor', 'flame', 'wifi', 'drive', 'box', 'layers', 'bolt', 'grid', 'truck', 'headset', 'badge'];

const EMPTY = { id: '', icon: 'box', image_url: '', name_fr: '', name_en: '', name_ar: '',
  blurb_fr: '', blurb_en: '', blurb_ar: '', sort: 999 };

function CatForm({ cat, isNew, count = 0 }) {
  const router = useRouter();
  const [f, setF] = useState(cat ? {
    id: cat.id || '', icon: cat.icon || 'box', image_url: cat.image_url || '',
    name_fr: cat.name?.fr || '', name_en: cat.name?.en || '', name_ar: cat.name?.ar || '',
    blurb_fr: cat.blurb?.fr || '', blurb_en: cat.blurb?.en || '', blurb_ar: cat.blurb?.ar || '',
    sort: cat.sort ?? 999,
  } : { ...EMPTY });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [idTouched, setIdTouched] = useState(!isNew);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setF((p) => {
      const next = { ...p, [k]: v };
      if (k === 'name_fr' && isNew && !idTouched) next.id = slugify(v);
      return next;
    });
  };

  const save = async (e) => {
    e?.preventDefault?.();
    setMsg(null); setBusy(true);
    try {
      const res = await updateCategory({ ...f, id: f.id || slugify(f.name_fr) });
      if (res?.ok) {
        setMsg({ kind: res.warn ? 'warn' : 'ok', text: res.warn || (isNew ? 'Catégorie ajoutée ✓' : 'Enregistré ✓') });
        router.refresh();
        if (isNew) { setF({ ...EMPTY }); setIdTouched(false); }
      } else setMsg({ kind: 'err', text: res?.error || 'Erreur inconnue.' });
    } catch (err) {
      setMsg({ kind: 'err', text: err?.message || 'Erreur réseau.' });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg((m) => (m?.kind === 'err' ? m : null)), 4000);
    }
  };

  const remove = async () => {
    if (!confirm(`Supprimer la catégorie « ${f.name_fr || f.id} » ?`)) return;
    setBusy(true); setMsg(null);
    const res = await deleteCategory(f.id);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setMsg({ kind: 'err', text: res?.error || 'Suppression impossible.' });
  };

  return (
    <form className={`adm-panel adm-editcard ${isNew ? 'is-new' : ''}`} onSubmit={save}>
      <div className="adm-editcard-hd">
        <span className="adm-swatch cat" aria-hidden="true">
          {f.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.image_url} alt="" /> : <Icon name={f.icon} size={20} />}
        </span>
        <div className="adm-editcard-t">
          <b>{isNew ? 'Nouvelle catégorie' : (f.name_fr || f.id)}</b>
          <small>{isNew ? 'Le nom FR suffit pour commencer.' : `${count} produit(s) · identifiant ${f.id}`}</small>
        </div>
        {!isNew && <button type="button" className="adm-btn danger sm" onClick={remove} disabled={busy}>Supprimer</button>}
      </div>

      <div className="adm-editcard-bd">
        <div className="adm-split">
          <div className="adm-split-main">
            <div className="adm-grid2">
              <label>Nom FR *<input value={f.name_fr} onChange={set('name_fr')} placeholder="Vidéosurveillance" required autoComplete="off" /></label>
              <label>Identifiant (généré automatiquement)
                <input value={f.id} disabled={!isNew}
                  onChange={(e) => { setIdTouched(true); setF((p) => ({ ...p, id: slugify(e.target.value) })); }}
                  placeholder="videosurveillance" autoComplete="off" />
              </label>
            </div>
            <div className="adm-grid2">
              <label>Nom EN<input value={f.name_en} onChange={set('name_en')} placeholder="Video Surveillance" /></label>
              <label>Nom AR<input value={f.name_ar} onChange={set('name_ar')} dir="rtl" /></label>
            </div>

            <div className="adm-grid2">
              <label>Icône
                <div className="adm-iconpick">
                  {ICONS.map((i) => (
                    <button key={i} type="button" title={i} className={`adm-iconbtn ${f.icon === i ? 'on' : ''}`}
                      onClick={() => setF((p) => ({ ...p, icon: i }))}>
                      <Icon name={i} size={17} />
                    </button>
                  ))}
                </div>
              </label>
              <label>Ordre d’affichage<input type="number" value={f.sort} onChange={set('sort')} /></label>
            </div>

            <label>Sous-titre FR<input value={f.blurb_fr} onChange={set('blurb_fr')} placeholder="Caméras IP, NVR, XVR et accessoires" /></label>
            <div className="adm-grid2">
              <label>Sous-titre EN<input value={f.blurb_en} onChange={set('blurb_en')} /></label>
              <label>Sous-titre AR<input value={f.blurb_ar} onChange={set('blurb_ar')} dir="rtl" /></label>
            </div>
          </div>

          <div className="adm-split-side">
            <ImageUpload value={f.image_url} onChange={(url) => setF((p) => ({ ...p, image_url: url }))}
              folder="categories" name={f.name_fr || f.id} label="Image de la catégorie"
              hint="Affichée sur la carte d’accueil (sinon l’icône est utilisée)" aspect="4 / 3" />
          </div>
        </div>

        <div className="adm-editcard-ft">
          <button className="adm-btn primary" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : (isNew ? '+ Ajouter la catégorie' : 'Enregistrer')}
          </button>
          {msg && <span className={`adm-flash ${msg.kind}`}>{msg.text}</span>}
        </div>
      </div>
    </form>
  );
}

export default function CategoriesManager({ categories = [], counts = {} }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? categories.filter((c) => `${c.name?.fr} ${c.name?.en} ${c.id}`.toLowerCase().includes(s)) : categories;
  }, [categories, q]);

  return (
    <>
      <CatForm isNew />
      <div className="adm-listhead">
        <h2>Catégories existantes <span className="adm-count">{categories.length}</span></h2>
        <input className="adm-searchmini" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les catégories…" />
      </div>
      {list.length === 0 ? (
        <div className="adm-panel"><div className="adm-empty">Aucune catégorie ne correspond.</div></div>
      ) : (
        list.map((c) => <CatForm key={c.id} cat={c} count={counts[c.id] || 0} />)
      )}
    </>
  );
}
