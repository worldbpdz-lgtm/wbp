'use client';
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/mobile/ui';

// ============================================================================
// Briques de FORMULAIRE de l'application mobile.
// ----------------------------------------------------------------------------
// Les écrans d'édition du téléphone ne réutilisent pas les champs de /admin :
// ceux-là sont dessinés pour une souris et une fenêtre large (trois colonnes,
// tableaux, menus au survol). Ici tout est fait pour un pouce :
//
//  • 16 px minimum sur chaque champ de saisie. En dessous, Safari iOS zoome sur
//    le champ dès qu'on le touche et laisse la page décalée sur le côté. C'est
//    la règle la plus importante de ce fichier, et la moins évidente.
//  • 46 px de hauteur minimum sur tout ce qui se touche.
//  • Les choix se font dans une feuille qui monte du bas (<Sheet />) et non
//    dans un menu déroulant : le pouce atteint le bas de l'écran, pas le haut.
//  • Aucune confirmation par `confirm()` : la fenêtre du navigateur est
//    minuscule et illisible dans une app installée. <Confirm /> est une feuille
//    du bas où le bouton dangereux est rouge et séparé.
//  • Une barre d'enregistrement collée en bas (<SaveBar />), toujours visible :
//    sur un téléphone, un bouton « Enregistrer » en fin de formulaire est à
//    trois écrans de défilement du champ qu'on vient de corriger.
// ============================================================================

