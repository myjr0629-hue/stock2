#!/usr/bin/env node
/**
 * audit-field-contract — 화면이 읽는 필드가 API 응답에 «실제로 있는가»
 * ============================================================================
 * 왜 있나 (2026-09-03 실측으로 당한 것):
 *
 *   `/api/command/unified` 이 경로마다 다른 이름으로 같은 값을 담고 있었다.
 *     DynamoDB 경로 → structure.pcRatio
 *     직접 생성 경로 → structure.pcr        ← 이름이 다르다
 *   화면은 `s.pcRatio || ud.options?.pcr || 0` 로 읽는다. 직접 생성 경로에서는
 *   둘 다 없으니 **실제 값 0.69 가 있는데 화면엔 풋콜 비율 0** 이 그려졌다.
 *
 *   에러가 안 난다. 200 OK 다. 숫자도 «있다». 그래서 화면만 봐서는 못 잡는다.
 *   → 화면 코드에서 «읽는 경로»를 뽑아 실제 응답에 그 경로가 있는지 대조한다.
 *
 * 한계(정직하게): 정적 분석이라 동적 접근(obj[key])은 못 잡는다.
 *   그래도 «오타·경로별 이름 불일치» 라는 가장 흔한 유형은 잡는다.
 *
 * 실행: node scripts/audit-field-contract.js
 * ============================================================================
 */
const BASE = process.env.AUDIT_BASE || 'https://www.signumhq.com';

// 화면 파일 → 그 화면이 부르는 엔드포인트 → 응답에서 읽는 경로들.
// 경로는 «화면 코드에 실제로 적힌 접근식»을 그대로 옮긴 것이다.
const CONTRACTS = [
    {
        screen: 'MobileCommandPage (커맨드/모바일)',
        endpoint: '/api/command/unified?t=NVDA',
        reads: [
            ['structure.netGex', 'GEX'],
            ['structure.pcRatio|structure.pcr|options.pcr', '풋콜 비율'],
            ['structure.maxPain', '맥스페인'],
            ['structure.levels.callWall', '콜월'],
            ['structure.levels.putFloor', '풋플로어'],
            ['structure.gammaRegime', '감마 레짐'],
            ['structure.gammaFlipLevel', '감마플립'],
            ['structure.underlyingPrice|_dynamoPrice.price', '기초자산가'],
            ['structure.prevClose', '전일종가'],
            ['structure.session', '세션'],
            ['volatility.iv', 'IV'],
            ['squeeze.score|structure.squeezeScore', '스퀴즈 점수'],
            ['sma', 'SMA 카드'],
            ['earnings', '실적 카드'],
            ['analyst', '애널리스트 카드'],
            ['institutional', '기관 카드'],
            ['fundamentals', '펀더멘털 카드'],
        ],
    },
    {
        screen: 'Flow (플로우)',
        endpoint: '/api/flow/unified?t=NVDA',
        reads: [
            ['liveQuote.price', '현재가'],
            ['liveQuote.prevClose', '전일종가'],
            ['liveQuote.flow.maxPain', '맥스페인'],
            ['liveQuote.flow.callWall', '콜월'],
            ['liveQuote.flow.putFloor', '풋플로어'],
            ['liveQuote.flow.rawChain', '체인'],
            ['liveQuote.flow.allExpiryChain', '전만기 체인'],
            ['liveQuote.flow.dataFreshness.greeks', '그릭스 신선도'],
        ],
    },
    {
        screen: '종목 시세 (live/ticker)',
        endpoint: '/api/live/ticker?t=NVDA',
        reads: [
            ['price', '현재가'], ['prevClose', '전일종가'], ['changePct', '변화율'],
            ['session', '세션'], ['vwap', 'VWAP'],
            ['baseline.value', '기준선'], ['baseline.dateET', '기준선 날짜'],
            ['flow.netPremium', '순프리미엄'],
        ],
    },
    {
        screen: '공매도',
        endpoint: '/api/live/short-squeeze?t=GME',
        reads: [
            ['siPercent', 'SI%'], ['daysToCover', '커버일수'],
            ['shortVolPercent', '장외 공매도'], ['riskScore', '위험점수'],
            ['status', '등급'], ['settlementDate', '정산일'], ['attribution', '출처표기'],
        ],
    },
    {
        screen: '다크풀',
        endpoint: '/api/flow/dark-pool?t=NVDA',
        reads: [
            ['pct', '장외비중'], ['volRatio', '물량배수'], ['shortPct', '장외공매도'],
            ['shortAvg', '평소'], ['regime', '레짐'], ['attribution', '출처표기'],
        ],
    },
    {
        screen: '랭킹',
        endpoint: '/api/ranking/deviation?top=5',
        reads: [
            ['ranking', '순위 배열'], ['universe', '유니버스 크기'],
            ['session', '세션'], ['darkPool.available', '다크풀 가용'],
        ],
    },
];

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// 'a.b|c.d' = 둘 중 하나라도 있으면 통과(화면의 || 폴백을 그대로 반영)
function resolve(obj, spec) {
    for (const alt of spec.split('|')) {
        const v = dig(obj, alt.trim());
        if (v !== undefined && v !== null) return { ok: true, via: alt.trim(), value: v };
    }
    return { ok: false };
}

