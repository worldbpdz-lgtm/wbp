// ============================================================================
// Images — upload vers Supabase Storage (bucket public « media »).
// ----------------------------------------------------------------------------
// Server-only. Les uploads passent par la clé service_role (elle contourne RLS)
// donc le navigateur n'a jamais besoin d'un droit d'écriture sur le stockage.
// Chaque image est recompressée en WebP avant d'être stockée : une photo
// produit de 4 Mo sortie d'un téléphone tombe à ~80 Ko, le site reste rapide.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/server';

export const BUCKET = 'media';

/** Tailles maximales par usage (largeur en px, qualité WebP). */
const PRESETS = {
  products: { width: 1400, quality: 82, fit: 'inside' },
  brands: { width: 520, quality: 90, fit: 'inside' },
  categories: { width: 1000, quality: 84, fit: 'inside' },
  popup: { width: 900, quality: 84, fit: 'inside' },
  misc: { width: 1400, quality: 82, fit: 'inside' },
};

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'];
export const MAX_BYTES = 12 * 1024 * 1024; // 12 Mo à l'entrée

export function slugify(s, fallback = 'image') {
  const out = String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return out || fallback;
}

/**
 * Recompresse en WebP quand c'est possible. Les SVG et GIF animés passent tels
 * quels (sharp aplatirait l'animation / vectoriserait mal).
 */
async function optimise(buffer, mime, preset) {
  if (mime === 'image/svg+xml' || mime === 'image/gif') {
    return { buffer, ext: mime === 'image/svg+xml' ? 'svg' : 'gif', contentType: mime };
  }
  try {
    const { default: sharp } = await import('sharp');
    const img = sharp(buffer, { failOn: 'none' }).rotate(); // rotate() applique l'EXIF des photos
    const meta = await img.metadata();
    const resized = meta.width && meta.width > preset.width
      ? img.resize({ width: preset.width, fit: preset.fit, withoutEnlargement: true })
      : img;
    const out = await resized.webp({ quality: preset.quality, effort: 4 }).toBuffer();
    return { buffer: out, ext: 'webp', contentType: 'image/webp' };
  } catch {
    // sharp indisponible (ou image exotique) : on stocke l'original.
    const ext = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
    return { buffer, ext, contentType: mime };
  }
}

/**
 * Envoie un fichier dans le bucket et renvoie son URL publique.
 * @param {File|Blob} file        fichier reçu d'un <input type=file> via FormData
 * @param {object}    opts
 * @param {string}    opts.folder 'products' | 'brands' | 'categories' | 'popup' | 'misc'
 * @param {string}    opts.name   base du nom de fichier (ex. le nom du produit)
 * @returns {Promise<{ok:boolean, url?:string, path?:string, error?:string, bytes?:number}>}
 */
export async function putImage(file, { folder = 'misc', name = '' } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') return { ok: false, error: 'Aucun fichier reçu.' };
  const mime = file.type || '';
  if (!ALLOWED.includes(mime)) {
    return { ok: false, error: 'Format non pris en charge. Utilisez JPG, PNG, WebP, AVIF, GIF ou SVG.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `Image trop lourde (${(file.size / 1048576).toFixed(1)} Mo). Maximum 12 Mo.` };
  }

  const dir = PRESETS[folder] ? folder : 'misc';
  const preset = PRESETS[dir];
  const raw = Buffer.from(await file.arrayBuffer());
  const { buffer, ext, contentType } = await optimise(raw, mime, preset);

  const base = slugify(name || (file.name || '').replace(/\.[^.]+$/, ''), dir);
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const path = `${dir}/${base}-${stamp}.${ext}`;

  const sb = createAdminClient();
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType, cacheControl: '31536000', upsert: false,
  });
  if (error) {
    const msg = /bucket/i.test(error.message)
      ? 'Le stockage « media » est introuvable. Lancez apply-upgrade.bat une fois.'
      : error.message;
    return { ok: false, error: msg };
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path, bytes: buffer.length };
}

/** Chemin interne du bucket à partir d'une URL publique (null si externe). */
export function pathFromUrl(url) {
  const m = String(url || '').match(new RegExp(`/storage/v1/object/public/${BUCKET}/(.+)$`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Supprime un fichier du bucket. Ignore silencieusement les URLs externes. */
export async function dropImage(url) {
  const path = pathFromUrl(url);
  if (!path) return { ok: true, skipped: true };
  const sb = createAdminClient();
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  return error ? { ok: false, error: error.message } : { ok: true };
}
