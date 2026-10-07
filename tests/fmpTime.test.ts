/**
 * FMP 뉴스 시각 = «뉴욕 벽시계» 시험 — src/lib/fmpTime.ts · src/services/fmpNewsAdapter.ts · Lambda 어댑터 사본 5곳
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/fmpTime.test.ts
 *
 * 출발점(2026-09-30 운영 종목 뉴스 MU): 앱 표시 12:45:12Z ↔ 같은 기사 야후 RSS 16:45:12 +0000(247wallst 원문과 같음).
 *   FMP publishedDate "2026-09-29 12:45:12" 에 «Z» 를 붙여 모든 FMP 기사가 정확히 240분 늙게 나왔다.
 *   서머타임이 끝나는 11/1 뒤(EST)엔 차이가 300분이 된다 — 두 계절을 모두 고정한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fmpEtToMs, fmpEtToIso } from '../src/lib/fmpTime';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const iso = (s: string) => new Date(s).toISOString();

console.log('━━━ 1. 9/29 운영 실측 3건 — 원문(시간대 명시) 시각과 초 단위까지 같다 ━━━');
t('247wallst «JPMorgan Sees Micron…» FMP 12:45:12 → 16:45:12Z (야후 RSS 16:45:12 +0000)', () => {
    assert.equal(fmpEtToIso('2026-09-29 12:45:12'), iso('2026-09-29T16:45:12Z'));
});
t('247wallst «SK Hynix Climbs 3%…» FMP 12:58:47 → 16:58:47Z', () => {
    assert.equal(fmpEtToIso('2026-09-29 12:58:47'), iso('2026-09-29T16:58:47Z'));
});
t('Benzinga «Micron Q4 Preview…» FMP 14:08:58 → 18:08:58Z (구글 18:08:58 GMT)', () => {
    assert.equal(fmpEtToIso('2026-09-29 14:08:58'), iso('2026-09-29T18:08:58Z'));
});

console.log('━━━ 2. 서머타임 두 계절 ━━━');
t('EDT(9월) = +4h', () => assert.equal(fmpEtToIso('2026-09-30 09:30:00'), iso('2026-09-30T13:30:00Z')));
t('EST(11/2, 서머타임 종료 뒤) = +5h', () => assert.equal(fmpEtToIso('2026-11-02 09:30:00'), iso('2026-11-02T14:30:00Z')));
t('EST(12월·1월) = +5h', () => {
    assert.equal(fmpEtToIso('2026-12-15 16:05:00'), iso('2026-12-15T21:05:00Z'));
    assert.equal(fmpEtToIso('2027-01-04 08:00:00'), iso('2027-01-04T13:00:00Z'));
});
t('11/1 서머타임 종료 당일: 00:30(EDT)=04:30Z · 03:00(EST)=08:00Z', () => {
    assert.equal(fmpEtToIso('2026-11-01 00:30:00'), iso('2026-11-01T04:30:00Z'));
    assert.equal(fmpEtToIso('2026-11-01 03:00:00'), iso('2026-11-01T08:00:00Z'));
});
t('3/8 서머타임 시작 당일: 01:30(EST)=06:30Z · 03:30(EDT)=07:30Z', () => {
    assert.equal(fmpEtToIso('2026-03-08 01:30:00'), iso('2026-03-08T06:30:00Z'));
    assert.equal(fmpEtToIso('2026-03-08 03:30:00'), iso('2026-03-08T07:30:00Z'));
});
t('시간대가 적힌 문자열은 그대로 믿는다(Z·+00:00)', () => {
    assert.equal(fmpEtToIso('2026-09-29T18:49:11Z'), iso('2026-09-29T18:49:11Z'));
    assert.equal(fmpEtToIso('2026-09-29T14:49:11-04:00'), iso('2026-09-29T18:49:11Z'));
});
t('T 로 이은 벽시계도 뉴욕 시각이다', () => assert.equal(fmpEtToIso('2026-09-29T14:49:11'), iso('2026-09-29T18:49:11Z')));
t('해석 불가 → null (지어내지 않는다)', () => {
    assert.equal(fmpEtToMs(''), null);
    assert.equal(fmpEtToMs(null), null);
    assert.equal(fmpEtToMs('not a date'), null);
});

console.log('━━━ 3. Lambda 어댑터 사본 5곳의 _fmpIso 가 앱(fmpEtToIso)과 같은 답을 낸다 ━━━');
const LAMBDA = [
    'harvest_lambda/intrinio-adapter.js',
    'scripts/lambda-shared/intrinio-adapter.js',
    'scripts/lambda-harvest/intrinio-adapter.js',
    'scripts/lambda-flow-harvest/intrinio-adapter.js',
    'scripts/lambda-xs/intrinio-adapter.js',
];
const pad = (x: number) => String(x).padStart(2, '0');
// 2026-01-01 ~ 2027-12-31 을 7시간 13분 간격으로 훑는다(서머타임 경계 네 번 포함) — 약 2,400개
const samples: string[] = [];
for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2028, 0, 1); ms += (7 * 60 + 13) * 60_000) {
    const d = new Date(ms);
    samples.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`);
}
for (const rel of LAMBDA) {
    t(`${rel}: 벽시계 ${samples.length}개 전부 일치 + 옛 «Z 붙이기» 흔적 없음`, () => {
        const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        const a = src.indexOf('function _nyOffsetMs'), b = src.indexOf('function _fmpId');
        assert.ok(a > 0 && b > a, '함수 위치');
        const fmpIso = new Function(`${src.slice(a, b)}; return _fmpIso;`)() as (d: string) => string;
        for (const s of samples) {
            // 서머타임 종료일의 «두 번 오는 01시대»는 어느 쪽도 틀리지 않다 — 앱과 같은 쪽을 고르는지만 본다
            assert.equal(fmpIso(s), fmpEtToIso(s), s);
        }
        assert.equal(fmpIso('2026-09-29 12:45:12'), iso('2026-09-29T16:45:12Z'));
        assert.equal(fmpIso('2026-11-02 09:30:00'), iso('2026-11-02T14:30:00Z'));
        assert.ok(!/\.replace\(' ', 'T'\)\}Z`/.test(src), '옛 식이 남아 있다');
    });
}

console.log('━━━ 4. 앱 어댑터(getNewsFromFmp) — 시각·정렬·since 가 같은 해석을 쓴다 ━━━');
(async () => {
    process.env.FMP_API_KEY = 'test-key';   // 모듈이 읽기 전에 — 실제 호출은 아래 가짜 fetch 가 받는다
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    (globalThis as any).fetch = async (url: string) => {
        calls.push(String(url).replace(/apikey=[^&]+/, 'apikey=***'));
        return new Response(JSON.stringify([
            { symbol: 'MU', publishedDate: '2026-09-29 12:45:12', title: 'JPMorgan Sees Micron Positioned for Beat-and-Raise', url: 'https://247wallst.com/a', publisher: '24/7 Wall Street', site: '247wallst.com' },
            { symbol: 'MU', publishedDate: '2026-09-29 14:49:11', title: 'I Sold My Archer Aviation Shares', url: 'https://www.fool.com/b', publisher: 'The Motley Fool', site: 'fool.com' },
            { symbol: 'MU', publishedDate: '2026-09-29 10:00:00', title: 'Older', url: 'https://x.com/c', publisher: 'X', site: 'x.com' },
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
        const { getNewsFromFmp } = require('../src/services/fmpNewsAdapter');
        const r = await getNewsFromFmp({ ticker: 'MU', limit: 10, since: '2026-09-29T14:30:00Z' });
        t('published_utc = 뉴욕 벽시계 해석(+4h) · 최신순', () => {
            assert.deepEqual(r.results.map((x: any) => x.published_utc), [iso('2026-09-29T18:49:11Z'), iso('2026-09-29T16:45:12Z')]);
        });
        t('since(14:30Z) 도 같은 해석 — 10:00 ET(=14:00Z)는 빠지고 12:45 ET(=16:45Z)는 남는다', () => {
            assert.equal(r.results.length, 2);
        });
        t('FMP 종목 뉴스 엔드포인트 한 번', () => {
            assert.equal(calls.length, 1);
            assert.match(calls[0], /news\/stock\?symbols=MU&limit=10/);
        });
    } finally {
        globalThis.fetch = realFetch;
    }
    console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
