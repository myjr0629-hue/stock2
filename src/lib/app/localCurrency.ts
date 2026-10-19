export const EXCHANGE_RATE_TTL_MS = 30 * 60 * 1000;

export interface ExchangeRates {
  usdkrw?: number | null;
  usdjpy?: number | null;
  usdkrwChange?: number | null;
  usdjpyChange?: number | null;
  usdkrwUpdatedAt?: string | null;
  usdjpyUpdatedAt?: string | null;
}

export function localExchangeRate(locale: string, data: ExchangeRates | null | undefined) {
  const krw = locale === 'ko';
  const rate = krw ? data?.usdkrw : locale === 'ja' ? data?.usdjpy : null;
  const change = krw ? data?.usdkrwChange : data?.usdjpyChange;
  const stamp = krw ? data?.usdkrwUpdatedAt : data?.usdjpyUpdatedAt;
  return {
    rate: typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null,
    symbol: krw ? '₩' : locale === 'ja' ? '¥' : '$',
    label: krw ? 'KRW' : locale === 'ja' ? 'JPY' : 'USD',
    changePct: typeof change === 'number' && Number.isFinite(change) ? change : null,
    updatedAt: typeof stamp === 'string' && Number.isFinite(Date.parse(stamp)) ? stamp : null,
  };
}

export function formatLocalCurrency(usd: number | null | undefined, locale: string, data: ExchangeRates | null | undefined, showSign = false) {
  const { rate, symbol } = localExchangeRate(locale, data);
  if (rate === null || typeof usd !== 'number' || !Number.isFinite(usd)) return null;
  const converted = usd * rate;
  if (!Number.isFinite(converted)) return null;
  const formatted = Math.abs(converted).toLocaleString(locale === 'ko' ? 'ko-KR' : 'ja-JP', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
  const sign = converted < 0 ? '-' : showSign ? '+' : '';
  return `≈ ${sign}${symbol}${formatted}`;
}

/** App-only cache: one in-flight GET, including across route changes and ko/ja.
 * Cache missing/error responses too, so rows cannot trigger a request storm. */
export function createExchangeRateLoader(request: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  let expiresAt = 0;
  let cached: ExchangeRates | null = null;
  let pending: Promise<ExchangeRates | null> | null = null;
  return function load(): Promise<ExchangeRates | null> {
    if (pending) return pending;
    if (now() < expiresAt) return Promise.resolve(cached);
    pending = Promise.resolve().then(async () => {
      try {
        const response = await request('/api/exchange-rates');
        const body = response.ok ? await response.json() : null;
        cached = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
      } catch {
        cached = null;
      }
      expiresAt = now() + EXCHANGE_RATE_TTL_MS;
      pending = null;
      return cached;
    });
    return pending;
  };
}
