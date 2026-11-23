// ============================================================================
// Vocabulaire commun des devis, commandes, messages et clients.
// ----------------------------------------------------------------------------
// Module PUR, partagé par le serveur, le back-office web et l'application
// mobile : un statut n'a qu'un libellé et qu'une couleur, où qu'il s'affiche.
// Avant, le back-office montrait les codes bruts (« new », « contacted ») dans
// ses menus déroulants et dans le graphique « Devis par statut ».
//
// Tons (`tone`) : warn = à traiter · info = en cours · ok = terminé ·
// off = rangé · bad = annulé. Les feuilles de style web et mobile ont chacune
// une couleur pour ces cinq tons.
// ============================================================================

// ------------------------------------------------------------------- devis --
export const QUOTE_STATUSES = [
  { value: 'new', label: 'Nouveau', tone: 'warn', hint: 'Pas encore traité' },
  { value: 'contacted', label: 'Contacté', tone: 'info', hint: 'Le client a été joint' },
  { value: 'quoted', label: 'Devis envoyé', tone: 'info', hint: 'Prix communiqués au client' },
  { value: 'won', label: 'Accepté', tone: 'ok', hint: 'Converti en commande' },
  { value: 'lost', label: 'Perdu', tone: 'off', hint: 'Le client n’a pas donné suite' },
  { value: 'closed', label: 'Clôturé', tone: 'off', hint: 'Rangé sans suite' },
];

// ---------------------------------------------------------------- messages --
export const MESSAGE_STATUSES = [
  { value: 'new', label: 'Nouveau', tone: 'warn', hint: 'Pas encore lu' },
  { value: 'read', label: 'Lu', tone: 'info', hint: 'Lu, réponse à faire' },
  { value: 'replied', label: 'Répondu', tone: 'ok', hint: 'Le client a eu sa réponse' },
  { value: 'closed', label: 'Clôturé', tone: 'off', hint: 'Rangé' },
];

// --------------------------------------------------------------- commandes --
export const ORDER_STATUSES = [
  { value: 'pending', label: 'À confirmer', tone: 'warn', hint: 'Appeler le client pour confirmer prix et livraison', action: 'Remettre à confirmer' },
  { value: 'confirmed', label: 'Confirmée', tone: 'info', hint: 'Prix et livraison validés avec le client', action: 'Confirmer la commande' },
  { value: 'preparing', label: 'En préparation', tone: 'info', hint: 'Préparation au dépôt', action: 'Passer en préparation' },
  { value: 'shipped', label: 'En livraison', tone: 'info', hint: 'Partie chez le client', action: 'Marquer en livraison' },
  { value: 'delivered', label: 'Livrée', tone: 'ok', hint: 'Livrée (et installée le cas échéant)', action: 'Marquer livrée' },
  { value: 'cancelled', label: 'Annulée', tone: 'bad', hint: 'Commande annulée', action: 'Annuler la commande' },
];

/** Étape suivante proposée en un geste, depuis chaque statut. */
export const ORDER_NEXT = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'shipped',
  shipped: 'delivered',
  delivered: null,
  cancelled: null,
};

/** Statuts qui comptent dans le chiffre d'affaires. */
export const REVENUE_STATUSES = ['confirmed', 'preparing', 'shipped', 'delivered'];
/** Statuts « en cours » (ni à confirmer, ni terminés). */
export const OPEN_ORDER_STATUSES = ['confirmed', 'preparing', 'shipped'];

export const DELIVERY_METHODS = [
  { value: 'delivery', label: 'Livraison', hint: 'Livrée à l’adresse du client' },
  { value: 'pickup', label: 'Retrait au dépôt', hint: 'Le client passe à Kouba' },
  { value: 'installation', label: 'Livraison + installation', hint: 'Posée par nos techniciens' },
];

