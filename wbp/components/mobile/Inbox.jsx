'use client';
import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import '@/styles/mobile-inbox.css';
import { TopBar } from '@/components/mobile/MobileApp';
import { Icon, fmt } from '@/components/mobile/ui';
import { Banner, Btn, Confirm, Empty, Sheet, useToast } from '@/components/mobile/form';
import { agoOf, dayKeyOf, dayLabelOf, timeOf } from '@/components/mobile/store';
import { deleteMessage, deleteQuote, updateMessageStatus, updateQuoteStatus } from '@/app/admin/actions';

// ============================================================================
// Demandes : devis et messages de contact dans une seule liste.
// ----------------------------------------------------------------------------
// Ce composant ne détient AUCUNE donnée : la page serveur lui passe les deux
// tables déjà normalisées, et toute écriture repasse par les server actions du
// back-office (elles revérifient la session, filtrent par site et écrivent le
// journal). Ici, rien d'autre que l'affichage et le filtre.
//
// Le filtre est local, contrairement à l'écran Produits : à 200 lignes, un
// aller-retour vers la base pour passer de « Tout » à « À traiter » serait une
// demi-seconde d'attente pour un tri que le téléphone fait instantanément.
//
// Ce que cet écran sert vraiment à faire : rappeler quelqu'un. Le numéro arrive
// tel que le client l'a tapé (« 0559 53 36 98 », « +213 559... ») ; WhatsApp,
// lui, n'accepte qu'un numéro international sans signe. D'où waOf() plus bas,
// qui est la partie la plus utile — et la plus facile à rater — du fichier.
// ============================================================================

const FILTERS = [
  ['all', 'Tout'],
  ['quote', 'Devis'],
  ['message', 'Messages'],
  ['todo', 'À traiter'],
];

// Statuts EXACTEMENT ceux du back-office web (components/admin/controls.jsx) :
// les deux écrans écrivent dans la même colonne, un libellé inventé ici
// afficherait un statut que /admin ne saurait pas relire.
const STATUS = {
  quote: [
    ['new', 'Nouveau', 'warn'],
    ['contacted', 'Contacté', 'info'],
    ['quoted', 'Devis envoyé', 'ok'],
    ['closed', 'Clôturé', 'off'],
  ],
  message: [
    ['new', 'Nouveau', 'warn'],
    ['read', 'Lu', 'info'],
    ['replied', 'Répondu', 'ok'],
    ['closed', 'Clôturé', 'off'],
  ],
};

// `new` est la valeur par défaut de la colonne en base ; on accepte aussi une
// ligne sans statut (import, ancien enregistrement) et la variante française,
// sinon une demande jamais traitée disparaîtrait de l'onglet « À traiter ».
const TODO = new Set(['new', 'nouveau', '']);
const isTodo = (r) => TODO.has(String(r.status || '').toLowerCase());

const labelOf = (r) => {
  const found = (STATUS[r.kind] || []).find(([v]) => v === r.status);
  return found || [r.status || 'new', r.status || 'Nouveau', 'off'];
};

// Numéro pour le composeur : on garde le « + » international, on jette le reste
// (espaces, points, parenthèses) que certains dialers refusent.
const telOf = (phone) => {
  const t = String(phone || '').replace(/[^\d+]/g, '');
  return t.replace(/\+/g, '').length >= 6 ? t : null;
};

// ----------------------------------------------------------------------------
// Numéro WhatsApp : international, chiffres seuls, sans « + ».
//   « 0559 53 36 98 »  → 213559533698   (0 local remplacé par l'indicatif)
//   « +213 559533698 » → 213559533698   (déjà international, on ne double pas)
//   « 00213559533698 » → 213559533698   (composé depuis un fixe)
//   « 559533698 »      → 213559533698   (0 oublié à la saisie)
// Un numéro étranger (+33..., +971...) est laissé tel quel : lui coller 213
// ouvrirait une conversation avec un inconnu.
// ----------------------------------------------------------------------------
function waOf(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('213')) {
    if (d.startsWith('0')) d = `213${d.slice(1)}`;
    else if (d.length === 9) d = `213${d}`;
  }
  return d.length >= 10 && d.length <= 15 ? d : null;
}

