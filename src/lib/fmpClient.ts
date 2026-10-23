import { createGuard, createRedisCommand } from './fmp/accountGuard.cjs';

type Caller = 'vwap' | 'analyst' | 'earnings' | 'news';
type Diagnostic = { status: number; reason: string | null; retryMs: number | null; caller: string; at: number };
const guard = createGuard({ command: createRedisCommand(), accountRpm: Number(process.env.FMP_ACCOUNT_RPM || 300) });

/** All callers fail closed on budget/store failure. No automatic provider retry. */
export async function fmpFetch(url: string, caller: Caller, options: {
    timeoutMs?: number;
    onDiagnostic?: (diagnostic: Diagnostic) => void;
} = {}): Promise<Response | null> {
    const permit = await guard.reserve(caller);
    if (!permit.allowed) return null;
    try {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(options.timeoutMs ?? 8000) });
        const diagnostic = await guard.observe(response, caller);
        options.onDiagnostic?.(diagnostic);
        return response;
    } catch (cause) {
        const error = new Error('FMP_REQUEST_UNAVAILABLE');
        if ((cause as { name?: string })?.name === 'TimeoutError') error.name = 'TimeoutError';
        throw error;
    }
}
