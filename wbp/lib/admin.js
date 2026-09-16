// Returns the list of admin emails from env (comma-separated).
export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function isAdminEmail(email) {
  if (!email) return false;
  const list = adminEmails();
  return list.length === 0 ? false : list.includes(String(email).toLowerCase());
}

// ----------------------------------------------------------------------------
// Le compte « propriétaire » : la PREMIÈRE adresse d'ADMIN_EMAILS.
//
// Tous les comptes ont exactement les mêmes droits sur le back-office — c'est
// la seule différence entre eux, et elle ne concerne QUE l'application mobile :
// le propriétaire y voit l'onglet « Activité » (qui a fait quoi dans /admin),
// les autres comptes ont une application d'administrateur normal, sans vue sur
// le travail de leurs collègues.
//
// Le journal, lui, continue d'enregistrer tout le monde : ce qui change, c'est
// qui peut le lire.
//
// L'ordre d'ADMIN_EMAILS compte donc. Pour changer de propriétaire, il suffit
// de placer son adresse en tête de la variable, puis de redéployer.
// ----------------------------------------------------------------------------
export function ownerEmail() {
  return adminEmails()[0] || null;
}

export function isOwnerEmail(email) {
  const owner = ownerEmail();
  if (!owner || !email) return false;
  return String(email).toLowerCase() === owner;
}

// ----------------------------------------------------------------------------
// Qui peut MODIFIER le site depuis le téléphone.
//
// Les comptes de l'équipe : ils font le travail (fiches produits, photos,
// devis, avis, réglages) et ont besoin de le faire depuis un téléphone, dans un
// dépôt ou chez un client. Le propriétaire, lui, a l'application de
// supervision — statistiques et journal d'activité — et garde `/admin` sur
// ordinateur pour ses propres modifications.
//
// Deux rôles, deux applications, aucun recouvrement : c'est ce qui permet à
// chaque écran d'être conçu pour un seul usage au lieu d'être une liste
// d'options grisées.
//
// Le back-office web `/admin` n'est PAS concerné : tous les comptes y ont les
// mêmes droits, comme avant.
// ----------------------------------------------------------------------------
export function isPhoneEditor(email) {
  return isAdminEmail(email) && !isOwnerEmail(email);
}
