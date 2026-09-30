/**
 * «다음 실적일» 공용 규칙 — src/lib/earningsDate.ts (2026-09-30 대표 원칙 «같은 지표는 같이 사용»)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsDate.test.ts
 *
 * 지키는 것:
 *   1. 규칙 하나 — FMP 캘린더 날짜 우선, FMP 에 오늘(ET) 이후 행이 없을 때만 Finnhub. 시각·분기·EPS 보충은 «같은 날짜»의 Finnhub 행만.
 *   2. 실측(9/29, 공식 발표 확정 29종목) 중 두 원천이 갈린 7건 — 규칙이 고른 날짜가 공식과 맞은 수 6/7(Finnhub 을 골랐다면 1/7).
 *   3. 오늘(ET) 실적은 «다가오는» 실적 · 지난 행(캐시에 남은 어제 행)은 건너뛴다 · 시각 표기 정리.
 *   4. 카드 덮기(applyNextEarnings) — 웹 티커 SSR·unified 출구·수확본(DynamoDB) 모양 · 캘린더를 못 읽으면 날짜는 그대로 D-n 만 다시 센다.
 *   5. 목록(upcomingEarningsRows — 웹 Intel 섹터 실적 캘린더) — 같은 규칙 · 첫 행 = pickNextEarnings.
 */
import assert from 'node:assert/strict';
import { applyNextEarnings, daysFromEarningsLabel, earningsCountdown, earningsDaysForPrompt, earningsDaysOrNull, earningsWithin, normalizeEarningsHour, pickNextEarnings, upcomingEarningsRows } from '../src/lib/earningsDate';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const TODAY = '2026-09-29';                                         // 실측한 날(ET)
const AT = Date.parse('2026-09-29T14:00:00-04:00');                 // 그날 ET 오후

console.log('━━━ 1. 규칙 하나 — FMP 우선 · 없으면 Finnhub · 보충은 같은 날짜만 ━━━');
t('★ NKE — FMP 10/1 · Finnhub 12/16(분기 건너뜀) → 10/1(fmp) · Finnhub 의 시각·분기·EPS 는 다른 분기 것이라 싣지 않는다', () => {
  const r = pickNextEarnings({
    fmp: [{ date: '2026-10-01', epsEstimate: 0.4332, revenueEstimate: 11.3e9 }],
    finnhub: [{ date: '2026-12-16', hour: 'amc', epsEstimate: 0.61, quarter: 2, year: 2027 }],
  }, TODAY);
  assert.deepEqual(r, { date: '2026-10-01', hour: '', epsEstimate: 0.4332, epsActual: null, revenueEstimate: 11.3e9, quarter: null, year: null, source: 'fmp' });
});
t('MU — 두 원천이 같은 날(9/30)이면 Finnhub 의 시각·분기를 보탠다 · EPS 는 FMP 값이 먼저', () => {
  const r = pickNextEarnings({
    fmp: [{ date: '2026-09-30', hour: '', epsEstimate: 31.72 }],
    finnhub: [{ date: '2026-09-30', hour: 'amc', epsEstimate: 31.16, quarter: 4, year: 2026 }],
  }, TODAY);
  assert.equal(r?.date, '2026-09-30');
  assert.equal(r?.hour, 'amc');
  assert.equal(r?.quarter, 4);
  assert.equal(r?.year, 2026);
  assert.equal(r?.epsEstimate, 31.72, '실적 캘린더 화면과 같은 EPS');
  assert.equal(r?.source, 'fmp');
});
t('FMP 행에 시각이 있으면(캘린더가 채운 임박 12건) 그것이 먼저 — 캘린더 화면과 같은 시각', () => {
  const r = pickNextEarnings({ fmp: [{ date: '2026-10-22', hour: 'amc' }], finnhub: [{ date: '2026-10-22', hour: 'bmo' }] }, TODAY);
  assert.equal(r?.hour, 'amc');
});
t('TSM·ASML — Finnhub 에 미국 행이 없어도(해외 원주만) FMP 날짜로', () => {
  assert.equal(pickNextEarnings({ fmp: [{ date: '2026-10-15' }], finnhub: [] }, TODAY)?.date, '2026-10-15');
  assert.equal(pickNextEarnings({ fmp: [{ date: '2026-10-14' }], finnhub: null }, TODAY)?.source, 'fmp');
});
t('FMP 에 그 종목 행이 없으면(유니버스 밖) Finnhub 날짜 — source finnhub · 시각·분기 그대로', () => {
  const r = pickNextEarnings({ fmp: [], finnhub: [{ date: '2026-11-05', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 1.2 }] }, TODAY);
  assert.deepEqual(r, { date: '2026-11-05', hour: 'bmo', epsEstimate: 1.2, epsActual: null, revenueEstimate: null, quarter: 3, year: 2026, source: 'finnhub' });
});
t('FMP 행이 모두 지난 날짜면 «없음»과 같다 → Finnhub 의 다가오는 날짜', () => {
  const r = pickNextEarnings({ fmp: [{ date: '2026-09-28' }], finnhub: [{ date: '2026-12-17', hour: 'amc' }] }, TODAY);
  assert.equal(r?.date, '2026-12-17');
  assert.equal(r?.source, 'finnhub');
});
t('둘 다 없으면 null(지어내지 않는다) · 날짜 모양이 아닌 행은 버린다', () => {
  assert.equal(pickNextEarnings({ fmp: [], finnhub: [] }, TODAY), null);
  assert.equal(pickNextEarnings({}, TODAY), null);
  assert.equal(pickNextEarnings({ fmp: [{ date: 'TBD' }, { date: null }], finnhub: [{ date: '' }] }, TODAY), null);
});

