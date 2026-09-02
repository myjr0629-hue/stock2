#!/usr/bin/env node
/**
 * audit-load-speed — 화면별 로딩 속도를 «콜드/웜» 으로 나눠 잰다.
 * ============================================================================
 * 왜 나눠 재나 (2026-09-03 대표: 「데이터 로딩속도부터 ... 완벽하게 점검」):
 *
 *   한 번만 재면 거짓말이 된다. 실측으로 겪었다 —
 *   같은 엔드포인트가 첫 호출 12,571ms·HTTP 503 이었다가 두 번째엔 438ms 였다.
 *   느린 게 아니라 **콜드스타트**였다. 반대로 캐시가 살아 있을 때만 재면
 *   사용자가 겪는 최악을 못 본다.
 *
 *   그래서 세 가지를 따로 본다:
 *     ① 콜드   — 캐시 우회(_cb) + 첫 호출. 사용자가 처음 열 때
 *     ② 웜     — 연속 3회 중앙값. 이미 데워진 뒤
 *     ③ 편차   — 콜드/웜 배수. 크면 «가끔 느리다»는 민원의 원인이다
 *
 * 기준(실측 경험에서 온 값):
 *   웜 1,000ms 초과 → 느림 · 콜드 5,000ms 초과 → 첫 진입이 아프다
 *   콜드/웜 10배 초과 → 콜드스타트 문제(코드가 아니라 워밍 문제)
 *
 * 실행: node scripts/audit-load-speed.js
 * ============================================================================
 */
const BASE = process.env.AUDIT_BASE || 'https://www.signumhq.com';
const WARM_MS = 1000, COLD_MS = 5000, RATIO = 10;

// 앱이 첫 화면에서 실제로 부르는 것들 — 화면별로 묶는다.
const SCREENS = [
    ['대시보드', [
        '/api/live/market',
        '/api/market/movers',
        '/api/market/macro',
        '/api/live/premium-metrics',
    ]],
    ['커맨드(종목)', [
        '/api/live/ticker?t=NVDA',
        '/api/flow/unified?t=NVDA',
        '/api/command/unified?t=NVDA',
        '/api/live/related?t=NVDA',
        '/api/live/short-squeeze?t=NVDA',
    ]],
    ['플로우', [
        '/api/flow/dark-pool?t=NVDA',
        '/api/flow/iv-percentile?t=NVDA',
        '/api/flow/options-eod?t=NVDA',
    ]],
    ['가디언', [
        '/api/debug/guardian',
        '/api/guardian/briefing',
        '/api/guardian/economic-calendar',
    ]],
    ['인텔', [
        '/api/intel/snapshot?sector=m7',
        '/api/intel/cross-sector-brief',
    ]],
    ['언더커런트', [
        '/api/undercurrent/feed',
        '/api/undercurrent/scoreboard',
        '/api/undercurrent/ticker?t=NVDA',
    ]],
    ['WIM', [
        '/api/wim/today',
        '/api/wim/stats',
    ]],
    ['랭킹', [
        '/api/ranking/deviation?top=5',
    ]],
];

async function hit(path, bust) {
    const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}${bust ? `_cb=${Date.now()}${Math.random()}` : ''}`;
    const t0 = Date.now();
    try {
        const res = await fetch(url, { cache: 'no-store' });
        // 본문을 끝까지 읽어야 «받는 데» 걸린 시간이 나온다. 헤더만 재면 거짓말이다.
        const text = await res.text();
        return { ms: Date.now() - t0, status: res.status, bytes: text.length };
    } catch (e) {
        return { ms: Date.now() - t0, status: 0, err: e.message };
    }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
    console.log(`로딩 속도 검사 · ${BASE}`);
    console.log('  콜드 = 캐시 우회 첫 호출 · 웜 = 연속 3회 중앙값\n');
    const rows = [];

    for (const [screen, paths] of SCREENS) {
        console.log(`── ${screen} ${'─'.repeat(Math.max(0, 44 - screen.length * 2))}`);
        for (const p of paths) {
            const cold = await hit(p, true);
            const warm = [];
            for (let i = 0; i < 3; i++) warm.push((await hit(p, false)).ms);
            const w = median(warm);
            const ratio = w > 0 ? cold.ms / w : 0;

            const flags = [];
            if (cold.status !== 200) flags.push(`HTTP ${cold.status}`);
            if (w > WARM_MS) flags.push('웜 느림');
            if (cold.ms > COLD_MS) flags.push('콜드 느림');
            if (ratio > RATIO && cold.ms > 2000) flags.push('콜드스타트');

            const mark = flags.length ? '✗' : '✓';
            console.log(`  ${mark} 콜드 ${String(cold.ms).padStart(6)}ms · 웜 ${String(w).padStart(5)}ms · ${ratio.toFixed(1)}배 · ${String(Math.round(cold.bytes / 1024) || 0).padStart(4)}KB  ${p.slice(0, 42).padEnd(42)} ${flags.join(', ')}`);
            rows.push({ screen, path: p, cold: cold.ms, warm: w, ratio, bytes: cold.bytes, flags });
        }
    }

    console.log('\n' + '─'.repeat(76));
    const bad = rows.filter((r) => r.flags.length);
    const slowWarm = rows.filter((r) => r.warm > WARM_MS);
    const coldStart = rows.filter((r) => r.ratio > RATIO && r.cold > 2000);
    const heavy = rows.filter((r) => r.bytes > 500 * 1024);

    console.log(`검사 ${rows.length}개 · 문제 ${bad.length}개`);
    if (slowWarm.length) {
        console.log(`\n⚠ 웜 상태에서도 ${WARM_MS}ms 초과 — 코드/쿼리 문제다:`);
        slowWarm.sort((a, b) => b.warm - a.warm).forEach((r) => console.log(`   ${String(r.warm).padStart(6)}ms  ${r.path}`));
    }
    if (coldStart.length) {
        console.log(`\n⚠ 콜드스타트 (콜드가 웜의 ${RATIO}배 초과) — 워밍으로 푸는 문제다:`);
        coldStart.sort((a, b) => b.cold - a.cold).forEach((r) => console.log(`   콜드 ${String(r.cold).padStart(6)}ms / 웜 ${String(r.warm).padStart(5)}ms  ${r.path}`));
    }
    if (heavy.length) {
        console.log(`\n⚠ 응답이 500KB 초과 — 모바일에서 이게 곧 체감 지연이다:`);
        heavy.sort((a, b) => b.bytes - a.bytes).forEach((r) => console.log(`   ${String(Math.round(r.bytes / 1024)).padStart(6)}KB  ${r.path}`));
    }
    if (!bad.length) console.log('★ 전부 기준 이내');
})();
