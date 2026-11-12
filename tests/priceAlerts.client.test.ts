/**
 * PRO «가격 레벨 알림» — 기기 저장 모양·도우미 시험 (2026-11-12 · lib/app/priceAlerts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/priceAlerts.client.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEVELS_PER_TICKER, PRICE_ALERT_TICKER_CAP, addLevel, autoDir, dropTicker, emptyPriceAlerts, mergeFired, newLevelId, parsePriceAlerts,
  parseTarget, payloadLevels, removeLevel, roundPx, samePayload, tickersWithAlertsOn, toggleLevel,
} from '../src/lib/app/priceAlerts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ROOT = path.join(__dirname, '..');
let seq = 0;
const nid = () => `lv${String(++seq).padStart(4, '0')}`;

console.log('━━━ 1. 입력 ━━━');
t('목표 가격 — $·천 단위 쉼표·소수 · 0·음수·글자·백만 이상 거부 · 1달러 이상 센트 반올림', () => {
  assert.equal(parseTarget('$1,234.567'), 1234.57);
  assert.equal(parseTarget(' 360 '), 360);
  assert.equal(parseTarget('.5'), 0.5);
  assert.equal(parseTarget('0.12345'), 0.1235);
  for (const bad of ['', '.', '0', '-5', 'abc', '1e3', '1000000', '12.3.4', null, undefined, NaN, -1]) assert.equal(parseTarget(bad as any), null, String(bad));
  assert.equal(roundPx(99.999), 100);
});
t('방향 자동 — 지금보다 위 = 넘으면 · 아래 = 내려가면 · 모르면 넘으면', () => {
  assert.equal(autoDir(210, 200), 'up');
  assert.equal(autoDir(190, 200), 'down');
  assert.equal(autoDir(200, 200), 'up');
  assert.equal(autoDir(190, null), 'up');
});
t('레벨 id — 서버 계약 /^[a-z0-9]{4,16}$/', () => {
  for (let i = 0; i < 200; i++) assert.match(newLevelId(), /^[a-z0-9]{4,16}$/);
});

console.log('━━━ 2. 더하기·끄기·지우기 ━━━');
t('종목당 5개 · 6번째 거부(per_ticker) · 같은 방향·가격 중복 거부(dup)', () => {
  let p = emptyPriceAlerts();
  for (let i = 0; i < LEVELS_PER_TICKER; i++) {
    const r = addLevel(p, 'NVDA', 200 + i, 'up', nid());
    assert.equal(r.error, undefined); p = r.prefs;
  }
  assert.equal(addLevel(p, 'NVDA', 300, 'up', nid()).error, 'per_ticker');
  assert.equal(addLevel(p, 'NVDA', 200, 'up', nid()).error, 'dup');
  assert.equal(p.pendingSync, true);
  assert.equal(addLevel(p, 'bad ticker', 1, 'up').error, 'bad');
  assert.equal(addLevel(p, 'NVDA', -1, 'up').error, 'bad');
});
t('100종목 상한(tickers) — 이미 있는 종목엔 더할 수 있다', () => {
  let p = emptyPriceAlerts();
  for (let i = 0; i < PRICE_ALERT_TICKER_CAP; i++) p = addLevel(p, `T${i}`, 10, 'up', nid()).prefs;
  assert.equal(addLevel(p, 'ZZZ', 10, 'up', nid()).error, 'tickers');
  assert.equal(addLevel(p, 'T0', 11, 'up', nid()).error, undefined);
});
t('끄기는 rev 그대로 · 다시 켜면 rev+1 · 울린 기록 지움(다시 무장)', () => {
  let p = addLevel(emptyPriceAlerts(), 'AAPL', 250, 'up', 'aaaa1').prefs;
  p = mergeFired(p, [{ id: 'aaaa1', rev: 1, at: 1000, px: 250.4 }]);
  const fired = p.tickers.AAPL[0];
  assert.equal(fired.on, false); assert.equal(fired.firedAt, 1000); assert.equal(fired.firedPx, 250.4); assert.equal(fired.rev, 1);
  p = toggleLevel(p, 'AAPL', 'aaaa1');
  assert.deepEqual(p.tickers.AAPL[0], { id: 'aaaa1', dir: 'up', px: 250, on: true, rev: 2 });
  p = toggleLevel(p, 'AAPL', 'aaaa1');
  assert.equal(p.tickers.AAPL[0].on, false); assert.equal(p.tickers.AAPL[0].rev, 2);
});
t('꺼진 같은 레벨을 다시 더하면 새로 만들지 않고 다시 켠다', () => {
  let p = addLevel(emptyPriceAlerts(), 'AAPL', 250, 'up', 'bbbb1').prefs;
  p = toggleLevel(p, 'AAPL', 'bbbb1');
  const r = addLevel(p, 'AAPL', 250, 'up', 'bbbb2');
  assert.equal(r.error, undefined);
  assert.equal(r.prefs.tickers.AAPL.length, 1);
  assert.equal(r.prefs.tickers.AAPL[0].on, true); assert.equal(r.prefs.tickers.AAPL[0].rev, 2);
});
t('지우기 — 마지막 레벨이면 종목 칸도 없앤다 · 종목 빼기', () => {
  let p = addLevel(emptyPriceAlerts(), 'MU', 100, 'down', 'cccc1').prefs;
  p = addLevel(p, 'AMD', 100, 'up', 'cccc2').prefs;
  p = removeLevel(p, 'MU', 'cccc1');
  assert.equal(p.tickers.MU, undefined);
  p = dropTicker(p, 'AMD');
  assert.deepEqual(p.tickers, {});
});

console.log('━━━ 3. 서버 계약·울림 합치기 ━━━');
t('보낼 목록 — {t,id,dir,px,on,rev} 만(울린 기록은 보내지 않는다) · 꺼진 레벨도 보낸다', () => {
  let p = addLevel(emptyPriceAlerts(), 'NVDA', 210, 'up', 'dddd1').prefs;
  p = addLevel(p, 'NVDA', 180, 'down', 'dddd2').prefs;
  p = mergeFired(p, [{ id: 'dddd2', rev: 1, at: 5, px: 179.9 }]);
  assert.deepEqual(payloadLevels(p), [
    { t: 'NVDA', id: 'dddd1', dir: 'up', px: 210, on: true, rev: 1 },
    { t: 'NVDA', id: 'dddd2', dir: 'down', px: 180, on: false, rev: 1 },
  ]);
  assert.deepEqual([...tickersWithAlertsOn(p)], ['NVDA']);
});
t('울림 합치기 — 같은 rev 만 · 다른 rev(그 사이 다시 켬)·모르는 id·깨진 값은 무시', () => {
  let p = addLevel(emptyPriceAlerts(), 'TSLA', 400, 'up', 'eeee1').prefs;
  p = toggleLevel(toggleLevel(p, 'TSLA', 'eeee1'), 'TSLA', 'eeee1');   // rev 2
  const same = mergeFired(p, [{ id: 'eeee1', rev: 1, at: 9, px: 401 }, { id: 'zzzz9', rev: 1, at: 9, px: 1 }, null, { id: 5 }]);
  assert.equal(same, p);
  const hit = mergeFired(p, [{ id: 'eeee1', rev: 2, at: 9, px: 401 }]);
  assert.equal(hit.tickers.TSLA[0].on, false);
  assert.equal(mergeFired(hit, [{ id: 'eeee1', rev: 2, at: 9, px: 401 }]), hit);
  assert.equal(mergeFired(p, null), p);
});
t('같은 목록 비교(보내는 사이 바뀌었나)', () => {
  const p = addLevel(emptyPriceAlerts(), 'TSLA', 400, 'up', 'ffff1').prefs;
  assert.equal(samePayload(payloadLevels(p), payloadLevels({ ...p })), true);
  assert.equal(samePayload(payloadLevels(p), payloadLevels(toggleLevel(p, 'TSLA', 'ffff1'))), false);
});

console.log('━━━ 4. 저장 글자 읽기 ━━━');
t('깨진 글자·옛 v1 모양 → 빈 값 · 잘못된 레벨·티커 거르기 · 종목당 5개 자르기 · 중복 id 제거', () => {
  assert.deepEqual(parsePriceAlerts('{oops').tickers, {});
  assert.deepEqual(parsePriceAlerts(JSON.stringify({ v: 1, tickers: { NVDA: ['call_wall_break'] } })).tickers, {});
  const raw = JSON.stringify({
    v: 2, pendingSync: true, lastSyncAt: 77, syncedToken: 'tok',
    tickers: {
      NVDA: [
        { id: 'gggg1', dir: 'up', px: 200, on: true, rev: 3, firedAt: 1, firedPx: 2 },
        { id: 'gggg1', dir: 'up', px: 201, on: true, rev: 1 },
        { id: 'BAD!', dir: 'up', px: 1, on: true, rev: 1 },
        { id: 'gggg2', dir: 'sideways', px: 1, on: true, rev: 1 },
        { id: 'gggg3', dir: 'down', px: -1, on: true, rev: 1 },
        ...Array.from({ length: 8 }, (_, i) => ({ id: `hhhh${i}`, dir: 'down', px: 100 + i, on: false, rev: 0 })),
      ],
      'bad t': [{ id: 'iiii1', dir: 'up', px: 1, on: true, rev: 1 }],
    },
  });
  const p = parsePriceAlerts(raw);
  assert.deepEqual(Object.keys(p.tickers), ['NVDA']);
  assert.equal(p.tickers.NVDA.length, LEVELS_PER_TICKER);
  assert.deepEqual(p.tickers.NVDA[0], { id: 'gggg1', dir: 'up', px: 200, on: true, rev: 3, firedAt: 1, firedPx: 2 });
  assert.equal(p.tickers.NVDA[1].rev, 1);   // rev 0 → 1
  assert.equal(p.pendingSync, true); assert.equal(p.lastSyncAt, 77); assert.equal(p.syncedToken, 'tok');
});

console.log('━━━ 5. 화면 원칙(소스 고정) ━━━');
t('설정 시트 — 장외(FINRA·다크풀) 항목 없음 · 평생 요금제 말 없음', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/app/watchlist/PriceAlertSheet.tsx'), 'utf8');
  assert.doesNotMatch(src, /FINRA|darkpool|dark pool|다크풀|ダークプール/i);
  assert.doesNotMatch(src, /lifetime|평생|永久/i);
});
t('내 종목 행 — 벨은 칩 줄(.r2)이 아니라 가격 칸 · PRO 카드는 알림 문구를 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/app/[locale]/app-view/watchlist/page.tsx'), 'utf8');
  assert.doesNotMatch(src, /ws\.bell\b/);
  assert.match(src, /ws\.pxBell/);
  assert.doesNotMatch(src, /pbAlertT|pbAlertS/);
  assert.match(src, /<div className=\{`\$\{p\.r2\} \$\{r\.locked \? '' : p\.r2Clip\}`\}>/);
});
t('알림 권유 문구 — 무료 신호(콜 월 돌파·감마 플립 교차·실적 D-1)를 PRO 혜택으로 팔지 않는다', () => {
  const copy = fs.readFileSync(path.join(ROOT, 'src/components/app/watchlist/copy.ts'), 'utf8');
  const keys = ['bAlerts', 'alertTitle', 'aLvl', 'aLvlSub', 'aMpSub', 'aEarn', 'aEarnSub'];
  for (const k of keys) {
    for (const m of copy.matchAll(new RegExp(`${k}: '([^']*)'`, 'g'))) assert.doesNotMatch(m[1], /돌파|교차|D-1|breakout|crossing|突破|交差|5분 봉|5-min|5分足/, `${k}: ${m[1]}`);
  }
  const pw = fs.readFileSync(path.join(ROOT, 'src/components/app/ProPaywall.tsx'), 'utf8');
  for (const m of pw.matchAll(/alerts(?:Title|Lede)?: '([^']*)'/g)) assert.doesNotMatch(m[1], /콜 월|call wall|コールウォール|5분 봉|5-min|5分足/, m[1]);
});

console.log(`\n${n}개 통과`);
