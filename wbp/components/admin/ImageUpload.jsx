'use client';
// ============================================================================
// <ImageUpload />  — champ image réutilisable pour tout l'admin.
//   • glisser-déposer, clic pour parcourir, ou coller (Ctrl+V) une image
//   • aperçu immédiat, barre de progression, erreurs en clair
//   • bouton « URL externe » pour coller un lien au lieu d'uploader
//   • <ImageGallery /> : même chose en multi-images, avec réordonnancement
// L'upload va dans Supabase Storage via la server action uploadImage().
// ============================================================================
import React, { useState, useRef, useCallback } from 'react';
import { uploadImage, uploadImages } from '@/app/admin/upload-actions';

const isImg = (f) => f && /^image\//.test(f.type || '');

function useDrop(onFiles) {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragEnter: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: (e) => { e.preventDefault(); setOver(false); },
    onDrop: (e) => {
      e.preventDefault(); setOver(false);
      const files = Array.from(e.dataTransfer?.files || []).filter(isImg);
      if (files.length) onFiles(files);
    },
    onPaste: (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter(isImg);
      if (files.length) { e.preventDefault(); onFiles(files); }
    },
  };
  return [over, handlers];
}

/* ────────────────────────────── image unique ────────────────────────────── */
export default function ImageUpload({
  value, onChange, folder = 'misc', name = '',
  label = 'Image', hint = 'PNG, JPG, WebP ou SVG — 12 Mo max',
  aspect = '4 / 3', round = false,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [urlMode, setUrlMode] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef(null);

  const send = useCallback(async (files) => {
    const file = files[0];
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      fd.append('name', name || label);
      const res = await uploadImage(fd);
      if (res?.ok) onChange(res.url);
      else setErr(res?.error || 'Upload impossible.');
    } catch (e) {
      setErr(e?.message || 'Upload impossible.');
    } finally { setBusy(false); }
  }, [folder, name, label, onChange]);

  const [over, drop] = useDrop(send);

  return (
    <div className="imgup">
      <div className="imgup-top">
        <span className="imgup-label">{label}</span>
        <div className="imgup-tools">
          <button type="button" className={`imgup-tab ${!urlMode ? 'on' : ''}`} onClick={() => setUrlMode(false)}>Upload</button>
          <button type="button" className={`imgup-tab ${urlMode ? 'on' : ''}`} onClick={() => setUrlMode(true)}>URL</button>
        </div>
      </div>

      {urlMode ? (
        <div className="imgup-url">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://…/photo.jpg"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) { onChange(draft.trim()); setDraft(''); setUrlMode(false); } } }} />
          <button type="button" className="adm-btn sm primary" onClick={() => { if (draft.trim()) { onChange(draft.trim()); setDraft(''); setUrlMode(false); } }}>
            Utiliser
          </button>
        </div>
      ) : value ? (
        <div className={`imgup-preview ${round ? 'round' : ''}`} style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" />
          <div className="imgup-preview-bar">
            <button type="button" className="imgup-mini" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? '…' : 'Remplacer'}
            </button>
            <button type="button" className="imgup-mini danger" onClick={() => onChange('')}>Retirer</button>
          </div>
        </div>
      ) : (
        <div className={`imgup-zone ${over ? 'over' : ''} ${busy ? 'busy' : ''}`} style={{ aspectRatio: aspect }}
          {...drop} onClick={() => input.current?.click()} tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          role="button" aria-label={`Ajouter ${label}`}>
          {busy ? (
            <><span className="imgup-spin" /><b>Envoi en cours…</b></>
          ) : (
            <>
              <span className="imgup-ico" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="M21 16l-5-5-6 6" />
                </svg>
              </span>
              <b>Glissez une image ici</b>
              <span>ou cliquez pour parcourir · Ctrl+V pour coller</span>
            </>
          )}
        </div>
      )}

      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) send(f); e.target.value = ''; }} />
      {err ? <span className="imgup-err">{err}</span> : <span className="imgup-hint">{hint}</span>}
    </div>
  );
}

/* ──────────────────────────── galerie multi-images ───────────────────────── */
export function ImageGallery({ value = [], onChange, folder = 'products', name = '', max = 10 }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef(null);
  const list = Array.isArray(value) ? value : [];

  const send = useCallback(async (files) => {
    const room = max - list.length;
    if (room <= 0) { setErr(`Maximum ${max} images.`); return; }
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      files.slice(0, room).forEach((f) => fd.append('file', f));
      fd.append('folder', folder);
      fd.append('name', name || 'galerie');
      const res = await uploadImages(fd);
      if (res?.ok) { onChange([...list, ...res.urls]); if (res.error) setErr(res.error); }
      else setErr(res?.error || 'Upload impossible.');
    } catch (e) {
      setErr(e?.message || 'Upload impossible.');
    } finally { setBusy(false); }
  }, [list, max, folder, name, onChange]);

  const [over, drop] = useDrop(send);
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };

  return (
    <div className="imgup">
      <div className="imgup-top">
        <span className="imgup-label">Galerie ({list.length}/{max})</span>
        <span className="imgup-hint">La 1ʳᵉ image sert de photo principale si aucune n'est définie</span>
      </div>

      <div className={`imgup-gal ${over ? 'over' : ''}`} {...drop}>
        {list.map((url, i) => (
          <div className="imgup-cell" key={url + i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" />
            {i === 0 && <span className="imgup-main">Principale</span>}
            <div className="imgup-cell-bar">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Reculer">←</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Avancer">→</button>
              <button type="button" className="danger" onClick={() => onChange(list.filter((_, k) => k !== i))} title="Retirer">×</button>
            </div>
          </div>
        ))}
        {list.length < max && (
          <button type="button" className={`imgup-add ${busy ? 'busy' : ''}`} onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <span className="imgup-spin" /> : <span className="imgup-add-plus">+</span>}
            <span>{busy ? 'Envoi…' : 'Ajouter'}</span>
          </button>
        )}
      </div>

      <input ref={input} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) send(f); e.target.value = ''; }} />
      {err ? <span className="imgup-err">{err}</span> : <span className="imgup-hint">Glissez plusieurs photos d'un coup — elles sont converties en WebP automatiquement.</span>}
    </div>
  );
}
