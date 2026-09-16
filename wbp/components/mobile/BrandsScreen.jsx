'use client';
import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBrand, deleteBrand } from '@/app/admin/actions';
import { uploadImage } from '@/app/admin/upload-actions';
import { Icon } from '@/components/mobile/ui';
import {
  Banner, Btn, Confirm, Empty, NumberInput, SearchBar, Sheet, SubTop, TextInput, useToast,
} from '@/components/mobile/form';
import '@/styles/mobile-reglages.css';

// ============================================================================
// Marques, version téléphone.
// ----------------------------------------------------------------------------
// Mêmes champs et MÊMES server actions que /admin/brands (`updateBrand`,
// `deleteBrand`) : le nettoyage des données, l'abrégé rempli automatiquement et
// le journal d'activité sont déjà faits côté serveur, une seule fois pour les
// deux interfaces.
//
// Deux écarts assumés avec l'écran d'ordinateur, tous les deux dictés par la
// taille de l'écran :
//
//  1. L'ordinateur affiche TOUS les formulaires dépliés les uns sous les autres.
//     Ici la page est une liste, et la fiche s'ouvre dans une feuille du bas :
//     vingt formulaires dépliés feraient une page de six écrans de défilement.
//  2. Les descriptions EN/AR sont derrière « Détails avancés » : on les remplit
//     une fois, à la création, et jamais depuis un téléphone dans un dépôt.
//
// L'identifiant n'est modifiable qu'à la création : le changer ensuite créerait
// une deuxième marque (`upsert` sur l'id) et laisserait les produits accrochés à
// l'ancienne.
// ============================================================================

