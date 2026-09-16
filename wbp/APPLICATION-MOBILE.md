# Application mobile « WBP »

Application pour l'équipe, installée sur l'écran d'accueil de l'iPhone. Une
seule application, la même adresse pour tout le monde — mais **deux versions**,
selon le compte qui se connecte.

**Le propriétaire** (la 1ʳᵉ adresse d'`ADMIN_EMAILS`) a l'application de
**supervision**, deux onglets :

| Onglet | Ce qu'il montre |
|---|---|
| **Stats** | Le trafic du site et les demandes de devis — les mêmes chiffres que `/admin`. |
| **Activité** | Qui a fait quoi dans le back-office, quel jour, à quelle heure. |

**Les comptes de l'équipe** (toutes les autres adresses) ont l'application de
**travail**, quatre onglets :

| Onglet | Ce qu'on y fait |
|---|---|
| **Stats** | Les mêmes chiffres que le propriétaire. |
| **Produits** | Chercher une fiche, la modifier, **changer les photos** (y compris en photographiant le produit avec le téléphone), joindre une fiche technique PDF, masquer, mettre en vitrine, supprimer, créer. |
| **Demandes** | Les demandes de devis et les messages de contact : lire, changer le statut, **appeler ou écrire sur WhatsApp en un appui**, supprimer. |
| **Plus** | Avis clients · Vitrine du site · Marques · Catégories · Réglages du site. |

C'est tout le back-office `/admin`, refait pour un écran de téléphone et un
pouce — pas le site web rétréci. Les deux interfaces écrivent par les **mêmes
fonctions serveur** : une modification faite au téléphone est identique à la même
modification faite sur ordinateur, y compris dans le journal d'activité.

Les deux versions ne se recouvrent pas : le propriétaire n'a pas les écrans
d'édition sur son téléphone (il modifie depuis `/admin`, sur ordinateur), et
l'équipe n'a pas le journal d'activité. Dans les deux sens, **taper l'adresse à
la main ne sert à rien** : le serveur refuse la page et l'API. Le journal, lui,
continue d'enregistrer tout le monde ; ce qui change, c'est qui peut le lire.

Adresse : **`https://VOTRE-DOMAINE/mobile`**

---

## 1) Installer l'application sur l'iPhone

Il n'y a rien à télécharger sur l'App Store — l'application s'installe depuis
Safari, en trois gestes, et se comporte ensuite comme n'importe quelle autre
app : icône WBP sur l'écran d'accueil, ouverture en plein écran, pas de barre
d'adresse.

1. Ouvrir **Safari** (pas Chrome : sur iPhone, seul Safari sait installer une
   application) et aller sur `https://VOTRE-DOMAINE/mobile`.
2. Toucher le bouton **Partager** (le carré avec la flèche vers le haut).
3. Faire défiler et choisir **« Sur l'écran d'accueil »**, puis **Ajouter**.

L'icône **WBP** apparaît sur l'écran d'accueil. À la première ouverture, l'écran
orange « Welcome » s'affiche, puis l'écran de connexion. Aux ouvertures
suivantes, le prénom du compte de ce téléphone est ajouté : « Welcome Cherif »,
« Welcome Abdenour »… Le prénom vient du nom du compte (voir `ADMIN_NAMES`
ci-dessous) et il est gardé sur le téléphone, donc il s'affiche tout de suite,
avant même que le réseau réponde.

> Sur Android, c'est le même principe : Chrome propose « Installer
> l'application » ou « Ajouter à l'écran d'accueil ».

---

## 2) Comptes

Les comptes de l'application sont **les mêmes** que ceux du back-office
`/admin` : un utilisateur Supabase Auth, dont l'adresse figure dans la variable
`ADMIN_EMAILS`. Tous ont exactement les mêmes droits sur le site — ajouter un
produit, traiter un devis, envoyer une campagne.

**L'ordre d'`ADMIN_EMAILS` compte.** La première adresse de la liste est le
compte **propriétaire** — celui qui a l'application de supervision. Les suivantes
sont les comptes de l'équipe, qui ont l'application de travail.

```
ADMIN_EMAILS=cherif@wbp-dz.com,abdenour@wbp-dz.com,sara@wbp-dz.com
              └─ propriétaire ──┘ └──────── équipe (édition) ──────────┘
              Stats + Activité      Stats + Produits + Demandes + Plus
```

Pour changer de propriétaire, il suffit de placer son adresse en tête de la
variable et de redéployer. Aucun code à toucher, aucune autre variable à créer.

> **Si le propriétaire veut aussi modifier depuis son téléphone**, la règle tient
> en une fonction : `isPhoneEditor()` dans `lib/admin.js`. Il suffit de lui faire
> renvoyer `isAdminEmail(email)` (sans exclure le propriétaire) pour que tout le
> monde ait les quatre onglets ; l'onglet Activité, lui, reste au propriétaire.
> C'est le seul endroit à changer.

**Ajouter une personne :**

1. Supabase → **Authentication → Users → Add user** : e-mail + mot de passe,
   en cochant **Auto Confirm User**.
2. Ajouter la même adresse à `ADMIN_EMAILS`, dans `.env.local` **et** dans
   Vercel → Settings → Environment Variables.
3. Redéployer (Vercel → Deployments → ⋯ → Redeploy).

**Retirer une personne :** enlever son adresse de `ADMIN_EMAILS` et redéployer.
Elle perd immédiatement l'accès au back-office et à l'application, même si son
compte Supabase existe encore. Son historique reste dans le journal.

Le nom affiché est déduit de l'adresse (`abdenour@wbp-dz.com` → « Abdenour »).
Pour une adresse qui ne ressemble pas au prénom, renseigner la variable
facultative `ADMIN_NAMES` au format `email:Nom,email:Nom`. C'est ce nom qui
apparaît dans le journal **et** sur l'écran d'ouverture de son téléphone.

---

## 3) Journal d'activité

Chaque action du back-office écrit une ligne dans la table `admin_activity` :
**qui** (nom + e-mail), **quoi** (enregistrement d'un produit, changement de
statut d'un devis, modération d'un avis, envoi d'une campagne, connexion,
déconnexion…), **sur quoi** (le nom du produit, le numéro du devis…) et
**quand**.

Installation, une seule fois : double-clic sur **`apply-activity.bat`** à la
racine du projet. Tant que ce n'est pas fait, l'onglet Activité affiche un
message le rappelant — le reste du site continue de fonctionner normalement.

Trois garde-fous :

- La table est en **Row Level Security sans aucune policy** : personne ne peut
  la lire ni l'écrire depuis le navigateur, même connecté. Seul le serveur y
  accède. Un journal que la personne surveillée peut effacer ne sert à rien.
- **Seul le propriétaire le lit.** `/api/mobile/activity` vérifie que le compte
  connecté est la première adresse d'`ADMIN_EMAILS` et répond `403` à tous les
  autres. C'est le serveur qui décide : masquer l'onglet sur le téléphone ne
  protégerait rien, puisque n'importe qui peut taper une adresse.
- Journaliser ne peut jamais faire échouer l'action journalisée : si la base
  est injoignable, l'action de l'administrateur passe quand même.

L'historique est conservé 12 mois (fonction `prune_admin_activity()`).

---

## 4) Modifier le site depuis le téléphone

Les comptes de l'équipe ont les mêmes pouvoirs qu'en `/admin`. Trois choses
valent d'être connues.

**Les photos.** Sur la fiche d'un produit, deux boutons : **Photo**, qui ouvre
directement la caméra arrière du téléphone, et **Galerie**, qui prend plusieurs
images déjà enregistrées. On peut donc photographier un produit dans le dépôt et
l'avoir en ligne trente secondes plus tard. Les fichiers passent par le même
traitement que sur ordinateur (conversion en WebP, vérifications).

Une seule liste de photos, et **la première est celle qui s'affiche sur le
site** : un appui sur une photo permet de la définir comme principale, de la
déplacer ou de la supprimer. Pas de « photo principale » séparée comme sur
ordinateur — sur un écran de téléphone, deux sélecteurs d'images côte à côte sont
illisibles.

**Ce qui est enregistré, et quand.** Rien n'est écrit en continu : la barre
**Enregistrer** apparaît en bas dès qu'il y a une modification, et c'est elle qui
écrit. Un téléphone perd le réseau au milieu d'un formulaire ; mieux vaut un seul
envoi explicite qu'une fiche à moitié écrite. Les actions immédiates (masquer,
mettre en vitrine, changer un statut, supprimer) le disent par un message court
en bas de l'écran, et une suppression demande toujours confirmation.

