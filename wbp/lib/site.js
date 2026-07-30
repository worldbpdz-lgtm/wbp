// Which website this app is. Both sites share ONE database:
// the catalog (brands / categories / products) is common — editing it from
// either admin updates both websites — while quotes, messages, reviews,
// newsletter, analytics, settings and clients are filtered by this value.
//   'wbp' = World Business Plus   ·   'cn' = Central Network
export const SITE = process.env.NEXT_PUBLIC_SITE_ID || 'wbp';
