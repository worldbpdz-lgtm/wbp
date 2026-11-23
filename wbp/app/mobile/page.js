'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { TopBar, useMobile } from '@/components/mobile/MobileApp';
import PushCta from '@/components/mobile/PushCta';
import { Area, Bars, Donut, Icon, Kpi, Skeleton, fmt } from '@/components/mobile/ui';
import { agoOf, useCached } from '@/components/mobile/store';
import { QUOTE_STATUSES, orderStatus } from '@/lib/crm';
import { dzd } from '@/lib/pricing';
import '@/styles/mobile-inbox.css';

// ============================================================================
// Onglet « Stats » — les mêmes chiffres que le tableau de bord de /admin,
// remis en page pour un écran de téléphone.
//
// Rien n'est calculé ici : /api/mobile/stats appelle getDashboard() et
// getAnalytics(), exactement les fonctions du web. Une seule source de vérité,
// donc pas de risque que le téléphone et l'ordinateur affichent deux nombres
// différents pour la même chose.
// ============================================================================

const DEVICE_LABEL = { desktop: 'Ordinateur', mobile: 'Téléphone', tablet: 'Tablette' };
// Libellés partagés avec le back-office (lib/crm) : « won » s'affiche
// « Accepté » partout, et non le code brut.
const QUOTE_LABEL = Object.fromEntries(QUOTE_STATUSES.map((q) => [q.value, q.label]));
const QUOTE_COLOR = { new: '#FF5A1F', contacted: '#0E9488', quoted: '#3B82F6', won: '#1F9D55', lost: '#B45309', closed: '#7C7167' };

