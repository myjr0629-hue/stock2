/**
 * 가격 허브 /last — 서버(Vercel)가 «지금 구독 중인 채널의 마지막 WS 체결»을 읽어 가는 문 (2026-10-14).
 * 실행: node tests/hubLast.test.js   (실제 허브 파일을 가짜 Intrinio SDK·IPC 전송으로 시험한다 · 소켓·네트워크 0)
 *
 * 지키는 것:
 *   1. /last 는 서버 관심 종목을 등록하고 채널을 연다(join) · 이미 열린 채널은 다시 열지 않는다 · 잘못된 티커·150개 초과는 거른다
 *   2. 첫 체결을 wait 안에 기다려 준다(방금 연 종목만) · 체결이 없으면 pending 으로 알린다
 *   3. 체결 시각 정규화(초·ms·ns) — 지연은 보존, 결측은 0
 *   4. 서버 관심만으로 열린 채널의 체결은 latestPrices 를 더럽히지 않는다 → 나중에 클라이언트가 구독할 때 «prevClose 없는 changePct 0» 캐시가 나가지 않는다
 *   5. 클라이언트가 구독·해지해도 서버 관심이 살아 있으면 채널을 유지한다 · 만료되면 떠난다(클라이언트가 쓰는 채널은 둔다)
 *   6. 벤더 REST 호출 0 (서버 관심 종목은 ensurePrevClose 를 부르지 않는다)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const transportFile = path.join(__dirname, 'helpers/hubIpcTransport.cjs');
const PORT = 18000 + Math.floor(Math.random() * 1000);

// ── 임시 작업 디렉터리: 허브 사본 + 가짜 intrinio-realtime + https.get 가로채기 ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-last-'));
fs.copyFileSync(path.join(REPO, 'scripts', 'ec2-price-ws.js'), path.join(dir, 'hub.js'));
fs.mkdirSync(path.join(dir, 'node_modules', 'intrinio-realtime'), { recursive: true });
fs.writeFileSync(path.join(dir, 'node_modules', 'intrinio-realtime', 'index.js'), `
// 가짜 SDK — join/leave 를 표준출력으로 알리고, 표준입력 한 줄(JSON)로 체결을 흘려 넣는다.
class RealtimeClient {
  constructor(key, onTrade, onQuote) {
    this.ch = new Map(); this.onTrade = onTrade; this.onQuote = onQuote;
    let buf = '';
    process.stdin.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.cmd === 'trade' && this.ch.has(m.sym)) this.onTrade({ Symbol: m.sym, Price: m.price, Size: 100, Timestamp: m.ts, MarketCenter: 'Q', IsDarkpool: false, Condition: '' });
        if (m.cmd === 'trade-unjoined') this.onTrade({ Symbol: m.sym, Price: m.price, Size: 100, Timestamp: m.ts });
      }
    });
  }
  join(symbols) { for (const s of [].concat(symbols)) { if (!this.ch.has(s)) { this.ch.set(s, 1); console.log('FAKE JOIN ' + s); } } }
  leave(symbols) { for (const s of [].concat(symbols)) { if (this.ch.delete(s)) console.log('FAKE LEAVE ' + s); } }
}
module.exports = { RealtimeClient };
`);
fs.writeFileSync(path.join(dir, 'preload.js'), `
// https.get 가로채기 — prevClose REST(fetchPreviousClose)를 가짜로 답하고 호출 수를 센다(벤더 REST 0 확인용).
require(${JSON.stringify(transportFile)}).installServerTransport();
const https = require('https'); const { EventEmitter } = require('events');
const { PassThrough } = require('node:stream');
const fs = require('fs'); const read = fs.readFileSync;
fs.readFileSync = function(p, ...args) { if (String(p).split('/').pop().startsWith('.env')) throw new Error('blocked env file'); return read.call(this, p, ...args); };
https.get = (url, cb) => {
  console.log('FAKE REST ' + String(url).replace(/api_key=[^&]*/, 'api_key=x'));
  const res = new PassThrough(); const req = new EventEmitter();
  setImmediate(() => { cb(res); res.end(Buffer.from(JSON.stringify({ eod_close_price: 100 }))); });
  return req;
};
`);

let out = '';
const hub = spawn(process.execPath, ['-r', path.join(dir, 'preload.js'), path.join(dir, 'hub.js')], {
  cwd: dir,
  env: { ...process.env, WS_PORT: String(PORT), INTRINIO_API_KEY: 'test-key', POLYGON_API_KEY: 'test', ENABLE_OPTIONS_WS: '0', NODE_PATH: path.join(REPO, 'node_modules'), HUB_INTEREST_TTL_MS: '1500', HUB_INTEREST_SWEEP_MS: '200' },
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
});
hub.stdout.on('data', (d) => { out += d; });
hub.stderr.on('data', (d) => { out += d; });
const feed = (o) => hub.stdin.write(JSON.stringify(o) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (re) => (out.match(re) || []).length;
const transport = require(transportFile).clientTransport(hub);
const get = transport.get;
const last = async (q) => { const r = await get('/last?' + q); return { status: r.status, j: r.status === 200 ? JSON.parse(r.body) : null }; };

let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e)); process.exitCode = 1; } };

(async () => {
  for (let i = 0; i < 50 && !/Intrinio WebSocket 연결됨/.test(out); i++) await sleep(100);
  assert.ok(/Intrinio WebSocket 연결됨/.test(out), '허브가 가짜 SDK 로 떠야 한다\n' + out.slice(0, 800));

  await t('/last — 서버 관심 종목은 채널을 열고(join) 아직 체결이 없으면 pending', async () => {
    const r = await last('symbols=nvda,AAPL,%E3%82%B7%E3%83%AA%E3%82%B3%E3%83%B3,TOOLONGTICKERXX');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.j.ticks), []);
    assert.deepEqual(r.j.pending.sort(), ['AAPL', 'NVDA']);
    assert.equal(r.j.live, true);
    await sleep(50);
    assert.equal(count(/FAKE JOIN NVDA/g), 1);
    assert.equal(count(/FAKE JOIN AAPL/g), 1);
    assert.equal(count(/FAKE JOIN /g), 2, '잘못된 티커는 join 하지 않는다');
  });

  await t('체결이 들어오면 /last 가 마지막 체결·체결 시각·수신 시각을 준다(초·ms·ns 모두 ms 로)', async () => {
    const now = Date.now();
    feed({ cmd: 'trade', sym: 'NVDA', price: 224.5, ts: now / 1000 });               // 초(float)
    feed({ cmd: 'trade', sym: 'AAPL', price: 250.25, ts: now * 1e6 });                // 나노초
    await sleep(100);
    const r = await last('symbols=NVDA,AAPL');
    assert.equal(r.j.ticks.NVDA.p, 224.5);
    assert.ok(Math.abs(r.j.ticks.NVDA.trade - now) < 2000, 'NVDA trade ' + (r.j.ticks.NVDA.trade - now));
    assert.ok(Math.abs(r.j.ticks.AAPL.trade - now) < 2000, 'AAPL trade ' + (r.j.ticks.AAPL.trade - now));
    assert.ok(r.j.ticks.NVDA.rx >= now - 50);
    assert.equal(count(/FAKE JOIN /g), 2, '이미 열린 채널은 다시 열지 않는다');
  });

  await t('체결 시각이 없으면 기존대로 0을 보존한다', async () => {
    const eventMs = 0;
    feed({ cmd: 'trade', sym: 'NVDA', price: 224.9, ts: eventMs / 1000 });
    await sleep(100);
    const r = await last('symbols=NVDA');
    assert.equal(r.j.ticks.NVDA.p, 224.9);
    assert.equal(r.j.ticks.NVDA.trade, eventMs);
    assert.ok(r.j.ticks.NVDA.rx > 0);
    assert.equal(r.j.ticks.NVDA.basis, 'fair_value');
  });

  await t('wait — 방금 연 종목의 첫 체결을 기다려 준다 · 안 오면 pending 으로 끝난다', async () => {
    const p = last('symbols=MSFT,GOOGL&wait=1000');
    await sleep(250);
    feed({ cmd: 'trade', sym: 'MSFT', price: 410.1, ts: Date.now() / 1000 });
    const t0 = Date.now();
    const r = await p;
    assert.equal(r.j.ticks.MSFT.p, 410.1);
    assert.deepEqual(r.j.pending, ['GOOGL']);
    assert.ok(Date.now() - t0 >= 600, '체결 없는 GOOGL 때문에 deadline 까지 기다린다');
    assert.ok(Date.now() - t0 < 1500);
  });

  await t('wait — 이미 열린 종목만이면 기다리지 않는다', async () => {
    const t0 = Date.now();
    const r = await last('symbols=NVDA,AAPL&wait=1200');
    assert.ok(Date.now() - t0 < 300);
    assert.deepEqual(r.j.pending, []);
  });

  await t('150개 초과·빈 요청·다른 경로', async () => {
    const many = Array.from({ length: 200 }, (_, i) => 'Q' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + (Math.floor(i / 26) % 26))).join(',');
    const before = count(/FAKE JOIN /g);
    const r = await last('symbols=' + many);
    assert.equal(r.status, 200);
    assert.ok(count(/FAKE JOIN /g) - before <= 150 - 4, '서버 관심 상한(150) — 이미 4개');
    const e = await last('');
    assert.deepEqual(e.j.ticks, {});
    const nf = await get('/nope');
    assert.equal(nf.status, 404);
    const h = await get('/health');
    assert.equal(JSON.parse(h.body).status, 'ok');
    assert.deepEqual(JSON.parse(h.body).staleDropped, {});
    assert.ok(JSON.parse(h.body).channels >= 4 && JSON.parse(h.body).serverInterest >= 4, '채널 수·서버 관심 수가 /health 에 실린다: ' + h.body);
  });

  await t('서버 관심 종목의 체결은 latestPrices 를 더럽히지 않는다 → 클라이언트가 나중에 구독해도 changePct 0 캐시가 안 나간다', async () => {
    const WebSocket = transport.WebSocket;
    const ws = new WebSocket('ws://127.0.0.1:' + PORT);
    const msgs = [];
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', (d) => { try { msgs.push(JSON.parse(d.toString())); } catch {} });
    const before = count(/FAKE REST /g);
    ws.send(JSON.stringify({ type: 'subscribe', tickers: ['NVDA'] }));
    await sleep(300);
    const priceMsgs = msgs.filter((m) => m.type === 'prices' && m.ticker === 'NVDA' && m.price != null);   // (가격 없는 껍데기 메시지는 기존 동작 — ensurePrevClose 가 빈 항목을 먼저 만든다)
    assert.equal(priceMsgs.length, 0, '서버가 쓴 체결이 캐시로 나가면 안 된다: ' + JSON.stringify(priceMsgs));
    assert.equal(count(/FAKE REST .*NVDA/g) - before, 1, '클라이언트 구독은 ensurePrevClose(prevClose REST 1회)를 부른다');
    // 클라이언트 구독 중 체결 → 브로드캐스트
    feed({ cmd: 'trade', sym: 'NVDA', price: 225, ts: Date.now() / 1000 });
    await sleep(200);
    const live = msgs.filter((m) => m.type === 'prices' && m.ticker === 'NVDA' && m.price != null);
    assert.ok(live.length >= 1 && live[live.length - 1].price === 225 && live[live.length - 1].changePct === 125, JSON.stringify(live));
    ws.close();
    await sleep(100);
  });

  await t('클라이언트가 체결이 한 번도 없는 종목을 구독해도 가격 없는 prices 메시지(껍데기)를 보내지 않는다', async () => {
    const WebSocket = transport.WebSocket;
    const ws = new WebSocket('ws://127.0.0.1:' + PORT);
    const msgs = [];
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', (d) => { try { msgs.push(JSON.parse(d.toString())); } catch {} });
    ws.send(JSON.stringify({ type: 'subscribe', tickers: ['COIN'] }));
    await sleep(300);
    assert.deepEqual(msgs.filter((m) => m.type === 'prices' && m.ticker === 'COIN'), [], JSON.stringify(msgs));
    ws.close();
    await sleep(100);
  });

  await t('서버 관심이 살아 있는 동안 클라이언트가 해지해도 채널을 유지한다', async () => {
    assert.equal(count(/FAKE LEAVE NVDA/g), 0, '해지 직후에도 떠나지 않았다');
    await last('symbols=NVDA');       // 관심 갱신
    const r = await last('symbols=NVDA');
    assert.equal(r.j.ticks.NVDA.p, 225);
  });

  await t('서버 관심이 만료되면 채널을 떠난다 · 시세 기록도 지운다', async () => {
    await sleep(2200);    // TTL 1.5초 + 청소 0.2초
    assert.ok(count(/FAKE LEAVE NVDA/g) === 1, 'NVDA leave');
    assert.ok(count(/FAKE LEAVE AAPL/g) === 1, 'AAPL leave');
    const r = await last('symbols=AAPL');       // 다시 연다
    assert.deepEqual(Object.keys(r.j.ticks), [], '떠난 채널의 옛 체결은 돌려주지 않는다');
    assert.equal(count(/FAKE JOIN AAPL/g), 2);
  });

  await t('벤더 REST 는 클라이언트 구독의 prevClose(종목당 1회: NVDA·COIN)뿐 — /last 로 열린 종목(ARM·MSFT·GOOGL·AAPL…)은 0', async () => {
    const rest = out.match(/FAKE REST [^\n]*/g) || [];
    assert.equal(rest.length, 2, rest.join('\n'));
    assert.deepEqual(rest.map((x) => /securities\/([A-Z.]+)\//.exec(x)[1]).sort(), ['COIN', 'NVDA']);
  });

  hub.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`hubLast: ${pass} passed${process.exitCode ? ' (실패 있음)' : ''}`);
})().catch((e) => { console.error('실패', e && e.stack || e); hub.kill('SIGKILL'); process.exit(1); });
