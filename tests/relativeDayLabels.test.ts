/**
 * 화면 문구의 «상대 날짜» 수리 시험 (2026-10-03) — 데이터에 실린 세션 날짜로만 요일을 단다
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/relativeDayLabels.test.ts
 *
 * 결함: 대시보드 «어제 새로 깔린 옵션»이 고정 문구였다. 숫자는 묶음 prevDate 세션(포지션이 열린 세션 — b725812cf)의 것이라
 *   토요일(10/3 실측: 묶음 date 10/02 · prevDate 10/01)엔 목요일, 월요일 저녁엔 금요일, 휴장 다음 날엔 그 전 거래일이다.
 *   같은 종류: 다크풀 «전일 마감 기준»·«오늘 물량», 랭킹 «Today 1,234», UC 폴백 «어제 새로 걸린», 해설 «어젯밤 새로 깔린», WIM 공유 문구 «오늘 ±v%».
 * 경계: 월요일 · 휴장 다음 날 · 주말 · ET 자정 근처 · 서머타임 전환 · 보는 사람의 시간대(한국·미국·극단 시간대).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`  ✓ ${name}`); });
const REL_WORDS = /오늘|어제|어젯밤|today|yesterday|overnight|今日|本日|昨日|昨夜/i;
const LOCS = ['ko', 'en', 'ja'] as const;

// 대시보드 «신규 포지션 구축» 키커 틀 — src/app/[locale]/app-view/dash/page.tsx gateCopy.signals.instFlow 와 같은 글자
const KICK = {
  ko: { on: '{d} 새로 깔린 옵션', off: '새로 깔린 옵션' },
  en: { on: 'Options opened {d}', off: 'Newly opened options' },
  ja: { on: '{d}に建てられたオプション', off: '新たに建てられたオプション' },
} as const;

// ── 기관 신규 포지션 서비스(대시보드 카드의 date 원천)를 EC2 프록시 흉내로 돌린다 — tests/whaleOpeningDate 와 같은 방식
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
let rawBundle: any = null;
(globalThis as any).fetch = async (input: any) => {
  const url = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('http://ec2.test/get')) {
    const key = decodeURIComponent(url.split('key=')[1] || '');
    if (key === 'intrinio:options:eod') return json({ result: JSON.stringify(rawBundle) });
    return json({ result: null });
  }
  if (url.startsWith('http://ec2.test/set')) return json({ ok: true });
  throw new Error('unexpected fetch ' + url);
};
const bundleOf = (date: string, prevDate: string) => {
  const b: any = { date, prevDate, tickers: {} as Record<string, any> };
  for (let i = 0; i < 60; i++) b.tickers[`T${i}`] = { top: [{ c: `X${i}C`, k: 100, e: '2099-01-15', t: 'C', v: 900, oi: 900, d: 850 + i, iv: 0.5, dl: 0.5 }] };
  return b;
};

(async () => {
  const S = await import('../src/lib/marketSession');
  const F = await import('../src/services/institutionalFlow');

  console.log('── 1. 공용 라벨 함수 — 날짜 모양이 정확할 때만 요일, 아니면 상대 날짜 없는 문구');
  await t('sessionYmd 는 «YYYY-MM-DD» 만 받는다 — ISO 시각(UTC 앞 10자는 ET 와 하루 어긋날 수 있다)·M/D·빈 값은 null', () => {
    assert.equal(S.sessionYmd('2026-10-01'), '2026-10-01');
    for (const bad of ['2026-10-02T01:30:00Z', '10/1', '20261001', '', null, undefined, 20261001, {}]) assert.equal(S.sessionYmd(bad), null, String(bad));
  });
  await t('withSessionDay — 날짜가 있으면 그 요일, 없으면 fallback(«어제»로 메우지 않는다)', () => {
    assert.equal(S.withSessionDay(KICK.ko.on, '2026-10-01', 'ko', KICK.ko.off), '목요일 새로 깔린 옵션');
    assert.equal(S.withSessionDay(KICK.en.on, '2026-10-01', 'en', KICK.en.off), 'Options opened Thursday');
    assert.equal(S.withSessionDay(KICK.ja.on, '2026-10-01', 'ja', KICK.ja.off), '木曜日に建てられたオプション');
    for (const l of LOCS) {
      assert.equal(S.withSessionDay(KICK[l].on, null, l, KICK[l].off), KICK[l].off);
      assert.equal(S.withSessionDay(KICK[l].on, '2026-10-02T00:00:00Z', l, KICK[l].off), KICK[l].off);
      assert.ok(!REL_WORDS.test(KICK[l].off) && !REL_WORDS.test(KICK[l].on), l);
    }
  });
  await t('closeLabelOr — FINRA 10/2(금) → «10/2(금) 마감 기준» · «Fri 10/2 close» · «10/2(金) 終値», 날짜 없으면 fallback', () => {
    assert.equal(S.closeLabelOr('2026-10-02', 'ko', '마감 기준'), '10/2(금) 마감 기준');
    assert.equal(S.closeLabelOr('2026-10-02', 'en', 'close'), 'Fri 10/2 close');
    assert.equal(S.closeLabelOr('2026-10-02', 'ja', '終値基準'), '10/2(金) 終値');
    assert.equal(S.closeLabelOr(undefined, 'ko', '마감 기준'), '마감 기준');
    assert.equal(S.closeLabelOr('2026-10-02 ', 'en', 'close'), 'close');
  });

  console.log('── 2. 대시보드 키커 — 묶음 → 서비스 date(prevDate) → 요일. 경계마다 «어제»가 아닌 실제 세션');
  const cases: { name: string; date: string; prevDate: string; ko: string; en: string; ja: string; wrongYesterday: string }[] = [
    // 10/3(토) 운영 실측 묶음 그대로 — 레코드 10/02(금) · prevDate 10/01(목). 예전 «어제»(한국·미국 모두 금요일)는 하루 틀렸다
    { name: '주말(토 10/3 실측)', date: '2026-10-02', prevDate: '2026-10-01', ko: '목요일', en: 'Thursday', ja: '木曜日', wrongYesterday: '금요일' },
    // 월요일 저녁 ET 레코드 9/28(월) · prevDate 9/25(금) — «어제»(일요일)는 거래가 없는 날
    { name: '월요일', date: '2026-09-28', prevDate: '2026-09-25', ko: '금요일', en: 'Friday', ja: '金曜日', wrongYesterday: '일요일' },
    // 휴장 다음 날 — 9/7 노동절. 레코드 9/8(화) · prevDate 9/4(금)
    { name: '휴장 다음 날(9/7 노동절)', date: '2026-09-08', prevDate: '2026-09-04', ko: '금요일', en: 'Friday', ja: '金曜日', wrongYesterday: '월요일' },
    // 서머타임 끝(11/1 일) 다음 월요일 — 레코드 11/2(월) · prevDate 10/30(금)
    { name: '서머타임 끝 직후(11/1)', date: '2026-11-02', prevDate: '2026-10-30', ko: '금요일', en: 'Friday', ja: '金曜日', wrongYesterday: '일요일' },
    // 서머타임 시작(3/8 일) 다음 화요일 — 레코드 3/10(화) · prevDate 3/9(월)
    { name: '서머타임 시작 직후(3/8)', date: '2026-03-10', prevDate: '2026-03-09', ko: '월요일', en: 'Monday', ja: '月曜日', wrongYesterday: '' },
  ];
  for (const c of cases) {
    await t(`${c.name}: 묶음 date ${c.date} · prevDate ${c.prevDate} → «${c.ko} 새로 깔린 옵션»`, async () => {
      rawBundle = bundleOf(c.date, c.prevDate);
      const sum = await F.getInstitutionalFlowSummary();
      assert.equal(sum?.date, c.prevDate, '카드 date = 포지션이 열린 세션(prevDate)');
      assert.equal(S.withSessionDay(KICK.ko.on, sum?.date, 'ko', KICK.ko.off), `${c.ko} 새로 깔린 옵션`);
      assert.equal(S.withSessionDay(KICK.en.on, sum?.date, 'en', KICK.en.off), `Options opened ${c.en}`);
      assert.equal(S.withSessionDay(KICK.ja.on, sum?.date, 'ja', KICK.ja.off), `${c.ja}に建てられたオプション`);
      if (c.wrongYesterday) assert.notEqual(S.weekdayName(sum!.date!, 'ko'), c.wrongYesterday);
    });
  }
  await t('묶음에 prevDate 가 없으면 date 가 null → 요일 없는 문구(날짜를 지어내지 않는다)', async () => {
    rawBundle = { ...bundleOf('2026-10-02', '2026-10-01'), prevDate: undefined };
    const sum = await F.getInstitutionalFlowSummary();
    assert.equal(sum?.date, null);
    assert.equal(S.withSessionDay(KICK.ko.on, sum?.date, 'ko', KICK.ko.off), '새로 깔린 옵션');
  });

  console.log('── 3. ET 자정 근처·보는 사람의 시간대 — 라벨은 «데이터의 달력 날짜»만 본다(시계를 보지 않는다)');
  await t('같은 날짜 2026-10-02 는 서울·뉴욕·LA·UTC+14·UTC−11 어디서 렌더해도 «금요일»', () => {
    const before = process.env.TZ;
    for (const tz of ['Asia/Seoul', 'America/New_York', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
      process.env.TZ = tz;
      assert.equal(S.withSessionDay('{d}', '2026-10-02', 'ko', 'x'), '금요일', tz);
      assert.equal(S.closeLabelOr('2026-10-02', 'en', 'x'), 'Fri 10/2 close', tz);
    }
    process.env.TZ = before;
  });
  // WIM 공유 문구는 화면 헤드라인과 같은 sx() — «세트 날짜 == ET 오늘»이면 «오늘», 아니면 그 요일(wim/page.tsx etTodayStr 와 같은 포매터)
  const etToday = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
  const sx = (setDay: string, ms: number) => (setDay === etToday(ms) ? '오늘' : S.weekdayName(setDay, 'ko'));
  await t('ET 자정 — 세트 10/2(금): 금 23:59 ET 은 «오늘», 토 00:01 ET(한국 토 13:01)은 «금요일»', () => {
    assert.equal(sx('2026-10-02', Date.UTC(2026, 9, 3, 3, 59)), '오늘');      // 10/2 23:59 EDT
    assert.equal(sx('2026-10-02', Date.UTC(2026, 9, 3, 4, 1)), '금요일');     // 10/3 00:01 EDT
    assert.equal(S.etClock(Date.UTC(2026, 9, 3, 4, 1)).date, '2026-10-03');
  });
  await t('서머타임 끝(11/1) 자정 — 세트 10/30(금): 토 10/31 23:59 EDT 도, 일 11/1 00:01 EDT 도 «금요일»(ET 날짜가 정확히 자정에 넘어간다)', () => {
    assert.equal(etToday(Date.UTC(2026, 10, 1, 3, 59)), '2026-10-31');
    assert.equal(etToday(Date.UTC(2026, 10, 1, 4, 1)), '2026-11-01');
    assert.equal(sx('2026-10-30', Date.UTC(2026, 10, 1, 4, 1)), '금요일');
    // 12월(EST, UTC−5) 자정 — 05:00Z 가 경계
    assert.equal(etToday(Date.UTC(2026, 11, 5, 4, 59)), '2026-12-04');
    assert.equal(etToday(Date.UTC(2026, 11, 5, 5, 1)), '2026-12-05');
  });
  await t('서머타임 시작(3/8) — 월 3/9 23:59 EDT 는 세트 3/9 «오늘», 화 00:01 EDT 는 «월요일»', () => {
    assert.equal(sx('2026-03-09', Date.UTC(2026, 2, 10, 3, 59)), '오늘');
    assert.equal(sx('2026-03-09', Date.UTC(2026, 2, 10, 4, 1)), '월요일');
  });

  console.log('── 4. 다크풀 판독 — «오늘/today/本日» 대신 «그날·that day·当日»(그 세션의 요일은 출처 줄이 단다)');
  const { readDarkPool } = await import('../src/lib/darkPoolRead');
  const base = { pct: 40, marketAvg: 45, volRatio: 1.0, shortPct: 48, shortAvg: 48, shortDev: 0, regime: 'NEUTRAL' as const };
  const branches: Record<string, any> = {
    quiet: { ...base, volRatio: 0.5 },
    gapHigh: { ...base, pct: 70, marketAvg: 45 },
    gapLow: { ...base, pct: 20, marketAvg: 45 },
    allNormal: { ...base },
    surgeLow: { ...base, volRatio: 2.0, regime: 'ACCUMULATION' },
    surgeHigh: { ...base, volRatio: 2.0, regime: 'DISTRIBUTION' },
    absorb: { ...base, volRatio: 2.0, regime: 'ACCUMULATION', changePct: -3 },
    shortHigh: { ...base, regime: 'DISTRIBUTION' },
  };
  await t('모든 갈래 × 3개 언어 × (날짜 있음/없음) — 문장에 상대 날짜가 하나도 없다', () => {
    for (const [k, inp] of Object.entries(branches)) for (const l of LOCS) for (const date of ['2026-10-02', null]) {
      const r = readDarkPool({ ...inp, date }, l);
      assert.ok(!REL_WORDS.test(r.headline + ' ' + r.detail), `${k} ${l} ${date}: ${r.headline} / ${r.detail}`);
    }
  });
  await t('평범 — «그날은 특별히…» · «Nothing unusual to read that day.» · «当日は特に…»(요일·날짜는 카드 아래 출처 줄 closeLabel 이 단다)', () => {
    assert.match(readDarkPool({ ...branches.allNormal, date: '2026-10-02' }, 'ko').detail, /그날은 특별히 읽어 낼 것이 없습니다\.$/);
    assert.match(readDarkPool({ ...branches.allNormal, date: '2026-10-02' }, 'en').detail, /Nothing unusual to read that day\.$/);
    assert.match(readDarkPool({ ...branches.allNormal, date: '2026-10-02' }, 'ja').detail, /当日は特に読み取るものはありません。$/);
  });
  await t('비중 높음 — «다만 그날 물량… 그날 무슨 일이» · «That day\'s size … happened that day» · «当日の出来高…当日何か»', () => {
    assert.match(readDarkPool({ ...branches.gapHigh, date: '2026-10-02' }, 'ko').detail, /다만 그날 물량 자체는 평소 수준이라, «비중이 높다»는 사실만으로 그날 무슨 일이 있었다고/);
    assert.match(readDarkPool({ ...branches.gapHigh, date: '2026-10-02' }, 'en').detail, /That day's size was normal, though, so the elevated share alone does not say something happened that day\./);
    assert.match(readDarkPool({ ...branches.gapHigh, date: '2026-10-02' }, 'ja').detail, /ただし当日の出来高自体は平常水準で、比率の高さだけで当日何かがあったとは読めません。/);
  });
  await t('비중 낮음·한산 — «그날은 참여가 적었습니다» · «当日は大口の参加が少なかった» · «quiet in this name that day»', () => {
    assert.match(readDarkPool({ ...branches.gapLow, date: null }, 'ko').detail, /그날은 참여가 적었습니다/);
    assert.match(readDarkPool({ ...branches.gapLow, date: null }, 'ja').detail, /当日は大口の参加が少なかった/);
    assert.match(readDarkPool({ ...branches.quiet, date: null }, 'en').detail, /quiet in this name that day\./);
  });
  await t('★ ko·ja 는 바꾼 낱말이 원래 낱말과 같은 글자 수 — 펼친 해석의 줄바꿈이 그대로(오늘→그날 · 今日/本日→当日)', () => {
    // 360px ko 미리보기 실측: 요일(«금요일은»)로 쓰면 펼친 카드 260.48 → 277.53px(한 줄 증가) — 같은 폭 낱말로 막는다
    const oldKo = '기관이 굳이 숨길 필요가 없었거나, 오늘은 참여가 적었습니다.';
    const newKo = readDarkPool({ ...branches.gapLow, date: '2026-10-02' }, 'ko').detail.match(/기관이 굳이[^.]*\./)![0];
    assert.equal([...newKo].length, [...oldKo].length, newKo);
    const oldJa = '隠す必要がなかったか、今日は大口の参加が少なかったかです。';
    const newJa = readDarkPool({ ...branches.gapLow, date: '2026-10-02' }, 'ja').detail.match(/隠す必要[^。]*。/)![0];
    assert.equal([...newJa].length, [...oldJa].length, newJa);
  });

  console.log('── 5. 웹 랭킹 값 한 줄 — «Today» 자리에 그 값의 세션 요일');
  const { describeItem } = await import('../src/lib/rankings/present');
  const it = { ticker: 'NVDA', ratio: 2.2, today: 1234, baseline: 561, date: '2026-10-02' };
  await t('마감 후 블록(session 10/2) → «금요일 1,234 · 평소 561 · 평소 대비 2.2x»', () => {
    assert.equal(describeItem(it, 'ko', '2026-10-02'), '금요일 1,234 · 평소 561 · 평소 대비 2.2x');
    assert.equal(describeItem(it, 'en', '2026-10-02'), 'Friday 1,234 · Usual 561 · vs usual 2.2x');
    assert.equal(describeItem(it, 'ja', '2026-10-02'), '金曜日 1,234 · 平常 561 · 平常比 2.2x');
  });
  await t('장중 블록(session 없음)은 행 date(토요일 실측 deviation = 10/2) → «금요일»', () => {
    assert.equal(describeItem(it, 'en', undefined), 'Friday 1,234 · Usual 561 · vs usual 2.2x');
  });
  await t('날짜가 하나도 없을 때만 예전 «오늘»(지금 값) · 비율 아닌 행은 그대로', () => {
    assert.equal(describeItem({ ...it, date: undefined }, 'ko'), '오늘 1,234 · 평소 561 · 평소 대비 2.2x');
    assert.equal(describeItem({ ticker: 'X', gapPct: 3.1 }, 'ko', '2026-10-02'), '+3.1%');
  });

  console.log('── 6. UC 사실 문장 — 날짜가 없으면 «어제» 대신 «최근 세션»(프롬프트 «in the latest session»과 같은 말)');
  const { moneyFallback } = await import('../src/app/api/undercurrent/shared');
  await t('날짜 없음 → «최근 세션 상승 쪽에…» · «直近のセッションは上昇方向に…» / 날짜 있음 → 그 요일(그대로)', () => {
    assert.equal(moneyFallback('ko', { newOiNotional: 3.3e9, newOiSide: 'call' }), '최근 세션 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다.');
    assert.equal(moneyFallback('ja', { newOiNotional: 3.3e9, newOiSide: 'put' }), '直近のセッションは下落方向に約33億ドル相当の新規ポジションが開かれました。');
    assert.equal(moneyFallback('ko', { newOiNotional: 3.3e9, newOiSide: 'call', optionsDate: '2026-10-01' }), '목요일 상승 쪽에 약 33억 달러 규모의 새 포지션이 열렸다.');
  });

  console.log('── 7. 해설집·화면 원문에 옛 상대 날짜 문구가 남지 않았다(회귀 막이)');
  const { METRIC_GLOSSARY } = await import('../src/components/app/metricGlossary');
  await t('해설 «신규 포지션 구축»·«다크풀» — 어젯밤/overnight/昨夜 · 전일/prior close/前日 없음', () => {
    for (const l of LOCS) {
      const np = (METRIC_GLOSSARY as any).newPositioning.body[l] as string;
      const dp = (METRIC_GLOSSARY as any).darkPool.body[l] as string;
      assert.ok(!REL_WORDS.test(np), `newPositioning ${l}: ${np.slice(0, 40)}`);
      assert.ok(!/전일|prior close|前日|today/.test(dp), `darkPool ${l}`);
    }
  });
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const gone: [string, string[]][] = [
    ['src/app/[locale]/app-view/dash/page.tsx', ['어제 새로 깔린', 'Options opened yesterday', '昨日建てられた', '어제 시장이 깔아둔', 'set up yesterday', '昨日、市場が']],
    ['src/app/[locale]/app-view/flow/page.tsx', ["'전일 마감 기준', 'Prior close'"]],
    ['src/app/[locale]/app-view/cmd/page.tsx', ['출처 FINRA · 전일 마감 기준']],
    ['src/app/[locale]/flow/[ticker]/page.tsx', ['출처 FINRA · 전일 마감 기준']],
    ['src/app/[locale]/undercurrent/page.tsx', ['어제 새로 걸린', 'opened yesterday', '昨日新たに', '어제는 두드러진', 'positions yesterday', '昨日は目立った']],
    // (옛 «문자열» 그대로 — 원래 있던 코드 주석 «concept ON today's real chart» 는 화면 문구가 아니라 대상이 아니다)
    ['src/app/[locale]/wim/page.tsx', ["'오늘 세션을 되감아 단서 찾기'", "\"Rewind today's session in Replay\"", "'リプレイで今日のセッションを巻き戻す'",
      "\"Today's real session\"", "'本日の実セッション'", "'오늘 실제 차트 위에서 보기'", "\"See it on today's real chart\"", "'今日の実チャートで見る'",
      "'오늘 지표, 위였을까 아래였을까'", "\"Was today's reading higher or lower?\"", "'오늘 이 종목의 하루를 한 줄로 하면?'", "'오늘의 실측'", "'Today, measured'",
      'text={`${t.heroHeadline.replace']],
    ['src/lib/seo/concepts.ts', ['what was built yesterday', '«어제» 쌓인', '「昨日」積まれた']],
  ];
  await t('★ WIM ko·ja 새 문구는 옛 문구와 같은 글자 수 — 트랙·플레이 카드 줄바꿈이 그대로(ko 375px 트랙 카드 147.5→133.5 실측 뒤 조정)', () => {
    const w = read('src/app/[locale]/wim/page.tsx');
    const pairs: [string, string][] = [
      ['다음: 리플레이로 오늘 세션 되감기', '다음: 리플레이로 최근 세션 되감기'], ['리플레이로 오늘 세션 되감기', '리플레이로 최근 세션 되감기'],
      ['오늘 세션을 되감아 단서 찾기', '최근 세션을 되감아 단서 찾기'], ['오늘 지표, 위였을까 아래였을까', '최근 지표, 위였을까 아래였을까'],
      ['오늘 이 종목의 하루를 한 줄로 하면?', '이 종목의 그날 하루를 한 줄로 하면?'], ['오늘 실제 차트 위에서 보기', '최근 실제 차트 위에서 보기'],
      ['次: リプレイで今日のセッションを巻き戻す', '次: リプレイで直近のセッションを巻き戻す'], ['リプレイで今日のセッションを巻き戻す', 'リプレイで直近のセッションを巻き戻す'],
      ['今日の指標、上だった？下だった？', '直近の指標、上だった？下だった？'], ['今日の実チャートで見る', '直近の実チャートで見る'], ['本日の実セッション', '直近の実セッション'],
    ];
    for (const [o, nw] of pairs) {
      assert.equal([...nw].length, [...o].length, `${o} → ${nw}`);
      assert.ok(w.includes(`'${nw}'`), `WIM 에 «${nw}» 가 없다`);
    }
  });
  await t('옛 문구 0건 — 대시·Flow·CMD·웹 티커·UC·WIM·개념 페이지', () => {
    for (const [f, olds] of gone) {
      const src = read(f);
      for (const o of olds) assert.ok(!src.includes(o), `${f} 에 «${o}» 가 남아 있다`);
    }
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
