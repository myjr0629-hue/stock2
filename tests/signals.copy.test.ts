/**
 * 내 종목 이상 신호 — 문구(3개 언어) · AI 한 줄 출구 가드 · 푸시 탭 경로 시험 (2026-10-13)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/signals.copy.test.ts
 *
 * 지키는 것: 종목·무엇이·숫자·기준 시각이 규칙 줄에 다 있다 · 매수·매도·추천·예측·P/C 가 한 글자도 없다 · 금융 공통어는 번역하지 않는다 ·
 *   AI 줄은 숫자를 새로 쓰지 못하고(가격 정확 일치) 레벨의 쪽을 뒤집지 못하고 해석어·추측·예측어를 못 쓴다 — 못 넘으면 줄이 «없는» 푸시.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyAllLocales, etHm, pushCopyOf, ruleBodyOf, stampText, tapPathOf, titleOf } from '../src/lib/signals/copy';
import { checkSignalWhy, buildSignalUserPrompt, sigFactsForAi, sigSystemFor, SIG_SYSTEM } from '../src/lib/ai/signalLine';
import { signalFunnelSrc, signalTapPath } from '../src/lib/app/signalTap';
import { FUNNEL_SRCS, isFunnelSrc } from '../src/lib/app/funnelSchema';
import { EVENT_FUNNEL_SRC, SIGNAL_EVENTS, type DetectedSignal } from '../src/lib/signals/types';
import { TP_SYSTEM } from '../src/lib/ai/todayPicksLine';
import { T } from './_signalsFixtures';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const LOCS = ['ko', 'en', 'ja'] as const;
const AT = T('2026-10-13', 11, 5);

const wall: DetectedSignal = { ticker: 'NVDA', event: 'call_wall_break', key: '2026-10-13:up', asOfMs: AT, asOfDate: '2026-10-13', score: 0.5,
  facts: { kind: 'wall', level: 'callWall', levelPrice: 250, price: 251.3, direction: 'up', distPct: 0.52, expiry: '2026-10-16', chainDate: '2026-10-12', asOfMs: AT } };
const floor: DetectedSignal = { ...wall, event: 'put_floor_break', key: '2026-10-13:down', facts: { ...(wall.facts as any), level: 'putFloor', levelPrice: 230, price: 228.9, direction: 'down', distPct: -0.48 } };
const flip: DetectedSignal = { ...wall, event: 'gamma_flip_cross', facts: { ...(wall.facts as any), level: 'gammaFlip', levelPrice: 245, price: 246.1, distPct: 0.45 } };
const pain: DetectedSignal = { ticker: 'TSLA', event: 'maxpain_divergence', key: '2026-10-15', asOfMs: AT, asOfDate: '2026-10-13', score: 1.4,
  facts: { kind: 'maxpain', maxPain: 400, price: 411.2, divPct: 2.8, p90Pct: 2.0, n: 62, expiry: '2026-10-15', chainDate: '2026-10-12', asOfMs: AT } };
const dark: DetectedSignal = { ticker: 'AMD', event: 'darkpool_spike', key: '2026-10-12', asOfMs: T('2026-10-12', 12), asOfDate: '2026-10-12', score: 2.4,
  facts: { kind: 'darkpool', date: '2026-10-12', pct: 52.1, ratio: 2.4, volume: 8_400_000, marketAvg: 46.2 } };
const oi: DetectedSignal = { ticker: 'MU', event: 'oi_surge', key: '2026-10-09', asOfMs: T('2026-10-09', 12), asOfDate: '2026-10-09', score: 3e8,
  facts: { kind: 'whale', openedOn: '2026-10-09', notional: 375_500_000, callPct: 77, best: { type: 'call', strike: 230, expiry: '2026-10-16', added: 12500, oi: 18000, notional: 287_500_000 }, jump: 3.3 } };
const earn: DetectedSignal = { ticker: 'NFLX', event: 'earnings_d1', key: '2026-10-14', asOfMs: T('2026-10-14', 12), asOfDate: '2026-10-14', score: 6.1,
  facts: { kind: 'earnings_d1', date: '2026-10-14', hour: 'amc', etTime: '16:00', impliedPct: 6.1, impliedExpiry: '2026-10-16', tomorrow: true } };
const earnFri: DetectedSignal = { ...earn, key: '2026-10-19', facts: { kind: 'earnings_d1', date: '2026-10-19', hour: 'bmo', etTime: null, impliedPct: null, impliedExpiry: null, tomorrow: false } };
const ALL = [wall, floor, flip, pain, dark, oi, earn, earnFri];

const BANNED = /매수|(?<!공)매도|추천|목표\s?(?:가|주가)|예측|전망|P\/C|풋콜|put\/call|買い|売り|推奨|目標株価|予測|予想|見通し|\b(?:buy|sell|recommend\w*|forecast\w*|predict\w*|target price|bullish|bearish)\b/i;

console.log('━━━ 1. 규칙 줄(제목·본문) ━━━');
t('«M/D HH:mm ET» 기준 시각 — 관측 시각을 미국 동부 벽시계로', () => {
  assert.equal(etHm(AT), '10/13 11:05 ET');
  assert.equal(stampText(AT, 'ko'), '10/13 11:05 ET 기준'); assert.equal(stampText(AT, 'en'), 'as of 10/13 11:05 ET'); assert.equal(stampText(AT, 'ja'), '10/13 11:05 ET時点');
});
t('콜월 돌파 — 종목·레벨·가격·거리·만기·기준 시각이 3개 언어 모두에 있다', () => {
  assert.equal(titleOf(wall, 'ko'), '⚡ NVDA · Call Wall $250 돌파');
  assert.equal(titleOf(wall, 'en'), '⚡ NVDA · above Call Wall $250');
  assert.equal(titleOf(wall, 'ja'), '⚡ NVDA · Call Wall $250 上抜け');
  assert.equal(ruleBodyOf(wall, 'ko'), '가격 $251.3, Call Wall 위 0.52% · 10/16 만기 · 10/13 11:05 ET 기준');
  assert.equal(ruleBodyOf(wall, 'en'), 'Price $251.3, 0.52% above Call Wall · 10/16 expiry · as of 10/13 11:05 ET');
  assert.equal(ruleBodyOf(wall, 'ja'), '価格 $251.3、Call Wallの0.52%上 · 10/16満期 · 10/13 11:05 ET時点');
});
t('풋플로어 이탈·감마플립 — 방향 말이 사실과 같다', () => {
  assert.equal(titleOf(floor, 'ko'), '⚡ NVDA · Put Floor $230 이탈'); assert.equal(titleOf(floor, 'en'), '⚡ NVDA · below Put Floor $230'); assert.equal(titleOf(floor, 'ja'), '⚡ NVDA · Put Floor $230 割れ');
  assert.match(ruleBodyOf(floor, 'ko'), /Put Floor 아래 0\.48%/); assert.match(ruleBodyOf(floor, 'en'), /0\.48% below Put Floor/);
  assert.equal(titleOf(flip, 'ko'), '⚡ NVDA · Gamma Flip $245 위로'); assert.equal(titleOf(flip, 'ja'), '⚡ NVDA · Gamma Flip $245 を上回る');
});
t('맥스페인 이탈 — 부호 있는 괴리 · 자기 20일 상위 10% 경계 · 만기', () => {
  assert.equal(titleOf(pain, 'ko'), '⚡ TSLA · Max Pain 대비 +2.8%'); assert.equal(titleOf(pain, 'en'), '⚡ TSLA · +2.8% vs Max Pain'); assert.equal(titleOf(pain, 'ja'), '⚡ TSLA · Max Pain比 +2.8%');
  assert.equal(ruleBodyOf(pain, 'ko'), '가격 $411.2, Max Pain $400 · 10/15 만기 · 이 종목 최근 20거래일 괴리 상위 10% 경계(2%) 이상 · 10/13 11:05 ET 기준');
  assert.match(ruleBodyOf(pain, 'en'), /top-10% gap \(2%\)/);
  const down = { ...pain, facts: { ...(pain.facts as any), divPct: -3.1 } };
  assert.equal(titleOf(down as DetectedSignal, 'ko'), '⚡ TSLA · Max Pain 대비 −3.1%');
});
t('다크풀 급증·OI 급변 — 오늘 볼 것과 같은 규칙 문장 + FINRA/세션 날짜', () => {
  assert.equal(titleOf(dark, 'ko'), '⚡ AMD · 다크풀 급증'); assert.equal(titleOf(dark, 'en'), '⚡ AMD · dark pool surge'); assert.equal(titleOf(dark, 'ja'), '⚡ AMD · ダークプール急増');
  assert.equal(ruleBodyOf(dark, 'ko'), '다크풀 비중 52.1% · 거래량 20일 평균의 2.4배 · FINRA 10/12');
  assert.equal(titleOf(oi, 'ko'), '⚡ MU · 미결제약정 급증'); assert.equal(titleOf(oi, 'en'), '⚡ MU · open interest surge'); assert.equal(titleOf(oi, 'ja'), '⚡ MU · 建玉急増');
  assert.equal(ruleBodyOf(oi, 'ko'), '10/16 만기 $230 콜 +12,500계약 · 명목 $376M · 10/9 세션');
  assert.equal(ruleBodyOf(oi, 'en'), '10/16 $230 call +12,500 contracts · $376M notional · 10/9 session');
});
t('실적 D-1 — 내일/요일 · 장 마감 후 · 시각 · 옵션 예상 변동(없으면 생략)', () => {
  assert.equal(titleOf(earn, 'ko'), '⚡ NFLX · 내일 실적 발표'); assert.equal(titleOf(earn, 'en'), '⚡ NFLX · reports tomorrow'); assert.equal(titleOf(earn, 'ja'), '⚡ NFLX · 明日決算発表');
  assert.equal(ruleBodyOf(earn, 'ko'), '10/14(수) 장 마감 후 16:00 ET · 옵션 예상 변동 ±6.1%(10/16 만기)');
  assert.equal(titleOf(earnFri, 'ko'), '⚡ NFLX · 10/19(월) 실적 발표'); assert.equal(titleOf(earnFri, 'en'), '⚡ NFLX · reports Mon 10/19');
  assert.equal(ruleBodyOf(earnFri, 'ko'), '10/19(월) 장 시작 전'); assert.ok(!/변동/.test(ruleBodyOf(earnFri, 'ko')), '예상 변동이 없으면 말하지 않는다');
});
t('전 종류 × 3개 언어 — 종목이 제목에 · 금지어·P/C 0 · 금융 공통어 원문 · 길이 상한', () => {
  for (const s of ALL) for (const l of LOCS) {
    const c = pushCopyOf(s, l, null);
    assert.ok(c.title.includes(s.ticker), `${s.event}/${l}`);
    assert.ok(!BANNED.test(c.title + c.body), `${s.event}/${l}: ${c.title} ${c.body}`);
    assert.ok([...c.title].length <= 40, `제목 길이 ${s.event}/${l}: ${c.title}`);
    assert.ok([...c.body].length <= 150, `본문 길이 ${s.event}/${l}: ${c.body}`);
    assert.ok(!c.body.includes('\n'), '규칙 줄은 한 줄');
  }
  for (const l of LOCS) assert.ok(/Call Wall/.test(ruleBodyOf(wall, l)) && /Max Pain/.test(ruleBodyOf(pain, l)), '금융 공통어는 번역하지 않는다');
});
t('AI 줄은 «✦ » 로 줄바꿈 뒤에 붙고, 없으면 붙지 않는다', () => {
  const c = pushCopyOf(wall, 'ko', '콜 미결제약정이 가장 몰린 행사가를 가격이 막 넘어선 시점입니다');
  assert.equal(c.body.split('\n').length, 2); assert.ok(c.body.split('\n')[1].startsWith('✦ 콜'));
  assert.equal(pushCopyOf(wall, 'ko', null).body.includes('✦'), false);
  assert.equal(pushCopyOf(wall, 'ko', '   ').body.includes('✦'), false);
  const all = copyAllLocales(wall, { ko: '가', en: 'b', ja: 'あ' });
  assert.ok(all.en.body.endsWith('✦ b'));
});

console.log('━━━ 2. 푸시 탭 · 계측 출처 ━━━');
t('탭 경로 — 서버가 만든 경로만 통과(그 종목 Flow 화면 하나)', () => {
  for (const tk of ['NVDA', 'BRK.B', 'BF-B', 'A']) assert.equal(signalTapPath(tapPathOf(tk)), tapPathOf(tk), tk);
  assert.equal(tapPathOf('NVDA'), '/app-view/flow?t=NVDA&from=sig');
  for (const bad of ['/app-view/dash', '/app-view/flow?t=nvda&from=sig', '/app-view/flow?t=NVDA&from=alert', 'https://evil.example/app-view/flow?t=NVDA&from=sig', '/app-view/flow?t=NVDA&from=sig&x=1', null, 5, '']) assert.equal(signalTapPath(bad as any), null, String(bad));
});
t('계측 출처 — 닫힌 목록의 push_sig_* 만 · 모든 신호 종류가 닫힌 목록 안에 있다', () => {
  for (const ev of SIGNAL_EVENTS) { const src = EVENT_FUNNEL_SRC[ev]; assert.ok(isFunnelSrc(src) && (FUNNEL_SRCS as readonly string[]).includes(src), `${ev}→${src}`); assert.equal(signalFunnelSrc(src), src); }
  assert.equal(signalFunnelSrc('push_morning'), null); assert.equal(signalFunnelSrc('push_sig_hack'), null); assert.equal(signalFunnelSrc(undefined), null);
});

console.log('━━━ 3. AI 한 줄 — 사실 글 · 출구 가드 ━━━');
const YEAR = 2026, TODAY = '2026-10-13';
const ok = (s: DetectedSignal, text: Record<string, string>) => checkSignalWhy(JSON.stringify(text), s.ticker, s.facts, YEAR, TODAY);
const GOOD_WALL = { ko: '콜 미결제약정이 가장 몰린 행사가를 가격이 막 넘어선 시점입니다', en: 'The price had just cleared the strike with the most call open interest', ja: 'コール建玉が最も集中する行使価格を、価格が上回った時点です' };
t('실적 D-1 각도 — 규칙 줄(날짜·시각·변동폭)을 되풀이하지 않고 값의 뜻을 풀게 한다', () => {
  const p = buildSignalUserPrompt('NFLX', earn.facts, TODAY);
  assert.match(p, /Do not repeat the date, time or figure from the numbers line/);
  assert.match(buildSignalUserPrompt('NFLX', { ...(earn.facts as any), impliedPct: 9.2 }, TODAY), /unusually large move/);
  const svc = fs.readFileSync(path.join(__dirname, '..', 'src/services/signalAlertsService.ts'), 'utf8');
  assert.match(svc, /sig\.facts\.kind === 'earnings_d1' && sig\.facts\.impliedPct == null\) return \{ text: null, reason: 'no-implied'/, '예상 변동이 없으면 AI 를 부르지 않는다');
});
t('사실 글 — 레벨 정의·가격·거리·쪽·관측 시각·만기 일수(영어)', () => {
  const f = sigFactsForAi('NVDA', wall.facts, TODAY);
  assert.match(f, /Call Wall \(the strike above the price with the most call open interest\) is \$250/);
  assert.match(f, /\$251\.3, 0\.52% above it/); assert.match(f, /10\/13 11:05 ET/); assert.match(f, /10\/16 expiry \(3 days away\)/);
  assert.match(sigFactsForAi('TSLA', pain.facts, TODAY), /Max Pain for the 10\/15 expiry is \$400; the price is \$411\.2, 2\.8% above it/);
  assert.match(sigFactsForAi('NFLX', earn.facts, TODAY), /Options-implied move: ±6\.1%/);
  assert.match(sigFactsForAi('NFLX', earnFri.facts, TODAY), /talk only about the timing/);
});
t('시스템 프롬프트 — 고래·다크풀은 «오늘 볼 것» 것을 그대로, 나머지는 같은 규칙 1~8 + 레벨/실적 규칙', () => {
  assert.equal(sigSystemFor(oi.facts), TP_SYSTEM); assert.equal(sigSystemFor(dark.facts), TP_SYSTEM);
  assert.equal(sigSystemFor(wall.facts), SIG_SYSTEM);
  assert.ok(SIG_SYSTEM.includes('1. Observation only') && SIG_SYSTEM.includes('8. Style') && SIG_SYSTEM.includes('9. Call Wall') && SIG_SYSTEM.includes('10. Earnings D-1'));
  assert.match(buildSignalUserPrompt('NVDA', wall.facts, TODAY), /FACTS — NVDA[\s\S]*MEANING:[\s\S]*ANGLE:/);
});
t('가드 통과 — 콜월 / 맥스페인 / 실적', () => {
  const r = ok(wall, GOOD_WALL); assert.equal(r.ok, true, r.reasons.join(',')); assert.equal(r.text!.ko, GOOD_WALL.ko);
  const p = ok(pain, { ko: '이 종목으로서는 평소보다 Max Pain에서 많이 벌어진 가격입니다', en: 'The price sits further from Max Pain than is usual for this stock', ja: 'この銘柄にしては、Max Painから普段より大きく離れた価格です' });
  assert.equal(p.ok, true, p.reasons.join(','));
  const e = ok(earn, { ko: '발표를 낀 만기의 옵션이 이만큼의 움직임을 가격에 반영하고 있습니다', en: 'Options for the expiry containing the report price in a move of this size', ja: '決算を含む満期のオプションが、この大きさの値動きを織り込んでいます' });
  assert.equal(e.ok, true, e.reasons.join(','));
});
t('가드 거부 — 예측·권유·추측·해석어(저항/지지)·의도 추정', () => {
  const bad = (s: DetectedSignal, ko: string, en: string, ja: string, re: RegExp) => { const r = ok(s, { ko, en, ja }); assert.equal(r.ok, false, ko); assert.ok(r.reasons.some((x) => re.test(x)), `${re} ← ${r.reasons.join(',')}`); };
  bad(wall, '가격이 Call Wall 위에서 계속 오를 가능성이 있습니다', GOOD_WALL.en, GOOD_WALL.ja, /hedge|forbidden|forecast/);
  bad(wall, GOOD_WALL.ko, 'The price will keep rising above the strike', GOOD_WALL.ja, /forbidden|forecast/);
  bad(wall, '콜월은 저항선이라 가격이 막힐 구간입니다', GOOD_WALL.en, GOOD_WALL.ja, /interpretive/);
  bad(wall, GOOD_WALL.ko, 'The Call Wall acts as resistance at this level today', GOOD_WALL.ja, /interpretive/);
  bad(wall, GOOD_WALL.ko, GOOD_WALL.en, 'コール建玉が最も集中する行使価格を上回り、強気の買いが入りました', /forbidden|intent|banned/);
  bad(pain, '매수세가 몰려 Max Pain에서 벌어졌습니다', 'The price sits further from Max Pain than is usual', 'Max Painから普段より大きく離れています', /forbidden|banned/);
});
t('가드 거부 — 숫자·가격을 새로 쓰거나 틀리게 / 레벨의 쪽을 뒤집음 / 주지 않은 레벨', () => {
  const bad = (s: DetectedSignal, ko: string, re: RegExp, en = GOOD_WALL.en, ja = GOOD_WALL.ja) => { const r = ok(s, { ko, en, ja }); assert.equal(r.ok, false, ko); assert.ok(r.reasons.some((x) => re.test(x)), `${re} ← ${r.reasons.join(',')}`); };
  bad(wall, 'Call Wall $255를 가격이 막 넘어선 시점입니다', /price|number/);          // 주지 않은 가격
  bad(wall, 'Call Wall $250 위 0.9%에 가격이 있습니다', /number|side/);               // 거리 숫자 변조
  bad(wall, '가격이 Call Wall $250 아래에 있는 시점입니다', /side/);                   // 쪽 뒤집음
  bad(wall, '가격이 Call Wall 아래에 머문 시점입니다', /dir/);                          // 가격 없는 쪽 주장
  bad(wall, '가격이 Max Pain 위에 있는 시점입니다', /dir|side/);                       // 주지 않은 레벨
  bad(pain, 'Max Pain $400 아래에 있는 가격입니다', /side/, pain && GOOD_WALL.en, GOOD_WALL.ja);
  bad(wall, '딜러 헤지가 움직임을 줄이는 구간을 가격이 막 넘어선 시점입니다', /mechanism/);   // 정의되지 않은 기전
  bad(wall, '7개 행사가를 가격이 막 넘어선 시점입니다', /number/);                      // 지어낸 숫자(사실 글에 없는 7)
});
t('가드 거부 — 길이 · 언어 혼입 · 말줄임 · 거절문 · 연도 · 억/만 단위 금액', () => {
  const r1 = ok(wall, { ko: '콜 미결제약정이 가장 몰린 행사가를 가격이 막 넘어선 시점이어서 한눈에 눈에 띄는 모습입니다 정말로 그렇습니다', en: GOOD_WALL.en, ja: GOOD_WALL.ja });
  assert.ok(r1.reasons.some((x) => /too-long/.test(x)));
  assert.ok(ok(wall, { ...GOOD_WALL, en: '콜 미결제약정이 가장 몰린 행사가를 가격이 막 넘어선 시점입니다' }).reasons.some((x) => /script/.test(x)));
  assert.ok(ok(wall, { ...GOOD_WALL, ko: '콜 미결제약정이 가장 몰린 행사가를 막 넘어선…' }).reasons.some((x) => /ellipsis/.test(x)));
  assert.ok(ok(wall, { ...GOOD_WALL, ko: '죄송하지만 답변할 수 없습니다 이 요청은' }).reasons.some((x) => /refusal|hedge|forbidden/.test(x)));
  assert.ok(ok(wall, { ...GOOD_WALL, en: 'The price had cleared the strike with the most calls in 2025' }).reasons.some((x) => /year|number/.test(x)));
  assert.equal(ok(wall, { ko: 'x', en: 'y', ja: 'z' }).ok, false);
  assert.equal(checkSignalWhy('not json', 'NVDA', wall.facts, YEAR, TODAY).ok, false);
});
t('고래·다크풀은 오늘 볼 것 가드로 위임 — 같은 입력이 같은 판정', () => {
  const okOi = ok(oi, { ko: '한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸습니다', en: "One strike's open interest jumped in a session, so new positions were opened", ja: 'ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました' });
  assert.equal(okOi.ok, true, okOi.reasons.join(','));
  const badOi = ok(oi, { ko: '큰손이 매집하는 것으로 보이는 새 포지션입니다', en: GOOD_WALL.en, ja: GOOD_WALL.ja });
  assert.equal(badOi.ok, false);
  const okDark = ok(dark, { ko: '장외 거래량이 평소 수준을 크게 웃돌아 거래소 밖 체결이 많았습니다', en: 'Off-exchange volume ran far above its usual level', ja: '場外の出来高が平常を大きく上回り、取引所外の約定が多くなりました' });
  assert.equal(okDark.ok, true, okDark.reasons.join(','));
});

console.log(`\n${n}개 통과`);
