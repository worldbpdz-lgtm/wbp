// ============================================================================
// /api/chat/poll — récupère les réponses arrivées APRÈS le tour de l'IA.
// ----------------------------------------------------------------------------
// Sur une plateforme de chat externe, une conversation peut être reprise par un
// conseiller humain (« handoff »). Le POST de streaming ne couvre que la réponse
// immédiate de l'IA ; ce point d'entrée permet au chat de recevoir aussi les
// messages du conseiller. Sans plateforme configurée, il renvoie simplement une
// liste vide (le chat n'interroge alors plus rien).
// ============================================================================
import { getAiConfig } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function GET(req) {
  const url = new URL(req.url);
  const conversationId = (url.searchParams.get('conversationId') || '').slice(0, 80);
  const sessionId = (url.searchParams.get('sessionId') || '').slice(0, 80);
  const since = (url.searchParams.get('since') || '').slice(0, 40);
  if (!conversationId) return json({ messages: [], aiActive: true });

  const cfg = await getAiConfig();
  if (!(cfg.enabled && cfg.provider !== 'builtin' && cfg.base_url && cfg.widget_key)) {
    return json({ messages: [], aiActive: true, supported: false });
  }

  const params = new URLSearchParams({
    widgetKey: cfg.widget_key,
    conversationId,
    customerExternalId: sessionId || 'wbp-visitor',
  });
  if (since) params.set('since', since);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${String(cfg.base_url).replace(/\/+$/, '')}/api/widget/messages/poll?${params}`, {
      signal: ctrl.signal, cache: 'no-store',
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return json({ messages: [], aiActive: true });
    const data = await res.json();
    return json({
      status: data?.status || null,
      aiActive: data?.aiActive !== false,
      messages: Array.isArray(data?.messages) ? data.messages.slice(0, 20) : [],
    });
  } catch {
    return json({ messages: [], aiActive: true });
  }
}
