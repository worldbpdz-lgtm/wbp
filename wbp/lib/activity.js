import { createAdminClient, hasSupabase } from '@/lib/supabase/server';
import { adminEmails } from '@/lib/admin';
import { SITE } from '@/lib/site';

// ============================================================================
// Journal d'activité des comptes administrateurs.
// ----------------------------------------------------------------------------
// Une ligne par action du back-office : QUI (nom + e-mail), QUOI (libellé
// lisible + élément concerné), QUAND (date + heure). Lu par l'application
// mobile, onglet « Activité ».
//
// Règle de conception : journaliser ne doit JAMAIS faire échouer l'action
// journalisée. Toutes les fonctions d'écriture avalent leurs erreurs — si la
// migration supabase/activity.sql n'a pas encore été appliquée, le back-office
// continue de fonctionner exactement comme avant.
// ============================================================================

// Libellés lisibles, en français, dans la langue du back-office. La clé est le
// nom de la server action ; la valeur est ce que l'équipe lit dans l'app.
export const ACTION_LABELS = {
  'auth.signin': 'Connexion',
  'auth.signout': 'Déconnexion',
  upsertProduct: 'Produit enregistré',
  deleteProduct: 'Produit supprimé',
  toggleProductActive: 'Produit affiché / masqué',
  toggleProductFeatured: 'Produit mis en vitrine',
  updateBrand: 'Marque enregistrée',
  deleteBrand: 'Marque supprimée',
  updateCategory: 'Catégorie enregistrée',
  deleteCategory: 'Catégorie supprimée',
  updateQuoteStatus: 'Statut de devis modifié',
  deleteQuote: 'Devis supprimé',
  updateMessageStatus: 'Statut de message modifié',
  deleteMessage: 'Message supprimé',
  setReviewApproved: 'Avis modéré',
  deleteReview: 'Avis supprimé',
  deleteSubscriber: 'Abonné supprimé',
  saveSetting: 'Paramètre du site modifié',
  addClient: 'Client de référence ajouté',
  deleteClient: 'Client de référence supprimé',
  createCampaign: 'Campagne créée',
  updateCampaign: 'Campagne modifiée',
  deleteCampaign: 'Campagne supprimée',
  sendTestCampaign: 'E-mail de test envoyé',
  sendCampaign: 'Campagne envoyée',
  saveShowcase: 'Vitrine enregistrée',
  addToShowcase: 'Ajout à la vitrine',
  removeFromShowcase: 'Retrait de la vitrine',
  saveBestSellers: 'Meilleures ventes enregistrées',
  saveArrivals: 'Nouveautés enregistrées',
  saveAiConfig: 'Assistant IA configuré',
  testAiConnection: 'Test de connexion IA',
  uploadDoc: 'Fiche technique ajoutée',
  deleteDoc: 'Document supprimé',
};

// Familles d'actions → couleur / icône dans l'app mobile.
const FAMILY = [
  [/^auth\./, 'auth', 'user', '#0E9488'],
  [/Doc$|^uploadDoc|^deleteDoc/, 'documents', 'pdf', '#E0533D'],
  [/Product|Showcase|BestSellers|Arrivals/i, 'catalog', 'box', '#FF5A1F'],
  [/Brand|Category/i, 'catalog', 'layers', '#C98A14'],
  [/Quote/i, 'quotes', 'cart', '#7c3aed'],
  [/Message/i, 'messages', 'mail', '#3B82F6'],
  [/Review/i, 'reviews', 'star', '#F59E0B'],
  [/Campaign|Subscriber/i, 'emailing', 'mail', '#1F9D55'],
  [/Setting|Client|Ai/i, 'site', 'cog', '#7C7167'],
];

export function actionMeta(action = '') {
  for (const [re, family, icon, color] of FAMILY) {
    if (re.test(action)) return { family, icon, color };
  }
  return { family: 'autre', icon: 'grid', color: '#7C7167' };
}

