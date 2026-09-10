'use client';
import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logSignInAction } from '@/app/admin/actions';
import { Icon } from '@/components/mobile/ui';

// Mêmes traductions que le back-office web : l'équipe commerciale ne doit
// jamais lire un message d'erreur Supabase en anglais.
function humanError(msg = '') {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Ce compte n’est pas encore confirmé.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Patientez une minute.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Pas de connexion. Vérifiez le réseau du téléphone.';
  return msg || 'Une erreur est survenue. Réessayez.';
}

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !password) { setErr('Renseignez votre e-mail et votre mot de passe.'); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setErr(humanError(error.message)); setBusy(false); return; }

      // Le serveur confirme que le compte est administrateur et journalise la
      // connexion. Sans ce contrôle, un compte valide mais absent
      // d'ADMIN_EMAILS entrait dans l'app pour n'y trouver que des écrans
      // vides : les routes /api/mobile/* lui répondent 403.
      let verdict = null;
      try { verdict = await logSignInAction(); } catch { /* journal indisponible */ }
      if (verdict && verdict.ok === false && verdict.reason === 'not_admin') {
        setErr('Ce compte n’est pas autorisé. Demandez à l’administrateur d’ajouter votre adresse.');
        try { await supabase.auth.signOut(); } catch { /* déjà fermé */ }
        setBusy(false);
        return;
      }

      onSignedIn?.(data?.session ?? null);
    } catch (e2) {
      setErr(humanError(e2?.message));
      setBusy(false);
    }
  };

  return (
    <form className="mb-login" onSubmit={submit}>
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app-icon-192.png" alt="" width={78} height={78} />
        <h1>WBP</h1>
        <p>Espace équipe — World Business Plus</p>
      </div>

      {err && <div className="mb-err" role="alert">{err}</div>}

      <div className="mb-field">
        <label htmlFor="mb-email">Adresse e-mail</label>
        <input
          id="mb-email" className="mb-input" type="email" inputMode="email"
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@wbp-dz.com"
        />
      </div>

      <div className="mb-field">
        <label htmlFor="mb-pw">Mot de passe</label>
        <div className="mb-pw">
          <input
            id="mb-pw" className="mb-input" type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          />
          <button type="button" onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
            <Icon name={show ? 'eyeoff' : 'eye'} size={20} />
          </button>
        </div>
      </div>

      <button className="mb-btn" type="submit" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#8A90A8', fontWeight: 650, margin: 0 }}>
        Mot de passe oublié ? Demandez-le à l’administrateur du site.
      </p>
    </form>
  );
}
