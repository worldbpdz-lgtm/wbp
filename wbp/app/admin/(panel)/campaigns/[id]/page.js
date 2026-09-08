import { notFound } from 'next/navigation';
import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { emailConfigured } from '@/lib/email/send';
import CampaignEditor from '@/components/admin/CampaignEditor';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }) {
  if (!hasSupabase()) return null;
  const { id } = await params;
  const sb = createAdminClient();
  // La base est partagée entre les deux sites : sans ce filtre, l'administrateur
  // d'un site pouvait ouvrir la campagne de l'autre en devinant son identifiant.
  const { data: c } = await sb.from('email_campaigns').select('*').eq('site', SITE).eq('id', id).maybeSingle();
  if (!c) notFound();

  const [sentR, openR, clickR, audienceR] = await Promise.all([
    sb.from('email_campaign_sends').select('id', { count: 'exact', head: true }).eq('campaign_id', id),
    sb.from('email_campaign_sends').select('id', { count: 'exact', head: true }).eq('campaign_id', id).not('opened_at', 'is', null),
    sb.from('email_campaign_sends').select('id', { count: 'exact', head: true }).eq('campaign_id', id).not('clicked_at', 'is', null),
    sb.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('site', SITE).eq('status', 'subscribed'),
  ]);
  const stats = { sent: sentR.count || 0, opened: openR.count || 0, clicked: clickR.count || 0, audience: audienceR.count || 0 };

  return (
    <CampaignEditor
      campaign={{ id: c.id, subject: c.subject || '', preheader: c.preheader || '', body_html: c.body_html || '', status: c.status, sent_at: c.sent_at }}
      stats={stats}
      emailLive={emailConfigured()}
    />
  );
}
