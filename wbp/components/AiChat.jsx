'use client';
// ============================================================================
// Assistant WBP — chat flottant, aux couleurs du site.
// ----------------------------------------------------------------------------
//  • bouton lanceur animé (pastille « 1 » au premier passage) en bas de page
//  • panneau : dégradé de marque, avatar, réponse en streaming caractère par
//    caractère, suggestions cliquables, cartes produit cliquables
//  • parle à /api/chat (proxy serveur) : la plateforme IA et sa clé restent
//    invisibles pour le navigateur
//  • relève les réponses d'un conseiller humain via /api/chat/poll
//  • bascule vers WhatsApp / devis en un clic, RTL complet, plein écran mobile
// ============================================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/components/ctx';
import { Icon } from '@/components/primitives';

const SKEY = 'wbp_chat_sid';
const OPENED = 'wbp_chat_seen';

function sessionId() {
  try {
    let v = localStorage.getItem(SKEY);
    if (!v) { v = 'w' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem(SKEY, v); }
    return v;
  } catch { return 'w' + Math.random().toString(36).slice(2, 12); }
}

const LBL = {
  fr: { title: 'Assistant', online: 'En ligne · réponse immédiate', ph: 'Écrivez votre question…', send: 'Envoyer', restart: 'Nouvelle conversation', quote: 'Demander un devis', wa: 'WhatsApp', err: 'Connexion interrompue. Réessayez ou écrivez-nous sur WhatsApp.', rate: 'Vous envoyez des messages un peu vite. Patientez un instant avant de réessayer.', human: 'Un conseiller a rejoint la conversation', ai_note: 'Réponses générées automatiquement — un ingénieur vérifie chaque devis.' },
  en: { title: 'Assistant', online: 'Online · instant reply', ph: 'Type your question…', send: 'Send', restart: 'New conversation', quote: 'Request a quote', wa: 'WhatsApp', err: 'Connection interrupted. Try again or reach us on WhatsApp.', rate: 'You are sending messages a bit fast. Please wait a moment before trying again.', human: 'An advisor joined the conversation', ai_note: 'Answers are generated automatically — an engineer checks every quote.' },
  ar: { title: 'المساعد', online: 'متصل · رد فوري', ph: 'اكتب سؤالك…', send: 'إرسال', restart: 'محادثة جديدة', quote: 'طلب عرض سعر', wa: 'واتساب', err: 'انقطع الاتصال. حاول مرة أخرى أو تواصل معنا على واتساب.', rate: 'أنت ترسل الرسائل بسرعة كبيرة. يرجى الانتظار قليلاً قبل المحاولة مجدداً.', human: 'انضم مستشار إلى المحادثة', ai_note: 'الردود تُولّد آلياً — يتحقق مهندس من كل عرض سعر.' },
};

