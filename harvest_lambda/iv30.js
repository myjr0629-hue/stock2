// ============================================================================
// IV30 — 30일 고정 만기 ATM IV  [2026-10-04]
//
// 왜: IV 랭크(src/lib/ivRank.ts)가 재던 atmIv 는 «가장 가까운 만기»의 ATM IV 였다. 금요일 만기가 지나면
//   가장 가까운 만기가 다음 주로 넘어가 그 IV 가 창(최근 200행)의 최솟값이 되고, SPY·IWM·NVDA·MSFT·MU·AMZN 이
//   «IV 랭크 0%»로 나왔다(10/4 실측 — 만기 점프). 같은 종목의 IV 를 날마다 «같은 만기 길이»로 재야 비교가 된다.
//
// 정의(업계 표준 IV30 — VIX 와 같은 꼴):
//   ① 체인 날짜 d = EOD 체인의 가격 날짜(어댑터가 last_quote.last_updated 에 prices.date 를 싣는다)
//   ② 만기 일수 T = 만기일 − d (달력일). near = 30일 이하 중 가장 먼 만기, far = 30일 초과 중 가장 가까운 만기
//   ③ 만기별 ATM IV = 현재가를 사이에 둔 두 행사가의 IV(콜·풋 평균)를 행사가 기준으로 직선 보간
//      (현재가 = 기존 atmIv 와 같은 기준 — 그 실행의 현재가)
//   ④ 분산(시간 가중) 보간: σ30² · 30 = w1 · σ1² · T1 + w2 · σ2² · T2,  w1 = (T2 − 30)/(T2 − T1), w2 = (30 − T1)/(T2 − T1)
//   near·far 중 한쪽만 존재하면(만기 목록 자체가 한쪽뿐) 그 만기 값. 존재하는데 ATM 을 못 재면 null(섞지 않는다).
//
// 호출 비용(10/4 실측: GEX 106종목 중 18개 — SPY·QQQ·IWM·GLD·XLF·SMH(매일 만기)·AAPL·MSFT·AMZN·NVDA·GOOGL·META·TSLA·AMD·
//   AVGO·MU·SLV·TLT(주 3회) — 는 이미 받는 6만기가 10~14일에서 끝나 30일에 못 닿는다):
//   · 나머지 88종목은 이미 받은 6만기로 계산 — 추가 호출 0
//   · 18종목은 두 만기(28·35일 근처)의 «스마일»을 체인 날짜당 한 번만 받아 Redis 에 둔다(EOD 체인은 하루 한 번 바뀐다).
//     GEX 단계(실행 첫 1분 — 이미 Intrinio 분당 한도에 붙는 구간, 10/2 SMA 단계 429)에서는 더 부르지 않고,
//     캐시가 없거나 날짜가 지났으면 실행 «끝»(한가한 구간)에 받아 그 회차 행을 고친다 — 하루 18 × 3 = 54회.
// ============================================================================
'use strict';

/** 행에 함께 적는 정의 표식 — 웹(ivRank.ts)은 이 표식이 있는 행만 새 창으로 센다. 정의를 바꾸면 v2 로. */
const IV30_DEF = 'cm30-v1';
const TARGET_DAYS = 30;
/** 캐시에 남기는 행사가 범위(현재가 ±15%) — 장중 현재가가 움직여도 ATM 을 감쌀 만큼 */
const SMILE_BAND = 0.15;
/** ATM 을 감싸는 행사가가 현재가에서 이보다 멀면 그 만기의 ATM IV 를 재지 않는다 */
const MAX_STRIKE_GAP = 0.1;
/** 이 이상 IV(500%)는 원천 오류값 */
const MAX_IV = 5;
const DAY_MS = 86400000;

function daysBetween(fromIso, toIso) {
  const a = Date.parse(String(fromIso) + 'T00:00:00Z');
  const b = Date.parse(String(toIso) + 'T00:00:00Z');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : NaN;
}

const ivOf = (o) => Number((o && (o.implied_volatility != null ? o.implied_volatility : o.greeks && o.greeks.implied_volatility)) || 0);

