# Nouveaux arrivages + sélection des produits — 10/08/2026

## ⚠️ À lire en premier

La base de données actuelle **n'a jamais reçu la migration de mise à niveau**.
Vérifié directement sur Supabase :

- table `featured_picks` → **absente** (404)
- colonne `products.featured` → **absente**
- aucun produit ne porte de badge (`bestseller` / `new`)

Conséquence : l'écran **/admin/showcase (Vitrine)** existait déjà dans le code,
mais il ne pouvait **rien enregistrer** — la section « Meilleures ventes » de
l'accueil affiche simplement les 8 premiers produits du catalogue.

**Double-cliquez `apply-upgrade.bat` une seule fois.** Il applique tout d'un coup :
la vitrine (meilleures ventes) **et** les nouveautés. Les deux écrans deviennent
alors fonctionnels.

> Alternative sans Node : collez `supabase/upgrade.sql` puis
> `supabase/new-arrivals.sql` dans Supabase → SQL Editor → Run.

## Où choisir les produits

| Section de l'accueil | Écran d'administration | Table |
|---|---|---|
| Meilleures ventes | **/admin/showcase** — « Vitrine » | `featured_picks` |
| Nouveaux arrivages | **/admin/arrivals** — « Nouveautés » *(nouveau)* | `new_arrivals` |

Les deux écrans fonctionnent pareil : à gauche le catalogue filtrable par
catégorie, marque et recherche ; à droite votre sélection. On clique pour
ajouter, on glisse (ou on utilise ↑ ↓) pour ordonner, on enregistre.
Les deux listes sont **indépendantes** — un produit peut être à la fois
meilleure vente et nouveauté.

Les liens sont dans la barre latérale de l'admin, groupe **Catalogue**.

## Ce qui a été ajouté

**Page d'accueil** — nouvelle section « Nouveaux arrivages », placée juste après
« Meilleures ventes ». Même carrousel, léger fond gris pour séparer les deux.
Le bouton « Tout voir » ouvre le catalogue déjà trié sur *Nouveautés*.

- `components/pages/Home.jsx` — les deux carrousels partagent désormais un seul
  composant `ProductCarousel` ; ajout de `<NewArrivals />`.
- `lib/i18n.js` — libellés `sec_new_*` en français, anglais et arabe.
- `styles/styles.css` — `.sec-new`.
- `components/pages/Catalog.jsx` + `components/AppProvider.jsx` — le catalogue
  accepte maintenant `?sort=new|rating|az|relevance` dans l'URL.

**Données**

- `supabase/new-arrivals.sql` — table `new_arrivals` (même structure que
  `featured_picks`, lecture publique via RLS). Reprend au démarrage les produits
  badgés « Nouveau ».
- `lib/queries.js` — `getCatalog()` renvoie `arrivals`. Requête séparée : si la
  table manque, la vitrine continue de fonctionner normalement.
- `components/AppProvider.jsx` — `wbp.newArrivals(limit)`.

**Administration**

- `app/admin/(panel)/arrivals/page.js` — nouvel écran.
- `components/admin/ShowcaseManager.jsx` — généralisé, pilote les deux listes
  via une prop `list="showcase" | "arrivals"`.
- `app/admin/actions.js` — action serveur `saveArrivals()`.
- `components/AdminNav.jsx` — lien « Nouveautés ».

**Scripts**

- `apply-arrivals.bat` + `scripts/apply-arrivals.mjs` — migration des nouveautés seule.
- `scripts/apply-upgrade.mjs` — inclut désormais `new-arrivals.sql`.

## Repli si la liste est vide

« Nouveaux arrivages » n'est jamais vide : sans sélection, la section affiche
les produits dont la fiche porte le badge **« Nouveau »** ; s'il n'y en a aucun,
les derniers produits du catalogue. Enregistrer une liste vide ne supprime
aucun badge — la pastille « Nouveau » de la fiche produit reste un réglage
indépendant.

## Mise en ligne

Tout ceci est **local** : à déployer, puis lancer la migration une fois.