const brief = (v) => {
    if (Array.isArray(v)) return `배열 ${v.length}`;
    if (typeof v === 'object') return `{${Object.keys(v).slice(0, 3).join(',')}}`;
    return String(v).slice(0, 24);
};

(async () => {
    console.log(`화면-API 필드 계약 검사 · ${BASE}\n`);
    let miss = 0, total = 0;

    for (const c of CONTRACTS) {
        let body = null, err = null;
        try {
            const res = await fetch(`${BASE}${c.endpoint}`, { cache: 'no-store' });
            body = await res.json();
        } catch (e) { err = e.message; }

        console.log(`── ${c.screen}`);
        console.log(`   ${c.endpoint}`);
        if (err || !body) { console.log(`   ✗ 응답 실패: ${err}`); miss += c.reads.length; total += c.reads.length; continue; }

        for (const [spec, label] of c.reads) {
            total++;
            const r = resolve(body, spec);
            if (r.ok) {
                const alt = spec.includes('|') && r.via !== spec.split('|')[0].trim() ? ` (폴백 ${r.via})` : '';
                console.log(`   ✓ ${label.padEnd(14)} ${brief(r.value)}${alt}`);
            } else {
                miss++;
                console.log(`   ✗ ${label.padEnd(14)} 없음 — ${spec}`);
            }
        }
        console.log('');
    }

    // ── 종목 스윕 ────────────────────────────────────────────────────
    // 계약은 «한 종목»으로 확인해도 통과한다. 그런데 2026-09-03 실측에서
    // **AMD 한 종목만** 커맨드 화면이 통째로 비어 있었다(나머지 39/40 정상).
    // 원인은 코드가 아니라 캐시에 굳은 실패였고, NVDA 만 보는 검사로는 영영 못 본다.
    // → 대표 종목을 훑어 «가격이 없는 종목»이 하나라도 있으면 실패로 본다.
    const SWEEP = ('SPY QQQ NVDA TSLA AAPL MSFT AMZN GOOGL META AMD AVGO NFLX PLTR MU INTC ' +
        'COIN MSTR SMCI CRWD SNOW UBER BA GS JPM XOM COST WMT DIS SHOP ABNB TSM ARM DELL ' +
        'ORCL CRM ADBE NOW PANW MRVL DDOG IWM GLD SLV TLT HOOD SOFI RIVN LCID NIO F').split(' ');
    // 화면마다 «다른 엔드포인트»를 본다. 커맨드만 훑으면 플로우가 통째로 죽어도 모른다
    // (2026-09-03 실측: 커맨드 50/50 정상인데 플로우는 40/40 이 빈 화면이었다).
    console.log(`── 종목 스윕 (커맨드 ${SWEEP.length}종목)`);
    const sweepBad = [];
    for (let i = 0; i < SWEEP.length; i += 10) {
        await Promise.all(SWEEP.slice(i, i + 10).map(async (t) => {
            try {
                const r = await fetch(`${BASE}/api/command/unified?t=${t}`, { cache: 'no-store' });
                const b = await r.json();
                const st = b?.structure || {};
                const pcr = st.pcRatio ?? st.pcr;
                if (st.underlyingPrice == null || st.maxPain == null || pcr == null) {
                    sweepBad.push(`${t}(px=${st.underlyingPrice} mp=${st.maxPain} pcr=${pcr})`);
                }
            } catch (e) { sweepBad.push(`${t}(${e.message.slice(0, 30)})`); }
        }));
    }
    total += SWEEP.length;
    miss += sweepBad.length;
    if (sweepBad.length) sweepBad.forEach((x) => console.log(`   ✗ ${x}`));
    else console.log(`   ✓ ${SWEEP.length}종목 전부 가격·맥스페인·풋콜 있음`);
    console.log('');

    console.log(`── 종목 스윕 (플로우 ${SWEEP.length}종목)`);
    const flowBad = [];
    for (let i = 0; i < SWEEP.length; i += 8) {
        await Promise.all(SWEEP.slice(i, i + 8).map(async (t) => {
            try {
                const r = await fetch(`${BASE}/api/flow/unified?t=${t}`, { cache: 'no-store' });
                const b = await r.json();
                const q = b?.liveQuote || {};
                const f = q.flow || {};
                const chain = (f.rawChain || []).length;
                if (q.price == null || f.maxPain == null || chain === 0) {
                    flowBad.push(`${t}(px=${q.price} mp=${f.maxPain} chain=${chain} src=${f.dataSource})`);
                }
            } catch (e) { flowBad.push(`${t}(${e.message.slice(0, 30)})`); }
        }));
    }
    total += SWEEP.length;
    miss += flowBad.length;
    if (flowBad.length) flowBad.forEach((x) => console.log(`   ✗ ${x}`));
    else console.log(`   ✓ ${SWEEP.length}종목 전부 가격·맥스페인·체인 있음`);
    console.log('');

    console.log('─'.repeat(70));
    console.log(`검사 ${total}개 · 누락 ${miss}개`);
    if (miss) { console.log('\n화면이 읽는 자리에 값이 없다. 0 이나 빈 칸으로 그려진다.'); process.exit(1); }
    console.log('★ 화면이 읽는 모든 필드가 응답에 존재한다.');
})();