// ----------------------------------------------------------------------------
// Nom affiché d'un compte.
// Priorité : nom saisi dans Supabase (user_metadata.full_name, renseigné à la
// création du compte) → correspondance ADMIN_NAMES → partie gauche de l'e-mail.
// ADMIN_NAMES est facultatif, au format "email:Nom,email:Nom".
// ----------------------------------------------------------------------------
function nameMap() {
  const out = {};
  for (const pair of (process.env.ADMIN_NAMES || '').split(',')) {
    const i = pair.lastIndexOf(':');
    if (i > 0) out[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
  }
  return out;
}

const titleCase = (v) => String(v || '')
  .replace(/[._-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function displayName(user) {
  const email = (typeof user === 'string' ? user : user?.email) || '';
  const meta = typeof user === 'object' ? user?.user_metadata : null;
  const fromMeta = meta?.full_name || meta?.name;
  if (fromMeta) return String(fromMeta);
  const mapped = nameMap()[email.toLowerCase()];
  if (mapped) return mapped;
  return titleCase(email.split('@')[0]) || email || 'Inconnu';
}

// Liste des comptes autorisés, même ceux qui n'ont encore rien fait — l'app
// mobile affiche « aucune activité » plutôt qu'un compte manquant.
export function adminRoster() {
  return adminEmails().map((email) => ({ email, name: displayName(email) }));
}

// ----------------------------------------------------------------------------
// Écriture. N'échoue jamais bruyamment.
// ----------------------------------------------------------------------------
let warnedMissing = false;

export async function logActivity(user, action, target) {
  if (!hasSupabase() || !user?.email || !action) return;
  try {
    const sb = createAdminClient();
    const { error } = await sb.from('admin_activity').insert({
      site: SITE,
      actor_email: String(user.email).toLowerCase(),
      actor_name: displayName(user),
      action: String(action).slice(0, 80),
      target: target == null || target === '' ? null : String(target).slice(0, 200),
    });
    // Table absente = migration pas encore appliquée : on le dit une fois dans
    // les logs serveur, sans casser l'action de l'administrateur.
    if (error && !warnedMissing && /relation .* does not exist|schema cache/i.test(error.message || '')) {
      warnedMissing = true;
      console.warn('[activity] table admin_activity absente — lancez apply-activity.bat');
    }
  } catch (e) {
    console.warn('[activity]', e?.message);
  }
}

// ----------------------------------------------------------------------------
// Lecture (application mobile).
// ----------------------------------------------------------------------------
export async function getActivity({ limit = 200, actor = null, days = 30 } = {}) {
  if (!hasSupabase()) return { people: adminRoster(), items: [], available: false };
  try {
    const sb = createAdminClient();
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let q = sb.from('admin_activity')
      .select('id,actor_email,actor_name,action,target,created_at')
      .eq('site', SITE)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 1000));
    if (actor) q = q.eq('actor_email', String(actor).toLowerCase());

    const { data, error } = await q;
    if (error) return { people: adminRoster(), items: [], available: false, error: error.message };

    // Pas de regroupement par jour ici : le fuseau du serveur (UTC sur Vercel)
    // n'est pas celui d'Alger. Le téléphone regroupe lui-même, à partir de `at`.
    const items = (data || []).map((r) => {
      return {
        id: r.id,
        email: r.actor_email,
        name: r.actor_name || displayName(r.actor_email),
        action: r.action,
        label: ACTION_LABELS[r.action] || r.action,
        target: r.target,
        at: r.created_at,
        ...actionMeta(r.action),
      };
    });

    // Un compteur par personne, sur la fenêtre demandée — l'app affiche
    // « Abdenour · 42 actions » en tête de liste.
    const counts = {};
    for (const it of items) counts[it.email] = (counts[it.email] || 0) + 1;
    const seen = new Set();
    const people = [];
    for (const p of adminRoster()) { seen.add(p.email); people.push({ ...p, count: counts[p.email] || 0 }); }
    for (const it of items) {
      if (seen.has(it.email)) continue;
      seen.add(it.email);
      people.push({ email: it.email, name: it.name, count: counts[it.email] || 0, revoked: true });
    }
    people.sort((a, b) => b.count - a.count);

    return { people, items, available: true, days };
  } catch (e) {
    return { people: adminRoster(), items: [], available: false, error: e?.message };
  }
}
