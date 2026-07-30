# World Business Plus — site web complet (Next.js + Supabase)

## 🔗 Base de données PARTAGÉE avec Central Network

Les deux sites (WBP sur le port 3000, Central Network sur le port 3001) utilisent
**la même base Supabase** :

- **Catalogue partagé** : produits, marques et catégories sont communs.
  Ajouter, modifier, masquer ou supprimer un produit depuis **l'admin de
  n'importe lequel des deux sites** met à jour **les deux sites web** instantanément.
- **Séparé par site** : devis, messages, avis, abonnés newsletter, campagnes
  e-mail, statistiques et paramètres (téléphone / WhatsApp / adresse / textes).
  Chaque admin ne voit que les demandes de SON site, et chaque site garde ses
  propres coordonnées.
- **Mise en place (une seule fois)** : double-cliquez sur **`apply-multisite.bat`**
  (ici ou dans le dossier Central Network — même résultat). Il applique la
  migration `supabase/multisite.sql` et synchronise les photos produits.
- Le même compte administrateur fonctionne sur les deux `/admin`.
- ⚠️ Après cette migration, ne relancez plus l'ancien `setup.sql` ; utilisez
  `apply-multisite.bat` (sans danger, ré-exécutable).

---

Boutique-catalogue B2B trilingue (FR / EN / AR) avec back‑office d'administration.
Modèle **« prix sur devis »** : les visiteurs parcourent le catalogue, demandent des
devis, laissent des avis et s'abonnent à la newsletter ; vous gérez tout depuis `/admin`.

- **Frontend & backend** : Next.js (App Router) — déployé sur **Vercel**
- **Base de données / Auth** : **Supabase** (PostgreSQL + Auth)
- **Public** : Accueil, Catalogue (filtres/tri/recherche), Fiche produit, Marques, À propos, Contact
- **Admin** (`/admin`) : produits, marques, catégories, demandes de devis, messages, avis (modération), abonnés

---

## 1) Créer le projet Supabase

1. Aller sur https://supabase.com → **New project** (notez le mot de passe de la base).
2. Dans **SQL Editor**, ouvrez **New query**, collez le contenu de `supabase/schema.sql`, **Run**.
3. Nouvelle requête : collez `supabase/seed.sql`, **Run** (insère marques, catégories, 27 produits, clients).
4. Dans **Project Settings → API**, copiez :
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 2) Créer le compte administrateur

1. Supabase → **Authentication → Users → Add user** : saisissez votre e-mail + mot de passe
   (cochez « Auto confirm user »).
2. Mettez ce même e-mail dans la variable `ADMIN_EMAILS` (étape 3). Plusieurs e-mails possibles, séparés par des virgules.

## 3) Déployer sur Vercel

1. Poussez ce dossier sur un dépôt GitHub (ou utilisez « Deploy » depuis Vercel CLI).
2. Sur https://vercel.com → **Add New… → Project** → importez le dépôt.
3. **Environment Variables** : ajoutez celles de `.env.example` avec vos vraies valeurs
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`).
4. **Deploy**. Votre site est en ligne ; l'admin est sur `https://votre-site.vercel.app/admin`.

> Astuce : après avoir ajouté/modifié des variables d'environnement sur Vercel, relancez un déploiement.

## 4) Développement local (optionnel)

```bash
npm install
cp .env.example .env.local   # puis renseignez vos clés Supabase
npm run dev                  # http://localhost:3000
```

Sans clés Supabase, le site fonctionne en **mode démo** : il affiche le catalogue intégré
(`lib/fallback-catalog.js`) en lecture seule et l'admin affiche « Configuration requise ».

## 5) Gérer le site (back-office)

Connectez-vous sur `/admin` avec le compte créé à l'étape 2.

