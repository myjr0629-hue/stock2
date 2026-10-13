/**
 * /api/live/quotes 를 31개 이상 한 요청에 보내도(벌크 스냅샷 경로) 마감·프리·애프터의 price 가 «정규장 종가»인가
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/quotesBulkClose.test.ts
 *
 * 사고(10/13 실측 · Intel 섹터 화면): 운영에서 31종목 한 요청 → NVDA price 224.54(시간외 호가 중간값) · 종목별 요청 226.32(정규장 종가, 정답).
 *   Intel 화면은 섹터 90여 종목을 한 요청으로 5초마다 묻고, 첫 폴링(~10초)이 맞던 값을 224.54 / −2.07% 로 덮어썼다.
 * 외부 통신은 없다(massiveClient·시장 상태·시간외 종가 저장소 대역). 시계는 10/12 21:48 ET(마감 뒤)·10/13 07:30 ET(프리)·10/13 11:00 ET(정규장)로 고정한다.
 */
import assert from 'node:assert/strict';
import { correctBulkSnapshot } from '../src/lib/bulkQuoteClose';

const RealDate = Date;
function setNow(ms: number) {
    class FakeDate extends RealDate {
        constructor(...a: any[]) { if (a.length === 0) super(ms); else super(...(a as [any])); }
        static now() { return ms; }
    }
    (globalThis as any).Date = FakeDate;
}
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => console.log(`  ✓ ${name}`));
const near = (a: any, b: number, eps = 0.0001) => assert.ok(typeof a === 'number' && Math.abs(a - b) < eps, `${a} ≠ ${b}`);

