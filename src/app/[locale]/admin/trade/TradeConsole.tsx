"use client";

// ============================================================================
// SIGNUM TRADE — operator-only console (premium light "financial dashboard").
// All data arrives NORMALIZED from our API routes (see lib/trade/normalize.ts)
// so this component renders exact fields — no shape guessing in the UI.
// Full Toss surface: quote/candles/trades/limits, orders (create/modify/cancel),
// conditional orders, rankings, sellable, FX, US calendar — fused with SIGNUM
// edge (options levels, XS picks, paper track, gates). 2-step confirm + caps.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './trade-console.css';

const fmt = (v: unknown, d = 2): string => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—'; };

/* ── API types (normalized by our routes) ── */
interface Gates { ic: { pass: boolean; note: string }; duel: { pass: boolean; note: string }; calib: { pass: boolean; note: string } }
interface Paper { date?: string; nav?: number; cash?: number; posValue?: number; positions?: number; newOrders?: string[]; halted?: boolean; haltReason?: string | null }
interface Journal { at: number; who: string; action: string; detail: string }
interface StatusRes {
  ok: boolean; executor: { up: boolean; configured: boolean }; kill: boolean;
  fx: unknown; usCalendar: unknown; paper: Paper | null;
  xs: { date?: string; labeled?: number; variants?: Record<string, { rolling: number | null; days: number }> } | null;
  gates: Gates; journal: Journal[];
}
interface Holding { symbol: string | null; name: string | null; qty: number | null; avg: number | null; px: number | null; evalAmt: number | null; plPct: number | null }
interface MarketRes {
  ok: boolean; symbol: string;
  quote: { px: number | null; chgPct: number | null; name: string | null; priceStatus: number };
  closes: number[];
  trades: { px: number | null; qty: number | null; at: string | null }[];
  limits: { upper: number | null; lower: number | null };
  sellable: number | null; warnings: (string | null)[];
  levels: { price: number | null; maxPain: number | null; gammaFlip: number | null; callWall: number | null; putFloor: number | null } | null;
}
interface RankRow { symbol: string | null; name: string | null; px: number | null; chgPct: number | null }
type OrderRow = Record<string, unknown>;

