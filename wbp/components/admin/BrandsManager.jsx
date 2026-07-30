'use client';
// ============================================================================
// Marques — création, édition, logo et suppression.
// ----------------------------------------------------------------------------
// Ce qui bloquait avant : le formulaire « Ajouter une marque » était en bas
// d'une longue liste, l'identifiant devait être inventé à la main, et laisser
// « Abrégé » vide faisait échouer l'enregistrement avec une erreur Postgres
// brute. Ici : formulaire d'ajout en haut, ID proposé automatiquement à partir
// du nom, logo en glisser-déposer, suppression protégée, erreurs en clair.
// ============================================================================
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateBrand, deleteBrand } from '@/app/admin/actions';
import ImageUpload from '@/components/admin/ImageUpload';

const slugify = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const EMPTY = { id: '', name: '', short: '', color: '#FF5A1F', logo_url: '',
  desc_fr: '', desc_en: '', desc_ar: '', sort: 999 };

const PALETTE = ['#FF5A1F', '#E3000F', '#0559C9', '#0E9488', '#7C3AED', '#F59E0B', '#1F9D55', '#1B1B1B'];

function BrandForm({ brand, isNew, onDone, count = 0 }) {
  const router = useRouter();
  const [f, setF] = useState(brand ? {
    id: brand.id || '', name: brand.name || '', short: brand.short || '',
    color: brand.color || '#FF5A1F', logo_url: brand.logo_url || '',
    desc_fr: brand.description?.fr || '', desc_en: brand.description?.en || '', desc_ar: brand.description?.ar || '',
    sort: brand.sort ?? 999,
  } : { ...EMPTY });
  const [msg, setMsg] = useState(null);       // { kind:'ok'|'err'|'warn', text }
  const [busy, setBusy] = useState(false);
  const [idTouched, setIdTouched] = useState(!isNew);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setF((p) => {
      const next = { ...p, [k]: v };
      // Tant que l'admin n'a pas touché l'ID, on le déduit du nom.
      if (k === 'name' && isNew && !idTouched) next.id = slugify(v);
      return next;
    });
  };

  const save = async (e) => {
    e?.preventDefault?.();
    setMsg(null); setBusy(true);
    try {
      const res = await updateBrand({ ...f, id: f.id || slugify(f.name) });
      if (res?.ok) {
        setMsg({ kind: res.warn ? 'warn' : 'ok', text: res.warn || (isNew ? 'Marque ajoutée ✓' : 'Enregistré ✓') });
        router.refresh();
        if (isNew) { setF({ ...EMPTY }); setIdTouched(false); onDone?.(); }
      } else {
        setMsg({ kind: 'err', text: res?.error || 'Erreur inconnue.' });
      }
    } catch (err) {
      setMsg({ kind: 'err', text: err?.message || 'Erreur réseau.' });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg((m) => (m?.kind === 'err' ? m : null)), 4000);
    }
  };

  const remove = async () => {
    if (!confirm(`Supprimer la marque « ${f.name} » ?`)) return;
    setBusy(true); setMsg(null);
    const res = await deleteBrand(f.id);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setMsg({ kind: 'err', text: res?.error || 'Suppression impossible.' });
  };

  return (
    <form className={`adm-panel adm-editcard ${isNew ? 'is-new' : ''}`} onSubmit={save}>
      <div className="adm-editcard-hd">
        <span className="adm-swatch" style={{ background: f.color }} aria-hidden="true">
          {f.logo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.logo_url} alt="" /> : (f.short || f.name || '?').slice(0, 2).toUpperCase()}
        </span>
        <div className="adm-editcard-t">
          <b>{isNew ? 'Nouvelle marque' : (f.name || f.id)}</b>
          <small>{isNew ? 'Le nom suffit — le reste est optionnel.' : `${count} produit(s) · identifiant ${f.id}`}</small>
        </div>
        {!isNew && (
          <button type="button" className="adm-btn danger sm" onClick={remove} disabled={busy}>Supprimer</button>
        )}
      </div>

      <div className="adm-editcard-bd">
        <div className="adm-split">
          <div className="adm-split-main">
            <div className="adm-grid2">
              <label>Nom de la marque *
                <input value={f.name} onChange={set('name')} placeholder="Hikvision" required autoComplete="off" />
              </label>
              <label>Identifiant (généré automatiquement)
                <input value={f.id} disabled={!isNew}
                  onChange={(e) => { setIdTouched(true); setF((p) => ({ ...p, id: slugify(e.target.value) })); }}
                  placeholder="hikvision" autoComplete="off" />
              </label>
            </div>

            <div className="adm-grid3">
              <label>Abrégé (optionnel)
                <input value={f.short} onChange={set('short')} placeholder={f.name.slice(0, 14) || 'HIK'} />
              </label>
              <label>Couleur
                <div className="adm-colorrow">
                  <input type="color" value={f.color} onChange={set('color')} />
                  <div className="adm-dots">
                    {PALETTE.map((c) => (
                      <button key={c} type="button" className={`adm-dot ${f.color?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                        style={{ background: c }} title={c} onClick={() => setF((p) => ({ ...p, color: c }))} />
                    ))}
                  </div>
                </div>
              </label>
              <label>Ordre d’affichage
                <input type="number" value={f.sort} onChange={set('sort')} />
              </label>
            </div>

            <label>Description FR
              <textarea value={f.desc_fr} onChange={set('desc_fr')} rows={2}
                placeholder="Une phrase qui présente la marque sur la page Marques." />
            </label>
            <div className="adm-grid2">
              <label>Description EN<textarea value={f.desc_en} onChange={set('desc_en')} rows={2} /></label>
              <label>Description AR<textarea value={f.desc_ar} onChange={set('desc_ar')} rows={2} dir="rtl" /></label>
            </div>
          </div>

          <div className="adm-split-side">
            <ImageUpload value={f.logo_url} onChange={(url) => setF((p) => ({ ...p, logo_url: url }))}
              folder="brands" name={f.name || f.id} label="Logo de la marque"
              hint="Fond transparent (PNG/SVG) conseillé" aspect="16 / 10" />
          </div>
        </div>

        <div className="adm-editcard-ft">
          <button className="adm-btn primary" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : (isNew ? '+ Ajouter la marque' : 'Enregistrer')}
          </button>
          {msg && <span className={`adm-flash ${msg.kind}`}>{msg.text}</span>}
        </div>
      </div>
    </form>
  );
}

export default function BrandsManager({ brands = [], counts = {} }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? brands.filter((b) => `${b.name} ${b.id} ${b.short}`.toLowerCase().includes(s)) : brands;
  }, [brands, q]);

  return (
    <>
      <BrandForm isNew />

      <div className="adm-listhead">
        <h2>Marques existantes <span className="adm-count">{brands.length}</span></h2>
        <input className="adm-searchmini" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer les marques…" />
      </div>

      {list.length === 0 ? (
        <div className="adm-panel"><div className="adm-empty">Aucune marque ne correspond.</div></div>
      ) : (
        list.map((b) => <BrandForm key={b.id} brand={b} count={counts[b.id] || 0} />)
      )}
    </>
  );
}
