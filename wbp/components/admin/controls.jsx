'use client';
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteProduct, toggleProductActive, toggleProductFeatured, updateQuoteStatus, deleteQuote,
  updateMessageStatus, deleteMessage, setReviewApproved, deleteReview, deleteSubscriber,
} from '@/app/admin/actions';

// Message par défaut : en production, Next masque le détail d'une exception
// levée côté serveur (requireAdmin() lève quand la session a expiré).
const FAIL = 'Échec — session expirée ou droits insuffisants. Rechargez la page et reconnectez-vous.';

// Une action serveur échoue de deux façons : elle lève (l'exception s'échappait
// de la transition et finissait dans l'error boundary), ou elle renvoie
// { ok:false, error } — jusqu'ici ignoré, l'opération semblait donc réussir.
// On capture les deux et on expose le message aux contrôles.
function useAct() {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const router = useRouter();
  const run = (fn, onFail) => start(async () => {
    setError('');
    try {
      const res = await fn();
      if (res && res.ok === false) { setError(res.error || FAIL); if (onFail) onFail(); return; }
      router.refresh();
    } catch {
      setError(FAIL);
      if (onFail) onFail();
    }
  });
  return [pending, run, error];
}

function Err({ msg }) {
  if (!msg) return null;
  return <span role="alert" style={{ color: '#c0392b', fontSize: 11, fontWeight: 700, display: 'inline-block', maxWidth: 220, whiteSpace: 'normal', lineHeight: 1.35 }}>{msg}</span>;
}

export function DeleteBtn({ kind, id, label = 'Supprimer' }) {
  const [pending, run, error] = useAct();
  const map = { product: deleteProduct, quote: deleteQuote, message: deleteMessage, review: deleteReview, subscriber: deleteSubscriber };
  return (
    <>
      <button className="adm-btn danger sm" disabled={pending}
        onClick={() => { if (confirm('Confirmer la suppression ?')) run(() => map[kind](id)); }}>
        {pending ? '…' : label}
      </button>
      <Err msg={error} />
    </>
  );
}

export function ToggleActive({ id, active }) {
  const [pending, run, error] = useAct();
  return (
    <>
      <button className="adm-btn sm" disabled={pending} onClick={() => run(() => toggleProductActive(id, !active))}>
        {active ? 'Masquer' : 'Activer'}
      </button>
      <Err msg={error} />
    </>
  );
}

// Étoile « mis en avant » : le produit s'affiche en premier dans le catalogue.
export function ToggleFeatured({ id, featured }) {
  const [pending, run, error] = useAct();
  return (
    <>
      <button
        className={`adm-btn sm adm-star ${featured ? 'on' : ''}`}
        disabled={pending}
        title={error || (featured ? 'Retirer de la mise en avant' : 'Mettre en avant (affiché en premier)')}
        aria-label={featured ? 'Retirer de la mise en avant' : 'Mettre en avant'}
        onClick={() => run(() => toggleProductFeatured(id, !featured))}>
        {pending ? '…' : (featured ? '★' : '☆')}
      </button>
      <Err msg={error} />
    </>
  );
}

export function StatusSelect({ kind, id, status }) {
  const [pending, run, error] = useAct();
  // Piloté par un état : en cas d'échec on revient à la valeur réellement
  // enregistrée, au lieu de laisser affichée celle que l'admin a choisie.
  const [value, setValue] = useState(status);
  const fn = kind === 'quote' ? updateQuoteStatus : updateMessageStatus;
  const opts = kind === 'quote'
    ? ['new', 'contacted', 'quoted', 'closed']
    : ['new', 'read', 'replied', 'closed'];
  return (
    <>
      <select className="adm-tag" value={value} disabled={pending}
        onChange={(e) => { const next = e.target.value; setValue(next); run(() => fn(id, next), () => setValue(status)); }}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <Err msg={error} />
    </>
  );
}

export function ReviewControls({ id, approved }) {
  const [pending, run, error] = useAct();
  return (
    <div className="adm-actions">
      <button className="adm-btn sm" disabled={pending} onClick={() => run(() => setReviewApproved(id, !approved))}>
        {approved ? 'Masquer' : 'Approuver'}
      </button>
      <DeleteBtn kind="review" id={id} />
      <Err msg={error} />
    </div>
  );
}
