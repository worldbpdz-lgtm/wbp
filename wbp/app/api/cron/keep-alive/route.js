import { NextResponse } from 'next/server';
import { isKeepAliveAuthorized, pingKeepAlive, pingSource } from '@/lib/keep-alive';

/**
 * Tick de keep-alive Supabase — `keep_alive.ticks += 1`.
 *
 * Appelé chaque jour par le cron Vercel (vercel.json). N'importe quel
 * planificateur externe fait l'affaire (c'est le filet si un déploiement
 * Vercel casse) :
 *   GET /api/cron/keep-alive        avec  Authorization: Bearer $CRON_SECRET
 *   GET /api/cron/keep-alive?key=$CRON_SECRET
 *
 * Ouvrable dans un navigateur pour voir le compteur. Voir lib/keep-alive.js
 * pour le pourquoi de l'écriture plutôt que d'un simple ping.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function tick(req) {
  const { authorized, isProtected } = isKeepAliveAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const ping = await pingKeepAlive(pingSource(req));
    return NextResponse.json(
      { ok: true, project: 'wbp', ...ping, pingMs: Date.now() - startedAt, protected: isProtected },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (err) {
    // 503 et pas 200 : le journal du planificateur est la seule supervision.
    return NextResponse.json(
      {
        ok: false,
        project: 'wbp',
        error: err?.message || String(err),
        pingMs: Date.now() - startedAt,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  }
}

export const GET = tick;
export const POST = tick;
