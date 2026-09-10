import '@/styles/mobile.css';
import MobileApp from '@/components/mobile/MobileApp';

// ============================================================================
// Application mobile WBP — installée depuis Safari via « Sur l'écran d'accueil ».
// ----------------------------------------------------------------------------
// Ce qui rend l'installation possible :
//   • le manifeste /wbp-app.webmanifest (nom « WBP », icône, écran d'accueil
//     orange, démarrage sur /mobile, affichage plein écran) ;
//   • appleWebApp — sur iOS, c'est cette balise qui retire la barre d'adresse
//     de Safari et donne une vraie fenêtre d'application ;
//   • viewportFit 'cover' + les env(safe-area-inset-*) du CSS, pour que le
//     contenu ne passe ni sous l'encoche ni sous la barre d'accueil.
//
// noindex : cet espace est réservé à l'équipe, il n'a rien à faire dans Google.
// ============================================================================

export const metadata = {
  title: 'WBP',
  applicationName: 'WBP',
  description: 'Statistiques et activité de l’équipe World Business Plus.',
  manifest: '/wbp-app.webmanifest',
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: {
    capable: true,
    title: 'WBP',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/app-icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/app-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#FF5A1F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function MobileLayout({ children }) {
  return <MobileApp>{children}</MobileApp>;
}
