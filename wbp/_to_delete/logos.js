// Brand & client logo assets (files live in /public/logos/{brands,clients}).
// Resolved at render time by id / normalized name, so this works whether brands &
// clients come from the database or the fallback catalog.

const norm = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD') // decompose accents; the alphanumeric filter below drops the marks
    .replace(/[^a-z0-9]+/g, '');

// ----- Brand logos (by normalized id / short / name) -----
const BRAND_LOGOS = {
  ajax: '/logos/brands/ajax.png',
  ajaxsystems: '/logos/brands/ajax.png',
  maxhub: '/logos/brands/maxhub.png',
  ubiquiti: '/logos/brands/ubiquiti.png',
  imou: '/logos/brands/imou.png',
  wd: '/logos/brands/wd.png',
  westerndigital: '/logos/brands/wd.png',
  seagate: '/logos/brands/seagate.png',
  dahua: '/logos/brands/dahua.png',
  dahuatechnology: '/logos/brands/dahua.png',
  // apollo: no logo asset supplied -> components fall back to the text mark
};

// WBP's own company emblem (not a product brand) — used e.g. in the email header.
export const WBP_LOGO = '/logos/wbp.png';

// Le logo choisi dans /admin/brands (colonne brands.logo_url) gagne toujours ;
// on retombe sur les fichiers livrés dans /public/logos/brands pour les marques
// historiques qui n'ont pas encore d'upload.
export const brandLogo = (b) =>
  (b && (b.logo_url || BRAND_LOGOS[norm(b.id)] || BRAND_LOGOS[norm(b.short)] || BRAND_LOGOS[norm(b.name)])) || null;

// Image d'illustration d'une catégorie (uploadée depuis /admin/categories).
export const categoryImage = (c) => (c && c.image_url) || null;

// ----- Clients (trusted-by slider), in display order, each with its logo -----
export const CLIENTS = [
  { name: 'Sonatrach', logo: '/logos/clients/sonatrach.png' },
  { name: 'Sonelgaz', logo: '/logos/clients/sonelgaz.png' },
  { name: 'Air Algérie', logo: '/logos/clients/air-algerie.png' },
  { name: 'SNTF', logo: '/logos/clients/sntf.png' },
  { name: 'SNVI', logo: '/logos/clients/snvi.png' },
  { name: 'ETUSA', logo: '/logos/clients/etusa.png' },
  { name: 'BNA', logo: '/logos/clients/bna.png' },
  { name: 'CDER', logo: '/logos/clients/cder.png' },
  { name: 'Université de Bouzaréah', logo: '/logos/clients/universite-bouzareah.png' },
  { name: 'Hyatt Regency', logo: '/logos/clients/hyatt-regency.png' },
  { name: 'Pharmalliance', logo: '/logos/clients/pharmalliance.png' },
  { name: 'Biogalenic', logo: '/logos/clients/biogalenic.png' },
  { name: 'Merinal', logo: '/logos/clients/merinal.png' },
  { name: 'Ifri', logo: '/logos/clients/ifri.png' },
  { name: 'Guedila', logo: '/logos/clients/guedila.png' },
  { name: 'Jotun', logo: '/logos/clients/jotun.png' },
  { name: 'Grupo Puma', logo: '/logos/clients/grupo-puma.png' },
  { name: 'Aurora', logo: '/logos/clients/aurora.png' },
  { name: 'JMC', logo: '/logos/clients/jmc.png' },
  { name: 'Cofeed', logo: '/logos/clients/cofeed.png' },
  { name: 'Palmary', logo: '/logos/clients/palmary.png' },
  { name: 'Lamaraz', logo: '/logos/clients/lamaraz.png' },
];

const CLIENT_LOGO_BY_NAME = Object.fromEntries(CLIENTS.map((c) => [norm(c.name), c.logo]));
export const clientLogo = (name) => CLIENT_LOGO_BY_NAME[norm(name)] || null;
