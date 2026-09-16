'use client';
import React, { useRef, useState } from 'react';
import { uploadImages, deleteImage } from '@/app/admin/upload-actions';
import { Icon } from '@/components/mobile/ui';
import { Btn, Confirm, Sheet, useToast } from '@/components/mobile/form';

// ============================================================================
// Photos d'une fiche, version téléphone.
// ----------------------------------------------------------------------------
// Une SEULE liste, où la première photo est la photo principale — au lieu des
// deux widgets du back-office web (« photo principale » d'un côté, « galerie »
// de l'autre). C'est le même modèle côté serveur (`upsertProduct` prend
// `image_url` = la photo choisie, sinon la 1ʳᵉ de la galerie), et sur un écran
// de téléphone deux sélecteurs d'images côte à côte sont illisibles.
//
// Deux boutons d'ajout, et c'est tout l'intérêt de la version mobile :
//
//   • « Appareil photo » ouvre directement la caméra arrière du téléphone
//     (attribut capture="environment"). C'est ce qui permet de photographier un
//     produit dans le dépôt et de l'avoir sur le site trente secondes plus
//     tard, sans passer par un ordinateur.
//   • « Galerie » prend plusieurs photos déjà dans le téléphone.
//
// Les fichiers partent vers Supabase Storage par la MÊME server action que le
// back-office web (`uploadImages`), qui les convertit en WebP et vérifie la
// session. Rien n'est dupliqué côté serveur.
//
// Un appui sur une photo ouvre ses actions (principale, déplacer, supprimer) :
// sur un écran tactile il n'y a pas de survol, donc pas de petits boutons en
// coin — ils seraient à côté de la cible une fois sur deux.
// ============================================================================

export default function PhotoPicker({ value = [], onChange, name = '', max = 10 }) {
  const list = Array.isArray(value) ? value.filter(Boolean) : [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(null);   // index de la photo touchée
  const [confirmDel, setConfirmDel] = useState(false);
  const camera = useRef(null);
  const gallery = useRef(null);
  const toast = useToast();

  const send = async (files) => {
    const room = max - list.length;
    if (room <= 0) { setErr(`Maximum ${max} photos.`); return; }
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      files.slice(0, room).forEach((f) => fd.append('file', f));
      fd.append('folder', 'products');
      fd.append('name', name || 'produit');
      const res = await uploadImages(fd);
      if (res?.ok) {
        onChange([...list, ...res.urls]);
        toast(res.urls.length > 1 ? `${res.urls.length} photos ajoutées` : 'Photo ajoutée');
        if (res.error) setErr(res.error);
      } else {
        setErr(res?.error || 'Envoi impossible.');
      }
    } catch (e) {
      // Sur un téléphone, c'est presque toujours le réseau : on le dit.
      setErr(e?.message || 'Envoi impossible — vérifiez le réseau.');
    } finally {
      setBusy(false);
    }
  };

  const pick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';                  // permet de reprendre le même fichier
    if (files.length) send(files);
  };

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setActive(j);
  };

  const makeMain = (i) => {
    if (i === 0) return;
    const next = [list[i], ...list.filter((_, k) => k !== i)];
    onChange(next);
    setActive(null);
    toast('Photo principale changée');
  };

  // La photo est retirée de la fiche tout de suite ; le fichier stocké part
  // ensuite, sans bloquer l'interface. Si l'effacement du stockage échoue, la
  // fiche est quand même correcte — un fichier orphelin ne se voit pas, une
  // photo qu'on croit supprimée et qui revient, si.
  const remove = async (i) => {
    const url = list[i];
    onChange(list.filter((_, k) => k !== i));
    setActive(null);
    setConfirmDel(false);
    toast('Photo retirée');
    try { await deleteImage(url); } catch { /* fichier orphelin, sans conséquence */ }
  };

  return (
    <div className="mbp">
      <div className="mbp-grid">
        {list.map((url, i) => (
          <button type="button" className="mbp-cell" key={url + i} onClick={() => setActive(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" loading="lazy" />
            {i === 0 && <span className="mbp-main">Principale</span>}
            <span className="mbp-more" aria-hidden="true"><Icon name="chevdown" size={14} /></span>
          </button>
        ))}

        {list.length < max && (
          <>
            <button type="button" className="mbp-add" onClick={() => camera.current?.click()} disabled={busy}>
              {busy ? <span className="mbp-spin" /> : <Icon name="camera" size={22} />}
              <span>{busy ? 'Envoi…' : 'Photo'}</span>
            </button>
            <button type="button" className="mbp-add" onClick={() => gallery.current?.click()} disabled={busy}>
              <Icon name="grid" size={22} />
              <span>Galerie</span>
            </button>
          </>
        )}
      </div>

      {/* capture="environment" : caméra arrière, directement. Sur un ordinateur
          l'attribut est ignoré et c'est un sélecteur de fichiers normal. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={pick} />

      <p className={`mbp-hint ${err ? 'bad' : ''}`}>
        {err || `${list.length}/${max} · la première photo est celle qui s’affiche sur le site.`}
      </p>

      <Sheet open={active !== null} onClose={() => setActive(null)} title="Cette photo">
        {active !== null && (
          <>
            <div className="mbp-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={list[active]} alt="" />
            </div>
            <div className="mbp-acts">
              <Btn icon="star" onClick={() => makeMain(active)} disabled={active === 0}>
                {active === 0 ? 'Déjà la photo principale' : 'Définir comme principale'}
              </Btn>
              <div className="row">
                <Btn icon="chevleft" onClick={() => move(active, -1)} disabled={active === 0}>Reculer</Btn>
                <Btn icon="chevright" onClick={() => move(active, 1)} disabled={active === list.length - 1}>Avancer</Btn>
              </div>
              <Btn variant="danger" icon="trash" onClick={() => setConfirmDel(true)}>Supprimer la photo</Btn>
            </div>
          </>
        )}
      </Sheet>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => remove(active)}
        title="Supprimer cette photo ?"
        body="Elle sera retirée de la fiche et du stockage. C’est définitif."
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
