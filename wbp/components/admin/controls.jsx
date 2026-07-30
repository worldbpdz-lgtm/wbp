'use client';
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteProduct, toggleProductActive, toggleProductFeatured, updateQuoteStatus, deleteQuote,
  updateMessageStatus, deleteMessage, setReviewApproved, deleteReview, deleteSubscriber,
} from '@/app/admin/actions';

function useAct() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return [pending, (fn) => start(async () => { await fn(); router.refresh(); })];
}

export function DeleteBtn({ kind, id, label = 'Supprimer' }) {
  const [pending, run] = useAct();
  const map = { product: deleteProduct, quote: deleteQuote, message: deleteMessage, review: deleteReview, subscriber: deleteSubscriber };
  return (
    <button className="adm-btn danger sm" disabled={pending}
      onClick={() => { if (confirm('Confirmer la suppression ?')) run(() => map[kind](id)); }}>
      {pending ? '…' : label}
    </button>
  );
}

export function ToggleActive({ id, active }) {
  const [pending, run] = useAct();
  return (
    <button className="adm-btn sm" disabled={pending} onClick={() => run(() => toggleProductActive(id, !active))}>
      {active ? 'Masquer' : 'Activer'}
    </button>
  );
}

// Étoile « mis en avant » : le produit s'affiche en premier dans le catalogue.
export function ToggleFeatured({ id, featured }) {
  const [pending, run] = useAct();
  return (
    <button
      className={`adm-btn sm adm-star ${featured ? 'on' : ''}`}
      disabled={pending}
      title={featured ? 'Retirer de la mise en avant' : 'Mettre en avant (affiché en premier)'}
      aria-label={featured ? 'Retirer de la mise en avant' : 'Mettre en avant'}
      onClick={() => run(() => toggleProductFeatured(id, !featured))}>
      {pending ? '…' : (featured ? '★' : '☆')}
    </button>
  );
}

export function StatusSelect({ kind, id, status }) {
  const [pending, run] = useAct();
  const fn = kind === 'quote' ? updateQuoteStatus : updateMessageStatus;
  const opts = kind === 'quote'
    ? ['new', 'contacted', 'quoted', 'closed']
    : ['new', 'read', 'replied', 'closed'];
  return (
    <select className="adm-tag" defaultValue={status} disabled={pending}
      onChange={(e) => run(() => fn(id, e.target.value))}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function ReviewControls({ id, approved }) {
  const [pending, run] = useAct();
  return (
    <div className="adm-actions">
      <button className="adm-btn sm" disabled={pending} onClick={() => run(() => setReviewApproved(id, !approved))}>
        {approved ? 'Masquer' : 'Approuver'}
      </button>
      <DeleteBtn kind="review" id={id} />
    </div>
  );
}
