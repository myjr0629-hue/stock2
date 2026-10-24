/**
 * ★ [2026-10-24 알파 0점 회귀] 인텔 fast·fast-all·스냅샷이 «못 잰 알파»를 0점·«-» 로 내보내지 않게 하는 마지막 층.
 *
 * 실측(10/24 08:1x KST = 10/23 19:1x ET, 애프터마켓): 운영 /api/intel/fast-all m7 에서 AMZN 0·«-», META 0·«-»
 *   (같은 시각 스냅샷·워치리스트는 94 S · 49.4 C). 원인은 알파 수리 코드가 아니라 fast 의 알파 고르기였다 —
 *   ① 분석 캐시(getAnalysisCacheForTickers)는 04:00~20:00 ET 사이엔 15분 지난 행을 «낡음»으로 버린다(isStaleEntry).
 *      애프터마켓에 하베스트가 잠시 멈추면 M7 7행이 한꺼번에 사라진다.
 *   ② 다음 층 flow:ticker(60초 TTL)는 누군가 그 종목 화면을 막 열었을 때만 있다 — 그날은 7종목 중 5개만 있었다.
 *   ③ 두 층이 다 비면 `alphaScore = 0 · grade '-'` 로 굽고, 그 봉투를 fast-all 이 최대 12시간 그대로 준다.
 *   → 같은 시각 다른 배포(vwap 미리보기)는 봉투를 다른 순간에 구워 정상으로 보였다(병합과 무관한 시각 의존 결함).
 *
 * 여기서는 «지금 게시된 표시 점수»를 읽는다 — 다른 화면(analysisCache.applyXs·xsOverride)과 같은 규칙:
 *   XS 게시본(cache:xs:scores)에 있는 종목은 그 점수·등급, 없는 종목은 분석 캐시의 마지막 알파(4일 이내, 낡음 판정 없이).
 *   둘 다 없으면 정말 못 잰 것 — 값을 지어내지 않는다(호출부가 missingFields 로 표시).
 */
import { mgetFromCache } from '@/services/redisClient';
import { ensureXsScores, xsSnapshotOverride, gradeForScore } from '@/services/xsScores';

const ANALYSIS_PREFIX = 'cache:analysis:';   // services/analysisCache 의 ANALYSIS_CACHE_PREFIX 와 같은 키
const LAST_KNOWN_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;   // 금요일 값이 월요일 프리마켓 첫 하베스트 전까지 남도록

export type DisplayAlpha = { score: number; grade: string };

const num = (x: unknown): number | null => {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
};

/**
 * 종목들의 «마지막 분석 행» — 알파 스냅샷은 XS 게시본으로 덮은 것. readOptionAlpha(내 종목·종목·cmd·포트폴리오·스냅샷 공통 출구)가
 * 분석 캐시(낡음 판정)와 응답 자체 알파가 둘 다 없을 때 쓴다. XS 에만 있는 종목은 점수·등급만 담은 스냅샷.
 * 죽은 체결 필드(다크풀·공매도 비중)는 되살리지 않는다(analysisCache.stripDeadTickFields 와 같은 이유) — null.
 */
export async function readLastKnownAnalysis(tickers: string[], now: number = Date.now()): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const syms = [...new Set(tickers.map((t) => String(t ?? '').toUpperCase()).filter(Boolean))];
    if (syms.length === 0) return out;
    let rows: any[] = syms.map(() => null);
    try { rows = await mgetFromCache<any>(syms.map((t) => `${ANALYSIS_PREFIX}${t}`)); } catch { /* XS 만으로 */ }
    try { await ensureXsScores(); } catch { /* 이전 지도 그대로 */ }
    syms.forEach((t, i) => {
        const e = rows?.[i];
        const ts = num(e?.timestamp);
        const recent = !!e?.alphaSnapshot && ts !== null && ts <= now + 60_000 && now - ts <= LAST_KNOWN_MAX_AGE_MS;
        const x: any = xsSnapshotOverride(t, recent ? { ...e.alphaSnapshot } : {});
        const score = num(x?.score);
        if (score === null) return;
        const grade = typeof x.grade === 'string' && x.grade && x.grade !== '-' ? x.grade : gradeForScore(score);
        out.set(t, {
            alphaSnapshot: { ...x, score, grade },
            whaleIndex: recent ? (e.whaleIndex ?? null) : null,
            relVol: recent ? (e.relVol ?? null) : null,
            darkPoolPct: null, shortVolPct: null,
        });
    });
    return out;
}

/** 종목들의 «지금 표시해야 할» 알파 점수·등급. 못 잰 종목은 Map 에 없다. */
export async function readLastKnownAlpha(tickers: string[], now: number = Date.now()): Promise<Map<string, DisplayAlpha>> {
    const rows = await readLastKnownAnalysis(tickers, now);
    return new Map([...rows].map(([t, r]) => [t, { score: r.alphaSnapshot.score, grade: r.alphaSnapshot.grade }]));
}

/**
 * 인텔 quote 배열(fast·fast-all 응답의 data)에 «지금 게시된 표시 점수»를 덮는다 — 제자리 수정.
 *   · XS 게시본에 있는 종목: XS 점수·등급(저장된 봉투가 22:10Z XS 게시 전에 구워졌어도 스냅샷·워치리스트와 같은 값)
 *   · XS 밖 종목: 분석 캐시의 마지막 알파(4일 이내)가 있으면 그것, 없으면 봉투 값 그대로(못 잰 0 은 missingFields 유지)
 *   · 채웠으면 missingFields 에서 alphaScore 를 뺀다. 실패하면 받은 그대로 — 화면을 비우지 않는다.
 */
export async function overlayIntelAlpha(quotes: any[]): Promise<void> {
    if (!Array.isArray(quotes) || quotes.length === 0) return;
    try {
        await ensureXsScores();
        const need: string[] = [];
        for (const q of quotes) {
            const sym = String(q?.ticker ?? '').toUpperCase();
            if (!sym) continue;
            const x: any = xsSnapshotOverride(sym, {});
            const xs = num(x?.score);
            if (xs !== null) { setAlpha(q, xs, x.grade || gradeForScore(xs)); continue; }
            // XS 밖 종목: 봉투에 잰 값이 있어도 분석 캐시의 마지막 알파가 있으면 그것으로 — 스냅샷·워치리스트 공통 출구와 같은 값
            //   (봉투는 최대 12시간 묵는다 · 워치리스트가 장중 재계산해 분석 캐시에 써 넣는다)
            need.push(sym);
        }
        if (need.length === 0) return;
        const last = await readLastKnownAlpha(need);
        for (const q of quotes) {
            const a = last.get(String(q?.ticker ?? '').toUpperCase());
            if (a) setAlpha(q, a.score, a.grade);
        }
    } catch (e) {
        console.warn('[intel alpha] overlay skipped:', (e as any)?.message ?? e);
    }
}

function setAlpha(q: any, score: number, grade: string): void {
    q.alphaScore = score;
    q.grade = grade;
    if (Array.isArray(q.missingFields)) {
        const rest = q.missingFields.filter((f: string) => f !== 'alphaScore');
        if (rest.length) q.missingFields = rest; else delete q.missingFields;
    }
}