const mailtoOf = (r) => {
  const subject = r.kind === 'quote'
    ? 'Votre demande de devis'
    : (r.subject ? `Re : ${r.subject}` : 'Votre message');
  return `mailto:${String(r.email).trim()}?subject=${encodeURIComponent(subject)}`;
};

// Extrait d'une ligne : les retours à la ligne du client deviennent des
// espaces, sinon la ligne coupée à une ligne ne montrerait qu'un mot.
const excerptOf = (r) => {
  const txt = [r.subject, r.body].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim();
  return txt || 'Sans message';
};

export default function Inbox({ rows, error }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState('all');
  const [active, setActive] = useState(null);   // demande ouverte dans la feuille
  const [del, setDel] = useState(null);         // demande dont on confirme la suppression
  const [busy, setBusy] = useState(false);

  const todo = useMemo(() => rows.filter(isTodo).length, [rows]);

  const shown = useMemo(() => rows.filter((r) => (
    filter === 'todo' ? isTodo(r) : filter === 'all' ? true : r.kind === filter
  )), [rows, filter]);

  // Regroupement par jour : les lignes arrivent déjà triées du plus récent au
  // plus ancien, un seul passage suffit.
  const groups = useMemo(() => {
    const out = [];
    for (const r of shown) {
      const key = dayKeyOf(r.at);
      const last = out[out.length - 1];
      if (!last || last.key !== key) out.push({ key, label: dayLabelOf(r.at), items: [r] });
      else last.items.push(r);
    }
    return out;
  }, [shown]);

  // Même mécanique que l'écran Produits : on appelle la server action, on
  // annonce le résultat, on ferme la feuille et on recharge la page serveur.
  // Pas de mise à jour optimiste — un statut qui s'affiche puis se rétracte est
  // plus déroutant qu'une demi-seconde d'attente.
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

  const setStatus = (r, next) => {
    if (next === r.status) { setActive(null); return; }   // rien à écrire
    const fn = r.kind === 'quote' ? updateQuoteStatus : updateMessageStatus;
    const label = (STATUS[r.kind].find(([v]) => v === next) || ['', next])[1];
    return run(() => fn(r.id, next), `Statut : ${label}`);
  };

  const tel = active ? telOf(active.phone) : null;
  const wa = active ? waOf(active.phone) : null;

  return (
    <>
      <TopBar
        title="Demandes"
        subtitle={`${fmt(rows.length)} demande${rows.length > 1 ? 's' : ''}${todo ? ` · ${fmt(todo)} à traiter` : ''}`}
        onRefresh={() => start(() => router.refresh())}
        busy={pending}
      />

      <div className="mb-wrap">
        <div className="mbl-seg" role="group" aria-label="Filtrer">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        {error && <Banner kind="bad">Les demandes n’ont pas pu être chargées : {error}</Banner>}

        {shown.length === 0 ? (
          <Empty icon="inbox">
            {filter === 'todo'
              ? 'Rien à traiter : toutes les demandes ont été prises en charge.'
              : filter === 'quote'
                ? 'Aucune demande de devis pour l’instant.'
                : filter === 'message'
                  ? 'Aucun message de contact pour l’instant.'
                  : 'Aucune demande pour l’instant. Les devis et messages du site arrivent ici.'}
          </Empty>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="mb-daysep">{g.label}</div>
              <div className="mbl">
                {g.items.map((r) => {
                  const [, label, tone] = labelOf(r);
                  return (
                    <button
                      type="button"
                      className="mbl-row"
                      key={`${r.kind}-${r.id}`}
                      onClick={() => setActive(r)}
                    >
                      <span className={`mbi-ic ${r.kind === 'quote' ? 'quote' : 'msg'}`}>
                        <Icon name={r.kind === 'quote' ? 'cart' : 'mail'} size={19} />
                      </span>
                      <span className="mbl-bd">
                        <span className="t">{r.name || 'Sans nom'}{r.company ? ` · ${r.company}` : ''}</span>
                        <span className="mbi-ex">{excerptOf(r)}</span>
                        <span className="mbi-tags">
                          <span className={`mbl-tag ${tone}`}>{label}</span>
                          {r.items.length > 0 && (
                            <span className="mbl-tag info">{r.items.length} article{r.items.length > 1 ? 's' : ''}</span>
                          )}
                        </span>
                      </span>
                      <span className="mbi-hr">{timeOf(r.at)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="mbf-pad" />
      </div>

      {/* ------------------------------------------------------- fiche complète -- */}
      <Sheet
        open={!!active}
        onClose={() => setActive(null)}
        title={active ? (active.name || 'Demande') : ''}
      >
        {active && (
          <>
            <div className="mbi-meta">
              <div>
                {active.kind === 'quote' ? 'Demande de devis' : 'Message de contact'}{' '}
                <span className={`mbl-tag ${labelOf(active)[2]}`}>{labelOf(active)[1]}</span>
              </div>
              <div><span>{dayLabelOf(active.at)}, {timeOf(active.at)} · {agoOf(active.at)}</span></div>
              {active.company && <div>{active.company}</div>}
              {active.email && <div><span>{active.email}</span></div>}
              {active.phone && <div><span>{active.phone}</span></div>}
            </div>

            {active.subject && (
              <div>
                <p className="mbi-lbl">Sujet</p>
                <p className="mbi-sub">{active.subject}</p>
              </div>
            )}

            {active.body
              ? <p className="mbi-body">{active.body}</p>
              : <p className="mbi-lbl">Aucun message joint.</p>}

            {active.items.length > 0 && (
              <div>
                <p className="mbi-lbl">{active.items.length} article{active.items.length > 1 ? 's' : ''} demandé{active.items.length > 1 ? 's' : ''}</p>
                <ul className="mbi-items">
                  {active.items.map((it, i) => (
                    <li key={i}>
                      <b>{it.qty}×</b>{' '}{it.code || '—'}{it.name && it.name !== it.code ? ` — ${it.name}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contacter : ce sont des liens, pas des actions serveur — le
                téléphone ouvre le composeur, WhatsApp ou le client de mail. */}
            <div className="mbi-acts">
              {(tel || wa) && (
                <div className="mbi-two">
                  {tel && (
                    <a className="mbf-btn" href={`tel:${tel}`}>
                      <Icon name="phone" size={18} /> Appeler
                    </a>
                  )}
                  {wa && (
                    <a className="mbf-btn wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
                      <Icon name="whatsapp" size={18} /> WhatsApp
                    </a>
                  )}
                </div>
              )}
              {active.email && (
                <a className="mbf-btn" href={mailtoOf(active)}>
                  <Icon name="mail" size={18} /> E-mail
                </a>
              )}
            </div>

            <div>
              <p className="mbi-lbl">Statut</p>
              <div className="mbf-options">
                {STATUS[active.kind].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`mbf-option ${value === active.status ? 'on' : ''}`}
                    disabled={busy}
                    onClick={() => setStatus(active, value)}
                  >
                    <span className="bd"><b>{label}</b></span>
                    {value === active.status && <Icon name="check" size={19} />}
                  </button>
                ))}
              </div>
            </div>

            {/* La feuille se referme avant la confirmation : deux feuilles
                empilées se ferment ensemble à la touche Échap, et on perdrait
                la confirmation sans savoir laquelle a répondu. */}
            <Btn variant="danger" icon="trash" disabled={busy} onClick={() => { setDel(active); setActive(null); }}>
              Supprimer
            </Btn>
          </>
        )}
      </Sheet>

      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        busy={busy}
        onConfirm={async () => {
          const fn = del.kind === 'quote' ? deleteQuote : deleteMessage;
          const ok = await run(() => fn(del.id), del.kind === 'quote' ? 'Demande supprimée' : 'Message supprimé');
          if (ok) setDel(null);
        }}
        title={del?.kind === 'quote' ? 'Supprimer cette demande ?' : 'Supprimer ce message ?'}
        body={del?.kind === 'quote'
          ? `La demande de ${del?.name || 'ce client'}, ses articles et ses coordonnées seront effacés définitivement. Pour la ranger sans la perdre, choisissez plutôt le statut « Clôturé ».`
          : `Le message de ${del?.name || 'ce contact'} et ses coordonnées seront effacés définitivement. Pour le ranger sans le perdre, choisissez plutôt le statut « Clôturé ».`}
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}
