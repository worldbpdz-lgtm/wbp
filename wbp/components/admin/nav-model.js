// ============================================================================
// Plan du back-office — une seule source pour le menu latéral, le fil d'Ariane
// de la barre du haut et la palette de commandes (Ctrl/⌘ + K).
//   [adresse, libellé, icône, clé du compteur (facultatif), mots-clés]
// ============================================================================

export const GROUPS = [
  { items: [
    ['/admin', 'Tableau de bord', 'grid', null, 'accueil dashboard'],
    ['/admin/notifications', 'Notifications', 'bell', 'notifications', 'alertes cloche'],
    ['/admin/analytics', 'Analytics', 'chart', null, 'statistiques trafic visites'],
  ] },
  { label: 'Ventes', items: [
    ['/admin/orders', 'Commandes', 'truck', 'orders', 'ventes livraison cmd'],
    ['/admin/quotes', 'Demandes de devis', 'receipt', 'quotes', 'devis proforma dev'],
    ['/admin/messages', 'Messages', 'mail', 'messages', 'contact questions'],
    ['/admin/customers', 'Clients', 'user', null, 'crm fiches sociétés'],
  ] },
  { label: 'Catalogue', items: [
    ['/admin/products', 'Produits', 'box', null, 'catalogue fiches prix'],
    ['/admin/brands', 'Marques', 'badge', null, 'dahua logos'],
    ['/admin/categories', 'Catégories', 'layers', null, 'familles'],
    ['/admin/showcase', 'Vitrine', 'bolt', null, 'accueil mise en avant'],
    ['/admin/best-sellers', 'Meilleures ventes', 'star', null, 'top'],
    ['/admin/arrivals', 'Nouveautés', 'spark', null, 'nouveaux'],
    ['/admin/reviews', 'Avis clients', 'star', 'reviews', 'modération notes'],
  ] },
  { label: 'E-mailing', items: [
    ['/admin/subscribers', 'Abonnés', 'user', null, 'newsletter inscrits'],
    ['/admin/campaigns', 'Campagnes', 'mail', null, 'newsletter envoi e-mail'],
  ] },
  { label: 'Site', items: [
    ['/admin/ai', 'Assistant IA', 'headset', null, 'chatbot whatsapp'],
    ['/admin/settings', 'Paramètres', 'cog', null, 'réglages contact documents'],
  ] },
];

/** Raccourcis « créer » proposés dans la palette. */
export const CREATE_ACTIONS = [
  ['/admin/orders/new', 'Nouvelle commande', 'truck', 'créer commande téléphone'],
  ['/admin/quotes/new', 'Nouveau devis', 'receipt', 'créer devis proforma'],
  ['/admin/customers/new', 'Nouveau client', 'user', 'créer fiche client'],
  ['/admin/products/new', 'Nouveau produit', 'box', 'créer produit catalogue'],
];

const FLAT = GROUPS.flatMap((g) => g.items.map(([href, label, icon]) => ({ href, label, icon, group: g.label || null })));

/** Fil d'Ariane d'une adresse : [{ label, href? }, …]. */
export function crumbsOf(pathname = '/admin') {
  const path = String(pathname).replace(/\/+$/, '') || '/admin';
  let best = null;
  for (const it of FLAT) {
    if (path === it.href || (it.href !== '/admin' && path.startsWith(`${it.href}/`))) {
      if (!best || it.href.length > best.href.length) best = it;
    }
  }
  if (!best) best = FLAT[0];
  const out = [];
  if (best.group) out.push({ label: best.group });
  if (path === best.href) out.push({ label: best.label });
  else {
    out.push({ label: best.label, href: best.href });
    const rest = path.slice(best.href.length + 1).split('/')[0];
    out.push({ label: rest === 'new' ? 'Nouveau' : 'Fiche' });
  }
  return out;
}
