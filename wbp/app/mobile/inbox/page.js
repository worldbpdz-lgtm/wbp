import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { SITE } from '@/lib/site';
import { requireMobileEditor } from '@/app/mobile/guard';
import Inbox from '@/components/mobile/Inbox';

// ============================================================================
// Demandes entrantes, version téléphone : devis ET messages de contact.
// ----------------------------------------------------------------------------
// Le back-office web les sépare en deux pages (/admin/quotes, /admin/messages)
// parce qu'une souris survole deux entrées de menu sans effort. Sur un
// téléphone, ces deux listes sont la MÊME tâche : quelqu'un a laissé son
// numéro, il faut le rappeler. Les séparer obligerait à vérifier deux écrans
// plusieurs fois par jour, et le second serait oublié.
//
// 200 lignes par table, filtrées ensuite dans le téléphone : à ce volume la
// réponse pèse quelques dizaines de kilo-octets, et les onglets « Devis » /
// « À traiter » réagissent au doigt sans aller-retour réseau. C'est l'inverse
// du catalogue (des milliers de fiches), qui filtre en base.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Demandes — WBP' };

const LIMIT = 200;

// La base est partagée avec l'autre site : sans `.eq('site', SITE)`, on
// afficherait — et on pourrait supprimer — les demandes du voisin.
export default async function MobileInbox() {
  await requireMobileEditor();
  if (!hasSupabase()) return null;

  const sb = createAdminClient();
  const [quotes, messages] = await Promise.all([
    sb.from('quote_requests')
      .select('id,customer_name,company,email,phone,message,items,status,created_at')
      .eq('site', SITE).order('created_at', { ascending: false }).limit(LIMIT),
    sb.from('contact_messages')
      .select('id,name,company,email,phone,subject,message,status,created_at')
      .eq('site', SITE).order('created_at', { ascending: false }).limit(LIMIT),
  ]);

  // Une seule forme pour les deux tables (`customer_name` d'un côté, `name` de
  // l'autre ; `subject` et `items` n'existent que d'un seul côté). Le composant
  // client n'a ainsi aucun branchement à faire pour AFFICHER une ligne — il
  // n'en garde qu'un, pour savoir quelle server action appeler.
  const rows = [
    ...(quotes.data || []).map((q) => ({
      kind: 'quote',
      id: q.id,
      at: q.created_at,
      name: q.customer_name || null,
      company: q.company || null,
      email: q.email || null,
      phone: q.phone || null,
      subject: null,
      body: q.message || null,
      status: q.status || null,
      items: (Array.isArray(q.items) ? q.items : []).map((it) => ({
        qty: it?.qty ?? 1,
        code: it?.code || null,
        name: it?.name || null,
      })),
    })),
    ...(messages.data || []).map((m) => ({
      kind: 'message',
      id: m.id,
      at: m.created_at,
      name: m.name || null,
      company: m.company || null,
      email: m.email || null,
      phone: m.phone || null,
      subject: m.subject || null,
      body: m.message || null,
      status: m.status || null,
      items: [],
    })),
  ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

  const err = quotes.error || messages.error;

  return <Inbox rows={rows} error={err ? (err.message || 'Erreur inconnue') : null} />;
}
