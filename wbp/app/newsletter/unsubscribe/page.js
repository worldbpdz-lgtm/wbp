import { unsubscribeByToken } from '@/app/actions';
import NewsletterResult from '@/components/NewsletterResult';

export const dynamic = 'force-dynamic';

const COPY = {
  fr: { ok_t: 'Désinscription effectuée', ok_m: 'Vous ne recevrez plus nos e-mails. Vous pouvez vous réinscrire à tout moment depuis le site.', bad_t: 'Lien invalide', bad_m: 'Ce lien de désinscription est invalide ou a expiré.', cta: 'Retour au site' },
  en: { ok_t: 'You have been unsubscribed', ok_m: 'You will no longer receive our emails. You can re-subscribe anytime from the site.', bad_t: 'Invalid link', bad_m: 'This unsubscribe link is invalid or expired.', cta: 'Back to site' },
  ar: { ok_t: 'تم إلغاء اشتراكك', ok_m: 'لن تتلقى رسائلنا بعد الآن. يمكنك إعادة الاشتراك في أي وقت من الموقع.', bad_t: 'رابط غير صالح', bad_m: 'رابط إلغاء الاشتراك غير صالح أو منتهي الصلاحية.', cta: 'العودة إلى الموقع' },
};

export default async function UnsubscribePage({ searchParams }) {
  const sp = await searchParams;
  const lang = ['fr', 'en', 'ar'].includes(sp?.lang) ? sp.lang : 'fr';
  const c = COPY[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const res = await unsubscribeByToken(sp?.token);
  // Succès uniquement si une adresse a réellement été désinscrite : un jeton
  // invalide ne doit jamais afficher la page de succès.
  const ok = !!(res.ok && res.email);
  return ok
    ? <NewsletterResult tone="accent" icon="✓" title={c.ok_t} message={c.ok_m} ctaHref="/" ctaLabel={c.cta} dir={dir} />
    : <NewsletterResult tone="error" icon="!" title={c.bad_t} message={c.bad_m} ctaHref="/" ctaLabel={c.cta} dir={dir} />;
}
