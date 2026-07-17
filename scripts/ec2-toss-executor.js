// ============================================================================
// TOSS ORDER EXECUTOR — runs on the fixed-IP EC2 (52.23.98.13), port 8090.
// The ONLY process that talks to Toss Securities Open API (IP-allowlisted).
//
// Security model (defense in depth):
//   1. HMAC-signed requests from Vercel: X-Exec-Ts + X-Exec-Sign =
//      HMAC_SHA256(EXECUTOR_SECRET, ts + "." + rawBody); ±30s replay window.
//   2. Path allowlist — only the Toss endpoints this product needs.
//   3. Hardcoded order caps (per-order notional + daily order count) enforced
//      HERE as the last line, independent of the Vercel-side caps.
//   4. Credentials live ONLY in /home/ec2-user/toss-executor/.env.toss
//      (written by the operator via scripts/setup-toss-keys.js — never in chat,
//      never in the repo). Without keys the service serves /health only.
//
// pm2: pm2 start ec2-toss-executor.js --name signum-toss-exec --time
// ============================================================================

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 8090;
const TOSS = 'https://openapi.tossinvest.com';
const ENV_FILE = path.join(process.env.HOME || '/home/ec2-user', 'toss-executor', '.env.toss');

// hard caps — deliberately NOT configurable at runtime
const MAX_ORDER_USD = 2000;   // per-order notional ceiling
const MAX_ORDERS_DAY = 40;    // daily order-creation ceiling
const REPLAY_WINDOW_MS = 30_000;

// Toss paths the executor will proxy — everything else is refused.
const ALLOW = [
  { m: 'GET', re: /^\/api\/v1\/(accounts|holdings|orders|buying-power|sellable-quantity|commissions|prices|orderbook|exchange-rate)$/ },
  { m: 'GET', re: /^\/api\/v1\/orders\/[A-Za-z0-9\-_]+$/ },
  { m: 'GET', re: /^\/api\/v1\/market-calendar\/(KR|US)$/ },
  { m: 'POST', re: /^\/api\/v1\/orders$/ },
  { m: 'POST', re: /^\/api\/v1\/orders\/[A-Za-z0-9\-_]+\/cancel$/ },
];

function loadEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch { /* not configured yet */ }
  return env;
}
let ENV = loadEnv();

// ── OAuth token cache ────────────────────────────────────────────────────────
let tok = { access: null, exp: 0 };
async function token() {
  if (tok.access && Date.now() < tok.exp - 60_000) return tok.access;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ENV.TOSS_CLIENT_ID,
    client_secret: ENV.TOSS_CLIENT_SECRET,
  });
  const r = await fetch(`${TOSS}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`token ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
  tok = { access: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tok.access;
}

// ── account number cache (first account unless TOSS_ACCOUNT is set) ─────────
let acct = null;
async function account() {
  if (ENV.TOSS_ACCOUNT) return ENV.TOSS_ACCOUNT;
  if (acct) return acct;
  const t = await token();
  const r = await fetch(`${TOSS}/api/v1/accounts`, {
    headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json();
  const list = j?.result ?? j?.accounts ?? j;
  const first = Array.isArray(list) ? list[0] : (Array.isArray(list?.accounts) ? list.accounts[0] : null);
  acct = first?.accountNo ?? first?.accountNumber ?? first?.account ?? (typeof first === 'string' ? first : null);
  if (!acct) throw new Error('account resolve failed: ' + JSON.stringify(j).slice(0, 200));
  return acct;
}

// ── daily order counter (file-persisted, survives restarts) ─────────────────
const CNT_FILE = path.join(path.dirname(ENV_FILE), 'order-count.json');
function bumpOrderCount() {
  const today = new Date().toISOString().slice(0, 10);
  let c = { d: today, n: 0 };
  try { c = JSON.parse(fs.readFileSync(CNT_FILE, 'utf8')); } catch { /* first */ }
  if (c.d !== today) c = { d: today, n: 0 };
  if (c.n >= MAX_ORDERS_DAY) return { ok: false, n: c.n };
  c.n += 1;
  try { fs.mkdirSync(path.dirname(CNT_FILE), { recursive: true }); fs.writeFileSync(CNT_FILE, JSON.stringify(c)); } catch { /* best effort */ }
  return { ok: true, n: c.n };
}

// ── request auth (HMAC) ─────────────────────────────────────────────────────
function verify(req, raw) {
  const secret = ENV.EXECUTOR_SECRET;
  if (!secret) return false;
  const ts = req.headers['x-exec-ts'];
  const sign = req.headers['x-exec-sign'];
  if (!ts || !sign) return false;
  if (Math.abs(Date.now() - Number(ts)) > REPLAY_WINDOW_MS) return false;
  const h = crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(sign))); } catch { return false; }
}