console.log('━━━ 2. 실측 근거(2026-09-29 · 공식 발표 대조) — 두 원천이 갈린 7건 ━━━');
t('★ 규칙이 고른 날짜 = 공식 6/7 (Finnhub 을 골랐다면 1/7) — KO 한 건은 FMP 가 공지 당일(9/29)을 아직 못 따라갔다', () => {
  // [종목, FMP, Finnhub, 공식] — earn-audit/comparison.md (IR·보도자료 원문 링크는 그 표에)
  const CASES: Array<[string, string, string | null, string]> = [
    ['NKE', '2026-10-01', '2026-12-16', '2026-10-01'],   // Finnhub 분기 건너뜀(+76일)
    ['TMO', '2026-10-21', '2026-10-28', '2026-10-21'],   // Finnhub 추정일 +7
    ['RTX', '2026-10-20', '2026-10-27', '2026-10-20'],   // Finnhub 추정일 +7(9/29 공지)
    ['GE', '2026-10-20', '2026-10-19', '2026-10-20'],    // Finnhub 하루 앞
    ['TSM', '2026-10-15', null, '2026-10-15'],           // Finnhub 미국 행 없음(해외 원주)
    ['ASML', '2026-10-14', null, '2026-10-14'],          // 같은 유형
    ['KO', '2026-10-20', '2026-10-27', '2026-10-27'],    // FMP 추정일 -7(9/29 공지를 아직 반영 못 함)
  ];
  let ruleOk = 0, finnhubOk = 0;
  for (const [tk, fmp, fin, official] of CASES) {
    const r = pickNextEarnings({ fmp: [{ date: fmp }], finnhub: fin ? [{ date: fin }] : [] }, TODAY);
    assert.equal(r?.date, fmp, `${tk}: 규칙은 종목마다 바꾸지 않는다(FMP)`);
    if (r?.date === official) ruleOk++;
    if (fin === official) finnhubOk++;
  }
  assert.equal(ruleOk, 6);
  assert.equal(finnhubOk, 1);
});
t('두 원천이 같은 22건은 규칙과 무관하게 같다 — 예: JPM·GS·WFC 10/13 · PG·UNP·VLO 10/22', () => {
  for (const d of ['2026-10-13', '2026-10-22']) {
    assert.equal(pickNextEarnings({ fmp: [{ date: d }], finnhub: [{ date: d, hour: 'bmo' }] }, TODAY)?.date, d);
  }
});

console.log('━━━ 3. 오늘(ET) · 지난 행 · 시각 표기 ━━━');
t('오늘(ET) 실적은 «다가오는» 실적 — 9/30 당일 ET 밤(한국 오전)에도 9/30', () => {
  assert.equal(pickNextEarnings({ fmp: [{ date: '2026-09-30' }, { date: '2026-12-17' }] }, '2026-09-30')?.date, '2026-09-30');
});
t('캐시(6시간)에 남은 어제 행은 건너뛰고 다음 분기 행 — 예전 칩은 «가장 이른 행»을 골라 어제 것을 잡았다', () => {
  assert.equal(pickNextEarnings({ fmp: [{ date: '2026-09-30' }, { date: '2026-12-17' }] }, '2026-10-01')?.date, '2026-12-17');
});
t('행 순서와 무관하게 가장 이른 날', () => {
  assert.equal(pickNextEarnings({ fmp: [{ date: '2026-12-17' }, { date: '2026-10-02' }, { date: '2026-11-01' }] }, TODAY)?.date, '2026-10-02');
});
t('시각 표기 — bmo/amc/dmh · 문장형(FMP v3) · 모르면 빈 문자열', () => {
  assert.deepEqual(
    ['bmo', 'AMC', 'dmh', 'After Market Close', 'before market open', 'during market hours', '', null, 'xyz'].map(normalizeEarningsHour),
    ['bmo', 'amc', 'dmh', 'amc', 'bmo', 'dmh', '', '', ''],
  );
});
t('D-n·라벨·색 — ET 날짜로(ET 20:30 = 한국 오전에도 D-1)', () => {
  assert.deepEqual(earningsCountdown('2026-09-30', Date.parse('2026-09-29T20:30:00-04:00')), { daysUntilEarnings: 1, daysLabel: 'D-1', color: 'text-rose-400' });
  assert.deepEqual(earningsCountdown('2026-10-06', AT), { daysUntilEarnings: 7, daysLabel: 'D-7', color: 'text-amber-400' });
  assert.deepEqual(earningsCountdown('2026-09-27', AT), { daysUntilEarnings: -2, daysLabel: 'D+2', color: 'text-slate-500' });
  assert.equal(earningsCountdown('TBD', AT), null);
});

