import { notFound } from 'next/navigation';
import { getMarketingAdmin } from '@/lib/marketing-console/auth';
import MarketingConsole from './MarketingConsole';

// Marketing Console — server-gated entry (C-2.5 access rules).
// Non-admins get a 404 (existence hiding), never a login wall or 403.
export const dynamic = 'force-dynamic';

export default async function MarketingConsolePage() {
  const admin = await getMarketingAdmin();
  if (!admin) notFound();

  return <MarketingConsole adminEmail={admin.email} />;
}
