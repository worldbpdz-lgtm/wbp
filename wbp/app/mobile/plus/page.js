import Link from 'next/link';
import { requireMobileEditor } from '@/app/mobile/guard';
import { displayName } from '@/lib/activity';
import { Icon } from '@/components/mobile/ui';
import SignOutRow from '@/components/mobile/SignOutRow';

// ============================================================================
// Onglet « Plus » — les écrans qu'on n'ouvre pas tous les jours.
// ----------------------------------------------------------------------------
// Un écran, pas un menu flottant : les listes déroulantes d'un menu se visent
// mal au pouce, et un écran plein permet d'écrire sous chaque entrée ce qu'elle
// fait. L'équipe n'a pas à devenir experte de l'application pour la première
// fois où elle cherche à modérer un avis.
//
// Les quatre écrans quotidiens (statistiques, produits, demandes) sont dans la
// barre du bas ; tout le reste est ici.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plus — WBP' };

const ITEMS = [
  {
    href: '/mobile/reviews',
    icon: 'star',
    color: '#F59E0B',
    title: 'Avis clients',
    note: 'Publier ou refuser les avis reçus. Un avis reste invisible tant qu’il n’est pas publié.',
  },
  {
    href: '/mobile/vitrine',
    icon: 'spark',
    color: '#7C3AED',
    title: 'Vitrine du site',
    note: 'Choisir les produits de la page d’accueil : vitrine, meilleures ventes, nouveautés.',
  },
  {
    href: '/mobile/marques',
    icon: 'layers',
    color: '#0E9488',
    title: 'Marques',
    note: 'Ajouter une marque, changer son logo ou son ordre d’affichage.',
  },
  {
    href: '/mobile/categories',
    icon: 'grid',
    color: '#3B82F6',
    title: 'Catégories',
    note: 'Les familles de produits et leurs images sur la page d’accueil.',
  },
  {
    href: '/mobile/reglages',
    icon: 'cog',
    color: '#7C7167',
    title: 'Réglages du site',
    note: 'Téléphone, e-mail, adresse, réseaux sociaux — ce qui s’affiche sur le site public.',
  },
];

export default async function MobilePlus() {
  const user = await requireMobileEditor();

  return (
    <>
      <header className="mb-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app-icon-192.png" alt="" width={34} height={34} />
        <div className="grow">
          <h1>Plus</h1>
          <p>{displayName(user)}</p>
        </div>
      </header>

      <div className="mb-wrap">
        <nav className="mb-menu">
          {ITEMS.map((it) => (
            <Link key={it.href} href={it.href}>
              <span className="ic" style={{ background: it.color }}><Icon name={it.icon} size={20} /></span>
              <span className="bd">
                <b>{it.title}</b>
                <small>{it.note}</small>
              </span>
              <Icon name="chevright" size={19} />
            </Link>
          ))}
        </nav>

        <SignOutRow />
      </div>
    </>
  );
}
