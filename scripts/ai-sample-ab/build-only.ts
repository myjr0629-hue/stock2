/** 입력만 재구성(모델 호출 없음) — build-only.ts <ENVFILE> <Purpose> : 가로챈 요청 수·길이를 보여 준다 */
import { bootHarness, setClock, state, resetCaptured, runRoute } from './core';
const [envFile, purpose] = process.argv.slice(2);
bootHarness({ envFile });
(async () => {
    setClock('2026-10-09T21:30:00Z'); resetCaptured();
    if (purpose === 'IntelSnapshot') {
        const { POST } = await import('@/app/api/intel/snapshot/route');
        for (const sector of ['m7', 'cyber_shield']) {
            const r = await runRoute(POST, 'https://www.signumhq.com/api/intel/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sector }) });
            console.error(sector, r.status, JSON.stringify(r.body).slice(0, 100), 'captured', state.captured.length);
        }
    }
    for (const c of state.captured) console.error(c.purpose, c.system.length, c.userPrompt.length, c.maxTokens, c.userPrompt.slice(0, 160).replace(/\n/g, ' '));
    console.error('blocked', state.blocked.slice(0, 10));
    process.exit(0);
})();
