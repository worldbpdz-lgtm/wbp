'use server';
import { randomUUID } from 'node:crypto';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { sendEmail, siteUrl } from '@/lib/email/send';
import { confirmEmailHtml } from '@/lib/email/template';
import { SITE } from '@/lib/site';

const str = (v, max = 2000) => (v == null ? null : String(v).slice(0, max).trim() || null);
const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');
const normLang = (l) => (['fr', 'en', 'ar'].includes(l) ? l : 'fr');

export async function submitQuote(payload) {
  const row = {
    site: SITE,
    customer_name: str(payload.customer_name, 200),
    company: str(payload.company, 200),
    email: str(payload.email, 200),
    phone: str(payload.phone, 60),
    message: str(payload.message, 4000),
    items: Array.isArray(payload.items)
      ? payload.items.slice(0, 200).map((i) => ({ id: str(i.id, 60), name: str(i.name, 300), code: str(i.code, 120), qty: Math.max(1, parseInt(i.qty, 10) || 1) }))
      : [],
  };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { error } = await sb.from('quote_requests').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true, stored: true };
}

export async function submitContact(payload) {
  const row = {
    site: SITE,
    name: str(payload.name, 200), company: str(payload.company, 200),
    email: str(payload.email, 200), phone: str(payload.phone, 60),
    subject: str(payload.subject, 300), message: str(payload.message, 5000),
  };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { error } = await sb.from('contact_messages').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true, stored: true };
}

export async function submitReview(payload) {
  const rating = Math.min(5, Math.max(1, parseInt(payload.rating, 10) || 0));
  if (!payload.product_id || !rating || !str(payload.body)) return { ok: false, error: 'invalid' };
  const row = {
    site: SITE,
    product_id: str(payload.product_id, 60), author: str(payload.author, 120) || 'Anonyme',
    rating, title: str(payload.title, 200), body: str(payload.body, 4000),
    verified: false, approved: true,
  };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { error } = await sb.from('reviews').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true, stored: true };
}

// Double opt-in: create/refresh a PENDING subscriber and email a confirmation link.
export async function subscribeNewsletter(email, lang = 'fr') {
  const e = (str(email, 200) || '').toLowerCase();
  if (!isEmail(e)) return { ok: false, error: 'invalid' };
  const L = normLang(lang);
  if (!hasSupabase()) return { ok: true, stored: false, pending: true };
  const sb = createAdminClient();
  const { data: existing } = await sb
    .from('newsletter_subscribers').select('id,status,token').eq('site', SITE).eq('email', e).maybeSingle();
  if (existing && existing.status === 'subscribed') return { ok: true, stored: true, already: true };
  const token = existing?.token || randomUUID().replace(/-/g, '');
  const { error } = await sb
    .from('newsletter_subscribers')
    .upsert({ site: SITE, email: e, status: 'pending', token, lang: L, source: 'website' }, { onConflict: 'site,email' });
  if (error) return { ok: false, error: error.message };
  const confirmUrl = `${siteUrl()}/newsletter/confirm?token=${token}&lang=${L}`;
  const subject = L === 'ar' ? 'أكد اشتراكك — World Business Plus'
    : L === 'en' ? 'Confirm your subscription — World Business Plus'
    : 'Confirmez votre inscription — World Business Plus';
  await sendEmail({ to: e, subject, html: confirmEmailHtml({ confirmUrl, lang: L }) });
  return { ok: true, stored: true, pending: true };
}

// Double opt-in confirmation (token from the confirmation email link).
export async function confirmSubscription(token) {
  const tk = str(token, 80);
  if (!tk) return { ok: false, error: 'invalid' };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .update({ status: 'subscribed', confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq('token', tk).select('email').maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'notfound' };
  return { ok: true, email: data.email };
}

// One-click unsubscribe (token from the email footer link).
export async function unsubscribeByToken(token) {
  const tk = str(token, 80);
  if (!tk) return { ok: false, error: 'invalid' };
  if (!hasSupabase()) return { ok: true, stored: false };
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('token', tk).select('email').maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'notfound' };
  return { ok: true, email: data.email };
}

// ---------- Analytics ----------
function parseDevice(ua = '') {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(s)) return 'mobile';
  return 'desktop';
}

export async function trackEvent({ type, path, productId, sessionId } = {}) {
  try {
    if (!hasSupabase()) return { ok: true, stored: false };
    const t = type === 'product_view' ? 'product_view' : 'page_view';
    const { headers } = await import('next/headers');
    const h = await headers();
    const ua = h.get('user-agent') || '';
    const referrer = h.get('referer') || null;
    const sb = createAdminClient();
    await sb.from('events').insert({
      site: SITE,
      type: t,
      path: str(path, 300),
      product_id: str(productId, 60),
      referrer: str(referrer, 400),
      device: parseDevice(ua),
      session_id: str(sessionId, 60),
    });
    return { ok: true, stored: true };
  } catch {
    return { ok: false };
  }
}
