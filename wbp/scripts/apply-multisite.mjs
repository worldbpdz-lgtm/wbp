// WBP + Central Network — applies the shared-database (multi-site) migration.
// Run from either project root:  node scripts/apply-multisite.mjs
// Safe to re-run. On a fresh/empty database it also creates the tables and
// imports the full catalogue first.
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

const sql = (f) => readFileSync(join(root, 'supabase', f), 'utf8');

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('Connecting to the shared database …');
  await client.connect();
  try {
    const one = async (q) => (await client.query(q)).rows[0].n;

    // Fresh database? Create everything first (same steps as db-setup.mjs).
    const { rows: [t] } = await client.query(
      "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='products')::bool as ok");
    if (!t.ok) {
      console.log('→ Fresh database: creating tables & base data (setup.sql) …');
      await client.query(sql('setup.sql'));
    }
    if (!t.ok || (await one('select count(*)::int n from products')) === 0) {
      console.log('→ Importing the full product catalogue (products_import.sql) …');
      await client.query(sql('products_import.sql'));
    }

    console.log('→ Newsletter & campaigns schema (newsletter.sql) …');
    await client.query(sql('newsletter.sql'));

    console.log('→ Multi-site migration (multisite.sql) …');
    await client.query(sql('multisite.sql'));

    console.log('\n✅ Shared database ready for BOTH websites.');
    console.log(`   brands: ${await one('select count(*)::int n from brands')}   categories: ${await one('select count(*)::int n from categories')}`);
    console.log(`   products (shared): ${await one('select count(*)::int n from products')}  — visible on the sites: ${await one('select count(*)::int n from products where active')}`);
    for (const [id, label] of [['wbp', 'World Business Plus'], ['cn', 'Central Network   ']]) {
      const w = (tbl) => `select count(*)::int n from ${tbl} where site='${id}'`;
      console.log(`   ${label} — quotes: ${await one(w('quote_requests'))} · messages: ${await one(w('contact_messages'))} · reviews: ${await one(w('reviews'))} · subscribers: ${await one(w('newsletter_subscribers'))} · clients: ${await one(w('clients'))} · settings: ${await one(w('settings'))}`);
    }
    console.log('\nFrom now on: add or edit a product/brand/category in the admin of');
    console.log('EITHER site and the change appears on BOTH websites.');
  } finally {
    await client.end();
  }
}
run().catch((e) => { console.error('\n❌ Migration failed:', e.message); process.exit(1); });
