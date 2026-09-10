'use client';
// ============================================================================
// Fiche produit (admin) — avec upload de la photo principale et de la galerie.
// Organisé en blocs : Identité · Photos · Documents · Détails, au lieu d'une longue
// liste de champs. L'ancien champ « URL image » reste accessible via l'onglet
// URL du sélecteur d'image.
// ============================================================================
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upsertProduct } from '@/app/admin/actions';
import ImageUpload, { ImageGallery } from '@/components/admin/ImageUpload';
import DocsUpload from '@/components/admin/DocsUpload';

const slugify = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export default function ProductEditor({ product, brands, categories, isNew, localImages = [] }) {
  const router = useRouter();
  const [f, setF] = useState({
    id: product?.id || '', name: product?.name || '', code: product?.code || '',
    cat: product?.cat || (categories[0]?.id || ''), brand: product?.brand || (brands[0]?.id || ''),
    badge: product?.badge || '', rating: product?.rating ?? 4.5, reviews_count: product?.reviews_count ?? product?.reviews ?? 0,
    tag_fr: product?.tag?.fr || '', tag_en: product?.tag?.en || '', tag_ar: product?.tag?.ar || '',
    image_url: product?.image_url || '', price: product?.price ?? '',
    active: product?.active ?? true, featured: product?.featured ?? false, sort: product?.sort ?? 0,
  });
  const [images, setImages] = useState(Array.isArray(product?.images) ? product.images : []);
  const [docs, setDocs] = useState(Array.isArray(product?.docs) ? product.docs : []);
  const [specs, setSpecs] = useState(product?.specs?.length ? product.specs : [['', '']]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [idTouched, setIdTouched] = useState(!isNew);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((p) => {
      const next = { ...p, [k]: v };
      if (k === 'name' && isNew && !idTouched) next.id = slugify(v);
      return next;
    });
  };
  const setSpec = (i, j) => (e) => setSpecs((s) => s.map((r, ri) => ri === i ? (j === 0 ? [e.target.value, r[1]] : [r[0], e.target.value]) : r));

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await upsertProduct({ ...f, id: f.id || slugify(f.name), specs, images, docs });
      if (!res?.ok) { setErr(res?.error || 'Erreur'); return; }
      // Enregistré, mais une colonne manquait en base : on reste sur la fiche
      // pour que l'avertissement soit lu plutôt que balayé par la redirection.
      if (res.warn) { setErr(res.warn); return; }
      router.push('/admin/products'); router.refresh();
    } catch (e2) {
      setErr(e2?.message || 'Erreur réseau.');
    } finally { setBusy(false); }
  };

  return (
    <form className="adm-form adm-prodform" onSubmit={save}>
      {err && <div className="adm-err">{err}</div>}

      {/* ---------------- Identité ---------------- */}
      <section className="adm-fieldset">
        <h3 className="adm-legend">Identité</h3>
        <label>Nom du produit *
          <input value={f.name} onChange={set('name')} required placeholder="Caméra Dahua Dome IP 5MP" autoComplete="off" />
        </label>
        <div className="adm-grid3">
          <label>Référence / code *
            <input value={f.code} onChange={set('code')} required placeholder="DH-IPC-HDBW5541R" autoComplete="off" />
          </label>
          <label>Identifiant (auto)
            <input value={f.id} disabled={!isNew}
              onChange={(e) => { setIdTouched(true); setF((p) => ({ ...p, id: slugify(e.target.value) })); }}
              placeholder="camera-dahua-dome-5mp" />
          </label>
          <label>Prix de vente (DA, optionnel)
            <input type="number" step="0.01" value={f.price} onChange={set('price')} placeholder="—" />
          </label>
        </div>
        <div className="adm-grid3">
          <label>Catégorie
            <select value={f.cat} onChange={set('cat')}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name?.fr || c.fr || c.id}</option>)}
            </select>
          </label>
          <label>Marque
            <select value={f.brand} onChange={set('brand')}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>Badge
            <select value={f.badge} onChange={set('badge')}>
              <option value="">— aucun —</option>
              <option value="bestseller">Best-seller</option>
              <option value="new">Nouveau</option>
            </select>
          </label>
        </div>
      </section>

      {/* ---------------- Photos ---------------- */}
      <section className="adm-fieldset">
        <h3 className="adm-legend">Photos</h3>
        <div className="adm-split">
          <div className="adm-split-side wide">
            <ImageUpload value={f.image_url} onChange={(url) => setF((p) => ({ ...p, image_url: url }))}
              folder="products" name={f.name || f.code} label="Photo principale"
              hint="Celle qui s’affiche sur les cartes et dans la recherche" aspect="4 / 3" />
          </div>
          <div className="adm-split-main">
            <ImageGallery value={images} onChange={setImages} folder="products" name={f.name || f.code} max={10} />
          </div>
        </div>

        {/* --------------------------------------------------------------
            Photos déjà présentes dans le dépôt (public/products/).
            ----------------------------------------------------------------
            Elles ne sont PAS dans la base : lib/queries.js s’en sert comme
            repli quand products.image_url est vide. L'éditeur, lui, lit la
            base brute — sans ce bloc la galerie paraît vide alors que le
            produit a déjà des photos, et l’on téléverse un doublon qui prend
            alors le dessus (la base gagne toujours sur le fichier local).
            Bloc informatif : rien à enregistrer, rien à supprimer d’ici.
        -------------------------------------------------------------- */}
        {localImages.length > 0 && (
          <div className={`adm-localimg ${f.image_url ? 'shadowed' : ''}`}>
            <div className="adm-localimg-head">
              <b>{localImages.length} photo{localImages.length > 1 ? 's' : ''} déjà dans le dépôt</b>
              <span>public/products/ — livrée{localImages.length > 1 ? 's' : ''} avec le site, pas dans la base</span>
            </div>
            <div className="adm-localimg-strip">
              {localImages.map((url) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={url} src={url} alt="" title={decodeURIComponent(url)} loading="lazy" />
              ))}
            </div>
            {f.image_url ? (
              <p className="adm-localimg-warn">
                La photo principale ci-dessus vient de la base : c’est elle qui s’affiche,
                ces fichiers restent masqués. Cliquez « Retirer » sur la photo principale
                pour laisser le site réafficher la 1ʳᵉ photo du dépôt.
              </p>
            ) : (
              <p className="adm-localimg-ok">
                Aucune photo en base : le site affiche déjà la 1ʳᵉ de ces images.
                Inutile d’en téléverser une, sauf pour la remplacer volontairement.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Documents ---------------- */}
      <section className="adm-fieldset">
        <h3 className="adm-legend">Fiches techniques &amp; documents</h3>
        <DocsUpload value={docs} onChange={setDocs} productName={f.name || f.code} />
      </section>

      {/* ---------------- Détails ---------------- */}
      <section className="adm-fieldset">
        <h3 className="adm-legend">Détails & accroches</h3>
        <div className="adm-grid3">
          <label>Accroche FR<input value={f.tag_fr} onChange={set('tag_fr')} placeholder="Dôme IP anti-vandale" /></label>
          <label>Accroche EN<input value={f.tag_en} onChange={set('tag_en')} /></label>
          <label>Accroche AR<input value={f.tag_ar} onChange={set('tag_ar')} dir="rtl" /></label>
        </div>
        <div className="adm-grid3">
          <label>Note (0–5)<input type="number" step="0.1" min="0" max="5" value={f.rating} onChange={set('rating')} /></label>
          <label>Nb d’avis (affiché)<input type="number" min="0" value={f.reviews_count} onChange={set('reviews_count')} /></label>
          <label>Ordre<input type="number" value={f.sort} onChange={set('sort')} /></label>
        </div>

        <div className="adm-specs">
          <div className="adm-legend-sm">Spécifications techniques</div>
          {specs.map((r, i) => (
            <div className="adm-spec-row" key={i}>
              <input placeholder="Caractéristique (ex. Résolution)" value={r[0]} onChange={setSpec(i, 0)} />
              <input placeholder="Valeur (ex. 5 MP)" value={r[1]} onChange={setSpec(i, 1)} />
              <button type="button" className="adm-btn danger sm" onClick={() => setSpecs((s) => s.filter((_, ri) => ri !== i))} title="Retirer la ligne">×</button>
            </div>
          ))}
          <button type="button" className="adm-btn sm" onClick={() => setSpecs((s) => [...s, ['', '']])}>+ Ajouter une ligne</button>
        </div>
      </section>

      {/* ---------------- Visibilité ---------------- */}
      <section className="adm-fieldset">
        <h3 className="adm-legend">Visibilité</h3>
        <label className="adm-switch">
          <input type="checkbox" checked={f.active} onChange={set('active')} />
          <span className="adm-switch-track" aria-hidden="true"><span className="adm-switch-knob" /></span>
          <span className="adm-switch-txt"><b>Visible sur le site</b><small>Décochez pour retirer le produit du catalogue public sans le supprimer.</small></span>
        </label>
        <label className="adm-switch">
          <input type="checkbox" checked={f.featured} onChange={set('featured')} />
          <span className="adm-switch-track" aria-hidden="true"><span className="adm-switch-knob" /></span>
          <span className="adm-switch-txt"><b>★ Mis en avant</b><small>Apparaît en premier dans le catalogue. Pour choisir l’ordre exact, utilisez la page Vitrine.</small></span>
        </label>
      </section>

      <div className="adm-actions adm-sticky-actions">
        <button className="adm-btn primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le produit'}</button>
        <button className="adm-btn" type="button" onClick={() => router.push('/admin/products')}>Annuler</button>
      </div>
    </form>
  );
}
