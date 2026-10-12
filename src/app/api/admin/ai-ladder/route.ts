/**
 * GET  /api/admin/ai-ladder?hours=24[&purpose=FlowAI][&raw=1][&depth=1|0][&since=ms][&until=ms]   운영 상태 — 월 원장·잔여·허용 목록·브레이커 + 용도별 호출 지표(전환율·p50/p95·가드·토큰·비용)
 *   attrib=1 → 응답에 attribution(지출 귀속: 원장 24시간 증가분 = 호출 기록 크레딧 + 시험 호출(tag별) + 남는 것, 그리고 UC 생성 요청 카운터 gen·nogen_hit·nogen_miss)
 *   응답의 pacing = 페이싱 조절기 상태(이번 달 목표·누적·오늘 목표 속도·실제 속도·단계·용도별 현재 주기·월말 예상 소진율 — lib/ai/creditPacing)
 * POST /api/admin/ai-ladder  {action:'capture', on:boolean, hours?:1~120}  입력 캡처 켜기/끄기(품질 비교용 실제 프롬프트 보관, 4일 TTL · 켜 두는 시간 최대 120시간)
 *                            {action:'kill', purposes:['*'] | string[] | null}   킬 스위치 — 재배포 없이 즉시 «예전 그대로»(null 이면 해제)
 *                            {action:'depth-off', purposes:['UC']|['*']|null}   «해석의 깊이» 지시문만 끄기(null 이면 켬) — Haiku 5.5 는 그대로, 프롬프트만 예전 그대로
 *                            {action:'sonnet-off', on:boolean}         Sonnet 5.5 단만 끄기(딥 분석 → Haiku 5.5 부터)
 *                            {action:'aiq-off', on:boolean}            aiq55(AI 분석 입력 보강·새 지시문·새 가드·인텔 Haiku 5.5) 끄기/켜기 — 키 aiq55:off, 45초 안에 전 인스턴스(재배포 없음)
 *                            {action:'warm-sep', on:boolean}           딥 분석 예열 몫 분리(수요 상위 10종목 · 개장 직후 1회 · 예열 자신의 몫) 켜기(on:true)/끄기(on:false → 옛 규칙) — 키 llm:warmsep:off, 30초 안에
 *                            {action:'breaker-reset'}                  서킷 브레이커 해제
 *                            {action:'pace-tick'}                      페이싱 조절기 판단을 지금 한 번(저장) · {action:'pace-reset'} 조절기 상태 삭제
 * 인증: Authorization: Bearer <CRON_SECRET> (lib/ai/adminAuth). 응답에 키 값은 없다(설정 여부만).
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { ladderStatus, LLM_KEYS, TRACKED_PURPOSES, hourId, type CallRecord } from '@/lib/ai/llmLadder';
import { upstashStore } from '@/lib/ai/llmStore';
import { summarizeCalls } from '@/lib/ai/llmStats';
import { peekPacing, tickPacing, PACE_STATE_KEY, type PacingStatus } from '@/lib/ai/creditPacing';
import { AIQ_OFF_KEY } from '@/services/aiqContextService';
import { sumTestSpend, testCallsKey } from '@/lib/ai/llmTestSpend';
import { UC_SRC_KINDS, ucSrcKey, hourOf } from '@/lib/ai/ucSource';

/** 용도별로 풀어 쓴 현재 주기(사람이 읽는 표) */
function byPurpose(p: PacingStatus) {
    const k = p.knobs, b = p.baseline;
    const m = (sec: number) => Math.round((sec / 60) * 10) / 10;
    return {
        NewsDigest: { refreshMin: p.digestIntervalNowMin, baselineMin: b.digestIntervalMin, minMin: 5, maxMin: 30 },
        UC: {
            coreFreshMin: m(k.ucCoreFreshSec), feedFreshMin: m(k.ucFeedFreshSec), macroFreshMin: m(k.ucMacroFreshSec), tickerFreshMin: m(k.ucTickerFreshSec),
            baseline: { coreFreshMin: m(b.ucCoreFreshSec), feedFreshMin: m(b.ucFeedFreshSec), macroFreshMin: m(b.ucMacroFreshSec), tickerFreshMin: m(b.ucTickerFreshSec) },
            prewarmTickers: k.ucPrewarmTickers, prewarmLocales: 3, prewarmWindowOpen: p.prewarmWindowOpen,
        },
        TickerNews: { prewarmTickers: k.tickerNewsPrewarm, listCacheMin: 5, baselinePrewarmTickers: b.tickerNewsPrewarm },
    };
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(req.url);
    const hours = Math.min(72, Math.max(1, Number(url.searchParams.get('hours')) || 24));
    const only = url.searchParams.get('purpose');
    const sinceMs = Number(url.searchParams.get('since')) || 0;   // epoch ms — 이 시각 이후 기록만(전/후 구간 나누기)
    const untilMs = Number(url.searchParams.get('until')) || Date.now() + 1;
    const depthOnly = url.searchParams.get('depth');   // 1 = 깊이 지시문이 붙은 요청만 · 0 = 안 붙은 요청만 (전·후 비교)
    const now = Date.now();
    const status = await ladderStatus();
    const pacing = await peekPacing();
    const records: CallRecord[] = [];
    let trackedCreditUsd = 0;   // 용도·only 필터와 무관한 구간 합 — 원장과 견주는 용(attrib=1)
    for (let h = 0; h < hours; h++) {
        const lines = await upstashStore.lrange(LLM_KEYS.calls(hourId(now - h * 3600_000)), 0, -1);
        for (const l of lines) {
            try {
                const r = JSON.parse(l) as CallRecord;
                if (r.t >= sinceMs && r.t < untilMs) trackedCreditUsd += Number(r.ca) || 0;
                if (only && r.p !== only) continue;
                if (r.t < sinceMs || r.t >= untilMs) continue;
                if (depthOnly === '1' && !r.dp) continue;
                if (depthOnly === '0' && r.dp) continue;
                records.push(r);
            } catch { /* 깨진 줄은 건너뛴다 */ }
        }
    }
    // raw=1 : 개별 호출 기록(최근 300건, 입력·출력 글은 없다) — 출력 길이·토큰 «분포» 를 볼 때(예: 인텔 분석의 종목당 토큰)
    const raw = url.searchParams.get('raw') === '1' ? records.sort((a, b) => b.t - a.t).slice(0, 300) : undefined;
    const aiqOff = !!(await upstashStore.get(AIQ_OFF_KEY)) || process.env.AIQ55_OFF === '1';
    let attribution: Record<string, unknown> | undefined;
    if (url.searchParams.get('attrib') === '1') {
        // 시험 호출(ai-ab) 지출 — 호출 기록 밖이라 따로 센다. tag 는 요청 본문의 tag(없으면 untagged)
        const tLines: string[] = [];
        const hourIds: string[] = [];
        for (let h = 0; h < hours; h++) hourIds.push(hourOf(now - h * 3600_000));
        const parts = await Promise.all(hourIds.map((hid) => upstashStore.lrange(testCallsKey(hid), 0, -1)));
        for (const p of parts) tLines.push(...p);
        const test = sumTestSpend(tLines, sinceMs, untilMs);
        const ucCounts: Record<string, number> = { gen: 0, nogen_hit: 0, nogen_miss: 0 };
        const vals = await Promise.all(hourIds.flatMap((hid) => UC_SRC_KINDS.map((k) => upstashStore.get(ucSrcKey(hid, k)).then((v) => [k, Number(v) || 0] as const))));
        for (const [k, n] of vals) ucCounts[k] += n;
        const ledger24 = pacing.decision?.last24hUsd ?? null;
        const r4 = (x: number) => Math.round(x * 10000) / 10000;
        attribution = {
            windowHours: hours,
            note: '원장 증가분(ledgerLast24hUsd, 최근 24시간 환산) = 호출 기록 크레딧(trackedCreditUsd) + 시험 호출(testUsd) + 남는 것(unattributedUsd). window 가 24시간일 때만 서로 견준다.',
            ledgerLast24hUsd: ledger24,
            trackedCreditUsd: r4(trackedCreditUsd),
            testUsd: test.usd, testCalls: test.n, testByTag: test.byTag,
            unattributedUsd: ledger24 == null ? null : r4(Math.max(0, ledger24 - trackedCreditUsd - test.usd)),
            uc: { generationsStarted: ucCounts.gen, cacheOnlyServed: ucCounts.nogen_hit, cacheOnlyMissNoGeneration: ucCounts.nogen_miss },
        };
    }
    return NextResponse.json({ ok: true, aiqOff, ...(attribution ? { attribution } : {}), status, pacing: { ...pacing, byPurpose: byPurpose(pacing) }, tracked: TRACKED_PURPOSES, window: { hours, since: sinceMs || null, until: untilMs }, calls: records.length, purposes: summarizeCalls(records), ...(raw ? { raw } : {}) });
}

