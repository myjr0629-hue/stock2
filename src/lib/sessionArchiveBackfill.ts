/**
 * 완료 세션 보관본 채우기 (2026-10-19 묶음 3) — 배포 직후 1회, 또는 보관본이 빈 종목이 보일 때.
 *
 * 새 공급사 호출 0: 이미 Redis 에 있는 «같은 원천의 계산 결과»에서만 옮긴다.
 *   · 레벨  structure:v2:{T}(판본) → session:levels:{T}:{체인 EOD 날짜}
 *   · VWAP  chart:v5:{T}:1d(차트가 캐시한 1분봉) → session:vwap:{T}:{봉 날짜}  (봉 캐시 생성 시각이 있어야 — 확정 판정에 쓴다)
 *   · 고래  whale:{T}(라우트 5분 캐시)의 sessionAggregate → session:whale:{T}:{EOD 날짜}
 *   · breadth 는 guardian/breadthEngine.backfillBreadthArchive (옛 lastreg 키 → 보관본, 스냅샷은 명시할 때만)
 * 날짜·확정·덮어쓰기 규칙은 saveSessionArchive 가 그대로 건다(휴장일·미래 날짜 거부, 확정본 위 잠정본 거부, 더 이른 관측 거부).
 */
import { mgetFromCache } from '@/services/redisClient';
import { saveSessionArchive, type ArchiveWriteDecision } from '@/lib/sessionArchive';
import { sessionVwapFromBars } from '@/lib/vwap';
import { slimForLevelsArchive } from '@/services/structureService';

export type BackfillCounts = Record<string, number>;
export type BackfillReport = { tickers: number; levels: BackfillCounts; vwap: BackfillCounts; whale: BackfillCounts; dry: boolean };

const bump = (m: BackfillCounts, k: string) => { m[k] = (m[k] || 0) + 1; };

export async function backfillSessionArchives(tickersIn: string[], opts: { nowMs?: number; dry?: boolean } = {}): Promise<BackfillReport> {
    const nowMs = opts.nowMs ?? Date.now();
    const tickers = Array.from(new Set((tickersIn || []).map((t) => String(t || '').trim().toUpperCase()).filter(Boolean)));
    const rep: BackfillReport = { tickers: tickers.length, levels: {}, vwap: {}, whale: {}, dry: !!opts.dry };
    const save = async (bucket: BackfillCounts, ...args: Parameters<typeof saveSessionArchive>) => {
        if (opts.dry) { bump(bucket, 'would-try'); return; }
        const r: ArchiveWriteDecision | string = await saveSessionArchive(...args).catch(() => 'error');
        bump(bucket, r);
    };
    for (let i = 0; i < tickers.length; i += 50) {
        const chunk = tickers.slice(i, i + 50);
        const vals = await mgetFromCache<any>(chunk.flatMap((t) => [`structure:v2:${t}`, `chart:v5:${t}:1d`, `whale:${t}`])).catch(() => null);
        if (!vals) { chunk.forEach(() => { bump(rep.levels, 'read-error'); }); continue; }
        for (let j = 0; j < chunk.length; j++) {
            const t = chunk[j];
            const [v2, chart, whale] = [vals[3 * j], vals[3 * j + 1], vals[3 * j + 2]];
            // 레벨
            const slim = v2?.data ? slimForLevelsArchive(v2.data) : null;
            const ts = Number(v2?.timestamp);
            if (slim && ts > 0) await save(rep.levels, 'levels', t, slim.chainDate, { data: slim, timestamp: ts }, { observedAt: ts, nowMs, minIntervalMs: 0 });
            else bump(rep.levels, v2 ? 'no-usable-version' : 'no-version');
            // VWAP
            const rows = Array.isArray(chart?.data) ? chart.data : Array.isArray(chart) ? chart : null;
            const builtAt = Number(chart?._builtAt || 0);
            const sv = sessionVwapFromBars(rows);
            if (sv && builtAt > 0) await save(rep.vwap, 'vwap', t, sv.date, sv, { observedAt: builtAt, nowMs, minIntervalMs: 0 });
            else bump(rep.vwap, rows ? 'no-vwap' : 'no-bars');
            // 고래 마감 집계
            const agg = whale?.sessionAggregate;
            if (agg && agg.basis === 'eod-volume' && typeof agg.sessionDate === 'string' && Array.isArray(agg.items) && agg.items.length) {
                await save(rep.whale, 'whale', t, agg.sessionDate, agg, { nowMs, minIntervalMs: 0 });
            } else bump(rep.whale, whale ? 'no-aggregate' : 'no-cache');
        }
    }
    return rep;
}
