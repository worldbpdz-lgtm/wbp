# Correction des images produits — 10/08/2026

## 1. Le vrai bug : les images étaient rognées (tous les produits)

`.pcard-media` a un ratio **4/3**, mais toutes les photos produit sont **carrées (1:1)**.
Avec `object-fit: cover`, le navigateur remplissait la boîte et **coupait 25 % de la hauteur**
(12,5 % en haut + 12,5 % en bas). C'est ce qui donnait l'impression que les produits
« sortaient de l'écran » ou étaient zoomés.

**Corrigé dans :**

- `components/primitives.jsx` — `ProductImage` utilise maintenant la classe `prod-img-photo`
  au lieu d'un style inline `objectFit: 'cover'`.
- `styles/styles.css` — nouvelle règle :

```css
.prod-img-photo{background:#fff; padding:9% 10%}
.prod-img-photo img{width:100%; height:100%; object-fit:contain; object-position:center; display:block}
.prod-img-photo.prod-img-hero{padding:6% 7%}
[data-theme="dark"] .prod-img-photo{background:#f4f5f7}
```

Effet : plus aucune image rognée, sur la fiche produit, les cartes, le panier et la recherche.

## 2. Recadrage de tous les fichiers images (420 fichiers)

`public/products/*.webp` a été retraité :

- détourage du fond (blanc, noir ou transparent) par remplissage depuis les bords ;
- recomposition sur fond blanc, sans franges sombres ;
- rognage automatique au plus près du produit ;
- recentrage sur un carré avec une **marge constante de 7 %** ;
- ré-encodage WebP qualité 86.

Résultat : tous les produits ont la même taille visuelle et le même cadrage.
Aucune perte de résolution (pas d'agrandissement forcé).

**Sauvegarde des originaux : `products-backup-2026-08-10.zip`** (à la racine du projet).

## 3. Photos remplacées (17 produits)

Ces produits avaient une photo inutilisable : filigrane revendeur, photo de carton,
visuel marketing ou schéma technique. Elles ont été remplacées par des visuels
officiels détourés sur fond blanc, hébergés dans le **Supabase Storage** du projet
(bucket public `products`), et `products.image_url` a été mis à jour.

| ID | Produit | Ancien problème |
|---|---|---|
| r0029 | AJAX MotionProtect | 3 unités sur une même image |
| r0054 | Ubiquiti AMO-2G13 | collage marketing fond bleu |
| r0060 | Armoire alim. 12V/5A | bandeau publicitaire « ENVIO » |
| r0567 | Ajax MotionCam Outdoor | photo du carton |
| r0598 | Dahua HY-SA2FA | 2 unités + téléphone |
| r0811 | Dahua ARD323-W2 | carton + filigrane « MEGATEH » |
| r0845 | Dahua VTO2000A-E | 3 variantes sur une image |
| r0869 | Dahua PFA137 | filigrane « MEGATEH.eu » |
| r0872 | Kit Ajax Starter | photo du carton |
| r1021 | Dahua VTH5422HW | photo du carton |
| r1197 | Ubiquiti Loco5AC | schéma réseau |
| r1508 | Dahua VTNS1001B-2 | filigrane |
| r1523 | Dahua CS4220-16GT-190 | filigrane « NAKO » |
| r1560 | Dahua VTNS2003B-2-A | photo du carton |
| r1647 | UACC-CM-RJ45-MG | bandeau « LinITX » avec texte |
| r1652 | Ubiquiti AMO-5G13 | collage marketing fond bleu |
| r1656 | Ubiquiti Loco5AC | schéma annoté avec repères |

## 4. Reste à faire

**Photos encore imparfaites (5)** — visuel marketing plutôt que produit détouré :

- `r0002` 48V 1.25A Power Supply — cadre + filigrane « MRE® »
- `r0682` MAXHUB B8610 Blackboard — bandeau marketing avec texte
- `r0690` MAXHUB ND75CMA — maquette générique d'appareils
- `r1238` Dahua HY-PSB10A — photo amateur sur un bureau
- `r1480` Support rond caméra — bandeau filigrané « hikvisionsolution.com »

**Produits sans aucune image (4)** :

- `r0531` CSP20
- `r1181` Dahua VTO3312Q-P
- `r1449` Dahua DH-PFB121W
- `r1710` VTM-134

## 5. Mise en ligne

Les points 1 et 2 sont **locaux** — ils n'apparaîtront sur wbp-hazel.vercel.app
qu'après un redéploiement. Le point 3 (base de données + Supabase Storage) est
**déjà actif en production**.
