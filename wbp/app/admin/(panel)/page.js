import Link from 'next/link';
import { hasSupabase } from '@/lib/supabase/server';
import { getDashboard } from '@/lib/analytics';
import { Icon } from '@/components/primitives';
import { AreaChart, Donut, Bars, Sparkline } from '@/components/admin/charts';
import { StatusBadge } from '@/components/admin/crm/ui';
import { QUOTE_STATUSES, quoteStatus, personOf } from '@/lib/crm';
import { dzd } from '@/lib/pricing';
import { fmtDateTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function ago(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
const HEX = { orange:'#FF5A1F', amber:'#F59E0B', gold:'#C98A14', teal:'#0E9488', green:'#1F9D55', rose:'#E0533D', blue:'#3B82F6', slate:'#7C7167' };
function Kpi({ c, icon, n, label, trend, spark, href }) {
  const body = (
    <>
      <div className="kpi-top">
        <span className="kpi-ic"><Icon name={icon} size={20} /></span>
        {trend && <span className={`kpi-trend ${trend.dir}`}>{trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '·'} {trend.pct}%</span>}
      </div>
      <div className="kpi-n">{n}</div>
      <div className="kpi-l">{label}</div>
      {spark && <Sparkline data={spark} color={HEX[c] || '#6d28d9'} />}
    </>
  );
  // Un indicateur cliquable mène à la liste filtrée correspondante.
  return href
    ? <Link className="kpi" data-c={c} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
    : <div className="kpi" data-c={c}>{body}</div>;
}

export default function Dashboard() {
  if (!hasSupabase()) return null;
  return <DashboardData />;
}

async function DashboardData() {
  const d = await getDashboard();
  if (!d) return <div className="adm-empty">Impossible de charger les données. Vérifiez la configuration Supabase.</div>;
  const k = d.kpis;
  const dayLabels = d.days14.map((x) => x.slice(5).replace('-', '/'));
  const devices = ['desktop', 'mobile', 'tablet'].map((kk) => ({ label: kk, value: d.devices[kk] || 0 })).filter((x) => x.value);
  // Libellés français (le graphique affichait les codes bruts « new », « contacted »).
  const statusColors = { new: '#FF5A1F', contacted: '#0E9488', quoted: '#3B82F6', won: '#1F9D55', lost: '#7C7167', closed: '#A89C8D' };
  const order = QUOTE_STATUSES.map((x) => x.value);
  const qStatus = Object.entries(d.qStatus)
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, value]) => ({ label: quoteStatus(key).label, value, color: statusColors[key] || '#F59E0B' }));

  return (
    <>
      <div className="adm-head">
        <div><h1 className="adm-h1">Tableau de bord</h1><p className="adm-sub">Vue d’ensemble du trafic et de l’activité — 14 derniers jours.</p></div>
        <div className="quick">
          <Link className="adm-btn" href="/admin/analytics"><Icon name="chart" size={16} /> Analytics</Link>
          <Link className="adm-btn primary" href="/admin/products/new"><Icon name="plus" size={16} /> Nouveau produit</Link>
        </div>
      </div>

      {/* --------------------------------------------- ventes : à traiter */}
      <div className="adm-kpis">
        <Kpi c="rose" icon="truck" n={k.ordersPending?.n ?? 0} label="Commandes à confirmer" href="/admin/orders?status=pending" />
        <Kpi c="green" icon="wallet" n={dzd(k.revenue30?.n ?? 0)} label="CA confirmé (30 j)" trend={k.revenue30?.trend} href="/admin/orders" />
        <Kpi c="orange" icon="receipt" n={k.quotesNew.n} label="Devis à traiter" href="/admin/quotes?status=new" />
        <Kpi c="blue" icon="mail" n={k.messagesNew.n} label="Messages non lus" href="/admin/messages?status=new" />
      </div>

      <div className="adm-kpis">
        <Kpi c="orange" icon="globe" n={k.visits.n} label="Visites (14j)" trend={k.visits.trend} spark={k.visits.spark} />
        <Kpi c="teal" icon="user" n={k.uniques.n} label="Visiteurs uniques (14j)" trend={k.uniques.trend} />
        <Kpi c="amber" icon="box" n={k.productViews.n} label="Vues produits (14j)" trend={k.productViews.trend} />
        <Kpi c="slate" icon="cart" n={k.orders30?.n ?? 0} label="Commandes (30 j)" href="/admin/orders?days=30" />
      </div>

      {d.recentOrders?.length > 0 && (
        <div className="adm-panel">
          <div className="adm-panel-hd"><h2>Dernières commandes</h2><Link className="muted" href="/admin/orders">Tout voir →</Link></div>
          <table className="adm-table crm-table">
            <tbody>
              {d.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td className="nowrap"><Link className="rowlink" href={`/admin/orders/${o.id}`}><b>{o.number}</b></Link></td>
                  <td><Link className="rowlink" href={`/admin/orders/${o.id}`}>{personOf(o)}</Link></td>
                  <td className="nowrap muted">{fmtDateTime(o.created_at)}</td>
                  <td className="num"><b>{Number(o.total) ? dzd(o.total) : '—'}</b></td>
                  <td><StatusBadge kind="order" value={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="adm-row c2">
        <div className="adm-panel">
          <div className="adm-panel-hd"><h2>Trafic — 14 jours</h2><span className="muted">visites par jour</span></div>
          <div className="adm-panel-bd"><AreaChart data={d.visitsByDay} labels={dayLabels} color="#FF5A1F" /></div>
        </div>
        <div className="adm-panel">
          <div className="adm-panel-hd"><h2>Appareils</h2></div>
          <div className="adm-panel-bd">{devices.length ? <Donut items={devices} /> : <div className="adm-empty">Pas encore de visites.</div>}</div>
        </div>
      </div>

      <div className="adm-row c2">
        <div className="adm-panel">
          <div className="adm-panel-hd"><h2>Produits les plus vus</h2><span className="muted">30 j</span></div>
          <div className="adm-panel-bd"><Bars items={d.topProd} /></div>
        </div>
        <div className="adm-panel">
          <div className="adm-panel-hd"><h2>Catalogue par catégorie</h2></div>
          <div className="adm-panel-bd"><Bars items={d.byCat} /></div>
        </div>
      </div>

      <div className="adm-row c2">
        <div className="adm-panel">
          <div className="adm-panel-hd"><h2>Activité récente</h2></div>
          {d.activity.length === 0 ? <div className="adm-empty">Aucune activité pour l’instant.</div> : (
            <div className="feed">
              {d.activity.map((a, i) => (
                <Link className="feed-item" key={i} href={a.href || '/admin'} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="feed-ic" style={{ background: a.color }}><Icon name={a.icon} size={17} /></span>
                  <div className="feed-tx">{a.text}<div className="feed-time">{ago(a.time)}</div></div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="adm-kpis" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <Kpi c="green" icon="box" n={k.products.n} label="Produits" href="/admin/products" />
            <Kpi c="gold" icon="star" n={k.reviewsPending.n} label="Avis à modérer" href="/admin/reviews?status=pending" />
            <Kpi c="teal" icon="truck" n={k.ordersOpen?.n ?? 0} label="Commandes en cours" href="/admin/orders?status=open" />
            <Kpi c="slate" icon="user" n={k.subscribers.n} label="Abonnés" href="/admin/subscribers" />
          </div>
          <div className="adm-panel">
            <div className="adm-panel-hd"><h2>Devis par statut</h2></div>
            <div className="adm-panel-bd">{qStatus.length ? <Donut items={qStatus} size={150} /> : <div className="adm-empty">Aucun devis.</div>}</div>
          </div>
        </div>
      </div>
    </>
  );
}
