/**
 * 가디언 번역 대체(GuardianTranslate) — Redis 에 남은 «금요일에 검사를 통과해 저장된 글»을 원본으로, 코드의 번역 경로(translateInsight)가 만드는 요청을 그대로 가로채
 * 현행/5.5 로 비교한다. 대상 언어의 저장본만 «없다»고 답하게 해서 번역 경로로 들어가게 한다(쓰기는 막혀 있다).
 *   run-translate-ab.ts <ENV> <OUTDIR>
 */
import path from 'node:path';
import { bootHarness, state, resetCaptured, readOverrides, type Captured } from './core';
import { runAB, summarize, printSummary, dumpRows } from './ab-lib';

const [envFile, outDir] = process.argv.slice(2);
bootHarness({ envFile });
(async () => {
    const { IntelligenceNode, _setMarketClockForTest } = await import('@/services/guardian/intelligenceNode');
    const { textGate } = await import('@/lib/ai/ladderGates');
    // 번역 호출 라벨이 Translate/ 인 요청만 모은다. 금요일 정규장 시계로(장외면 번역 대신 «대기 문구»로 간다)
    _setMarketClockForTest(() => new Date('2026-10-09T15:00:00Z'));
    // 12시간 TTL 의 생성 저장본(guardian:gemini:v2:*)은 이미 만료됐다 — 같은 글이 72시간 보관되는 «마지막 정상 스냅샷»(guardian:snapshot:lastgood:*)의 판정에 자리표 원본(num.tpl)·기준(num.basis)과 함께 남아 있다.
    //   그것을 생성 저장본의 모양({text, basis, updatedAt})으로 읽어 주고, 번역 대상 언어의 저장본만 «없다»고 답한다.
    const { getFromCache } = await import('@/services/redisClient');
    const lastgood: Record<string, any> = {};
    for (const loc of ['ko', 'en', 'ja']) lastgood[loc] = (await getFromCache<any>(`guardian:snapshot:lastgood:${loc}`))?.verdict;
    const VFIELD: Record<string, string> = { rotation: 'description', reality: 'realityInsight', gamma: 'gammaInsight' };
    const storedOf = (type: string, loc: string): string | null => {
        const v = lastgood[loc]; if (!v) return null;
        const f = VFIELD[type];
        const text = v.num?.tpl?.[f] ?? v[f];
        if (!text) return null;
        return JSON.stringify({ text, basis: v.num?.basis?.[f] ?? null, updatedAt: new Date(Date.now() - 60_000).toISOString() });
    };
    const hide = new Set<string>();
    readOverrides.push((cmd) => {
        if (String(cmd[0]).toUpperCase() !== 'GET') return undefined;
        const m = String(cmd[1]).match(/^guardian:gemini:v2:(rotation|reality|gamma):(ko|en|ja)$/);
        if (!m) return undefined;
        return { value: hide.has(String(cmd[1])) ? null : storedOf(m[1], m[2]) };
    });
    const items: Captured[] = [];
    const types = ['rotation', 'reality', 'gamma'] as const;
    const locs = ['ko', 'en', 'ja'] as const;
    for (const type of types) for (const target of locs) {
        // 원본 후보가 둘(다른 두 언어)이다 — 첫 후보도 숨기면 두 번째 후보가 원본이 된다 → 한 (종류,대상)당 방향 2가지
        const others = locs.filter((l) => l !== target);
        for (let hideFirst = 0; hideFirst < 2; hideFirst++) {
            hide.clear();
            hide.add(`guardian:gemini:v2:${type}:${target}`);
            const order = target === 'ko' ? ['en', 'ja'] : target === 'en' ? ['ko', 'ja'] : ['ko', 'en'];
            if (hideFirst) hide.add(`guardian:gemini:v2:${type}:${order[0]}`);
            void others;
            resetCaptured();
            await IntelligenceNode.recoverInsight(type, target, { translate: true });
            for (const c of state.captured.filter((x) => x.purpose === 'GuardianTranslate')) {
                c.locale = target; c.validate = textGate(target); c.meta = { type, target, from: hideFirst ? order[1] : order[0] };
                items.push(c);
            }
        }
    }
    console.error(`번역 요청 ${items.length}건 가로챔 (종류×대상×방향) — 쓰기 차단 ${state.blocked.length}건`);
    const rows = await runAB(items.slice(0, 18), { rounds: 1, variants: [{ name: 'low-off', effort: 'low', thinking: 'disabled' }, { name: 'low', effort: 'low' }], concurrency: 3, localeOf: (c) => c.locale });
    dumpRows(path.join(outDir, 'ab-GuardianTranslate.json'), rows);
    for (const n of ['low-off', 'low']) console.log(printSummary(summarize(rows, n)));
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
