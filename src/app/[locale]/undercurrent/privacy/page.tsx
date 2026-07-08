'use client';

// Undercurrent 개인정보처리방침 — chrome-less (layout hides chrome for /undercurrent*).
// Reuses the shared legal document; back returns to the Undercurrent home, not SIGNUM.

import { useParams } from 'next/navigation';
import { AppLegalDocument } from '@/components/app/AppLegalDocument';

export default function UndercurrentPrivacyPage() {
  const params = useParams();
  const loc = ((params as any)?.locale === 'en' || (params as any)?.locale === 'ja') ? (params as any).locale : 'ko';
  return <AppLegalDocument locale={loc} doc="privacy" backHref={`/${loc}/undercurrent`} badgeText="UNDERCURRENT" />;
}
