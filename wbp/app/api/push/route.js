import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { getVapid, isAllowedEndpoint, cleanPrefs, defaultPrefs } from '@/lib/push';
import { isNotMigrated } from '@/lib/crm-server';
import { requireApiAdmin, readJson, json } from '@/lib/api-guard';

// ============================================================================
// /api/push — abonnement de CET appareil aux notifications.
//   GET    ?endpoint=…   clé publique + état de l'appareil (abonné ? préférences)
//   POST   { subscription, prefs, scope }   abonne l'appareil au compte connecté
//   PATCH  { endpoint, prefs }              change les types de notifications
//   DELETE { endpoint }                     désabonne l'appareil
// ============================================================================

export const dynamic = 'force-dynamic';

const B64URL = /^[A-Za-z0-9_-]{16,256}={0,2}$/;

function deviceLabel(ua = '', scope = '/mobile') {
  const s = ua.toLowerCase();
  const os = /iphone/.test(s) ? 'iPhone' : /ipad/.test(s) ? 'iPad' : /android/.test(s) ? 'Android'
    : /macintosh|mac os/.test(s) ? 'Mac' : /windows/.test(s) ? 'Windows' : /linux/.test(s) ? 'Linux' : 'Appareil';
  const br = /edg\//.test(s) ? 'Edge' : /firefox|fxios/.test(s) ? 'Firefox' : /chrome|crios/.test(s) ? 'Chrome' : /safari/.test(s) ? 'Safari' : '';
  return scope === '/admin' ? `${os} — ${br || 'navigateur'} (back-office)` : `${os} — app WBP`;
}

export async function GET(request) {
  const g = await requireApiAdmin(request);
  if (g.res) return g.res;
  if (!hasSupabase()) return json({ available: false, reason: 'config' });
  const sb = createAdminClient();
  const vapid = await getVapid(sb);
  if (!vapid) return json({ available: false, reason: 'migration' });
  const endpoint = request.nextUrl.searchParams.get('endpoint');
  let sub = null;
  if (endpoint) {
    const { data, error } = await sb.from('push_subscriptions').select('user_email,prefs,device,scope')
      .eq('endpoint', endpoint).maybeSingle();
    if (error && !isNotMigrated(error)) return json({ error: 'read_failed' }, 500);
    sub = data || null;
  }
  const mine = sub && String(sub.user_email).toLowerCase() === String(g.user.email).toLowerCase();
  return json({
    available: true,
    publicKey: vapid.publicKey,
    subscribed: !!mine,
    prefs: mine ? cleanPrefs(sub.prefs, g.user.email) : defaultPrefs(g.user.email),
    device: mine ? sub.device : null,
  });
}

export async function POST(request) {
  const g = await requireApiAdmin(request, { write: true });
  if (g.res) return g.res;
  const body = await readJson(request);
  const sub = body?.subscription;
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!isAllowedEndpoint(endpoint) || endpoint.length > 1000) return json({ error: 'endpoint' }, 400);
  if (!B64URL.test(p256dh) || !B64URL.test(auth)) return json({ error: 'keys' }, 400);
  const scope = body?.scope === '/admin' ? '/admin' : '/mobile';
  const email = String(g.user.email).toLowerCase();
  const sb = createAdminClient();
  const row = {
    site: SITE,
    user_email: email,
    endpoint,
    p256dh,
    auth,
    scope,
    device: deviceLabel(request.headers.get('user-agent') || '', scope),
    prefs: cleanPrefs(body?.prefs, email),
    fail_count: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  // Renouvellement automatique (« pushsubscriptionchange » du service worker) :
  // on reprend les préférences de l'ancien abonnement, puis on le supprime.
  const oldEndpoint = String(body?.oldEndpoint || '');
  if (oldEndpoint && oldEndpoint !== endpoint) {
    const { data: old } = await sb.from('push_subscriptions').select('prefs,user_email,scope')
      .eq('endpoint', oldEndpoint).maybeSingle();
    if (old && String(old.user_email).toLowerCase() === email) {
      if (!body?.prefs) row.prefs = cleanPrefs(old.prefs, email);
      row.scope = old.scope || row.scope;
      await sb.from('push_subscriptions').delete().eq('endpoint', oldEndpoint);
    }
  }
  // Un même appareil (même adresse d'abonnement) peut changer de compte :
  // l'upsert le rattache au compte connecté maintenant.
  const { error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  if (error) return json({ error: isNotMigrated(error) ? 'migration' : 'save_failed' }, isNotMigrated(error) ? 503 : 500);
  return json({ ok: true, prefs: row.prefs, device: row.device });
}

export async function PATCH(request) {
  const g = await requireApiAdmin(request, { write: true });
  if (g.res) return g.res;
  const body = await readJson(request);
  const endpoint = String(body?.endpoint || '');
  if (!endpoint) return json({ error: 'endpoint' }, 400);
  const email = String(g.user.email).toLowerCase();
  const prefs = cleanPrefs(body?.prefs, email);
  const sb = createAdminClient();
  const { data, error } = await sb.from('push_subscriptions')
    .update({ prefs, updated_at: new Date().toISOString() })
    .eq('endpoint', endpoint).eq('user_email', email).select('id');
  if (error) return json({ error: 'save_failed' }, 500);
  if (!data?.length) return json({ error: 'not_found' }, 404);
  return json({ ok: true, prefs });
}

export async function DELETE(request) {
  const g = await requireApiAdmin(request, { write: true });
  if (g.res) return g.res;
  const body = await readJson(request);
  const endpoint = String(body?.endpoint || '');
  if (!endpoint) return json({ error: 'endpoint' }, 400);
  const sb = createAdminClient();
  // Connaître l'adresse d'abonnement suffit : elle n'existe que sur l'appareil.
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error && !isNotMigrated(error)) return json({ error: 'delete_failed' }, 500);
  return json({ ok: true });
}
