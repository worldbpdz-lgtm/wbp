'use client';
// ============================================================================
// Page /admin/notifications : le fil (lu / non lu) et les réglages de CET
// ordinateur — notifications du système (même onglet fermé), son, et types
// d'événements reçus.
// ============================================================================
import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { usePushDevice } from '@/components/push-client';
import { markNotificationsRead } from '@/app/admin/crm-actions';
import { NOTIFICATION_KINDS } from '@/lib/crm';
import { dayKey, dayLabel, fmtTime } from '@/lib/dates';
import { SOUND_KEY, beep } from '@/components/admin/crm/AdminLive';

const ICON = { order: ['cart', '#1F9D55'], quote: ['receipt', '#7c3aed'], message: ['mail', '#3B82F6'], review: ['star', '#F59E0B'], team: ['user', '#0E9488'] };

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="adm-switch" style={{ margin: 0 }}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="adm-switch-track" aria-hidden="true"><span className="adm-switch-knob" /></span>
    </label>
  );
}

export function PushCard() {
  const push = usePushDevice({ scope: '/admin', swUrl: '/admin-sw.js' });
  const [msg, setMsg] = useState('');
  const [sound, setSound] = useState(true);
  useEffect(() => { try { setSound(localStorage.getItem(SOUND_KEY) !== 'off'); } catch { /* stockage bloqué */ } }, []);
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(''), 5000); };

  const STATE = {
    loading: 'Vérification…',
    unsupported: 'Ce navigateur ne gère pas les notifications. Utilisez Chrome, Edge ou Firefox.',
    'ios-install': 'Sur iPhone / iPad, utilisez l’application WBP installée (adresse /mobile).',
    unavailable: 'Indisponible : la base doit d’abord être mise à jour (supabase/commandes-notifications.sql).',
    denied: 'Bloquées par le navigateur. Cliquez sur le cadenas à gauche de l’adresse → Notifications → Autoriser, puis rechargez.',
    off: 'Désactivées sur cet ordinateur.',
    on: `Activées sur cet ordinateur${push.device ? ` (${push.device})` : ''}.`,
  };

  return (
    <section className="crm-card">
      <div className="hd"><h2>Sur cet ordinateur</h2></div>
      <div className="bd">
        <div className="crm-setting">
          <div><b>Notifications du système</b><small>{STATE[push.state]}</small></div>
          {push.state === 'on'
            ? <button type="button" className="adm-btn sm" disabled={push.busy} onClick={push.disable}>Désactiver</button>
            : push.state === 'off'
              ? <button type="button" className="adm-btn primary sm" disabled={push.busy} onClick={async () => { const ok = await push.enable(); if (ok) say('Activées ✓ — une notification de test arrive.'); }}>{push.busy ? '…' : 'Activer'}</button>
              : null}
        </div>
        {push.error && <div className="crm-err"><Icon name="alert" size={15} /><span>{push.error}</span></div>}
        {msg && <div className="crm-ok"><Icon name="check" size={15} /><span>{msg}</span></div>}
        <div className="crm-setting">
          <div><b>Son à l’arrivée</b><small>Un petit « ding » quand une demande arrive pendant que le back-office est ouvert.</small></div>
          <Toggle checked={sound} onChange={(v) => { setSound(v); try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch { /* */ } if (v) beep(); }} />
        </div>
        {push.state === 'on' && push.prefs && (
          <>
            <p className="adm-muted" style={{ margin: '6px 0 0' }}>Recevoir sur cet ordinateur :</p>
            {NOTIFICATION_KINDS.map((k) => (
              <div className="crm-setting" key={k.value}>
                <div><b>{k.label}</b><small>{k.hint}</small></div>
                <Toggle checked={push.prefs[k.value]} onChange={(v) => push.savePrefs({ ...push.prefs, [k.value]: v })} />
              </div>
            ))}
            <button type="button" className="adm-btn" onClick={async () => { const r = await push.test(); say(r.ok ? 'Notification de test envoyée ✓' : r.error); }}>
              <Icon name="bell" size={15} /> Envoyer une notification de test
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export default function NotificationsCenter({ items = [], unread = 0, ready = true }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const shown = filter ? items.filter((n) => n.kind === filter) : items;

  // Ouvrir la page vaut lecture : la pastille du menu se remet à zéro.
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => { markNotificationsRead().then(() => start(() => router.refresh())).catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [unread, router]);

  let lastDay = '';
  return (
    <div className="crm-grid">
      <div className="crm-main">
        <div className="crm-toolbar" style={{ margin: 0 }}>
          <div className="crm-chips">
            <button type="button" className={`crm-chip${!filter ? ' on' : ''}`} onClick={() => setFilter('')}>Toutes</button>
            {NOTIFICATION_KINDS.map((k) => (
              <button type="button" key={k.value} className={`crm-chip${filter === k.value ? ' on' : ''}`} onClick={() => setFilter(k.value)}>{k.label}</button>
            ))}
          </div>
          {unread > 0 && (
            <div className="crm-search">
              <button type="button" className="adm-btn" disabled={busy}
                onClick={async () => { setBusy(true); try { await markNotificationsRead(); start(() => router.refresh()); } finally { setBusy(false); } }}>
                <Icon name="check" size={15} /> Tout marquer comme lu
              </button>
            </div>
          )}
        </div>
        <section className="crm-card">
          {!ready ? (
            <div className="adm-empty">Les notifications apparaîtront ici une fois la base mise à jour.</div>
          ) : shown.length === 0 ? (
            <div className="adm-empty">Aucune notification{filter ? ' de ce type' : ''}. Les nouvelles commandes, demandes de devis et messages s’afficheront ici.</div>
          ) : (
            <div className="crm-notifs">
              {shown.map((n) => {
                const k = dayKey(n.created_at);
                const sep = k !== lastDay ? (lastDay = k, <div className="crm-daysep" key={`d-${k}`}>{dayLabel(n.created_at)}</div>) : null;
                const [icon, color] = ICON[n.kind] || ['bell', '#7C7167'];
                return (
                  <React.Fragment key={n.id}>
                    {sep}
                    <a className={`crm-notif${n.unread ? ' unread' : ''}`} href={n.admin_url || '#'}>
                      <span className="ic" style={{ background: color }}><Icon name={icon} size={18} /></span>
                      <span className="tx"><b>{n.title}</b>{n.body && <p>{n.body}</p>}</span>
                      <time>{fmtTime(n.created_at)}</time>
                      {n.unread && <span className="dot" aria-label="non lue" />}
                    </a>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <aside className="crm-side">
        <PushCard />
        <section className="crm-card">
          <div className="hd"><h2>Sur les téléphones</h2></div>
          <div className="bd">
            <p className="adm-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
              Chaque membre de l’équipe active les notifications dans l’application WBP installée sur son téléphone :
              onglet de la cloche, en haut à droite → « Activer les notifications ». Sur iPhone, l’application doit
              d’abord être ajoutée à l’écran d’accueil depuis Safari (iOS 16.4 ou plus récent).
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
