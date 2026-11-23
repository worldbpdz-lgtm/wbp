import PrintDocument from '@/components/admin/crm/PrintDocument';

// ============================================================================
// /admin/print/order/<id>      bon de commande (commande)
// /admin/print/proforma/<id>   facture proforma (commande)
// /admin/print/quote/<id>      devis / facture proforma (demande de devis)
// Hors de la mise en page du back-office (pas de menu à l'impression) : le
// document refait lui-même le contrôle d'accès — voir PrintDocument.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Document — World Business Plus', robots: { index: false } };

export default async function PrintPage({ params }) {
  const { kind, id } = await params;
  return <PrintDocument kind={kind} id={id} />;
}
