'use client';
import React from 'react';
import { ICON_PATHS } from '@/lib/icons';

// ============================================================================
// Briques d'interface de l'application mobile.
// Tout est autonome (SVG + classes .mb-*) : /mobile ne charge ni globals.css
// ni admin.css, ce qui garde le premier affichage léger sur un réseau 3G.
// ============================================================================

// Pictogrammes qui n'existent pas dans lib/icons.js.
const EXTRA = {
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 16l-5-5-6 6"/>',
  dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
};

export function Icon({ name, size = 18, ...rest }) {
  const d = ICON_PATHS[name] || EXTRA[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }} {...rest} />
  );
}

// --------------------------------------------------------------- indicateur --
export function Kpi({ color = '#FF5A1F', icon, n, label, trend, spark }) {
  return (
    <div className="mb-kpi">
      <span className="ic" style={{ background: color }}><Icon name={icon} size={17} /></span>
      {trend && <span className={`tr ${trend.dir}`}>{trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '·'}{trend.pct}%</span>}
      <div className="n">{fmt(n)}</div>
      <div className="l">{label}</div>
      {spark && <Sparkline className="spark" data={spark} color={color} />}
    </div>
  );
}

export const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : n ?? '—');

// ------------------------------------------------------------- graphiques --
export function Sparkline({ data = [], color = '#FF5A1F', height = 30, className }) {
  const vals = data.length ? data : [0, 0];
  const W = 140;
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const span = max - min || 1;
  const stepX = W / Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => [i * stepX, height - ((v - min) / span) * (height - 5) - 2.5]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const gid = 'mbs' + color.replace('#', '');
  return (
    <svg className={className} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity=".26" /><stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={`${line} L ${W} ${height} L 0 ${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Courbe pleine largeur, avec repères de valeur à gauche et dates en bas.
export function Area({ data = [], labels = [], color = '#FF5A1F', height = 168 }) {
  const W = 340, H = height, padL = 26, padB = 20, padT = 10;
  const vals = data.length ? data : [0];
  const max = Math.max(...vals, 1);
  const stepX = (W - padL - 4) / Math.max(vals.length - 1, 1);
  const x = (i) => padL + i * stepX;
  const y = (v) => padT + (1 - v / max) * (H - padB - padT);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const every = Math.ceil(labels.length / 5) || 1;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution des visites">
      <defs><linearGradient id="mbArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity=".02" />
      </linearGradient></defs>
      {[0, .5, 1].map((g, i) => {
        const yy = padT + g * (H - padB - padT);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={W} y2={yy} stroke="#eef0f7" strokeWidth="1" />
            <text x={padL - 5} y={yy + 3} textAnchor="end" fontSize="8" fill="#8A90A8">{Math.round(max * (1 - g))}</text>
          </g>
        );
      })}
      <path d={`${line} L ${x(vals.length - 1)} ${H - padB} L ${padL} ${H - padB} Z`} fill="url(#mbArea)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (i % every === 0 || i === pts.length - 1) && (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill="#fff" stroke={color} strokeWidth="1.5" />
      ))}
      {labels.map((l, i) => (i % every === 0) && (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#8A90A8">{l}</text>
      ))}
    </svg>
  );
}

export function Bars({ items = [], color }) {
  if (!items.length) return <div className="mb-empty">Pas encore de données.</div>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="mb-bars">
      {items.map((it, i) => (
        <div className="mb-bar" key={i}>
          <span className="lbl">{it.label}</span>
          <span className="val">{fmt(it.value)}</span>
          <span className="track">
            <span className="fill" style={{
              width: `${Math.max((it.value / max) * 100, 3)}%`,
              background: it.color || color || undefined,
            }} />
          </span>
        </div>
      ))}
    </div>
  );
}

const PALETTE = ['#FF5A1F', '#F59E0B', '#0E9488', '#1F9D55', '#C98A14', '#3B82F6', '#7C3AED', '#7C7167'];

export function Donut({ items = [], size = 132, thickness = 22 }) {
  const clean = items.filter((i) => i.value > 0);
  const total = clean.reduce((a, b) => a + b.value, 0);
  if (!total) return <div className="mb-empty">Pas encore de données.</div>;
  const r = (size - thickness) / 2, C = 2 * Math.PI * r, cx = size / 2;
  let off = 0;
  const segs = clean.map((it, i) => {
    const dash = (it.value / total) * C;
    const seg = { ...it, color: it.color || PALETTE[i % PALETTE.length], dash, off };
    off += dash; return seg;
  });
  return (
    <div>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#eef0f7" strokeWidth={thickness} />
          {segs.map((s, i) => (
            <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.off}
              transform={`rotate(-90 ${cx} ${cx})`} />
          ))}
          <text x={cx} y={cx - 1} textAnchor="middle" fontSize="22" fontWeight="850" fill="#15182B">{fmt(total)}</text>
          <text x={cx} y={cx + 15} textAnchor="middle" fontSize="9" fill="#8A90A8">total</text>
        </svg>
      </div>
      <div className="mb-legend">
        {segs.map((s, i) => <span key={i}><i style={{ background: s.color }} />{s.label}<b>{fmt(s.value)}</b></span>)}
      </div>
    </div>
  );
}

export function Skeleton({ h = 92 }) { return <div className="mb-skel" style={{ height: h }} />; }
