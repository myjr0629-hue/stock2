// ============================================================================
// 구조 판본 사전 갱신 — Intrinio 새 EOD 레코드가 올라온 직후 상위 종목의 structure:v2 를 미리 다시 계산한다. (2026-10-13)
// ----------------------------------------------------------------------------
// 왜: 판본은 «누가 열 때» 갱신된다 → 조용한 종목은 밤새·주말 옛 판본이었다가 첫 요청에 한 레코드 뒤(40~78시간 묵은) 값을 줬다
//   (10/12 12시 ET 실측: 인기 57종목 중 17%·무작위 68종목 중 71%가 12시간 넘게 낡음). 계산은 응답 뒤 갱신(scheduleRefresh)과 같은 함수다.
//   사용자 경로는 건드리지 않는다 — 이 크론만 돈다. 화면 문구·라벨 불변.
// 언제: 평일 장 마감 후 20:45~24:00 UTC 15분마다(레코드는 마감 약 45분 뒤, 서머타임 20:45 UTC·표준시 21:45 UTC) + 개장 전 12:40·13:10 UTC 잔여 마무리.
//   매 실행이 먼저 공급사의 «지금 가장 늦은 EOD 날짜»를 묻고(SPY 체인, 2콜), 새 레코드가 필요한 판본만 갱신한다 — 필요 없으면 아무것도 안 한다.
// 호출량: 종목당 Intrinio 13~28콜(실측) × 300 ≈ 5.7k콜. 호출 관문이 초당 4콜·동시 2콜(분당 240콜 = 계약 2,000콜/분의 12%)로 막고,
//   429·빈 응답이 나면 물러섰다 다시(15·30·60초), 사건이 3번이면 멈춘다 — 나머지는 기존 SWR(첫 요청 때 응답 뒤 갱신)에 남는다.
// 끄기: Redis 키 `structure-warm:off` 하나(값이 있으면 꺼짐). 상태: ?status=1 · 계획만: ?dry=1 · 특정 종목: ?t=A,B · 휴장 무시: ?force=1 (인증된 호출만).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { etDateOf, isNonTradingDay } from '@/lib/marketCalendar';
import { loadDemandTop } from '@/lib/ai/deepDemand';
import { recentEtDays } from '@/lib/ai/deepWarmPlan';
import { probeVendorEodDate } from '@/services/intrinioClient';
import { inspectStoredVersions, refreshStructureForWarm } from '@/services/structureService';
import { createWarmGate, runInWarmGate } from '@/lib/intrinioWarmGate';
import {
    WARM_OFF_KEY, WARM_LAST_KEY, WARM_STATE_TTL_SEC, WARM_PART_KEY, WARM_PARTS, WARM_TARGETS, WARM_PINNED,
    WARM_RATE_PER_SEC, WARM_CONCURRENCY, WARM_BACKOFF_MS, WARM_MAX_INCIDENTS, WARM_RUN_BUDGET_MS, WARM_MAX_PER_RUN, WARM_MAX_TRIES,
    warmStateKey, warmReadyAtMs, buildWarmTargets, pickWarmBatch, classifyWarmResult, bumpTries, oiMapFromParts,
    type WarmInfo, type WarmOutcome,
} from '@/lib/structureWarmPlan';
import CORE_FILE from '@/../data/stock_universe_us300.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CORE: string[] = ((CORE_FILE as any)?.symbols ?? []) as string[];
const dayKey = (etDate: string) => `structure-warm:day:${etDate}`;

type State = { tries: Record<string, number>; doneAt?: number | null; /** 관문이 닫힌(429 등) 실행 횟수 — 2번이면 이 공급사 날짜는 포기하고 나머지를 기존 SWR 에 남긴다 */ aborts?: number };
const WARM_MAX_ABORTS = 2;

