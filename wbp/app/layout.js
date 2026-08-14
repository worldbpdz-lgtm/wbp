import './globals.css';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://wbp-dz.com'),
  title: {
    default: 'World Business Plus — Sécurité · Réseaux · Affichage',
    template: '%s — World Business Plus',
  },
  description:
    "World Business Plus (WBP) — Distributeur agréé en Algérie. Vidéosurveillance, alarme, contrôle d'accès, affichage MAXHUB, réseau & stockage. Prix sur devis.",
  // Logo WBP (globe) sur fond blanc : lisible dans un onglet clair comme sombre.
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = { themeColor: '#FF5A1F' };

export default function RootLayout({ children }) {
  return (
    <html lang="fr" dir="ltr" data-theme="light" suppressHydrationWarning>
      <body data-cards="shadow" data-motion="on">{children}</body>
    </html>
  );
}
