'use client';
// ============================================================================
// <DocsUpload /> — fiches techniques PDF d'un produit.
// ----------------------------------------------------------------------------
//   • glisser-déposer ou clic pour parcourir, plusieurs fichiers d'un coup
//   • chaque document porte un intitulé modifiable (« Fiche technique »,
//     « Manuel d'installation », « Certificat »…) : c'est ce que le client lit
//     sur le site, pas le nom de fichier du constructeur
//   • réordonnancement : le premier de la liste est celui mis en avant
//   • « Retirer » enlève la ligne de la fiche ET le fichier du stockage
//
// Volontairement calqué sur <ImageUpload /> : même vocabulaire, mêmes classes
// CSS de base, pour que l'équipe n'ait rien de nouveau à apprendre.
// ============================================================================
import React, { useCallback, useRef, useState } from 'react';
import { uploadDocs, deleteDoc } from '@/app/admin/upload-actions';

const MAX = 6;
const isPdf = (f) => f && (/pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || ''));

// Même format que la fiche produit publique — virgule décimale française.
const humanSize = (b) => {
  const n = Number(b) || 0;
  if (!n) return '';
  return n < 1048576
    ? `${Math.max(1, Math.round(n / 1024))} Ko`
    : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`;
};

// Intitulés proposés — les plus fréquents chez Dahua, Ajax et MAXHUB.
const PRESETS = ['Fiche technique', 'Manuel d’installation', 'Guide utilisateur', 'Certificat', 'Notice firmware'];

export default function DocsUpload({ value = [], onChange, productName = '' }) {
  const list = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef(null);

  const send = useCallback(async (files) => {
    const room = MAX - list.length;
    if (room <= 0) { setErr(`Maximum ${MAX} documents par produit.`); return; }

    const pdfs = files.filter(isPdf).slice(0, room);
    if (!pdfs.length) { setErr('Seuls les fichiers PDF sont acceptés.'); return; }

    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      pdfs.forEach((f) => fd.append('file', f));
      fd.append('name', productName || 'document');
      fd.append('label', 'Fiche technique');
      const res = await uploadDocs(fd);
      if (res?.ok) {
        onChange([...list, ...res.docs]);
        if (res.error) setErr(res.error);
      } else {
        setErr(res?.error || 'Envoi impossible.');
      }
    } catch (e) {
      setErr(e?.message || 'Envoi impossible.');
    } finally { setBusy(false); }
  }, [list, onChange, productName]);

  const pick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) send(files);
  };

  const drop = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragEnter: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: (e) => { e.preventDefault(); setOver(false); },
    onDrop: (e) => {
      e.preventDefault(); setOver(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) send(files);
    },
  };

  const setLabel = (i, label) => onChange(list.map((d, k) => (k === i ? { ...d, label } : d)));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = async (i) => {
    const doc = list[i];
    // On retire d'abord de la fiche : si la suppression du fichier échoue, la
    // ligne ne doit pas revenir. Un PDF orphelin dans le bucket est sans
    // conséquence — une ligne fantôme sur le site public, non.
    onChange(list.filter((_, k) => k !== i));
    try { await deleteDoc(doc.url); } catch { /* fichier déjà absent */ }
  };

  return (
    <div className="imgup docup">
      <div className="imgup-top">
        <span className="imgup-label">Documents ({list.length}/{MAX})</span>
        <span className="imgup-hint">Visibles et téléchargeables par le client, onglet « Documents » de la fiche produit</span>
      </div>

      {list.length > 0 && (
        <ul className="docup-list">
          {list.map((d, i) => (
            <li className="docup-row" key={d.url}>
              <span className="docup-ic" aria-hidden="true">PDF</span>

              <div className="docup-fields">
                <input
                  className="docup-label-input"
                  value={d.label || ''}
                  onChange={(e) => setLabel(i, e.target.value.slice(0, 80))}
                  placeholder="Intitulé affiché au client"
                  list="docup-presets"
                />
                <a className="docup-file" href={d.url} target="_blank" rel="noopener noreferrer" title="Ouvrir le PDF">
                  {d.name} {d.size ? `· ${humanSize(d.size)}` : ''}
                </a>
              </div>

              <div className="docup-tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Descendre">↓</button>
                <button type="button" className="danger" onClick={() => remove(i)} title="Retirer">×</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <datalist id="docup-presets">
        {PRESETS.map((p) => <option key={p} value={p} />)}
      </datalist>

      {list.length < MAX && (
        <button
          type="button"
          className={`docup-zone ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
          onClick={() => input.current?.click()}
          disabled={busy}
          {...drop}
        >
          {busy ? (
            <><span className="imgup-spin" /><b>Envoi en cours…</b></>
          ) : (
            <>
              <b>+ Ajouter un PDF</b>
              <i>Glissez le fichier ici, ou cliquez pour parcourir</i>
            </>
          )}
        </button>
      )}

      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={pick} />

      {err
        ? <span className="imgup-err">{err}</span>
        : <span className="imgup-hint">PDF uniquement — 25 Mo maximum par fichier. Le premier de la liste s’affiche en tête sur le site.</span>}
    </div>
  );
}
