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

## Logo dans l'espace d'administration

Le « W » orange qui servait de logo provisoire a été remplacé par le vrai logo
World Business Plus, dans la variante adaptée au fond :

| Emplacement | Fond | Fichier |
|---|---|---|
| Barre latérale de l'admin | sombre | `/logos/wbp.png` |
| Page de connexion — panneau de gauche | sombre | `/logos/wbp.png` |
| Page de connexion — carte du formulaire | blanc | `/logos/wbp1.png` |
| Onglet du navigateur / écran d'accueil mobile | blanc | `icon-32/192/512.png`, `apple-icon.png` |

Fichiers modifiés : `components/AdminNav.jsx`, `components/admin/LoginForm.jsx`,
`app/admin/login/page.js`, `app/admin/admin.css`, `app/layout.js`.

**Au passage :** `logos/wbp1.png` pesait **1,1 Mo** (1024 × 1024) pour un logo
affiché à 40 px — il était chargé sur *chaque* page du site public. Il est
maintenant en 512 px optimisé : **15 ko**, soit 70× plus léger, à l'œil
identique. `wbp.png` passe de 67 ko à 9 ko.

L'ancien `public/favicon.svg` (le « W » orange) n'est plus référencé ; il reste
dans le dossier si vous souhaitez revenir en arrière.

### Panneau de gauche de la page de connexion

**Positionnement.** Le bloc était collé au bord droit du panneau
(`max-width:560px` + `margin-inline-start:auto`), d'où le grand vide à gauche.
Il est maintenant **centré** (`margin-inline:auto`, 540 px), et le rythme
vertical est resserré — logo, titre, arguments et mention légale se lisent
comme un seul groupe au lieu de flotter séparément.

**Fond animé — balayage radar.** Clin d'œil au métier : le panneau se comporte
comme un écran de contrôle. Quatre couches, 100 % CSS, aucune image, aucun
script :

1. **Faisceau** — un dégradé conique tourne en 9 s, linéaire, sans à-coup.
2. **Cercles de portée + axes** — fixes, très discrets, sous le faisceau.
3. **Ondes** — deux cercles s'écartent du centre et s'effacent, décalés de 4,5 s.
4. **Échos** — deux points orange qui s'allument *pile au passage du faisceau*
   (le décalage de chaque écho vaut `9 s × angle / 360°`). Ils sont placés
   au-dessus du logo et sous la mention légale, jamais à hauteur des puces de
   la liste où on les confondrait avec elles.

Le tout est masqué en dégradé sur les bords, passe **sous** le quadrillage
existant — ce qui donne l'effet « écran » — et sous le texte (`z-index`).
Seuls `transform` et `opacity` sont animés : c'est le GPU qui travaille, la
mise en page n'est jamais recalculée.

Réglages rapides : `.lg-radar { opacity }` pour l'intensité globale,
la durée `9s` de `lgSweep` pour la vitesse (pensez à reporter la même durée sur
`lgPing` et `lgBlip`, et à recalculer les délais des échos).

**Animation du texte.** Deux effets, tout en `transform`/`opacity` :

- *Apparition en cascade* — logo (60 ms), titre (160 ms), puis chaque argument
  (300 / 390 / 480 ms) et la mention du bas (680 ms) montent et se révèlent
  l'un après l'autre. La pastille orange de chaque argument éclot en même temps
  que son texte (`animation-delay:inherit`).
- *Halo vivant* — le dégradé orange dérive et « respire » sur un cycle de 22 s,
  en aller-retour, sans jamais boucler brutalement.

Tout est désactivé si le système demande moins d'animations
(`prefers-reduced-motion`), en restituant les opacités de repos.

Réglages dans `app/admin/admin.css`, section « panneau de marque » :
`lgRise` / `lgRiseFoot` / `lgDot` pour la cascade, `lgGlow` pour le halo.

## Mise en ligne

Tout ceci est **local** : à déployer, puis lancer la migration une fois.
