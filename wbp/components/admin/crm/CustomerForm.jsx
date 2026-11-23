'use client';
// ============================================================================
// Fiche client : coordonnées modifiables, identifiants fiscaux (imprimés sur
// les documents), notes internes, fusion de deux fiches, suppression.
// ============================================================================
import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { CustomerPicker } from '@/components/admin/crm/LinesEditor';
import { saveCustomer, deleteCustomer, mergeCustomers } from '@/app/admin/crm-actions';
import { CUSTOMER_KINDS } from '@/lib/crm';
import { WILAYAS } from '@/lib/wilayas';

const FAIL = 'Action impossible — session expirée ? Rechargez la page.';
const FIELDS = ['name', 'company', 'phone', 'phone2', 'email', 'wilaya', 'city', 'address', 'kind', 'nif', 'nis', 'rc', 'art', 'notes'];
const pick = (c) => Object.fromEntries(FIELDS.map((k) => [k, c?.[k] || '']));

export default function CustomerForm({ customer = null }) {
  const router = useRouter();
  const isNew = !customer;
  const [f, setF] = useState(() => pick(customer));
  const [base, setBase] = useState(() => JSON.stringify(pick(customer)));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [conflictId, setConflictId] = useState(null);
  const [ok, setOk] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [, start] = useTransition();
  const dirty = JSON.stringify(f) !== base;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setErr(''); setConflictId(null); setBusy('save');
    try {
      const r = await saveCustomer({ id: customer?.id, ...f });
      if (!r?.ok) { setErr(r?.error || FAIL); setConflictId(r?.conflictId || null); return; }
      if (isNew) { router.push(`/admin/customers/${r.id}`); return; }
      setBase(JSON.stringify(f)); setOk('Fiche enregistrée ✓'); setTimeout(() => setOk(''), 3000);
      start(() => router.refresh());
    } catch { setErr(FAIL); } finally { setBusy(''); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && (
        <div className="crm-err" role="alert"><Icon name="alert" size={16} />
          <span>{err}{conflictId && <> <Link href={`/admin/customers/${conflictId}`}>Ouvrir l’autre fiche</Link></>}</span>
        </div>
      )}
      {ok && <div className="crm-ok"><Icon name="check" size={16} /><span>{ok}</span></div>}

      <section className="crm-card">
        <div className="hd"><h2>Coordonnées</h2></div>
        <div className="bd">
          <div className="crm-row2">
            <label className="crm-f"><span>Société / institution</span><input value={f.company} onChange={set('company')} /></label>
            <label className="crm-f"><span>Interlocuteur</span><input value={f.name} onChange={set('name')} /></label>
          </div>
          <div className="crm-row3">
            <label className="crm-f"><span>Téléphone</span><input value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
            <label className="crm-f"><span>Second téléphone</span><input value={f.phone2} onChange={set('phone2')} inputMode="tel" /></label>
            <label className="crm-f"><span>E-mail</span><input value={f.email} onChange={set('email')} type="email" /></label>
          </div>
          <div className="crm-row3">
            <label className="crm-f"><span>Type de client</span>
              <select value={f.kind} onChange={set('kind')}>
                <option value="">—</option>
                {CUSTOMER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className="crm-f"><span>Wilaya</span><input value={f.wilaya} onChange={set('wilaya')} list="crm-wilayas-c" /></label>
            <label className="crm-f"><span>Commune / ville</span><input value={f.city} onChange={set('city')} /></label>
          </div>
          <datalist id="crm-wilayas-c">{WILAYAS.map((w) => <option key={w} value={w} />)}</datalist>
          <label className="crm-f"><span>Adresse</span><input value={f.address} onChange={set('address')} /></label>
        </div>
      </section>

      <section className="crm-card">
        <div className="hd"><h2>Identifiants (imprimés sur les documents)</h2></div>
        <div className="bd">
          <div className="crm-row2">
            <label className="crm-f"><span>NIF</span><input value={f.nif} onChange={set('nif')} /></label>
            <label className="crm-f"><span>NIS</span><input value={f.nis} onChange={set('nis')} /></label>
          </div>
          <div className="crm-row2">
            <label className="crm-f"><span>Registre du commerce (RC)</span><input value={f.rc} onChange={set('rc')} /></label>
            <label className="crm-f"><span>Article d’imposition (AI)</span><input value={f.art} onChange={set('art')} /></label>
          </div>
        </div>
      </section>

      <section className="crm-card">
        <div className="hd"><h2>Notes internes</h2><span className="muted">Jamais visibles par le client</span></div>
        <div className="bd">
          <label className="crm-f"><textarea rows={5} value={f.notes} onChange={set('notes')} placeholder="Conditions négociées, interlocuteurs, habitudes de commande…" /></label>
        </div>
      </section>

      {(dirty || isNew) && (
        <div className="crm-savebar">
          <span>{isNew ? 'Nouvelle fiche — pas encore enregistrée' : 'Modifications non enregistrées'}</span>
          <div className="adm-actions">
            {!isNew && <button type="button" className="adm-btn" onClick={() => setF(JSON.parse(base))} disabled={!!busy}>Annuler</button>}
            <button type="button" className="adm-btn primary" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Enregistrement…' : isNew ? 'Créer la fiche' : 'Enregistrer'}</button>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="adm-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="adm-btn" onClick={() => setMergeOpen(true)} disabled={!!busy}><Icon name="merge" size={15} /> Fusionner avec une autre fiche…</button>
          <button type="button" className="adm-btn danger" disabled={!!busy}
            onClick={async () => {
              if (!window.confirm('Supprimer cette fiche client ?\n\nSes commandes, devis et messages sont conservés (ils perdent seulement le lien vers la fiche).')) return;
              setBusy('delete');
              try {
                const r = await deleteCustomer(customer.id);
                if (!r?.ok) { setErr(r?.error || FAIL); return; }
                router.push('/admin/customers'); router.refresh();
              } catch { setErr(FAIL); } finally { setBusy(''); }
            }}>
            <Icon name="trash" size={15} /> Supprimer la fiche
          </button>
        </div>
      )}

      {mergeOpen && (
        <div className="crm-modal-scrim" onClick={() => !busy && setMergeOpen(false)}>
          <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Fusionner deux fiches" onClick={(e) => e.stopPropagation()}>
            <h3>Fusionner deux fiches du même client</h3>
            <p>Choisissez la fiche à <b>garder</b>. Les commandes, devis et messages de cette fiche-ci y seront déplacés, ses champs vides complétés et ses notes ajoutées. Cette fiche-ci sera ensuite supprimée.</p>
            {target ? (
              <div className="crm-ok"><Icon name="user" size={16} /><span>Garder : <b>{target.company || target.name}</b> {target.phone ? `· ${target.phone}` : ''}</span></div>
            ) : (
              <CustomerPicker onPick={(c) => { if (c.id !== customer.id) setTarget(c); }} placeholder="Rechercher la fiche à garder…" />
            )}
            <div className="acts">
              <button type="button" className="adm-btn" onClick={() => { setMergeOpen(false); setTarget(null); }} disabled={!!busy}>Annuler</button>
              <button type="button" className="adm-btn primary" disabled={!target || !!busy}
                onClick={async () => {
                  setBusy('merge'); setErr('');
                  try {
                    const r = await mergeCustomers(customer.id, target.id);
                    if (!r?.ok) { setErr(r?.error || FAIL); setMergeOpen(false); return; }
                    router.push(`/admin/customers/${target.id}`); router.refresh();
                  } catch { setErr(FAIL); } finally { setBusy(''); }
                }}>
                {busy === 'merge' ? 'Fusion…' : 'Fusionner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