/* ------------------------------------------------------------------ champs -- */

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className={`mbf-field ${error ? 'bad' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <p className="mbf-hint bad">{error}</p> : hint ? <p className="mbf-hint">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ label, hint, error, value, onChange, multiline = false, rows = 4, ...rest }) {
  const id = useId();
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <Tag
        id={id}
        className={`mbf-input ${multiline ? 'area' : ''}`}
        value={value ?? ''}
        rows={multiline ? rows : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </Field>
  );
}

// Nombre : type="text" + inputMode, comme pour la quantité du site public —
// type="number" donne un clavier avec des lettres sur iPhone et réagit au
// défilement de la molette.
export function NumberInput({ label, hint, error, value, onChange, decimal = false, ...rest }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        className="mbf-input"
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value ?? ''}
        onChange={(e) => {
          const cleaned = decimal
            ? e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
            : e.target.value.replace(/[^\d-]/g, '');
          onChange(cleaned);
        }}
        {...rest}
      />
    </Field>
  );
}

// Choix dans une liste : bouton + feuille du bas. On garde un <select> caché
// pour rien — un vrai menu natif iOS s'ouvre en bas de l'écran de toute façon,
// mais il ne sait afficher ni une image ni deux lignes par option, et la liste
// des catégories en a besoin.
export function PickerInput({ label, hint, error, value, options, onChange, placeholder = 'Choisir…' }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Field label={label} hint={hint} error={error}>
        <button type="button" className="mbf-picker" onClick={() => setOpen(true)}>
          <span className={current ? '' : 'ph'}>{current ? current.label : placeholder}</span>
          <Icon name="chevdown" size={18} />
        </button>
      </Field>
      <Sheet open={open} onClose={() => setOpen(false)} title={label || 'Choisir'}>
        <div className="mbf-options">
          {options.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              className={`mbf-option ${o.value === value ? 'on' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span className="bd">
                <b>{o.label}</b>
                {o.note && <small>{o.note}</small>}
              </span>
              {o.value === value && <Icon name="check" size={19} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export function Switch({ checked, onChange, title, note }) {
  return (
    <label className="mbf-switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true"><span className="knob" /></span>
      <span className="txt"><b>{title}</b>{note && <small>{note}</small>}</span>
    </label>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Rechercher…' }) {
  return (
    <div className="mbf-search">
      <Icon name="search" size={18} />
      <input
        className="mbf-input"
        type="search"
        inputMode="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Effacer">
          <Icon name="close" size={17} />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- conteneurs -- */

export function Group({ title, note, children }) {
  return (
    <section className="mbf-group">
      {title && <h2 className="mbf-group-t">{title}</h2>}
      {note && <p className="mbf-group-n">{note}</p>}
      <div className="mbf-group-bd">{children}</div>
    </section>
  );
}

export function Banner({ kind = 'info', children, onClose }) {
  const icon = { info: 'bolt', ok: 'check', bad: 'close', warn: 'bolt' }[kind] || 'bolt';
  return (
    <div className={`mbf-banner ${kind}`} role={kind === 'bad' ? 'alert' : 'status'}>
      <Icon name={icon} size={17} />
      <span>{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>
      )}
    </div>
  );
}

export function Empty({ icon = 'box', children, action }) {
  return (
    <div className="mbf-empty">
      <Icon name={icon} size={38} />
      <p>{children}</p>
      {action}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Feuille qui monte du bas. Fermée par le voile, par la poignée, par Échap.
// Le défilement de la page est bloqué pendant qu'elle est ouverte, sinon le
// contenu derrière bouge sous le doigt au lieu de la liste.
// ----------------------------------------------------------------------------
export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="mbf-sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mbf-scrim" onClick={onClose} />
      <div className="mbf-sheet">
        <button type="button" className="mbf-grab" onClick={onClose} aria-label="Fermer" />
        {title && <h3 className="mbf-sheet-t">{title}</h3>}
        <div className="mbf-sheet-bd">{children}</div>
        {footer && <div className="mbf-sheet-ft">{footer}</div>}
      </div>
    </div>
  );
}

// Confirmation d'une action irréversible. `danger` colore le bouton en rouge et
// le place SOUS « Annuler » : le pouce tombe naturellement sur l'annulation.
export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirmer', danger = false, busy = false }) {
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={title}>
      {body && <p className="mbf-confirm-b">{body}</p>}
      <div className="mbf-confirm-a">
        <button type="button" className="mbf-btn ghost" onClick={onClose} disabled={busy}>Annuler</button>
        <button type="button" className={`mbf-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Un instant…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------
// En-tête d'un écran secondaire : retour, titre, et une action à droite.
// `back` est une adresse plutôt qu'un simple router.back() : on arrive parfois
// sur une fiche par un lien direct (raccourci, notification), et « retour »
// doit alors mener à la liste, pas hors de l'application.
// ----------------------------------------------------------------------------
export function SubTop({ title, subtitle, back = '/mobile', action }) {
  const router = useRouter();
  return (
    <header className="mb-sub-top">
      <button type="button" className="back" onClick={() => router.push(back)} aria-label="Retour">
        <Icon name="chevleft" size={20} />
      </button>
      <div className="ttl">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/* ------------------------------------------------------------------ actions -- */

export function Btn({ variant = '', icon, children, ...rest }) {
  return (
    <button type="button" className={`mbf-btn ${variant}`} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

// Barre d'enregistrement collée au bas de l'écran, au-dessus de la barre
// d'onglets. Elle n'apparaît que lorsqu'il y a quelque chose à enregistrer :
// une barre toujours présente finit par être ignorée, et elle mange 60 px de
// hauteur sur un écran qui en a peu.
export function SaveBar({ dirty, busy, onSave, onCancel, saveLabel = 'Enregistrer' }) {
  if (!dirty) return null;
  return (
    <div className="mbf-savebar">
      <button type="button" className="mbf-btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
      <button type="button" className="mbf-btn primary grow" onClick={onSave} disabled={busy}>
        {busy ? 'Enregistrement…' : saveLabel}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- toast -- */
// Confirmation courte et non bloquante (« Enregistré », « Photo ajoutée »).
// Sur un téléphone, une bannière en haut de page passe inaperçue : le regard
// est sur le pouce, en bas.

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);

  const show = useCallback((text, kind = 'ok') => {
    if (!text) return;
    clearTimeout(timer.current);
    setMsg({ text, kind });
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className={`mbf-toast ${msg.kind}`} role="status">
          <Icon name={msg.kind === 'bad' ? 'close' : 'check'} size={17} />
          <span>{msg.text}</span>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
