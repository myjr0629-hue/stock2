/**
 * intrinio-options-ws — Intrinio 실시간 옵션 WebSocket 클라이언트 (Node)
 * ============================================================================
 * 왜 직접 만드나: Intrinio 는 **Node 용 옵션 SDK 를 배포하지 않는다**
 *   (C#/Java/Python/Go 만). 우리 EC2 중계기(ec2-price-ws.js)가 Node 이므로
 *   공식 파이썬 SDK 를 정본 삼아 프로토콜을 그대로 옮긴다.
 *
 * 정본: intrinio/intrinio-realtime-python-sdk
 *       └ intriniorealtime/options_client.py  (L709~723 URL · L500~620 파싱 · L761~785 join)
 *
 * ★★ 옵션은 주식과 URL 규칙이 다르다 (2026-09-02 실측으로 확인)
 *   주식(equities-edge): Client-Information·UseNewEquitiesFormat 을 **쿼리스트링**에
 *   옵션(options-edge) : Client-Information 을 **HTTP 헤더**로, 소켓 쿼리는 vsn·token 만
 *   → 옵션 URL 에 쿼리로 넣으면 업그레이드가 거부되고 **빈 HTTP 200** 이 온다.
 *
 * ★ provider 가 2개다. 우리 계정은 OPTIONS_EDGE 만 붙는다.
 *   OPRA         → realtime-options.intrinio.com  … 우리 계정 ❌ (빈 200)
 *   OPTIONS_EDGE → options-edge.intrinio.com      … ✅ 핸드셰이크·수신 확인
 *
 * 사용:
 *   const { OptionsWsClient } = require('./intrinio-options-ws');
 *   const c = new OptionsWsClient({ apiKey, onTrade, onQuote });
 *   await c.start();
 *   c.join('NVDA');           // 티커 전체 계약
 *   c.join('NVDA__260904C00200000');  // 단일 계약(구형 표기도 받는다)
 * ============================================================================
 */
'use strict';

const https = require('https');
const WebSocket = require('ws');

// ── 공식 SDK 상수 (options_client.py L14~17) ───────────────────────────
const TRADE_SIZE = 72;   // 61 used + 11 pad
const QUOTE_SIZE = 52;   // 48 used + 4 pad
const REFRESH_SIZE = 52; // 44 used + 8 pad
const UA_SIZE = 74;      // 62 used + 12 pad

const CLIENT_INFO = 'IntrinioOptionsNodeSDK/1.0';

const PROVIDERS = {
  OPTIONS_EDGE: 'options-edge.intrinio.com',
  OPRA: 'realtime-options.intrinio.com',
};

// ── 스케일 표 (_scale_value) ──────────────────────────────────────────
const SCALE = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];
function scaleValue(value, scaleType) {
  if (scaleType === 0x0a) return value / 512.0;
  if (scaleType === 0x0f) return 0.0;
  const d = SCALE[scaleType];
  return d === undefined ? value : value / d;
}
// int32 센티널 = 결측
function scaleInt32(v, t) {
  if (v === 2147483647 || v === -2147483648) return null;
  return scaleValue(v, t);
}
function scaleUint64(v, t) {
  if (v === 18446744073709551615n) return null;
  return scaleValue(Number(v), t);
}
// 서버 타임스탬프는 나노초다 (_get_seconds_from_epoch_from_ticks)
const ticksToMs = (ns) => Number(ns / 1000000n);

// ── 계약 코드 변환 ────────────────────────────────────────────────────
// 서버 표기: AAPL_201016C100.00   ↔   구형(우리) 표기: AAPL__201016C00100000
function toOld(buf) {
  // '______220101C00000000' 21자를 채운다 (options_client.py _transform_contract_to_old)
  const out = Buffer.from('______220101C00000000', 'ascii');
  const us = buf.indexOf(0x5f); // '_'
  if (us < 0) return buf.toString('ascii');
  const dotRel = buf.subarray(9).indexOf(0x2e); // 티커 안의 '.' 은 무시
  if (dotRel < 0) return buf.toString('ascii');
  const dot = dotRel + 9;
  buf.copy(out, 0, 0, us);                       // 심볼
  buf.copy(out, 6, us + 1, us + 7);              // 날짜 YYMMDD
  buf.copy(out, 12, us + 7, us + 8);             // C/P
  buf.copy(out, 18 - (dot - us - 8), us + 8, dot); // 정수부 (우측 정렬)
  buf.copy(out, 18, dot + 1);                    // 소수부
  return out.toString('ascii');
}
// 구형/티커 → 서버 표기 (_transform_contract_to_new)
function toNew(contract) {
  if (contract.length <= 9 || contract.indexOf('.') >= 9) return contract;
  const symbol = contract.slice(0, 6).replace(/_+$/, '');
  const date = contract.slice(6, 12);
  const cp = contract[12];
  let whole = contract.slice(13, 18).replace(/^0+/, '');
  if (whole === '') whole = '0';
  let dec = contract.slice(18);
  if (dec[2] === '0') dec = dec.slice(0, 2);
  return `${symbol}_${date}${cp}${whole}.${dec}`;
}

