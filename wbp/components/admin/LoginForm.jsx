'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ICON_PATHS } from '@/lib/icons';

/* Petites icônes locales : l'espace admin ne charge pas les primitives du site
   public, on rend donc le SVG directement à partir de la même source de vérité. */
function I({ name, size = 18, ...rest }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }} {...rest} />
  );
}

/* Supabase renvoie des messages techniques en anglais. On les traduit en
   langage clair — c'est ce que voit l'équipe commerciale, pas un développeur. */
function humanError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return 'Cette adresse n’a pas encore été confirmée. Vérifiez votre boîte mail.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Patientez une minute avant de réessayer.';
  if (m.includes('user not found')) return 'Aucun compte ne correspond à cette adresse.';
  if (m.includes('should be at least')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Connexion au serveur impossible. Vérifiez votre réseau.';
  return msg || 'Une erreur est survenue. Réessayez.';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();

  // 'signin' → formulaire de connexion ; 'forgot' → demande de lien ;
  // 'reset'  → l'utilisateur est arrivé depuis le lien reçu par e-mail.
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [touched, setTouched] = useState({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  // Compte valide mais absent de ADMIN_EMAILS : le filtre d'accès renvoie ici
  // avec ?denied=1. Sans ce message, l'utilisateur bouclait sur la page de
  // connexion sans comprendre pourquoi.
  useEffect(() => {
    if (sp.get('denied')) {
      setErr('Ce compte n’est pas autorisé à accéder à l’administration. '
        + 'Demandez l’ajout de votre adresse à la liste des administrateurs.');
    }
  }, [sp]);

  // Lien de récupération : Supabase pose la session puis émet PASSWORD_RECOVERY.
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { setMode('reset'); setErr(''); setOk(''); }
    });
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) setMode('reset');
    return () => data?.subscription?.unsubscribe();
  }, []);

  const emailBad = touched.email && !EMAIL_RE.test(email.trim());
  const pwBad = touched.password && password.length > 0 && password.length < 6;
  const mismatch = mode === 'reset' && touched.password2 && password2 !== password;

  const onKeyGuard = useCallback((e) => {
    if (typeof e.getModifierState === 'function') setCaps(e.getModifierState('CapsLock'));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setOk('');

    if (mode === 'signin') {
      setTouched({ email: true, password: true });
      if (!EMAIL_RE.test(email.trim()) || password.length < 1) {
        setErr('Renseignez une adresse e-mail valide et votre mot de passe.');
        return;
      }
      setBusy(true);
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setErr(humanError(error.message)); setBusy(false); return; }
        router.push(sp.get('next') || '/admin');
        router.refresh();
      } catch (e2) { setErr(humanError(e2?.message)); setBusy(false); }
      return;
    }

    if (mode === 'forgot') {
      setTouched({ email: true });
      if (!EMAIL_RE.test(email.trim())) { setErr('Renseignez une adresse e-mail valide.'); return; }
      setBusy(true);
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/admin/login`,
        });
        if (error) { setErr(humanError(error.message)); setBusy(false); return; }
        setOk('Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.');
        setBusy(false);
      } catch (e2) { setErr(humanError(e2?.message)); setBusy(false); }
      return;
    }

    // mode === 'reset'
    setTouched({ password: true, password2: true });
    if (password.length < 6) { setErr('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (password !== password2) { setErr('Les deux mots de passe ne sont pas identiques.'); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setErr(humanError(error.message)); setBusy(false); return; }
      router.push(sp.get('next') || '/admin');
      router.refresh();
    } catch (e2) { setErr(humanError(e2?.message)); setBusy(false); }
  };

  const goto = (m) => { setMode(m); setErr(''); setOk(''); setTouched({}); setPassword(''); setPassword2(''); };

  const title = mode === 'signin' ? 'Connexion' : mode === 'forgot' ? 'Mot de passe oublié' : 'Nouveau mot de passe';
  const sub = mode === 'signin'
    ? 'Accédez au tableau de bord World Business Plus.'
    : mode === 'forgot'
      ? 'Indiquez votre e-mail : nous vous envoyons un lien sécurisé.'
      : 'Choisissez un mot de passe pour sécuriser votre compte.';

  return (
    <form className="lg-card" onSubmit={submit} noValidate>
      <div className="lg-card-head">
        {/* Carte blanche → variante sombre du logo (/logos/wbp1.png). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="lg-mark" aria-hidden="true"><img src="/logos/wbp1.png" alt="" width={46} height={46} /></span>
        <div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
      </div>

      <div className="lg-alerts" aria-live="polite">
        {err && <div className="lg-alert err" role="alert"><I name="close" size={16} /><span>{err}</span></div>}
        {ok && <div className="lg-alert ok"><I name="check" size={16} /><span>{ok}</span></div>}
      </div>

      <div className="lg-fields">
        {mode !== 'reset' && (
          <div className={`lg-field ${emailBad ? 'bad' : ''}`}>
            <label htmlFor="lg-email">Adresse e-mail</label>
            <div className="lg-input">
              <I name="mail" size={17} className="lg-lead" />
              <input
                id="lg-email" ref={emailRef} type="email" inputMode="email" autoComplete="username"
                placeholder="vous@wbp-dz.com" value={email} spellCheck="false"
                aria-invalid={emailBad || undefined}
                aria-describedby={emailBad ? 'lg-email-err' : undefined}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, email: true }))}
              />
            </div>
            {emailBad && <span className="lg-hint err" id="lg-email-err">Format d’e-mail invalide.</span>}
          </div>
        )}

        {mode !== 'forgot' && (
          <div className={`lg-field ${pwBad ? 'bad' : ''}`}>
            <div className="lg-label-row">
              <label htmlFor="lg-pw">{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}</label>
              {mode === 'signin' && (
                <button type="button" className="lg-link" onClick={() => goto('forgot')}>Oublié ?</button>
              )}
            </div>
            <div className="lg-input">
              <I name="lock" size={17} className="lg-lead" />
              <input
                id="lg-pw" type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
                placeholder={mode === 'reset' ? '6 caractères minimum' : '••••••••'}
                value={password}
                aria-invalid={pwBad || undefined}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={onKeyGuard} onKeyDown={onKeyGuard}
                onBlur={() => setTouched((s) => ({ ...s, password: true }))}
              />
              <button type="button" className="lg-eye" onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                title={showPw ? 'Masquer' : 'Afficher'}>
                <I name={showPw ? 'eyeoff' : 'eye'} size={17} />
              </button>
            </div>
            {pwBad && <span className="lg-hint err">6 caractères minimum.</span>}
            {caps && !pwBad && <span className="lg-hint warn">Verrouillage majuscules activé.</span>}
          </div>
        )}

        {mode === 'reset' && (
          <div className={`lg-field ${mismatch ? 'bad' : ''}`}>
            <label htmlFor="lg-pw2">Confirmer le mot de passe</label>
            <div className="lg-input">
              <I name="lock" size={17} className="lg-lead" />
              <input
                id="lg-pw2" type={showPw ? 'text' : 'password'} autoComplete="new-password"
                placeholder="Retapez le mot de passe" value={password2}
                aria-invalid={mismatch || undefined}
                onChange={(e) => setPassword2(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, password2: true }))}
              />
            </div>
            {mismatch && <span className="lg-hint err">Les mots de passe ne correspondent pas.</span>}
          </div>
        )}
      </div>

      <button className="lg-submit" type="submit" disabled={busy}>
        {busy
          ? (<><span className="lg-spin" aria-hidden="true" /> Un instant…</>)
          : mode === 'signin' ? (<>Se connecter <I name="arrow" size={17} /></>)
            : mode === 'forgot' ? (<>Envoyer le lien <I name="mail" size={17} /></>)
              : (<>Enregistrer <I name="check" size={17} /></>)}
      </button>

      {mode !== 'signin' && (
        <button type="button" className="lg-back" onClick={() => goto('signin')}>
          <I name="chevleft" size={15} /> Retour à la connexion
        </button>
      )}

      <p className="lg-foot">
        <I name="shield" size={14} /> Espace réservé à l’équipe World Business Plus.
      </p>
    </form>
  );
}
