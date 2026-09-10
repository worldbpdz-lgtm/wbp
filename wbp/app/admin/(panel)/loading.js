// ============================================================================
// Écran d'attente du back-office.
// ----------------------------------------------------------------------------
// Toutes les pages du panneau sont en `force-dynamic` : elles interrogent
// Supabase à chaque affichage. Sans ce fichier, Next.js garde l'écran précédent
// figé pendant ce temps — juste après la connexion, cela donne un bouton
// « Un instant… » qui semble bloqué.
//
// Avec lui, la navigation est immédiate : la structure de l'admin s'affiche
// tout de suite et se remplit dès que les données arrivent.
// ============================================================================

export default function PanelLoading() {
  return (
    <div className="adm-loading" aria-busy="true" aria-live="polite">
      <div className="adm-head">
        <div>
          <div className="adm-skel t" />
          <div className="adm-skel s" />
        </div>
      </div>

      <div className="adm-kpis">
        {[0, 1, 2, 3].map((i) => <div className="adm-skel kpi" key={i} />)}
      </div>

      <div className="adm-row c2">
        <div className="adm-skel panel" />
        <div className="adm-skel panel" />
      </div>

      <p className="adm-loading-note">Chargement des données…</p>
    </div>
  );
}
