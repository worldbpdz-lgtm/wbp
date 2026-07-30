import AppProvider from '@/components/AppProvider';
import Analytics from '@/components/Analytics';
import { getCatalog, getSettings, getAiPublic } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PublicLayout({ children }) {
  // getAiPublic() ne renvoie QUE ce que le navigateur peut voir : ni l'URL de la
  // plateforme IA, ni la clé du widget (elles restent côté serveur).
  const [catalog, settings, ai] = await Promise.all([getCatalog(), getSettings(), getAiPublic()]);
  return (
    <AppProvider catalog={catalog} settings={settings} ai={ai}>
      <Analytics />
      {children}
    </AppProvider>
  );
}
