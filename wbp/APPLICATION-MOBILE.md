# Application mobile « WBP »

Application pour l'équipe, installée sur l'écran d'accueil de l'iPhone.
Deux écrans : **Stats** (le trafic du site et les demandes de devis, les mêmes
chiffres que `/admin`) et **Activité** (qui a fait quoi dans le back-office,
quel jour, à quelle heure).

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

L'icône **WBP** apparaît sur l'écran d'accueil. À la première ouverture,
l'écran orange « Welcome Cherif » s'affiche, puis l'écran de connexion.

> Sur Android, c'est le même principe : Chrome propose « Installer
> l'application » ou « Ajouter à l'écran d'accueil ».

---

## 2) Comptes

Les comptes de l'application sont **les mêmes** que ceux du back-office
`/admin` : un utilisateur Supabase Auth, dont l'adresse figure dans la variable
`ADMIN_EMAILS`. Tous ont les mêmes droits (administrateur).

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
facultative `ADMIN_NAMES` au format `email:Nom,email:Nom`.

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

Deux garde-fous :

- La table est en **Row Level Security sans aucune policy** : personne ne peut
  la lire ni l'écrire depuis le navigateur, même connecté. Seul le serveur y
  accède. Un journal que la personne surveillée peut effacer ne sert à rien.
- Journaliser ne peut jamais faire échouer l'action journalisée : si la base
  est injoignable, l'action de l'administrateur passe quand même.

L'historique est conservé 12 mois (fonction `prune_admin_activity()`).

---

## 4) Hors connexion

L'application garde sa dernière réponse dans le **stockage local du téléphone**
et affiche ces chiffres immédiatement à l'ouverture, pendant que la mise à jour
part en arrière-plan. Sans réseau, elle s'ouvre quand même et indique de quand
datent les données.

Concrètement :

- `localStorage` pour les chiffres et l'historique ;
- un *service worker* (`public/sw.js`), limité à `/mobile`, pour la coquille de
  l'app (pages, icônes, fichiers statiques) ;
- rien n'est mis en cache côté `/api` : les données affichées viennent toujours
  soit du serveur, soit explicitement de la mémoire du téléphone.

Le bouton **Déconnexion** efface le cache local du téléphone en même temps
qu'il ferme la session.

Après un déploiement qui modifie l'app, incrémenter `VERSION` en haut de
`public/sw.js` pour que tous les téléphones récupèrent la nouvelle version.

---

## 5) Fichiers

```
app/mobile/                    Les deux écrans (Stats, Activité)
app/mobile/layout.js           Nom « WBP », icône, plein écran iOS
app/api/mobile/stats/          Chiffres — appelle getDashboard()/getAnalytics()
app/api/mobile/activity/       Journal — appelle getActivity()
components/mobile/             Coquille, écran d'ouverture, connexion, graphiques
styles/mobile.css              Feuille de style autonome de l'app
lib/activity.js                Écriture et lecture du journal
public/wbp-app.webmanifest     Manifeste d'installation
public/sw.js                   Mode hors connexion
public/app-icon-*.png          Icônes de l'écran d'accueil
supabase/activity.sql          Migration (additive) du journal
apply-activity.bat             Applique la migration
```

Les chiffres de l'onglet Stats ne sont **pas** recalculés : la route API appelle
`getDashboard()` et `getAnalytics()`, exactement les fonctions du tableau de
bord web. Le téléphone et l'ordinateur ne peuvent donc pas afficher deux
nombres différents pour la même chose.
