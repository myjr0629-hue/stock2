/**
 * 실적 캘린더 «관전 포인트» 문구의 숫자 = 표의 숫자 — src/lib/earnings/earningsBrief.ts · 라우트 출구 · 크론 저장 전 검사
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsBrief.test.ts
 *
 * 출발점(2026-10-04 운영 실측, 10/13 카드): C 표 $2.66 / 문구 «Q3 EPS $2.68» · GS $14.44 / «$16.14 EPS» · JNJ $2.78 / $2.88
 *   · BLK $14.25 / $14.28 · MU 12/23 행 $37.94 / 9/23 보고 때 글 $31.16 · COST 12/10 행 $4.89 / «Q4 EPS 6.53»
 *   · NKE $0.39 / $0.44 · SERV 매출 $2M / «$1.6M»(1,655,461 을 내림) — 163행 중 15행
 * 지키는 것:
 *   · 출구: 표 값과 반올림 오차 밖의 금액·EPS·% 가 있는 문구는 그 언어만 빼고 보낸다(회사명은 남긴다)
 *   · {EPS}·{REV} 자리표는 «그 행»의 값을 표와 같은 포맷으로 채운다 · 값이 없으면 내보내지 않는다
 *   · 글은 «티커|보고일»로만 붙는다 — 다른 보고(직전 분기)의 글은 붙지 않는다
 *   · 캐시 적중(메모·Redis) 경로도 같은 검사를 지난다
 *   · 크론: 글자로 박힌 숫자는 저장하지 않는다 · 지금 캘린더에 없는 보고의 글은 버린다 · 같은 티커 두 보고는 다른 배치
 */
import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
const store = new Map<string, { value: unknown; ttl?: number }>();
let calendarForCron: any = null;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '')?.value ?? null });
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}');
    store.set(b.key, { value: b.value, ttl: b.ttl });
    return Response.json({ ok: true });
  }
  if (u.pathname === '/api/market/earnings-calendar') return Response.json(calendarForCron);
  if (u.hostname === 'financialmodelingprep.com') throw new Error('FMP must not be called — calendar is cached');
  return Response.json({});
};

