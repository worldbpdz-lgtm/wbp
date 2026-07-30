import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ============================================================================
// Délai maximal pour joindre Supabase.
// ----------------------------------------------------------------------------
// Sans cela, `fetch` attend indéfiniment : si le projet Supabase est en pause
// (les projets gratuits s'endorment après quelques jours sans activité), en
// maintenance, ou simplement injoignable depuis le réseau, TOUTE page du site
// reste bloquée — l'onglet tourne dans le vide et le terminal affiche
// « ○ Compiling / … » puis plus rien.
//
// Avec ce garde-fou, la requête abandonne au bout de 10 s, l'erreur est écrite
// en clair dans le terminal, et la page s'affiche quand même (catalogue vide
// plutôt que page morte).
// ============================================================================
const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS) || 10000;
let warned = false;

function timeoutFetch(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // On respecte un signal déjà fourni par l'appelant en plus du nôtre.
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal })
    .catch((err) => {
      const aborted = err?.name === 'AbortError';
      if (!warned) {
        warned = true;
        setTimeout(() => { warned = false; }, 30000); // au plus un avertissement / 30 s
        const host = (() => { try { return new globalThis.URL(String(input)).host; } catch { return URL; } })();
        console.error(
          aborted
            ? `\n⚠️  Supabase n'a pas répondu en ${TIMEOUT_MS / 1000} s (${host}).\n` +
              `    → Ouvrez https://supabase.com/dashboard : si le projet est « Paused », cliquez « Restore ».\n` +
              `    → Vérifiez aussi NEXT_PUBLIC_SUPABASE_URL dans .env.local.\n` +
              `    Le site continue de s'afficher, mais sans le catalogue.\n`
            : `\n⚠️  Supabase injoignable (${host}) : ${err?.message}\n`,
        );
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

export function hasSupabase() {
  return Boolean(URL && ANON);
}

// Cookie-bound client (carries the auth session). Anon key + RLS.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    global: { fetch: timeoutFetch },
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(list) {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component — safe to ignore */ }
      },
    },
  });
}

// Service-role client. Bypasses RLS. Server-only — never expose to the browser.
export function createAdminClient() {
  if (!URL || !SERVICE) throw new Error('Supabase service role env vars are not set.');
  return createSupabaseClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch },
  });
}
