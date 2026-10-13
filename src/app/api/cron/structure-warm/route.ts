// ============================================================================
// 구조 판본 사전 갱신 — Intrinio 새 EOD 레코드가 올라온 뒤, 애프터마켓이 끝난 밤에 상위 종목의 structure:v2 를 미리 다시 계산한다. (2026-10-13)
// ----------------------------------------------------------------------------
// 왜: 판본은 «누가 열 때» 갱신된다 → 조용한 종목은 밤새·주말 옛 판본이었다가 첫 요청에 한 레코드 뒤(40~78시간 묵은) 값을 줬다
//   (10/12 12시 ET 실측: 인기 57종목 중 17%·무작위 68종목 중 71%가 12시간 넘게 낡음). 계산은 응답 뒤 갱신(scheduleRefresh)과 같은 함수다.
//   사용자 경로는 건드리지 않는다 — 이 크론만 돈다. 화면 문구·라벨 불변.
// 언제 (10/13 긴급 수정 — 첫날 저녁 17~19시 ET 의 Intrinio 429 군집과 겹쳐 꺼졌다가 다시 설계):
//   · 애프터마켓이 끝난 뒤 20:05 ET ~ 다음 날 07:00 ET 에만 돈다. 미국 정규장·시간외 중에는 돌지 않는다(서머타임/표준시는 뉴욕 시계로 판정).
//   · 단일 실행 잠금(Redis SET NX EX, 330초) — 이미 돌고 있으면 건너뛴다. 잠금 저장소를 못 쓰면 돌지 않는다(fail closed).
//   · 사용자 요청 우선: 직전 1분에 «사전 갱신이 아닌 호출»(화면 경로·다른 크론)이 Intrinio 429 를 한 건이라도 받았으면 시작하지 않고, 도는 중이면 3초 안에 멈춘다.
//   · 호출 관문 초당 2콜·동시 1콜(= 분당 120콜 = 계약 2,000콜/분의 6%). 429·빈 응답이 나면 물러섰다 다시(15·30·60초), 사건이 3번이면 멈춘다 — 나머지는 기존 SWR.
//   · 계측: 429 를 시간대별로 센다(lib/intrinioMeter, 사전 갱신 w / 그 밖 u) — 실행마다 «도는 동안 u 429 건수»를 기록한다. ?meter=1 로 시간대표.
// 무엇을: 공급사의 «지금 가장 늦은 EOD 날짜» 를 묻고(SPY 체인, 2콜 — 오늘 몫이 끝났으면 묻지도 않는다), 새 레코드가 필요한 판본만 갱신한다.
// 끄기: Redis 키 `structure-warm:off` 하나(값이 있으면 꺼짐) — 끄기: EC2 프록시 POST /set {"key":"structure-warm:off","value":1} · 켜기: DELETE /del?key=structure-warm:off (ACCESS-RUNBOOK 의 EC2 Redis 프록시).
// 점검(인증된 호출만): ?status=1[&day=YYYY-MM-DD] · ?meter=1[&hours=24] · 계획만 ?dry=1[&targets=1] · 특정 종목 ?t=A,B · 창·표식 무시 ?force=1 · 종목 수 ?max=N · 시각 가정 ?now=<ms>.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { etDateOf } from '@/lib/marketCalendar';
import { loadDemandTop } from '@/lib/ai/deepDemand';
import { recentEtDays } from '@/lib/ai/deepWarmPlan';
import { probeVendorEodDate } from '@/services/intrinioClient';
import { inspectStoredVersions, refreshStructureForWarm } from '@/services/structureService';
import { createWarmGate, runInWarmGate } from '@/lib/intrinioWarmGate';
import { acquireWarmLock, releaseWarmLock, userRecent429, count429Between, read429Hourly, flushMeterNow } from '@/lib/intrinioMeter';
import {
    WARM_OFF_KEY, WARM_LAST_KEY, WARM_DONE_KEY, WARM_STATE_TTL_SEC, WARM_PART_KEY, WARM_PARTS, WARM_TARGETS, WARM_PINNED,
    WARM_RATE_PER_SEC, WARM_CONCURRENCY, WARM_BACKOFF_MS, WARM_MAX_INCIDENTS, WARM_RUN_BUDGET_MS, WARM_MAX_PER_RUN, WARM_MAX_TRIES,
    warmStateKey, warmReadyAtMs, buildWarmTargets, pickWarmBatch, classifyWarmResult, bumpTries, oiMapFromParts, warmWindowOpen, expectedVendorDate,
    WARM_WINDOW_OPEN_ET_MIN, WARM_WINDOW_CLOSE_ET_MIN,
    type WarmInfo, type WarmOutcome,
} from '@/lib/structureWarmPlan';
import { APP_WARM_FIXED } from '@/lib/appWarmTickers';
import CORE_FILE from '@/../data/stock_universe_us300.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CORE: string[] = ((CORE_FILE as any)?.symbols ?? []) as string[];
const dayKey = (etDate: string) => `structure-warm:day:${etDate}`;
/** 사용자 경로 429 감시 간격 — 이 안에 도는 호출 관문을 닫는다 */
const USER_WATCH_MS = 3000;

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
    const nowParam = Number(q.get('now'));
    const t0 = Number.isFinite(nowParam) && nowParam > 0 ? nowParam : Date.now();   // 점검용 시각 가정(인증된 호출만)

    // ── 읽기 전용 점검 ──
    if (q.get('status') === '1') {
        const last = await getFromCache<any>(WARM_LAST_KEY).catch(() => null);
        const day = q.get('day');
        const runs = day ? await getFromCache<any>(dayKey(day)).catch(() => null) : null;
        return NextResponse.json({ success: true, off: await offSwitchOn(), last, ...(day ? { day, runs } : {}) });
    }
    if (q.get('meter') === '1') {
        await flushMeterNow().catch(() => undefined);
        return NextResponse.json({ success: true, hours: await read429Hourly(Date.now(), Number(q.get('hours')) || 24), user429Recent: await userRecent429() });
    }

    const etDate = etDateOf(t0);
    const force = q.get('force') === '1';
    const dry = q.get('dry') === '1';
    const only = (q.get('t') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

    // ── 돌아도 되는가 (계획만 보는 dry 는 묻지 않는다) ──
    if (!dry) {
        if (await offSwitchOn()) return NextResponse.json({ success: true, skipped: 'off', switchKey: WARM_OFF_KEY });
        if (!force && !warmWindowOpen(t0)) {
            return NextResponse.json({ success: true, skipped: 'outside-window', etDate, window: { openEtMin: WARM_WINDOW_OPEN_ET_MIN, closeEtMin: WARM_WINDOW_CLOSE_ET_MIN } });
        }
        // 사용자 요청 우선 — 직전 1분에 사전 갱신이 아닌 호출이 429 를 받았으면 시작하지 않는다. 저장소를 못 읽으면 «모른다» = 돌지 않는다.
        const u = await userRecent429(Date.now());
        if (u.state === 'yes') return NextResponse.json({ success: true, skipped: 'user-429', lastUser429At: u.lastAt });
        if (u.state === 'unknown') return NextResponse.json({ success: true, skipped: 'meter-unreadable' });
        // 이미 오늘 몫을 끝냈으면 공급사에 묻지도 않는다
        if (!force && !only.length) {
            const done = await getFromCache<{ date?: string }>(WARM_DONE_KEY).catch(() => null);
            if (done?.date && done.date === expectedVendorDate(t0)) return NextResponse.json({ success: true, skipped: 'done', date: done.date });
        }
    }

    // ── 단일 실행 잠금 (dry 는 읽기만이라 잡지 않는다) ──
    const lockToken = dry ? null : await acquireWarmLock();
    if (!dry && !lockToken) return NextResponse.json({ success: true, skipped: 'locked' });

    const gate = createWarmGate({
        maxPerSec: WARM_RATE_PER_SEC, maxConcurrent: WARM_CONCURRENCY, backoffMs: WARM_BACKOFF_MS, maxIncidents: WARM_MAX_INCIDENTS,
    });
    let userTrip = false;
    let watcher: ReturnType<typeof setInterval> | null = null;
    const tStart = Date.now();

    try {
        const summary: any = await runInWarmGate(gate, async () => {
            // 1) 공급사가 지금 내보낸 가장 늦은 EOD 날짜
            const vendorEod = await probeVendorEodDate().catch(() => null);
            if (!vendorEod) return { success: true, skipped: 'vendor-date-unknown' };
            const state = (await getFromCache<State>(warmStateKey(vendorEod)).catch(() => null)) || { tries: {} };
            if (state.doneAt && !only.length && !force) {
                await setInCache(WARM_DONE_KEY, { date: vendorEod, at: state.doneAt }, WARM_STATE_TTL_SEC).catch(() => false);   // 다음부터는 공급사에 묻지도 않는다
                return { success: true, skipped: 'done', vendorEod, doneAt: state.doneAt };
            }
            if ((state.aborts ?? 0) >= WARM_MAX_ABORTS && !only.length && !force) return { success: true, skipped: 'gave-up', vendorEod, aborts: state.aborts };
            const readyAt = warmReadyAtMs(vendorEod);

            // 2) 대상 — 직접 지정(?t=) 또는 우선순위(고정 ETF → 열람 수요 → 핵심 종목·미결제약정 큰 순)
            let order: string[];
            if (only.length) order = only.slice(0, 40);
            else {
                const [demand, parts] = await Promise.all([
                    loadDemandTop(recentEtDays(t0, 7, etDateOf), 60).catch(() => []),
                    Promise.all(Array.from({ length: WARM_PARTS }, (_, i) => getFromCache<any>(WARM_PART_KEY(i)).catch(() => null))),
                ]);
                order = buildWarmTargets({ demand, oi: oiMapFromParts(parts), core: CORE, pinned: WARM_PINNED, appFixed: APP_WARM_FIXED }, WARM_TARGETS);   // 앱 고정 종목(10/14): 핵심 300 밖에서 새로 들어오는 만큼만 대상이 늘어난다
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

            if (dry) return { ...base, dry: true, plan: pick.batch.slice(0, 40), needingSample: pick.needing.slice(0, 40), ...(q.get('targets') === '1' ? { order } : {}) };
            if (!pick.needing.length) {
                await setInCache(warmStateKey(vendorEod), { tries: state.tries || {}, doneAt: Date.now(), aborts: state.aborts ?? 0 } as State, WARM_STATE_TTL_SEC).catch(() => false);
                await setInCache(WARM_DONE_KEY, { date: vendorEod, at: Date.now() }, WARM_STATE_TTL_SEC).catch(() => false);
                return { ...base, refreshed: { ok: 0, behind: 0, fail: 0, skip: 0 }, remaining: 0, done: true };
            }

            // 4) 갱신 — 한 번에 한 종목, 시간 예산·끄기 스위치·사용자 429·관문 중단을 매번 본다
            watcher = setInterval(() => {
                if (userTrip) return;
                void userRecent429(Date.now()).then((r) => { if (r.state === 'yes' && !userTrip) { userTrip = true; gate.close(); } }).catch(() => undefined);
            }, USER_WATCH_MS);
            (watcher as any)?.unref?.();

            const counts: Record<WarmOutcome, number> = { ok: 0, behind: 0, fail: 0, skip: 0 };
            const failReasons: Record<string, number> = {};
            const results: Array<{ t: string; o: WarmOutcome; cd: string | null; ms: number; n?: string }> = [];
            let tries = state.tries || {};
            const deadline = tStart + WARM_RUN_BUDGET_MS;
            let stopped: string | null = null;
            for (let i = 0; i < pick.batch.length; i++) {
                if (!userTrip && (await userRecent429(Date.now())).state === 'yes') { userTrip = true; gate.close(); }   // 종목마다 한 번 더(감시 간격 3초를 기다리지 않는다)
                if (userTrip) { stopped = 'user-429'; break; }
                if (Date.now() > deadline) { stopped = 'time-budget'; break; }
                if (gate.aborted) { stopped = 'gate-aborted'; break; }
                if (i % 5 === 0 && await offSwitchOn()) { stopped = 'off-switch'; break; }
                const T = pick.batch[i];
                const r = await refreshStructureForWarm(T, { expectChainDate: vendorEod });
                const o = classifyWarmResult(r, vendorEod);
                counts[o]++;
                if (o === 'fail') failReasons[r.note || r.outcome] = (failReasons[r.note || r.outcome] ?? 0) + 1;
                if (!gate.aborted && !userTrip) tries = bumpTries(tries, T, o);   // 관문이 닫힌 뒤의 실패는 그 종목 탓이 아니다
                results.push({ t: T, o, cd: r.chainDate, ms: r.ms, ...(r.note ? { n: r.note } : {}) });
            }
            if (!stopped && userTrip) stopped = 'user-429';

            // 아직 할 일: 새 레코드가 필요한데 이번에 못 한 종목 중 시도 횟수 상한 안인 것
            const okSet = new Set(results.filter((r) => r.o === 'ok').map((r) => r.t));
            const open = pick.needing.filter((t) => !okSet.has(t) && (tries[t] ?? 0) < WARM_MAX_TRIES);
            const remaining = open.length;
            const g = gate.stats();
            const doneNow = remaining === 0 && !stopped;
            await setInCache(warmStateKey(vendorEod), {
                tries, doneAt: doneNow ? Date.now() : null, aborts: (state.aborts ?? 0) + (stopped === 'gate-aborted' ? 1 : 0),
            } as State, WARM_STATE_TTL_SEC).catch(() => false);
            if (doneNow) await setInCache(WARM_DONE_KEY, { date: vendorEod, at: Date.now() }, WARM_STATE_TTL_SEC).catch(() => false);
            return {
                ...base, refreshed: counts, remaining, stopped, failReasons,
                gate: g, callsPerTicker: results.length ? Math.round((g.calls / results.length) * 10) / 10 : null,
                sample: results.slice(0, 12),
            };
        });

        // 실행 기록 — 상태 확인·전후 측정용. «도는 동안 사용자 경로 429» 를 같이 남긴다(사용자 우선 증명)
        if (!dry && summary && !summary.skipped) {
            const tEnd = Date.now();
            await flushMeterNow().catch(() => undefined);
            const during = await count429Between(tStart - 60_000, tEnd + 60_000).catch(() => null);
            const full = { at: tStart, endedAt: tEnd, ms: tEnd - tStart, ...summary, ...(userTrip && !summary.stopped ? { stopped: 'user-429' } : {}), user429During: during ? during.u : null, warm429During: during ? during.w : null };
            const compact = { ...full, sample: undefined };
            await setInCache(WARM_LAST_KEY, full, WARM_STATE_TTL_SEC).catch(() => false);
            const prev = (await getFromCache<any[]>(dayKey(etDate)).catch(() => null)) || [];
            await setInCache(dayKey(etDate), [...prev, compact].slice(-60), WARM_STATE_TTL_SEC).catch(() => false);
            return NextResponse.json(full);
        }
        return NextResponse.json(summary);
    } finally {
        if (watcher) clearInterval(watcher);
        await releaseWarmLock(lockToken);
    }
}
