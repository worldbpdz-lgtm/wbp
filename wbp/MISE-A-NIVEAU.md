# World Business Plus — mise à niveau 2026-07

Tout est déjà dans le code. Il reste **une seule action** de votre côté.

---

## ⚡ À faire maintenant (2 minutes)

1. **Double-cliquez `apply-upgrade.bat`** (à la racine du projet).
   Il ajoute à la base : colonnes images, table de la vitrine, réglages du pop-up
   et configuration de l'assistant IA. Ré-exécutable sans risque.

2. Si le script affiche un avertissement sur le stockage, faites-le à la main :
   **Supabase → Storage → New bucket → nom exact `media` → cochez « Public bucket »**.
   (C'est là que vont les photos que vous uploadez.)

3. Relancez le site (`start-dev.bat`), puis ouvrez `/admin`.

> Sans l'étape 1, le site continue de fonctionner : les nouvelles pages
> s'affichent avec un message expliquant qu'il faut lancer le script.

---

## Ce qui a changé

### 1. Ajouter une marque ou une catégorie — réparé

**La cause exacte du bug :** la colonne `brands.short` (« Abrégé ») était
obligatoire en base. Laisser ce champ vide faisait échouer l'enregistrement avec
une erreur Postgres brute, illisible. En plus, il fallait inventer soi-même un
« identifiant » technique.

Maintenant, dans `/admin/brands` et `/admin/categories` :

- le formulaire **« Nouvelle marque » est en haut** de la page, pas en bas d'une
  longue liste ;
- **le nom suffit** — l'identifiant est généré automatiquement (« Hik Vision » →
  `hik-vision`) et l'abrégé est rempli tout seul ;
- les erreurs s'affichent **en français** (« Cette marque existe déjà »,
  « 13 produits utilisent encore cette marque ») ;
- un bouton **Supprimer** par ligne, bloqué si des produits y sont rattachés
  (avec le nombre exact) ;
- un champ **Ordre d'affichage** et un filtre pour retrouver une marque.

### 2. Images — upload réel partout

Un sélecteur d'image unique, utilisé sur toutes les pages :
**glisser-déposer**, clic pour parcourir, ou **Ctrl+V** pour coller. Onglet
« URL » si vous préférez coller un lien.

| Où | Quoi |
|---|---|
| `/admin/products` → Éditer | Photo principale **+ galerie jusqu'à 10 photos** réordonnables |
| `/admin/brands` | Logo de la marque (page Marques, filtres du catalogue, cartes produit) |
| `/admin/categories` | Image de la catégorie (remplace l'icône sur l'accueil) |
| `/admin/settings` | Visuel du pop-up newsletter |

Chaque image est **recompressée en WebP** et redimensionnée côté serveur : une
photo de 4 Mo sortie d'un téléphone tombe à ~80 Ko. Le site reste rapide.

Les uploads passent par la clé `service_role` **côté serveur** ; le navigateur
n'a jamais de droit d'écriture sur le stockage.

### 3. Vitrine — choisir les produits affichés en premier

Nouvelle page **`/admin/showcase`** (« Vitrine » dans le menu) :

1. filtrez par **catégorie** et par **marque** (avec le nombre de produits) ;
2. cliquez sur un produit à gauche pour l'ajouter à la vitrine ;
3. **glissez-le** ou utilisez ↑ ↓ pour fixer l'ordre exact ;
4. « Enregistrer la vitrine ».

Cet ordre s'applique à « Meilleures ventes » sur l'accueil **et** en tête du
catalogue, y compris dans les résultats filtrés. La vitrine est propre à ce site
(le catalogue reste partagé avec Central Network).

### 4. Pop-up newsletter à l'ouverture

Une carte colorée s'ouvre au premier passage d'un visiteur : dégradé de marque
animé, liste d'avantages, champ e-mail. Sur mobile, elle monte du bas comme une
feuille.

- Les inscriptions arrivent dans **`/admin/subscribers`** (double opt-in existant).
- Elle **ne réapparaît jamais** pour quelqu'un qui s'est inscrit, et se tait
  pendant N jours après une fermeture.
- Tout est réglable dans **`/admin/settings` → « Pop-up newsletter »** : on/off,
  délai, nombre de jours, textes FR/EN/AR, avantages, visuel.
- Fermeture par la croix, le fond, ou **Échap** ; navigation clavier piégée dans
  la carte.

### 5. Boutons, cartes et pages

- Boutons en **dégradé de marque**, avec reflet au survol, léger soulèvement et
  enfoncement au clic.
- **Contour de focus visible** au clavier sur tous les éléments cliquables — il
  n'y en avait aucun avant.
- Cartes produit : zoom léger de la photo au survol, flèche animée.
- Tuiles catégorie / marque : liseré coloré qui se déploie, icône qui pivote.
- Respect de **« mouvement réduit »** (réglage système) : toutes les animations
  se coupent.
- Admin : interrupteurs, sélecteur d'icônes, palette de couleurs, barre
  d'enregistrement collante, fiche produit réorganisée en blocs
  (Identité · Photos · Détails · Visibilité).

