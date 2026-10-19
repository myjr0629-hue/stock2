/** Read-only repair of legacy undated ticker payloads. No vendor calls or cache writes. */
import { mgetFromCache } from '@/services/redisClient';
import { datedEodChain, matchingOptionDate, optionDate } from '@/lib/optionFlowDate';

export async function restoreOptionFlowDate(flow: any, ticker: string, read = mgetFromCache): Promise<any> {
    if (!flow || optionDate(flow.dataFreshness?.chainDate ?? flow.chainDate)
        || flow.dataFreshness?.premium !== 'EOD' || flow.dataFreshness?.volume !== 'EOD'
        || !optionDate(flow.weeklyExpiration)) return flow;
    const expiry = flow.weeklyExpiration;
    // Existing collector and Vercel vendor-response caches, same ticker and exact expiry.
    const keys = [`intrinio:chain:${ticker}:${expiry}`,
        `intrinio:resp:v1:options/chain/${ticker}/${expiry}/eod::{}`,
        `polygon:snapshot:probe:${ticker}`];
    let records: any[];
    try { records = await read<any>(keys); } catch { return flow; }
    const candidates = records.slice(0, 2).map(datedEodChain).filter(c => c != null);
    const probe = records[2];
    if (probe?.weeklyExpiry === expiry && Array.isArray(probe.exactResults)) {
        const date = optionDate(probe.chainDate ?? probe.chainDates?.[expiry]);
        if (date) candidates.push({ chain: probe.exactResults, date });
    }
    const dates = new Set(candidates.map(c => matchingOptionDate(flow, c.chain, c.date)).filter(d => d != null));
    // Conflicting dated copies cannot establish a unique basis.
    if (dates.size !== 1) return flow;
    return { ...flow, dataFreshness: { ...flow.dataFreshness, chainDate: [...dates][0] } };
}
