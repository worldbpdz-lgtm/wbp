import { NextResponse } from 'next/server';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

// ============================================================================
// REDIRECTION OUVERTE — corrigé.
// ----------------------------------------------------------------------------
// Avant, ?u= acceptait n'importe quelle URL http(s). N'importe qui pouvait donc
// diffuser un lien commençant par le domaine officiel WBP et aboutissant sur un
// site de phishing :
//     https://wbp-dz.com/api/email/click?u=https://faux-wbp.example/login
// La victime voit le vrai domaine, le survol du lien affiche le vrai domaine,
// et les filtres anti-spam font confiance au domaine — c'est exactement le
// schéma utilisé pour voler des identifiants.
//
// Désormais la destination doit appartenir au site (ou à un domaine
// explicitement autorisé ci-dessous). Tout le reste retombe sur l'accueil.
// ============================================================================
function allowedHosts(selfHost) {
  const hosts = new Set();
  // Le domaine servant la requête est par définition celui du site. Ce repli
  // évite que tous les liens de campagne retombent sur l'accueil quand
  // NEXT_PUBLIC_SITE_URL n'a pas été renseigné sur l'hébergeur.
  if (selfHost) hosts.add(String(selfHost).toLowerCase().replace(/^www\./, ''));
  for (const v of [siteUrl(), process.env.NEXT_PUBLIC_SITE_URL]) {
    try { if (v) hosts.add(new URL(v).host.replace(/^www\./, '')); } catch { /* valeur absente */ }
  }
  // Domaines supplémentaires autorisés dans les campagnes, séparés par des
  // virgules (ex. EMAIL_LINK_HOSTS="wbp-dz.com,central-network.dz").
  for (const h of String(process.env.EMAIL_LINK_HOSTS || '').split(',')) {
    const t = h.trim().toLowerCase().replace(/^www\./, '');
    if (t) hosts.add(t);
  }
  return hosts;
}

function safeTarget(raw, req) {
  let value = raw || '';
  try { value = decodeURIComponent(value); } catch { /* garder tel quel */ }
  const selfOrigin = (() => { try { return new URL(req.url).origin; } catch { return siteUrl(); } })();
  const home = process.env.NEXT_PUBLIC_SITE_URL ? siteUrl() : selfOrigin;
  // Un chemin relatif est toujours sûr : il reste sur le site.
  // On refuse « //evil.com » et « /\evil.com », qui sont des URLs absolues
  // déguisées en chemin relatif.
  if (/^\/[^/\\]/.test(value)) return new URL(value, home).toString();
  let u;
  try { u = new URL(value); } catch { return home; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return home; // javascript:, data:…
  let selfHost = '';
  try { selfHost = new URL(selfOrigin).host; } catch { /* ignoré */ }
  const hosts = allowedHosts(selfHost);
  const host = u.host.toLowerCase().replace(/^www\./, '');
  const ok = [...hosts].some((h) => host === h || host.endsWith('.' + h));
  return ok ? u.toString() : home;
}

export async function GET(req) {
  const url = new URL(req.url);
  const sid = url.searchParams.get('s');
  const target = safeTarget(url.searchParams.get('u'), req);

  try {
    if (sid && hasSupabase()) {
      const sb = createAdminClient();
      const { data } = await sb.from('email_campaign_sends').select('id,opened_at,clicked_at').eq('id', sid).maybeSingle();
      if (data) {
        const patch = {};
        if (!data.clicked_at) patch.clicked_at = new Date().toISOString();
        if (!data.opened_at) patch.opened_at = new Date().toISOString(); // a click implies an open
        if (Object.keys(patch).length) await sb.from('email_campaign_sends').update(patch).eq('id', sid);
      }
    }
  } catch { /* never block the redirect */ }

  return NextResponse.redirect(target, 302);
}
