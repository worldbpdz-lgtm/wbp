import { Suspense } from 'react';
import Link from 'next/link';
import '../admin.css';
import LoginForm from '@/components/admin/LoginForm';

export const metadata = { title: 'Admin — Connexion' };

const PERKS = [
  { t: 'Catalogue temps réel', d: 'Produits, marques et catégories publiés en un clic.' },
  { t: 'Devis & messages', d: 'Toutes les demandes clients centralisées au même endroit.' },
  { t: 'Statistiques', d: 'Trafic, campagnes et abonnés suivis au jour le jour.' },
];

export default function AdminLoginPage() {
  return (
    <div className="adm-login lg">
      {/* Colonne gauche : identité de marque. Masquée sous 900px pour laisser
          toute la place au formulaire sur mobile. */}
      <aside className="lg-aside" aria-hidden="true">
        <div className="lg-aside-glow" />
        <div className="lg-aside-inner">
          <div className="lg-aside-brand">
            <span className="lg-mark lg-mark-lg">W</span>
            <div>
              <b>World Business Plus</b>
              <small>Espace d’administration</small>
            </div>
          </div>
          <h2 className="lg-aside-title">Le back-office de votre catalogue sécurité.</h2>
          <ul className="lg-perks">
            {PERKS.map((p) => (
              <li key={p.t}>
                <span className="lg-perk-dot" />
                <span><b>{p.t}</b><i>{p.d}</i></span>
              </li>
            ))}
          </ul>
          <p className="lg-aside-foot">Organisme agréé par l’État — Alger, Algérie</p>
        </div>
      </aside>

      <main className="lg-main">
        <Suspense fallback={(
          <div className="lg-card lg-card-skeleton">
            <div className="lg-card-head">
              <span className="lg-mark" aria-hidden="true">W</span>
              <div><h1>Connexion</h1><p>Chargement…</p></div>
            </div>
            <div className="lg-skel" /><div className="lg-skel" /><div className="lg-skel btn" />
          </div>
        )}>
          <LoginForm />
        </Suspense>
        <Link className="lg-home" href="/">← Retour au site</Link>
      </main>
    </div>
  );
}
