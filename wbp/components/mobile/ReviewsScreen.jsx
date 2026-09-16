'use client';
import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, fmt } from '@/components/mobile/ui';
import { Banner, Btn, Confirm, Empty, Sheet, SubTop, useToast } from '@/components/mobile/form';
import { dayKeyOf, dayLabelOf, timeOf } from '@/components/mobile/store';
import { deleteReview, setReviewApproved } from '@/app/admin/actions';

// ============================================================================
// Avis clients (modération), version téléphone.
// ----------------------------------------------------------------------------
// Ce composant ne détient AUCUNE donnée : la page serveur lui passe la liste
// déjà filtrée et les comptes, et toute écriture repasse par les server actions
// du back-office (`setReviewApproved`, `deleteReview`), qui revérifient la
// session, filtrent par site et écrivent le journal d'activité.
//
// Le filtre passe par l'URL et non par un état local, contrairement à l'écran
// Demandes : ici la liste est tronquée à 300 lignes côté serveur, un tri local
// laisserait donc des avis hors d'atteinte. Effet secondaire utile : le bouton
// « retour » du téléphone ramène au filtre précédent.
//
// La liste ne montre qu'UNE ligne de l'avis. Le texte complet est dans la
// feuille du bas, avec les trois seules décisions possibles : publier, retirer,
// supprimer. Modérer, c'est lire puis trancher — pas parcourir des paragraphes
// empilés dans une liste.
// ============================================================================

const FILTERS = [
  ['pending', 'En attente'],
  ['approved', 'Publiés'],
  ['all', 'Tous'],
];

// Note en étoiles pleines / vides. Cinq caractères de largeur constante : une
// note affichée « 4,5/5 » demande de lire, cinq étoiles se voient.
const stars = (n) => {
  const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
};

// Première ligne de l'avis : les retours à la ligne du client deviennent des
// espaces, sinon l'extrait coupé à une ligne ne montrerait qu'un mot.
const firstLine = (r) => {
  const txt = [r.title, r.body].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim();
  return txt || 'Avis sans texte';
};

// Coupe à une seule ligne (pas de classe dédiée dans mobile.css pour ça).
const EXCERPT = {
  display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
};