export default function AiChat({ config }) {
  const { lang, dir, wbp, nav, t } = useApp();
  const L = LBL[lang] || LBL.fr;
  const enabled = config?.enabled !== false;

  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [human, setHuman] = useState(false);
  const scroller = useRef(null);
  const inputRef = useRef(null);
  const lastSeen = useRef(null);

  const greeting = (config?.greeting && (config.greeting[lang] || config.greeting.fr)) || '';
  const suggestions = (config?.suggestions && (config.suggestions[lang] || config.suggestions.fr)) || [];
  const accent = config?.accent || '#FF5A1F';

  // Pastille d'appel au premier passage, une seule fois par visiteur.
  useEffect(() => {
    if (!enabled) return;
    let seen = false;
    try { seen = !!localStorage.getItem(OPENED); } catch { /* mode privé */ }
    if (seen) return;
    const timer = setTimeout(() => setNudge(true), 9000);
    return () => clearTimeout(timer);
  }, [enabled]);

  // Message d'accueil injecté à la première ouverture.
  useEffect(() => {
    if (open && msgs.length === 0 && greeting) {
      setMsgs([{ role: 'assistant', text: greeting, id: 'greet' }]);
    }
    if (open) {
      setNudge(false);
      try { localStorage.setItem(OPENED, '1'); } catch { /* mode privé */ }
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 260);
    }
  }, [open, msgs.length, greeting]);

  // Auto-scroll en bas à chaque nouveau fragment.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  // Échap ferme le panneau.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(async (raw) => {
    const text = String(raw ?? draft).trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    const myId = 'u' + Date.now();
    setMsgs((m) => [...m, { role: 'user', text, id: myId }, { role: 'assistant', text: '', id: 'a' + Date.now(), streaming: true }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, lang, sessionId: sessionId(), conversationId }),
      });
      // 429 = trop de messages en une minute : message d'attente dédié.
      if (res.status === 429) throw new Error('rate_limited');
      if (!res.ok || !res.body) throw new Error(`http ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf('\n\n')) !== -1) {
          const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
          const d = line.split('\n').find((x) => x.startsWith('data: '));
          if (!d) continue;
          let ev; try { ev = JSON.parse(d.slice(6)); } catch { continue; }
          if (ev.type === 'delta' && ev.text) {
            acc += ev.text;
            setMsgs((m) => m.map((x, k) => (k === m.length - 1 ? { ...x, text: acc } : x)));
          } else if (ev.type === 'done') {
            if (ev.conversationId) { setConversationId(ev.conversationId); lastSeen.current = new Date().toISOString(); }
            setMsgs((m) => m.map((x, k) => (k === m.length - 1
              ? { ...x, text: acc || x.text, streaming: false, products: ev.products || [] } : x)));
          }
        }
      }
      setMsgs((m) => m.map((x, k) => (k === m.length - 1 ? { ...x, streaming: false, text: x.text || acc } : x)));
      if (!acc) throw new Error('empty');
    } catch (e) {
      const msg = e?.message === 'rate_limited' ? L.rate : L.err;
      setMsgs((m) => m.map((x, k) => (k === m.length - 1 ? { ...x, streaming: false, error: true, text: msg } : x)));
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    }
  }, [draft, busy, lang, conversationId, L.err, L.rate]);

  // Un conseiller humain peut reprendre la main : on interroge le serveur
  // pendant que le panneau est ouvert et qu'une conversation existe.
  useEffect(() => {
    if (!open || !conversationId) return;
    let stop = false;
    const tick = async () => {
      try {
        const p = new URLSearchParams({ conversationId, sessionId: sessionId() });
        if (lastSeen.current) p.set('since', lastSeen.current);
        const r = await fetch(`/api/chat/poll?${p}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (d?.supported === false) { stop = true; return; }
        if (Array.isArray(d.messages) && d.messages.length) {
          lastSeen.current = d.messages[d.messages.length - 1].at || new Date().toISOString();
          if (d.messages.some((m) => m.sender === 'HUMAN_AGENT')) setHuman(true);
          setMsgs((m) => [...m, ...d.messages.map((x) => ({
            role: 'assistant', text: x.text, id: 'p' + x.id, agent: x.sender === 'HUMAN_AGENT',
          }))]);
        }
      } catch { /* le prochain tick réessaiera */ }
    };
    const iv = setInterval(() => { if (!stop) tick(); }, 6000);
    return () => clearInterval(iv);
  }, [open, conversationId]);

  const restart = () => { setMsgs(greeting ? [{ role: 'assistant', text: greeting, id: 'greet' }] : []); setConversationId(null); setHuman(false); lastSeen.current = null; };

  if (!enabled) return null;

  return (
    <>
      {/* ---- Lanceur ---- */}
      <button className={`chat-fab ${open ? 'open' : ''}`} style={{ '--cac': accent }}
        onClick={() => setOpen((o) => !o)} aria-label={config?.assistant || L.title} aria-expanded={open}>
        <span className="chat-fab-ring" aria-hidden="true" />
        <span className="chat-fab-ic">
          {open ? <Icon name="close" size={22} /> : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.8-.8L4 21l1.6-4.2A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" />
              <path d="M9 11h.01M12.5 11h.01M16 11h.01" />
            </svg>
          )}
        </span>
        {!open && nudge && <span className="chat-fab-dot">1</span>}
      </button>

      {!open && nudge && (
        <button className="chat-nudge" onClick={() => setOpen(true)}>
          <b>{config?.assistant || L.title}</b>
          <span>{greeting ? greeting.replace(/^[^\p{L}]*/u, '').slice(0, 62) + '…' : L.online}</span>
        </button>
      )}

      {/* ---- Panneau ---- */}
      {open && (
        <div className="chat-panel" style={{ '--cac': accent }} role="dialog" aria-label={config?.assistant || L.title} dir={dir}>
          <header className="chat-hd">
            <span className="chat-av" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/wbp.png" alt="" width={26} height={26} />
              <i className="chat-av-live" />
            </span>
            <div className="chat-hd-t">
              <b>{config?.assistant || L.title}</b>
              <small>{human ? L.human : L.online}</small>
            </div>
            <button className="chat-hd-btn" onClick={restart} title={L.restart} aria-label={L.restart}>
              <Icon name="bolt" size={16} />
            </button>
            <button className="chat-hd-btn" onClick={() => setOpen(false)} aria-label="Fermer">
              <Icon name="close" size={17} />
            </button>
          </header>

          <div className="chat-body" ref={scroller}>
            {msgs.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role} ${m.error ? 'err' : ''} ${m.agent ? 'agent' : ''}`}>
                {m.role === 'assistant' && (
                  <span className="chat-msg-av" aria-hidden="true">
                    {m.agent ? <Icon name="headset" size={13} /> : <Icon name="bolt" size={13} />}
                  </span>
                )}
                <div className="chat-bub">
                  {m.text
                    ? m.text.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)
                    : <span className="chat-typing"><i /><i /><i /></span>}
                  {m.streaming && m.text && <span className="chat-caret" />}

                  {Array.isArray(m.products) && m.products.length > 0 && (
                    <div className="chat-cards">
                      {m.products.map((p) => (
                        <button key={p.id} className="chat-card" onClick={() => { nav('product', { id: p.id }); setOpen(false); }}>
                          {p.image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.image_url} alt="" loading="lazy" />
                            : <span className="chat-card-ph"><Icon name="box" size={15} /></span>}
                          <span className="chat-card-t"><b>{p.name}</b><small>{p.brand} · {p.code}</small></span>
                          <Icon name="chevright" size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {msgs.length <= 1 && suggestions.length > 0 && (
              <div className="chat-sugs">
                {suggestions.slice(0, 4).map((s, i) => (
                  <button key={i} style={{ '--d': `${i * 60}ms` }} onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <div className="chat-quick">
            <button onClick={() => { nav('contact'); setOpen(false); }}><Icon name="mail" size={14} /> {L.quote}</button>
            <a href={`https://wa.me/${wbp.WHATSAPP}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={15} /> {L.wa}</a>
            <button onClick={() => { nav('catalog'); setOpen(false); }}><Icon name="grid" size={14} /> {t('nav_catalog')}</button>
          </div>

          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={L.ph} aria-label={L.ph} maxLength={800} enterKeyHint="send" />
            <button type="submit" className="chat-send" disabled={busy || !draft.trim()} aria-label={L.send}>
              {busy ? <span className="chat-spin" /> : <Icon name="arrow" size={17} />}
            </button>
          </form>
          <p className="chat-note">{L.ai_note}</p>
        </div>
      )}
    </>
  );
}
