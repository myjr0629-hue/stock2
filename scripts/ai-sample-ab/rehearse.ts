/**
 * 리허설 — «진짜 runLadder + 이 브랜치의 LADDER_PURPOSES 설정»으로 라우트를 끝까지 돌린다(저장·게시 없음).
 *   ① 크레딧 호출은 서버(관리자 raw 통과)로 — 요청 본문은 사다리가 만든 그대로
 *   ③ 현행 호출은 라우트의 legacy 그대로(실제 Bedrock Haiku 4.5)
 * 라우트 응답(저장 직전까지의 결과)과 사다리 기록(어느 단이 답했나·가드·시간·비용)을 보여 준다.
 *   rehearse.ts <ENV> <Purpose[,…]> [times]
 */
import { bootHarness, setClock, state, resetCaptured, runRoute, allowPostHosts } from './core';

const [envFile, purposesArg, timesArg] = process.argv.slice(2);
bootHarness({ envFile });
const BASE = 'https://www.signumhq.com';
const FRI_CLOSE = '2026-10-09T21:30:00Z';
const FRI_PRE = '2026-10-09T12:30:00Z';

const routes: Record<string, { clock: string; run: () => Promise<any> }> = {
    SectorHeadlines: { clock: FRI_CLOSE, run: async () => { const { GET } = await import('@/app/api/cron/sector-headlines/route'); return runRoute(GET, `${BASE}/api/cron/sector-headlines`); } },
    EarningsBrief: { clock: FRI_CLOSE, run: async () => { const { GET } = await import('@/app/api/cron/earnings-brief/route'); return runRoute(GET, `${BASE}/api/cron/earnings-brief`); } },
    MorningBriefing: { clock: FRI_PRE, run: async () => { const { POST } = await import('@/app/api/guardian/briefing/generate/route'); return runRoute(POST, `${BASE}/api/guardian/briefing/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }); } },
    // 가디언 3종(순환매·현실·감마) × ko — 라우트가 아니라 GuardianDataHub(unifiedDataStream)가 입력을 조립한다. 금요일 정규장 시각(11:00 ET)으로.
    Guardian: { clock: '2026-10-09T15:00:00Z', run: async () => {
        const { GuardianDataHub } = await import('@/services/guardian/unifiedDataStream');
        const out: any[] = [];
        for (const loc of ['ko', 'en', 'ja'] as const) {
            const snap: any = await GuardianDataHub.getGuardianSnapshot(true, loc);
            out.push({ status: 200, body: { locale: loc, title: snap?.verdict?.title, description: snap?.verdict?.description, realityInsight: snap?.verdict?.realityInsight, gammaInsight: snap?.verdict?.gammaInsight } });
        }
        return out;
    } },
    CrossSector: { clock: FRI_CLOSE, run: async () => { const { POST } = await import('@/app/api/intel/cross-sector-brief/route'); return runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' }); } },
    IntelSnapshot: { clock: FRI_CLOSE, run: async () => { const { POST } = await import('@/app/api/intel/snapshot/route'); const out: any[] = []; for (const sector of ['m7', 'cyber_shield', 'bio_pulse']) out.push(await runRoute(POST, `${BASE}/api/intel/snapshot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sector }) })); return out; } },
};

(async () => {
    const { memoryStore } = await import('@/lib/ai/llmStore');
    const { LADDER_PURPOSES, LadderRungError, A55_MODEL, LLM_KEYS, hourId } = await import('@/lib/ai/llmLadder');
    allowPostHosts.push(/(^|\.)signumhq\.com$/);
    state.allowLLM = true;
    const secret = process.env.CRON_SECRET || '';
    const store = memoryStore();
    state.realLadderDeps = {
        store,
        anthropicKey: () => 'server-side',
        hasAws: () => false,   // ② 는 계정 접근이 닫혀 있다 — 리허설에서도 건너뛴다
        callAnthropic: async (c: { body: Record<string, unknown>; timeoutMs: number }) => {
            const res = await fetch(`${BASE}/api/admin/ai-ab`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: { body: c.body, timeoutMs: c.timeoutMs } }), signal: AbortSignal.timeout(c.timeoutMs + 8000) });
            const j: any = await res.json();
            if (!j.ok) throw new LadderRungError(j.kind || 'network', j.closeSec || 0, j.detail || `HTTP ${res.status}`);
            return { parsed: j.parsed, modelUsed: A55_MODEL };
        },
        allowlist: () => LADDER_PURPOSES,
        log: (lvl: string, msg: string) => console.error(`    [ladder:${lvl}] ${msg.slice(0, 220)}`),
    };
    for (const purpose of purposesArg.split(',')) {
        for (let k = 0; k < (Number(timesArg) || 1); k++) {
            setClock(routes[purpose].clock); resetCaptured();
            const t0 = Date.now();
            const r = await routes[purpose].run();
            setClock(null);
            const arr = Array.isArray(r) ? r : [r];
            for (const x of arr) console.log(`## ${purpose} 라우트 응답 ${x.status}: ${JSON.stringify(x.body).slice(0, Number(process.env.SHOW || 420))}`);
            const lines: string[] = [];
            for (const key of [...(store as any).data.keys()].filter((k: string) => k.startsWith('llm:calls:'))) lines.push(...await store.lrange(key, 0, -1));
            const recs = lines.map((l: string) => JSON.parse(l)).sort((a: any, b: any) => a.t - b.t);
            for (const rec of recs.slice(-8)) console.log(`   기록: 응답단 ${rec.v} 모델 ${rec.m} ${(rec.ms / 1000).toFixed(1)}s 시도 ${rec.tr} 입력 ${rec.i} 출력 ${rec.o} 비용 $${(rec.c || 0).toFixed(5)} 가드 ${rec.g}${rec.gr ? ' (' + rec.gr + ')' : ''}`);
        }
        console.log(`   막은 쓰기: ${state.blocked.length}건 ${[...new Set(state.blocked.map((b) => b.split(' ').slice(0, 2).join(' ')))].slice(0, 5).join(' | ')}`); state.blocked = [];
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
