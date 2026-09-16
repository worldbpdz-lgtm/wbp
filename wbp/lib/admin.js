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
