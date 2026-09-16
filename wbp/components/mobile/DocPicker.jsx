'use client';
import React, { useRef, useState } from 'react';
import { uploadDocs, deleteDoc } from '@/app/admin/upload-actions';
import { Icon } from '@/components/mobile/ui';
import { Btn, Confirm, TextInput, useToast } from '@/components/mobile/form';

// ============================================================================
// Fiches techniques (PDF) d'un produit, version téléphone.
// Même server action que le back-office web (`uploadDocs`) : conversion,
// vérifications et journal d'activité sont déjà faits côté serveur.
// ============================================================================

const MAX = 6;
const kb = (n) => !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

export default function DocPicker({ value = [], onChange, productName = '' }) {
  const list = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [del, setDel] = useState(null);
  const input = useRef(null);
  const toast = useToast();

  const send = async (files) => {
    const room = MAX - list.length;
    if (room <= 0) { setErr(`Maximum ${MAX} documents.`); return; }
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      files.slice(0, room).forEach((f) => fd.append('file', f));
      fd.append('name', productName || 'document');
      fd.append('label', 'Fiche technique');
      const res = await uploadDocs(fd);
      if (res?.ok) {
        onChange([...list, ...res.docs]);
        toast(res.docs.length > 1 ? `${res.docs.length} documents ajoutés` : 'Document ajouté');
        if (res.error) setErr(res.error);
      } else {
        setErr(res?.error || 'Envoi impossible.');
      }
    } catch (e) {
      setErr(e?.message || 'Envoi impossible — vérifiez le réseau.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i) => {
    const doc = list[i];
    onChange(list.filter((_, k) => k !== i));
    setDel(null);
    toast('Document retiré');
    try { await deleteDoc(doc?.url); } catch { /* fichier orphelin */ }
  };

  const rename = (i, label) => onChange(list.map((d, k) => (k === i ? { ...d, label } : d)));

  return (
    <div className="mbd">
      {list.map((d, i) => (
        <div className="mbd-row" key={(d.url || '') + i}>
          <span className="ic"><Icon name="pdf" size={19} /></span>
          <div className="bd">
            <TextInput
              value={d.label || ''}
              onChange={(v) => rename(i, v)}
              placeholder="Fiche technique"
              aria-label="Intitulé du document"
            />
            <small>{d.name}{d.size ? ` · ${kb(d.size)}` : ''}</small>
          </div>
          <button type="button" className="del" onClick={() => setDel(i)} aria-label="Retirer le document">
            <Icon name="trash" size={17} />
          </button>
        </div>
      ))}

      {list.length < MAX && (
        <Btn icon="plus" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Envoi…' : 'Ajouter un PDF'}
        </Btn>
      )}

      <input ref={input} type="file" accept="application/pdf" multiple hidden
        onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) send(f); }} />

      {err ? <p className="mbf-hint bad">{err}</p> : list.length === 0 ? (
        <p className="mbf-hint">Le bouton « Fiche technique » n’apparaît sur le site que si un PDF est joint.</p>
      ) : null}

      <Confirm
        open={del !== null}
        onClose={() => setDel(null)}
        onConfirm={() => remove(del)}
        title="Retirer ce document ?"
        body="Le PDF sera supprimé du stockage et le bouton disparaîtra de la fiche produit."
        confirmLabel="Retirer"
        danger
      />
    </div>
  );
}
