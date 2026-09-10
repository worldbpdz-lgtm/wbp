# Fiches techniques (PDF)

Chaque produit peut porter jusqu'à **6 documents PDF** — fiche technique
constructeur, manuel d'installation, certificat, notice firmware. Ils sont
téléversés depuis `/admin`, et le client les consulte et les télécharge depuis
la fiche produit du site, onglet **Documents**.

---

## 1) Installation (une seule fois)

Double-clic sur **`apply-documents.bat`** à la racine du projet. Il ajoute la
colonne `products.docs` et s'assure que le stockage `media` existe.

Migration additive : aucune colonne existante n'est touchée. Tant qu'elle n'est
pas appliquée, le back-office continue de fonctionner normalement — la fiche
produit s'enregistre, simplement sans les documents (même mécanisme de repli que
`images` et `featured`).

---

## 2) Ajouter un document

1. `/admin` → **Produits** → ouvrir un produit.
2. Bloc **« Fiches techniques & documents »**.
3. Glisser le PDF dans la zone, ou cliquer pour parcourir. Plusieurs fichiers
   d'un coup fonctionnent.
4. Corriger l'**intitulé** si besoin — c'est ce que le client lit
   (« Fiche technique », « Manuel d'installation », « Certificat CE »…). Le champ
   propose les intitulés les plus courants ; il reste libre.
5. Les flèches ↑ ↓ changent l'ordre : le premier de la liste s'affiche en tête
   sur le site.
6. **Enregistrer le produit.**

> Le fichier part vers le stockage dès qu'il est déposé, mais la liste n'est
> attachée au produit qu'à l'enregistrement de la fiche. Quitter la page sans
> enregistrer laisse le PDF dans le stockage sans qu'il apparaisse nulle part —
> sans conséquence, il suffit de le redéposer.

**Retirer un document** : la croix ×. Elle enlève la ligne *et* supprime le
fichier du stockage.

---

## 3) Ce que voit le client

Onglet **Documents** de la fiche produit, en français, anglais et arabe :

- **Ouvrir** — le PDF s'affiche dans un nouvel onglet.
- **Télécharger** — le navigateur enregistre le fichier sous son nom d'origine.

Tant qu'aucun PDF n'est téléversé, l'onglet affiche la **fiche générée** —
la page imprimable construite à partir des spécifications saisies dans l'admin.
Dès qu'un vrai document existe, elle s'efface : ce sont deux choses
différentes, et le document du constructeur prime.

---

## 4) Limites et règles

| | |
|---|---|
| Format | PDF uniquement |
| Taille | 25 Mo par fichier |
| Nombre | 6 par produit |
| Stockage | bucket public `media`, sous-dossier `docs/` |

Le format est vérifié sur le **contenu** du fichier, pas sur ce que le
navigateur annonce : les quatre premiers octets doivent être `%PDF`. Renommer un
`.docx` en `.pdf` ne passe pas. Le stockage étant public, accepter un fichier
arbitraire reviendrait à offrir un hébergement libre sur un domaine de
confiance — un `.html` déposé là s'ouvrirait dans le navigateur du visiteur avec
l'adresse du site.

Chaque envoi et chaque suppression est inscrit au journal d'activité, visible
dans l'application mobile (onglet Activité) : on sait qui a publié quel document
et quand.

---

## 5) Fichiers

```
supabase/documents.sql          Migration (colonne products.docs)
apply-documents.bat             L'applique
lib/storage.js                  putDoc() / dropDoc() — envoi et suppression
app/admin/upload-actions.js     uploadDocs() / deleteDoc() — server actions
components/admin/DocsUpload.jsx Bloc « Documents » de la fiche produit
components/pages/Product.jsx    Onglet « Documents » du site public
lib/queries.js                  mapDocs() — lecture, fiche produit uniquement
```

`docs` n'est chargé que par `getProduct()`, pas par le catalogue complet : ce
dernier part dans le navigateur de chaque visiteur, et y ajouter les URL de PDF
de 1 747 produits alourdirait toutes les pages pour un contenu que seule la
fiche produit affiche.
