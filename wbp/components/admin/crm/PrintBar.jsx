'use client';
// Barre d'outils de la page d'impression (masquée à l'impression).
export default function PrintBar({ backHref, hint }) {
  return (
    <div className="pdoc-bar">
      <button type="button" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button>
      <a href={backHref}>Retour à la fiche</a>
      <span>{hint || 'Astuce : dans la fenêtre d’impression, choisissez « Enregistrer au format PDF » pour l’envoyer par e-mail ou WhatsApp.'}</span>
    </div>
  );
}