console.log('━━━ 4. 카드 덮기 — 웹 티커 SSR·unified 출구(DynamoDB 수확본 = Finnhub) ━━━');
const DYN_NKE = {
  ticker: 'NKE', nextEarningsDate: '2026-12-16', nextDate: '2026-12-16', daysUntilEarnings: 80, daysLabel: 'D-80', hour: 'amc', hourLabel: 'amc',
  epsEstimate: 0.61, quarter: 2, year: 2027, color: 'text-slate-400', hasData: true,
  lastSurprise: { actualEps: 0.14, estimatedEps: 0.11, surprisePct: 27.3, date: '2026-05-31' }, forwardEps: 2.9,
};
t('★ NKE 수확본(12/16 · D-80) → 캘린더 10/1 · D-2 · 다른 분기의 시각·분기·EPS 는 버리고 · 직전 서프라이즈·연간 추정은 그대로', () => {
  const r: any = applyNextEarnings(DYN_NKE, [{ date: '2026-10-01', epsEstimate: 0.4332 }], AT);
  assert.equal(r.nextEarningsDate, '2026-10-01');
  assert.equal(r.nextDate, '2026-10-01', '두 이름 모두 같은 값(웹 대시보드는 nextDate 도 읽는다)');
  assert.equal(r.daysUntilEarnings, 2);
  assert.equal(r.daysLabel, 'D-2');
  assert.equal(r.color, 'text-rose-400');
  assert.equal(r.hourLabel, '');
  assert.equal(r.hour, '');
  assert.equal(r.quarter, null);
  assert.equal(r.year, null);
  assert.equal(r.epsEstimate, 0.4332);
  assert.equal(r.dateSource, 'fmp');
  assert.deepEqual(r.lastSurprise, DYN_NKE.lastSurprise);
  assert.equal(r.forwardEps, 2.9);
  assert.equal(DYN_NKE.nextEarningsDate, '2026-12-16', '원본 카드는 건드리지 않는다');
});
t('같은 날짜면 카드의 시각·분기를 살린다(MU 9/30 amc Q4)', () => {
  const r: any = applyNextEarnings({ nextEarningsDate: '2026-09-30', hourLabel: 'amc', quarter: 4, year: 2026, daysUntilEarnings: 3 }, [{ date: '2026-09-30', hour: '' }], AT);
  assert.equal(r.hourLabel, 'amc');
  assert.equal(r.quarter, 4);
  assert.equal(r.daysUntilEarnings, 1, '저장된 D-3(적던 날 기준)이 아니라 오늘(ET) 기준');
});
t('캘린더를 못 읽으면(null) 카드 날짜 그대로 — D-n·라벨만 오늘(ET) 기준으로 다시 센다', () => {
  const r: any = applyNextEarnings(DYN_NKE, null, AT);
  assert.equal(r.nextEarningsDate, '2026-12-16');
  assert.equal(r.daysUntilEarnings, 78);
  assert.equal(r.daysLabel, 'D-78');
  assert.equal(r.dateSource, 'finnhub');
});
t('캘린더에 그 종목이 없고 카드 날짜도 지났다 → 날짜 그대로 D+n(지어내지 않는다)', () => {
  const r: any = applyNextEarnings({ nextEarningsDate: '2026-09-25', daysUntilEarnings: 2, daysLabel: 'D-2' }, [], AT);
  assert.equal(r.nextEarningsDate, '2026-09-25');
  assert.equal(r.daysLabel, 'D+4');
});
t('날짜 없던 카드(TBD)도 캘린더에 있으면 채운다 · 카드가 없으면(null) 만들지 않는다', () => {
  const r: any = applyNextEarnings({ nextEarningsDate: null, daysLabel: 'TBD', hasData: false }, [{ date: '2026-10-15' }], AT);
  assert.equal(r.nextEarningsDate, '2026-10-15');
  assert.equal(r.hasData, true);
  assert.equal(applyNextEarnings(null, [{ date: '2026-10-15' }], AT), null);
});

