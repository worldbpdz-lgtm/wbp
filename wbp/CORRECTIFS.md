# Correctifs — audit du 08/09/2026

## ✅ Migration appliquée le 08/09/2026

`supabase/fix-all.sql` a été **exécuté sur la base de production**
(projet `eknkepzvowjxgsshdlog`). Vérification : tous les objets à `OK`.

**Cause racine de presque tous les bugs signalés : aucune migration n'avait
jamais été appliquée à la base de production.** Les `apply-*.bat` demandent un
PC Windows et une connexion Postgres directe — ils n'ont jamais tourné.
`upgrade.sql`, `featured.sql`, `new-arrivals.sql`, `newsletter.sql` **et**
`multisite.sql` manquaient tous.

### État constaté avant / après

| Objet | Avant | Après |
|---|---|---|
| `products.featured` | MANQUANTE → tout enregistrement de fiche échouait | OK |
| `brands.logo_url`, `categories.image_url` | MANQUANTES | OK |
| `brands.short` | NOT NULL → ajout de marque impossible | optionnelle |
| `featured_picks` | MANQUANTE → Vitrine inutilisable | OK |
| `new_arrivals` | MANQUANTE → Nouveautés inutilisables | OK |
| `ai_config` / `ai_messages` | MANQUANTES | OK |
| `email_campaigns` / `_sends` | MANQUANTES → section Campagnes cassée | OK |
| colonne `site` | **absente de TOUTES les tables** | 12 tables |
| `settings` clé primaire | `key` seule | `site + key` |
| `reviews.approved` défaut | `true` | `false` |
| bucket `media` | **inexistant** → tout upload d'image échouait | créé, public |
| policies d'écriture publique | aucune | aucune |

Deux découvertes que je n'avais pas anticipées :

- **La colonne `site` n'existait nulle part.** Le code filtre partout sur
  `.eq('site','wbp')`. Toutes ces requêtes échouaient en silence : réglages du
  site (contact, WhatsApp, pop-up), avis sur les fiches, compteurs devis /
  messages / avis du tableau de bord, listes de devis, messages et abonnés.
- **Le bucket de stockage s'appelle `products`, pas `media`.** `lib/storage.js`
  écrit dans `media`, qui n'existait pas : **tout envoi d'image depuis
  l'administration échouait.** Le bucket `media` a été créé (public en lecture).

### Deux variables à vérifier sur Vercel

| Variable | Pourquoi |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Absente dans `.env.local`. Sans elle, les liens de confirmation et de désinscription des e-mails pointent sur `localhost:3000`. |
| `CRON_SECRET` | Vide = la route `/api/cron/keep-alive` reste ouverte à tous. |

---

## 1. Bugs fonctionnels corrigés

### Impossible d'enregistrer un produit
`upsertProduct` envoyait toujours les colonnes `images` et `featured`. PostgREST
rejette la requête **entière** dès qu'une colonne citée n'existe pas — donc
chaque enregistrement échouait tant que la migration n'était pas passée.
→ Nouvelle fonction `upsertTolerant` : elle réessaie sans la colonne fautive.
La fiche est enregistrée dans tous les cas, avec un avertissement explicite.
*(`app/admin/actions.js`)*

### Suppression de produit
Ne nettoyait pas `featured_picks` / `new_arrivals` avant de supprimer, d'où un
échec sur clé étrangère selon l'ordre des migrations. Corrigé, et l'erreur brute
Postgres n'est plus renvoyée au navigateur.

### Vitrine et Nouveautés
- `saveShowcase` échouait sans recours si `featured_picks` manquait. Elle
  bascule désormais sur la colonne `products.featured` et prévient que seul
  l'**ordre** est perdu.
- Les deux écrans chargeaient les produits avec `.limit(4000)` — trompeur,
  PostgREST plafonne à 1000 lignes quoi qu'il arrive. Remplacé par une
  pagination réelle.
- Une colonne manquante vidait toute la page sans message : les requêtes
  dégradent maintenant le jeu de colonnes jusqu'à ce que ça passe.

### « Seulement 200 produits »
`ShowcaseManager` faisait un `.slice(0, 200)` en dur sur le catalogue filtré.
Supprimé. La liste affiche tout, par tranches de 100 avec « Afficher plus », et
un bouton **« + Tout ajouter »** complète le « + 24 premiers ».
Le plafond de la sélection passe de 60 à 200 produits.

