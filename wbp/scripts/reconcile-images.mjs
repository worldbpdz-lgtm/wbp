// ============================================================================
// Réconciliation des photos produit — base de données ⇄ public/products/
// ----------------------------------------------------------------------------
// POURQUOI :
// Le site résout la photo d'un produit ainsi (lib/queries.js) :
//
//     image_url = products.image_url  ||  1er fichier de public/products/
//
// La base gagne TOUJOURS. Trois situations passent donc inaperçues :
//
//   1. LIEN MORT     — products.image_url pointe vers un fichier supprimé du
//                      dépôt ou vers une URL qui ne répond plus. Le visiteur
//                      voit le visuel générique alors qu'une photo existe.
//   2. MASQUÉE       — products.image_url est valide MAIS le dépôt contient
//                      aussi des photos pour ce produit : elles ne sortiront
//                      jamais. Remplacer le .webp local ne change rien.
//   3. SANS PHOTO    — ni base ni dépôt : visuel généré, à photographier.
//
// Ce script les liste, et sait réparer le cas 1 (le seul qui soit toujours
// une erreur). Le cas 2 n'est PAS corrigé par défaut : 17 produits ont une
// photo Supabase qui écrase VOLONTAIREMENT un fichier local inutilisable
// (carton, filigrane revendeur… — voir IMAGES-PRODUITS.md). Les vider en
// masse ferait revenir ces mauvaises photos.
//
// UTILISATION :
//   node scripts/reconcile-images.mjs                  → rapport seul (aucune écriture)
//   node scripts/reconcile-images.mjs --apply          → répare les liens morts
//   node scripts/reconcile-images.mjs --prefer-local --apply
//                                                      → vide AUSSI les image_url
//                                                        masquant un fichier local
//   options : --no-network (saute la vérification des URL distantes)
//             --json (sortie machine)
// ============================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const PREFER_LOCAL = argv.has('--prefer-local');
const NO_NET = argv.has('--no-network');
const JSON_OUT = argv.has('--json');

const c = (n, s) => (JSON_OUT ? s : `\x1b[${n}m${s}\x1b[0m`);
const say = (...a) => { if (!JSON_OUT) console.log(...a); };
const title = (m) => say(`\n\x1b[1m${m}\x1b[0m`);

// ------------------------------------------------------- 1) Environnement
// Même lecture que scripts/diagnose.mjs : .env.local puis .env.
function env() {
  for (const f of ['.env.local', '.env']) {
    try {
      const o = {};
      for (const line of readFileSync(join(root, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      if (Object.keys(o).length) return o;
    } catch { /* fichier suivant */ }
  }
  return {};
}
const E = { ...env(), ...process.env };
const URL_ = E.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = E.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error('\n✘ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (.env.local).\n');
  process.exit(1);
}
const sb = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ------------------------------------------- 2) Fichiers réellement présents
// On relit le dossier plutôt que le manifeste généré : le manifeste peut
// dater d'avant le dernier ajout/suppression de fichier.
const EXT = /\.(webp|jpg|jpeg|png|avif|gif)$/i;
const dir = join(root, 'public', 'products');
const byProduct = new Map();   // id produit -> [url, …]
const onDisk = new Set();      // '/products/xxx.webp' réellement présents
if (existsSync(dir)) {
  const files = readdirSync(dir).filter((f) => EXT.test(f));
  for (const file of files) {
    const base = file.replace(EXT, '');
    const m = base.match(/^(.*?)-(\d+)$/);
    const id = m ? m[1] : base;
    const rank = m ? Number(m[2]) : -1;
    const url = `/products/${encodeURIComponent(file)}`;
    onDisk.add(url);
    if (!byProduct.has(id)) byProduct.set(id, []);
    byProduct.get(id).push({ rank, url });
  }
  for (const list of byProduct.values()) list.sort((a, b) => a.rank - b.rank);
}
const localFor = (id) => (byProduct.get(id) || []).map((x) => x.url);

// ------------------------------------------------------- 3) Le catalogue
// PostgREST plafonne à 1000 lignes par réponse : on pagine.
async function allProducts() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('products')
      .select('id,name,code,image_url,images,active').order('id').range(from, from + 999);
    if (error) { console.error(`\n✘ Lecture des produits impossible : ${error.message}\n`); process.exit(1); }
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// --------------------------------------------- 4) Une URL répond-elle ?
// HEAD d'abord ; certains hébergeurs le refusent (405/403) → repli sur un GET
// interrompu dès les premiers octets. Résultats mémorisés : la même URL
// Supabase peut servir plusieurs produits.
const seen = new Map();
async function alive(url) {
  if (seen.has(url)) return seen.get(url);
  const p = (async () => {
    for (const method of ['HEAD', 'GET']) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) { try { await r.body?.cancel(); } catch { /* ignore */ } return true; }
        if (method === 'HEAD' && (r.status === 405 || r.status === 403)) continue;
        return false;
      } catch {
        if (method === 'GET') return null; // réseau injoignable : indéterminé
      }
    }
    return null;
  })();
  seen.set(url, p);
  return p;
}