**Aucune modification hors connexion.** Les écrans d'édition ne sont jamais mis
en cache : une fiche rechargée depuis la mémoire du téléphone afficherait
l'ancien prix et l'ancienne photo, et l'enregistrement écraserait alors le
travail de quelqu'un d'autre sans que personne ne le voie. Sans réseau,
l'application ramène à l'écran des statistiques.

---

## 5) Hors connexion

Les **statistiques** gardent leur dernière réponse dans le stockage local du
téléphone et s'affichent immédiatement à l'ouverture, pendant que la mise à jour
part en arrière-plan. Sans réseau, l'app s'ouvre quand même et indique de quand
datent les chiffres.

Concrètement :

- `localStorage` pour les chiffres, l'historique et le rôle du compte (c'est ce
  qui permet à la bonne barre d'onglets d'apparaître sans attendre le réseau) ;
- un *service worker* (`public/sw.js`), limité à `/mobile`, pour la coquille de
  l'app (pages de lecture, icônes, fichiers statiques) ;
- **rien** n'est mis en cache côté `/api`, ni sur les écrans d'édition : voir la
  section précédente.

Le bouton **Déconnexion** efface le cache local du téléphone en même temps
qu'il ferme la session — un appareil prêté n'affiche pas les chiffres du compte
précédent.

