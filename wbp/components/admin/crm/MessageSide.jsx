'use client';
// Colonne de droite d'un message de contact : statut, prise en charge, note
// interne, et transformation en devis ou en commande.
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { Who } from '@/components/admin/crm/ui';
import { setLeadStatus, assignItem, saveNotes, createOrderFromMessage } from '@/app/admin/crm-actions';
import { deleteMessage } from '@/app/admin/actions';
import { MESSAGE_STATUSES } from '@/lib/crm';
import { fmtDateTime } from '@/lib/dates';

const FAIL = 'Action impossible — session expirée ? Rechargez la page.';

export default function MessageSide({ message, team = [], migrated = true }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState(message.notes || '');
  const [, start] = useTransition();
  const run = async (name, fn, after) => {
    setErr(''); setBusy(name);
    try {
      const r = await fn();
      if (r && r.ok === false) { setErr(r.error || FAIL); return null; }
      if (after) after(r);
      start(() => router.refresh());
      return r;
    } catch { setErr(FAIL); return null; } finally { setBusy(''); }
  };
  const history = Array.isArray(message.history) ? [...message.history].reverse() : [];

  return (
    <aside className="crm-side">
      {err && <div className="crm-err" role="alert"><Icon name="alert" size={16} /><span>{err}</span></div>}
      <section className="crm-card">
        <div className="hd"><h2>Suite à donner</h2></div>
        <div className="bd">
          <label className="crm-f"><span>Statut</span>
            <select value={message.status || 'new'} disabled={!!busy}
              onChange={(e) => run('status', () => setLeadStatus('message', message.id, e.target.value))}>
              {MESSAGE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
            </select>
          </label>
          {migrated && (
            <>
              <button type="button" className="adm-btn primary crm-bigbtn" disabled={!!busy}
                onClick={() => run('order', () => createOrderFromMessage(message.id), (r) => r?.id && router.push(`/admin/orders/${r.id}`))}>
                <Icon name="cart" size={16} /> {busy === 'order' ? 'Un instant…' : 'Créer une commande'}
              </button>
              <a className="adm-btn crm-bigbtn" href={`/admin/quotes/new?message=${message.id}`}><Icon name="receipt" size={16} /> Préparer un devis</a>
            </>
          )}
        </div>
      </section>

      {migrated && (
        <>
          <section className="crm-card">
            <div className="hd"><h2>Pris en charge par</h2></div>
            <div className="bd">
              <Who email={message.assigned_to} team={team} empty="Personne pour l’instant" />
              <select className="adm-btn" style={{ width: '100%' }} value={message.assigned_to || ''} disabled={!!busy}
                onChange={(e) => run('assign', () => assignItem('message', message.id, e.target.value || 'none'))}>
                <option value="">Personne</option>
                {team.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
              </select>
            </div>
          </section>
          <section className="crm-card">
            <div className="hd"><h2>Note interne</h2></div>
            <div className="bd">
              <label className="crm-f"><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Réponse donnée, rappel prévu…" /></label>
              {notes !== (message.notes || '') && (
                <button type="button" className="adm-btn primary" disabled={!!busy} onClick={() => run('notes', () => saveNotes('message', message.id, notes))}>
                  {busy === 'notes' ? 'Enregistrement…' : 'Enregistrer la note'}
                </button>
              )}
            </div>
          </section>
          {history.length > 0 && (
            <section className="crm-card">
              <div className="hd"><h2>Historique</h2></div>
              <div className="bd"><ul className="crm-hist">
                {history.slice(0, 30).map((h, i) => <li key={i} className={h.type}><b>{h.name || 'Système'}</b> — {h.text}<time>{fmtDateTime(h.at)}</time></li>)}
              </ul></div>
            </section>
          )}
        </>
      )}

      <button type="button" className="adm-btn danger" disabled={!!busy}
        onClick={async () => {
          if (!window.confirm('Supprimer définitivement ce message ?\n\nPour le ranger sans le perdre, choisissez plutôt le statut « Clôturé ».')) return;
          const r = await run('delete', () => deleteMessage(message.id));
          if (r?.ok) router.push('/admin/messages');
        }}>
        <Icon name="trash" size={15} /> Supprimer le message
      </button>
    </aside>
  );
}