- **Produits** : créer / modifier / supprimer, masquer/afficher, photo (URL), specs, accroches FR/EN/AR.
- **Marques / Catégories** : modifier ou ajouter.
- **Demandes de devis** & **Messages** : consulter et changer le statut (nouveau → traité…).
- **Avis** : approuver / masquer / supprimer (les avis masqués n'apparaissent pas sur le site).
- **Newsletter** : liste des abonnés.

## Ajouter des photos produits (plus tard)

Chaque produit a un champ **URL image** dans l'admin. Vous pouvez :
- héberger les images dans **Supabase Storage** (bucket public) et coller l'URL, ou
- coller n'importe quelle URL d'image publique.
Sans image, une vignette générée (couleur de la marque + icône de catégorie) est utilisée.

## Sécurité (résumé)

- La clé **anon** (navigateur) ne peut que **lire** le catalogue et les avis approuvés (Row Level Security).
- Toutes les écritures et l'admin passent côté serveur avec la clé **service_role** (jamais exposée).
- L'accès `/admin` exige une session Supabase **et** un e-mail listé dans `ADMIN_EMAILS`.

## Structure

```
app/                     Routes Next.js (App Router)
  (public)/              Site public (layout récupère le catalogue depuis Supabase)
  admin/                 Back-office (login + panel protégé)
  actions.js             Server actions publiques (devis, contact, avis, newsletter)
  admin/actions.js       Server actions admin (CRUD, modération) — protégées
components/              Composants UI (storefront + admin)
lib/                     Supabase, requêtes, i18n, icônes, config, catalogue de secours
styles/                  CSS (repris du design validé) + polices auto-hébergées
public/fonts/            Polices woff2 (hors-ligne)
supabase/schema.sql      Schéma + Row Level Security
supabase/seed.sql        Données initiales (catalogue)
```

---

## Tableau de bord d'administration (mise à jour)

Le back-office `/admin` est un véritable centre de gestion, avec une interface
moderne et colorée :

- **Tableau de bord** : indicateurs clés (visites, visiteurs uniques, vues produits,
  devis), graphiques (trafic 14 jours, appareils, produits les plus vus, catalogue
  par catégorie, devis par statut) et fil d'activité récent.
- **Analytics** (`/admin/analytics`) : trafic sur 30 jours, pages et produits les
  plus vus, répartition par appareil, sources de trafic. Suivi **sans cookies**.
- **Produits / Marques / Catégories** : gestion complète (CRUD).
- **Devis / Messages / Avis / Newsletter** : suivi et modération.
- **Paramètres** (`/admin/settings`) : WhatsApp, e-mail, téléphones, adresse,
  textes du bandeau d'accueil et liste des clients — modifiables et reflétés sur
  le site public.

Le suivi de trafic est assuré par une table `events` (alimentée côté serveur) ;
les paramètres du site par une table `settings`. Les deux sont incluses dans
`supabase/setup.sql` — il suffit donc d'exécuter ce fichier une fois.

> Après chaque modification du code, **redémarrez** `npm run dev` (ou laissez le
> rechargement à chaud opérer). Aucune nouvelle librairie n'est requise.

---

## Charger le catalogue complet (1747 produits)

Le fichier `supabase/products_import.sql` contient **tous les produits** (1747).
Seuls les **206 produits en stock** sont marqués `active = true` et donc visibles
sur le site public ; les autres restent gérables dans l'admin (vous pouvez les
afficher en basculant « Masqué → Visible »).

1. Exécutez d'abord `supabase/setup.sql` (crée les tables, marques et catégories).
2. Puis exécutez `supabase/products_import.sql` dans le SQL Editor (il ajoute la
   colonne `price`, remplace le contenu de la table `products` par le catalogue
   complet, et règle la visibilité selon le stock). Sûr à ré-exécuter.

Dans l'admin → **Produits** : recherche par nom/référence, filtre Visibles/Masqués,
pagination, prix de vente, et bouton Afficher/Masquer par produit.

---

## Images produits

Les photos sont déjà associées aux produits : 42 produits disposent de photos
(174 images optimisées en WebP, ~3,3 Mo, dans `public/products/`). Les liens sont
inclus dans `scripts/catalog-data.json` et `supabase/products_import.sql`, donc
le script de mise en place de la base les charge automatiquement.

- Galerie multi-images sur la fiche produit ; vignette principale sur les cartes.
- Les produits sans photo affichent une vignette générée (couleur de marque + icône).
- Pour ajouter une photo plus tard : admin → Produits → Éditer → champ « URL image ».
- Le dossier source `images/` (702 Mo) est ignoré par git ; seules les versions
  optimisées de `public/products/` sont déployées.
