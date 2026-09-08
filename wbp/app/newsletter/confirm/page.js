import { confirmSubscription } from '@/app/actions';
import NewsletterResult from '@/components/NewsletterResult';

export const dynamic = 'force-dynamic';

const COPY = {
  fr: { ok_t: 'Inscription confirmée ✓', ok_m: 'Merci ! Vous recevrez désormais nos nouveautés produits et offres. Vous pouvez vous désinscrire à tout moment.', bad_t: 'Lien invalide', bad_m: 'Ce lien de confirmation est invalide ou a expiré. Réessayez de vous inscrire depuis le site.', cta: 'Découvrir le catalogue' },
  en: { ok_t: 'Subscription confirmed ✓', ok_m: 'Thank you! You will now receive our new products and offers. You can unsubscribe at any time.', bad_t: 'Invalid link', bad_m: 'This confirmation link is invalid or expired. Please subscribe again from the site.', cta: 'Browse the catalog' },
  ar: { ok_t: 'تم تأكيد الاشتراك ✓', ok_m: 'شكراً! ستتلقى الآن منتجاتنا وعروضنا الجديدة. يمكنك إلغاء الاشتراك في أي وقت.', bad_t: 'رابط غير صالح', bad_m: 'رابط التأكيد غير صالح أو منتهي الصلاحية. يرجى الاشتراك مرة أخرى من الموقع.', cta: 'تصفح الكتالوج' },
};

export default async function ConfirmPage({ searchParams }) {
  const sp = await searchParams;
  const lang = ['fr', 'en', 'ar'].includes(sp?.lang) ? sp.lang : 'fr';
  const c = COPY[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const res = await confirmSubscription(sp?.token);
  // Succès uniquement si une adresse a réellement été confirmée : un jeton
  // invalide ne doit jamais afficher la page de succès.
  const ok = !!(res.ok && res.email);
  return ok
    ? <NewsletterResult tone="ok" icon="✓" title={c.ok_t} message={c.ok_m} ctaHref="/catalog" ctaLabel={c.cta} dir={dir} />
    : <NewsletterResult tone="error" icon="!" title={c.bad_t} message={c.bad_m} ctaHref="/" ctaLabel={c.cta} dir={dir} />;
}