// ── order guard (last line of defense) ──────────────────────────────────────
function guardOrder(body) {
  if (body.side !== 'BUY' && body.side !== 'SELL') return '주문 방향 오류';
  const amt = body.orderAmount != null ? Number(body.orderAmount) : null;
  const qty = body.quantity != null ? Number(body.quantity) : null;
  const px = body.price != null ? Number(body.price) : null;
  let notional = null;
  if (amt != null) notional = amt;
  else if (qty != null && px != null) notional = qty * px;
  // MARKET+quantity: notional unknown here — Vercel side estimates with live
  // price and passes estNotional for the cap check.
  else if (qty != null && body.estPx != null) notional = qty * Number(body.estPx);
  if (notional == null) return 'notional 산정 불가 — estPx 필요';
  if (!(notional > 0)) return 'notional 0';
  if (notional > MAX_ORDER_USD) return `1회 한도 초과 ($${notional.toFixed(0)} > $${MAX_ORDER_USD})`;
  if (!body.clientOrderId) return 'clientOrderId(멱등키) 누락';
  return null;
}

// ── server ──────────────────────────────────────────────────────────────────
http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 64_000) req.destroy(); });
  req.on('end', async () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      if (req.method === 'GET' && req.url === '/health') {
        ENV = loadEnv();
        return send(200, { ok: true, configured: Boolean(ENV.TOSS_CLIENT_ID && ENV.TOSS_CLIENT_SECRET && ENV.EXECUTOR_SECRET), ts: Date.now() });
      }
      if (req.method !== 'POST' || req.url !== '/toss') return send(404, { error: 'not found' });
      if (!verify(req, raw)) return send(401, { error: 'unauthorized' });
      if (!ENV.TOSS_CLIENT_ID || !ENV.TOSS_CLIENT_SECRET) return send(503, { error: 'TOSS keys not configured (run setup-toss-keys)' });

      const { path: p, method = 'GET', query, body } = JSON.parse(raw || '{}');
      if (!ALLOW.some((a) => a.m === method && a.re.test(p))) return send(403, { error: `path not allowed: ${method} ${p}` });

      // order-creation guards
      let outBody = body;
      if (method === 'POST' && p === '/api/v1/orders') {
        const g = guardOrder(body || {});
        if (g) return send(422, { error: `executor guard: ${g}` });
        const c = bumpOrderCount();
        if (!c.ok) return send(429, { error: `일일 주문 한도 도달 (${MAX_ORDERS_DAY})` });
        // estPx is our internal field — strip before sending to Toss
        outBody = { ...body }; delete outBody.estPx;
      }

      const t = await token();
      const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
      if (!/^\/api\/v1\/(prices|orderbook|exchange-rate|market-calendar)/.test(p)) {
        headers['X-Tossinvest-Account'] = await account();
      }
      const qs = query ? '?' + new URLSearchParams(query).toString() : '';
      const r = await fetch(`${TOSS}${p}${qs}`, {
        method, headers,
        body: method === 'GET' ? undefined : JSON.stringify(outBody ?? {}),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await r.text();
      let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 400) }; }
      return send(r.status, j);
    } catch (e) {
      return send(500, { error: String(e.message || e).slice(0, 300) });
    }
  });
}).listen(PORT, () => console.log(`[toss-exec] listening :${PORT} — configured=${Boolean(ENV.TOSS_CLIENT_ID)}`));