/** 체인 날짜(YYYY-MM-DD) — 계약들의 last_quote.last_updated(ns, prices.date 00:00Z) 최빈값. 없으면 null. */
function chainDateOf(rows) {
  const cnt = new Map();
  for (const o of rows || []) {
    const ns = Number(o && o.last_quote && o.last_quote.last_updated);
    if (!(ns > 0)) continue;
    const ms = Math.round(ns / 1e6);
    if (!(ms > 0)) continue;
    const d = new Date(ms).toISOString().slice(0, 10);
    cnt.set(d, (cnt.get(d) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [d, c] of cnt) if (c > n || (c === n && d > best)) { best = d; n = c; }
  return best;
}

/** 행사가별 IV — [[strike, iv], …] 오름차순. 콜·풋 둘 다 있으면 평균. band 를 주면 현재가 ±band 안만. */
function smileOf(rows, spot, band) {
  const by = new Map();
  for (const o of rows || []) {
    const k = Number(o && o.details && o.details.strike_price);
    const v = ivOf(o);
    if (!(k > 0) || !(v > 0) || !(v < MAX_IV)) continue;
    if (band && spot > 0 && Math.abs(k - spot) / spot > band) continue;
    const e = by.get(k) || {};
    if (o.details.contract_type === 'put') e.p = v; else e.c = v;
    by.set(k, e);
  }
  return [...by.entries()]
    .map(([k, e]) => [k, Math.round((e.c > 0 && e.p > 0 ? (e.c + e.p) / 2 : (e.c || e.p)) * 1e4) / 1e4])
    .sort((a, b) => a[0] - b[0]);
}

/** 현재가에서의 ATM IV(소수) — 현재가를 사이에 둔 두 행사가를 직선 보간. 감싸는 행사가가 없거나 멀면 null(외삽 안 함). */
function atmIvAt(smile, spot) {
  if (!Array.isArray(smile) || !smile.length || !(spot > 0)) return null;
  let lo = null, hi = null;
  for (const p of smile) {
    if (p[0] <= spot) lo = p;
    if (p[0] >= spot) { hi = p; break; }
  }
  if (!lo || !hi) return null;
  if ((spot - lo[0]) / spot > MAX_STRIKE_GAP || (hi[0] - spot) / spot > MAX_STRIKE_GAP) return null;
  const v = hi[0] === lo[0] ? lo[1] : lo[1] + ((hi[1] - lo[1]) * (spot - lo[0])) / (hi[0] - lo[0]);
  return v > 0 ? v : null;
}

/** [{exp, days}] → { near: 30일 이하 중 가장 먼 것, far: 30일 초과 중 가장 가까운 것 } (days < 1 은 버림) */
function pickBracket(list) {
  let near = null, far = null;
  for (const x of [...(list || [])].filter((x) => x && x.days >= 1).sort((a, b) => a.days - b.days)) {
    if (x.days <= TARGET_DAYS) near = x;
    else if (!far) far = x;
  }
  return { near, far };
}

/** 분산(시간 가중) 보간 — near·far: {days, iv(소수)}. 한쪽만 있으면 그 값. */
function interpIv30(near, far) {
  if (near && far && far.days > near.days) {
    if (near.days === TARGET_DAYS) return near.iv;
    const w1 = (far.days - TARGET_DAYS) / (far.days - near.days);
    const w2 = (TARGET_DAYS - near.days) / (far.days - near.days);
    const v = (w1 * near.iv * near.iv * near.days + w2 * far.iv * far.iv * far.days) / TARGET_DAYS;
    return v > 0 ? Math.sqrt(v) : null;
  }
  const one = near || far;
  return one && one.iv > 0 ? one.iv : null;
}

/** 두 만기({exp, days, smile})와 현재가 → 결과. 이미 체인 날짜를 맞춘 입력만 받는다. */
function fromBracket(near, far, spot, chainDate, src) {
  const pt = (x) => {
    if (!x) return null;
    const iv = atmIvAt(x.smile, spot);
    return iv ? { exp: x.exp, days: x.days, iv } : null;
  };
  const n = pt(near), f = pt(far);
  if ((near && !n) || (far && !f) || (!n && !f)) return { iv30: null, reason: 'atm-missing', chainDate, src };
  const v = interpIv30(n, f);
  if (!(v > 0) || !(v < MAX_IV)) return { iv30: null, reason: 'bad-value', chainDate, src };
  return {
    iv30: Math.round(v * 10000) / 100, // %
    chainDate, src, reason: null,
    near: n ? n.exp : null, nearDays: n ? n.days : null,
    far: f ? f.exp : null, farDays: f ? f.days : null,
  };
}

/**
 * GEX 단계 — 이번 실행이 받은 6만기 체인(opts)으로 IV30.
 *   6만기가 30일을 넘어가면 그 안에서 계산(src 'chain'). 못 닿으면 캐시(같은 체인 날짜의 두 만기 스마일)로(src 'cache'),
 *   캐시가 없거나 날짜가 다르면 { iv30: null, need: 'refresh' } — 호출자는 실행 끝에 refreshBracket 으로 받는다.
 */
function planIv30(opts, spot, cache) {
  const byExp = new Map();
  for (const o of opts || []) {
    const e = o && o.details && o.details.expiration_date;
    if (!e) continue;
    if (!byExp.has(e)) byExp.set(e, []);
    byExp.get(e).push(o);
  }
  const chainDate = chainDateOf(opts);
  if (!chainDate) return { iv30: null, reason: 'no-chain-date', chainDate: null };
  if (!(spot > 0)) return { iv30: null, reason: 'no-spot', chainDate };
  const fetched = [...byExp.keys()].filter((e) => e > chainDate).sort().map((e) => ({ exp: e, days: daysBetween(chainDate, e) }));
  const last = fetched[fetched.length - 1];
  if (last && last.days > TARGET_DAYS) {
    const { near, far } = pickBracket(fetched);
    const withSmile = (x) => {
      if (!x) return null;
      const rows = byExp.get(x.exp) || [];
      if (chainDateOf(rows) !== chainDate) return { ...x, smile: [] }; // 원천 갱신 경계 — 날짜가 다른 만기는 섞지 않는다
      return { ...x, smile: smileOf(rows, spot, SMILE_BAND) };
    };
    return fromBracket(withSmile(near), withSmile(far), spot, chainDate, 'chain');
  }
  if (!cache || cache.def !== IV30_DEF || cache.d !== chainDate) {
    return { iv30: null, reason: cache ? 'cache-stale' : 'cache-miss', need: 'refresh', chainDate };
  }
  const un = (c) => (c ? { exp: c.e, days: c.t, smile: c.s } : null);
  return fromBracket(un(cache.n), un(cache.f), spot, chainDate, 'cache');
}

/**
 * 실행 끝 — 만기 목록 1회 + 두 만기 체인 2회로 캐시 값을 만든다. fetchExpirations(t, after) → ['YYYY-MM-DD'],
 * fetchChain(t, exp) → 계약 배열(어댑터 모양). 체인 날짜가 GEX 단계와 다르면(그 사이 원천 갱신) 버린다.
 */
async function refreshBracket({ ticker, chainDate, spot, fetchExpirations, fetchChain }) {
  let calls = 0;
  const all = await fetchExpirations(ticker, chainDate);
  calls++;
  const list = (all || []).filter((e) => e > chainDate).map((e) => ({ exp: e, days: daysBetween(chainDate, e) }));
  const { near, far } = pickBracket(list);
  if (!near && !far) return { cache: null, calls, reason: 'no-expiry' };
  const want = [near, far].filter(Boolean);
  const chains = await Promise.all(want.map((x) => Promise.resolve(fetchChain(ticker, x.exp)).catch(() => null)));
  calls += want.length;
  const cache = { def: IV30_DEF, d: chainDate, n: null, f: null, at: Date.now() };
  for (let i = 0; i < want.length; i++) {
    const rows = chains[i] || [];
    if (!rows.length) return { cache: null, calls, reason: 'chain-empty' };
    if (chainDateOf(rows) !== chainDate) return { cache: null, calls, reason: 'chain-date-mismatch' };
    cache[want[i] === near ? 'n' : 'f'] = { e: want[i].exp, t: want[i].days, s: smileOf(rows, spot, SMILE_BAND) };
  }
  return { cache, calls, reason: null };
}

/** signum-gex-history 행에 붙일 필드 — 표식(iv30Def)은 값이 없어도 늘 붙인다(새 창의 «행»을 세는 기준). */
function rowFields(r) {
  const out = { iv30Def: IV30_DEF };
  if (r && r.iv30 != null) {
    out.iv30 = r.iv30;
    out.iv30Date = r.chainDate;
    if (r.near) out.iv30Near = r.near;
    if (r.far) out.iv30Far = r.far;
  }
  return out;
}

module.exports = {
  IV30_DEF, TARGET_DAYS, SMILE_BAND,
  daysBetween, chainDateOf, smileOf, atmIvAt, pickBracket, interpIv30, fromBracket, planIv30, refreshBracket, rowFields,
};
