import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { getSettings } from '@/lib/queries';
import { SITE } from '@/lib/site';
import { requireMobileEditor } from '@/app/mobile/guard';
import SettingsScreen from '@/components/mobile/SettingsScreen';

// ============================================================================
// Réglages du site, version téléphone.
// ----------------------------------------------------------------------------
// Mêmes sources que /admin/settings : getSettings() (qui complète les valeurs
// absentes par les valeurs par défaut du site) et la table `clients`, filtrée
// sur le site courant — la base est partagée avec l'autre vitrine.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Réglages du site — WBP' };

export default async function MobileSettingsPage() {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const settings = await getSettings();
  const sb = createAdminClient();
  const { data: clients } = await sb.from('clients').select('id,name').eq('site', SITE).order('sort');

  return <SettingsScreen settings={settings} clients={clients || []} />;
}
