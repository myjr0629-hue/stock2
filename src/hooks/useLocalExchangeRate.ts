'use client';

import useSWR from 'swr';
import { createExchangeRateLoader, EXCHANGE_RATE_TTL_MS, localExchangeRate } from '@/lib/app/localCurrency';

const loadExchangeRates = createExchangeRateLoader();

export function useLocalExchangeRate(locale: string) {
  const { data } = useSWR(
    locale === 'ko' || locale === 'ja' ? 'app-local-currency' : null,
    loadExchangeRates,
    {
      refreshInterval: EXCHANGE_RATE_TTL_MS,
      dedupingInterval: EXCHANGE_RATE_TTL_MS,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );
  return { ...localExchangeRate(locale, data), data };
}
