# Commandes, fiches clients et notifications — mise en service

Ce document accompagne la mise à jour du site et de l'application mobile WBP :
commandes en ligne avec confirmation, fiches clients (CRM), devis et messages
modifiables, impression des documents, notifications sur les téléphones de
l'équipe, et une série de corrections du back-office.

---

## 1. Mise en service — à faire une fois, dans cet ordre

### 1.1 Sécurité d'abord (urgent)

Le dépôt GitHub est **public** et le dossier `wbp/_to_delete/` contient des
archives `.tgz` avec la clé `service_role` Supabase et l'adresse de la base
(mot de passe compris). Toute personne qui les télécharge peut lire et modifier
toute la base, **y compris celle de Central Network**.

1. Passer le dépôt en **privé** (GitHub → Settings → Danger Zone).
2. Supabase → Project Settings → API : créer de **nouvelles clés**
   (`sb_secret_…` / `sb_publishable_…`), les mettre dans Vercel pour **WBP et
   Central Network**, ainsi que dans `.env.local`, puis **désactiver les
   anciennes clés** (legacy JWT).
3. Supabase → Database → **réinitialiser le mot de passe** de la base.
4. Supprimer `wbp/_to_delete/` du dépôt **et de son historique**.

### 1.2 Mettre à jour la base de données

Fichier : `supabase/commandes-notifications.sql`

- **Supabase → SQL Editor → New query → coller tout le fichier → Run**
- ou double-clic sur `apply-commandes.bat` (utilise `DATABASE_URL` de `.env.local`).

La migration est **additive et ré-exécutable** : elle ne supprime, ne renomme
et ne réécrit aucune table ni donnée existante. Le tableau affiché à la fin
doit montrer « OK » partout.

Base partagée avec Central Network :

- les nouvelles colonnes de `quote_requests` et `contact_messages` ont toutes
  une valeur par défaut : les écritures de l'autre site continuent de marcher,
  avec la clé service_role comme avec les clés anon/authenticated (testé) ;
- les demandes de devis de Central Network reçoivent elles aussi un numéro,
  dans **leur propre série** (colonne ignorée par leur site) ;
- les fiches clients, commandes et notifications sont séparées par `site` ;
  seules les données de WBP (`site = 'wbp'`) sont rattachées aux fiches.

Tant que la migration n'est pas passée, le site continue de fonctionner comme
avant ; les nouveaux écrans affichent un bandeau qui explique quoi faire.

### 1.3 Dépendance

Une seule nouvelle dépendance : `web-push` (envoi des notifications).

- En local : `npm install`
- Sur Vercel : rien à faire, elle s'installe au déploiement.

### 1.4 Clés des notifications (facultatif)

Rien à configurer : les clés VAPID sont créées automatiquement au premier
besoin et rangées dans la table privée `app_secrets` (une paire par site).

Pour les fixer soi-même (optionnel) : `npx web-push generate-vapid-keys`, puis
dans Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et
éventuellement `VAPID_SUBJECT` (par défaut `mailto:commercial@wbp-dz.com`).
⚠️ Changer de clés oblige chaque téléphone à réactiver les notifications.

### 1.5 Déployer

Commit + push comme d'habitude ; Vercel déploie.

---

## 2. Activer les notifications sur les téléphones

Chaque membre de l'équipe, une fois, sur son téléphone :

**iPhone (iOS 16.4 ou plus récent)**
1. Ouvrir `https://wbp-dz.com/mobile` dans **Safari**.
2. Partager (carré avec une flèche) → **Sur l'écran d'accueil** → Ajouter.
3. Ouvrir l'app **WBP** depuis l'écran d'accueil et se connecter.
4. Toucher **« Activer »** sur le bandeau orange (ou la cloche 🔔 en haut →
   « Activer les notifications ») et accepter. Une notification de test arrive.