export default function ReviewsScreen({ rows, counts, filter, capped, max, error }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [active, setActive] = useState(null);     // avis ouvert dans la feuille
  const [del, setDel] = useState(null);           // avis dont on confirme la suppression
  const [busy, setBusy] = useState(false);

  // Regroupement par jour : les lignes arrivent déjà du plus récent au plus
  // ancien, un seul passage suffit. Les avis sans date restent ensemble à la fin.
  const groups = useMemo(() => {
    const out = [];
    for (const r of rows) {
      const key = r.at ? dayKeyOf(r.at) : '—';
      const last = out[out.length - 1];
      if (!last || last.key !== key) {
        out.push({ key, label: r.at ? dayLabelOf(r.at) : 'Sans date', items: [r] });
      } else last.items.push(r);
    }
    return out;
  }, [rows]);

  const go = (key) => {
    // « En attente » est l'écran par défaut : son adresse n'a pas de paramètre,
    // c'est celle qu'on garde dans un raccourci.
    const url = key === 'pending' ? '/mobile/reviews' : `/mobile/reviews?status=${key}`;
    start(() => router.push(url));
  };

  // Même mécanique que les écrans Produits et Demandes : on appelle la server
  // action, on annonce le résultat, on ferme la feuille et on recharge la page
  // serveur. Pas de mise à jour optimiste — un avis qui se publie puis se
  // rétracte est pire qu'une demi-seconde d'attente.
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.ok === false) { toast(res.error || 'Action impossible', 'bad'); return false; }
      toast(okMsg);
      setActive(null);
      start(() => router.refresh());
      return true;
    } catch (e) {
      toast(e?.message || 'Pas de réseau', 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SubTop
        title="Avis clients"
        subtitle={counts.pending > 0
          ? `${fmt(counts.pending)} en attente de publication`
          : `${fmt(counts.all)} avis · rien à modérer`}
        back="/mobile/plus"
        action={(
          <button
            className={`mb-icbtn ${pending ? 'spin' : ''}`}
            onClick={() => start(() => router.refresh())}
            aria-label="Rafraîchir"
          >
            <Icon name="refresh" size={18} />
          </button>
        )}
      />

      <div className="mb-wrap">
        <div className="mbl-seg" role="group" aria-label="Filtrer les avis">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => go(key)}>
              {label} {fmt(counts[key] ?? 0)}
            </button>
          ))}
        </div>

        {error && <Banner kind="bad">Les avis n’ont pas pu être chargés : {error}</Banner>}

        {capped && (
          <Banner kind="info">
            Les {fmt(max)} avis les plus récents sont affichés sur {fmt(counts[filter] ?? 0)}.
            Publiez ou supprimez ceux-ci : les suivants apparaîtront ensuite.
          </Banner>
        )}

        {rows.length === 0 ? (
          <Empty icon="star">
            {filter === 'pending'
              ? 'Aucun avis en attente : tout est modéré.'
              : filter === 'approved'
                ? 'Aucun avis publié pour l’instant.'
                : 'Aucun avis pour l’instant. Les avis déposés sur les fiches produits arrivent ici.'}
          </Empty>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="mb-daysep">{g.label}</div>
              <div className="mbl">
                {g.items.map((r) => (
                  <button type="button" className="mbl-row" key={r.id} onClick={() => setActive(r)}>
                    <span className="mbl-bd">
                      <span className="t">{r.author || 'Client anonyme'}</span>
                      <span className="s">
                        <b style={{ color: 'var(--warn)', letterSpacing: '.5px' }}>{stars(r.rating)}</b>
                        {r.product ? ` · ${r.product}` : ''}
                      </span>
                      <span className="s" style={EXCERPT}>{firstLine(r)}</span>
                      <span className="s" style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                        <span className={`mbl-tag ${r.approved ? 'ok' : 'warn'}`}>
                          {r.approved ? 'Publié' : 'En attente'}
                        </span>
                      </span>
                    </span>
                    {r.at && (
                      <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
                        {timeOf(r.at)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="mbf-pad" />
      </div>

      {/* --------------------------------------------------- avis complet -- */}
      <Sheet
        open={!!active}
        onClose={() => setActive(null)}
        title={active ? (active.author || 'Avis client') : ''}
      >
        {active && (
          <>
            <div style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 650, color: 'var(--ink-2)' }}>
              <div>
                <b style={{ color: 'var(--warn)', letterSpacing: '.5px' }}>{stars(active.rating)}</b>
                {' '}
                <span className={`mbl-tag ${active.approved ? 'ok' : 'warn'}`}>
                  {active.approved ? 'Publié' : 'En attente'}
                </span>
              </div>
              {active.product && <div>Produit : <span style={{ color: 'var(--muted)' }}>{active.product}</span></div>}
              {active.at && (
                <div style={{ color: 'var(--muted)' }}>{dayLabelOf(active.at)}, {timeOf(active.at)}</div>
              )}
            </div>

            {active.title && (
              <p style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--ink)' }}>{active.title}</p>
            )}

            {/* pre-wrap : les paragraphes du client restent lisibles tels qu'il
                les a écrits. */}
            {active.body ? (
              <p style={{
                margin: 0, padding: 12, borderRadius: 13, background: 'var(--bg)',
                fontSize: 14, lineHeight: 1.6, fontWeight: 650, color: 'var(--ink)',
                whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}>
                {active.body}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: 'var(--muted)' }}>
                Cet avis n’a pas de texte : seule la note a été laissée.
              </p>
            )}

            <div className="mbp-acts">
              <Btn
                icon={active.approved ? 'eyeoff' : 'check'}
                variant={active.approved ? '' : 'primary'}
                disabled={busy}
                onClick={() => run(
                  () => setReviewApproved(active.id, !active.approved),
                  active.approved ? 'Avis retiré du site' : 'Avis publié sur le site',
                )}
              >
                {active.approved ? 'Retirer de la publication' : 'Publier cet avis'}
              </Btn>

              {/* La feuille se referme avant la confirmation : deux feuilles
                  empilées se ferment ensemble à la touche Échap, et on perdrait
                  la confirmation sans savoir laquelle a répondu. */}
              <Btn variant="danger" icon="trash" disabled={busy} onClick={() => { setDel(active); setActive(null); }}>
                Supprimer l’avis
              </Btn>
            </div>
          </>
        )}
      </Sheet>

      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        busy={busy}
        onConfirm={async () => {
          const ok = await run(() => deleteReview(del.id), 'Avis supprimé');
          if (ok) setDel(null);
        }}
        title="Supprimer cet avis ?"
        body={`L’avis de ${del?.author || 'ce client'} sera effacé définitivement. Pour le retirer du site sans le perdre, choisissez plutôt « Retirer de la publication ».`}
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}
