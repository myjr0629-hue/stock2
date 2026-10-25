import { briefCompanyFor, briefCompanyReady, type BriefCompany, type BriefCompanyProfile } from '@/lib/earnings/earningsBriefIdentity';

/** 읽기만: 저장된 공급사 fundamentals 우선, 부족한 회사만 FMP 프로필 GET. API 라우트/워머는 부르지 않는다. */
export async function readBriefCompanies(tickers: string[], opts: { deadlineMs?: number; profiles?: Record<string, BriefCompanyProfile>; fetchProfiles?: boolean } = {}): Promise<Record<string, BriefCompany | null>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const profiles = opts.profiles ?? Object.fromEntries((await (await import('./redisClient')).mgetFromCache<{ fundamentals?: BriefCompanyProfile }>(unique.map((t) => `cmd:data:${t}`)))
    .map((v, i) => [unique[i], v?.fundamentals ?? {}]));
  const result = Object.fromEntries(unique.map((t) => [t, briefCompanyFor(t, profiles[t])])) as Record<string, BriefCompany | null>;
  const key = process.env.FMP_API_KEY;
  if (!key || opts.fetchProfiles === false) return result;
  const todo = unique.filter((t) => !briefCompanyReady(result[t]));
  const deadline = opts.deadlineMs ?? Date.now() + 8000;
  // 요청은 최대 6개 동시, 전체 예산 안에서만. 실패 메시지/URL에 인증값을 출력하지 않는다.
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, async () => {
    while (todo.length && Date.now() < deadline) {
      const t = todo.shift()!;
      try {
        const url = new URL('https://financialmodelingprep.com/stable/profile');
        url.searchParams.set('symbol', t); url.searchParams.set('apikey', key);
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(3000, deadline - Date.now()))) });
        if (!res.ok) continue;
        const data = await res.json();
        const profile = Array.isArray(data) ? data.find((p) => p?.symbol === t) : null;
        if (profile) result[t] = briefCompanyFor(t, profile);
      } catch { /* 미확인 회사는 생성에서 제외하고 다음 회차에서 재시도 */ }
    }
  }));
  return result;
}
