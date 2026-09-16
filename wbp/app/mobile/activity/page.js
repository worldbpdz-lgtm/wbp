'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar, useMobile } from '@/components/mobile/MobileApp';
import { Icon, Skeleton, fmt } from '@/components/mobile/ui';
import { agoOf, dayKeyOf, dayLabelOf, timeOf, useCached } from '@/components/mobile/store';

// ============================================================================
// Onglet « Activité » — qui a fait quoi, quel jour, à quelle heure.
// ----------------------------------------------------------------------------
// Une ligne par action du back-office, groupée par journée. Les puces du haut
// filtrent sur une personne ; le sélecteur choisit la fenêtre (7 / 30 / 90 j).
//
// ÉCRAN RÉSERVÉ AU PROPRIÉTAIRE. Les administrateurs normaux n'ont pas cet
// onglet dans leur application ; s'ils arrivent ici par une adresse mémorisée
// ou un raccourci, on les renvoie aux statistiques. La vraie barrière reste
// /api/mobile/activity, qui leur répond 403 : ce composant ne fait que la
// courtoisie de ne pas afficher un écran d'erreur.
//
// Les heures et les journées sont calculées ICI, sur le téléphone, avec le
// fuseau d'Alger : le serveur tourne en UTC sur Vercel, et regrouper côté
// serveur aurait fait basculer de jour tout ce qui se passe entre minuit et
// 1 h du matin.
// ============================================================================

const WINDOWS = [[7, '7 j'], [30, '30 j'], [90, '90 j']];

export default function ActivityScreen() {
  const [days, setDays] = useState(30);
  const [actor, setActor] = useState(null);
  const { role } = useMobile();
  const router = useRouter();

  // 'unknown' = rôle pas encore établi : on attend sans rien demander ni rien
  // afficher, plutôt que de renvoyer le propriétaire hors de son propre écran.
  useEffect(() => {
    if (role === 'admin') router.replace('/mobile');
  }, [role, router]);

  // On récupère TOUTE la fenêtre et on filtre par personne sur le téléphone.
  // Deux raisons : les compteurs des puces restent justes quand un filtre est
  // actif (sinon les autres comptes tomberaient à zéro), et changer de personne
  // devient instantané, même sans réseau.
  const allowed = role === 'owner';
  const key = allowed ? `activity.${days}` : null;
  const { data, status, cachedAt, busy, refresh } = useCached(
    key,
    allowed ? `/api/mobile/activity?days=${days}` : null,
  );

  const items = useMemo(
    () => (data?.items || []).filter((it) => !actor || it.email === actor),
    [data, actor],
  );

  // Regroupement par journée locale, dans l'ordre décroissant.
  const groups = useMemo(() => {
    const out = [];
    let current = null;
    for (const it of items) {
      const k = dayKeyOf(it.at);
      if (!current || current.key !== k) {
        current = { key: k, label: dayLabelOf(it.at), items: [] };
        out.push(current);
      }
      current.items.push(it);
    }
    return out;
  }, [items]);

  const people = data?.people || [];
  const total = items.length;

  // Compte non propriétaire (ou rôle encore inconnu) : rien du tout. Pas de
  // titre, pas de message d'erreur, pas d'indice qu'un journal existe — juste
  // l'écran de chargement le temps de la redirection.
  if (!allowed) {
    return (
      <div className="mb-wrap">
        <Skeleton h={62} /><Skeleton h={62} /><Skeleton h={62} />
      </div>
    );
  }

  return (
    <>
      <TopBar
        title="Activité"
        subtitle={data ? `${fmt(total)} action${total > 1 ? 's' : ''} · ${agoOf(cachedAt)}` : 'Chargement…'}
        onRefresh={refresh}
        busy={busy}
      />

      <div className="mb-wrap">
        <div className="mb-seg" role="group" aria-label="Période">
          {WINDOWS.map(([d, label]) => (
            <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{label}</button>
          ))}
        </div>

        {people.length > 0 && (
          <div className="mb-chips" role="group" aria-label="Filtrer par compte">
            <button className={`mb-chip ${!actor ? 'on' : ''}`} onClick={() => setActor(null)}>
              Tous <b>{fmt(people.reduce((a, p) => a + (p.count || 0), 0))}</b>
            </button>
            {people.map((p) => (
              <button key={p.email} className={`mb-chip ${actor === p.email ? 'on' : ''}`}
                onClick={() => setActor(actor === p.email ? null : p.email)}>
                {p.name} <b>{fmt(p.count ?? 0)}</b>
              </button>
            ))}
          </div>
        )}

        {data && data.available === false && (
          <div className="mb-note warn">
            <Icon name="bolt" size={17} />
            <span>Le journal n’est pas encore installé dans la base.
              Lancez <b>apply-activity.bat</b> à la racine du projet, une seule fois.</span>
          </div>
        )}

        {status === 'cached' && data && (
          <div className="mb-note off">
            <Icon name="clock" size={17} />
            <span>Historique en mémoire ({agoOf(cachedAt)}). Il se complètera au retour du réseau.</span>
          </div>
        )}

        {!data ? (
          <><Skeleton h={62} /><Skeleton h={62} /><Skeleton h={62} /><Skeleton h={62} /></>
        ) : groups.length === 0 ? (
          <div className="mb-empty">
            {actor
              ? 'Aucune action pour ce compte sur la période.'
              : 'Aucune action enregistrée sur la période.'}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="mb-daysep">{g.label}</div>
              {g.items.map((it) => (
                <div className="mb-act" key={it.id}>
                  <span className="dot" style={{ background: it.color }}><Icon name={it.icon} size={16} /></span>
                  <div className="bd">
                    <div className="who">{it.name}</div>
                    <div className="what">{it.label}</div>
                    {it.target && <div className="tgt">{it.target}</div>}
                  </div>
                  <span className="hr">{timeOf(it.at)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
