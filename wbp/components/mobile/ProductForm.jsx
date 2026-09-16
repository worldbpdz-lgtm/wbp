'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upsertProduct, deleteProduct } from '@/app/admin/actions';
import { Icon } from '@/components/mobile/ui';
import {
  Banner, Btn, Confirm, Group, NumberInput, PickerInput, SaveBar,
  SubTop, Switch, TextInput, useToast,
} from '@/components/mobile/form';
import PhotoPicker from '@/components/mobile/PhotoPicker';
import DocPicker from '@/components/mobile/DocPicker';

// ============================================================================
// Fiche produit, version téléphone.
// ----------------------------------------------------------------------------
// Mêmes champs et MÊME server action que le back-office web (`upsertProduct`) :
// les contrôles, le nettoyage des données et le journal d'activité sont déjà
// faits côté serveur, une seule fois, pour les deux interfaces.
//
// Trois écarts assumés par rapport à l'écran d'ordinateur, tous dictés par la
// taille de l'écran :
//
//  1. UNE liste de photos, dont la première est la principale — au lieu d'un
//     sélecteur « photo principale » et d'une galerie côte à côte. C'est déjà la
//     règle du serveur (`image_url` = la photo choisie, sinon `images[0]`).
//  2. Les champs rarement touchés (note affichée, nombre d'avis, ordre,
//     accroches EN/AR) sont regroupés derrière « Détails avancés », replié par
//     défaut. Sur un téléphone, un formulaire de vingt champs se parcourt au
//     pouce pendant dix secondes avant d'arriver au bouton d'enregistrement.
//  3. La barre d'enregistrement est collée en bas et n'apparaît qu'en cas de
//     modification.
//
// L'identifiant (le « slug » de l'URL) n'est modifiable qu'à la création : le
// changer sur une fiche existante casserait les liens déjà partagés et les
// références de la vitrine.
// ============================================================================

