'use server';
// ============================================================================
// Server actions d'upload d'images (admin uniquement).
// Appelées par <ImageUpload /> avec un FormData contenant le fichier.
// ============================================================================
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { putImage, dropImage, putDoc, dropDoc } from '@/lib/storage';

const FOLDERS = ['products', 'brands', 'categories', 'popup', 'misc'];

/**
 * Upload d'une image. Renvoie { ok, url } ou { ok:false, error }.
 * @param {FormData} formData  champs : file, folder, name
 */
export async function uploadImage(formData) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: 'Session expirée. Reconnectez-vous à /admin.' };
  }
  const file = formData.get('file');
  const folder = FOLDERS.includes(formData.get('folder')) ? formData.get('folder') : 'misc';
  const name = String(formData.get('name') || '').slice(0, 120);
  const res = await putImage(file, { folder, name });
  if (res.ok) {
    revalidatePath('/admin/products');
    revalidatePath('/admin/brands');
    revalidatePath('/admin/categories');
    revalidatePath('/', 'layout');
  }
  return res;
}

/** Upload de plusieurs images d'un coup (galerie produit). */
export async function uploadImages(formData) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: 'Session expirée. Reconnectez-vous à /admin.' };
  }
  const folder = FOLDERS.includes(formData.get('folder')) ? formData.get('folder') : 'misc';
  const name = String(formData.get('name') || '').slice(0, 120);
  const files = formData.getAll('file').slice(0, 12);
  const urls = [];
  const errors = [];
  for (const f of files) {
    const r = await putImage(f, { folder, name });
    if (r.ok) urls.push(r.url); else errors.push(r.error);
  }
  if (!urls.length) return { ok: false, error: errors[0] || 'Aucune image envoyée.' };
  revalidatePath('/admin/products'); revalidatePath('/', 'layout');
  return { ok: true, urls, error: errors.length ? `${errors.length} image(s) refusée(s) : ${errors[0]}` : null };
}

/** Supprime une image du stockage (ignoré si l'URL est externe). */
export async function deleteImage(url) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: 'Session expirée.' };
  }
  return dropImage(url);
}

// ============================================================================
// Documents PDF (fiches techniques). Appelées par <DocsUpload /> depuis la
// fiche produit du back-office.
// ============================================================================

/**
 * Upload d'un ou plusieurs PDF. Renvoie { ok, docs: [{url,name,label,size}] }.
 * @param {FormData} formData  champs : file (répétable), name, label
 */
export async function uploadDocs(formData) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    return { ok: false, error: 'Session expirée. Reconnectez-vous à /admin.' };
  }

  const name = String(formData.get('name') || '').slice(0, 120);
  const label = String(formData.get('label') || '').slice(0, 80);
  const files = formData.getAll('file').slice(0, 6);
  if (!files.length) return { ok: false, error: 'Aucun fichier reçu.' };

  const docs = [];
  const errors = [];
  for (const f of files) {
    const r = await putDoc(f, { name, label });
    if (r.ok) docs.push(r.doc); else errors.push(r.error);
  }
  if (!docs.length) return { ok: false, error: errors[0] || 'Aucun document envoyé.' };

  // Journal d'activité : un PDF publié sur le site public mérite une trace,
  // au même titre qu'une modification de fiche produit.
  await logActivity(user, 'uploadDoc', docs.map((d) => d.name).join(', '));

  revalidatePath('/admin/products');
  revalidatePath('/', 'layout');
  return {
    ok: true,
    docs,
    error: errors.length ? `${errors.length} fichier(s) refusé(s) : ${errors[0]}` : null,
  };
}

/** Supprime un PDF du stockage (ignoré si l'URL est externe). */
export async function deleteDoc(url) {
  try {
    await requireAdmin('deleteDoc', url);
  } catch {
    return { ok: false, error: 'Session expirée.' };
  }
  return dropDoc(url);
}
