// 시간외 종가 규칙 고정 테스트 — `npx tsx scripts/test-extended-session-close.ts`
//   ① 순수 함수: Form T 판정 · 시간외 창 · 확정 시각 · 화면이 보여주는 정규장 날짜
//   ② 체결 페이지에서 «마지막 Form T» 고르기 (fetch 모의 — 실제 응답 모양: 최신순·제어행·U·같은 밀리초)
//   ③ last-good 병합이 시간외 칸을 되살리지 않는가
// 실측 근거(2026-09-25, 통합 테이프 vs 나스닥 «Consolidated Last Trade»): services/extendedSessionClose.ts 머리말
process.env.INTRINIO_API_KEY = 'test-key';
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra?: unknown) => {
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}`, extra ?? ''); }
};
const et = (date: string, hhmmss: string) => Date.parse(`${date}T${hhmmss}-04:00`); // 9월 = EDT

// ── 가짜 벤더 ──────────────────────────────────────────────────────────
type Row = { timestamp: string; price: number; size: number; condition: string; total_volume: number };
let pages: Row[][] = [];
let vendorCalls = 0;
const iso = (date: string, hhmmssms: string) => new Date(`${date}T${hhmmssms}-04:00`).toISOString().replace('Z', '+00:00');
(globalThis as any).fetch = async (input: any) => {
    const url = String(input);
    if (url.startsWith('http://ec2.test')) {
        return new Response(JSON.stringify({ result: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/trades?')) {
        vendorCalls++;
        const u = new URL(url);
        const idx = Number(u.searchParams.get('next_page') || 0);
        const rows = pages[idx] || [];
        const next = idx + 1 < pages.length ? String(idx + 1) : null;
        return new Response(JSON.stringify({ trades: rows, source: 'utp_delayed', next_page: next }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
};

(async () => {
    const svc = await import('../src/services/extendedSessionClose');
    const cal = await import('../src/lib/marketCalendar');
    const ic = await import('../src/services/intrinioClient');

    console.log('① 순수 함수');
    // UTP(나스닥 상장)·CTA(NYSE·Arca) 조건 코드 — 실측 값 그대로
    t('UTP «@ TI» 는 Form T', ic.isFormTCondition('@ TI'));
    t('UTP «@FTI» 는 Form T', ic.isFormTCondition('@FTI'));
    t('UTP «@ T» 는 Form T', ic.isFormTCondition('@ T'));
    t('CTA «FT» 는 Form T', ic.isFormTCondition('FT'));
    t('CTA «TI» 는 Form T', ic.isFormTCondition('TI'));
    t('정규장 «@  I» 는 아니다', !ic.isFormTCondition('@  I'));
    t('정규장 «@F I» 는 아니다', !ic.isFormTCondition('@F I'));
    t('개장 «@O X» 는 아니다', !ic.isFormTCondition('@O X'));
    t('U(순서 어긋난 늦은 보고)는 제외', !ic.isFormTCondition('@ UI') && !ic.isFormTCondition('U'));
    t('Cboe 제어행 «512» 는 아니다', !ic.isFormTCondition('512'));

    const D = '2026-09-25';
    t('PRE 창: 04:00 체결은 프리', svc.isTradeInExtSession(et(D, '04:00:00'), D, 'pre'));
    t('PRE 창: 09:29:59 체결은 프리', svc.isTradeInExtSession(et(D, '09:29:59'), D, 'pre'));
    t('PRE 창: 09:30 체결은 프리 아님', !svc.isTradeInExtSession(et(D, '09:30:00'), D, 'pre'));
    t('PRE 창: 어제 19:59 애프터는 오늘 프리 아님(지연 피드 04:0x 함정)', !svc.isTradeInExtSession(et('2026-09-24', '19:59:55'), D, 'pre'));
    t('POST 창: 15:59:59 정규장 체결은 애프터 아님(지연 피드 16:0x 함정)', !svc.isTradeInExtSession(et(D, '15:59:59'), D, 'post'));
    t('POST 창: 16:00 이후 체결은 애프터', svc.isTradeInExtSession(et(D, '16:05:00'), D, 'post'));
    t('POST 창: 20:00 이후(야간 거래)는 애프터 아님', !svc.isTradeInExtSession(et(D, '20:00:30'), D, 'post'));
    t('시각 0 은 거짓', !svc.isTradeInExtSession(0, D, 'post'));

    t('프리 종가 확정: 09:46 은 아직', !svc.isExtCloseFinal(D, 'pre', et(D, '09:46:59')));
    t('프리 종가 확정: 09:47 부터', svc.isExtCloseFinal(D, 'pre', et(D, '09:47:00')));
    t('애프터 종가 확정: 20:16 은 아직', !svc.isExtCloseFinal(D, 'post', et(D, '20:16:59')));
    t('애프터 종가 확정: 20:17 부터', svc.isExtCloseFinal(D, 'post', et(D, '20:17:00')));
    t('지난 날짜는 늘 확정', svc.isExtCloseFinal('2026-09-24', 'post', et(D, '05:00:00')));
    t('미래 날짜는 확정 아님', !svc.isExtCloseFinal('2026-09-28', 'pre', et(D, '12:00:00')));

    t('화면 날짜: 금 11:37 → 금', cal.shownRegularSessionDate(et(D, '11:37:00')) === D);
    t('화면 날짜: 금 21:00 → 금', cal.shownRegularSessionDate(et(D, '21:00:00')) === D);
    t('화면 날짜: 토 → 금', cal.shownRegularSessionDate(et('2026-09-26', '12:00:00')) === D);
    t('화면 날짜: 월 05:00(프리) → 금', cal.shownRegularSessionDate(et('2026-09-28', '05:00:00')) === D);
    t('화면 날짜: 화 03:00 → 월', cal.shownRegularSessionDate(et('2026-09-29', '03:00:00')) === '2026-09-28');
    t('화면 날짜: 노동절(월 9/7) 14:00 → 금 9/4', cal.shownRegularSessionDate(et('2026-09-07', '14:00:00')) === '2026-09-04');
    t('화면 날짜: 노동절 다음날 08:00 → 금 9/4', cal.shownRegularSessionDate(et('2026-09-08', '08:00:00')) === '2026-09-04');
    t('직전 거래일: 9/8 → 9/4(노동절·주말 건너뜀)', cal.prevTradingDate('2026-09-08') === '2026-09-04');

    console.log('② 마지막 Form T 고르기 (최신순 페이지)');
    // COST 9/25 개장 경계의 실제 모양: 09:30:00.244 에 늦게 보고된 Form T 440주 $887.53(나스닥 값),
    // 그 앞뒤로 정규장 체결·Cboe 제어행(가격 0, 512)·같은 밀리초 여러 건.
    pages = [[
        { timestamp: iso(D, '09:30:02.968'), price: 886.81, size: 1, condition: '@  I', total_volume: 168967 },
        { timestamp: iso(D, '09:30:00.619'), price: 888, size: 51976, condition: '@O X', total_volume: 160000 },
        { timestamp: iso(D, '09:30:00.300'), price: 0, size: 0, condition: '512', total_volume: 159500 },
        { timestamp: iso(D, '09:30:00.244'), price: 887.53, size: 12, condition: '@ TI', total_volume: 159300 },
        { timestamp: iso(D, '09:30:00.244'), price: 887.53, size: 440, condition: '@ T', total_volume: 159288 },
        { timestamp: iso(D, '09:30:00.214'), price: 887.60, size: 1, condition: '@FTI', total_volume: 158848 },
        { timestamp: iso(D, '09:30:00.100'), price: 891.00, size: 5, condition: '@ UI', total_volume: 158800 },
        { timestamp: iso(D, '09:30:00.000'), price: 887.53, size: 22, condition: '@ TI', total_volume: 158700 },
        { timestamp: iso(D, '09:29:58.518'), price: 888.50, size: 20, condition: '@ TI', total_volume: 158600 },
    ]];
    vendorCalls = 0;
    let r = await ic.getLastExtendedTradeIntrinio('COST', D, '04:00:00', '09:30:03', { pageSize: 5000, maxPages: 3 });
    t('COST: 09:30:00.244 $887.53 (나스닥과 같다)', !!r && r.price === 887.53 && r.time === new Date(`${D}T09:30:00.244-04:00`).toISOString(), r);
    t('COST: 같은 밀리초면 누적거래량 큰 쪽(12주 행)', !!r && r.size === 12, r);
    t('COST: 1콜로 끝난다', vendorCalls === 1, vendorCalls);
    t('«09:30 이전 시각»으로 잘랐다면 888.50 — 이 규칙이 아니다', !!r && r.price !== 888.5);

    // 1페이지가 개장 직후 정규장 체결로만 차 있으면 2페이지로 넘어간다
    pages = [
        [
            { timestamp: iso(D, '09:30:02.900'), price: 225.30, size: 100, condition: '@  ', total_volume: 900000 },
            { timestamp: iso(D, '09:30:01.900'), price: 225.35, size: 10, condition: '@  I', total_volume: 899000 },
        ],
        [
            { timestamp: iso(D, '09:30:01.440'), price: 225.41, size: 245, condition: '@ T', total_volume: 898000 },
            { timestamp: iso(D, '09:29:59.995'), price: 225.13, size: 100, condition: '@ T', total_volume: 897000 },
        ],
    ];
    vendorCalls = 0;
    r = await ic.getLastExtendedTradeIntrinio('NVDA', D, '04:00:00', '09:30:03', { pageSize: 2, maxPages: 3 });
    t('NVDA: 2페이지에서 09:30:01.440 $225.41 (나스닥과 같다)', !!r && r.price === 225.41, r);
    t('NVDA: 2콜', vendorCalls === 2, vendorCalls);

    // 창 안에 Form T 가 없다(얇은 종목) → null(«없음» 확정)
    pages = [[{ timestamp: iso(D, '09:30:01.000'), price: 12.6, size: 100, condition: '@  ', total_volume: 1 }]];
    r = await ic.getLastExtendedTradeIntrinio('THIN', D, '04:00:00', '09:30:03', { pageSize: 5000, maxPages: 3 });
    t('Form T 없음 → null', r === null, r);

    // 페이지 상한에 걸리면 undefined(판정 보류 — 저장하지 않는다)
    pages = [
        [{ timestamp: iso(D, '09:30:02.000'), price: 1, size: 1, condition: '@  ', total_volume: 3 }],
        [{ timestamp: iso(D, '09:30:01.000'), price: 1, size: 1, condition: '@  ', total_volume: 2 }],
        [{ timestamp: iso(D, '09:30:00.500'), price: 1, size: 1, condition: '@ T', total_volume: 1 }],
    ];
    r = await ic.getLastExtendedTradeIntrinio('SPY', D, '04:00:00', '09:30:03', { pageSize: 1, maxPages: 2 });
    t('페이지 상한 → undefined', r === undefined, r);

    console.log('③ last-good 병합');
    const stale = {
        price: 916.49,
        extended: { prePrice: 916.26, postPrice: 898.04, preChangePct: 0.022, postChangePct: 0.0017 },
        prices: { prePrice: 916.26, postPrice: 898.04, prevRegularClose: 896.48, high: 921.6 },
        changesPct: { PRE: 2.21, REG: 2.23, POST: 0.17 },
        flow: { maxPain: 900 },
    };
    const fresh = {
        price: 916.9,
        extended: { prePrice: 887.53, postPrice: null, preChangePct: -0.00998, postChangePct: null, preDate: D, preKind: 'close' },
        prices: { prePrice: 887.53, postPrice: null, prevRegularClose: 896.48, high: null },
        changesPct: { PRE: -1.0, REG: 2.28, POST: null },
        flow: { maxPain: null },
    };
    // route 의 mergeFreshOverStale 와 같은 규칙(스칼라 null 은 옛 값 유지)을 흉내 낸다
    const naive: any = JSON.parse(JSON.stringify(stale));
    for (const [k, v] of Object.entries(fresh)) {
        if (v && typeof v === 'object') { for (const [k2, v2] of Object.entries(v)) if (v2 != null) naive[k][k2] = v2; }
        else if (v != null) naive[k] = v;
    }
    t('(대조) 옛 병합은 어제 POST 898.04 를 되살린다', naive.extended.postPrice === 898.04);
    const out = svc.keepSessionScopedFresh(naive, fresh);
    t('POST 는 이번 계산(null)', out.extended.postPrice === null && out.prices.postPrice === null && out.changesPct.POST === null, out.extended);
    t('PRE 는 이번 계산(887.53)', out.extended.prePrice === 887.53 && out.prices.prePrice === 887.53 && out.changesPct.PRE === -1.0);
    t('다른 칸은 옛 값으로 메운다(high·maxPain)', out.prices.high === 921.6 && out.flow.maxPain === 900);
    t('정규장 칸은 건드리지 않는다(REG)', out.changesPct.REG === 2.28);

    console.log(`\n${pass} 통과 · ${fail} 실패`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