Après un déploiement qui modifie l'app, incrémenter `VERSION` en haut de
`public/sw.js` pour que tous les téléphones récupèrent la nouvelle version.

---

## 6) Fichiers

```
app/mobile/page.js             Stats (tous les comptes)
app/mobile/activity/           Journal — propriétaire seulement
app/mobile/products/           Liste + fiche produit (photos, PDF, tout)
app/mobile/inbox/              Devis et messages · appel / WhatsApp
app/mobile/reviews/            Modération des avis
app/mobile/vitrine/            Vitrine · meilleures ventes · nouveautés
app/mobile/marques/            Marques et logos
app/mobile/categories/         Catégories et images
app/mobile/reglages/           Réglages du site public
app/mobile/plus/               Menu vers les écrans ci-dessus
app/mobile/guard.js            Barrière d'accès des écrans d'édition
app/mobile/layout.js           Nom « WBP », icône, plein écran iOS

app/api/mobile/me/             Nom affiché + droits du compte connecté
app/api/mobile/stats/          Chiffres — appelle getDashboard()/getAnalytics()
app/api/mobile/activity/       Journal — réservé au propriétaire

components/mobile/form.jsx     Champs, feuilles du bas, barre d'enregistrement
components/mobile/PhotoPicker  Photos : caméra, galerie, ordre, principale
components/mobile/DocPicker    Fiches techniques PDF
components/mobile/*Screen.jsx  Un écran par fichier
styles/mobile.css              Feuille de style autonome de l'app
styles/mobile-*.css            Compléments propres à un écran

lib/admin.js                   Qui est administrateur · propriétaire · éditeur
lib/activity.js                Écriture et lecture du journal
public/wbp-app.webmanifest     Manifeste d'installation
public/sw.js                   Mode hors connexion
public/app-icon-*.png          Icônes de l'écran d'accueil
supabase/activity.sql          Migration (additive) du journal
apply-activity.bat             Applique la migration
```

Deux principes tiennent tout ce dossier, et ils expliquent la plupart des choix
qu'on pourrait trouver surprenants en lisant le code :

**Rien n'est recalculé, rien n'est réécrit.** L'onglet Stats appelle
`getDashboard()` et `getAnalytics()` — exactement les fonctions du tableau de bord
web. Les écrans d'édition appellent les server actions d'`app/admin/actions.js` —
exactement celles du back-office. Le téléphone ne contient aucune règle métier :
ni un calcul, ni une validation, ni une écriture en base qui lui soit propre.
C'est ce qui garantit qu'une fiche modifiée au téléphone est identique à la même
fiche modifiée sur ordinateur, journal d'activité compris, et qu'une correction
faite une fois vaut pour les deux interfaces.

**Ce qui protège est côté serveur.** La barre d'onglets ne fait que cacher des
liens. Les vraies barrières sont `app/mobile/guard.js` pour l'affichage des
pages, `requireAdmin()` dans chaque server action pour les écritures, et le
contrôle du propriétaire dans `/api/mobile/activity`. Une adresse tapée à la
main, un raccourci enregistré ou un retour en arrière dans l'historique ne
donnent accès à rien.
