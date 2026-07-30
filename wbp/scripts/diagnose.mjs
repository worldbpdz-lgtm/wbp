// ============================================================================
// Diagnostic World Business Plus
// ----------------------------------------------------------------------------
// Répond à « le site ne se charge pas » / « rien n'a changé » en vérifiant, dans
// l'ordre : fichiers de la mise à niveau présents, variables d'environnement,
// joignabilité de Supabase, tables et colonnes attendues, bucket d'images.
//
// Lancer :  node scripts/diagnose.mjs      (ou double-cliquer diagnostic.bat)
// N'écrit rien, ne modifie rien.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const ko = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const title = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const todo = [];

console.log('\n=== Diagnostic World Business Plus ===');

// ---------------------------------------------------------------- 1) Fichiers
title('1) Fichiers de la mise à niveau');
const FILES = [
  'styles/ui-2026.css', 'styles/admin-2026.css',
  'components/AiChat.jsx', 'components/NewsletterPopup.jsx',
  'components/admin/ImageUpload.jsx', 'components/admin/ShowcaseManager.jsx',
  'components/admin/AiSettingsManager.jsx',
  'lib/storage.js', 'lib/ai/assistant.js',
  'app/api/chat/route.js', 'app/admin/(panel)/showcase/page.js', 'app/admin/(panel)/ai/page.js',
  'supabase/upgrade.sql',
];
const missing = FILES.filter((f) => !existsSync(join(root, f)));
if (missing.length) { ko(`${missing.length} fichier(s) manquant(s) : ${missing.join(', ')}`); todo.push('Recopier les fichiers manquants dans le projet.'); }
else ok(`les ${FILES.length} fichiers sont présents`);

const globals = existsSync(join(root, 'app/globals.css')) ? readFileSync(join(root, 'app/globals.css'), 'utf8') : '';
if (globals.includes('ui-2026.css')) ok('app/globals.css charge bien le nouveau style');
else { ko('app/globals.css ne charge PAS ui-2026.css — le nouveau design ne s\'affichera pas'); todo.push('Ajouter @import \'../styles/ui-2026.css\'; en haut de app/globals.css'); }