export const ORDER_SOURCES = [
  { value: 'website', label: 'Site web' },
  { value: 'quote', label: 'Depuis un devis' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Téléphone' },
  { value: 'email', label: 'E-mail' },
  { value: 'visit', label: 'Sur place' },
  { value: 'message', label: 'Depuis un message' },
  { value: 'manual', label: 'Saisie manuelle' },
];

export const CANCEL_REASONS = [
  'Client injoignable',
  'Le client a annulé',
  'Prix refusé',
  'Rupture de stock',
  'Commande en double',
  'Fausse commande',
  'Autre',
];

export const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'Pas de réponse' },
  { value: 'callback', label: 'Rappeler plus tard' },
  { value: 'busy', label: 'Occupé / messagerie' },
  { value: 'wrong_number', label: 'Numéro erroné' },
  { value: 'reached', label: 'Client joint' },
];

export const PAYMENT_METHODS = [
  'Espèces',
  'Chèque',
  'Virement bancaire',
  'CCP / BaridiMob',
  'Carte CIB / Edahabia',
  'À la livraison',
  'Autre',
];

export const CUSTOMER_KINDS = [
  { value: 'entreprise', label: 'Entreprise' },
  { value: 'institution', label: 'Institution / public' },
  { value: 'installateur', label: 'Installateur' },
  { value: 'revendeur', label: 'Revendeur' },
  { value: 'particulier', label: 'Particulier' },
];

export const NOTIFICATION_KINDS = [
  { value: 'order', label: 'Nouvelles commandes', hint: 'Une commande passée sur le site', icon: 'cart' },
  { value: 'quote', label: 'Demandes de devis', hint: 'Un client demande des prix', icon: 'pdf' },
  { value: 'message', label: 'Messages et questions', hint: 'Formulaire de contact du site', icon: 'mail' },
  { value: 'review', label: 'Avis à modérer', hint: 'Un avis attend d’être publié', icon: 'star' },
  { value: 'team', label: 'Activité de l’équipe', hint: 'Commande confirmée, annulée ou livrée par un collègue', icon: 'user' },
];

// ------------------------------------------------------------------ outils --
const index = (list) => Object.fromEntries(list.map((s) => [s.value, s]));
const Q = index(QUOTE_STATUSES);
const M = index(MESSAGE_STATUSES);
const O = index(ORDER_STATUSES);
const D = index(DELIVERY_METHODS);
const S = index(ORDER_SOURCES);
const K = index(CUSTOMER_KINDS);
const C = index(CALL_OUTCOMES);

const unknown = (value) => ({ value, label: value || '—', tone: 'off', hint: '' });

export const quoteStatus = (v) => Q[v] || (v ? unknown(v) : Q.new);
export const messageStatus = (v) => M[v] || (v ? unknown(v) : M.new);
export const orderStatus = (v) => O[v] || unknown(v);
export const deliveryLabel = (v) => (D[v] || D.delivery).label;
export const sourceLabel = (v) => (S[v] ? S[v].label : (v || '—'));
export const kindLabel = (v) => (K[v] ? K[v].label : (v || ''));
export const callLabel = (v) => (C[v] ? C[v].label : (v || 'Appel'));

/** « à traiter » : nouveau devis, nouveau message, commande à confirmer. */
export const isQuoteTodo = (s) => !s || s === 'new' || s === 'nouveau';
export const isMessageTodo = (s) => !s || s === 'new' || s === 'nouveau';
export const isOrderTodo = (s) => s === 'pending';

/** Nom affiché d'un client à partir d'une ligne (devis, commande, fiche…). */
export function personOf(r = {}) {
  const name = (r.customer_name || r.name || '').trim();
  const company = (r.company || '').trim();
  if (name && company) return `${name} · ${company}`;
  return name || company || r.phone || r.email || 'Client sans nom';
}

// Clé stable pour une ligne de commande ajoutée côté navigateur.
export const lineKey = () => Math.random().toString(36).slice(2, 10);
