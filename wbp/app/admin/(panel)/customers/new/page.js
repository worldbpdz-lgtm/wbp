import Link from 'next/link';
import { Icon } from '@/components/primitives';
import CustomerForm from '@/components/admin/crm/CustomerForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Nouvelle fiche client' };

export default function NewCustomerPage() {
  return (
    <>
      <Link href="/admin/customers" className="crm-back"><Icon name="chevleft" size={15} /> Clients</Link>
      <div className="crm-head"><div><h1>Nouvelle fiche client</h1><div className="meta"><span>Un client qui appelle, passe au dépôt ou travaille déjà avec vous.</span></div></div></div>
      <div style={{ maxWidth: 860 }}><CustomerForm customer={null} /></div>
    </>
  );
}
