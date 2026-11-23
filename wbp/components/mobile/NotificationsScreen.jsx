'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMobile } from '@/components/mobile/MobileApp';
import { Icon } from '@/components/mobile/ui';
import { Banner, Btn, Empty, Group, SubTop, Switch, useToast } from '@/components/mobile/form';
import { dayKeyOf, dayLabelOf, timeOf } from '@/components/mobile/store';
import { usePushDevice, isIos } from '@/components/push-client';
import { markNotificationsRead } from '@/app/admin/crm-actions';
import { NOTIFICATION_KINDS } from '@/lib/crm';

// ============================================================================
// Notifications du téléphone.
// ----------------------------------------------------------------------------
// En haut : l'état de CE téléphone, avec la seule action utile pour chaque
// cas (activer, installer l'app, débloquer dans les Réglages…). Puis les
// types d'alertes reçus, puis le fil des dernières notifications.
//
// Le fil est marqué « lu » une seconde et demie après l'ouverture de l'écran
// (comme sur le back-office) ; les lignes gardent leur surbrillance pendant
// la visite, pour qu'on voie ce qui était nouveau.
// ============================================================================

const ICON = {
  order: ['truck', '#1F9D55'],
  quote: ['cart', '#FF5A1F'],
  message: ['mail', '#3B82F6'],
  review: ['star', '#F59E0B'],
  team: ['user', '#0E9488'],
};

