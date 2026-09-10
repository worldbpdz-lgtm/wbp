/** @type {import('next').NextConfig} */

// ============================================================================
// En-têtes de sécurité.
// ----------------------------------------------------------------------------
// Le site n'en envoyait aucun. Ce qu'ils apportent :
//
//  • X-Frame-Options / frame-ancestors — empêche qu'un site tiers affiche
//    wbp-dz.com dans une iframe invisible pour piéger les clics d'un
//    administrateur connecté (clickjacking).
//  • X-Content-Type-Options — empêche le navigateur de « deviner » qu'un
//    fichier envoyé par un visiteur est en fait du HTML/JS exécutable.
//  • Referrer-Policy — cesse d'envoyer l'URL complète (jetons de
//    désinscription, identifiants de campagne…) aux sites externes.
//  • Strict-Transport-Security — impose HTTPS pour les visites suivantes.
//  • Permissions-Policy — coupe caméra, micro et géolocalisation, dont le site
//    n'a aucun usage.
//  • Content-Security-Policy — limite les origines autorisées. 'unsafe-inline'
//    et 'unsafe-eval' restent nécessaires au moteur de rendu de Next.js ; la
//    politique bloque néanmoins tout script chargé depuis un domaine tiers.
// ============================================================================
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Photos produit : dépôt local + Supabase Storage + éventuelles URLs externes
  // saisies dans /admin.
  "img-src 'self' data: blob: https:",
  "media-src 'self'",
  // Requêtes sortantes du navigateur : Supabase (auth, catalogue) et le site.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig = {
  poweredByHeader: false, // n'annonce plus « X-Powered-By: Next.js »
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // L'administration ne doit jamais être indexée ni mise en cache.
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      // L'application mobile de l'équipe (/mobile) : pas d'indexation non plus.
      // Pas de `no-store` en revanche — c'est son service worker qui gère le
      // cache, et un `no-store` l'empêcherait de fonctionner hors connexion.
      {
        source: '/mobile/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/mobile',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      // Le service worker doit pouvoir être remplacé dès qu'une nouvelle
      // version est déployée : sans cela, le navigateur peut servir l'ancien
      // pendant 24 h et les téléphones resteraient sur une version périmée.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
