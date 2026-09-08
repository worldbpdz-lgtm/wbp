// ============================================================================
// Génère lib/product-images.generated.js à partir de public/products/.
// ----------------------------------------------------------------------------
// POURQUOI :
// 420 fichiers .webp sont déjà livrés dans public/products (nommés d'après
// l'identifiant produit : r0104.webp, r0104-1.webp, r0104-2.webp…), mais
// seulement 43 produits avaient une valeur dans products.image_url. Résultat :
// la grande majorité des fiches affichait le visuel générique alors que la
// photo existait bel et bien dans le dépôt.
//
// Ce script construit une table « identifiant produit → liste de photos ».
// lib/queries.js s'en sert comme repli quand image_url est vide : aucune
// écriture en base n'est nécessaire, et le site montre immédiatement toutes
// les photos disponibles.
//
// À relancer après avoir ajouté des fichiers dans public/products :
//     node scripts/build-image-manifest.mjs
// (c'est aussi fait automatiquement par « npm run build »)
// ============================================================================
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'products');
const out = join(root, 'lib', 'product-images.generated.js');

const EXT = /\.(webp|jpg|jpeg|png|avif|gif)$/i;

// « r0104.webp » et « r0104-2.webp » appartiennent tous deux au produit r0104.
// Le rang sert à trier : le fichier sans suffixe passe en premier (photo
// principale), puis -1, -2, -3…
function parse(file) {
  const base = file.replace(EXT, '');
  const m = base.match(/^(.*?)-(\d+)$/);
  return m ? { id: m[1], rank: Number(m[2]) } : { id: base, rank: -1 };
}

const map = new Map();
if (existsSync(dir)) {
  for (const file of readdirSync(dir)) {
    if (!EXT.test(file)) continue;
    const { id, rank } = parse(file);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push({ rank, url: `/products/${encodeURIComponent(file)}` });
  }
}

const manifest = {};
for (const [id, list] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  list.sort((a, b) => a.rank - b.rank);
  manifest[id] = list.map((x) => x.url);
}

const count = Object.keys(manifest).length;
const files = Object.values(manifest).reduce((n, a) => n + a.length, 0);

writeFileSync(out, `// ⚠️  FICHIER GÉNÉRÉ — ne pas modifier à la main.
// Source : public/products/  ·  Régénérer : node scripts/build-image-manifest.mjs
// ${count} produit(s), ${files} fichier(s).
export const PRODUCT_IMAGES = ${JSON.stringify(manifest, null, 0)};
export default PRODUCT_IMAGES;
`, 'utf8');

console.log(`✅ lib/product-images.generated.js — ${count} produit(s), ${files} fichier(s).`);