const slugify = (v) => String(v || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const BADGES = [
  { value: '', label: 'Aucun badge' },
  { value: 'bestseller', label: 'Best-seller' },
  { value: 'new', label: 'Nouveau' },
];

export default function ProductForm({ isNew, product, localImages = [], brands, categories }) {
  const router = useRouter();
  const toast = useToast();

  // La photo principale de la base n'est pas forcément dans `images` (fiches
  // anciennes). On la remet en tête plutôt que de la perdre au premier
  // enregistrement.
  const initialImages = useMemo(() => {
    const gallery = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
    const main = product?.image_url;
    return main && !gallery.includes(main) ? [main, ...gallery] : gallery;
  }, [product]);

  const [f, setF] = useState({
    id: product?.id || '',
    name: product?.name || '',
    code: product?.code || '',
    cat: product?.cat || categories[0]?.value || '',
    brand: product?.brand || brands[0]?.value || '',
    badge: product?.badge || '',
    price: product?.price ?? '',
    tag_fr: product?.tag?.fr || '',
    tag_en: product?.tag?.en || '',
    tag_ar: product?.tag?.ar || '',
    rating: product?.rating ?? 4.5,
    reviews_count: product?.reviews_count ?? 0,
    sort: product?.sort ?? 0,
    active: product?.active ?? true,
    featured: product?.featured ?? false,
  });
  const [images, setImages] = useState(initialImages);
  const [docs, setDocs] = useState(Array.isArray(product?.docs) ? product.docs : []);
  const [specs, setSpecs] = useState(product?.specs?.length ? product.specs : []);
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
  const touch = (fn) => (v) => { setDirty(true); fn(v); };

  const setSpec = (i, j) => (v) => {
    setDirty(true);
    setSpecs((s) => s.map((r, ri) => (ri === i ? (j === 0 ? [v, r[1]] : [r[0], v]) : r)));
  };

  const save = async () => {
    setErr('');
    if (!f.name.trim()) { setErr('Le nom du produit est obligatoire.'); return; }
    if (!f.code.trim()) { setErr('La référence est obligatoire.'); return; }
    setBusy(true);
    try {
      const res = await upsertProduct({
        ...f,
        id: f.id || slugify(f.name),
        // La 1ʳᵉ photo est la principale : c'est ce que le serveur ferait de
        // toute façon, on le rend explicite.
        image_url: images[0] || '',
        images,
        docs,
        specs: specs.filter((r) => r[0] || r[1]),
      });
      if (!res?.ok) { setErr(res?.error || 'Enregistrement impossible.'); return; }
      if (res.warn) { setErr(res.warn); setDirty(false); return; }
      toast(isNew ? 'Produit créé' : 'Fiche enregistrée');
      setDirty(false);
      router.push('/mobile/products');
      router.refresh();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau — la fiche n’a pas été enregistrée.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteProduct(f.id);
      if (res && res.ok === false) { setErr(res.error || 'Suppression impossible.'); setConfirmDel(false); return; }
      toast('Produit supprimé');
      router.push('/mobile/products');
      router.refresh();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SubTop
        title={isNew ? 'Nouveau produit' : f.name || 'Fiche produit'}
        subtitle={isNew ? 'Ajouter une référence au catalogue' : f.code}
        back="/mobile/products"
      />

      <div className="mb-wrap">
        {err && <Banner kind="bad" onClose={() => setErr('')}>{err}</Banner>}

        {/* ------------------------------------------------------- photos -- */}
        <Group title="Photos" note="La première photo est celle qui s’affiche sur le site et dans la recherche.">
          <PhotoPicker value={images} onChange={touch(setImages)} name={f.name || f.code} max={10} />

          {/* Photos livrées avec le site, hors base. Informatif : rien à
              enregistrer ici. Sans ce bloc, on téléverse un doublon d'une photo
              que le site affiche déjà. */}
          {localImages.length > 0 && (
            <div className="mbf-banner">
              <Icon name="image" size={17} />
              <span>
                {images.length > 0
                  ? `${localImages.length} photo${localImages.length > 1 ? 's' : ''} livrée${localImages.length > 1 ? 's' : ''} avec le site existe${localImages.length > 1 ? 'nt' : ''} aussi pour cette fiche, mais les photos ci-dessus passent devant.`
                  : `Cette fiche n’a pas de photo en base : le site affiche déjà ${localImages.length > 1 ? `l’une des ${localImages.length} photos livrées` : 'la photo livrée'} avec lui. Inutile d’en ajouter, sauf pour la remplacer.`}
              </span>
            </div>
          )}
        </Group>

        {/* ----------------------------------------------------- identité -- */}
        <Group title="Identité">
          <TextInput
            label="Nom du produit *"
            value={f.name}
            onChange={set('name')}
            placeholder="Caméra Dahua Dome IP 5MP"
            autoComplete="off"
          />
          <TextInput
            label="Référence *"
            value={f.code}
            onChange={set('code')}
            placeholder="DH-IPC-HDBW5541R"
            autoComplete="off"
            autoCapitalize="characters"
          />
          {isNew && (
            <TextInput
              label="Identifiant (adresse de la page)"
              hint="Rempli d’après le nom. Il ne pourra plus changer ensuite."
              value={f.id}
              onChange={(v) => { setIdTouched(true); setDirty(true); setF((p) => ({ ...p, id: slugify(v) })); }}
              placeholder="camera-dahua-dome-5mp"
              autoComplete="off"
            />
          )}
          <PickerInput label="Catégorie" value={f.cat} options={categories} onChange={set('cat')} />
          <PickerInput label="Marque" value={f.brand} options={brands} onChange={set('brand')} />
          <NumberInput
            label="Prix (DA)"
            hint="Laissez vide pour afficher « Prix sur devis »."
            value={f.price}
            onChange={set('price')}
            decimal
            placeholder="—"
          />
          <TextInput
            label="Accroche (français)"
            hint="La phrase courte sous le nom, sur la carte du produit."
            value={f.tag_fr}
            onChange={set('tag_fr')}
            placeholder="Dôme IP anti-vandale"
          />
        </Group>

        {/* --------------------------------------------------- visibilité -- */}
        <Group title="Visibilité">
          <Switch
            checked={f.active}
            onChange={set('active')}
            title="Visible sur le site"
            note="Désactivez pour retirer le produit du catalogue public sans le supprimer."
          />
          <Switch
            checked={f.featured}
            onChange={set('featured')}
            title="★ Mis en avant"
            note="Apparaît en premier dans le catalogue. L’ordre exact se règle dans Vitrine."
          />
        </Group>

        {/* ------------------------------------------------------ documents -- */}
        <Group title="Fiches techniques" note="PDF proposés au téléchargement sur la page du produit.">
          <DocPicker value={docs} onChange={touch(setDocs)} productName={f.name || f.code} />
        </Group>

        {/* -------------------------------------------- spécifications ---- */}
        <Group title="Caractéristiques" note="Le tableau affiché dans l’onglet « Spécifications » de la fiche.">
          {specs.map((r, i) => (
            <div className="mbs-row" key={i}>
              <TextInput value={r[0]} onChange={setSpec(i, 0)} placeholder="Résolution" aria-label="Caractéristique" />
              <TextInput value={r[1]} onChange={setSpec(i, 1)} placeholder="5 MP" aria-label="Valeur" />
              <button
                type="button"
                className="del"
                aria-label="Retirer la ligne"
                onClick={() => { setDirty(true); setSpecs((s) => s.filter((_, ri) => ri !== i)); }}
              >
                <Icon name="trash" size={17} />
              </button>
            </div>
          ))}
          <Btn icon="plus" onClick={() => { setDirty(true); setSpecs((s) => [...s, ['', '']]); }}>
            Ajouter une ligne
          </Btn>
        </Group>

        {/* ------------------------------------------------------ avancé -- */}
        <Group>
          <Btn icon={more ? 'chevdown' : 'chevright'} onClick={() => setMore((v) => !v)}>
            {more ? 'Masquer les détails avancés' : 'Détails avancés'}
          </Btn>
          {more && (
            <>
              <TextInput label="Accroche (anglais)" value={f.tag_en} onChange={set('tag_en')} />
              <TextInput label="Accroche (arabe)" value={f.tag_ar} onChange={set('tag_ar')} dir="rtl" />
              <PickerInput label="Badge" value={f.badge} options={BADGES} onChange={set('badge')} />
              <NumberInput label="Note affichée (0–5)" value={f.rating} onChange={set('rating')} decimal />
              <NumberInput label="Nombre d’avis affiché" value={f.reviews_count} onChange={set('reviews_count')} />
              <NumberInput
                label="Ordre dans les listes"
                hint="Plus le nombre est petit, plus le produit remonte."
                value={f.sort}
                onChange={set('sort')}
              />
            </>
          )}
        </Group>

        {!isNew && (
          <Btn variant="danger" icon="trash" onClick={() => setConfirmDel(true)}>
            Supprimer ce produit
          </Btn>
        )}

        <div className="mbf-pad" />
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        onSave={save}
        onCancel={() => router.push('/mobile/products')}
        saveLabel={isNew ? 'Créer le produit' : 'Enregistrer'}
      />

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={remove}
        busy={busy}
        title="Supprimer ce produit ?"
        body="La fiche, ses photos et ses avis disparaissent du site. C’est définitif — pour le retirer temporairement, désactivez « Visible sur le site »."
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}