### Catalogue public tronqué à 1000 produits
`getCatalog()` faisait un `select('*')` sans pagination. Au 1001ᵉ produit, le
site s'arrêtait là — en silence. Corrigé par `selectAll()`. *(`lib/queries.js`)*

### Images — ⚠️ correction de mon diagnostic initial

**Je m'étais trompé.** J'avais annoncé que 203 produits avaient une photo dans
le dépôt sans `image_url` en base. C'était basé sur `scripts/catalog-data.json`
(43 photos), un **fichier de semence périmé**. Vérification faite directement
sur la base de production :

| Mesure | Valeur réelle |
|---|---|
| Produits au total | 1 747 |
| Produits **visibles** (`active`) | **206** |
| Produits visibles **avec** photo | 202 |
| Produits visibles **sans** photo | 4 |
| Produits masqués (`active = false`) | 1 541 — **aucun n'a de photo** |
| Produits que le manifeste aurait corrigés | **0** |

**Les images du site public n'ont jamais été cassées.** Le catalogue en ligne
affiche bien ses 206 produits avec leurs photos (vérifié sur
`wbp-hazel.vercel.app/catalog`).

Ce que vous avez vu, ce sont les écrans **Vitrine** et **Nouveautés** de
l'administration : ils listaient les **1 747** produits, dont les 1 541 masqués
qui n'ont effectivement aucune photo. D'où une majorité de pastilles grises.

**Le vrai sujet n'est donc pas un bug d'affichage : 1 541 produits ont été
importés sans photo et laissés masqués.** À décider de votre côté : leur
trouver des visuels, ou les supprimer du catalogue.

Ce qui a quand même été ajouté et reste utile :

- `ProductImage` et les vignettes admin basculent sur le visuel généré quand une
  URL est morte, au lieu de l'icône « image cassée » du navigateur.
- Le manifeste (`scripts/build-image-manifest.mjs`) reste en place comme filet
  de sécurité si un `image_url` est vidé par erreur — mais il ne corrige rien
  aujourd'hui. Dites-le-moi si vous préférez que je le retire.

---

## 2. Faille : la mention d'un prestataire tiers

L'écran `/admin/ai` nommait **d-tech-ai / messaging-ai** dans l'interface, le
placeholder d'URL, l'aide et le format de clé — visible par toute personne
ayant accès à l'administration.

Tout est retiré de l'interface, des routes et des commentaires. Le mode
s'appelle désormais **« Plateforme externe »** : vous saisissez l'adresse et la
clé de la plateforme de votre choix, aucun fournisseur n'est nommé ni imposé.
La valeur stockée passe de `dtech` à `external` — `dtech` reste accepté en
lecture pour ne pas casser une configuration déjà en base.

Par défaut, l'assistant reste en mode **catalogue** : aucun service externe,
aucun abonnement.

---

## 3. Failles de sécurité corrigées

