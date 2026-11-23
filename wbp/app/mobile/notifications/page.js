import { requireMobileAdmin } from '@/app/mobile/guard';
import { isOwnerEmail, isPhoneEditor } from '@/lib/admin';
import NotificationsScreen from '@/components/mobile/NotificationsScreen';

// ============================================================================
// Notifications — réglage de CE téléphone et fil des dernières alertes.
// Ouvert par la cloche de l'en-tête, sur tous les comptes.
// ============================================================================

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications — WBP' };

export default async function MobileNotificationsPage() {
  const user = await requireMobileAdmin();
  return <NotificationsScreen owner={isOwnerEmail(user.email)} editor={isPhoneEditor(user.email)} />;
}
