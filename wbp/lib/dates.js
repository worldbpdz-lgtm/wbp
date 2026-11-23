// ============================================================================
// Dates à l'heure d'Alger, partout (serveur en UTC sur Vercel, navigateur à
// l'heure du poste). Module pur, serveur et navigateur.
// ============================================================================
const TZ = 'Africa/Algiers';

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export const dayKey = (iso) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: TZ });

export function dayLabel(iso) {
  const k = dayKey(iso);
  if (k === dayKey(new Date().toISOString())) return "Aujourd'hui";
  if (k === dayKey(new Date(Date.now() - 86400000).toISOString())) return 'Hier';
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
}

export function ago(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
  return fmtDate(iso);
}

/** Date du jour à Alger, au format AAAA-MM-JJ (champs <input type="date">). */
export const todayYmd = () => dayKey(new Date().toISOString());
export const addDaysYmd = (n) => dayKey(new Date(Date.now() + n * 86400000).toISOString());