// Petite file d'exécution : 8 requêtes en parallèle, pas plus.
async function pool(items, worker, size = 8) {
  const it = items[Symbol.iterator]();
  await Promise.all(Array.from({ length: size }, async () => {
    for (let n = it.next(); !n.done; n = it.next()) await worker(n.value);
  }));
}

// ------------------------------------------------------------- 5) Analyse
const isRemote = (u) => /^https?:\/\//i.test(u || '');
const isLocal = (u) => typeof u === 'string' && u.startsWith('/products/');

const products = await allProducts();
say(`\n=== Réconciliation des photos — ${products.length} produits, ${onDisk.size} fichiers dans public/products ===`);

// Toutes les URL distantes à tester, dédupliquées.
const remote = new Set();
for (const p of products) {
  for (const u of [p.image_url, ...(Array.isArray(p.images) ? p.images : [])]) {
    if (isRemote(u)) remote.add(u);
  }
}
if (!NO_NET && remote.size) {
  say(`\nVérification de ${remote.size} URL distante(s)…`);
  let done = 0;
  await pool([...remote], async (u) => {
    await alive(u);
    if (!JSON_OUT && ++done % 25 === 0) process.stdout.write(`  ${done}/${remote.size}\r`);
  });
  if (!JSON_OUT) process.stdout.write(' '.repeat(30) + '\r');
}
const status = async (u) => (NO_NET || !isRemote(u) ? null : seen.get(u));

const dead = [];      // image_url cassée
const shadowed = [];  // image_url valide qui masque des fichiers locaux
const noPhoto = [];   // ni base ni dépôt
const deadGallery = []; // entrées mortes dans products.images
const unknown = [];   // URL non vérifiable (réseau)

for (const p of products) {
  const local = localFor(p.id);
  const u = p.image_url;

  if (u) {
    let ko = false;
    if (isLocal(u)) ko = !onDisk.has(u) && !onDisk.has(decodeURI(u));
    else if (isRemote(u)) {
      const st = await status(u);
      if (st === false) ko = true;
      else if (st === null && !NO_NET) unknown.push({ ...p, local });
    } else ko = true; // ni chemin local ni URL : valeur aberrante
    if (ko) dead.push({ ...p, local });
    else if (local.length) shadowed.push({ ...p, local });
  } else if (!local.length) {
    noPhoto.push(p);
  }

  const gal = (Array.isArray(p.images) ? p.images : []).filter(Boolean);
  const bad = [];
  for (const g of gal) {
    if (isLocal(g)) { if (!onDisk.has(g) && !onDisk.has(decodeURI(g))) bad.push(g); }
    else if (isRemote(g)) { if ((await status(g)) === false) bad.push(g); }
    else bad.push(g);
  }
  if (bad.length) deadGallery.push({ ...p, bad, keep: gal.filter((g) => !bad.includes(g)) });
}

// ------------------------------------------------------------- 6) Rapport
const line = (p, extra = '') => `  ${p.id.padEnd(10)} ${String(p.name || '').slice(0, 46).padEnd(46)} ${extra}`;

title(`1) Liens morts — ${dead.length} produit(s)`);
if (!dead.length) say(c(32, '  ✔ aucun'));
else {
  say(c(31, '  products.image_url ne mène à rien. Le visiteur voit le visuel générique.'));
  for (const p of dead) say(line(p, `${c(31, '✘')} ${String(p.image_url).slice(0, 60)}${p.local.length ? c(32, `  → repli dispo (${p.local.length})`) : c(33, '  → aucun repli')}`));
  say(APPLY ? c(33, '\n  → réparation : image_url vidé (le repli local reprend la main).')
            : c(33, '\n  → relancez avec --apply pour vider ces image_url.'));
}

