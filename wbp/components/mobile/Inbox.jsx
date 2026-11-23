'use client';
import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '@/styles/mobile-inbox.css';
import { TopBar, useMobile } from '@/components/mobile/MobileApp';
import PushCta from '@/components/mobile/PushCta';
import { Icon, fmt } from '@/components/mobile/ui';
import { Banner, Btn, Confirm, Empty, SearchBar, Sheet, TextInput, useToast } from '@/components/mobile/form';
import { agoOf, dayKeyOf, dayLabelOf, timeOf } from '@/components/mobile/store';
import { deleteMessage, deleteQuote } from '@/app/admin/actions';
import {
  setLeadStatus, assignItem, saveNotes, convertQuoteToOrder, createOrderFromMessage,
} from '@/app/admin/crm-actions';
import {
  QUOTE_STATUSES, MESSAGE_STATUSES, quoteStatus, messageStatus, orderStatus,
  isQuoteTodo, isMessageTodo, isOrderTodo, deliveryLabel,
} from '@/lib/crm';
import { telOf, waLink } from '@/lib/phone';
import { dzd } from '@/lib/pricing';

// ============================================================================
// Demandes : commandes, devis et messages de contact dans une seule liste.
// ----------------------------------------------------------------------------
// Ce composant ne détient AUCUNE donnée : la page serveur lui passe les trois
// tables déjà normalisées, et toute écriture repasse par les server actions du
// back-office (elles revérifient la session, filtrent par site, écrivent
// l'historique et le journal). Ici : l'affichage, le filtre, la recherche.
//
// Une commande s'ouvre dans son propre écran (/mobile/orders/[id]) : il y a
// trop à faire (prix, appels, statut, paiement) pour une feuille. Un devis ou
// un message s'ouvre dans une feuille du bas : le geste utile est « rappeler,
// noter, changer le statut ».
//
// `canEdit` faux (propriétaire) : tout est visible, les contacts marchent,
// rien ne s'écrit.
// ============================================================================

const FILTERS = [
  ['all', 'Tout'],
  ['todo', 'À traiter'],
  ['order', 'Commandes'],
  ['quote', 'Devis'],
  ['message', 'Messages'],
];

const statusOf = (r) => (r.kind === 'order' ? orderStatus(r.status)
  : r.kind === 'quote' ? quoteStatus(r.status) : messageStatus(r.status));
const isTodo = (r) => (r.kind === 'order' ? isOrderTodo(r.status)
  : r.kind === 'quote' ? isQuoteTodo(r.status) : isMessageTodo(r.status));

const KIND = {
  order: { icon: 'truck', cls: 'order', label: 'Commande' },
  quote: { icon: 'cart', cls: 'quote', label: 'Demande de devis' },
  message: { icon: 'mail', cls: 'msg', label: 'Message de contact' },
};

// Recherche tolérante : sans accents, et les chiffres d'un téléphone se
// retrouvent quelle que soit la façon dont il a été tapé (« 0770 12 34 56 »).
const fold = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hayOf = (r) => `${fold([r.name, r.company, r.email, r.phone, r.number, r.subject, r.body, r.place].join(' '))} ${String(r.phone || '').replace(/\D/g, '')}`;

const mailtoOf = (r) => {
  const subject = r.kind === 'quote'
    ? `Votre demande de devis${r.number ? ` ${r.number}` : ''}`
    : r.kind === 'order'
      ? `Votre commande${r.number ? ` ${r.number}` : ''}`
      : (r.subject ? `Re : ${r.subject}` : 'Votre message');
  return `mailto:${String(r.email).trim()}?subject=${encodeURIComponent(subject)}`;
};

// Premier message WhatsApp prérempli : le client sait tout de suite qui écrit
// et pourquoi — sans cela, un numéro inconnu est souvent ignoré.
const waTextOf = (r) => {
  const hello = r.name ? `Bonjour ${r.name.split(' ')[0]},` : 'Bonjour,';
  if (r.kind === 'quote') return `${hello} ici World Business Plus, au sujet de votre demande de devis${r.number ? ` ${r.number}` : ''}.`;
  if (r.kind === 'order') return `${hello} ici World Business Plus, au sujet de votre commande${r.number ? ` ${r.number}` : ''}.`;
  return `${hello} ici World Business Plus, suite à votre message${r.subject ? ` « ${r.subject} »` : ''}.`;
};

