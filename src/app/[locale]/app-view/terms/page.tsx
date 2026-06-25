'use client';

import { useLocale } from 'next-intl';
import { AppLegalDocument } from '@/components/app/AppLegalDocument';

export default function AppTermsPage() {
  const locale = useLocale();

  return <AppLegalDocument locale={locale} doc="terms" />;
}