title(`2) Photos du dépôt masquées — ${shadowed.length} produit(s)`);
if (!shadowed.length) say(c(32, '  ✔ aucun'));
else {
  say('  image_url valide, mais public/products contient aussi des photos :');
  say(c(33, '  remplacer le fichier .webp de ces produits n\'aura AUCUN effet sur le site.'));
  for (const p of shadowed) say(line(p, `${p.local.length} fichier(s) masqué(s)  ${isRemote(p.image_url) ? 'base → distante' : 'base → locale'}`));
  say(c(33, `\n  ⚠  ${shadowed.length} produits. Certains sont VOLONTAIRES (17 photos refaites, voir IMAGES-PRODUITS.md).`));
  say(c(33, '     --prefer-local --apply les viderait TOUS et ferait revenir les mauvaises photos.'));
  say('     Le geste sûr : vider au cas par cas depuis /admin (« Retirer » sur la photo principale).');
}

title(`3) Aucune photo — ${noPhoto.length} produit(s)`);
if (!noPhoto.length) say(c(32, '  ✔ aucun'));
else for (const p of noPhoto) say(line(p, c(33, 'à photographier')));

title(`4) Galeries avec des entrées mortes — ${deadGallery.length} produit(s)`);
if (!deadGallery.length) say(c(32, '  ✔ aucune'));
else {
  for (const p of deadGallery) say(line(p, `${p.bad.length} morte(s) sur ${p.bad.length + p.keep.length}`));
  say(APPLY ? c(33, '\n  → réparation : entrées mortes retirées de products.images.')
            : c(33, '\n  → relancez avec --apply pour les retirer.'));
}

if (unknown.length) {
  title(`5) Non vérifiables — ${unknown.length} produit(s)`);
  say(c(33, '  L\'URL n\'a pas répondu (réseau, blocage, hotlinking). Non traitées, à revoir.'));
  for (const p of unknown.slice(0, 20)) say(line(p, String(p.image_url).slice(0, 60)));
}

// ------------------------------------------------------------- 7) Écriture
const writes = [];
for (const p of dead) writes.push({ id: p.id, patch: { image_url: null } });
for (const p of deadGallery) {
  const w = writes.find((x) => x.id === p.id) || (writes.push({ id: p.id, patch: {} }), writes[writes.length - 1]);
  w.patch.images = p.keep;
}
if (PREFER_LOCAL) {
  for (const p of shadowed) {
    const w = writes.find((x) => x.id === p.id) || (writes.push({ id: p.id, patch: {} }), writes[writes.length - 1]);
    w.patch.image_url = null;
  }
}

title(`Bilan — ${writes.length} produit(s) à corriger`);
if (!APPLY) {
  say(c(33, '  Mode rapport : RIEN n\'a été écrit.'));
  say('  Pour appliquer :  node scripts/reconcile-images.mjs --apply');
} else if (!writes.length) {
  say(c(32, '  ✔ rien à faire'));
} else {
  if (PREFER_LOCAL) say(c(31, '  ⚠  --prefer-local actif : les photos masquées volontairement seront vidées aussi.'));
  let ok = 0; const fails = [];
  for (const w of writes) {
    const { error } = await sb.from('products').update(w.patch).eq('id', w.id);
    if (error) fails.push(`${w.id}: ${error.message}`); else ok++;
  }
  say(c(32, `  ✔ ${ok} produit(s) mis à jour`));
  if (fails.length) { say(c(31, `  ✘ ${fails.length} échec(s) :`)); fails.slice(0, 10).forEach((f) => say(`     ${f}`)); }
  say('\n  Les pages sont mises en cache : redéployez ou attendez la revalidation pour voir le résultat.');
}

if (JSON_OUT) {
  const strip = (a) => a.map((p) => ({ id: p.id, name: p.name, image_url: p.image_url, local: p.local || [] }));
  console.log(JSON.stringify({
    counts: { products: products.length, files: onDisk.size, dead: dead.length, shadowed: shadowed.length, noPhoto: noPhoto.length, deadGallery: deadGallery.length, unknown: unknown.length },
    dead: strip(dead), shadowed: strip(shadowed), noPhoto: strip(noPhoto),
    deadGallery: deadGallery.map((p) => ({ id: p.id, bad: p.bad, keep: p.keep })),
    applied: APPLY ? writes.length : 0,
  }, null, 2));
}
say('');