async function offSwitchOn(): Promise<boolean> {
    try { return !!(await getFromCache<any>(WARM_OFF_KEY)); } catch { return false; }
}

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const q = new URL(req.url).searchParams;
    if (q.get('status') === '1') {
        const last = await getFromCache<any>(WARM_LAST_KEY).catch(() => null);
        const day = q.get('day');
        const runs = day ? await getFromCache<any>(dayKey(day)).catch(() => null) : null;
        return NextResponse.json({ success: true, off: await offSwitchOn(), last, ...(day ? { day, runs } : {}) });
    }

    const t0 = Date.now();
    const etDate = etDateOf(t0);
    const force = q.get('force') === '1';
    const dry = q.get('dry') === '1';
    if (await offSwitchOn()) return NextResponse.json({ success: true, skipped: 'off', switchKey: WARM_OFF_KEY });
    if (!force && isNonTradingDay(etDate)) return NextResponse.json({ success: true, skipped: 'non-trading-day', etDate });

    const gate = createWarmGate({
        maxPerSec: WARM_RATE_PER_SEC, maxConcurrent: WARM_CONCURRENCY, backoffMs: WARM_BACKOFF_MS, maxIncidents: WARM_MAX_INCIDENTS,
    });

    const summary: any = await runInWarmGate(gate, async () => {
        // 1) 공급사가 지금 내보낸 가장 늦은 EOD 날짜
        const vendorEod = await probeVendorEodDate().catch(() => null);
        if (!vendorEod) return { success: true, skipped: 'vendor-date-unknown' };
        const state = (await getFromCache<State>(warmStateKey(vendorEod)).catch(() => null)) || { tries: {} };
        if (state.doneAt && !q.get('t') && !force) return { success: true, skipped: 'done', vendorEod, doneAt: state.doneAt };
        if ((state.aborts ?? 0) >= WARM_MAX_ABORTS && !q.get('t') && !force) return { success: true, skipped: 'gave-up', vendorEod, aborts: state.aborts };
        const readyAt = warmReadyAtMs(vendorEod);

        // 2) 대상 — 직접 지정(?t=) 또는 우선순위(고정 ETF → 열람 수요 → 핵심 종목·미결제약정 큰 순)
        const only = (q.get('t') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
        let order: string[];
        if (only.length) order = only.slice(0, 40);
        else {
            const [demand, parts] = await Promise.all([
                loadDemandTop(recentEtDays(t0, 7, etDateOf), 60).catch(() => []),
                Promise.all(Array.from({ length: WARM_PARTS }, (_, i) => getFromCache<any>(WARM_PART_KEY(i)).catch(() => null))),
            ]);
            order = buildWarmTargets({ demand, oi: oiMapFromParts(parts), core: CORE, pinned: WARM_PINNED }, WARM_TARGETS);
        }

        // 3) 새 레코드가 필요한 판본 (읽기만 — 50종목씩)
        const infos = new Map<string, WarmInfo>();
        for (let i = 0; i < order.length; i += 50) {
            const part = await inspectStoredVersions(order.slice(i, i + 50));
            if (!part) return { success: true, skipped: 'redis-unreadable', vendorEod };   // «모른다» — 갱신 후보로 올리지 않는다
            for (const [k, v] of part) infos.set(k, v);
        }
        const maxN = Math.max(1, Math.min(WARM_MAX_PER_RUN, Number(q.get('max')) || WARM_MAX_PER_RUN));
        const pick = pickWarmBatch(order, infos, vendorEod, readyAt, state.tries || {}, { maxPerRun: maxN });
        const base = { success: true, etDate, vendorEod, targets: order.length, needing: pick.needing.length, exhausted: pick.exhausted.length, batch: pick.batch.length };

        if (dry) return { ...base, dry: true, plan: pick.batch.slice(0, 40), needingSample: pick.needing.slice(0, 40) };
        if (!pick.needing.length) {
            await setInCache(warmStateKey(vendorEod), { tries: state.tries || {}, doneAt: Date.now(), aborts: state.aborts ?? 0 } as State, WARM_STATE_TTL_SEC).catch(() => false);
            return { ...base, refreshed: { ok: 0, behind: 0, fail: 0, skip: 0 }, remaining: 0, done: true };
        }

        // 4) 갱신 — 종목 둘씩, 시간 예산·끄기 스위치·관문 중단을 매번 본다
        const counts: Record<WarmOutcome, number> = { ok: 0, behind: 0, fail: 0, skip: 0 };
        const results: Array<{ t: string; o: WarmOutcome; cd: string | null; ms: number; n?: string }> = [];
        let tries = state.tries || {};
        const deadline = t0 + WARM_RUN_BUDGET_MS;
        let next = 0;
        let stopped: string | null = null;
        const worker = async () => {
            for (;;) {
                if (stopped) return;
                if (Date.now() > deadline) { stopped = 'time-budget'; return; }
                if (gate.aborted) { stopped = 'gate-aborted'; return; }
                const i = next++;
                if (i >= pick.batch.length) return;
                if (i % 5 === 0 && await offSwitchOn()) { stopped = 'off-switch'; return; }
                const T = pick.batch[i];
                const r = await refreshStructureForWarm(T, { expectChainDate: vendorEod });
                const o = classifyWarmResult(r, vendorEod);
                counts[o]++;
                if (!gate.aborted) tries = bumpTries(tries, T, o);   // 관문이 닫힌 뒤의 실패는 그 종목 탓이 아니다
                results.push({ t: T, o, cd: r.chainDate, ms: r.ms, ...(r.note ? { n: r.note } : {}) });
            }
        };
        await Promise.all([worker(), worker()]);

        // 아직 할 일: 새 레코드가 필요한데 이번에 못 한 종목 중 시도 횟수 상한 안인 것
        const okSet = new Set(results.filter((r) => r.o === 'ok').map((r) => r.t));
        const open = pick.needing.filter((t) => !okSet.has(t) && (tries[t] ?? 0) < WARM_MAX_TRIES);
        const remaining = open.length;
        const g = gate.stats();
        const out = {
            ...base, refreshed: counts, remaining, stopped, ms: Date.now() - t0,
            gate: g, callsPerTicker: results.length ? Math.round((g.calls / results.length) * 10) / 10 : null,
            sample: results.slice(0, 12),
        };
        await setInCache(warmStateKey(vendorEod), {
            tries, doneAt: remaining === 0 && !stopped ? Date.now() : null, aborts: (state.aborts ?? 0) + (stopped === 'gate-aborted' ? 1 : 0),
        } as State, WARM_STATE_TTL_SEC).catch(() => false);
        return out;
    });

    // 실행 기록 — 상태 확인·전후 측정용
    if (!dry && summary && !summary.skipped) {
        const compact = { at: t0, ...summary, sample: undefined };
        await setInCache(WARM_LAST_KEY, { at: t0, ...summary }, WARM_STATE_TTL_SEC).catch(() => false);
        const prev = (await getFromCache<any[]>(dayKey(etDate)).catch(() => null)) || [];
        await setInCache(dayKey(etDate), [...prev, compact].slice(-24), WARM_STATE_TTL_SEC).catch(() => false);
    }
    return NextResponse.json(summary);
}