// ── 구독 마스크 (_get_option_mask) ────────────────────────────────────
function optionMask({ trade = true, quote = false, refresh = false, ua = false }) {
  return (trade ? 0b0001 : 0) | (quote ? 0b0010 : 0) | (refresh ? 0b0100 : 0) | (ua ? 0b1000 : 0);
}

class OptionsWsClient {
  /**
   * @param {object} o
   * @param {string} o.apiKey            Intrinio API 키
   * @param {string} [o.provider]        'OPTIONS_EDGE'(기본) | 'OPRA'
   * @param {boolean} [o.delayed]        15분 지연으로 받기
   * @param {function} [o.onTrade]       (t) => {}
   * @param {function} [o.onQuote]       (q) => {}
   * @param {function} [o.onUnusual]     (u) => {}
   * @param {function} [o.onStatus]      (msg) => {}
   */
  constructor(o) {
    if (!o || !o.apiKey) throw new Error('apiKey 필요');
    this.apiKey = o.apiKey;
    this.provider = o.provider || 'OPTIONS_EDGE';
    this.host = PROVIDERS[this.provider];
    if (!this.host) throw new Error('알 수 없는 provider: ' + this.provider);
    this.delayed = !!o.delayed;
    this.onTrade = o.onTrade || null;
    this.onQuote = o.onQuote || null;
    this.onUnusual = o.onUnusual || null;
    this.onStatus = o.onStatus || (() => { });
    this.mask = optionMask({ trade: !!this.onTrade, quote: !!this.onQuote, ua: !!this.onUnusual });

    this.ws = null;
    this.ready = false;
    this.channels = new Set();
    this.stopped = false;
    this.retry = 0;
    this.stats = { trades: 0, quotes: 0, unusual: 0, frames: 0, lastAt: 0 };
  }

