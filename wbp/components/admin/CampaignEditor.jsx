'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCampaign, sendTestCampaign, sendCampaign, deleteCampaign } from '@/app/admin/actions';

// Styles alignés sur le système de design du back-office (admin-modern.css).
const box = { border: '1px solid var(--line)', borderRadius: 12, background: '#fff', padding: 16, boxShadow: 'var(--shadow)' };
const field = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'inherit', color: 'var(--ink)' };
const lbl = { display: 'block', fontSize: 12.5, fontWeight: 550, color: 'var(--ink-2)', margin: '0 0 6px' };

// Client-side approximation of the server email template (for live preview only).
function previewHtml({ subject, preheader, body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head>
  <body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#16120E">
  <div style="display:none">${escapeHtml(preheader || '')}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 10px"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #ece8e2;border-radius:16px;overflow:hidden">
      <tr><td style="padding:20px 26px;border-bottom:1px solid #ece8e2">
        <img src="/logos/wbp.png" width="30" height="30" alt="WBP" style="vertical-align:middle;border-radius:6px">
        <span style="font-weight:bold;font-size:15px;vertical-align:middle;padding:0 8px">World Business Plus</span>
      </td></tr>
      <tr><td style="padding:26px;font-size:15px;line-height:1.6">${body || '<p style="color:#9a9087">(corps de l’e-mail vide — saisissez du HTML à gauche)</p>'}</td></tr>
      <tr><td style="padding:18px 26px;border-top:1px solid #ece8e2;background:#faf8f5;font-size:12px;color:#6E655C">
        Vous recevez cet e-mail car vous êtes inscrit à la newsletter de World Business Plus.<br>
        <a href="#" style="color:#6E655C">Se désinscrire</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export default function CampaignEditor({ campaign, stats, emailLive }) {
  const router = useRouter();
  const [subject, setSubject] = useState(campaign.subject || '');
  const [preheader, setPreheader] = useState(campaign.preheader || '');
  const [body, setBody] = useState(campaign.body_html || '');
  const [testEmail, setTestEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const sent = campaign.status === 'sent';

  const preview = useMemo(() => previewHtml({ subject, preheader, body }), [subject, preheader, body]);
  const flash = (text, tone = 'ok') => { setMsg({ text, tone }); setTimeout(() => setMsg(null), 6000); };

  // Chaque action : bouton occupé le temps de l'appel, et toujours libéré —
  // même si le réseau coupe (sans le `finally`, le bouton restait grisé).
  const FAIL = 'Pas de réseau ou serveur indisponible — réessayez.';
  const dirty = subject !== (campaign.subject || '') || preheader !== (campaign.preheader || '') || body !== (campaign.body_html || '');
  const persist = async () => {
    const r = await updateCampaign(campaign.id, { subject, preheader, body_html: body });
    if (!r?.ok) throw new Error(r?.error || 'Enregistrement impossible.');
    return r;
  };
  const guarded = async (name, fn) => {
    if (busy) return;
    setBusy(name);
    try { await fn(); } catch (e) { flash(e?.message && e.message !== 'Failed to fetch' ? e.message : FAIL, 'err'); } finally { setBusy(''); }
  };

  const save = () => guarded('save', async () => { await persist(); flash('Enregistré ✓'); router.refresh(); });
  const test = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) return flash('Adresse de test invalide', 'err');
    return guarded('test', async () => {
      if (!sent) await persist();
      const r = await sendTestCampaign(campaign.id, testEmail.trim());
      if (r?.ok) flash(r.dev ? 'Test « envoyé » (mode dev : voir .email-outbox / logs)' : 'E-mail de test envoyé ✓');
      else flash(r?.error || 'Échec de l’envoi', 'err');
    });
  };
  const sendAll = () => {
    if (!subject.trim() || !body.trim()) return flash('Renseignez l’objet et le corps avant d’envoyer.', 'err');
    if (!confirm(`Envoyer cette campagne à tous les abonnés confirmés (${stats.audience}) ? Cette action est définitive.`)) return undefined;
    return guarded('send', async () => {
      await persist();
      const r = await sendCampaign(campaign.id);
      if (r?.ok) { flash(`Envoyée : ${r.sent} ok${r.failed ? `, ${r.failed} échec(s)` : ''}.`); router.refresh(); }
      else flash(r?.error || 'Échec', 'err');
    });
  };
  const remove = () => {
    if (!confirm('Supprimer cette campagne ? Ses statistiques seront perdues.')) return undefined;
    return guarded('remove', async () => {
      const r = await deleteCampaign(campaign.id);
      if (r && r.ok === false) throw new Error(r.error || 'Suppression impossible.');
      router.push('/admin/campaigns');
    });
  };

  // Prévenir avant de quitter la page avec un brouillon non enregistré.
  React.useEffect(() => {
    if (!dirty || sent) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, sent]);

  const openRate = stats.sent ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const clickRate = stats.sent ? Math.round((stats.clicked / stats.sent) * 100) : 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="adm-h1">{subject || 'Campagne'}</h1>
          <p className="adm-sub">{sent ? `Envoyée le ${(campaign.sent_at || '').slice(0, 10)}` : 'Brouillon'} · audience {stats.audience} abonné(s)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!sent && <button className="adm-btn" onClick={save} disabled={!!busy}>{busy === 'save' ? '…' : dirty ? 'Enregistrer •' : 'Enregistrer'}</button>}
          <button className="adm-btn danger" onClick={remove} disabled={!!busy}>{busy === 'remove' ? '…' : 'Supprimer'}</button>
        </div>
      </div>

      {!emailLive && (
        <div style={{ ...box, background: '#fff7ed', borderColor: 'rgba(255,159,28,.4)', margin: '14px 0', fontSize: 13, color: '#92560a' }}>
          Mode dev : aucune clé <code>RESEND_API_KEY</code> détectée. Les envois écrivent le HTML dans <code>.email-outbox/</code> (et les logs) au lieu d’envoyer réellement.
        </div>
      )}
      {msg && <div style={{ ...box, margin: '12px 0', borderColor: msg.tone === 'err' ? 'rgba(229,72,77,.5)' : 'rgba(31,157,85,.5)', color: msg.tone === 'err' ? '#c0392b' : '#1f8a4c', fontWeight: 600 }}>{msg.text}</div>}

      {sent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, margin: '12px 0' }}>
          {[['Envoyés', stats.sent], ['Ouvertures', `${stats.opened} (${openRate}%)`], ['Clics', `${stats.clicked} (${clickRate}%)`], ['Audience', stats.audience]].map(([k, v]) => (
            <div key={k} style={{ ...box, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div className="adm-muted" style={{ fontSize: 12 }}>{k}</div></div>
          ))}
        </div>
      )}

      <div className="cmp-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Objet</label>
            <input style={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet de l’e-mail" disabled={sent} />
          </div>
          <div>
            <label style={lbl}>Pré-en-tête (aperçu)</label>
            <input style={field} value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Texte affiché après l’objet dans la boîte de réception" disabled={sent} />
          </div>
          <div>
            <label style={lbl}>Corps (HTML)</label>
            <textarea style={{ ...field, minHeight: 280, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="<h1>Bonjour</h1><p>Découvrez nos nouveautés…</p>" disabled={sent} />
          </div>
          <div style={{ ...box }}>
            <label style={lbl}>Envoi de test</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ ...field, flex: '1 1 200px' }} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="vous@exemple.dz" type="email" />
              <button className="adm-btn" onClick={test} disabled={!!busy}>{busy === 'test' ? '…' : 'Envoyer un test'}</button>
            </div>
          </div>
          {!sent && (
            <button className="adm-btn primary" style={{ height: 48, fontSize: 15 }} onClick={sendAll} disabled={!!busy || !stats.audience}>
              {busy === 'send' ? 'Envoi en cours…' : `Envoyer à tous les abonnés (${stats.audience})`}
            </button>
          )}
        </div>

        <div>
          <label style={lbl}>Aperçu</label>
          <iframe title="preview" srcDoc={preview} sandbox="allow-popups allow-popups-to-escape-sandbox" style={{ width: '100%', height: 560, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel-2)' }} />
        </div>
      </div>

      <style>{`@media(max-width:900px){.cmp-grid{grid-template-columns:1fr !important}}`}</style>
    </>
  );
}