// Bedrock 흉내 — 크론이 모듈을 부르기 «전에» send 를 바꿔 둔다
const bedrockMod = require('@aws-sdk/client-bedrock-runtime');
let modelReply: (tickers: string[]) => any = () => ({});
const modelCalls: string[][] = [];
const modelInputs: string[] = [];
bedrockMod.BedrockRuntimeClient.prototype.send = async function (cmd: any) {
  const userText: string = cmd.input.messages[0].content[0].text;
  const tickers = (userText.match(/Return ALL \d+ tickers: ([^.]+)\./)?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  modelCalls.push(tickers);
  modelInputs.push(userText);
  return { output: { message: { content: [{ text: JSON.stringify(modelReply(tickers)) }] } } };
};

const B = require('../src/lib/earnings/earningsBrief') as typeof import('../src/lib/earnings/earningsBrief');
const { GET } = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
const CRON = require('../src/app/api/cron/earnings-brief/route') as typeof import('../src/app/api/cron/earnings-brief/route');
const CAL = require('../src/services/earningsCalendarService') as typeof import('../src/services/earningsCalendarService');
// 10/8 회사 공지 덮기(lib/earningsConfirmed) — 이 파일은 «벤더 파이프라인»을 시험하므로 목록을 비운다(덮기 자체는 tests/earningsConfirmed.test.ts)
CAL._setConfirmedListsForTest({ confirmed: [], pending: [] });

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

const C = { ticker: 'C', date: '2026-10-13', epsEstimate: 2.66, revenueEstimate: 23699740000, quarter: 3, year: 2026 };
const GS = { ticker: 'GS', date: '2026-10-13', epsEstimate: 14.44, revenueEstimate: 17117400000, quarter: 3, year: 2026 };
const MU = { ticker: 'MU', date: '2026-12-23', epsEstimate: 37.94, revenueEstimate: 61254630000, quarter: null, year: null };
const COST = { ticker: 'COST', date: '2026-12-10', epsEstimate: 4.89, revenueEstimate: 74099440000, quarter: 1, year: 2027 };
const SERV = { ticker: 'SERV', date: '2026-11-11', epsEstimate: -0.69, revenueEstimate: 1655461, quarter: null, year: null };

(async () => {
  console.log('━━━ 1. 10/4 운영 문구 — 표와 다르면 막는다 ━━━');
  await t('C «Q3 EPS $2.68» vs 표 $2.66 → 막힘(ko·en·ja)', () => {
    for (const w of ['순이자마진(NIM)과 신용손실충당금(PCL) 규모; Q3 EPS $2.68은 금리 환경과 신용 비용 추이의 결합 신호',
      'Net interest margin (NIM) and provision for credit losses (PCL); Q3 $2.68 EPS reflects rate environment and credit cost trajectory',
      '純利息マージン(NIM)と信用損失引当金(PCL)；Q3 EPS $2.68は金利環境と信用コスト推移の複合シグナル']) {
      const r = B.checkBriefNumbers(w, C);
      assert.equal(r.ok, false, w);
      assert.match(String(r.reason), /^mismatch:\$2\.68≠\$2\.66/);
    }
  });
  await t('GS «$16.14 EPS» vs 표 $14.44 → 막힘', () => {
    assert.equal(B.checkBriefNumbers('FICC trading revenue and M&A advisory fees; $16.14 EPS gauges investment banking activity recovery', GS).ok, false);
  });
  await t('MU 12/23 행에 9/23 보고 글 «$31.16 EPS» → 막힘', () => {
    assert.equal(B.checkBriefNumbers('DRAM과 NAND 평균판매가(ASP) 추이; $31.16 EPS는 메모리 가격 사이클 정점 또는 재고 정상화 신호', MU).ok, false);
  });
  await t('COST «Q4 EPS 6.53»($ 없음) — 분기도 숫자도 다르다 → 막힘', () => {
    const w = '회원 갱신율과 신규 가입 추이; 순환 회원 수수료 인상이 Q4 EPS 6.53에 반영되는 정도 확인';
    assert.equal(B.checkBriefNumbers(w, COST).ok, false);
    assert.equal(B.checkBriefNumbers(w, { ...COST, quarter: null }).ok, false, '분기를 몰라도 EPS 6.53≠4.89 로 막힌다');
    assert.deepEqual(B.briefFigures(w).map((f) => [f.kind, f.value]), [['eps', 6.53]]);
  });
  await t('맨 소수(AEP «1.98 달성»)도 EPS 로 대조한다', () => {
    assert.equal(B.checkBriefNumbers('규제 요금 인상 승인과 데이터센터 전력 수요; EPS 1.98 달성의 열쇠', { epsEstimate: 1.98 }).ok, true);
    assert.equal(B.checkBriefNumbers('規制料金と電力需要；1.98達成の鍵', { epsEstimate: 2.05 }).ok, false);
  });
  await t('SERV «$1.6M» — 1,655,461 을 내린 값(반올림이면 $1.7M) → 막힘 · $1.7M 은 통과', () => {
    assert.equal(B.checkBriefNumbers('Micro-revenue base ($1.6M) and customer retention', SERV).ok, false);
    assert.equal(B.checkBriefNumbers('Micro-revenue base ($1.7M) and customer retention', SERV).ok, true);
  });
  await t('% 는 표에 없는 숫자 → 막힘(«30%+ growth»)', () => {
    assert.match(String(B.checkBriefNumbers('Net new ARR and 30%+ growth durability', C).reason), /^unverifiable/);
  });

  console.log('━━━ 2. 표와 같은 숫자는 통과 ━━━');
  await t('반올림 일치 — $2.66 · $2.7 · $3 (표 2.66)', () => {
    for (const w of ['EPS $2.66', 'EPS $2.7', 'EPS $3']) assert.equal(B.checkBriefNumbers(w, C).ok, true, w);
  });
  await t('매출 — $23.7B · $23.7 billion · 237억 달러 · 237億ドル (표 23,699,740,000) · 10배(2,370억/億)는 막힘', () => {
    for (const w of ['revenue $23.7B', 'revenue of $23.7 billion', '매출 237억 달러', '売上237億ドル']) assert.equal(B.checkBriefNumbers(w, C).ok, true, w);
    assert.equal(B.checkBriefNumbers('매출 2,370억 달러', C).ok, false, '10배 → 막힘');
    assert.equal(B.checkBriefNumbers('売上2,370億ドル', C).ok, false, '10배 → 막힘');
  });
  await t('음수 EPS — 화면 포맷 «$-0.69» 와 «-$0.69» 둘 다 통과, «$0.69» 는 막힘', () => {
    assert.equal(B.checkBriefNumbers('EPS $-0.69', SERV).ok, true);
    assert.equal(B.checkBriefNumbers('EPS -$0.69', SERV).ok, true);
    assert.equal(B.checkBriefNumbers('EPS $0.69', SERV).ok, false);
  });
  await t('제품명 속 숫자는 세지 않는다 — 737 MAX · 5G · GLP-1 · 5nm · 1.6nm · Auth0 · S&P 500 · 3M · GPT-4.5 · 1取引当たり · «$2.66 M&A»', () => {
    for (const w of ['737 MAX 생산 정상화', '데이터센터/5G 임대', 'GLP-1 製剤', '先端プロセス(5nm以下)', 'A16 1.6nm ramp', 'post-Auth0 synergies',
      'S&P 500 weight', '3M litigation', 'GPT-4.5 workloads', '1取引当たり純収益', 'Q3 EPS']) {
      assert.deepEqual(B.briefFigures(w), [], w);
    }
    assert.deepEqual(B.briefFigures('EPS $2.66 M&A fees').map((f) => f.value), [2.66], 'M&A 의 M 은 단위가 아니다');
  });

  console.log('━━━ 3. 자리표 — 표와 같은 값·같은 포맷 ━━━');
  await t('EPS 부호는 달러 앞에, 매출 형식은 유지한다', () => {
    const epsCases: [number | null, string][] = [[2.66, '$2.66'], [14.44, '$14.44'], [0.3907, '$0.39'], [-0.69, '−$0.69'], [37.94, '$37.94'], [0, '$0.00'], [-0.001, '$0.00'], [null, '—']];
    const oldRev = (v: number | null) => (v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
    for (const [v, expected] of epsCases) assert.equal(B.fmtEpsUsd(v), expected);
    for (const v of [23699740000, 17117400000, 1655461, 7444005000, 999999999, null]) assert.equal(B.fmtRevUsd(v), oldRev(v));
  });
  await t('{EPS}·{REV} → 그 행의 값 · 채운 문구는 검사 통과', () => {
    const f = B.fillBriefNumbers('Q3 EPS {EPS}은 금리 환경 신호; 매출 {REV}', C);
    assert.equal(f, 'Q3 EPS $2.66은 금리 환경 신호; 매출 $23.7B');
    assert.equal(B.checkBriefNumbers(f!, C).ok, true);
    assert.equal(B.fillBriefNumbers('EPS {{eps}} 신호', GS), 'EPS $14.44 신호', '중괄호 두 겹·소문자도 같은 자리표');
  });
  await t('채울 값이 없거나 모르는 자리표 → null(내보내지 않는다)', () => {
    assert.equal(B.fillBriefNumbers('EPS {EPS}', { epsEstimate: null }), null);
    assert.equal(B.fillBriefNumbers('margin {GM}', C), null);
  });
  await t('분기 표기 — 표가 Q3 인데 문구가 Q4 → 막힘 · 표가 분기를 모르면 대조하지 않는다', () => {
    assert.equal(B.checkBriefNumbers('Q4 마진 회복', C).ok, false);
    assert.equal(B.checkBriefNumbers('Q3 마진 회복', C).ok, true);
    assert.equal(B.checkBriefNumbers('第4四半期のマージン', C).ok, false);
    assert.equal(B.checkBriefNumbers('Q4 마진 회복', MU).ok, true);
  });
  await t('저장 전 검사 — 표와 같은 숫자라도 «글자로» 박으면 거절, 자리표만 통과', () => {
    assert.match(String(B.briefDraftOk('EPS $2.66 reflects rate environment and credit cost trajectory', C).reason), /^literal/);
    assert.equal(B.briefDraftOk('NIM and PCL; {EPS} EPS reflects rate environment and credit cost trajectory', C).ok, true);
    assert.equal(B.briefDraftOk('{EPS} EPS reflects …', { epsEstimate: null }).reason, 'token-unfillable');
  });

  console.log('━━━ 4. 행에 붙이기 — 티커|보고일 · 언어별로 뺀다 ━━━');
  const pack = {
    generatedAt: '2026-10-04T00:00:00Z',
    entries: {
      'C|2026-10-13': { ko: { name: '씨티그룹', watch: '순이자마진(NIM)과 PCL; Q3 EPS {EPS}은 금리와 신용 비용의 결합 신호' },
        en: { name: 'Citigroup', watch: 'NIM and PCL; Q3 $2.68 EPS reflects rate environment' },     // 옛 글자 숫자 → 막힘
        ja: { name: 'シティグループ', watch: '純利息マージンとPCL；Q3 EPS {EPS}は金利と信用コストの複合シグナル' } },
      'MU|2026-09-23': { ko: { name: '마이크론', watch: 'DRAM ASP; $31.16 EPS 는 사이클 정점 신호' } },   // 직전 보고의 글
      'GS|2026-10-13': { en: { name: 'Goldman Sachs' }, ko: { name: '골드만삭스', watch: 'FICC 거래 수익; EPS {EPS}는 투자은행 회복 측정' } },
    },
  };
  await t('C: ko·ja 는 표 값($2.66)으로 채워 붙고, en(옛 $2.68)은 빠진다 — 회사명은 남는다', () => {
    const m = B.attachBriefs([C, GS, MU], pack);
    const c = m.rows[0].brief!;
    assert.equal(c.ko!.watch, '순이자마진(NIM)과 PCL; Q3 EPS $2.66은 금리와 신용 비용의 결합 신호');
    assert.equal(c.ja!.watch, '純利息マージンとPCL；Q3 EPS $2.66は金利と信用コストの複合シグナル');
    assert.deepEqual(c.en, { name: 'Citigroup' });
    assert.equal(m.blocked, 1);
    assert.equal(m.rows[1].brief!.ko!.watch, 'FICC 거래 수익; EPS $14.44는 투자은행 회복 측정');
  });
  await t('MU 12/23 행에는 9/23 보고 글이 붙지 않는다', () => {
    const m = B.attachBriefs([C, GS, MU], pack);
    assert.equal((m.rows[2] as any).brief, undefined);
    assert.equal(m.aiCount, 2);
  });

  console.log('━━━ 5. 라우트 출구 — 캐시 적중(Redis·메모)도 같은 검사 ━━━');
  const calPayload = { ok: true, rows: [C, GS, MU, COST], universe: 4, source: 'test', from: '2026-10-03', to: '2027-01-31', generatedAt: new Date().toISOString() };
  store.set(CAL.EARNINGS_CALENDAR_CACHE_KEY, { value: calPayload });
  store.set(B.EARNINGS_BRIEF_KEY, { value: { ...pack, entries: { ...pack.entries,
    'COST|2026-12-10': { en: { name: 'Costco' }, ko: { name: '코스트코', watch: '회원 갱신율; 순환 회원 수수료 인상이 Q4 EPS 6.53에 반영되는 정도' } } } } });
  store.set('earnings:brief:v2', { value: { tickers: { C: { ko: { name: '씨티그룹', watch: 'Q3 EPS $2.68 옛 글' } } } } });
  CAL._resetEarningsCalendarMemo();
  const call = async () => (await GET(new Request('http://localhost/api/market/earnings-calendar'))).json() as Promise<any>;
  await t('Redis 적중: C ko=$2.66 · en 빠짐 · COST(Q4 6.53) 빠짐 · v2 옛 묶음은 읽지 않는다', async () => {
    const j = await call();
    assert.equal(j._cache, 'hit');
    const byT = Object.fromEntries(j.rows.map((r: any) => [r.ticker, r]));
    assert.match(byT.C.brief.ko.watch, /\$2\.66/);
    assert.equal(byT.C.brief.en.watch, undefined);
    assert.equal(byT.COST.brief.ko.watch, undefined);
    assert.equal(byT.COST.brief.ko.name, '코스트코');
    assert.equal(byT.MU.brief, undefined);
    assert.equal(j.aiBlocked, 2);
    for (const r of j.rows) for (const l of ['ko', 'en', 'ja']) {
      const w = r.brief?.[l]?.watch;
      if (w) assert.equal(B.checkBriefNumbers(w, r).ok, true, `${r.ticker}/${l}: ${w}`);
    }
  });
  await t('메모 적중(두 번째 요청)도 같은 결과', async () => {
    const j = await call();
    assert.equal(j.aiBlocked, 2);
    assert.match(j.rows.find((r: any) => r.ticker === 'C').brief.ko.watch, /\$2\.66/);
  });
  await t('긴 해설 전문: ko·en·ja 저장본 → API 응답에서 마지막 문장까지 보존', async () => {
    const long = {
      ko: { name: '씨티그룹', watch: '순이자마진과 신용비용의 변화가 핵심 부문 수익성에 미치는 영향을 확인. '.repeat(20) + '마지막 관전 포인트까지 보존.' },
      en: { name: 'Citigroup', watch: 'Watch net interest margin and credit costs across the core segments. '.repeat(20) + 'Preserve this final observation.' },
      ja: { name: 'シティグループ', watch: '純利息マージンと信用コストが主力部門の収益性に与える影響を確認。'.repeat(20) + '最後の注目点も保持。' },
    };
    const previous = store.get(B.EARNINGS_BRIEF_KEY);
    try {
      store.set(B.EARNINGS_BRIEF_KEY, { value: { entries: { 'C|2026-10-13': long } } });
      const j = await call();
      const brief = j.rows.find((r: any) => r.ticker === 'C').brief;
      for (const lang of ['ko', 'en', 'ja'] as const) assert.equal(brief[lang].watch, long[lang].watch);
    } finally {
      if (previous) store.set(B.EARNINGS_BRIEF_KEY, previous);
      else store.delete(B.EARNINGS_BRIEF_KEY);
    }
  });

  console.log('━━━ 6. 크론 저장 전 검사 ━━━');
  const DOW1 = { ticker: 'DOW', date: '2026-10-22', epsEstimate: 0.12, revenueEstimate: 10e9, quarter: 3, year: 2026, hour: 'bmo' };
  const DOW2 = { ticker: 'DOW', date: '2027-01-28', epsEstimate: 0.2, revenueEstimate: 10.2e9, quarter: 4, year: 2026, hour: 'bmo' };
  calendarForCron = { ok: true, rows: [C, GS, DOW1, DOW2] };
  store.set(B.EARNINGS_BRIEF_KEY, { value: { entries: {
    'GS|2026-10-13': { en: { name: 'Goldman Sachs' }, ko: { name: '골드만삭스', watch: 'FICC 거래 수익; EPS {EPS}는 투자은행 회복 측정' } },
    'MU|2026-09-23': { ko: { name: '마이크론', watch: '지난 보고 글' } },
  } } });
  const good = (tk: string) => ({
    ko: { name: tk, watch: `${tk} 핵심 부문 매출과 마진 동인; EPS ${'{EPS}'}가 구조적 변화를 얼마나 반영하는지 확인` },
    en: { name: ({ C: 'Citigroup', GS: 'Goldman Sachs', DOW: 'Dow' } as Record<string, string>)[tk] || tk, watch: `${tk} core segment revenue and margin drivers; how much of the {EPS} EPS reflects the structural shift` },
    ja: { name: tk, watch: `${tk}の主力部門売上と利益率の要因；EPS {EPS}が構造変化をどこまで反映するか` },
  });
  modelReply = (tickers) => Object.fromEntries(tickers.map((tk) => [tk, tk === 'C'
    ? { ...good(tk), en: { name: 'Citigroup', watch: 'NIM and PCL; Q3 $2.68 EPS reflects rate environment and credit cost trajectory' } }
    : good(tk)]));
  await t('글자 숫자(en $2.68)는 저장 안 함 · 자리표 글은 «티커|보고일»로 저장 · 입력값(for) 기록 · 지난 보고 글은 버림', async () => {
    const res = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'))).json() as any;
    assert.equal(res.success, true);
    const saved = store.get(B.EARNINGS_BRIEF_KEY)!.value as any;
    assert.deepEqual(Object.keys(saved.entries).sort(), ['C|2026-10-13', 'DOW|2026-10-22', 'DOW|2027-01-28', 'GS|2026-10-13']);
    assert.deepEqual(saved.entries['C|2026-10-13'].en, { name: 'Citigroup' }, 'en.watch 는 literal 로 거절, 정식명은 보존');
    assert.ok(saved.entries['C|2026-10-13'].ko.watch.includes('{EPS}'), '저장본은 자리표 그대로');
    assert.deepEqual(saved.entries['C|2026-10-13'].for, { date: '2026-10-13', eps: 2.66, rev: 23699740000, quarter: 3, year: 2026 });
    assert.equal(res.pruned, 1);
    assert.ok(res.rejected.some((x: string) => /^C\/en\(literal/.test(x)), JSON.stringify(res.rejected));
    assert.ok(modelCalls.every((b) => new Set(b).size === b.length), '한 배치에 같은 티커 두 번 금지');
    // ★ [2026-10-12] 이미 있는 보고라도 «언어가 빠졌으면» 빠진 언어만 채운다 — 있는 언어(ko 원문)는 그대로, 시도 횟수 1
    assert.equal(modelCalls.flat().filter((x) => x === 'GS').length, 1, 'GS(ko 만 있음)는 빠진 en·ja 를 채우러 한 번 부른다');
    assert.equal(saved.entries['GS|2026-10-13'].ko.watch, 'FICC 거래 수익; EPS {EPS}는 투자은행 회복 측정', '있던 언어는 덮지 않는다');
    assert.ok(saved.entries['GS|2026-10-13'].en.watch.includes('{EPS}') && saved.entries['GS|2026-10-13'].ja.watch.includes('{EPS}'));
    assert.equal(saved.entries['GS|2026-10-13'].tries, 1);
    assert.equal(saved.entries['DOW|2026-10-22'].tries, undefined, '새 글은 시도 횟수 없음');
  });
  await t('빠진 언어는 상한(2회)까지만 다시 — C(en 거절)는 한 번 더, 그다음엔 all-cached(모델 0콜) · 출구에서 DOW 두 보고가 각자 자기 값으로 채워진다', async () => {
    // 처음 만든 뒤 «다시 채우기»는 2회까지(BRIEF_FILL_MAX_TRIES) — C 는 두 번 더 불리고 그다음엔 안 불린다
    for (const n of [1, 2]) {
      const before0 = modelCalls.length;
      const res1 = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'))).json() as any;
      assert.equal(res1.todo, 1, 'C 만');
      assert.deepEqual(modelCalls.slice(before0).flat(), ['C']);
      assert.equal((store.get(B.EARNINGS_BRIEF_KEY)!.value as any).entries['C|2026-10-13'].tries, n);
    }
    const saved = store.get(B.EARNINGS_BRIEF_KEY)!.value as any;
    assert.equal(saved.entries['C|2026-10-13'].en.watch, undefined, '또 literal — 여전히 watch 저장 안 함');
    assert.ok(saved.entries['C|2026-10-13'].ko.watch.includes('{EPS}'), 'ko 는 그대로');
    const before = modelCalls.length;
    const res = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'))).json() as any;
    assert.equal(res.skipped, 'all-cached');
    assert.equal(modelCalls.length, before);
    const m = B.attachBriefs([DOW1, DOW2], store.get(B.EARNINGS_BRIEF_KEY)!.value as any);
    assert.match(m.rows[0].brief!.ko!.watch!, /EPS \$0\.12가/);
    assert.match(m.rows[1].brief!.ko!.watch!, /EPS \$0\.20가/);
  });

  console.log('━━━ 7. 회사 혼동(T30) — TER/VRT 정식명 입력·저장·전체 재생성 ━━━');
  const TER = { ...C, ticker: 'TER', date: '2026-10-27' };
  const VRT = { ...C, ticker: 'VRT', date: '2026-10-28' };
  const identified = (ticker: string, name: string) => ({ ...good(ticker), en: { ...good(ticker).en, name } });
  calendarForCron = { ok: true, rows: [TER, VRT] };
  await t('완성·tries 상한의 TER(Teradata)·VRT(Virtus) 오염 글을 모든 언어째 버리고, 정식명·업종 입력 후 Teradyne/Vertiv 로 저장', async () => {
    store.set(B.EARNINGS_BRIEF_KEY, { value: { entries: {
      [B.briefEntryKey(TER.ticker, TER.date)]: { ...identified('TER', 'Teradata'), tries: 99 },
      [B.briefEntryKey(VRT.ticker, VRT.date)]: { ...identified('VRT', 'Virtus Investment Partners'), tries: 99 },
    } } });
    modelReply = (tickers) => Object.fromEntries(tickers.map((tk) => [tk, identified(tk, tk === 'TER' ? 'Teradyne' : 'Vertiv')]));
    const result = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'))).json() as any;
    assert.deepEqual(result.invalidated, ['TER|2026-10-27', 'VRT|2026-10-28']);
    const saved = store.get(B.EARNINGS_BRIEF_KEY)!.value as any;
    assert.equal(saved.entries['TER|2026-10-27'].en.name, 'Teradyne');
    assert.equal(saved.entries['TER|2026-10-27'].ko.name, '테라다인');
    assert.equal(saved.entries['TER|2026-10-27'].ja.name, 'テラダイン');
    assert.equal(saved.entries['VRT|2026-10-28'].en.name, 'Vertiv');
    assert.equal(saved.entries['TER|2026-10-27'].tries, undefined, '전체 재생성 시 오염 글 tries도 초기화');
    assert.match(modelInputs.at(-1)!, /Teradyne/);
    assert.match(modelInputs.at(-1)!, /Semiconductor test equipment/);
    assert.match(modelInputs.at(-1)!, /Data center power and cooling/);
    assert.doesNotMatch(modelInputs.at(-1)!, /Teradata"|Virtus/, '입력에 다른 회사 이름 없음');
  });
  await t('운영자 invalidate=TER: 정상 VRT 보존·TER 전체 재생성; 모델이 다시 Teradata를 주면 어떤 언어도 저장하지 않는다', async () => {
    modelReply = (tickers) => Object.fromEntries(tickers.map((tk) => [tk, identified(tk, 'Teradata')]));
    const before = modelCalls.length;
    const result = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief?invalidate=TER'))).json() as any;
    assert.deepEqual(modelCalls.slice(before).flat(), ['TER']);
    assert.deepEqual(result.invalidated, ['TER|2026-10-27']);
    assert.ok(result.rejected.includes('TER(company-name-mismatch)'));
    const saved = store.get(B.EARNINGS_BRIEF_KEY)!.value as any;
    assert.equal(saved.entries['TER|2026-10-27'], undefined);
    assert.equal(saved.entries['VRT|2026-10-28'].en.name, 'Vertiv');
    // 탈락 글은 저장하지 않아 다음 회차에도 생성 대상이다.
    const retry = modelCalls.length;
    await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'));
    assert.deepEqual(modelCalls.slice(retry).flat(), ['TER']);
  });
  await t('현재 키 밖 옛 날짜의 오염 fallback도 생성 실패 전에 캐시에서 무효화한다', async () => {
    store.set(B.EARNINGS_BRIEF_KEY, { value: { entries: {
      'TER|2026-10-25': { ...identified('TER', 'Teradata'), tries: 99 },
      'VRT|2026-10-28': identified('VRT', 'Vertiv'),
    } } });
    modelReply = (tickers) => Object.fromEntries(tickers.map((tk) => [tk, identified(tk, 'Teradata')]));
    const result = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'))).json() as any;
    assert.deepEqual(result.invalidated, ['TER|2026-10-25']);
    const saved = store.get(B.EARNINGS_BRIEF_KEY)!.value as any;
    assert.equal(saved.entries['TER|2026-10-25'], undefined);
    assert.equal(saved.entries['TER|2026-10-27'], undefined);
    assert.equal(saved.entries['VRT|2026-10-28'].en.name, 'Vertiv');
  });
  await t('출구 exact/dateFrom/±30일 모두 TER→Teradata 오염 글을 막고 새 정식 글은 표시한다', () => {
    for (const date of ['2026-10-27', '2026-10-29']) {
      const rows = [{ ...TER, date }];
      const bad = B.attachBriefs(rows, { entries: { 'TER|2026-10-27': identified('TER', 'Teradata') } });
      assert.equal(bad.rows[0].brief, undefined);
      assert.equal(bad.blocked, 1);
      const clean = B.attachBriefs(rows, { entries: { 'TER|2026-10-27': identified('TER', 'Teradyne') } });
      assert.equal(clean.rows[0].brief!.en!.name, 'Teradyne');
      assert.equal(clean.rows[0].brief!.ko!.name, '테라다인', '모델 ko 이름 대신 정식명');
      const from = B.attachBriefs([{ ...TER, date: '2026-12-27', dateFrom: '2026-10-27' }], { entries: { 'TER|2026-10-27': identified('TER', 'Teradata') } });
      assert.equal(from.rows[0].brief, undefined);
    }
  });
  await t('정식명 표에 없는 종목은 모델에 보내지 않고 unresolved로 보고한다(다른 종목은 진행)', async () => {
    calendarForCron = { ok: true, rows: [{ ...TER, ticker: 'ZZZZ' }] };
    const before = modelCalls.length;
    const result = await (await CRON.GET(new Request('http://localhost/api/cron/earnings-brief'))).json() as any;
    assert.equal(result.skipped, 'all-cached');
    assert.deepEqual(result.unresolved, ['ZZZZ']);
    assert.equal(modelCalls.length, before);
  });

  console.log(`\n${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
