'use client';

// Why'd It Move? 개인정보처리방침 — chrome-less (layout hides chrome for /wim*).
// Reuses the shared legal document so it opens IN-APP (router.push), never an
// external browser; back returns to the WIM home.

import { useParams } from 'next/navigation';
import { AppLegalDocument } from '@/components/app/AppLegalDocument';

export default function WimPrivacyPage() {
  const params = useParams();
  const loc = ((params as any)?.locale === 'en' || (params as any)?.locale === 'ja') ? (params as any).locale : 'ko';
  return <AppLegalDocument locale={loc} doc="privacy" backHref="/wim" badgeText="WHY'D IT MOVE?" variant="wim" />;
}