async function getFeed() {
  const res = await fetch('/api/notifications?limit=100', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function NotificationsScreen({ owner, editor }) {
  const router = useRouter();
  const toast = useToast();
  const { reloadFeed } = useMobile();
  const push = usePushDevice({ scope: '/mobile', swUrl: '/sw.js' });
  const [feed, setFeed] = useState(null);
  const [failed, setFailed] = useState(false);
  const marked = useRef(false);

  const load = useCallback(async () => {
    try { setFeed(await getFeed()); setFailed(false); } catch { setFailed(true); }
  }, []);

  useEffect(() => {
    load();
    const onMsg = (e) => { if (e?.data?.type === 'wbp-push') load(); };
    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener?.('message', onMsg);
  }, [load]);

  // Ouvrir l'écran = avoir vu les notifications.
  useEffect(() => {
    if (!feed?.ready || marked.current || !feed.unread) return undefined;
    const h = setTimeout(async () => {
      marked.current = true;
      try { await markNotificationsRead(); reloadFeed?.(); } catch { /* sera refait à la prochaine visite */ }
    }, 1500);
    return () => clearTimeout(h);
  }, [feed, reloadFeed]);

  const kinds = NOTIFICATION_KINDS.filter((k) => k.value !== 'review' || editor);
  const items = feed?.items || [];

  const groups = useMemo(() => {
    const out = [];
    for (const n of items) {
      const key = dayKeyOf(n.created_at);
      const last = out[out.length - 1];
      if (!last || last.key !== key) out.push({ key, label: dayLabelOf(n.created_at), items: [n] });
      else last.items.push(n);
    }
    return out;
  }, [items]);

  const back = () => (window.history.length > 1 ? router.back() : router.push('/mobile'));

  return (
    <>
      <SubTop title="Notifications" subtitle={feed?.unread ? `${feed.unread} non lue${feed.unread > 1 ? 's' : ''}` : 'Alertes de ce téléphone'} onBack={back} />

      <div className="mb-wrap">
        {/* ----------------------------------------------- état du téléphone -- */}
        <section className="mbn-card">
          <h2><Icon name="bell" size={18} /> Sur ce téléphone</h2>

          {push.state === 'loading' && <p>Vérification…</p>}

          {push.state === 'on' && (
            <>
              <span className="mbn-state on"><Icon name="check" size={14} /> Activées{push.device ? ` · ${push.device}` : ''}</span>
              <p>Vous êtes prévenu même quand l’app est fermée. Le chiffre sur l’icône WBP indique les demandes à traiter.</p>
              <div className="mbi-two">
                <Btn icon="bell" disabled={push.busy}
                  onClick={async () => { const r = await push.test(); toast(r.ok ? 'Notification de test envoyée' : (r.error || 'Échec'), r.ok ? 'ok' : 'bad'); }}>
                  Tester
                </Btn>
                <Btn variant="ghost" disabled={push.busy} onClick={async () => { await push.disable(); toast('Désactivées sur ce téléphone'); }}>
                  Désactiver
                </Btn>
              </div>
            </>
          )}

          {push.state === 'off' && (
            <>
              <span className="mbn-state off">Désactivées</span>
              <p>Recevez une alerte dès qu’un client passe commande, demande un devis ou pose une question — même app fermée.</p>
              <Btn variant="primary" icon="bell" disabled={push.busy}
                onClick={async () => { const ok = await push.enable(); if (ok) toast('Activées — une notification de test arrive'); }}>
                {push.busy ? 'Un instant…' : 'Activer les notifications'}
              </Btn>
            </>
          )}

          {push.state === 'ios-install' && (
            <>
              <span className="mbn-state off">App à installer</span>
              <p>Sur iPhone, Apple n’autorise les notifications qu’aux apps installées sur l’écran d’accueil :</p>
              <ol className="mbn-steps">
                <li>Dans Safari, touchez <b>Partager</b> (le carré avec une flèche).</li>
                <li>Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
                <li>Ouvrez l’app <b>WBP</b> depuis l’écran d’accueil et revenez ici pour activer.</li>
              </ol>
              <p className="mbf-hint">iOS 16.4 ou plus récent est nécessaire.</p>
            </>
          )}

          {push.state === 'denied' && (
            <>
              <span className="mbn-state off">Bloquées</span>
              <p>
                {isIos()
                  ? <>Les notifications ont été refusées. Pour les autoriser : <b>Réglages</b> → <b>Notifications</b> → <b>WBP</b> → <b>Autoriser les notifications</b>, puis revenez ici.</>
                  : <>Les notifications ont été refusées pour ce site. Ouvrez les <b>paramètres du site</b> (cadenas à côté de l’adresse, ou Paramètres → Notifications) et autorisez-les, puis revenez ici.</>}
              </p>
              <Btn icon="refresh" onClick={() => push.refresh()}>J’ai changé le réglage</Btn>
            </>
          )}

          {push.state === 'unsupported' && (
            <p>Ce navigateur ne permet pas les notifications. Sur iPhone, mettez à jour iOS (16.4 ou plus) et utilisez l’app installée ; sur Android, utilisez Chrome.</p>
          )}

          {push.state === 'unavailable' && (
            <Banner kind="warn">Indisponible pour l’instant : la base de données doit d’abord être mise à jour (fichier supabase/commandes-notifications.sql).</Banner>
          )}

          {push.error && <Banner kind="bad">{push.error}</Banner>}
        </section>

        {/* -------------------------------------------------- types reçus -- */}
        {push.state === 'on' && push.prefs && (
          <Group title="Me prévenir pour" note="Réglage propre à ce téléphone : l’ordinateur garde le sien.">
            {kinds.map((k) => (
              <Switch
                key={k.value}
                checked={!!push.prefs[k.value]}
                title={k.label}
                note={k.value === 'team' && owner ? 'Commandes confirmées, annulées ou livrées par l’équipe' : k.hint}
                onChange={async (v) => {
                  const ok = await push.savePrefs({ ...push.prefs, [k.value]: v });
                  if (!ok) toast('Réglage non enregistré — réessayez', 'bad');
                }}
              />
            ))}
          </Group>
        )}

        {/* ----------------------------------------------------------- fil -- */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 className="mbf-group-t" style={{ margin: 0 }}>Dernières notifications</h2>
          {feed?.unread > 0 && (
            <button type="button" className="mbf-btn sm ghost" onClick={async () => {
              marked.current = true;
              const r = await markNotificationsRead();
              if (r?.ok === false) { toast(r.error, 'bad'); return; }
              reloadFeed?.(); load();
            }}>
              Tout marquer lu
            </button>
          )}
        </div>

        {failed && <Banner kind="bad">Impossible de charger les notifications. Vérifiez la connexion.</Banner>}
        {feed && feed.ready === false && (
          <Banner kind="warn">Le fil de notifications sera disponible après la mise à jour de la base.</Banner>
        )}

        {feed && feed.ready !== false && items.length === 0 && (
          <Empty icon="bell">Aucune notification pour l’instant. Les nouvelles commandes, demandes de devis et questions des clients apparaîtront ici.</Empty>
        )}

        {groups.map((g) => (
          <div key={g.key} className="mbn-list">
            <div className="mb-daysep">{g.label}</div>
            {g.items.map((n) => {
              const [icon, color] = ICON[n.kind] || ['bell', '#7C7167'];
              const href = n.url && n.url.startsWith('/mobile') ? n.url : null;
              const inner = (
                <>
                  <span className="ic" style={{ background: color }}><Icon name={icon} size={17} /></span>
                  <span className="bd">
                    <b>{n.title}</b>
                    {n.body && <p>{n.body}</p>}
                  </span>
                  <time>{timeOf(n.created_at)}</time>
                  {n.unread && <span className="dot" aria-label="Non lue" />}
                </>
              );
              return href ? (
                <Link key={n.id} href={href} className={`mbn-item ${n.unread ? 'unread' : ''}`}>{inner}</Link>
              ) : (
                <div key={n.id} className={`mbn-item ${n.unread ? 'unread' : ''}`}>{inner}</div>
              );
            })}
          </div>
        ))}

        <div className="mbf-pad" />
      </div>
    </>
  );
}