**Android** : ouvrir `/mobile` dans Chrome (installer l'app est conseillé),
puis même étape 4.

**Ordinateur** : `/admin/notifications` → « Activer » (Chrome, Edge, Firefox).

Réglages par appareil (cloche → « Me prévenir pour ») : nouvelles commandes,
demandes de devis, messages, avis à modérer, activité de l'équipe. Le chiffre
sur l'icône de l'app = demandes à traiter. Se déconnecter coupe les
notifications de ce téléphone (un téléphone prêté ne reçoit plus rien).

---

## 3. Ce qui est nouveau

### Site public
- **« Commander »** à côté de « Demander un devis » dans le panier : nom,
  téléphone, wilaya, adresse, livraison / retrait / installation. Le client
  reçoit un numéro (`CMD-2026-0001`) et un bouton WhatsApp prérempli.
- Prix jamais envoyés par le navigateur (repris du catalogue), anti-doublon
  (même panier, même téléphone : 15 min), 3 commandes / heure / téléphone,
  limitation par adresse IP, champ piège anti-robots.
- Correction : les ~30 produits **sans marque** affichaient une page d'erreur.

### Back-office `/admin`
- **Commandes** : liste (à confirmer / en cours / livrées / annulées, période,
  recherche par nom, téléphone, numéro), fiche complète : articles et prix,
  remise, frais, TVA, livraison, paiement (acompte, reste à payer), appels
  notés, « pris en charge par », historique, motif d'annulation. Confirmation
  bloquée tant qu'un prix ou un contact manque. Export CSV.
- **Devis** : numérotés, chiffrables ligne par ligne, imprimables,
  **convertis en commande** en un clic (sans doublon).
- **Messages** : fiche, notes internes, prise en charge, « créer une commande ».
- **Clients** : fiches créées automatiquement (rapprochement par téléphone puis
  e-mail), chiffre d'affaires, historique complet, NIF/NIS/RC/AI, détection
  des doublons, **fusion** de deux fiches, export CSV.
- **Impression / PDF** : bon de commande, facture proforma, devis — montant en
  lettres, mentions légales réglables dans Paramètres → « Documents imprimés ».
- **Notifications** : cloche avec fil lu / non lu, alertes en direct (son,
  compteur dans l'onglet), notifications du système sur l'ordinateur.
- Tableau de bord : commandes à confirmer, CA confirmé 30 j, dernières
  commandes, activité cliquable.

### Application mobile `/mobile`
- **Demandes** : commandes + devis + messages, recherche (nom, téléphone,
  numéro), filtres, pastille « à traiter », ouverture directe depuis une
  notification.
- **Fiche commande** : appeler / WhatsApp, fixer les prix, confirmer, noter un
  appel, livraison, paiement, notes, prise en charge, historique, récapitulatif
  WhatsApp prérempli, bon de commande / proforma en PDF.
- Devis et messages : « Je m'en occupe », statut, note interne, transformer en
  commande.
- Cloche 🔔 + écran Notifications, bandeau d'activation, badge sur l'icône.
- **Compte propriétaire (Cherif)** : voit Stats · Demandes · Activité en
  **lecture seule** (il peut appeler le client). Pour lui donner aussi la
  modification sur téléphone : `isPhoneEditor()` dans `lib/admin.js`.

---

## 4. Corrections du back-office (audit)

- Pages larges (devis, commandes, clients) : le tableau défile dans son cadre
  au lieu de pousser les boutons hors de l'écran.
- Back-office sur téléphone / tablette : menu repliable (« Menu ») au lieu
  d'un bloc de 20 liens avant le contenu.
- App mobile : tous les champs étaient en 13 px à cause d'une règle CSS
  invalide → **zoom automatique de l'iPhone** à chaque saisie, boutons sans
  gras. Corrigé (16 px).
- Produits : catégorie affichée par son nom, filtres par catégorie et par
  marque, message « aucun produit ».
- Avis : nom du produit (lien vers sa fiche) au lieu de l'identifiant interne.
- Campagnes : boutons qui restaient grisés après une coupure réseau,
  enregistrement vérifié avant test / envoi, alerte avant de quitter un
  brouillon, aperçu isolé (le HTML de la campagne ne peut plus exécuter de
  script dans le back-office).
- Statuts affichés en français partout (« Accepté », « Perdu »… au lieu des
  codes bruts), « il y a 0 min » → « à l'instant ».
- Formulaires de devis/commande : champ « Remise » qui faisait 25 px de large.
- Paramètres : seules les clés de réglage connues peuvent être enregistrées.

---

## 5. Sécurité

- Toutes les écritures passent par des server actions qui revérifient la
  session et `ADMIN_EMAILS`, filtrent par site et journalisent l'action.
- Nouvelles tables : RLS activée **sans aucune policy** (illisibles avec les
  clés anon/authenticated) ; fonctions de trigger non appelables en RPC.
- Notifications : envoyées uniquement aux comptes d'`ADMIN_EMAILS` (un compte
  retiré cesse d'être notifié), uniquement vers les services push connus
  (Apple, Google, Mozilla, Microsoft — protection SSRF), contenu chiffré de
  bout en bout ; abonnements expirés supprimés automatiquement.
- Modifications concurrentes : si un collègue a modifié une commande entre-
  temps, l'enregistrement est refusé au lieu d'écraser son travail.
- Exports CSV protégés contre l'injection de formules (Excel).

---

## 6. Vérifications effectuées

Sur une copie locale (PostgreSQL 16 + simulation de l'API Supabase + Chrome) :
migration ré-exécutée plusieurs fois, normalisation des téléphones identique en
SQL et en JavaScript (chiffres arabes compris), commande visiteur → confirmation
web, devis → commande (web et mobile), fiche client + doublon + fusion,
commande manuelle, impression, compte propriétaire en lecture seule, toutes les
pages du back-office (ordinateur et téléphone) sans erreur, et une
notification push **réellement chiffrée** reçue et déchiffrée par un faux
service push (signature VAPID vérifiée, abonnement expiré supprimé).

La base de production n'a pas été modifiée.
