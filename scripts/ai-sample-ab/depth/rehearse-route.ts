/**
 * 라우트 리허설(크로스섹터) — «진짜 POST /api/intel/cross-sector-brief 핸들러 + 진짜 runLadder»를 금요일 시계·금요일 실데이터로 끝까지 돌린다.
 *   평일 크론(21:50 UTC)이 아니면 운영 응답으로 확인할 수 없는 경로(프롬프트 → 사다리 → 파싱 → keyLevels 출구 필터 → 응답)를 미리 본다.
 *   ① 크레딧 호출은 서버 관리자 raw 통과(요청 본문 그대로) · ② 닫힘 · ③ 현행(Bedrock)은 하네스 fetch 가드가 막는다(① 이 답하면 안 간다)
 *   저장(setInCache)은 하네스가 막는다 — 운영 저장본(postmarket:cross-brief-*)을 덮어쓰지 않는다. 비용은 서버 raw 통과가 월 원장에 센다.
 *   사용: rehearse-route.ts <ENVFILE(전체 운영 env 임시 사본)> [N=3]
 * 출력: 회차마다 응답 상태 · 어느 단이 답했나 · keyLevels(출구 필터 후) · 필터가 제거한 칸 수 — 마지막에 요약 JSON
 */
import { bootHarness, setClock, state, resetCaptured, runRoute, allowPostHosts } from '../core';

const [envFile, nArg] = process.argv.slice(2);
bootHarness({ envFile });
const BASE = 'https://www.signumhq.com';
const FRI_CLOSE = '2026-10-09T21:50:00Z';

(async () => {
    allowPostHosts.push(/(^|\.)signumhq\.com$/);
    const { memoryStore } = await import('@/lib/ai/llmStore');
    const { LadderRungError } = await import('@/lib/ai/llmLadder');
    const secret = process.env.CRON_SECRET || '';
    const store = memoryStore();
    state.realLadderDeps = {
        store,
        anthropicKey: () => 'server-side',
        hasAws: () => false,
        callAnthropic: async (c: { body: Record<string, unknown>; timeoutMs: number }) => {
            const res = await fetch(`${BASE}/api/admin/ai-ab`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: { body: c.body, timeoutMs: c.timeoutMs } }), signal: AbortSignal.timeout(c.timeoutMs + 8000) });
            const j: any = await res.json();
            if (!j.ok) throw new LadderRungError(j.kind || 'network', j.closeSec || 0, String(j.detail || 'fail'));
            return { parsed: j.parsed, modelUsed: String(c.body.model) };
        },
        log: (lv: string, msg: string) => console.error(`   [${lv}] ${msg.slice(0, 160)}`),
    };
    const { POST } = await import('@/app/api/intel/cross-sector-brief/route');
    const warns: string[] = [];
    const origWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.map(String).join(' ')); origWarn(...a); };
    const rounds = Number(nArg) || 3;
    const out: any[] = [];
    for (let i = 0; i < rounds; i++) {
        resetCaptured(); warns.length = 0; setClock(FRI_CLOSE);
        const t0 = Date.now();
        const r = await runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' });
        setClock(null);
        const lv = r.body?.structured?.outlook?.keyLevels;
        const calls: any[] = []; for (const [k, v] of store.data) if (k.startsWith('llm:calls:')) for (const l of v as string[]) calls.push(JSON.parse(l));
        const last = calls[calls.length - 1];
        const row = { round: i + 1, status: r.status, ms: Date.now() - t0, error: r.body?.error, keyLevels: lv, droppedWarn: warns.filter((w) => /keyLevels/.test(w)), macro: String(r.body?.macroSnapshot || '').slice(0, 120), lastCall: last ?? null, blocked: state.blocked.slice(0, 5) };
        console.log(JSON.stringify(row));
        out.push(row);
        state.blocked = [];
    }
    console.log(JSON.stringify({
        rounds, ok: out.filter((x) => x.status === 200).length,
        keyLevelsEmpty: out.filter((x) => Array.isArray(x.keyLevels) && x.keyLevels.length === 0).length,
        keyLevelsFromModelDropped: out.filter((x) => x.droppedWarn.length).length,
        levelsSeen: [...new Set(out.flatMap((x) => (x.keyLevels || []).map((k: any) => `${k.label}=${k.value}`)))],
    }, null, 1));
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