function deepNum(o: unknown, re: RegExp): number | null {
  if (o == null) return null;
  if (typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (re.test(k)) { const n = Number(v); if (Number.isFinite(n)) return n; }
  }
  for (const v of Object.values(o as Record<string, unknown>)) {
    if (v && typeof v === 'object') { const r = deepNum(v, re); if (r != null) return r; }
  }
  return null;
}

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 220, h = 44;
  const mn = Math.min(...data), mx = Math.max(...data), rg = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rg) * (h - 4) - 2}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="tc-spark" aria-hidden>
      <polyline fill="none" stroke={up ? '#0e9f6e' : '#dc2626'} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TradeConsole({ operator }: { operator: string }) {
  const [st, setSt] = useState<StatusRes | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [buyPower, setBuyPower] = useState<number | null>(null);
  const [openOrders, setOpenOrders] = useState<OrderRow[]>([]);
  const [closedOrders, setClosedOrders] = useState<OrderRow[]>([]);
  const [conds, setConds] = useState<OrderRow[]>([]);
  const [ranks, setRanks] = useState<RankRow[]>([]);
  const [rankType, setRankType] = useState('MARKET_TRADING_AMOUNT');
  const [portErr, setPortErr] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');

  const [symbol, setSymbol] = useState('NVDA');
  const [symInput, setSymInput] = useState('NVDA');
  const [mkt, setMkt] = useState<MarketRes | null>(null);
  const symRef = useRef(symbol);

  const [tab, setTab] = useState<'order' | 'cond'>('order');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [mode, setMode] = useState<'amount' | 'qty'>('amount');
  const [amount, setAmount] = useState('100');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cSide, setCSide] = useState<'SELL' | 'BUY'>('SELL');
  const [cQty, setCQty] = useState('1');
  const [cTrig, setCTrig] = useState('');
  const [cPx, setCPx] = useState('');
  const [cMode, setCMode] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [cConfirm, setCConfirm] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000); };

  const loadStatus = useCallback(() => {
    fetch('/api/admin/trade/status', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setSt(j); }).catch(() => {});
  }, []);
  const loadPortfolio = useCallback(() => {
    fetch('/api/admin/trade/portfolio', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        setHoldings(Array.isArray(j.rows) ? j.rows : []);
        setBuyPower(j.buyingPower ?? null);
        setPortErr(j.holdingsStatus >= 400 ? `계좌 조회 실패 (${j.holdingsStatus}) ${JSON.stringify(j.rawError).slice(0, 160)}` : '');
      }).catch((e) => setPortErr(String(e)));
    fetch('/api/admin/trade/orders', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { setOpenOrders(j.open || []); setClosedOrders(j.closed || []); }).catch(() => {});
    fetch('/api/admin/trade/conditional', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setConds(Array.isArray(j.list) ? j.list : [])).catch(() => {});
  }, []);
  const loadSymbol = useCallback((s: string) => {
    fetch(`/api/admin/trade/market?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok && symRef.current === s) setMkt(j); }).catch(() => {});
  }, []);
  const loadRanks = useCallback((t: string) => {
    fetch(`/api/admin/trade/rankings?type=${t}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setRanks(j.rows || []); }).catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); const iv = setInterval(loadStatus, 30_000); return () => clearInterval(iv); }, [loadStatus]);
  useEffect(() => {
    if (st?.executor.up && st.executor.configured) { loadPortfolio(); loadSymbol(symRef.current); loadRanks(rankType); }
  }, [st?.executor.up, st?.executor.configured, loadPortfolio, loadSymbol, loadRanks, rankType]);
  useEffect(() => {
    symRef.current = symbol;
    if (st?.executor.configured) loadSymbol(symbol);
    const iv = setInterval(() => { if (symRef.current && st?.executor.configured) loadSymbol(symRef.current); }, 10_000);
    return () => clearInterval(iv);
  }, [symbol, st?.executor.configured, loadSymbol]);

  const toggleKill = async () => {
    if (!st) return;
    setBusy('kill');
    try {
      const r = await fetch('/api/admin/trade/killswitch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !st.kill }) });
      const j = await r.json();
      if (j.ok) { say(j.on ? '🔴 킬스위치 ON — 전 주문 차단' : '🟢 킬스위치 해제'); loadStatus(); }
    } finally { setBusy(''); }
  };
  const submitOrder = async () => {
    setBusy('order'); setConfirming(false);
    try {
      const body: Record<string, string> = { symbol, side, orderType };
      if (mode === 'amount') body.orderAmount = amount;
      else { body.quantity = qty; if (orderType === 'LIMIT') body.price = price; else body.estPx = price || String(mkt?.quote.px ?? 0); }
      const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { say(`✅ 주문 접수 — ${symbol} ${side === 'BUY' ? '매수' : '매도'}`); loadPortfolio(); loadStatus(); }
      else say(`❌ ${j.error || JSON.stringify(j.result).slice(0, 160)}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };
  const submitCond = async () => {
    setBusy('cond'); setCConfirm(false);
    try {
      const body = {
        symbol, type: 'SINGLE', orderType: cMode, quantity: cQty,
        first: { orderSide: cSide, triggerPrice: cTrig, ...(cMode === 'LIMIT' ? { orderPrice: cPx || cTrig } : {}) },
      };
      const r = await fetch('/api/admin/trade/conditional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { say(`✅ 조건주문 등록 — ${symbol} 트리거 $${cTrig}`); loadPortfolio(); }
      else say(`❌ ${j.error || JSON.stringify(j.result).slice(0, 160)}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };
  const cancelOrder = async (orderId: string) => {
    if (!window.confirm(`주문 ${orderId} 취소?`)) return;
    const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', orderId }) });
    const j = await r.json();
    say(j.ok ? '✅ 취소 접수' : `❌ ${JSON.stringify(j.result ?? j.error).slice(0, 120)}`);
    loadPortfolio();
  };
  const modifyOrder = async (orderId: string) => {
    const np = window.prompt('새 지정가($)를 입력하세요:');
    if (!np || !(Number(np) > 0)) return;
    const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'modify', orderId, orderType: 'LIMIT', price: np }) });
    const j = await r.json();
    say(j.ok ? '✅ 정정 접수' : `❌ ${JSON.stringify(j.result ?? j.error).slice(0, 120)}`);
    loadPortfolio();
  };
  const cancelCond = async (id: string) => {
    if (!window.confirm(`조건주문 ${id} 해제?`)) return;
    const r = await fetch('/api/admin/trade/conditional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', conditionalOrderId: id }) });
    const j = await r.json();
    say(j.ok ? '✅ 조건 해제' : '❌ 실패');
    loadPortfolio();
  };
  const pickSymbol = (t: string | null) => { if (!t) return; setSymbol(t); setSymInput(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  /* ── derived ── */
  const connected = Boolean(st?.executor.up && st.executor.configured);
  const livePx = mkt?.quote.px ?? null;
  const chgPct = mkt?.quote.chgPct ?? null;
  const fxRate = deepNum(st?.fx, /rate|price/i);
  const usStateRaw = st?.usCalendar ? JSON.stringify(st.usCalendar) : '';
  const usOpen = /REGULAR|OPEN/i.test(usStateRaw) && !/CLOSED/i.test(usStateRaw.slice(0, 200));
  const notional = mode === 'amount' ? Number(amount) : Number(qty) * Number(price || livePx || 0);
  const holdValue = holdings.reduce((s, h) => s + (h.evalAmt ?? 0), 0);
  const paperRet = st?.paper?.nav != null ? (st.paper.nav - 1000) / 10 : null;
  const gatesPassed = st ? Number(st.gates.ic.pass) + Number(st.gates.duel.pass) + Number(st.gates.calib.pass) : 0;
  const today = new Date();

  return (
    <div className="tc">
      {/* ═══ header ═══ */}
      <header className="tc-top">
        <div className="tc-brand">
          <span className="tc-mark">S</span>
          <div><div className="tc-title">SIGNUM Trade</div><div className="tc-sub">{operator}</div></div>
        </div>
        <div className="tc-date">
          <span className="tc-daynum">{today.getDate()}</span>
          <span className="tc-dayrest">{today.toLocaleDateString('ko-KR', { weekday: 'short', month: 'long' })}</span>
        </div>
        <div className="tc-pills">
          <span className={`tc-pill ${usOpen ? 'live' : ''}`}>미국장 {st?.usCalendar ? (usOpen ? '개장' : '휴장/장외') : '—'}</span>
          <span className="tc-pill">$1 = ₩{fmt(fxRate, 0)}</span>
          <span className={`tc-pill ${connected ? 'live' : 'warn'}`}>{connected ? '토스 연결됨' : st?.executor.up ? '키 미설치' : '실행기 오프라인'}</span>
        </div>
        <button className={`tc-killbtn ${st?.kill ? 'on' : ''}`} onClick={toggleKill} disabled={busy === 'kill' || !st}>
          {st?.kill ? '킬스위치 ON · 해제' : 'Kill Switch'}
        </button>
      </header>

      {toast && <div className="tc-toast">{toast}</div>}
      {portErr && <div className="tc-connect"><strong>계좌 연결 문제:</strong> {portErr} — 실행기 갱신(<code>node scripts/deploy-toss-executor.js</code>) 후 새로고침 해보세요.</div>}

      <main className="tc-body">
        {/* ═══ hero ═══ */}
        <section className="tc-hero">
          <div className="tc-card dark">
            <div className="tc-card-label">실계좌 · 토스증권</div>
            <div className="tc-big">${fmt(holdValue + (buyPower ?? 0))}</div>
            <div className="tc-kv"><span>매수 가능 (USD)</span><strong>${fmt(buyPower)}</strong></div>
            <div className="tc-kv"><span>보유 평가</span><strong>${fmt(holdValue)}</strong></div>
            <div className="tc-kv"><span>보유 종목</span><strong>{holdings.length}</strong></div>
          </div>
          <div className="tc-card">
            <div className="tc-card-label">자동매매 · 페이퍼 $1,000</div>
            <div className="tc-big ink">${fmt(st?.paper?.nav ?? 1000)}
              {paperRet != null && <span className={`tc-delta ${paperRet >= 0 ? 'up' : 'dn'}`}>{paperRet >= 0 ? '+' : ''}{paperRet.toFixed(2)}%</span>}
            </div>
            <div className="tc-kv"><span>포지션</span><strong>{st?.paper?.positions ?? 0}</strong></div>
            <div className="tc-kv"><span>현금</span><strong>${fmt(st?.paper?.cash)}</strong></div>
            {st?.paper?.halted && <div className="tc-mini-err">🔴 {st.paper.haltReason}</div>}
          </div>
          <div className="tc-card accent">
            <div className="tc-card-label">실전 게이트 {gatesPassed}/3</div>
            <div className="tc-stagebar">
              <span className="on">A 페이퍼</span><span className={connected ? 'on' : ''}>B 배관</span><span className={gatesPassed === 3 ? 'on' : ''}>C 실전</span>
            </div>
            {st && ([['IC ≥ +0.03', st.gates.ic], ['V8 우위', st.gates.duel], ['데실 α>0', st.gates.calib]] as const).map(([l, g], i) => (
              <div className="tc-gate" key={i}><span className={`dot ${g.pass ? 'ok' : ''}`} /><span className="gl">{l}</span><span className="gn">{g.note}</span></div>
            ))}
          </div>
        </section>

        {/* ═══ workbench ═══ */}
        <section className="tc-work">
          <div className="tc-card grow">
            <div className="tc-symrow">
              <form onSubmit={(e) => { e.preventDefault(); if (/^[A-Z]{1,6}$/.test(symInput)) setSymbol(symInput); }}>
                <input className="tc-syminput" value={symInput} onChange={(e) => setSymInput(e.target.value.toUpperCase())} maxLength={6} placeholder="티커" />
              </form>
              <div className="tc-quote">
                <span className="px">${fmt(livePx)}</span>
                {chgPct != null && <span className={`chg ${chgPct >= 0 ? 'up' : 'dn'}`}>{chgPct >= 0 ? '+' : ''}{fmt(chgPct)}%</span>}
              </div>
              {mkt?.closes && mkt.closes.length > 1 && <Spark data={mkt.closes} />}
            </div>
            <div className="tc-metarow">
              {mkt?.quote.name && <span className="tc-pill">{mkt.quote.name}</span>}
              {mkt?.limits.upper != null && <span className="tc-pill">상한 ${fmt(mkt.limits.upper)}</span>}
              {mkt?.limits.lower != null && <span className="tc-pill">하한 ${fmt(mkt.limits.lower)}</span>}
              {mkt?.sellable != null && mkt.sellable > 0 && <span className="tc-pill live">매도가능 {fmt(mkt.sellable, 4)}주</span>}
            </div>
            {mkt?.warnings && mkt.warnings.length > 0 && <div className="tc-warnline">⚠ {mkt.warnings.join(' · ')}</div>}

            {mkt?.levels && (mkt.levels.maxPain != null || mkt.levels.gammaFlip != null) && (
              <div>
                <div className="tc-card-label">SIGNUM 옵션 구조 <span className="hint">우리 엔진 실데이터</span></div>
                <div className="tc-lvgrid">
                  {([['콜월', mkt.levels.callWall], ['감마플립', mkt.levels.gammaFlip], ['맥스페인', mkt.levels.maxPain], ['풋플로어', mkt.levels.putFloor]] as const).map(([l, v], i) => (
                    v != null ? (
                      <div className="tc-lv" key={i}>
                        <span className="l">{l}</span><span className="v">${fmt(v)}</span>
                        {livePx != null && <span className={`g ${v >= livePx ? 'up' : 'dn'}`}>{(((v - livePx) / livePx) * 100).toFixed(1)}%</span>}
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            )}

            {mkt?.trades && mkt.trades.length > 0 && (
              <div>
                <div className="tc-card-label">최근 체결</div>
                <div className="tc-trades">
                  {mkt.trades.slice(0, 8).map((t, i) => (
                    <span className="tc-trade" key={i}>${fmt(t.px)} <em>×{fmt(t.qty, 0)}</em></span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="tc-card-label">미국 랭킹
                <span className="hint">
                  {([['MARKET_TRADING_AMOUNT', '거래대금'], ['TOP_GAINERS', '상승'], ['TOP_LOSERS', '하락']] as const).map(([t, l]) => (
                    <button key={t} className={`tc-mini ${rankType === t ? 'act' : ''}`} onClick={() => { setRankType(t); loadRanks(t); }}>{l}</button>
                  ))}
                </span>
              </div>
              <div className="tc-pickrow">
                {ranks.map((r, i) => (
                  <button className={`tc-chip ${symbol === r.symbol ? 'act' : ''}`} key={i} onClick={() => pickSymbol(r.symbol)}>
                    {r.symbol}{r.chgPct != null && <em className={r.chgPct >= 0 ? 'up' : 'dn'}> {r.chgPct >= 0 ? '+' : ''}{fmt(r.chgPct, 1)}%</em>}
                  </button>
                ))}
                {ranks.length === 0 && <span className="tc-empty">{connected ? '로딩…' : '연결 후 표시'}</span>}
              </div>
            </div>

            {Array.isArray(st?.paper?.newOrders) && st.paper.newOrders.length > 0 && (
              <div>
                <div className="tc-card-label">오늘의 XS 픽 <span className="hint">자동엔진 선별 · 클릭=선택</span></div>
                <div className="tc-pickrow">
                  {st.paper.newOrders.map((o, i) => {
                    const t = String(o).split(':')[0];
                    return <button className={`tc-chip ${symbol === t ? 'act' : ''}`} key={i} onClick={() => pickSymbol(t)}>{t}</button>;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ticket */}
          <div className="tc-card ticket">
            <div className="tc-tabs">
              <button className={tab === 'order' ? 'act' : ''} onClick={() => setTab('order')}>일반 주문</button>
              <button className={tab === 'cond' ? 'act' : ''} onClick={() => setTab('cond')}>조건 주문</button>
            </div>
            {tab === 'order' ? (
              <>
                <div className="tc-seg2">
                  <button className={side === 'BUY' ? 'act buy' : ''} onClick={() => setSide('BUY')}>매수</button>
                  <button className={side === 'SELL' ? 'act sell' : ''} onClick={() => { setSide('SELL'); setMode('qty'); }}>매도</button>
                </div>
                <div className="tc-seg2">
                  <button className={orderType === 'MARKET' ? 'act' : ''} onClick={() => setOrderType('MARKET')}>시장가</button>
                  <button className={orderType === 'LIMIT' ? 'act' : ''} onClick={() => { setOrderType('LIMIT'); setMode('qty'); }}>지정가</button>
                </div>
                <div className="tc-seg2">
                  <button className={mode === 'amount' ? 'act' : ''} disabled={orderType === 'LIMIT' || side === 'SELL'} onClick={() => setMode('amount')}>금액 $</button>
                  <button className={mode === 'qty' ? 'act' : ''} onClick={() => setMode('qty')}>수량</button>
                </div>
                {mode === 'amount'
                  ? <input className="tc-field" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="주문 금액 USD" />
                  : <>
                      <input className="tc-field" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="수량 (주)" />
                      <input className="tc-field" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
                        placeholder={orderType === 'LIMIT' ? '지정가 $' : `예상가 $ (현재 ${fmt(livePx)})`} />
                    </>}
                <div className="tc-notional">예상 주문액 <strong>${fmt(notional)}</strong>{notional > 2000 && <em> 한도($2,000) 초과!</em>}</div>
                {!confirming ? (
                  <button className={`tc-go ${side === 'BUY' ? 'buy' : 'sell'}`} disabled={!connected || busy === 'order' || Boolean(st?.kill) || !(notional > 0)}
                    onClick={() => setConfirming(true)}>
                    {st?.kill ? '킬스위치 ON' : `${symbol} ${side === 'BUY' ? '매수' : '매도'}`}
                  </button>
                ) : (
                  <div className="tc-confirmbox">
                    <p>{symbol} · {side === 'BUY' ? '매수' : '매도'} · {orderType}{mode === 'amount' ? ` · $${amount}` : ` · ${qty}주${price ? ` @$${price}` : ''}`}<br /><b>실계좌 주문입니다.</b></p>
                    <div className="row">
                      <button className={`tc-go ${side === 'BUY' ? 'buy' : 'sell'}`} onClick={submitOrder} disabled={busy === 'order'}>{busy === 'order' ? '전송 중…' : '확정'}</button>
                      <button className="tc-ghost" onClick={() => setConfirming(false)}>취소</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="tc-seg2">
                  <button className={cSide === 'SELL' ? 'act sell' : ''} onClick={() => setCSide('SELL')}>매도 조건 (손절/익절)</button>
                  <button className={cSide === 'BUY' ? 'act buy' : ''} onClick={() => setCSide('BUY')}>매수 조건</button>
                </div>
                <div className="tc-seg2">
                  <button className={cMode === 'LIMIT' ? 'act' : ''} onClick={() => setCMode('LIMIT')}>지정가</button>
                  <button className={cMode === 'MARKET' ? 'act' : ''} onClick={() => setCMode('MARKET')}>시장가</button>
                </div>
                <input className="tc-field" type="number" min="1" step="any" value={cQty} onChange={(e) => setCQty(e.target.value)} placeholder="수량 (주)" />
                <input className="tc-field" type="number" min="0" step="any" value={cTrig} onChange={(e) => setCTrig(e.target.value)} placeholder={`트리거 가격 $ (현재 ${fmt(livePx)})`} />
                {cMode === 'LIMIT' && <input className="tc-field" type="number" min="0" step="any" value={cPx} onChange={(e) => setCPx(e.target.value)} placeholder="주문가 $ (비우면 트리거가)" />}
                <div className="tc-notional">도달 시 {cSide === 'SELL' ? '매도' : '매수'} · 예상 <strong>${fmt(Number(cQty) * Number(cPx || cTrig || 0))}</strong></div>
                {!cConfirm ? (
                  <button className={`tc-go ${cSide === 'BUY' ? 'buy' : 'sell'}`} disabled={!connected || Boolean(st?.kill) || !(Number(cQty) > 0) || !(Number(cTrig) > 0) || busy === 'cond'}
                    onClick={() => setCConfirm(true)}>조건 등록</button>
                ) : (
                  <div className="tc-confirmbox">
                    <p>{symbol} ${fmt(Number(cTrig))} 도달 시 {cQty}주 {cSide === 'SELL' ? '매도' : '매수'} ({cMode})<br /><b>실계좌 조건주문입니다.</b></p>
                    <div className="row">
                      <button className={`tc-go ${cSide === 'BUY' ? 'buy' : 'sell'}`} onClick={submitCond} disabled={busy === 'cond'}>{busy === 'cond' ? '전송 중…' : '확정'}</button>
                      <button className="tc-ghost" onClick={() => setCConfirm(false)}>취소</button>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="tc-caps">1회 ≤ $2,000 · 일 40건 · 전 주문 감사기록</div>
          </div>
        </section>

        {/* ═══ positions + orders ═══ */}
        <section className="tc-duo">
          <div className="tc-card">
            <div className="tc-card-label">보유 포지션 <span className="hint">클릭 = 심볼 선택</span></div>
            {holdings.length === 0 && <div className="tc-empty">{connected ? '보유 없음' : '연결 후 표시'}</div>}
            {holdings.length > 0 && (
              <table className="tc-tbl">
                <thead><tr><th>종목</th><th>수량</th><th>평단</th><th>평가</th><th>손익</th></tr></thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <tr key={i} onClick={() => pickSymbol(h.symbol)}>
                      <td className="sym">{h.symbol}{h.name && <span className="nm"> {h.name}</span>}</td>
                      <td>{fmt(h.qty, 4)}</td>
                      <td>${fmt(h.avg)}</td>
                      <td>${fmt(h.evalAmt)}</td>
                      <td className={(h.plPct ?? 0) >= 0 ? 'up' : 'dn'}>{h.plPct != null ? `${h.plPct >= 0 ? '+' : ''}${fmt(h.plPct)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="tc-card">
            <div className="tc-card-label">주문 · 조건주문</div>
            {openOrders.length === 0 && conds.length === 0 && closedOrders.length === 0 && <div className="tc-empty">{connected ? '없음' : '연결 후 표시'}</div>}
            {openOrders.slice(0, 8).map((o, i) => {
              const oid = String(o.orderId ?? o.id ?? '');
              return (
                <div className="tc-orow" key={'o' + i}>
                  <span className={`badge ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side === 'BUY' ? '매수' : '매도'}</span>
                  <b>{String(o.symbol ?? '')}</b>
                  <span className="info">{String(o.orderType ?? '')} {o.quantity ? `×${o.quantity}` : ''} {o.price ? `@$${o.price}` : ''}</span>
                  {oid && <>
                    <button className="tc-ghost sm" onClick={() => modifyOrder(oid)}>정정</button>
                    <button className="tc-ghost sm" onClick={() => cancelOrder(oid)}>취소</button>
                  </>}
                </div>
              );
            })}
            {conds.slice(0, 6).map((c, i) => {
              const first = (c.first ?? {}) as Record<string, unknown>;
              const cid = String(c.conditionalOrderId ?? c.id ?? '');
              return (
                <div className="tc-orow" key={'c' + i}>
                  <span className="badge cond">조건</span>
                  <b>{String(c.symbol ?? '')}</b>
                  <span className="info">{String(first.orderSide ?? '')} 트리거 ${String(first.triggerPrice ?? '')} ×{String(c.quantity ?? '')}</span>
                  {cid && <button className="tc-ghost sm" onClick={() => cancelCond(cid)}>해제</button>}
                </div>
              );
            })}
            {closedOrders.slice(0, 5).map((o, i) => (
              <div className="tc-orow done" key={'d' + i}>
                <span className={`badge ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side === 'BUY' ? '매수' : '매도'}</span>
                <b>{String(o.symbol ?? '')}</b>
                <span className="info">{String(o.orderType ?? '')} {o.quantity ? `×${o.quantity}` : ''} {o.price ? `@$${o.price}` : ''}</span>
                <span className="stt">{String(o.status ?? '종료')}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ engine + journal ═══ */}
        <section className="tc-duo">
          <div className="tc-card">
            <div className="tc-card-label">XS 엔진 3파전 <span className="hint">라벨 {st?.xs?.labeled ?? '—'}건 · {st?.xs?.date ?? ''}</span></div>
            <div className="tc-varrow">
              {st?.xs?.variants ? Object.entries(st.xs.variants).map(([k, v]) => (
                <div className="tc-var" key={k}><span className="k">{k === 'frozen' ? '동결' : k === 'anti' ? '반적응' : k}</span><span className="v">{v.rolling ?? '—'}</span><span className="d">{v.days}일</span></div>
              )) : <div className="tc-empty">변형 라벨 축적 중 (배포 +3거래일)</div>}
            </div>
          </div>
          <div className="tc-card">
            <div className="tc-card-label">감사 로그</div>
            {(!st || st.journal.length === 0) && <div className="tc-empty">기록 없음</div>}
            {st?.journal.slice(0, 10).map((j, i) => (
              <div className="tc-jrow" key={i}>
                <span className={`jact ${/buy/.test(j.action) ? 'up' : /sell/.test(j.action) ? 'dn' : ''}`}>{j.action}</span>
                <span className="jd">{j.detail}</span>
                <span className="jt">{new Date(j.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="tc-foot">
        수동 = 운영자 판단·2단 확인 · 자동 실전(C)은 3게이트 통과 시에만 · 킬스위치 = 즉시 전 주문 차단 · 한도 이중 강제(콘솔+실행기)
      </footer>
    </div>
  );
}
