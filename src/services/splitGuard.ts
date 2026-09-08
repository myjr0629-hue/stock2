/**
 * 역분할 미반영 걸러내기 — 「가장 많이 움직인 것」이 지어낸 숫자를 내보내지 않게 한다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 무엇이 잘못됐나 (2026-09-09 실측)
 *
 *   /api/market/movers 상승 목록:
 *     GTBP  $5.24  전일 $0.241  → +2051%
 *     LRHC  $3.02  전일 $0.483  →  +513%
 *     IGR  $13.41  전일 $4.49   →  +199%
 *
 *   가격은 «분할 후», 전일 종가는 «분할 전» 이다. 종목이 오른 게 아니라
 *   기준선이 갱신되지 않은 것이다. 그런데 200 OK 로 나가 화면에는
 *   +2051% 가 그대로 떴다.
 *
 * [원칙] 숫자를 «추측해서 고치지» 않는다.
 *   비율이 3배쯤 되니 1:3 이겠거니 하고 맞추면, 진짜로 3배 오른 종목을
 *   조용히 왜곡한다. 그래서 **벤더 분할 이력으로 확인**하고,
 *     · 분할이 확인되면  → 기준선을 그 비율로 보정한다 (사실)
 *     · 확인이 안 되면   → 목록에서 뺀다 (설명 못 하는 숫자는 내보내지 않는다)
 *
 * [비용] 의심 종목은 보통 하루 0~3개다. 그 종목만 조회하고 하루 캐시한다.
 *   평범한 날엔 조회가 «0건»이라 응답 시간에 영향이 없다.
 * ══════════════════════════════════════════════════════════════════════
 */

import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

/** 분할 이력을 뒤져 볼 만큼 «설명이 안 되는» 움직임인가 */
export function isImplausibleMove(price: number, changePct: number): boolean {
    const c = Math.abs(changePct || 0);
    const px = price || 0;
    // 페니주는 하루에 두 배도 간다(실측: RDHL 0.661 → 1.43, 바이오 뉴스).
    // 그건 진짜이므로 건드리지 않는다. 아래 둘만 «거의 항상» 기업행위 아티팩트다.
    return c > 500 || (px > 10 && c > 100);
}

const SPLIT_TTL = 12 * 3600;
/** 이 기간 안에 실행된 분할이면 오늘 기준선에 영향을 준다고 본다 */
const SPLIT_WINDOW_DAYS = 10;

type SplitRow = { execution_date: string; split_to: number };

async function recentSplit(ticker: string): Promise<SplitRow | null> {
    const key = `split:recent:v1:${ticker}`;
    const cached = await getFromCache<SplitRow | 'none'>(key);
    if (cached === 'none') return null;
    if (cached && typeof cached === 'object') return cached;

    try {
        const res: any = await fetchMassive('/v3/reference/splits', { ticker, limit: '10' }, false);
        const rows: any[] = res?.results || [];
        const cutoff = Date.now() - SPLIT_WINDOW_DAYS * 86400000;
        const hit = rows
            .filter((r) => {
                const t = Date.parse(String(r?.execution_date || ''));
                return Number.isFinite(t) && t >= cutoff && Number(r?.split_to) > 0;
            })
            .sort((a, b) => String(b.execution_date).localeCompare(String(a.execution_date)))[0];

        if (!hit) {
            await setInCache(key, 'none', SPLIT_TTL);
            return null;
        }
        const row: SplitRow = {
            execution_date: String(hit.execution_date),
            split_to: Number(hit.split_to),
        };
        await setInCache(key, row, SPLIT_TTL);
        return row;
    } catch {
        // 조회 자체가 실패하면 «확인 못 함»이다 — 보정도 삭제도 하지 않는다.
        return null;
    }
}

const pct = (r: any): number => Number(r?.changePercent ?? r?.changePct ?? 0) || 0;
const price = (r: any): number => Number(r?.price ?? 0) || 0;
const sym = (r: any): string => String(r?.ticker || r?.symbol || r?.sym || '').toUpperCase();

/**
 * 세 목록(value·gainers·losers)을 한 번에 훑어 의심 종목만 확인하고 고친다.
 * 반환값은 «새 배열»이며 입력은 건드리지 않는다.
 */
export async function applySplitGuard<T extends Record<string, any[]>>(lists: T): Promise<T> {
    const suspects = new Set<string>();
    for (const rows of Object.values(lists)) {
        if (!Array.isArray(rows)) continue;
        for (const r of rows) {
            if (isImplausibleMove(price(r), pct(r))) {
                const s = sym(r);
                if (s) suspects.add(s);
            }
        }
    }
    // 평범한 날 — 조회 0건, 비용 0
    if (suspects.size === 0) return lists;

    const found = new Map<string, SplitRow | null>();
    await Promise.all(
        [...suspects].map(async (t) => { found.set(t, await recentSplit(t)); })
    );

    const fix = (rows: any[]): any[] => {
        if (!Array.isArray(rows)) return rows;
        const out: any[] = [];
        for (const r of rows) {
            if (!isImplausibleMove(price(r), pct(r))) { out.push(r); continue; }
            const split = found.get(sym(r));
            if (!split || !(split.split_to > 0)) {
                // 설명이 안 되는 숫자는 내보내지 않는다
                continue;
            }
            // 분할 확인됨 → 기준선을 사실대로 보정한다.
            // 역분할 1:3 이면 split_to = 1/3 → 전일종가 ÷ (1/3) = ×3
            //
            // prevClose 가 행에 없을 수 있다(무버 목록은 그 필드를 안 싣고,
            // last_good 캐시에는 옛 모양이 남아 있다). 등락률과 현재가에서
            // 정확히 «유도»할 수 있으므로 그렇게 한다: prev = p / (1 + c/100)
            const p = price(r);
            let prev = Number(r?.prevClose ?? 0) || 0;
            if (!(prev > 0)) {
                const denom = 1 + pct(r) / 100;
                prev = denom !== 0 ? p / denom : 0;
            }
            const adjPrev = prev > 0 ? prev / split.split_to : 0;
            if (!(adjPrev > 0)) continue;
            out.push({
                ...r,
                prevClose: adjPrev,
                changePercent: ((p - adjPrev) / adjPrev) * 100,
                up: p >= adjPrev,
                splitAdjusted: { date: split.execution_date, ratioTo: split.split_to },
            });
        }
        return out;
    };

    const next: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(lists)) next[k] = fix(v as any[]);
    return next as T;
}
