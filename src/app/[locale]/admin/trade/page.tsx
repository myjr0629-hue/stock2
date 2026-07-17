import { notFound } from 'next/navigation';
import { getTradeAdmin } from '@/lib/trade/auth';
import TradeConsole from './TradeConsole';

// Trade Console — server-gated to the single operator (pick8775@gmail.com).
// Everyone else gets a 404 (existence hiding), never a login wall or 403.
export const dynamic = 'force-dynamic';

export default async function TradeConsolePage() {
  const admin = await getTradeAdmin();
  if (!admin) notFound();

  return <TradeConsole operator={admin.email} />;
}
