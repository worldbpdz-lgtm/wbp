// ============================================================================
// /api/chat — point d'entrée du chat de l'assistant WBP.
// ----------------------------------------------------------------------------
// Pourquoi un proxy et pas le script widget de la plateforme ?
// Le widget d'une plateforme de chat appelle « /api/widget/messages » en chemin
// RELATIF : il ne fonctionne donc que sur le domaine de la plateforme
// elle-même. En passant par
// cette route, le navigateur du visiteur parle à wbp-dz.com, et c'est le serveur
// WBP qui relaie vers la plateforme. Avantages :
//   • plus de problème d'origine différente (CORS) ;
//   • la clé du widget et l'URL de la plateforme restent côté serveur ;
//   • si la plateforme est injoignable, l'assistant intégré prend le relais et
//     le visiteur obtient quand même une réponse utile.
//
// Réponse : flux « text/event-stream » avec deux types d'événements —
//   { type:'delta', text }             fragments de texte
//   { type:'done', conversationId, products, source }
// ============================================================================
import { getAiConfig } from '@/lib/queries';
import { answer } from '@/lib/ai/assistant';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { hit } from '@/lib/ratelimit';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const enc = new TextEncoder();
const frame = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/** Journalise la conversation (best-effort, n'interrompt jamais la réponse). */
async function log(sessionId, role, content) {
  if (!hasSupabase()) return;
  try {
    const sb = createAdminClient();
    await sb.from('ai_messages').insert({ site: SITE, session_id: sessionId, role, content: String(content).slice(0, 4000) });
  } catch { /* table absente ou hors service : on continue */ }
}

/** Découpe un texte en petits fragments pour un effet de frappe naturel. */
function streamText(text, { conversationId = null, products = [], source }) {
  const chunks = String(text).match(/[\s\S]{1,3}/g) || [];
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(frame({ type: 'delta', text: chunks[i++] }));
        return new Promise((r) => setTimeout(r, 9));
      }
      controller.enqueue(frame({ type: 'done', conversationId, products, source }));
      controller.close();
      return undefined;
    },
  });
}

export async function POST(req) {
  // ---- Limitation de débit -------------------------------------------------
  // Ce point d'entrée est public et relaie vers une plateforme IA facturée à
  // l'usage. Sans plafond, un script pouvait envoyer des messages en boucle :
  // facture d'IA, table ai_messages saturée, et le chat inutilisable pour les
  // vrais visiteurs.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'local';
  const rl = hit(`chat:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
    });
  }

  let body = {};
  try { body = await req.json(); } catch { /* corps illisible */ }

  const message = String(body.message || '').slice(0, 4000).trim();
  const lang = ['fr', 'en', 'ar'].includes(body.lang) ? body.lang : 'fr';
  const sessionId = String(body.sessionId || '').slice(0, 80) || null;
  const conversationId = body.conversationId ? String(body.conversationId).slice(0, 80) : null;

  if (!message) {
    return new Response(JSON.stringify({ error: 'message_required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const cfg = await getAiConfig();
  if (!cfg.enabled) {
    return new Response(JSON.stringify({ error: 'assistant_disabled' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  log(sessionId, 'user', message);

  // ---- Mode plateforme externe ---------------------------------------------
  if (cfg.provider !== 'builtin' && cfg.base_url && cfg.widget_key) {
    const upstream = `${String(cfg.base_url).replace(/\/+$/, '')}/api/widget/messages`;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(upstream, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetKey: cfg.widget_key,
          conversationId,
          message,
          customerExternalId: sessionId || `wbp-${Math.random().toString(36).slice(2, 10)}`,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        clearTimeout(timeout);
        // La plateforme est là mais refuse : on ne montre pas d'erreur brute au
        // visiteur, l'assistant intégré répond à partir du catalogue.
        const fb = await answer(message, lang);
        log(sessionId, 'assistant', fb.text);
        return new Response(streamText(fb.text, { products: fb.products, source: `fallback:http_${res.status}` }), { headers: SSE_HEADERS });
      }

      // Relais du flux tel quel, en journalisant la réponse au passage.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let collected = '';
      const stream = new ReadableStream({
        async pull(controller) {
          const { value, done } = await reader.read();
          if (done) {
            clearTimeout(timeout);
            if (collected) log(sessionId, 'assistant', collected);
            controller.close();
            return;
          }
          const text = decoder.decode(value, { stream: true });
          for (const m of text.matchAll(/data:\s*(\{[^\n]*)/g)) {
            try { const ev = JSON.parse(m[1]); if (ev.type === 'delta' && ev.text) collected += ev.text; } catch { /* trame partielle */ }
          }
          controller.enqueue(value);
        },
        cancel() { clearTimeout(timeout); reader.cancel().catch(() => {}); },
      });
      return new Response(stream, { headers: SSE_HEADERS });
    } catch (e) {
      const fb = await answer(message, lang);
      log(sessionId, 'assistant', fb.text);
      const reason = e?.name === 'AbortError' ? 'timeout' : 'network';
      return new Response(streamText(fb.text, { products: fb.products, source: `fallback:${reason}` }), { headers: SSE_HEADERS });
    }
  }

  // ---- Mode intégré (catalogue) --------------------------------------------
  const res = await answer(message, lang);
  log(sessionId, 'assistant', res.text);
  return new Response(streamText(res.text, { products: res.products, source: 'builtin' }), { headers: SSE_HEADERS });
}
