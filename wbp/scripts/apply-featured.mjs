// Produits « mis en avant » — ajoute la colonne `featured` aux produits.
// Run from the project root:  node scripts/apply-featured.mjs
// Safe to re-run (idempotent). Uses DATABASE_URL from .env.local / .env.
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
    } catch {}
  }
  return {};
}

const { DATABASE_URL } = env();
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing from .env.local.');
  console.error('   Add it from Supabase → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('Connecting to the database …');
  await client.connect();
  try {
    console.log('→ Featured products migration (featured.sql) …');
    await client.query(readFileSync(join(root, 'supabase', 'featured.sql'), 'utf8'));
    const { rows: [r] } = await client.query(
      'select count(*)::int as total, count(*) filter (where featured)::int as featured from products');
    console.log('\n✅ Colonne `featured` prête.');
    console.log(`   produits : ${r.total} — mis en avant : ${r.featured}`);
    console.log('\nDans /admin/products, cliquez l\'étoile ★ d\'un produit (ou cochez');
    console.log('« Mis en avant » dans sa fiche) pour l\'afficher en premier sur le site.');
  } finally {
    await client.end();
  }
}
run().catch((e) => { console.error('\n❌ Migration failed:', e.message); process.exit(1); });