| # | Faille | Gravité | Correctif |
|---|---|---|---|
| 1 | **Redirection ouverte** sur `/api/email/click?u=` : n'importe qui pouvait diffuser un lien au domaine WBP menant vers un site de phishing. Les filtres anti-spam font confiance au domaine. | **Critique** | Destination restreinte au site et aux domaines autorisés (`EMAIL_LINK_HOSTS`). Protocoles `javascript:` / `data:` et `//evil.com` refusés. |
| 2 | **Avis publiés sans modération** : `submitReview` posait `approved: true`. N'importe qui pouvait écrire ce qu'il voulait sur une fiche produit, en ligne immédiatement. | **Élevée** | `approved: false` + `alter table reviews alter column approved set default false`. La page `/admin/reviews` sert enfin à quelque chose. |
| 3 | **Aucune limitation de débit** sur les points d'entrée publics, qui écrivent avec la clé `service_role` (contourne RLS) : devis, contact, avis, newsletter, statistiques, `/api/chat`. Un script pouvait saturer la base, noyer la boîte mail, faire partir des milliers d'e-mails depuis le domaine WBP, et faire gonfler une facture d'IA. | **Élevée** | `lib/ratelimit.js` — plafond par IP et par action, plus un piège à robots sur les formulaires. |
| 4 | **Filtre d'accès `/admin` incomplet** : il vérifiait qu'une session Supabase existait, pas que le compte soit administrateur. Tout compte créé dans le projet passait. | **Élevée** | Contrôle `ADMIN_EMAILS` ajouté dans le filtre, en plus du layout. |
| 5 | **RLS jamais revue** : policies héritées, écriture publique possible sur certaines tables selon l'historique des migrations. | **Élevée** | `fix-all.sql` réécrit les policies table par table et supprime **toute** policy d'écriture publique, y compris sur le stockage. Devis, messages, abonnés, statistiques, config IA et journaux du chat deviennent illisibles sans la clé serveur. |
| 6 | **SSRF** : `testAiConnection` appelait n'importe quelle URL fournie, y compris `169.254.169.254` (métadonnées cloud, qui distribuent des jetons d'accès) et le réseau privé de l'hébergeur. | **Moyenne** (admin) | Adresses internes refusées, HTTPS obligatoire. |
| 7 | **Erreurs Postgres brutes renvoyées au navigateur** : noms de tables, de colonnes et de contraintes exposés à un visiteur anonyme. | **Moyenne** | Message neutre côté visiteur, détail dans les journaux serveur. |
| 8 | **Aucun en-tête de sécurité** : clickjacking possible sur une session admin, MIME sniffing, URL complètes (jetons de désinscription) envoyées aux sites tiers. | **Moyenne** | CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`, `poweredByHeader: false`. |
| 9 | **`/admin` indexable et mis en cache**. | **Faible** | `X-Robots-Tag: noindex` + `Cache-Control: no-store`. |

### Ce qui était déjà correct

- La clé `service_role` ne fuit pas : elle reste dans `lib/supabase/server.js`,
  jamais préfixée `NEXT_PUBLIC_`.
- Les uploads d'images passent par le serveur, pas par le navigateur.
- Le bucket `media` est public en lecture seule — normal pour des photos
  produit, et `fix-all.sql` confirme qu'aucune écriture publique n'y traîne.
- `.env.local` est bien dans `.gitignore`.

### Limite connue

La limitation de débit est en mémoire : sur Vercel, chaque instance a son propre
compteur, donc la limite réelle est « N par instance ». Cela arrête les scripts
d'abus, mais pas une attaque distribuée. Pour une protection stricte, brancher
Upstash Redis (~15 lignes dans `lib/ratelimit.js`).

---

## 3 bis. Deuxième passe de vérification — 24 défauts supplémentaires

Une relecture ligne par ligne de l'ensemble du code (y compris les fichiers que
je n'avais pas touchés) a trouvé 24 problèmes de plus. Tous corrigés.

### Régressions que j'avais moi-même introduites

| # | Problème | Correction |
|---|---|---|
| 1 | Le message « **Votre avis a été publié** » devenait faux dès lors que la modération était activée — et l'avis était même injecté dans la moyenne des étoiles, puis disparaissait au rechargement. | Message réécrit en FR/EN/AR (« sera publié après vérification »), insertion optimiste supprimée, bouton renommé « Envoyer mon avis ». |
| 2 | Le **piège à robots ne servait à rien** : aucun formulaire n'envoyait le champ. | Champ caché ajouté aux formulaires devis, contact et avis. |
| 3 | Les erreurs de **limitation de débit étaient invisibles** : les formulaires affichaient « Message envoyé ✓ » alors que rien n'était parti. | Les 5 formulaires lisent désormais le résultat et affichent l'erreur réelle. |
| 4 | Le plafond de statistiques **par adresse IP** aurait coupé tout un immeuble ou tout un opérateur mobile derrière un même NAT — faussant les chiffres qu'il devait protéger. | Compté **par visiteur** (sessionId), repli large par IP. |
| 5 | Le chat affichait « Connexion interrompue » sur une **limite de débit** (HTTP 429). | Message dédié en FR/EN/AR. |
| 6 | Le filtre `/admin` **plantait en 500** si Supabase était injoignable, et **perdait les cookies d'authentification** lors d'une redirection (boucle de connexion). | Appel protégé, cookies et en-têtes recopiés sur la redirection. |
| 7 | Les 7 actions d'administration réécrites (devis, messages, avis, abonnés) **ne filtraient pas par site** — un identifiant deviné donnait accès aux données de Central Network. | `.eq('site', SITE)` ajouté partout. |
| 8 | Enregistrer la vitrine **effaçait les produits mis en avant de l'autre site** (colonne `featured` partagée). | La colonne n'est plus touchée dès que `featured_picks` existe. |
| 9 | `/api/chat/poll` restait **sans limite de débit**, minuteur de 45 s non annulé, journaux de conversation perdus. | Corrigés. |

### Défauts préexistants trouvés au passage

| # | Problème | Gravité |
|---|---|---|
| 10 | **Campagnes e-mail non filtrées par site** : un admin pouvait ouvrir, modifier, supprimer et **envoyer** la campagne de l'autre site à sa propre liste d'abonnés. | Élevée |
| 11 | 7 actions d'administration **ignoraient l'erreur et répondaient toujours « ok »** : approuver un avis ou supprimer une ligne semblait réussir même quand rien n'était écrit. | Élevée |
| 12 | Une **session expirée faisait planter la page** au lieu d'afficher un message (aucun try/catch autour des actions). | Élevée |
| 13 | Le **tableau de bord affichait 1 000 produits au lieu de 1 747** ; les comptes par catégorie, par marque et les statistiques étaient tous faussés par le plafond PostgREST. | Élevée |
| 14 | Les statistiques lisaient **1 000 événements pris au hasard** (aucun tri) et non les plus récents. | Élevée |
| 15 | L'**export CSV des abonnés s'arrêtait au 1 000ᵉ** sans le dire. | Élevée |
| 16 | **Injection de formule CSV** : une adresse commençant par `=` s'exécutait à l'ouverture de l'export dans Excel. | Moyenne |
| 17 | La **recherche produits cassait** sur une virgule ou une parenthèse et affichait « 0 produit » au lieu d'une erreur. | Moyenne |
| 18 | Le **pop-up newsletter réapparaissait à chaque visite** malgré sa fermeture (`Number(undefined)` → `NaN`). | Moyenne |
| 19 | Les pages de confirmation / désinscription affichaient le **succès complet pour un jeton invalide**. | Moyenne |
| 20 | « Déjà inscrit » affichait quand même « **vérifiez votre boîte mail** » — un e-mail qui n'arrivait jamais. | Moyenne |
| 21 | L'échec d'envoi de l'e-mail de confirmation était **ignoré**. | Moyenne |
| 22 | Ajout / suppression d'un client : **échec silencieux** ; bouton d'enregistrement **bloqué sur « … »** en cas de session expirée. | Moyenne |
| 23 | `/admin/reviews` n'avait **aucun filtre** pour retrouver les avis en attente, et les libellait « Masqué » au lieu de « En attente ». | Moyenne |
| 24 | `seed.sql` était **devenu incompatible** avec la nouvelle clé primaire `(site, key)`. | Faible |

## 4. État de vérification

| Élément | Statut |
|---|---|
| `npm run build` | ✅ passé **avant** la 2ᵉ passe · ⚠️ **à relancer** après |
| `fix-all.sql` sur la production | ✅ exécuté, tous les objets à `OK` |
| Catalogue public (206 produits + photos) | ✅ vérifié en ligne |
| Écriture publique en base | ✅ aucune policy |
| Administration (sauvegarde produit, Vitrine, IA) | ⏳ **à tester par vous** — connexion requise |

### Reste à faire

0. **Relancer `npm run build`.** La deuxième passe a modifié une trentaine de
   fichiers APRÈS le dernier build réussi, et l'environnement Linux de la
   session est tombé en panne (disque plein) — impossible de recompiler ici.
   Les fichiers ont été relus ligne par ligne (aucune erreur de syntaxe, aucun
   identifiant indéfini, aucune règle React enfreinte), mais **cela ne remplace
   pas un vrai build**. À lancer avant tout déploiement.
1. **Déployer** le code (`git push` ou `vercel --prod`) — la base est déjà
   corrigée, mais les correctifs de sécurité et d'interface sont dans le code.
2. **Définir `NEXT_PUBLIC_SITE_URL`** dans Vercel → Settings → Environment
   Variables. Sans elle, les liens de confirmation et de désinscription des
   e-mails pointent sur `localhost:3000`.
3. **Définir `CRON_SECRET`** — vide, la route `/api/cron/keep-alive` reste
   ouverte à tous.
4. **Tester dans `/admin`** : modifier et enregistrer un produit, enregistrer la
   Vitrine, envoyer une image. Ces trois actions échouaient avant.
5. **Décider du sort des 1 541 produits masqués sans photo.**
