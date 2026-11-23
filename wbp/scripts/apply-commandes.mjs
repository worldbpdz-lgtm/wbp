// Commandes, clients et notifications — applique supabase/commandes-notifications.sql.
// Lancer depuis la racine du projet :  node scripts/apply-commandes.mjs
// Ré-exécutable sans risque (migration additive et idempotente).
// Utilise DATABASE_URL de .env.local / .env.
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
    } catch { /* fichier absent */ }
  }
  return {};
}

const { DATABASE_URL } = env();
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL est absent de .env.local.');
  console.error('   Ajoutez-le depuis Supabase → Project Settings → Database → Connection string (URI),');
  console.error('   ou collez supabase/commandes-notifications.sql dans Supabase → SQL Editor → Run.');
  process.exit(1);
}

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('Connexion à la base de données …');
  await client.connect();
  try {
    console.log('→ Migration Commandes, clients et notifications …');
    const res = await client.query(readFileSync(join(root, 'supabase', 'commandes-notifications.sql'), 'utf8'));
    // La dernière instruction du fichier est le tableau de vérification.
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    console.log('');
    for (const r of last?.rows || []) console.log(`   ${String(r.objet).padEnd(22)} ${r.etat}`);
    console.log('\n✅ Migration appliquée.');
    console.log('   Commandes, fiches clients et notifications sont actifs dans /admin et l\'app mobile.');
  } finally {
    await client.end();
  }
}
run().catch((e) => { console.error('\n❌ La migration a échoué :', e.message); process.exit(1); });