  _auth() {
    return new Promise((resolve, reject) => {
      const req = https.get(
        `https://${this.host}/auth?api_key=${encodeURIComponent(this.apiKey)}`,
        { headers: { 'Client-Information': CLIENT_INFO }, timeout: 10000 },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            if (res.statusCode !== 200) return reject(new Error(`auth HTTP ${res.statusCode}: ${d.slice(0, 120)}`));
            resolve(d.trim());
          });
        }
      );
      req.on('timeout', () => { req.destroy(); reject(new Error('auth timeout')); });
      req.on('error', reject);
    });
  }

  async start() {
    this.stopped = false;
    const token = await this._auth();
    // ⚠️ 소켓 쿼리는 vsn·token(·delayed) 만. Client-Information 은 헤더로만 보낸다.
    const url = `wss://${this.host}/socket/websocket?vsn=1.0.0&token=${token}` + (this.delayed ? '&delayed=true' : '');
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { 'Client-Information': CLIENT_INFO } });
      this.ws = ws;
      const to = setTimeout(() => { try { ws.close(); } catch { } reject(new Error('소켓 연결 타임아웃')); }, 15000);

      ws.on('open', () => {
        clearTimeout(to);
        this.ready = true;
        this.retry = 0;
        this.onStatus(`connected(${this.provider})`);
        for (const ch of this.channels) this._sendJoin(ch);
        resolve();
      });
      ws.on('message', (data, isBinary) => this._onFrame(data, isBinary));
      ws.on('unexpected-response', (_q, res) => {
        clearTimeout(to);
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => reject(new Error(`업그레이드 거부 HTTP ${res.statusCode} ${b.slice(0, 80)}`)));
      });
      ws.on('error', (e) => { clearTimeout(to); this.onStatus('error: ' + e.message); reject(e); });
      ws.on('close', (code) => {
        this.ready = false;
        this.onStatus('closed ' + code);
        if (!this.stopped) this._reconnect();
      });
    });
  }

  _reconnect() {
    this.retry++;
    // 지수 백오프 상한 60초 — 재연결 폭주로 auth 를 두들기지 않는다.
    const delay = Math.min(60000, 2000 * Math.pow(1.5, Math.min(this.retry, 10)));
    this.onStatus(`재연결 ${this.retry}회차, ${Math.round(delay / 1000)}s 후`);
    setTimeout(() => { if (!this.stopped) this.start().catch((e) => this.onStatus('재연결 실패: ' + e.message)); }, delay);
  }

  stop() {
    this.stopped = true;
    try { this.ws && this.ws.close(); } catch { }
  }

  // ── 구독 ────────────────────────────────────────────────────────────
  _sendJoin(sym) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const b = Buffer.from(sym, 'utf8');
    const m = Buffer.alloc(b.length + 2);
    m[0] = 74;          // join
    m[1] = this.mask;
    b.copy(m, 2);
    this.ws.send(m);
  }

  join(...symbols) {
    for (const s of symbols) {
      const t = toNew(String(s));
      if (this.channels.has(t)) continue;
      this.channels.add(t);
      this._sendJoin(t);
    }
  }

  /** 전 종목 스트림. ⚠️ 100Mbps+ 이고 별도 승인이 필요하다. */
  joinFirehose() { this.join('$FIREHOSE'); }

  leave(...symbols) {
    for (const s of symbols) {
      const t = toNew(String(s));
      if (!this.channels.delete(t)) continue;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) continue;
      const b = Buffer.from(t, 'utf8');
      const m = Buffer.alloc(b.length + 2);
      m[0] = 76;        // leave
      m[1] = this.mask;
      b.copy(m, 2);
      this.ws.send(m);
    }
  }

  // ── 프레임 파싱 ─────────────────────────────────────────────────────
  // 한 프레임 = [0] 메시지 개수, 이후 가변 길이 메시지가 연속으로 붙는다.
  // 메시지 종류는 각 메시지의 오프셋 22 (event type) 로 판별한다.
  _onFrame(data, isBinary) {
    if (!isBinary) { this.onStatus('text: ' + String(data).slice(0, 120)); return; }
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (d.length < 2) return;
    this.stats.frames++;
    this.stats.lastAt = Date.now();

    const count = d[0];
    let i = 1;
    for (let n = 0; n < count; n++) {
      if (i + 22 >= d.length) break;
      const type = d[i + 22];
      try {
        if (type === 1) { this._quote(d, i); i += QUOTE_SIZE; }
        else if (type === 0) { this._trade(d, i); i += TRADE_SIZE; }
        else if (type > 2) { this._unusual(d, i); i += UA_SIZE; }
        else { i += REFRESH_SIZE; }   // type 2 = refresh (미사용)
      } catch { break; }
    }
  }

  _contract(d, i) {
    const len = d[i];
    return toOld(Buffer.from(d.subarray(i + 1, i + 1 + len)));
  }

  _trade(d, i) {
    if (i + TRADE_SIZE > d.length) return;
    const pt = d[i + 23], upt = d[i + 24];
    const t = {
      contract: this._contract(d, i),
      price: scaleInt32(d.readInt32LE(i + 25), pt),
      size: d.readUInt32LE(i + 29),
      timestamp: ticksToMs(d.readBigUInt64LE(i + 33)),
      totalVolume: Number(d.readBigUInt64LE(i + 41)),
      askAtExecution: scaleInt32(d.readInt32LE(i + 49), pt),
      bidAtExecution: scaleInt32(d.readInt32LE(i + 53), pt),
      underlyingAtExecution: scaleInt32(d.readInt32LE(i + 57), upt),
      exchange: d[i + 65],
    };
    this.stats.trades++;
    if (this.onTrade) this.onTrade(t);
  }

  _quote(d, i) {
    if (i + QUOTE_SIZE > d.length) return;
    const pt = d[i + 23];
    const q = {
      contract: this._contract(d, i),
      askPrice: scaleInt32(d.readInt32LE(i + 24), pt),
      askSize: d.readUInt32LE(i + 28),
      bidPrice: scaleInt32(d.readInt32LE(i + 32), pt),
      bidSize: d.readUInt32LE(i + 36),
      timestamp: ticksToMs(d.readBigUInt64LE(i + 40)),
    };
    this.stats.quotes++;
    if (this.onQuote) this.onQuote(q);
  }

  _unusual(d, i) {
    if (i + UA_SIZE > d.length) return;
    const pt = d[i + 24], upt = d[i + 25];
    const u = {
      contract: this._contract(d, i),
      type: d[i + 22],
      totalValue: scaleUint64(d.readBigUInt64LE(i + 26), pt),
      totalSize: d.readUInt32LE(i + 34),
      averagePrice: scaleInt32(d.readInt32LE(i + 38), pt),
      askAtExecution: scaleInt32(d.readInt32LE(i + 42), pt),
      bidAtExecution: scaleInt32(d.readInt32LE(i + 46), pt),
      underlyingAtExecution: scaleInt32(d.readInt32LE(i + 50), upt),
      timestamp: ticksToMs(d.readBigUInt64LE(i + 54)),
    };
    this.stats.unusual++;
    if (this.onUnusual) this.onUnusual(u);
  }
}

module.exports = { OptionsWsClient, PROVIDERS, toNew, toOld };