export default function StatsScreen() {
  const { me, editor } = useMobile();
  const { data, status, cachedAt, busy, refresh } = useCached('stats', '/api/mobile/stats');

  const dayLabels = useMemo(
    () => (data?.days14 || []).map((d) => d.slice(5).replace('-', '/')),
    [data],
  );

  const devices = useMemo(() => ['desktop', 'mobile', 'tablet']
    .map((k) => ({ label: DEVICE_LABEL[k], value: data?.devices?.[k] || 0 })), [data]);

  const quotes = useMemo(() => Object.entries(data?.qStatus || {})
    .map(([k, v]) => ({ label: QUOTE_LABEL[k] || k, value: v, color: QUOTE_COLOR[k] || '#F59E0B' })), [data]);

  const k = data?.kpis;

  return (
    <>
      <TopBar
        title="Statistiques"
        subtitle={data ? `Mis à jour ${agoOf(cachedAt)}` : 'Chargement…'}
        onRefresh={refresh}
        busy={busy}
      />

      <div className="mb-wrap">
        <PushCta />
        {status === 'offline' && !data && (
          <div className="mb-note off">
            <Icon name="globe" size={17} />
            <span>Pas de connexion, et rien encore en mémoire sur ce téléphone.
              Reconnectez-vous au réseau une première fois.</span>
          </div>
        )}
        {status === 'cached' && data && (
          <div className="mb-note off">
            <Icon name="clock" size={17} />
            <span>Chiffres en mémoire ({agoOf(cachedAt)}). Le téléphone réessaiera dès qu’il aura du réseau.</span>
          </div>
        )}

        {!data ? (
          <>
            <div className="mb-kpis"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
            <Skeleton h={190} /><Skeleton h={150} />
          </>
        ) : (
          <>
            {/* ------------------------------------------------------ ventes -- */}
            {data.ordersReady && k.ordersPending && (
              <>
                <div className="mb-sec-t">Ventes</div>
                <div className="mb-kpis">
                  <Kpi color="#E0533D" icon="truck" n={k.ordersPending.n} label="Commandes à confirmer" href="/mobile/inbox?f=order" />
                  <Kpi color="#1F9D55" icon="wallet" n={k.revenue30.n} label="CA confirmé, 30 j (DA)" trend={k.revenue30.trend} />
                  <Kpi color="#0E9488" icon="receipt" n={k.orders30.n} label="Commandes, 30 j" />
                  <Kpi color="#3B82F6" icon="clock" n={k.ordersOpen.n} label="En cours (préparation, livraison)" href="/mobile/inbox?f=order" />
                </div>
                {data.recentOrders?.length > 0 && (
                  <div className="mb-card">
                    <h2>Dernières commandes</h2>
                    <div className="mbo-recent" style={{ marginTop: 10 }}>
                      {data.recentOrders.map((o) => {
                        const st = orderStatus(o.status);
                        return (
                          <Link key={o.id} href={`/mobile/orders/${o.id}`}>
                            <span>{o.number || 'Commande'}{o.who ? ` · ${o.who}` : ''}</span>
                            <small>{agoOf(o.created_at)}{Number(o.total) > 0 ? ` · ${dzd(o.total)}` : ''}</small>
                            <i className={`mbl-tag ${st.tone}`}>{st.label}</i>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------------------------------------------------- 14 jours -- */}
            <div className="mb-sec-t">Trafic — 14 derniers jours</div>
            <div className="mb-kpis">
              <Kpi color="#FF5A1F" icon="globe" n={k.visits.n} label="Visites" trend={k.visits.trend} spark={k.visits.spark} />
              <Kpi color="#0E9488" icon="user" n={k.uniques.n} label="Visiteurs uniques" trend={k.uniques.trend} />
              <Kpi color="#F59E0B" icon="box" n={k.productViews.n} label="Vues produits" trend={k.productViews.trend} />
              <Kpi color="#E0533D" icon="cart" n={k.quotesNew.n} label="Devis à traiter" href="/mobile/inbox?f=quote" />
            </div>

            <div className="mb-card">
              <h2>Visites par jour</h2>
              <p className="sub">14 derniers jours</p>
              <Area data={data.visitsByDay} labels={dayLabels} />
            </div>

            <div className="mb-card">
              <h2>Demandes de devis</h2>
              <p className="sub">Devis reçus par jour, 14 derniers jours</p>
              <Area data={data.leadsByDay} labels={dayLabels} color="#7C3AED" height={140} />
            </div>

            {data.ordersReady && Array.isArray(data.ordersByDay) && (
              <div className="mb-card">
                <h2>Commandes</h2>
                <p className="sub">Commandes reçues par jour, 14 derniers jours</p>
                <Area data={data.ordersByDay} labels={dayLabels} color="#1F9D55" height={140} />
              </div>
            )}

            {/* ------------------------------------------------------ devis -- */}
            <div className="mb-sec-t">Devis &amp; clients</div>
            <div className="mb-kpis">
              <Kpi color="#7C3AED" icon="cart" n={k.quotesTotal.n} label="Devis (total)" />
              <Kpi color="#3B82F6" icon="mail" n={k.messagesNew.n} label="Messages non lus" href="/mobile/inbox?f=message" />
              <Kpi color="#C98A14" icon="star" n={k.reviewsPending.n} label="Avis à modérer" />
              <Kpi color="#7C7167" icon="user" n={k.subscribers.n} label="Abonnés" />
            </div>

            {quotes.length > 0 && (
              <div className="mb-card">
                <h2>Devis par statut</h2>
                <p className="sub">Sur l’ensemble des demandes reçues</p>
                <Donut items={quotes} />
              </div>
            )}

            {/* --------------------------------------------------- catalogue -- */}
            <div className="mb-sec-t">Catalogue</div>
            <div className="mb-card">
              <h2>Produits les plus vus</h2>
              <p className="sub">30 derniers jours</p>
              <Bars items={(data.topProd || []).slice(0, 6)} />
            </div>

            <div className="mb-card">
              <h2>Produits par catégorie</h2>
              <p className="sub">{fmt(k.products.n)} produits actifs au catalogue</p>
              <Bars items={(data.byCat || []).slice(0, 8)} color="linear-gradient(90deg,#0E9488,#3ec9bb)" />
            </div>

            <div className="mb-card">
              <h2>Appareils des visiteurs</h2>
              <p className="sub">Sur quoi le site est consulté</p>
              <Donut items={devices} />
            </div>

            {/* ------------------------------------------------- 30 jours ---- */}
            {data.month && (
              <>
                <div className="mb-sec-t">Site — 30 derniers jours</div>
                <div className="mb-kpis">
                  <Kpi color="#FF5A1F" icon="globe" n={data.month.totals.visits} label="Pages vues" />
                  <Kpi color="#0E9488" icon="user" n={data.month.totals.uniques} label="Visiteurs uniques" />
                </div>
                <div className="mb-card">
                  <h2>Pages les plus vues</h2>
                  <p className="sub">30 derniers jours</p>
                  <Bars items={(data.month.topPages || []).slice(0, 6)} />
                </div>
                <div className="mb-card">
                  <h2>Sources de trafic</h2>
                  <p className="sub">D’où viennent les visiteurs</p>
                  <Bars items={(data.month.referrers || []).slice(0, 6)} color="linear-gradient(90deg,#3B82F6,#7fb0fb)" />
                </div>
              </>
            )}

            {/* --------------------------------------------------- activité -- */}
            {data.recent?.length > 0 && (
              <>
                <div className="mb-sec-t">Dernières demandes clients</div>
                <div>
                  {data.recent.map((a, i) => {
                    const body = (
                      <>
                        <span className="dot" style={{ background: a.color }}><Icon name={a.icon} size={16} /></span>
                        <div className="bd">
                          <div className="who">{a.text}</div>
                          <div className="tgt">{agoOf(a.time)}</div>
                        </div>
                      </>
                    );
                    // Les avis se modèrent dans l'écran de l'équipe seulement.
                    const href = a.mhref && (a.kind !== 'review' || editor) ? a.mhref : null;
                    return href
                      ? <Link className="mb-act" key={i} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
                      : <div className="mb-act" key={i}>{body}</div>;
                  })}
                </div>
              </>
            )}

            <p style={{ textAlign: 'center', fontSize: 11.5, color: '#8A90A8', fontWeight: 650, margin: '2px 0 0' }}>
              Connecté en tant que {me?.name || me?.email}
            </p>
          </>
        )}
      </div>
    </>
  );
}
