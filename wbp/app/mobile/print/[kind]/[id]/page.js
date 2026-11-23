import PrintDocument from '@/components/admin/crm/PrintDocument';

// ============================================================================
// Documents imprimables depuis l'application mobile :
//   /mobile/print/order/<id> · /mobile/print/proforma/<id> · /mobile/print/quote/<id>
// Même document que /admin/print/… ; l'adresse reste sous /mobile pour que
// l'app installée l'ouvre avec sa propre session (sur iPhone, une page hors de
// la portée de l'app s'ouvrirait dans Safari, qui n'est pas connecté).
// La coquille de l'app (onglets, écran d'ouverture) ne s'affiche pas sur ces
// pages : voir MobileApp.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Document — WBP', robots: { index: false } };

export default async function MobilePrintPage({ params }) {
  const { kind, id } = await params;
  const back = kind === 'quote' ? `/mobile/inbox?open=quote:${id}` : `/mobile/orders/${id}`;
  return (
    <PrintDocument
      kind={kind}
      id={id}
      backHref={back}
      loginHref="/mobile"
      hint="Sur téléphone : « Imprimer » ouvre l’aperçu ; partagez-le depuis l’aperçu pour l’envoyer en PDF sur WhatsApp ou par e-mail."
    />
  );
}
