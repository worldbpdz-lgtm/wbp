// ============================================================================
// Notifications PUSH (iPhone, Android, ordinateur) — côté serveur.
// ----------------------------------------------------------------------------
// Standard « Web Push » : le téléphone s'abonne auprès du service de son
// fabricant (Apple, Google, Mozilla, Microsoft) et nous transmet une adresse
// d'abonnement. Pour notifier, le serveur chiffre le message et le dépose à
// cette adresse ; seul le téléphone abonné peut le déchiffrer.
//
// Clés VAPID (l'identité du serveur auprès de ces services) :
//   1. variables d'environnement NEXT_PUBLIC_VAPID_PUBLIC_KEY +
//      VAPID_PRIVATE_KEY si elles existent ;
//   2. sinon, générées automatiquement au premier besoin et rangées dans la
//      table PRIVÉE `app_secrets` (RLS sans policy : illisible depuis le
//      navigateur). Aucune configuration à faire pour que ça marche.
//
// SÉCURITÉ
//   • Seuls les comptes présents dans ADMIN_EMAILS reçoivent quoi que ce soit :
//     un collègue retiré de la liste cesse immédiatement d'être notifié, et ses
//     abonnements sont supprimés au premier envoi.
//   • Le serveur n'envoie qu'aux services push connus (liste ci-dessous) : une
//     adresse d'abonnement forgée ne peut pas lui faire appeler une machine
//     interne (faille « SSRF »).
// ============================================================================
import webpush from 'web-push';
import { adminEmails, ownerEmail } from '@/lib/admin';
import { SITE } from '@/lib/site';
import { isNotMigrated } from '@/lib/crm-server';

const PUSH_HOSTS = [
  'fcm.googleapis.com', 'android.googleapis.com',            // Chrome, Android
  'web.push.apple.com',                                       // Safari, iPhone
  'updates.push.services.mozilla.com', 'push.services.mozilla.com', // Firefox
];
const PUSH_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];
// Réservé aux tests : hôtes supplémentaires, séparés par des virgules.
const EXTRA_HOSTS = (process.env.PUSH_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

export function isAllowedEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint));
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return PUSH_HOSTS.includes(h) || PUSH_SUFFIXES.some((s) => h.endsWith(s)) || EXTRA_HOSTS.includes(h);
  } catch { return false; }
}

// ------------------------------------------------------------------ VAPID --
let vapidCache = null;

export async function getVapid(sb) {
  if (vapidCache) return vapidCache;
  const subject = process.env.VAPID_SUBJECT || 'mailto:commercial@wbp-dz.com';
  const envPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    vapidCache = { publicKey: envPub, privateKey: envPriv, subject, source: 'env' };
    return vapidCache;
  }
  const read = async () => {
    const { data, error } = await sb.from('app_secrets').select('value')
      .eq('site', SITE).eq('key', 'vapid').maybeSingle();
    if (error) return { error };
    return { value: data?.value || null };
  };
  let r = await read();
  if (r.error) { if (!isNotMigrated(r.error)) console.warn('[push] app_secrets:', r.error.message); return null; }
  if (!r.value?.publicKey) {
    const keys = webpush.generateVAPIDKeys();
    const ins = await sb.from('app_secrets').insert({ site: SITE, key: 'vapid', value: keys });
    // 23505 : une autre requête vient de les créer — on relit les siennes.
    if (ins.error && ins.error.code !== '23505') { console.warn('[push] génération VAPID:', ins.error.message); return null; }
    r = await read();
    if (!r.value?.publicKey) return null;
  }
  vapidCache = { publicKey: r.value.publicKey, privateKey: r.value.privateKey, subject, source: 'db' };
  return vapidCache;
}

// ------------------------------------------------------------ préférences --
/** Préférences par défaut d'un appareil, selon le compte. */
export function defaultPrefs(email) {
  const owner = String(email || '').toLowerCase() === ownerEmail();
  return { order: true, quote: true, message: true, review: false, team: owner };
}

export function cleanPrefs(input, email) {
  const base = defaultPrefs(email);
  const out = {};
  for (const k of Object.keys(base)) out[k] = input && typeof input[k] === 'boolean' ? input[k] : base[k];
  return out;
}

