'use client';
// ============================================================================
// /admin/ai — brancher l'assistant du site sur votre plateforme IA.
// ----------------------------------------------------------------------------
// Deux modes :
//   • « Ma plateforme IA » (d-tech-ai / messaging-ai) : URL + clé du widget.
//     Le site parle à sa propre route /api/chat, qui relaie vers la plateforme.
//     La clé ne quitte jamais le serveur.
//   • « Assistant catalogue » : réponses construites à partir du catalogue WBP,
//     sans service externe. C'est aussi le filet de sécurité automatique si la
//     plateforme ne répond pas.
// Le bouton « Tester la connexion » envoie un vrai message et affiche la
// réponse (ou la raison exacte de l'échec) avant d'enregistrer quoi que ce soit.
// ============================================================================
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAiConfig, testAiConnection } from '@/app/admin/actions';

const lines = (v) => (Array.isArray(v) ? v.join('\n') : String(v || ''));

export default function AiSettingsManager({ config, siteUrl }) {
  const router = useRouter();
  const [f, setF] = useState({
    enabled: config?.enabled ?? true,
    provider: config?.provider || 'builtin',
    base_url: config?.base_url || '',
    widget_key: config?.widget_key || '',
    assistant: config?.assistant || 'Assistant WBP',
    accent: config?.accent || '#FF5A1F',
    greeting_fr: config?.greeting?.fr || '', greeting_en: config?.greeting?.en || '', greeting_ar: config?.greeting?.ar || '',
    suggestions_fr: lines(config?.suggestions?.fr), suggestions_en: lines(config?.suggestions?.en), suggestions_ar: lines(config?.suggestions?.ar),
  });
  const [msg, setMsg] = useState(null);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((p) => ({ ...p, [k]: v }));
    setMsg(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await saveAiConfig(f);
      setMsg(res?.ok ? { kind: 'ok', text: 'Configuration enregistrée ✓ Rechargez le site pour voir le chat.' }
        : { kind: 'err', text: res?.error || 'Erreur.' });
      if (res?.ok) router.refresh();
    } finally { setBusy(false); }
  };

  const runTest = async () => {
    setTesting(true); setTest(null);
    try {
      const r = await testAiConnection({ base_url: f.base_url, widget_key: f.widget_key });
      setTest(r);
    } finally { setTesting(false); }
  };

  const isPlatform = f.provider === 'dtech';

  return (
    <form onSubmit={save}>
      {/* ---- Mode ---- */}
      <div className="adm-panel">
        <div className="adm-panel-hd"><h2>Mode de l’assistant</h2></div>
        <div className="adm-panel-bd">
          <div className="ai-modes">
            <label className={`ai-mode ${isPlatform ? 'on' : ''}`}>
              <input type="radio" name="provider" value="dtech" checked={isPlatform} onChange={set('provider')} />
              <b>Ma plateforme IA</b>
              <small>d-tech-ai / messaging-ai. Le site relaie les messages vers votre plateforme : mémoire des conversations, reprise par un conseiller, WhatsApp et Instagram au même endroit.</small>
            </label>
            <label className={`ai-mode ${f.provider === 'builtin' ? 'on' : ''}`}>
              <input type="radio" name="provider" value="builtin" checked={f.provider === 'builtin'} onChange={set('provider')} />
              <b>Assistant catalogue (sans service externe)</b>
              <small>Répond à partir de vos produits, marques et catégories, propose les bonnes références et renvoie vers le devis. Fonctionne immédiatement, aucun abonnement.</small>
            </label>
          </div>

          <label className="adm-switch" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={f.enabled} onChange={set('enabled')} />
            <span className="adm-switch-track" aria-hidden="true"><span className="adm-switch-knob" /></span>
            <span className="adm-switch-txt">
              <b>Afficher le chat sur le site</b>
              <small>Décochez pour retirer complètement la bulle de chat des pages publiques.</small>
            </span>
          </label>
        </div>
      </div>

      {/* ---- Connexion plateforme ---- */}
      {isPlatform && (
        <div className="adm-panel">
          <div className="adm-panel-hd">
            <h2>Connexion à votre plateforme</h2>
            <span className="muted">La clé reste côté serveur</span>
          </div>
          <div className="adm-panel-bd">
            <div className="adm-grid2">
              <label>URL de la plateforme *
                <input value={f.base_url} onChange={set('base_url')} placeholder="https://app.messaging-ai.com" spellCheck={false} />
              </label>
              <label>Clé publique du widget *
                <span className="ai-keyrow">
                  <input value={f.widget_key} onChange={set('widget_key')} placeholder="wgt_pk_…"
                    type={showKey ? 'text' : 'password'} spellCheck={false} autoComplete="off" />
                  <button type="button" className="adm-btn sm" onClick={() => setShowKey((v) => !v)}>
                    {showKey ? 'Masquer' : 'Afficher'}
                  </button>
                </span>
              </label>
            </div>

            <div className="ai-help">
              <b>Où trouver ces deux valeurs ?</b>
              <ol>
                <li>Ouvrez votre plateforme <em>d-tech-ai</em> et connectez-vous.</li>
                <li>Allez dans <em>Canaux → Widget site web</em> et activez le canal.</li>
                <li>Copiez la clé publique (<code>wgt_pk_…</code>) et l’adresse de la plateforme.</li>
              </ol>
              <p>
                Le site appelle <code>{siteUrl || 'https://votre-site'}/api/chat</code>, qui relaie vers
                <code> {(f.base_url || 'https://…').replace(/\/+$/, '')}/api/widget/messages</code>.
                Ce relais est nécessaire : le widget de la plateforme utilise des chemins relatifs et ne
                fonctionnerait pas depuis un autre domaine.
              </p>
            </div>

            <div className="adm-actions" style={{ marginTop: 14 }}>
              <button type="button" className="adm-btn" onClick={runTest} disabled={testing || !f.base_url || !f.widget_key}>
                {testing ? 'Test en cours…' : 'Tester la connexion'}
              </button>
              {test && (
                <span className={`adm-flash ${test.ok ? 'ok' : 'err'}`}>
                  {test.ok ? `Connexion réussie ✓ ${test.reply ? `Réponse : « ${test.reply.slice(0, 120)} »` : ''}` : test.error}
                </span>
              )}
            </div>

            <div className="ai-note">
              Si la plateforme ne répond pas, le site bascule automatiquement sur l’assistant
              catalogue : le visiteur reçoit toujours une réponse utile plutôt qu’un message d’erreur.
            </div>
          </div>
        </div>
      )}

      {/* ---- Apparence & textes ---- */}
      <div className="adm-panel">
        <div className="adm-panel-hd"><h2>Apparence & premiers mots</h2></div>
        <div className="adm-panel-bd">
          <div className="adm-grid2">
            <label>Nom affiché dans le chat
              <input value={f.assistant} onChange={set('assistant')} placeholder="Assistant WBP" />
            </label>
            <label>Couleur d’accent
              <span className="adm-colorrow">
                <input type="color" value={f.accent} onChange={set('accent')} />
                <input value={f.accent} onChange={set('accent')} style={{ maxWidth: 130 }} />
              </span>
            </label>
          </div>

          <label>Message d’accueil FR
            <textarea rows={3} value={f.greeting_fr} onChange={set('greeting_fr')}
              placeholder="Bonjour 👋 Dites-moi ce que vous cherchez…" />
          </label>
          <div className="adm-grid2">
            <label>Accueil EN<textarea rows={3} value={f.greeting_en} onChange={set('greeting_en')} /></label>
            <label>Accueil AR<textarea rows={3} value={f.greeting_ar} onChange={set('greeting_ar')} dir="rtl" /></label>
          </div>

          <div className="adm-grid3">
            <label>Suggestions FR <small className="adm-muted">une par ligne</small>
              <textarea rows={4} value={f.suggestions_fr} onChange={set('suggestions_fr')}
                placeholder={'Quelles caméras pour un entrepôt ?\nKit alarme pour un bureau'} />
            </label>
            <label>Suggestions EN<textarea rows={4} value={f.suggestions_en} onChange={set('suggestions_en')} /></label>
            <label>Suggestions AR<textarea rows={4} value={f.suggestions_ar} onChange={set('suggestions_ar')} dir="rtl" /></label>
          </div>
        </div>
      </div>

      <div className="adm-actions adm-sticky-actions">
        <button className="adm-btn primary" type="submit" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer la configuration'}
        </button>
        {msg && <span className={`adm-flash ${msg.kind}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
