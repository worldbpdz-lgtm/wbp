// Export CSV sûr : séparateur « ; » (Excel en français), BOM UTF-8 pour les
// accents, et protection contre l'injection de formules — Excel EXÉCUTE une
// cellule qui commence par = + - @ ; une valeur saisie par un visiteur
// (« =HYPERLINK(...) ») deviendrait sinon une formule à l'ouverture.
export function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const csvHeaders = (filename) => ({
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="${filename}"`,
  'Cache-Control': 'no-store',
});