const excerptOf = (r) => {
  if (r.kind === 'order') {
    const n = r.items.length;
    return [r.number, n ? `${n} article${n > 1 ? 's' : ''}` : 'Aucun article', r.place || deliveryLabel(r.delivery)]
      .filter(Boolean).join(' · ');
  }
  const txt = [r.kind === 'quote' ? r.number : r.subject, r.body].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim();
  return txt || 'Sans message';
};

const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

export default function Inbox({ rows, error, open, filter: startFilter, team = [], me, canEdit, migrated = true }) {
  const router = useRouter();
  const toast = useToast();
  const { counts, reloadFeed } = useMobile();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState(startFilter || 'all');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(null);   // demande ouverte dans la feuille
  const [note, setNote] = useState('');
  const [del, setDel] = useState(null);         // demande dont on confirme la suppression
  const [busy, setBusy] = useState(false);

  const names = useMemo(() => Object.fromEntries(team.map((t) => [String(t.email).toLowerCase(), t.name])), [team]);
  const nameOf = (email) => (email ? (String(email).toLowerCase() === me ? 'vous' : names[String(email).toLowerCase()] || email) : null);

  const refresh = () => start(() => router.refresh());

  // --- arrivée par une notification : ?open=quote:<id> ----------------------
  useEffect(() => {
    if (!open) return;
    const [kind, id] = open.split(':');
    const r = rows.find((x) => x.kind === kind && x.id === id);
    if (r) { setActive(r); setNote(r.notes || ''); } else toast('Demande introuvable — elle a peut-être été supprimée.', 'bad');
    // On retire le paramètre : un rafraîchissement ne doit pas rouvrir la fiche.
    router.replace('/mobile/inbox', { scroll: false });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (startFilter) setFilter(startFilter); }, [startFilter]);

  // La liste se met à jour quand une notification arrive, au retour au premier
  // plan, et quand les compteurs « à traiter » changent (sondage de la coquille).
  useEffect(() => {
    let last = Date.now();
    const onMsg = (e) => { if (e?.data?.type === 'wbp-push') refresh(); };
    const onVis = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 15000) return;
      last = Date.now();
      refresh();
    };
    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', onMsg);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevTotal = useRef(null);
  useEffect(() => {
    const t = counts?.total;
    if (t == null) return;
    if (prevTotal.current != null && t !== prevTotal.current) refresh();
    prevTotal.current = t;
  }, [counts?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  // La feuille ouverte suit la version fraîche de sa ligne après un refresh.
  useEffect(() => {
    if (!active) return;
    const fresh = rows.find((x) => x.kind === active.kind && x.id === active.id);
    if (fresh) setActive(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const hays = useMemo(() => new Map(rows.map((r) => [`${r.kind}:${r.id}`, hayOf(r)])), [rows]);
  const todo = useMemo(() => rows.filter(isTodo).length, [rows]);
  const byKind = useMemo(() => rows.reduce((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc; }, {}), [rows]);

  const shown = useMemo(() => {
    const term = fold(q.trim());
    const digits = q.replace(/\D/g, '').replace(/^0+/, '');
    return rows.filter((r) => {
      if (filter === 'todo' ? !isTodo(r) : filter !== 'all' && r.kind !== filter) return false;
      if (!term) return true;
      const h = hays.get(`${r.kind}:${r.id}`) || '';
      return h.includes(term) || (digits.length >= 3 && h.includes(digits));
    });
  }, [rows, filter, q, hays]);

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

  // Toutes les écritures : server action → message → rafraîchissement. La
  // feuille reste ouverte (on enchaîne souvent « je m'en occupe », une note
  // et un statut) et reçoit la version à jour de la ligne.
  const run = async (fn, okMsg, patch) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.ok === false) { toast(res.error || 'Action impossible', 'bad'); return null; }
      if (okMsg) toast(okMsg);
      if (patch) setActive((a) => (a ? { ...a, ...patch } : a));
      refresh();
      reloadFeed?.();
      return res || { ok: true };
    } catch (e) {
      toast(e?.message || 'Pas de réseau', 'bad');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openRow = (r) => { setActive(r); setNote(r.notes || ''); };

  const setStatus = (r, next) => {
    if (next === r.status) return;
    const label = statusOf({ ...r, status: next }).label;
    return run(() => setLeadStatus(r.kind, r.id, next), `Statut : ${label}`, { status: next });
  };

  const takeIt = (r, mode) => run(() => assignItem(r.kind, r.id, mode),
    mode === 'me' ? 'C’est noté : vous vous en occupez' : 'Prise en charge retirée',
    { assigned: mode === 'me' ? me : null });

  const toOrder = async (r) => {
    const res = await run(
      () => (r.kind === 'quote' ? convertQuoteToOrder(r.id, { status: 'pending' }) : createOrderFromMessage(r.id)),
      null,
    );
    if (!res?.id) return;
    toast(res.existing ? `Déjà convertie : ${res.number || 'commande'}` : `Commande ${res.number || ''} créée`.trim());
    setActive(null);
    router.push(`/mobile/orders/${res.id}${res.existing ? '' : '?created=1'}`);
  };

  const a = active;
  const aStatus = a ? statusOf(a) : null;
  const tel = a ? telOf(a.phone) : null;
  const wa = a ? waLink(a.phone, waTextOf(a)) : null;
  const statuses = a?.kind === 'quote' ? QUOTE_STATUSES : MESSAGE_STATUSES;
  const noteDirty = !!a && (note || '') !== (a.notes || '');

  const subtitle = `${fmt(rows.length)} demande${rows.length > 1 ? 's' : ''}${todo ? ` · ${fmt(todo)} à traiter` : ''}`;

  return (
    <>
      <TopBar title="Demandes" subtitle={subtitle} onRefresh={refresh} busy={pending} />

      <div className="mb-wrap">
        <PushCta />

        {!canEdit && (
          <div className="mb-ro"><Icon name="eye" size={16} /> Consultation : pour modifier une demande, utilisez le back-office sur ordinateur.</div>
        )}
        {canEdit && !migrated && (
          <Banner kind="warn">Les commandes ne sont pas encore activées : la base doit être mise à jour (fichier supabase/commandes-notifications.sql).</Banner>
        )}

        <SearchBar value={q} onChange={setQ} placeholder="Nom, téléphone, n° de commande…" />

        <div className="mbl-seg" role="group" aria-label="Filtrer">
          {FILTERS.filter(([key]) => key !== 'order' || migrated || byKind.order).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
              {label}
              {key === 'todo' && todo > 0 && <span className="mbi-count">{todo > 99 ? '99+' : todo}</span>}
            </button>
          ))}
        </div>

        {error && <Banner kind="bad">Les demandes n’ont pas pu être chargées : {error}</Banner>}

        {shown.length === 0 ? (
          <Empty icon="inbox">
            {q.trim()
              ? `Aucun résultat pour « ${q.trim()} ».`
              : filter === 'todo'
                ? 'Rien à traiter : toutes les demandes ont été prises en charge.'
                : filter === 'order'
                  ? 'Aucune commande pour l’instant. Les commandes passées sur le site arrivent ici.'
                  : filter === 'quote'
                    ? 'Aucune demande de devis pour l’instant.'
                    : filter === 'message'
                      ? 'Aucun message de contact pour l’instant.'
                      : 'Aucune demande pour l’instant. Commandes, devis et messages du site arrivent ici.'}
          </Empty>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="mb-daysep">{g.label}</div>
              <div className="mbl">
                {g.items.map((r) => {
                  const st = statusOf(r);
                  const k = KIND[r.kind];
                  const inner = (
                    <>
                      <span className={`mbi-ic ${k.cls}`}>
                        <Icon name={k.icon} size={19} />
                      </span>
                      <span className="mbl-bd">
                        <span className="t">{r.name || r.company || 'Sans nom'}{r.name && r.company ? ` · ${r.company}` : ''}</span>
                        <span className="mbi-ex">{excerptOf(r)}</span>
                        <span className="mbi-tags">
                          <span className={`mbl-tag ${st.tone}`}>{st.label}</span>
                          {r.kind === 'quote' && r.items.length > 0 && (
                            <span className="mbl-tag info">{r.items.length} article{r.items.length > 1 ? 's' : ''}</span>
                          )}
                          {r.kind === 'order' && r.calls > 0 && (
                            <span className="mbl-tag off">{r.calls} appel{r.calls > 1 ? 's' : ''}</span>
                          )}
                          {r.order && <span className="mbl-tag ok">→ {r.order.number || 'commande'}</span>}
                          {r.assigned && <span className="mbl-tag off">{nameOf(r.assigned) === 'vous' ? 'Vous' : nameOf(r.assigned)}</span>}
                        </span>
                      </span>
                      <span className="mbi-side">
                        <span className="mbi-hr">{timeOf(r.at)}</span>
                        {r.kind === 'order' && Number(r.total) > 0 && <span className="mbi-amt">{dzd(r.total)}</span>}
                      </span>
                    </>
                  );
                  return r.kind === 'order' ? (
                    <Link key={`${r.kind}-${r.id}`} href={`/mobile/orders/${r.id}`} className="mbl-row">{inner}</Link>
                  ) : (
                    <button type="button" className="mbl-row" key={`${r.kind}-${r.id}`} onClick={() => openRow(r)}>{inner}</button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="mbf-pad" />
      </div>

      {/* ------------------------------------------- fiche d'un devis / message -- */}
      <Sheet open={!!a} onClose={() => setActive(null)} title={a ? (a.name || a.company || 'Demande') : ''}>
        {a && (
          <>
            <div className="mbi-meta">
              <div>
                {KIND[a.kind].label}{a.number ? ` ${a.number}` : ''}{' '}
                <span className={`mbl-tag ${aStatus.tone}`}>{aStatus.label}</span>
              </div>
              <div><span>{dayLabelOf(a.at)}, {timeOf(a.at)} · {agoOf(a.at)}</span></div>
              {a.company && a.name && <div>{a.company}</div>}
              {a.email && <div><span>{a.email}</span></div>}
              {a.phone && <div><span>{a.phone}</span></div>}
            </div>

            {a.subject && (
              <div>
                <p className="mbi-lbl">Sujet</p>
                <p className="mbi-sub">{a.subject}</p>
              </div>
            )}

            {a.body
              ? <p className="mbi-body">{a.body}</p>
              : <p className="mbi-lbl">Aucun message joint.</p>}

            {a.items.length > 0 && (
              <div>
                <p className="mbi-lbl">{a.items.length} article{a.items.length > 1 ? 's' : ''} demandé{a.items.length > 1 ? 's' : ''}</p>
                <ul className="mbi-items">
                  {a.items.map((it, i) => (
                    <li key={i}>
                      <b>{it.qty}×</b>{' '}{it.code || '—'}{it.name && it.name !== it.code ? ` — ${it.name}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contacter : des liens, pas des actions serveur — le téléphone
                ouvre le composeur, WhatsApp ou le client de mail. */}
            <div className="mbi-acts">
              {(tel || wa) && (
                <div className="mbi-two">
                  {tel && <a className="mbf-btn" href={`tel:${tel}`}><Icon name="phone" size={18} /> Appeler</a>}
                  {wa && <a className="mbf-btn wa" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={18} /> WhatsApp</a>}
                </div>
              )}
              {a.email && <a className="mbf-btn" href={mailtoOf(a)}><Icon name="mail" size={18} /> E-mail</a>}
            </div>

            {/* Devis déjà transformé : on mène à la commande, sans doublon. */}
            {a.order && (
              <Link className="mbf-btn primary" href={`/mobile/orders/${a.order.id}`} style={{ textDecoration: 'none' }}>
                <Icon name="truck" size={18} /> Voir la commande {a.order.number || ''}
              </Link>
            )}

            {canEdit ? (
              <>
                {/* Prise en charge : évite que deux personnes rappellent le
                    même client, ou qu'aucune ne le fasse. */}
                <div className="mbi-who">
                  <span className="av">{a.assigned ? initialOf(nameOf(a.assigned) === 'vous' ? names[me] : nameOf(a.assigned)) : <Icon name="hand" size={15} />}</span>
                  <span className="bd">
                    {a.assigned ? (nameOf(a.assigned) === 'vous' ? 'Vous vous en occupez' : `Pris en charge par ${nameOf(a.assigned)}`) : 'Personne ne s’en occupe encore'}
                    <small>{a.assigned ? 'Les collègues le voient dans la liste.' : 'Signalez-le à l’équipe avant d’appeler.'}</small>
                  </span>
                  {a.assigned === me
                    ? <button type="button" className="mbf-btn sm" disabled={busy} onClick={() => takeIt(a, 'none')}>Libérer</button>
                    : <button type="button" className="mbf-btn sm primary" disabled={busy} onClick={() => takeIt(a, 'me')}>Je m’en occupe</button>}
                </div>

                <div>
                  <p className="mbi-lbl">Statut</p>
                  <div className="mbf-options">
                    {statuses.map((st) => (
                      <button
                        type="button"
                        key={st.value}
                        className={`mbf-option ${st.value === a.status ? 'on' : ''}`}
                        disabled={busy}
                        onClick={() => setStatus(a, st.value)}
                      >
                        <span className="bd"><b>{st.label}</b><small>{st.hint}</small></span>
                        {st.value === a.status && <Icon name="check" size={19} />}
                      </button>
                    ))}
                  </div>
                </div>

                {migrated && (
                  <div>
                    <TextInput
                      label="Note interne"
                      hint="Visible seulement par l’équipe : rappel prévu, prix annoncé, besoin exact…"
                      value={note}
                      onChange={setNote}
                      multiline
                      rows={3}
                      maxLength={4000}
                    />
                    {noteDirty && (
                      <div className="mbi-two" style={{ marginTop: 8 }}>
                        <Btn variant="ghost" disabled={busy} onClick={() => setNote(a.notes || '')}>Annuler</Btn>
                        <Btn variant="primary" disabled={busy} onClick={() => run(() => saveNotes(a.kind, a.id, note), 'Note enregistrée', { notes: note || null })}>
                          Enregistrer la note
                        </Btn>
                      </div>
                    )}
                  </div>
                )}

                {migrated && !a.order && (
                  <Btn icon="truck" disabled={busy} onClick={() => toOrder(a)}>
                    {a.kind === 'quote' ? 'Transformer en commande' : 'Créer une commande'}
                  </Btn>
                )}

                {/* La feuille se referme avant la confirmation : deux feuilles
                    empilées se ferment ensemble à la touche Échap. */}
                <Btn variant="danger" icon="trash" disabled={busy} onClick={() => { setDel(a); setActive(null); }}>
                  Supprimer
                </Btn>
              </>
            ) : (
              <>
                {a.assigned && <div className="mbi-who"><span className="av">{initialOf(nameOf(a.assigned))}</span><span className="bd">Pris en charge par {nameOf(a.assigned)}</span></div>}
                {a.notes && (
                  <div>
                    <p className="mbi-lbl">Note interne</p>
                    <p className="mbi-note-ro">{a.notes}</p>
                  </div>
                )}
              </>
            )}
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
          ? `La demande de ${del?.name || 'ce client'}, ses articles et ses coordonnées seront effacés définitivement. Pour la ranger sans la perdre, choisissez plutôt le statut « Clôturé » ou « Perdu ».`
          : `Le message de ${del?.name || 'ce contact'} et ses coordonnées seront effacés définitivement. Pour le ranger sans le perdre, choisissez plutôt le statut « Clôturé ».`}
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}
