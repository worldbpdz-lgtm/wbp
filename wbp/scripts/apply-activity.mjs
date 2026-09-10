// Journal d'activité — crée la table `admin_activity` (qui a fait quoi, quand).
// Run from the project root:  node scripts/apply-activity.mjs
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
  console.error('❌ DATABASE_URL est absent de .env.local.');
  console.error('   Ajoutez-le depuis Supabase → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('Connexion à la base de données …');
  await client.connect();
  try {
    console.log('→ Migration Journal d\'activité (activity.sql) …');
    await client.query(readFileSync(join(root, 'supabase', 'activity.sql'), 'utf8'));
    const { rows: [r] } = await client.query('select count(*)::int as n from admin_activity');
    console.log('\n✅ Table `admin_activity` prête.');
    console.log(`   Actions déjà enregistrées : ${r?.n ?? 0}`);
    console.log('\nÀ partir de maintenant, chaque action du back-office est journalisée.');
    console.log('Elle apparaît dans l\'application mobile, onglet « Activité ».');
  } finally {
    await client.end();
  }
}
run().catch((e) => { console.error('\n❌ La migration a échoué :', e.message); process.exit(1); });