export async function POST(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (action === 'capture') {
        if (body.on) await upstashStore.setEx(LLM_KEYS.capOn, '1', Math.min(120, Math.max(1, Number(body.hours) || 12)) * 3600);
        else await upstashStore.del(LLM_KEYS.capOn);
        return NextResponse.json({ ok: true, capture: !!body.on });
    }
    if (action === 'kill') {
        const p = body.purposes;
        if (p == null) { await upstashStore.del(LLM_KEYS.off); return NextResponse.json({ ok: true, kill: null }); }
        const val = p === '*' || (Array.isArray(p) && p.includes('*')) ? '*' : JSON.stringify((Array.isArray(p) ? p : [p]).map(String));
        await upstashStore.setEx(LLM_KEYS.off, val, 30 * 24 * 3600);
        return NextResponse.json({ ok: true, kill: val });
    }
    if (action === 'depth-off') {
        const p = body.purposes;
        if (p == null) { await upstashStore.del(LLM_KEYS.depthOff); return NextResponse.json({ ok: true, depthOff: null }); }
        const val = p === '*' || (Array.isArray(p) && p.includes('*')) ? '*' : JSON.stringify((Array.isArray(p) ? p : [p]).map(String));
        await upstashStore.setEx(LLM_KEYS.depthOff, val, 30 * 24 * 3600);
        return NextResponse.json({ ok: true, depthOff: val });
    }
    if (action === 'sonnet-off') {
        if (body.on) await upstashStore.setEx(LLM_KEYS.sonnetOff, '1', 30 * 24 * 3600); else await upstashStore.del(LLM_KEYS.sonnetOff);
        return NextResponse.json({ ok: true, sonnetOff: !!body.on });
    }
    if (action === 'pace-tick') {           // 조절기 판단을 지금 한 번(9분 간격 무시) — 확인·시험용
        const p = await tickPacing(undefined, { force: true });
        return NextResponse.json({ ok: true, pacing: { ...p, byPurpose: byPurpose(p) } });
    }
    if (action === 'pace-reset') {          // 조절기 상태 삭제 → 다음 판단이 level 1 에서 다시 시작
        await upstashStore.del(PACE_STATE_KEY);
        return NextResponse.json({ ok: true });
    }
    if (action === 'aiq-off') {             // 2026-10-12 aiq55 — 새 입력·지시문·가드·인텔 모델 전환을 한 번에 끄기(켜기는 on:false)
        if (body.on) await upstashStore.setEx(AIQ_OFF_KEY, '1', 30 * 24 * 3600); else await upstashStore.del(AIQ_OFF_KEY);
        return NextResponse.json({ ok: true, aiqOff: !!body.on });
    }
    if (action === 'warm-sep') {           // 2026-10-12 — on:false 면 끄기 스위치를 세운다(옛 규칙: 고정 20종목 · 상한 50% · 2라운드)
        if (body.on === false) await upstashStore.setEx(LLM_KEYS.warmSepOff, '1', 30 * 24 * 3600); else await upstashStore.del(LLM_KEYS.warmSepOff);
        return NextResponse.json({ ok: true, warmSeparation: body.on !== false });
    }
    if (action === 'breaker-reset') {
        for (const id of ['a55', 'a55s', 'b55i', 'b55m']) await upstashStore.del(LLM_KEYS.breaker(id));
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
