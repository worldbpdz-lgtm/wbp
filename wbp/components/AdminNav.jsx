'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/primitives';
import { signOutAction } from '@/app/admin/actions';

const GROUPS = [
  { items: [['/admin', 'Tableau de bord', 'grid'], ['/admin/analytics', 'Analytics', 'chart']] },
  { label: 'Catalogue', items: [['/admin/products', 'Produits', 'box'], ['/admin/brands', 'Marques', 'badge'], ['/admin/categories', 'Catégories', 'layers'], ['/admin/showcase', 'Vitrine', 'bolt'], ['/admin/arrivals', 'Nouveautés', 'spark']] },
  { label: 'Activité', items: [['/admin/quotes', 'Demandes de devis', 'cart', 'quotes'], ['/admin/messages', 'Messages', 'mail', 'messages'], ['/admin/reviews', 'Avis', 'star', 'reviews']] },
  { label: 'E-mailing', items: [['/admin/subscribers', 'Abonnés', 'user'], ['/admin/campaigns', 'Campagnes', 'mail']] },
  { label: 'Site', items: [['/admin/ai', 'Assistant IA', 'headset'], ['/admin/settings', 'Paramètres', 'cog']] },
];

export default function AdminNav({ counts = {}, email }) {
  const pathname = usePathname();
  return (
    <aside className="adm-side">
      <div className="adm-brand">
        {/* Barre latérale sombre → variante claire du logo (/logos/wbp.png). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="m"><img src="/logos/wbp.png" alt="World Business Plus" width={40} height={40} /></span>
        <span>World Business Plus<small>Administration</small></span>
      </div>
      {GROUPS.map((g, gi) => (
        <React.Fragment key={gi}>
          {g.label && <div className="adm-navlabel">{g.label}</div>}
          {g.items.map(([href, label, icon, key]) => {
            const on = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            const n = key ? counts[key] : 0;
            return (
              <Link key={href} href={href} className={`adm-navlink ${on ? 'on' : ''}`}>
                <Icon name={icon} size={18} />{label}{n > 0 && <span className="badge-n">{n}</span>}
              </Link>
            );
          })}
        </React.Fragment>
      ))}
      <div className="adm-side-foot">
        <div className="who">{email}</div>
        <div className="adm-actions">
          <form action={signOutAction}><button className="adm-btn sm" type="submit">Déconnexion</button></form>
          <Link href="/" className="adm-btn sm">Voir le site</Link>
        </div>
      </div>
    </aside>
  );
}
