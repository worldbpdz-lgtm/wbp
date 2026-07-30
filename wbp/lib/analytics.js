import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';

const DAY = 86400000;
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const lastDays = (n) => { const out = []; const now = Date.now(); for (let i = n - 1; i >= 0; i--) out.push(ymd(now - i * DAY)); return out; };
const trend = (cur, prev) => { if (!prev) return cur ? { dir: 'up', pct: 100 } : { dir: 'flat', pct: 0 }; const p = Math.round(((cur - prev) / prev) * 100); return { dir: p > 0 ? 'up' : (p < 0 ? 'down' : 'flat'), pct: Math.abs(p) }; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u ? 'autre' : 'direct'; } };
const tally = (arr, key) => { const m = {}; for (const x of arr) { const k = key(x) || '—'; m[k] = (m[k] || 0) + 1; } return m; };

export async function getDashboard() {
  if (!hasSupabase()) return null;
  try {
    const sb = createAdminClient();
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const [ev, quotes, msgs, reviews, products, cats, subsRes] = await Promise.all([
      sb.from('events').select('type,product_id,device,session_id,created_at').eq('site', SITE).gte('created_at', since).limit(20000),
      sb.from('quote_requests').select('id,customer_name,company,email,status,created_at').eq('site', SITE).order('created_at', { ascending: false }).limit(2000),
      sb.from('contact_messages').select('id,name,subject,status,created_at').eq('site', SITE).order('created_at', { ascending: false }).limit(2000),
      sb.from('reviews').select('id,product_id,author,rating,approved,created_at').eq('site', SITE).order('created_at', { ascending: false }).limit(2000),
      sb.from('products').select('id,name,cat,active'),
      sb.from('categories').select('id,name'),
      sb.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('site', SITE),
    ]);
    const events = ev.data || [], Q = quotes.data || [], M = msgs.data || [], R = reviews.data || [], P = products.data || [], C = cats.data || [];
    const pname = Object.fromEntries(P.map((p) => [p.id, p.name]));
    const cname = Object.fromEntries(C.map((c) => [c.id, c.name?.fr || c.id]));

    const pv = events.filter((e) => e.type === 'page_view');
    const days14 = lastDays(14);
    const inLast = (rows, n) => rows.filter((r) => new Date(r.created_at).getTime() >= Date.now() - n * DAY);
    const inPrev = (rows, n) => rows.filter((r) => { const t = new Date(r.created_at).getTime(); return t < Date.now() - n * DAY && t >= Date.now() - 2 * n * DAY; });

    const visits14 = inLast(pv, 14).length, visitsPrev = inPrev(pv, 14).length;
    const uniq = new Set(inLast(pv, 14).map((e) => e.session_id)).size;
    const uniqPrev = new Set(inPrev(pv, 14).map((e) => e.session_id)).size;
    const prodViews = events.filter((e) => e.type === 'product_view');
    const pv14 = inLast(prodViews, 14).length, pvPrev = inPrev(prodViews, 14).length;

    const visitsByDay = days14.map((d) => pv.filter((e) => ymd(e.created_at) === d).reduce((a) => a + 1, 0));
    const leadsByDay = days14.map((d) => Q.filter((q) => ymd(q.created_at) === d).length);

    const topProd = Object.entries(tally(prodViews, (e) => e.product_id)).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, v]) => ({ label: pname[id] || id, value: v }));
    const devices = tally(pv, (e) => e.device);
    const byCat = Object.entries(tally(P.filter((p) => p.active !== false), (p) => p.cat)).map(([id, v]) => ({ label: cname[id] || id, value: v })).sort((a, b) => b.value - a.value);
    const reviewDist = [5, 4, 3, 2, 1].map((s) => ({ s, n: R.filter((r) => Math.round(r.rating) === s).length }));
    const qStatus = tally(Q, (q) => q.status);

    const activity = [
      ...Q.slice(0, 6).map((q) => ({ kind: 'quote', icon: 'cart', color: '#7c3aed', text: `Devis — ${q.customer_name || q.email || 'client'}`, time: q.created_at })),
      ...M.slice(0, 6).map((m) => ({ kind: 'msg', icon: 'mail', color: '#2563eb', text: `Message — ${m.name || m.subject || ''}`, time: m.created_at })),
      ...R.slice(0, 6).map((r) => ({ kind: 'review', icon: 'star', color: '#d97706', text: `Avis ${r.rating}★ — ${pname[r.product_id] || r.product_id}`, time: r.created_at })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 9);

    return {
      kpis: {
        visits: { n: visits14, trend: trend(visits14, visitsPrev), spark: visitsByDay },
        uniques: { n: uniq, trend: trend(uniq, uniqPrev) },
        productViews: { n: pv14, trend: trend(pv14, pvPrev) },
        quotesNew: { n: Q.filter((q) => q.status === 'new').length },
        quotesTotal: { n: Q.length },
        products: { n: P.length },
        reviewsPending: { n: R.filter((r) => !r.approved).length },
        subscribers: { n: subsRes.count || 0 },
        messagesNew: { n: M.filter((m) => m.status === 'new').length },
      },
      days14, visitsByDay, leadsByDay, topProd, devices, byCat, reviewDist, qStatus, activity,
    };
  } catch (e) { console.error('getDashboard', e?.message); return null; }
}

export async function getAnalytics() {
  if (!hasSupabase()) return null;
  try {
    const sb = createAdminClient();
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const [ev, products] = await Promise.all([
      sb.from('events').select('type,path,product_id,device,referrer,session_id,created_at').eq('site', SITE).gte('created_at', since).limit(40000),
      sb.from('products').select('id,name'),
    ]);
    const events = ev.data || [], pname = Object.fromEntries((products.data || []).map((p) => [p.id, p.name]));
    const pv = events.filter((e) => e.type === 'page_view');
    const prodViews = events.filter((e) => e.type === 'product_view');
    const days30 = lastDays(30);
    const visitsByDay = days30.map((d) => pv.filter((e) => ymd(e.created_at) === d).length);
    const topPages = Object.entries(tally(pv, (e) => e.path)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
    const topProd = Object.entries(tally(prodViews, (e) => e.product_id)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({ label: pname[id] || id, value: v }));
    const devices = tally(pv, (e) => e.device);
    const referrers = Object.entries(tally(pv, (e) => host(e.referrer))).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
    return {
      totals: { visits: pv.length, uniques: new Set(pv.map((e) => e.session_id)).size, productViews: prodViews.length },
      days30, visitsByDay, topPages, topProd, devices, referrers,
    };
  } catch (e) { console.error('getAnalytics', e?.message); return null; }
}
