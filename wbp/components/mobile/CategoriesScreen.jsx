'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCategory, deleteCategory } from '@/app/admin/actions';
import { Icon } from '@/components/mobile/ui';
import {
  Banner, Btn, Confirm, Empty, NumberInput, SearchBar, Sheet, SubTop, TextInput, useToast,
} from '@/components/mobile/form';
import { LogoPicker } from '@/components/mobile/BrandsScreen';
import '@/styles/mobile-reglages.css';

// ============================================================================
// Catégories, version téléphone. Même construction que l'écran Marques : une
// liste, une feuille du bas pour la fiche, mêmes server actions que /admin
// (`updateCategory`, `deleteCategory`).
//
// LE POINT À NE PAS RATER — le nom d'une catégorie est multilingue en base
// (colonne `name` = { fr, en, ar }), mais `updateCategory` attend des champs
// PLATS : name_fr / name_en / name_ar, et c'est LUI qui reconstruit l'objet
// (avec en = fr quand l'anglais est vide). Envoyer une chaîne dans `name`
// écraserait l'objet de la ligne et casserait l'affichage du site dans les
// trois langues. Idem pour `blurb` (le sous-titre) : blurb_fr / _en / _ar.
// ============================================================================

const slugify = (v) => String(v || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Même jeu d'icônes que le back-office web : ce sont les seuls pictogrammes
// dessinés dans lib/icons.js, et le site public n'en affiche pas d'autres.
const ICONS = ['camera', 'shield', 'fingerprint', 'door', 'monitor', 'flame', 'wifi', 'drive', 'box', 'layers', 'bolt', 'grid', 'truck', 'headset', 'badge'];

function CatEditor({ cat, isNew, count, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    id: cat?.id || '',
    icon: cat?.icon || 'box',
    image_url: cat?.image_url || '',
    name_fr: cat?.name?.fr || '',
    name_en: cat?.name?.en || '',
    name_ar: cat?.name?.ar || '',
    blurb_fr: cat?.blurb?.fr || '',
    blurb_en: cat?.blurb?.en || '',
    blurb_ar: cat?.blurb?.ar || '',
    sort: cat?.sort ?? 999,
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
      // À la création, l'identifiant suit le nom FR tant qu'on ne l'a pas touché.
      if (k === 'name_fr' && isNew && !idTouched) next.id = slugify(v);
      return next;
    });
  };

  const save = async () => {
    setErr('');
    if (!f.name_fr.trim()) { setErr('Le nom en français est obligatoire.'); return; }
    setBusy(true);
    try {
      // Champs plats : c'est `updateCategory` qui assemble name et blurb.
      const res = await updateCategory({ ...f, id: f.id || slugify(f.name_fr) });
      if (!res?.ok) {
        setErr(res?.error || 'Enregistrement impossible.');
        toast('Enregistrement impossible', 'bad');
        return;
      }
      toast(isNew ? 'Catégorie ajoutée' : 'Catégorie enregistrée');
      // `warn` : enregistré, mais l'image demande une migration de la base. La
      // feuille reste ouverte pour que le message soit lu.
      if (res.warn) { setErr(res.warn); setDirty(false); onSaved(); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau — la catégorie n’a pas été enregistrée.');
      toast('Pas de réseau', 'bad');
    } finally {
      setBusy(false);
    }
  };

  // `deleteCategory` refuse tant qu'un produit est dans la catégorie. On
  // applique la même règle avant la confirmation, pour ne pas faire valider une
  // suppression définitive qui sera refusée juste après. Le serveur refuse de
  // toute façon : ce contrôle-ci est un confort, pas la sécurité.
  const askDelete = () => {
    if (count > 0) {
      setErr(`Impossible de supprimer « ${f.name_fr || f.id} » : ${count} produit${count > 1 ? 's' : ''} `
        + `${count > 1 ? 'sont' : 'est'} encore dans cette catégorie. Déplacez-${count > 1 ? 'les' : 'le'} depuis l’onglet Produits, puis revenez ici.`);
      toast('Suppression refusée', 'bad');
      return;
    }
    setConfirmDel(true);
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteCategory(f.id);
      if (!res?.ok) {
        // Le serveur recompte : il refuse même si l'écran affichait
        // « 0 produit » à partir de données devenues obsolètes.
        setErr(res?.error || 'Suppression impossible.');
        toast('Suppression impossible', 'bad');
        setConfirmDel(false);
        return;
      }
      toast('Catégorie supprimée');
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
        title={isNew ? 'Nouvelle catégorie' : f.name_fr || f.id}
        footer={(
          <>
            <Btn variant="primary" disabled={busy || !dirty} onClick={save}>
              {busy ? 'Enregistrement…' : isNew ? 'Ajouter la catégorie' : 'Enregistrer'}
            </Btn>
            {!isNew && (
              <Btn variant="danger" icon="trash" disabled={busy} onClick={askDelete}>
                Supprimer cette catégorie
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
          label="Nom en français *"
          value={f.name_fr}
          onChange={set('name_fr')}
          placeholder="Vidéosurveillance"
          autoComplete="off"
        />
        {isNew && (
          <TextInput
            label="Identifiant (adresse de la page)"
            hint="Rempli d’après le nom. Il ne pourra plus changer ensuite."
            value={f.id}
            onChange={(v) => { setIdTouched(true); setDirty(true); setF((p) => ({ ...p, id: slugify(v) })); }}
            placeholder="videosurveillance"
            autoComplete="off"
          />
        )}

        <TextInput
          label="Sous-titre (français)"
          hint="La ligne sous le nom, sur la carte de la page d’accueil."
          value={f.blurb_fr}
          onChange={set('blurb_fr')}
          placeholder="Caméras IP, NVR, XVR et accessoires"
        />

        <LogoPicker
          value={f.image_url}
          onChange={(url) => { setDirty(true); setF((p) => ({ ...p, image_url: url })); }}
          folder="categories"
          name={f.name_fr || f.id}
          label="Image de la catégorie"
          hint="Affichée sur la carte d’accueil. Sans image, c’est l’icône ci-dessous qui s’affiche."
        />

        <div>
          <span className="mbr-lbl">
            Icône
            <small>Utilisée partout où la catégorie n’a pas d’image.</small>
          </span>
          <div className="mbr-ipick">
            {ICONS.map((i) => (
              <button
                type="button"
                key={i}
                className={f.icon === i ? 'on' : ''}
                aria-label={`Icône ${i}`}
                aria-pressed={f.icon === i}
                onClick={() => { setDirty(true); setF((p) => ({ ...p, icon: i })); }}
              >
                <Icon name={i} size={19} />
              </button>
            ))}
          </div>
        </div>

        {/* Les traductions se saisissent une fois, à la création, et presque
            jamais depuis un téléphone : elles sont repliées par défaut. */}
        <Btn icon={more ? 'chevdown' : 'chevright'} onClick={() => setMore((v) => !v)}>
          {more ? 'Masquer les traductions' : 'Traductions et ordre'}
        </Btn>
        {more && (
          <>
            <TextInput
              label="Nom en anglais"
              hint="Vide = le nom français est réutilisé sur la version anglaise du site."
              value={f.name_en}
              onChange={set('name_en')}
              placeholder="Video Surveillance"
            />
            <TextInput label="Nom en arabe" value={f.name_ar} onChange={set('name_ar')} dir="rtl" />
            <TextInput label="Sous-titre (anglais)" value={f.blurb_en} onChange={set('blurb_en')} />
            <TextInput label="Sous-titre (arabe)" value={f.blurb_ar} onChange={set('blurb_ar')} dir="rtl" />
            <NumberInput
              label="Ordre d’affichage"
              hint="Plus le nombre est petit, plus la catégorie remonte."
              value={f.sort}
              onChange={set('sort')}
            />
          </>
        )}
      </Sheet>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={remove}
        busy={busy}
        title="Supprimer cette catégorie ?"
        body={`« ${f.name_fr || f.id} » disparaîtra de la page d’accueil et des filtres du catalogue. C’est définitif.`}
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}

/* ------------------------------------------------------------------- écran -- */

export default function CategoriesScreen({ categories = [], counts = {}, error = '' }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(null);      // catégorie ouverte, ou 'new'

  // Filtrage local : la liste est courte et déjà chargée (voir l'écran Marques).
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? categories.filter((c) => `${c.name?.fr || ''} ${c.name?.en || ''} ${c.id}`.toLowerCase().includes(s))
      : categories;
  }, [categories, q]);

  return (
    <>
      {/* Ajout par le bouton flottant uniquement — voir l'écran Marques. */}
      <SubTop
        title="Catégories"
        subtitle={`${categories.length} catégorie${categories.length > 1 ? 's' : ''}`}
        back="/mobile/plus"
      />

      <div className="mb-wrap">
        {error && <Banner kind="bad">La liste n’a pas pu être chargée : {error}</Banner>}

        {categories.length > 6 && <SearchBar value={q} onChange={setQ} placeholder="Nom de la catégorie…" />}

        {list.length === 0 ? (
          <Empty icon="grid" action={<Btn icon="plus" onClick={() => setActive('new')}>Ajouter une catégorie</Btn>}>
            {q ? `Aucune catégorie pour « ${q} ».` : 'Aucune catégorie pour l’instant.'}
          </Empty>
        ) : (
          <div className="mbl">
            {list.map((c) => {
              const n = counts[c.id] || 0;
              return (
                <button type="button" className="mbl-row" key={c.id} onClick={() => setActive(c)}>
                  <span className="mbl-thumb">
                    {c.image_url
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={c.image_url} alt="" loading="lazy" />
                      : <Icon name={c.icon || 'box'} size={24} />}
                  </span>
                  <span className="mbl-bd">
                    <span className="t">{c.name?.fr || c.id}</span>
                    <span className="s">{n} produit{n > 1 ? 's' : ''} · {c.id}</span>
                  </span>
                  <Icon name="chevright" size={19} />
                </button>
              );
            })}
          </div>
        )}

        <div className="mbf-pad" />
      </div>

      <button type="button" className="mbl-fab" onClick={() => setActive('new')} aria-label="Nouvelle catégorie">
        <Icon name="plus" size={26} />
      </button>

      {active && (
        <CatEditor
          key={active === 'new' ? 'new' : active.id}
          cat={active === 'new' ? null : active}
          isNew={active === 'new'}
          count={active === 'new' ? 0 : counts[active.id] || 0}
          onClose={() => setActive(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