// ------------------------------------------------------- 2) Variables d'env.
title('2) Variables d\'environnement (.env.local)');
function env() {
  for (const f of ['.env.local', '.env']) {
    try {
      const o = {};
      for (const line of readFileSync(join(root, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      if (Object.keys(o).length) { o.__file = f; return o; }
    } catch { /* fichier suivant */ }
  }
  return {};
}
const E = env();
if (!E.__file) { ko('aucun .env.local trouvé'); todo.push('Créer .env.local à partir de .env.example.'); }
else ok(`lu depuis ${E.__file}`);

const need = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAILS'];
for (const k of need) {
  if (!E[k]) { ko(`${k} manquant`); todo.push(`Renseigner ${k} dans .env.local.`); }
  else ok(`${k} = ${k.includes('KEY') ? E[k].slice(0, 12) + '…' : E[k]}`);
}
if (E.NEXT_PUBLIC_SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(E.NEXT_PUBLIC_SUPABASE_URL)) {
  ko('NEXT_PUBLIC_SUPABASE_URL doit ressembler à https://xxxx.supabase.co (pas une chaîne postgres://)');
  todo.push('Corriger NEXT_PUBLIC_SUPABASE_URL (Supabase → Settings → API → Project URL).');
}

// --------------------------------------------------------- 3) Joignabilité
title('3) Connexion à Supabase');
if (!E.NEXT_PUBLIC_SUPABASE_URL || !E.SUPABASE_SERVICE_ROLE_KEY) {
  ko('impossible de tester sans URL + clé service_role');
  finish(); process.exit(0);
}
const base = E.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');
const headers = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` };

async function get(path, ms = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const started = Date.now();
  try {
    const r = await fetch(`${base}${path}`, { headers, signal: c.signal });
    return { status: r.status, ms: Date.now() - started, body: await r.text() };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, err: e?.name === 'AbortError' ? 'timeout' : e?.message };
  } finally { clearTimeout(t); }
}

const ping = await get('/rest/v1/?select=1');
if (ping.status === 0) {
  ko(`Supabase injoignable (${ping.err}) après ${ping.ms} ms`);
  console.log('\n   C\'EST TRÈS PROBABLEMENT LA CAUSE DU BLOCAGE.');
  console.log('   Les projets Supabase gratuits se mettent EN PAUSE après quelques');
  console.log('   jours sans activité, et toutes les pages du site restent alors en');
  console.log('   attente. Ouvrez https://supabase.com/dashboard : si le projet');
  console.log('   affiche « Paused », cliquez « Restore project », patientez 1–2 min,');
  console.log('   puis relancez npm run dev.');
  todo.push('Réveiller le projet Supabase (dashboard → Restore), ou corriger l\'URL.');
  finish(); process.exit(0);
}
ok(`le serveur Supabase répond en ${ping.ms} ms (HTTP ${ping.status})`);
if (ping.ms > 4000) warn('réponse lente — le premier chargement des pages sera long');
if (ping.status === 401 || ping.status === 403) {
  ko('mais la clé est REFUSÉE (401/403) : le serveur est joignable, pas la base.');
  console.log('   → Supabase → Settings → API : recopiez « service_role » dans');
  console.log('     SUPABASE_SERVICE_ROLE_KEY et « anon public » dans');
  console.log('     NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local ET variables Vercel).');
  todo.push('Recopier les clés API Supabase dans .env.local (elles changent si le projet est recréé).');
}

// ------------------------------------------------------------ 4) Migration
title('4) Base de données — la migration a-t-elle été appliquée ?');
const checks = [
  ['brands?select=id&limit=1', 'table brands', true],
  ['products?select=id&limit=1', 'table products', true],
  ['brands?select=logo_url&limit=1', 'colonne brands.logo_url (logos de marque)', false],
  ['categories?select=image_url&limit=1', 'colonne categories.image_url (images de catégorie)', false],
  ['products?select=images&limit=1', 'colonne products.images (galerie)', false],
  ['featured_picks?select=product_id&limit=1', 'table featured_picks (vitrine)', false],
  ['ai_config?select=site&limit=1', 'table ai_config (assistant IA)', false],
  ['ai_messages?select=id&limit=1', 'table ai_messages (journal du chat)', false],
];
let missingMigration = 0, denied = 0;
for (const [q, label, core] of checks) {
  const r = await get(`/rest/v1/${q}`);
  if (r.status >= 200 && r.status < 300) { ok(label); continue; }
  // 401/403 = clé refusée (rien à voir avec la migration).
  // 404 / code PGRST205 / « does not exist » = objet réellement absent.
  if (r.status === 401 || r.status === 403) { ko(`${label} — accès refusé (HTTP ${r.status})`); denied++; continue; }
  const absent = r.status === 404 || /PGRST(205|204)|does not exist|could not find/i.test(r.body || '');
  if (core && !absent) ko(`${label} — HTTP ${r.status}`);
  else if (core) { ko(`${label} — TABLE ABSENTE`); todo.push('Exécuter supabase/setup.sql : la base est vide.'); }
  else { warn(`${label} — absent`); missingMigration++; }
}
if (denied) {
  console.log(`\n   ${denied} vérification(s) refusée(s) : c'est un problème de CLÉ, pas de migration.`);
  console.log('   Impossible de savoir si la migration est appliquée tant que la clé');
  console.log('   service_role n\'est pas correcte. Corrigez-la puis relancez ce diagnostic.');
} else if (missingMigration) {
  console.log(`\n   ${missingMigration} élément(s) manquant(s) : la migration n'a pas encore été appliquée.`);
  console.log('   → Double-cliquez apply-upgrade.bat, ou collez supabase/upgrade.sql');
  console.log('     dans Supabase → SQL Editor → Run.');
  console.log('   (Le site fonctionne quand même, mais sans upload d\'images,');
  console.log('    sans vitrine et sans page Assistant IA.)');
  todo.push('Lancer apply-upgrade.bat pour appliquer la migration.');
} else ok('migration déjà appliquée ✓');

// -------------------------------------------------------------- 5) Stockage
title('5) Stockage des images');
const bucket = await get('/storage/v1/bucket/media');
if (bucket.status === 200) {
  const pub = /"public"\s*:\s*true/.test(bucket.body || '');
  if (pub) ok('bucket « media » présent et public');
  else { warn('bucket « media » présent mais PRIVÉ — les photos ne s\'afficheront pas'); todo.push('Supabase → Storage → media → Settings → cocher « Public bucket ».'); }
} else {
  warn(`bucket « media » introuvable (HTTP ${bucket.status})`);
  todo.push('Supabase → Storage → New bucket → nom « media » → cocher « Public bucket ».');
}

// -------------------------------------------------------------- 6) Contenu
title('6) Contenu du catalogue');
const prods = await get('/rest/v1/products?select=id&active=eq.true&limit=1');
const count = await fetch(`${base}/rest/v1/products?select=id&active=eq.true`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } })
  .then((r) => r.headers.get('content-range')).catch(() => null);
if (prods.status === 200) ok(`produits visibles : ${count ? count.split('/')[1] : '?'}`);
else ko(`lecture des produits impossible (HTTP ${prods.status})`);

finish();

function finish() {
  title('CE QU\'IL RESTE À FAIRE');
  if (!todo.length) {
    console.log('  Rien — tout est en place. Si une page reste blanche, videz le cache :');
    console.log('    rmdir /s /q .next   puis   npm run dev');
  } else {
    [...new Set(todo)].forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  }
  console.log('\n  Rappel : modifier les fichiers en local ne change PAS le site en ligne.');
  console.log('  Il faut pousser sur GitHub (Vercel redéploie), ou redéployer depuis Vercel.\n');
}