Ces styles vivent dans `styles/ui-2026.css` et `styles/admin-2026.css`, chargés
en dernier. **Retirez l'import dans `app/globals.css` et le site retrouve
exactement son ancienne apparence** — rien n'a été supprimé.

### 6. Assistant IA + chat sur le site

Une bulle de chat en bas de page : panneau aux couleurs WBP, réponse qui
s'écrit en direct, suggestions cliquables, **cartes produit cliquables** qui
mènent à la fiche, raccourcis Devis / WhatsApp / Catalogue. RTL complet, plein
écran sur mobile.

**Page `/admin/ai`** pour le brancher, avec deux modes :

- **« Ma plateforme IA »** — votre projet `d-tech-ai` : vous collez l'URL de la
  plateforme et la clé publique du widget, puis **« Tester la connexion »**
  envoie un vrai message et affiche la réponse (ou la raison précise de
  l'échec : 404, clé refusée, canal en pause, délai dépassé…).
- **« Assistant catalogue »** — répond à partir de vos produits, marques et
  catégories, en FR / EN / AR. Fonctionne immédiatement, sans abonnement.

**Pourquoi un relais et pas le script `widget.js` de la plateforme ?**
Le widget d-tech-ai appelle `/api/widget/messages` en **chemin relatif** : posé
sur `wbp-dz.com`, il chercherait cette route sur wbp-dz.com et ne trouverait
rien. Le site expose donc sa propre route **`/api/chat`**, qui relaie vers
`{votre-plateforme}/api/widget/messages`. Trois bénéfices :

1. plus de problème d'origine différente (CORS) ;
2. l'URL de la plateforme et la clé **ne quittent jamais le serveur** — la table
   `ai_config` a RLS activé sans aucune policy, donc elle est illisible avec la
   clé publique ;
3. **si la plateforme ne répond pas**, l'assistant catalogue prend le relais
   automatiquement : le visiteur reçoit une réponse utile, jamais une erreur.

La reprise par un conseiller humain est gérée : `/api/chat/poll` récupère ses
messages et le chat affiche « Un conseiller a rejoint la conversation ».

Les échanges sont journalisés dans `ai_messages` et les 12 derniers s'affichent
en bas de `/admin/ai`.

---

## Nouveau menu d'administration

```
Tableau de bord · Analytics
CATALOGUE   Produits · Marques · Catégories · Vitrine        ← nouveau
ACTIVITÉ    Devis · Messages · Avis
E-MAILING   Abonnés · Campagnes
SITE        Assistant IA  ← nouveau  ·  Paramètres
```

---

## Fichiers

**Nouveaux (17)**

```
supabase/upgrade.sql              migration (ré-exécutable)
apply-upgrade.bat                 à double-cliquer
scripts/apply-upgrade.mjs
lib/storage.js                    upload + compression WebP
lib/ai/assistant.js               assistant catalogue FR/EN/AR
app/admin/upload-actions.js
app/admin/(panel)/showcase/page.js
app/admin/(panel)/ai/page.js
app/api/chat/route.js             relais vers la plateforme IA
app/api/chat/poll/route.js        reprise par un conseiller
components/admin/ImageUpload.jsx  sélecteur d'image + galerie
components/admin/ShowcaseManager.jsx
components/admin/AiSettingsManager.jsx
components/NewsletterPopup.jsx
components/AiChat.jsx
styles/ui-2026.css                UI publique
styles/admin-2026.css             UI admin
```

**Modifiés (16)** — `app/admin/actions.js`, `lib/queries.js`, `lib/logos.js`,
`components/AppProvider.jsx`, `components/AdminNav.jsx`, les managers
Marques / Catégories / Produits / Paramètres, `components/pages/Home.jsx`,
`components/pages/Catalog.jsx`, `app/globals.css`, `app/(public)/layout.js`,
`app/admin/(panel)/layout.js`, `app/admin/(panel)/brands|categories/page.js`.

---

## Vérifications effectuées

- `next build` : **réussi**, 0 erreur — 30 routes dont `/admin/showcase`,
  `/admin/ai`, `/api/chat`, `/api/chat/poll`.
- Migration jouée sur un **PostgreSQL 16 réel**, dans l'ordre
  `setup → newsletter → multisite → featured → upgrade`, puis **3 fois de suite**
  pour confirmer qu'elle est ré-exécutable.
- Vérifié en base : `brands.short` devenu optionnel (le bug d'origine),
  `brands.logo_url`, `categories.image_url`, `featured_picks` (ordre + unicité +
  suppression en cascade avec le produit), `ai_config`, réglage `popup`,
  bucket `media` public.
- **Le blocage possible du schéma `storage`** (ses tables appartiennent parfois à
  un autre rôle Supabase) est isolé : la migration continue et affiche la marche
  à suivre au lieu de s'arrêter.
- Assistant testé sur 11 questions FR / EN / AR : recherche par besoin, par
  référence exacte, prix, coordonnées, salutation, et cas « rien trouvé ».
- Pages capturées en 1440 px, en 390 px (mobile), en thème sombre et en arabe
  (RTL), plus les 5 écrans d'administration.