(async () => {
    console.log('━━━ 1. 순수 함수 correctBulkSnapshot ━━━');
    const row = (over: any = {}) => ({ ticker: 'NVDA', day: { c: 224.54, o: 0, h: 0, l: 0, v: 1 }, prevDay: { c: 226.32 }, lastTrade: { p: 224.54, t: 1e18 }, _eodDate: '2026-10-12', _eodClose: 226.32, _eodChg: -2.96, ...over });
    await t('EOD 날짜 = 마지막 정규장 → day.c 는 EOD 종가, prevDay.c 는 종가−등락(그 전 거래일 종가)', () => {
        const r: any = correctBulkSnapshot(row(), '2026-10-12');
        near(r.day.c, 226.32); near(r.prevDay.c, 229.28); near(r.todaysChangePerc, -1.2910, 0.001);
        near(r.lastTrade.p, 224.54);   // 호가 중간값(마지막 체결 자리)은 시간외 칸이 쓴다 — 건드리지 않는다
    });
    await t('EOD 가 아직 그 세션을 못 따라왔으면(날짜 다름) 손대지 않는다', () => {
        const r: any = correctBulkSnapshot(row({ _eodDate: '2026-10-09' }), '2026-10-12');
        near(r.day.c, 224.54);
    });
    await t('EOD 값이 비었거나 모양이 틀리면 손대지 않는다', () => {
        near((correctBulkSnapshot(row({ _eodClose: 0 }), '2026-10-12') as any).day.c, 224.54);
        near((correctBulkSnapshot(row({ _eodChg: NaN }), '2026-10-12') as any).day.c, 224.54);
        near((correctBulkSnapshot(row({ _eodChg: 300 }), '2026-10-12') as any).day.c, 224.54);   // 전일 종가가 음수
        assert.equal(correctBulkSnapshot(null as any, '2026-10-12'), null);
    });

    console.log('━━━ 2. 라우트 전체 — 31종목 한 요청 ━━━');
    const mkTickers = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? 'NVDA' : i === 1 ? 'GOOGL' : `T${i}`));
    const mkRows = (n: number) => mkTickers(n).map((tk) => tk === 'NVDA'
        ? row({ ticker: tk })
        : tk === 'GOOGL' ? row({ ticker: tk, day: { c: 353.33 }, prevDay: { c: 352.72 }, lastTrade: { p: 353.33, t: 1e18 }, _eodClose: 352.72, _eodChg: 1.06 })
            : row({ ticker: tk, day: { c: 50.5 }, prevDay: { c: 50 }, lastTrade: { p: 50.5, t: 1e18 }, _eodClose: 50, _eodChg: 0.2 }));
    const inject = (rel: string, exports: any) => {
        const p = require.resolve(rel);
        (require as any).cache[p] = { id: p, filename: p, loaded: true, children: [], paths: [], exports };
    };
    const runRoute = async (sessionName: 'closed' | 'pre' | 'regular', nowMs: number, nSyms: number) => {
        inject('../src/services/massiveClient', { fetchMassive: async () => ({ tickers: mkRows(nSyms) }) });
        inject('../src/services/marketStatusProvider', { getMarketStatusSSOT: async () => ({ session: sessionName, isHoliday: false }) });
        const realExt = require('../src/services/extendedSessionClose');
        inject('../src/services/extendedSessionClose', { ...realExt, peekExtendedSessionClosesAndWarm: async (need: string[]) => ({ values: need.map(() => undefined), warm: null }), recallProvisionalPreCloses: async (n: string[]) => n.map(() => null), rememberProvisionalPreClose: () => { } });
        inject('../src/services/lastSession', { reconstructLastSession: async () => ({}) });
        delete (require as any).cache[require.resolve('../src/app/api/live/quotes/route')];
        // 10/14: 정규장 31~100개 요청은 가격 허브(실시간 체결)를 부른다 — 이 시험은 «허브 없음(예전 값)» 대역이라 허브 호출을 막는다(진짜 네트워크를 타지 않게). 허브가 있을 때는 tests/hubLiveOverlay.test.ts.
        const realFetch = (globalThis as any).fetch;
        (globalThis as any).fetch = async () => { throw new Error('hub unreachable (test)'); };
        require('../src/lib/hubLiveOverlay').__resetHubBreaker();
        setNow(nowMs);
        const route = require('../src/app/api/live/quotes/route');
        const { NextRequest } = require('next/server');
        const res = await route.GET(new NextRequest(`http://localhost/api/live/quotes?symbols=${mkTickers(nSyms).join(',')}`));
        const j = await res.json();
        (globalThis as any).Date = RealDate;
        (globalThis as any).fetch = realFetch;
        return j;
    };
    const CLOSED_NOW = RealDate.UTC(2026, 9, 13, 1, 48, 0);     // 2026-10-12 21:48 ET
    const PRE_NOW = RealDate.UTC(2026, 9, 13, 11, 30, 0);       // 2026-10-13 07:30 ET
    const REG_NOW = RealDate.UTC(2026, 9, 13, 15, 0, 0);        // 2026-10-13 11:00 ET

    const j1 = await runRoute('closed', CLOSED_NOW, 31);
    await t('마감 뒤 31종목: NVDA price = 정규장 종가 226.32 (예전 224.54) · 전일 종가 229.28 · 등락 −1.29%', () => {
        near(j1.data.NVDA.price, 226.32); near(j1.data.NVDA.previousClose, 229.28); near(j1.data.NVDA.changePercent, -1.2910, 0.001);
    });
    await t('마감 뒤 31종목: GOOGL price 352.72 · +0.30% (예전 353.33 · +0.47%)', () => { near(j1.data.GOOGL.price, 352.72); near(j1.data.GOOGL.changePercent, 0.3014, 0.001); });
    await t('31종목 전부 price = EOD 종가(호가 중간값 50.5 가 아니다)', () => { for (const k of Object.keys(j1.data)) if (/^T\d+$/.test(k)) near(j1.data[k].price, 50); });
    const j0 = await runRoute('closed', CLOSED_NOW, 3);
    await t('(대조) 3종목 요청도 같은 규칙 — 벌크 보정은 31개 미만엔 닿지 않는다(스냅샷에 _eodDate 없음 → 이 대역에선 행이 그대로 온다)', () => { assert.ok(j0.data.NVDA); });

    const j2 = await runRoute('pre', PRE_NOW, 31);
    await t('프리 31종목: price = 마지막 정규장 종가 226.32 · previousClose = 그 하나 앞 229.28(기준선 함정)', () => { near(j2.data.NVDA.price, 226.32); near(j2.data.NVDA.previousClose, 229.28); assert.equal(j2.data.NVDA.session, 'pre'); });

    const j3 = await runRoute('regular', REG_NOW, 31);
    await t('정규장 31종목(허브 없음): 종가 보정은 하지 않는다 — 값은 요청 그대로(허브가 있으면 실시간 체결로 덮는다: hubLiveOverlay.test.ts)', () => { near(j3.data.NVDA.price, 224.54); });

    process.exit(0);
})().catch((e) => { (globalThis as any).Date = RealDate; console.error(e); process.exit(1); });