console.log('━━━ 5. 목록(웹 Intel 섹터 실적 캘린더) — 같은 규칙 · 첫 행 = pickNextEarnings ━━━');
t('FMP 행이 있으면 FMP 행 «전부»(두 분기) — 같은 날짜 Finnhub 만 보충 · 첫 행은 pickNextEarnings 와 같다', () => {
  const input = {
    fmp: [{ date: '2026-12-17' }, { date: '2026-09-30' }, { date: '2026-09-28' }],
    finnhub: [{ date: '2026-09-30', hour: 'amc', quarter: 4 }, { date: '2026-12-16', hour: 'amc', quarter: 1 }],
  };
  const rows = upcomingEarningsRows(input, TODAY);
  assert.deepEqual(rows.map((r) => `${r.date}|${r.hour}|${r.quarter}|${r.source}`), ['2026-09-30|amc|4|fmp', '2026-12-17||null|fmp']);
  assert.deepEqual(rows[0], pickNextEarnings(input, TODAY));
});
t('FMP 행이 없으면 Finnhub 행 전부 · 같은 날짜는 한 번만', () => {
  const rows = upcomingEarningsRows({ fmp: [], finnhub: [{ date: '2026-11-05', hour: 'bmo' }, { date: '2026-11-05', hour: 'bmo' }, { date: '2027-02-04' }] }, TODAY);
  assert.deepEqual(rows.map((r) => `${r.date}|${r.source}`), ['2026-11-05|finnhub', '2027-02-04|finnhub']);
});

console.log('━━━ 6. 라벨·남은 날 읽기 — 지난 실적(D+n)·오늘·모름(9/30 배포 점검) ━━━');
t('★ 라벨 부호 — D+2 는 지난 실적(−2) · D-3 은 3 · today 는 0 · 모르면 null(예전 웹 티커는 D+2 를 D-2 로, today 를 «모름»으로 읽었다)', () => {
  assert.deepEqual(['D+2', 'D-3', 'today', 'TODAY', 'D-0', 'TBD', '', null, 'N/A', 'D-12'].map(daysFromEarningsLabel), [-2, 3, 0, 0, 0, null, null, null, null, 12]);
});
t('earningsCountdown 이 만든 라벨을 그대로 되읽는다(왕복)', () => {
  for (const [d, iso] of [[-2, '2026-09-27'], [0, '2026-09-29'], [3, '2026-10-02'], [78, '2026-12-16']] as const) {
    assert.equal(daysFromEarningsLabel(earningsCountdown(iso, AT)!.daysLabel), d);
  }
});
t('★ 남은 날 숫자 — 0(실적 당일)은 0 · 음수 그대로 · null·빈값·글자는 null(예전 `|| 999` 는 당일을 «999일 뒤»로 보냈다)', () => {
  assert.deepEqual([0, -2, 5, '7', null, undefined, '', 'TBD', NaN].map(earningsDaysOrNull), [0, -2, 5, 7, null, null, null, null, null]);
});
t('강조 판정 — 다가오는 실적만(오늘 포함) · 지난 실적·모름(null)은 아니다(예전 null<=3 이 참이라 TBD 카드가 빨갰다)', () => {
  assert.deepEqual([0, 3, 4, -1, null, undefined].map((d) => earningsWithin(d, 3)), [true, true, false, false, false, false]);
  assert.equal(earningsWithin(7, 7), true);
  assert.equal(earningsWithin(8, 7), false);
});

t('★ AI 프롬프트 days_until — 실적 당일은 «0»(예전 `|| \'N/A\'` 는 «N/A») · 지난 실적은 음수 · 모름·예전 999 는 N/A', () => {
  assert.deepEqual([0, 3, -2, null, undefined, 999, 1000, 'TBD'].map(earningsDaysForPrompt), ['0', '3', '-2', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']);
});
t('★ 스냅샷이 보내는 값 — Command·모바일 Command 는 earningsDaysOrNull, 웹 티커는 daysFromEarningsLabel: 실적 당일이 0 으로 간다(예전 999)', () => {
  const unifiedEarnings = { daysUntilEarnings: 0, daysLabel: 'today' };
  assert.equal(earningsDaysOrNull(unifiedEarnings.daysUntilEarnings), 0);
  assert.equal(daysFromEarningsLabel(unifiedEarnings.daysLabel), 0);
  assert.equal(earningsDaysForPrompt(earningsDaysOrNull(unifiedEarnings.daysUntilEarnings)), '0');
  assert.equal(earningsWithin(earningsDaysOrNull(unifiedEarnings.daysUntilEarnings), 3), true, 'AI 갱신 주기도 당일엔 빨라진다');
});

console.log(`\n${n}/${n} 통과`);
