'use client';

// Undercurrent 이용약관 — chrome-less (layout hides chrome for /undercurrent*).
// Reuses the shared legal document; back returns to the Undercurrent home, not SIGNUM.

import { useParams } from 'next/navigation';
import { AppLegalDocument } from '@/components/app/AppLegalDocument';

export default function UndercurrentTermsPage() {
  const params = useParams();
  const loc = ((params as any)?.locale === 'en' || (params as any)?.locale === 'ja') ? (params as any).locale : 'ko';
  // backHref must be locale-LESS: AppLegalDocument uses next-intl's <Link> with
  // localePrefix:'always', which prepends the current locale. Passing /${loc}/…
  // double-prefixed it (/ko/ko/undercurrent) → broke back-nav out of the app.
  return <AppLegalDocument locale={loc} doc="terms" backHref="/undercurrent" badgeText="UNDERCURRENT" />;
}