const slugify = (v) => String(v || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Même palette que le back-office web, pour que les deux interfaces proposent
// les mêmes couleurs de marque.
const PALETTE = ['#FF5A1F', '#E3000F', '#0559C9', '#0E9488', '#7C3AED', '#F59E0B', '#1F9D55', '#1B1B1B'];

// ----------------------------------------------------------------------------
// Image unique (logo de marque, image de catégorie, visuel du pop-up).
// ----------------------------------------------------------------------------
// Volontairement plus petit que <PhotoPicker /> : il n'y a qu'un fichier, donc
// ni grille, ni réordonnancement, ni photo principale. Même server action que
// le back-office web (`uploadImage`), qui convertit en WebP et revérifie la
// session. « Retirer » ne touche pas au stockage : le fichier peut être partagé
// avec une autre fiche, et un fichier orphelin ne se voit pas.
//
// Exporté ici parce que les écrans Catégories et Réglages s'en servent aussi —
// quarante lignes ne justifiaient pas un fichier de composant de plus.
// ----------------------------------------------------------------------------
export function LogoPicker({ value, onChange, folder, name, label, hint }) {
  const [busy, setBusy] = useState(false);
  const camera = useRef(null);
  const gallery = useRef(null);
  const toast = useToast();

  const send = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      fd.append('name', name || folder);
      const res = await uploadImage(fd);
      if (res?.ok) { onChange(res.url); toast('Image envoyée'); }
      else toast(res?.error || 'Envoi impossible.', 'bad');
    } catch (e) {
      // Sur un téléphone, c'est presque toujours le réseau : on le dit.
      toast(e?.message || 'Envoi impossible — vérifiez le réseau.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const pick = (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';                  // permet de reprendre le même fichier
    send(file);
  };

  return (
    <div className="mbr-img">
      <span className="mbr-lbl">{label}{hint && <small>{hint}</small>}</span>

      <div className="mbr-img-box">
        {value
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={value} alt="" loading="lazy" />
          : <Icon name="image" size={34} />}
      </div>

      <div className="mbr-img-acts">
        <Btn icon="camera" disabled={busy} onClick={() => camera.current?.click()}>
          {busy ? 'Envoi…' : 'Photo'}
        </Btn>
        <Btn icon="grid" disabled={busy} onClick={() => gallery.current?.click()}>Galerie</Btn>
      </div>
      {value && (
        <Btn variant="danger sm" icon="close" disabled={busy} onClick={() => onChange('')}>
          Retirer l’image
        </Btn>
      )}

      {/* capture="environment" : caméra arrière, directement. Sur un ordinateur
          l'attribut est ignoré et c'est un sélecteur de fichiers normal. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}

/* -------------------------------------------------------- fiche d'une marque -- */

function BrandEditor({ brand, isNew, count, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    id: brand?.id || '',
    name: brand?.name || '',
    short: brand?.short || '',
    color: brand?.color || '#FF5A1F',
    logo_url: brand?.logo_url || '',
    desc_fr: brand?.description?.fr || '',
    desc_en: brand?.description?.en || '',
    desc_ar: brand?.description?.ar || '',
    sort: brand?.sort ?? 999,
  });
  const [dirty, setDirty] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [idTouched, setIdTouched] = useState(!isNew);

  const set = (k) => (v) => {
    setDirty(true);
    setF((p) => {
      const next = { ...p, [k]: v };
      // À la création, l'identifiant suit le nom tant qu'on ne l'a pas touché.
      if (k === 'name' && isNew && !idTouched) next.id = slugify(v);
      return next;
    });
  };

  const save = async () => {
    setErr('');
    if (!f.name.trim()) { setErr('Le nom de la marque est obligatoire.'); return; }
    setBusy(true);
    try {
      const res = await updateBrand({ ...f, id: f.id || slugify(f.name) });
      if (!res?.ok) {
        setErr(res?.error || 'Enregistrement impossible.');
        toast('Enregistrement impossible', 'bad');
        return;
      }
      // `warn` = enregistré, mais le logo demande une migration de la base. Ce
      // n'est pas un échec : la feuille reste ouverte pour que le message soit
      // lu, sans laisser croire qu'il faut recommencer.
      toast(isNew ? 'Marque ajoutée' : 'Marque enregistrée');
      if (res.warn) { setErr(res.warn); setDirty(false); onSaved(); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau — la marque n’a pas été enregistrée.');
      toast('Pas de réseau', 'bad');
    } finally {
      setBusy(false);
    }
  };

  // Même garde-fou que le serveur (`deleteBrand` refuse dès qu'un produit
  // utilise la marque), appliqué AVANT la demande de confirmation : sur un
  // téléphone, faire confirmer une suppression définitive pour la refuser
  // ensuite est une manœuvre inutile et inquiétante. Le serveur refuse quand
  // même — ce contrôle-ci n'est qu'une politesse, pas la sécurité.
  const askDelete = () => {
    if (count > 0) {
      setErr(`Impossible de supprimer « ${f.name} » : ${count} produit${count > 1 ? 's' : ''} `
        + `utilise${count > 1 ? 'nt' : ''} encore cette marque. Changez leur marque depuis l’onglet Produits, puis revenez ici.`);
      toast('Suppression refusée', 'bad');
      return;
    }
    setConfirmDel(true);
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteBrand(f.id);
      if (!res?.ok) {
        // Le serveur refait le comptage : il refuse même si l'écran affichait
        // « 0 produit » à partir de données devenues obsolètes.
        setErr(res?.error || 'Suppression impossible.');
        toast('Suppression impossible', 'bad');
        setConfirmDel(false);
        return;
      }
      toast('Marque supprimée');
      onSaved();
      onClose();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau.');
      toast('Pas de réseau', 'bad');
      setConfirmDel(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={busy ? () => {} : onClose}
        title={isNew ? 'Nouvelle marque' : f.name || f.id}
        footer={(
          <>
            <Btn variant="primary" disabled={busy || !dirty} onClick={save}>
              {busy ? 'Enregistrement…' : isNew ? 'Ajouter la marque' : 'Enregistrer'}
            </Btn>
            {!isNew && (
              <Btn variant="danger" icon="trash" disabled={busy} onClick={askDelete}>
                Supprimer cette marque
              </Btn>
            )}
            <Btn variant="ghost" disabled={busy} onClick={onClose}>Fermer</Btn>
          </>
        )}
      >
        {err && <Banner kind="bad" onClose={() => setErr('')}>{err}</Banner>}
        {!isNew && (
          <p className="mbf-hint">
            {count} produit{count > 1 ? 's' : ''} · identifiant <b>{f.id}</b>
          </p>
        )}

        <TextInput
          label="Nom de la marque *"
          value={f.name}
          onChange={set('name')}
          placeholder="Hikvision"
          autoComplete="off"
        />
        {isNew && (
          <TextInput
            label="Identifiant (adresse de la page)"
            hint="Rempli d’après le nom. Il ne pourra plus changer ensuite."
            value={f.id}
            onChange={(v) => { setIdTouched(true); setDirty(true); setF((p) => ({ ...p, id: slugify(v) })); }}
            placeholder="hikvision"
            autoComplete="off"
          />
        )}

        <LogoPicker
          value={f.logo_url}
          onChange={(url) => { setDirty(true); setF((p) => ({ ...p, logo_url: url })); }}
          folder="brands"
          name={f.name || f.id}
          label="Logo de la marque"
          hint="Fond transparent (PNG ou SVG) conseillé — il s’affiche sur la page Marques et les filtres du catalogue."
        />

        <div>
          <span className="mbr-lbl">
            Couleur
            <small>Utilisée pour la pastille de la marque quand elle n’a pas de logo.</small>
          </span>
          <div className="mbr-pal">
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                className={f.color?.toLowerCase() === c.toLowerCase() ? 'on' : ''}
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
                onClick={() => { setDirty(true); setF((p) => ({ ...p, color: c })); }}
              >
                {f.color?.toLowerCase() === c.toLowerCase() && <Icon name="check" size={19} />}
              </button>
            ))}
          </div>
        </div>

        <TextInput
          label="Abrégé (optionnel)"
          hint="Deux ou trois lettres affichées à la place du logo. Vide = déduit du nom."
          value={f.short}
          onChange={set('short')}
          placeholder={f.name.slice(0, 14) || 'HIK'}
          autoComplete="off"
        />

        <TextInput
          label="Description (français)"
          hint="Une phrase de présentation sur la page Marques."
          value={f.desc_fr}
          onChange={set('desc_fr')}
          multiline
          rows={3}
        />

        <Btn icon={more ? 'chevdown' : 'chevright'} onClick={() => setMore((v) => !v)}>
          {more ? 'Masquer les détails avancés' : 'Détails avancés'}
        </Btn>
        {more && (
          <>
            <TextInput label="Description (anglais)" value={f.desc_en} onChange={set('desc_en')} multiline rows={3} />
            <TextInput label="Description (arabe)" value={f.desc_ar} onChange={set('desc_ar')} multiline rows={3} dir="rtl" />
            <NumberInput
              label="Ordre d’affichage"
              hint="Plus le nombre est petit, plus la marque remonte dans les listes."
              value={f.sort}
              onChange={set('sort')}
            />
            <TextInput
              label="Code couleur"
              hint="Pour une couleur exacte hors palette (#RRGGBB)."
              value={f.color}
              onChange={set('color')}
              placeholder="#FF5A1F"
              autoComplete="off"
              autoCapitalize="none"
            />
          </>
        )}
      </Sheet>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={remove}
        busy={busy}
        title="Supprimer cette marque ?"
        body={`« ${f.name || f.id} » disparaîtra de la page Marques et des filtres du catalogue. C’est définitif.`}
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}

/* ------------------------------------------------------------------- écran -- */

export default function BrandsScreen({ brands = [], counts = {}, error = '' }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(null);      // marque ouverte, ou 'new'

  // Le filtre reste ici, sans passer par l'URL : la liste des marques tient en
  // une trentaine de lignes, déjà entièrement chargée. Un aller-retour serveur
  // à chaque frappe serait plus lent que le filtrage local, et inutile.
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? brands.filter((b) => `${b.name} ${b.id} ${b.short}`.toLowerCase().includes(s))
      : brands;
  }, [brands, q]);

  return (
    <>
      {/* Pas de « + » dans l'en-tête : le bouton flottant de 56 px fait déjà ce
          travail, et il est à portée de pouce. Un second bouton de 38 px en haut
          à droite serait la plus petite cible de l'écran, et la plus loin. */}
      <SubTop
        title="Marques"
        subtitle={`${brands.length} marque${brands.length > 1 ? 's' : ''}`}
        back="/mobile/plus"
      />

      <div className="mb-wrap">
        {error && <Banner kind="bad">La liste n’a pas pu être chargée : {error}</Banner>}

        {brands.length > 6 && <SearchBar value={q} onChange={setQ} placeholder="Nom de la marque…" />}

        {list.length === 0 ? (
          <Empty icon="layers" action={<Btn icon="plus" onClick={() => setActive('new')}>Ajouter une marque</Btn>}>
            {q ? `Aucune marque pour « ${q} ».` : 'Aucune marque pour l’instant.'}
          </Empty>
        ) : (
          <div className="mbl">
            {list.map((b) => {
              const n = counts[b.id] || 0;
              return (
                <button type="button" className="mbl-row" key={b.id} onClick={() => setActive(b)}>
                  <span className="mbl-thumb" style={b.logo_url ? undefined : { background: b.color || '#15182B', color: '#fff' }}>
                    {b.logo_url
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={b.logo_url} alt="" loading="lazy" />
                      : <b style={{ fontSize: 15, fontWeight: 800 }}>{(b.short || b.name || '?').slice(0, 2).toUpperCase()}</b>}
                  </span>
                  <span className="mbl-bd">
                    <span className="t">{b.name || b.id}</span>
                    <span className="s">{n} produit{n > 1 ? 's' : ''} · {b.id}</span>
                  </span>
                  <Icon name="chevright" size={19} />
                </button>
              );
            })}
          </div>
        )}

        <div className="mbf-pad" />
      </div>

      <button type="button" className="mbl-fab" onClick={() => setActive('new')} aria-label="Nouvelle marque">
        <Icon name="plus" size={26} />
      </button>

      {/* La feuille est démontée à la fermeture (`active` repasse à null) : la
          fiche repart donc toujours des données du serveur, jamais d'un état
          laissé par la marque précédente. */}
      {active && (
        <BrandEditor
          key={active === 'new' ? 'new' : active.id}
          brand={active === 'new' ? null : active}
          isNew={active === 'new'}
          count={active === 'new' ? 0 : counts[active.id] || 0}
          onClose={() => setActive(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
