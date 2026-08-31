#!/usr/bin/env node
// ============================================================================
// audit-screens — 앱의 «모든 화면»을 한 번에 훑는다 (Command 외 전 화면).
//
// 왜 (2026-08-31 대표 지적): 「다른 화면들도 전수조사 해줘」
//   Command 화면만 재다가 프리마켓 기준선·VWAP 버그를 찾았다. 나머지 화면은
//   아무도 안 재고 있었다. 화면마다 소스가 다르므로 화면마다 검사해야 한다.
//
// 검사 항목은 «우리가 실제로 겪은 실패»에서 왔다:
//   · 200 OK 인데 값이 비어 있다        (가디언 RLSI·Breadth 가 0으로 나갔다)
//   · 생산자·소비자 키 불일치로 통째 빈다 (인텔 cloud_fortress vs cloudfortress)
//   · 부호가 뒤집힌다                    (상승률 상위에 하락 종목)
//   · 죽은 값이 신선한 타임스탬프로 나간다
//   · 콜드스타트로 초가 걸린다
//
// 실행: node scripts/audit-screens.js
// ============================================================================
const BASE = process.env.AUDIT_BASE || 'https://www.signumhq.com';
const SLOW_MS = 3000;

const get = async (path) => {
    const t0 = Date.now();
    try {
        const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}_cb=${Date.now()}`, { cache: 'no-store' });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('json')) return { ms: Date.now() - t0, status: res.status, err: `JSON 아님 (${ct.slice(0, 30)})` };
        return { ms: Date.now() - t0, status: res.status, body: await res.json() };
    } catch (e) { return { ms: Date.now() - t0, err: e.message }; }
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const nonEmpty = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;

// ── 화면별 정의 ─────────────────────────────────────────────
// check(body) → 위반 문자열 배열
const SCREENS = [
    {
        screen: 'Dashboard', endpoints: [
            { path: '/api/live/market', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/market/index-close', check: (b) => {
                const rows = Array.isArray(b) ? b : (b?.indices || b?.data || Object.values(b || {}));
                const vals = (Array.isArray(rows) ? rows : []).map((r) => num(r?.price ?? r?.close ?? r?.value)).filter((x) => x != null);
                if (!vals.length) return ['지수 값이 하나도 없다'];
                return vals.some((v) => v <= 0) ? ['0 이하인 지수가 있다'] : [];
            } },
            { path: '/api/market/movers', check: (b) => {
                const bad = [];
                const up = b?.gainers || b?.up || [];
                const dn = b?.losers || b?.down || [];
                if (!up.length && !dn.length) return ['상승·하락 목록이 둘 다 비었다'];
                // 부호가 뒤집히면 «상승률 상위»에 하락 종목이 들어온다
                const wrongUp = up.filter((r) => num(r.changePercent ?? r.changePct) < 0).length;
                const wrongDn = dn.filter((r) => num(r.changePercent ?? r.changePct) > 0).length;
                if (wrongUp) bad.push(`상승 목록에 하락 종목 ${wrongUp}개`);
                if (wrongDn) bad.push(`하락 목록에 상승 종목 ${wrongDn}개`);
                // ⚠️ 페니주는 하루에 두 배도 간다(RDHL 0.661 → 1.43, 바이오 뉴스 · 실측 확인).
                //    100% 만으로 걸면 «정상인데 이상하다»고 매번 시끄럽다.
                //    분할 미반영 같은 «진짜 데이터 오류»만 잡히게 조인다.
                const wild = [...up, ...dn].filter((r) => {
                    const c = Math.abs(num(r.changePercent ?? r.changePct) || 0);
                    const px = num(r.price) || 0;
                    return c > 500 || (px > 10 && c > 100);
                }).length;
                if (wild) bad.push(`설명 안 되는 등락률 ${wild}개`);
                return bad;
            } },
            { path: '/api/market/macro', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/live/premium-metrics?t=NVDA', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
        ]
    },
    {
        screen: 'Guardian', endpoints: [
            { path: '/api/debug/guardian', check: (b) => {
                const bad = [];
                const s = JSON.stringify(b || {});
                if (!nonEmpty(b)) return ['본문이 비었다'];
                // 「200 OK 인데 코어 지표가 0」 — 실제로 겪었다
                for (const k of ['rlsi', 'RLSI', 'breadth', 'marketBreadth']) {
                    const m = s.match(new RegExp(`"${k}":\\s*([-\\d.]+)`));
                    if (m && Number(m[1]) === 0) bad.push(`${k} 가 0`);
                }
                return bad;
            } },
            { path: '/api/guardian/briefing', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/guardian/economic-calendar', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/guardian/fedwatch', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/guardian/news-digest', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
        ]
    },
    {
        screen: 'Flow', endpoints: [
            { path: '/api/flow/dark-pool-trades?ticker=NVDA&limit=10', check: (b) => {
                const items = b?.items || [];
                const bad = [];
                if (b?.darkPoolPercent != null && (b.darkPoolPercent < 0 || b.darkPoolPercent > 100)) bad.push(`다크풀 ${b.darkPoolPercent}%`);
                if (items.some((i) => num(i.price) <= 0)) bad.push('가격이 0 이하인 체결이 있다');
                return bad;
            } },
            { path: '/api/flow/iv-percentile?t=NVDA', check: (b) => {
                const p = num(b?.ivPercentile ?? b?.percentile);
                return p != null && (p < 0 || p > 100) ? [`IV 백분위 ${p}`] : [];
            } },
            { path: '/api/flow/options-eod?t=NVDA', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/command/insider?ticker=NVDA', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
        ]
    },
    {
        screen: 'Intel', endpoints: [
            // 생산자·소비자 키 불일치로 섹터가 통째로 비었던 적이 있다
            ...['m7', 'silicon_core', 'power_matrix', 'bio_pulse', 'cloud_fortress'].map((sec) => ({
                path: `/api/intel/snapshot?sector=${sec}`,
                check: (b) => {
                    if (!nonEmpty(b)) return ['본문이 비었다'];
                    const s = JSON.stringify(b);
                    if (/"tickers":\s*\[\s*\]/.test(s) || /"items":\s*\[\s*\]/.test(s)) return ['종목 목록이 비었다'];
                    return [];
                },
            })),
            { path: '/api/intel/cross-sector-brief', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
        ]
    },
    {
        // 앱 세 개 중 둘. 「우리가 만든 모든 앱」이 대상이다.
        screen: 'Undercurrent', endpoints: [
            { path: '/api/undercurrent/feed?locale=ko', check: (b) => {
                const items = b?.cards || b?.items || b?.feed || [];
                if (!nonEmpty(b)) return ['본문이 비었다'];
                return items.length === 0 ? ['피드가 비었다'] : [];
            } },
            { path: '/api/undercurrent/macro?locale=ko', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/undercurrent/scoreboard', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/undercurrent/price?t=NVDA', check: (b) => {
                const p = num(b?.price ?? b?.data?.price);
                return p != null && p <= 0 ? [`가격 ${p}`] : [];
            } },
            { path: '/api/undercurrent/ticker?t=NVDA', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
        ]
    },
    {
        screen: "Why'd It Move?", endpoints: [
            { path: '/api/wim/today?locale=ko', check: (b) => {
                if (!nonEmpty(b)) return ['본문이 비었다'];
                const s = JSON.stringify(b);
                // 일일 세트는 하루 동안 «불변»이어야 한다 — 비면 홈이 통째로 사라진다
                if (/"items":\s*\[\s*\]/.test(s) || /"questions":\s*\[\s*\]/.test(s)) return ['오늘 세트가 비었다'];
                return [];
            } },
            { path: '/api/wim/stats', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/wim/lab?locale=ko', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
            { path: '/api/live/treasury', check: (b) => nonEmpty(b) ? [] : ['본문이 비었다'] },
        ]
    },
];

(async () => {
    console.log(`화면 전수 검사 · ${BASE}\n`);
    let violations = 0, slow = 0, total = 0;
    for (const { screen, endpoints } of SCREENS) {
        console.log(`── ${screen} ${'─'.repeat(Math.max(0, 46 - screen.length))}`);
        for (const ep of endpoints) {
            total++;
            const r = await get(ep.path);
            const marks = [];
            if (r.err) marks.push(r.err);
            else if (r.status !== 200) marks.push(`HTTP ${r.status}`);
            else if (r.body?.error) marks.push(`error: ${String(JSON.stringify(r.body.error)).slice(0, 60)}`);
            else marks.push(...(ep.check ? ep.check(r.body) : []));
            if (r.ms > SLOW_MS) { marks.push(`느림 ${r.ms}ms`); slow++; }
            const ok = marks.length === 0;
            if (!ok && !(marks.length === 1 && marks[0].startsWith('느림'))) violations++;
            console.log(`  ${ok ? '✓' : '✗'} ${String(r.ms).padStart(5)}ms  ${ep.path.split('?')[0].padEnd(38)} ${marks.join(' · ')}`);
        }
    }
    console.log(`\n${'─'.repeat(60)}`);
    console.log(violations === 0 ? `★ ${total}개 엔드포인트 · 값 이상 없음${slow ? ` (느린 응답 ${slow}건)` : ''}` : `⚠ 값 위반 ${violations}건 · 느린 응답 ${slow}건`);
    process.exit(violations === 0 ? 0 : 1);
})();
