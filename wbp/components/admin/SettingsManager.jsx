'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSetting, addClient, deleteClient } from '@/app/admin/actions';
import ImageUpload from '@/components/admin/ImageUpload';

const lineList = (v) => (Array.isArray(v) ? v.join('\n') : String(v || ''));
const toLines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4);

function Saver({ label, onSave }) {
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="adm-actions" style={{ marginTop: 14 }}>
      <button className="adm-btn primary" disabled={busy} onClick={async () => { setBusy(true); const r = await onSave(); setBusy(false); setMsg(r?.ok ? 'Enregistré ✓' : (r?.error || 'Erreur')); setTimeout(() => setMsg(''), 2500); }}>
        {busy ? '…' : (label || 'Enregistrer')}
      </button>
      {msg && <span className="adm-muted" style={{ alignSelf: 'center' }}>{msg}</span>}
    </div>
  );
}

export default function SettingsManager({ settings, clients }) {
  const router = useRouter();
  const [wa, setWa] = useState(settings.whatsapp || '');
  const [c, setC] = useState({
    email: settings.contact?.email || '', fax: settings.contact?.fax || '',
    phones: (settings.contact?.phones || []).join(', '),
    addr_fr: settings.contact?.address?.fr || '', addr_en: settings.contact?.address?.en || '', addr_ar: settings.contact?.address?.ar || '',
  });
  const [hero, setHero] = useState({
    fr_t: settings.hero?.fr?.title || '', fr_s: settings.hero?.fr?.sub || '',
    en_t: settings.hero?.en?.title || '', en_s: settings.hero?.en?.sub || '',
    ar_t: settings.hero?.ar?.title || '', ar_s: settings.hero?.ar?.sub || '',
  });
  // Pop-up newsletter affiché à l'ouverture du site.
  const P = settings.popup || {};
  const [pop, setPop] = useState({
    enabled: P.enabled !== false,
    delay: Math.round((Number(P.delay) || 2200) / 100) / 10,   // en secondes, pour l'admin
    days: Number(P.days ?? 7),
    image_url: P.image_url || '',
    title_fr: P.title?.fr || '', title_en: P.title?.en || '', title_ar: P.title?.ar || '',
    sub_fr: P.sub?.fr || '', sub_en: P.sub?.en || '', sub_ar: P.sub?.ar || '',
    cta_fr: P.cta?.fr || '', cta_en: P.cta?.en || '', cta_ar: P.cta?.ar || '',
    perks_fr: lineList(P.perks?.fr), perks_en: lineList(P.perks?.en), perks_ar: lineList(P.perks?.ar),
  });
  const setP = (k) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setPop((s) => ({ ...s, [k]: v }));
  };

  const [newClient, setNewClient] = useState('');
  const refresh = () => router.refresh();

  return (
    <>
      <div className="adm-card-form" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>WhatsApp & contact</h2>
        <div className="adm-form">
          <div className="adm-grid2">
            <label>Numéro WhatsApp (format international, sans +)<input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="213559533698" /></label>
            <label>E-mail<input value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></label>
          </div>
          <div className="adm-grid2">
            <label>Téléphones (séparés par des virgules)<input value={c.phones} onChange={(e) => setC({ ...c, phones: e.target.value })} /></label>
            <label>Ligne fax/tél<input value={c.fax} onChange={(e) => setC({ ...c, fax: e.target.value })} /></label>
          </div>
          <label>Adresse (FR)<input value={c.addr_fr} onChange={(e) => setC({ ...c, addr_fr: e.target.value })} /></label>
          <div className="adm-grid2">
            <label>Adresse (EN)<input value={c.addr_en} onChange={(e) => setC({ ...c, addr_en: e.target.value })} /></label>
            <label>Adresse (AR)<input value={c.addr_ar} onChange={(e) => setC({ ...c, addr_ar: e.target.value })} dir="rtl" /></label>
          </div>
        </div>
        <Saver onSave={async () => {
          const r1 = await saveSetting('whatsapp', wa.trim());
          const r2 = await saveSetting('contact', {
            email: c.email.trim(), fax: c.fax.trim(),
            phones: c.phones.split(',').map((x) => x.trim()).filter(Boolean),
            address: { fr: c.addr_fr, en: c.addr_en, ar: c.addr_ar },
          });
          refresh(); return r1.ok && r2.ok ? { ok: true } : { ok: false, error: r1.error || r2.error };
        }} />
      </div>

      <div className="adm-card-form" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Bandeau d’accueil (laisser vide = texte par défaut)</h2>
        <div className="adm-form">
          {[['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']].map(([l, lbl]) => (
            <div className="adm-grid2" key={l}>
              <label>Titre {lbl}<input value={hero[l + '_t']} onChange={(e) => setHero({ ...hero, [l + '_t']: e.target.value })} dir={l === 'ar' ? 'rtl' : 'ltr'} /></label>
              <label>Sous-titre {lbl}<input value={hero[l + '_s']} onChange={(e) => setHero({ ...hero, [l + '_s']: e.target.value })} dir={l === 'ar' ? 'rtl' : 'ltr'} /></label>
            </div>
          ))}
        </div>
        <Saver onSave={async () => {
          const r = await saveSetting('hero', { fr: { title: hero.fr_t, sub: hero.fr_s }, en: { title: hero.en_t, sub: hero.en_s }, ar: { title: hero.ar_t, sub: hero.ar_s } });
          refresh(); return r;
        }} />
      </div>

      {/* ---------------- Pop-up newsletter ---------------- */}
      <div className="adm-card-form" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Pop-up newsletter (à l’ouverture du site)</h2>
        <p className="adm-sub" style={{ marginBottom: 14 }}>
          La carte s’affiche une seule fois par visiteur, puis se tait pendant le nombre de jours
          indiqué. Elle ne réapparaît jamais pour quelqu’un qui s’est inscrit.
        </p>

        <label className="adm-switch" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={pop.enabled} onChange={setP('enabled')} />
          <span className="adm-switch-track" aria-hidden="true"><span className="adm-switch-knob" /></span>
          <span className="adm-switch-txt">
            <b>Afficher le pop-up</b>
            <small>Décochez pour le désactiver complètement sans perdre vos textes.</small>
          </span>
        </label>

        <div className="adm-split">
          <div className="adm-split-main">
            <div className="adm-form">
              <div className="adm-grid2">
                <label>Délai avant affichage (secondes)
                  <input type="number" step="0.1" min="0.3" max="30" value={pop.delay} onChange={setP('delay')} />
                </label>
                <label>Ne pas réafficher pendant (jours)
                  <input type="number" min="0" max="365" value={pop.days} onChange={setP('days')} />
                </label>
              </div>
              <label>Titre FR<input value={pop.title_fr} onChange={setP('title_fr')} placeholder="Rejoignez la newsletter WBP" /></label>
              <div className="adm-grid2">
                <label>Titre EN<input value={pop.title_en} onChange={setP('title_en')} /></label>
                <label>Titre AR<input value={pop.title_ar} onChange={setP('title_ar')} dir="rtl" /></label>
              </div>
              <label>Texte FR<textarea rows={2} value={pop.sub_fr} onChange={setP('sub_fr')} /></label>
              <div className="adm-grid2">
                <label>Texte EN<textarea rows={2} value={pop.sub_en} onChange={setP('sub_en')} /></label>
                <label>Texte AR<textarea rows={2} value={pop.sub_ar} onChange={setP('sub_ar')} dir="rtl" /></label>
              </div>
              <div className="adm-grid3">
                <label>Bouton FR<input value={pop.cta_fr} onChange={setP('cta_fr')} placeholder="Je m’inscris" /></label>
                <label>Bouton EN<input value={pop.cta_en} onChange={setP('cta_en')} /></label>
                <label>Bouton AR<input value={pop.cta_ar} onChange={setP('cta_ar')} dir="rtl" /></label>
              </div>
              <div className="adm-grid3">
                <label>Avantages FR <small className="adm-muted">un par ligne, 3 max</small>
                  <textarea rows={3} value={pop.perks_fr} onChange={setP('perks_fr')} />
                </label>
                <label>Avantages EN<textarea rows={3} value={pop.perks_en} onChange={setP('perks_en')} /></label>
                <label>Avantages AR<textarea rows={3} value={pop.perks_ar} onChange={setP('perks_ar')} dir="rtl" /></label>
              </div>
            </div>
          </div>
          <div className="adm-split-side">
            <ImageUpload value={pop.image_url} onChange={(url) => setPop((s) => ({ ...s, image_url: url }))}
              folder="popup" name="popup-newsletter" label="Visuel du pop-up"
              hint="Optionnel — sinon un dégradé animé avec votre logo" aspect="3 / 4" />
          </div>
        </div>

        <Saver onSave={async () => {
          const r = await saveSetting('popup', {
            enabled: !!pop.enabled,
            delay: Math.max(300, Math.round(Number(pop.delay) * 1000) || 2200),
            days: Math.max(0, parseInt(pop.days, 10) || 0),
            image_url: pop.image_url || null,
            title: { fr: pop.title_fr, en: pop.title_en, ar: pop.title_ar },
            sub: { fr: pop.sub_fr, en: pop.sub_en, ar: pop.sub_ar },
            cta: { fr: pop.cta_fr, en: pop.cta_en, ar: pop.cta_ar },
            perks: { fr: toLines(pop.perks_fr), en: toLines(pop.perks_en), ar: toLines(pop.perks_ar) },
          });
          refresh(); return r;
        }} />
      </div>

      <div className="adm-card-form">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Clients / références ({clients.length})</h2>
        <div className="adm-actions" style={{ marginBottom: 12 }}>
          <input className="adm-form" style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 11, minWidth: 240 }} value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Nom du client" />
          <button className="adm-btn primary" onClick={async () => { if (!newClient.trim()) return; await addClient(newClient.trim()); setNewClient(''); refresh(); }}>Ajouter</button>
        </div>
        <div className="adm-actions">
          {clients.map((cl) => (
            <span key={cl.id} className="adm-tag blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 12px' }}>
              {cl.name}
              <button className="adm-btn sm danger" style={{ padding: '1px 7px' }} onClick={async () => { await deleteClient(cl.id); refresh(); }}>×</button>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
