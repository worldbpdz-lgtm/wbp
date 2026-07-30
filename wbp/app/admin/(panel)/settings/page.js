import { hasSupabase, createAdminClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/queries';
import SettingsManager from '@/components/admin/SettingsManager';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Paramètres' };

export default async function SettingsPage() {
  if (!hasSupabase()) return null;
  const settings = await getSettings();
  const sb = createAdminClient();
  const { data: clients } = await sb.from('clients').select('id,name').eq('site', SITE).order('sort');
  return (
    <>
      <div className="adm-head"><div><h1 className="adm-h1">Paramètres du site</h1><p className="adm-sub">Ces informations s’affichent sur le site public.</p></div></div>
      <SettingsManager settings={settings} clients={clients || []} />
    </>
  );
}
