'use server';
// ============================================================================
// Recherche globale du back-office (palette Ctrl/⌘ + K).
// ----------------------------------------------------------------------------
// Une requête, cinq familles : commandes, devis, clients, messages, produits —
// 5 résultats chacune. Mêmes règles que le reste du back-office : session et
// ADMIN_EMAILS revérifiés, filtre par site (base partagée avec Central
// Network), valeur de recherche échappée pour la grammaire or() de PostgREST.
// Aucune écriture, aucune ligne de journal : chercher n'est pas une action.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { SITE } from '@/lib/site';
import { orLit } from '@/lib/crm-server';

const LIMIT = 5;

export async function adminSearch(query) {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) return { ok: false, error: 'Session expirée.' };
  const q = String(query || '').trim().slice(0, 80);
  if (q.length < 2) return { ok: true, groups: {} };

  const sb = createAdminClient();
  const like = orLit(`%${q}%`);
  const digits = q.replace(/\D/g, '').replace(/^0+/, '');
  const phone = digits.length >= 4 ? orLit(`%${digits}%`) : null;

  const ors = (cols, phoneCols = []) => [
    ...cols.map((c) => `${c}.ilike.${like}`),
    ...(phone ? phoneCols.map((c) => `${c}.ilike.${phone}`) : []),
  ].join(',');

  const safe = async (p) => { try { const { data, error } = await p; return error ? [] : (data || []); } catch { return []; } };

  const [orders, quotes, customers, messages, products] = await Promise.all([
    safe(sb.from('orders').select('id,number,status,customer_name,company,total,created_at').eq('site', SITE)
      .or(ors(['number', 'customer_name', 'company', 'email', 'city', 'wilaya'], ['phone_norm']))
      .order('created_at', { ascending: false }).limit(LIMIT)),
    safe(sb.from('quote_requests').select('id,number,status,customer_name,company,created_at').eq('site', SITE)
      .or(ors(['number', 'customer_name', 'company', 'email'], ['phone_norm']))
      .order('created_at', { ascending: false }).limit(LIMIT)),
    safe(sb.from('customers').select('id,name,company,phone,email,wilaya').eq('site', SITE)
      .or(ors(['name', 'company', 'email', 'wilaya', 'city'], ['phone_norm', 'phone2_norm']))
      .order('last_activity_at', { ascending: false }).limit(LIMIT)),
    safe(sb.from('contact_messages').select('id,name,company,subject,status,created_at').eq('site', SITE)
      .or(ors(['name', 'company', 'email', 'subject'], ['phone_norm']))
      .order('created_at', { ascending: false }).limit(LIMIT)),
    safe(sb.from('products').select('id,name,code,active')
      .or(`name.ilike.${like},code.ilike.${like}`)
      .order('active', { ascending: false }).order('name').limit(LIMIT)),
  ]);

  return { ok: true, groups: { orders, quotes, customers, messages, products } };
}