// ------------------------------------------------------------------ envoi --
function toWebPush(sub) {
  return { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
}

// Options de transport : l'agent https peut être fourni par un test.
let transport = {};
export function _setTransportForTests(t) { transport = t || {}; }

async function deliver(sb, vapid, sub, payload, { urgency = 'high', ttl = 86400 } = {}) {
  try {
    await webpush.sendNotification(toWebPush(sub), JSON.stringify(payload), {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: ttl,
      urgency,
      timeout: 8000,
      ...transport,
    });
    await sb.from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString(), fail_count: 0, last_error: null })
      .eq('id', sub.id);
    return { ok: true };
  } catch (e) {
    const code = e?.statusCode;
    // 404/410 : abonnement expiré ou révoqué par l'utilisateur.
    // 401/403 : abonnement créé avec d'anciennes clés VAPID — irrécupérable.
    if ([401, 403, 404, 410].includes(code)) {
      await sb.from('push_subscriptions').delete().eq('id', sub.id);
      return { ok: false, gone: true, code };
    }
    const fails = (sub.fail_count || 0) + 1;
    // Après 10 échecs d'affilée (réseau, service en panne…), on abandonne
    // l'appareil : il sera réabonné à sa prochaine ouverture de l'app.
    if (fails >= 10) await sb.from('push_subscriptions').delete().eq('id', sub.id);
    else {
      await sb.from('push_subscriptions')
        .update({ fail_count: fails, last_error: String(e?.body || e?.message || code || 'échec').slice(0, 300) })
        .eq('id', sub.id);
    }
    return { ok: false, code, error: e?.message };
  }
}

/**
 * Envoie un événement à tous les appareils abonnés qui l'acceptent.
 * @param evt { kind, refType, refId, id, title, body, url, adminUrl, actorEmail, badge }
 * @returns nombre d'appareils atteints
 */
export async function pushEvent(sb, evt) {
  const vapid = await getVapid(sb);
  if (!vapid) return 0;
  const { data: subs, error } = await sb.from('push_subscriptions').select('*').eq('site', SITE);
  if (error || !subs?.length) return 0;

  const allowed = new Set(adminEmails());
  const actor = evt.actorEmail ? String(evt.actorEmail).toLowerCase() : null;
  const targets = [];
  for (const sub of subs) {
    const email = String(sub.user_email || '').toLowerCase();
    if (!allowed.has(email)) {
      // Compte retiré d'ADMIN_EMAILS : plus aucune donnée client ne lui part.
      await sb.from('push_subscriptions').delete().eq('id', sub.id);
      continue;
    }
    if (!isAllowedEndpoint(sub.endpoint)) { await sb.from('push_subscriptions').delete().eq('id', sub.id); continue; }
    if (actor && email === actor) continue;              // pas de notification de sa propre action
    const prefs = { ...defaultPrefs(email), ...(sub.prefs || {}) };
    if (prefs[evt.kind] === false) continue;
    targets.push(sub);
  }

  const results = await Promise.allSettled(targets.map((sub) => deliver(sb, vapid, sub, {
    title: evt.title,
    body: evt.body || '',
    url: sub.scope === '/admin' ? (evt.adminUrl || '/admin/notifications') : (evt.url || '/mobile/notifications'),
    tag: evt.refType && evt.refId ? `${evt.refType}-${evt.refId}` : `n-${evt.id || Date.now()}`,
    kind: evt.kind,
    id: evt.id || null,
    badge: typeof evt.badge === 'number' ? evt.badge : null,
    at: new Date().toISOString(),
  }, { urgency: evt.kind === 'team' || evt.kind === 'review' ? 'normal' : 'high' })));
  return results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
}

/** Notification de test vers UN appareil (bouton « Envoyer un test »). */
export async function pushTest(sb, sub, { badge = null } = {}) {
  const vapid = await getVapid(sb);
  if (!vapid) return { ok: false, error: 'Clés de notification indisponibles.' };
  if (!isAllowedEndpoint(sub.endpoint)) return { ok: false, error: 'Service de notification non reconnu.' };
  const res = await deliver(sb, vapid, sub, {
    title: 'Notifications activées ✓',
    body: 'Cet appareil sera prévenu à chaque nouvelle commande, demande de devis ou question.',
    url: sub.scope === '/admin' ? '/admin/notifications' : '/mobile/notifications',
    tag: 'wbp-test',
    kind: 'test',
    badge,
    at: new Date().toISOString(),
  }, { urgency: 'high', ttl: 600 });
  if (res.ok) return { ok: true };
  if (res.gone) return { ok: false, gone: true, error: 'Cet abonnement n’est plus valide. Réactivez les notifications.' };
  return { ok: false, error: `Le service de notification a refusé l’envoi${res.code ? ` (code ${res.code})` : ''}.` };
}
