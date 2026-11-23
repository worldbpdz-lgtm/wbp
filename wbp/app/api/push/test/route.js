import { createAdminClient } from '@/lib/supabase/server';
import { pushTest } from '@/lib/push';
import { todoCounts } from '@/lib/crm-server';
import { requireApiAdmin, readJson, json } from '@/lib/api-guard';
import { hit } from '@/lib/ratelimit';

// POST /api/push/test { endpoint } — envoie une notification de test à CET appareil.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const g = await requireApiAdmin(request, { write: true });
  if (g.res) return g.res;
  // Pas plus de 6 tests par minute et par compte.
  if (!hit(`push-test:${g.user.email}`, 6, 60_000).ok) return json({ ok: false, error: 'Trop de tests. Patientez une minute.' }, 429);
  const body = await readJson(request);
  const endpoint = String(body?.endpoint || '');
  if (!endpoint) return json({ ok: false, error: 'Appareil inconnu.' }, 400);
  const sb = createAdminClient();
  const { data: sub } = await sb.from('push_subscriptions').select('*')
    .eq('endpoint', endpoint).eq('user_email', String(g.user.email).toLowerCase()).maybeSingle();
  if (!sub) return json({ ok: false, error: 'Cet appareil n’est pas abonné. Activez d’abord les notifications.' }, 404);
  let badge = null;
  try { badge = (await todoCounts(sb)).total; } catch { /* facultatif */ }
  const res = await pushTest(sb, sub, { badge });
  return json(res, res.ok ? 200 : 502);
}
