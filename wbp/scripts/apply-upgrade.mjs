// Mise à niveau 2026-07 : images, vitrine, pop-up newsletter, assistant IA.
// Lancer depuis la racine du projet :  node scripts/apply-upgrade.mjs
// Idempotent (ré-exécutable). Utilise DATABASE_URL de .env.local / .env.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function env() {
  for (const f of ['.env.local', '.env']) {
    try {
      const o = {};
      for (const line of readFileSync(join(root, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      if (o.DATABASE_URL) return o;
    } catch { /* fichier absent — on essaie le suivant */ }
  }
  return {};
}

const { DATABASE_URL } = env();
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL est absent de .env.local.');
  console.error('   Copiez-le depuis Supabase → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

const SQL_FILES = [
  ['newsletter.sql', 'Newsletter & campagnes (pré-requis)'],
  ['upgrade.sql', 'Images, vitrine, pop-up, assistant IA'],
  ['new-arrivals.sql', 'Nouveautés (nouveaux arrivages)'],
];

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('Connexion à la base de données …');
  await client.connect();
  try {
    for (const [file, label] of SQL_FILES) {
      console.log(`→ ${label}  (${file})`);
      await client.query(readFileSync(join(root, 'supabase', file), 'utf8'));
    }

    const q = async (sql) => (await client.query(sql)).rows[0];
    const p = await q('select count(*)::int total, count(*) filter (where featured)::int feat from products');
    const b = await q('select count(*)::int total, count(logo_url)::int logos from brands');
    const c = await q('select count(*)::int total, count(image_url)::int imgs from categories');
    const v = await q("select count(*)::int n from featured_picks where site = 'wbp'");
    const na = await q("select count(*)::int n from new_arrivals where site = 'wbp'");
    // Le schéma « storage » appartient parfois à un autre rôle : on ne fait pas
    // échouer le rapport si on n'a pas le droit de le lire.
    let bucket = null, bucketErr = null;
    try { bucket = await q("select public from storage.buckets where id = 'media'"); }
    catch (e) { bucketErr = e.message; }

    console.log('\n✅ Mise à niveau appliquée.\n');
    console.log(`   Produits ......... ${p.total} (dont ${p.feat} en avant)`);
    console.log(`   Marques .......... ${b.total} (dont ${b.logos} avec logo)`);
    console.log(`   Catégories ....... ${c.total} (dont ${c.imgs} avec image)`);
    console.log(`   Vitrine .......... ${v.n} produit(s) sélectionné(s)`);
    console.log(`   Nouveautés ....... ${na.n} produit(s) sélectionné(s)`);
    const bucketState = bucketErr ? 'non vérifiable depuis cette connexion'
      : bucket ? (bucket.public ? 'prêt (public)' : 'créé mais PRIVÉ — passez-le en public') : 'introuvable';
    console.log(`   Stockage « media » ${bucketState}`);

    if (bucketErr || !bucket || bucket.public === false) {
      console.log('\n⚠️  Le stockage des images demande une vérification manuelle :');
      console.log('    Supabase → Storage → New bucket → nom exact « media » → cochez « Public bucket ».');
      console.log('    (Si le bucket « media » existe déjà et est public, il n\'y a rien à faire.)');
    }

    console.log('\nÀ faire ensuite dans /admin :');
    console.log('   • Marques / Catégories → glissez un logo ou une image');
    console.log('   • Produits → photo principale + galerie');
    console.log('   • Vitrine → choisissez catégorie, marque et produits mis en avant');
    console.log('   • Nouveautés → choisissez les produits des « Nouveaux arrivages »');
    console.log('   • Assistant IA → collez l\'URL de votre plateforme + la clé du widget');
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error('\n❌ La migration a échoué :', e.message);
  if (/storage/i.test(e.message || '')) {
    console.error('   Astuce : si le schéma « storage » est inaccessible via cette connexion,');
    console.error('   collez supabase/upgrade.sql dans Supabase → SQL Editor et cliquez Run.');
  }
  process.exit(1);
});
