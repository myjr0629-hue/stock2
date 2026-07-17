"use client";

// ============================================================================
// SIGNUM TRADE — operator-only console (premium light "financial dashboard").
// Full Toss surface: live quote/orderbook, orders (create/modify/cancel),
// conditional orders (stop/take-profit/OCO), sellable qty, FX, US calendar,
// buy warnings — fused with SIGNUM edge data (options levels, XS picks, paper
// track, real-money gates). Every money action is two-step confirmed + capped.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './trade-console.css';

/* ── helpers ── */
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const fmt = (v: unknown, d = 2): string => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—'; };
// Toss response shapes vary (result / list / bare) — dig defensively.
const dig = (o: unknown, ...keys: string[]): unknown => {
  let c: unknown = o;
  for (const k of keys) { if (c && typeof c === 'object' && k in (c as Record<string, unknown>)) c = (c as Record<string, unknown>)[k]; else return undefined; }
  return c;
};
const firstOf = (o: unknown): Record<string, unknown> | null => {
  const r = (dig(o, 'result') ?? o) as unknown;
  if (Array.isArray(r)) return (r[0] as Record<string, unknown>) ?? null;
  const inner = (dig(r, 'prices') ?? dig(r, 'items') ?? dig(r, 'list')) as unknown;
  if (Array.isArray(inner)) return (inner[0] as Record<string, unknown>) ?? null;
  return (r as Record<string, unknown>) ?? null;
};
const pick = (o: Record<string, unknown> | null, ...names: string[]): number | null => {
  if (!o) return null;
  for (const n of names) { const v = num(o[n]); if (v != null) return v; }
  return null;
};
const listOf = (o: unknown): Record<string, unknown>[] => {
  const r = (dig(o, 'result') ?? o) as unknown;
  if (Array.isArray(r)) return r as Record<string, unknown>[];
  for (const k of ['items', 'list', 'orders', 'holdings', 'conditionalOrders']) {
    const v = dig(r, k);
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
};

/* ── types ── */
interface Gates { ic: { pass: boolean; note: string }; duel: { pass: boolean; note: string }; calib: { pass: boolean; note: string } }
interface Paper { date?: string; nav?: number; cash?: number; posValue?: number; positions?: number; newOrders?: string[]; halted?: boolean; haltReason?: string | null }
interface Journal { at: number; who: string; action: string; detail: string }
interface StatusRes {
  ok: boolean; executor: { up: boolean; configured: boolean }; kill: boolean;
  fx: unknown; usCalendar: unknown; paper: Paper | null;
  xs: { date?: string; labeled?: number; variants?: Record<string, { rolling: number | null; days: number }> } | null;
  gates: Gates; journal: Journal[];
}
interface Levels { price: number | null; maxPain: number | null; gammaFlip: number | null; callWall: number | null; putFloor: number | null }

export default function TradeConsole({ operator }: { operator: string }) {
  const [st, setSt] = useState<StatusRes | null>(null);
  const [holdings, setHoldings] = useState<Record<string, unknown>[]>([]);
  const [buyPower, setBuyPower] = useState<number | null>(null);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [conds, setConds] = useState<Record<string, unknown>[]>([]);
  const [portErr, setPortErr] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');

  /* symbol workbench */
  const [symbol, setSymbol] = useState('NVDA');
  const [symInput, setSymInput] = useState('NVDA');
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [levels, setLevels] = useState<Levels | null>(null);
  const [sellable, setSellable] = useState<number | null>(null);
  const [warn, setWarn] = useState('');
  const symRef = useRef(symbol);

  /* ticket */
  const [tab, setTab] = useState<'order' | 'cond'>('order');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [mode, setMode] = useState<'amount' | 'qty'>('amount');
  const [amount, setAmount] = useState('100');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [confirming, setConfirming] = useState(false);
  /* conditional ticket */
  const [cSide, setCSide] = useState<'SELL' | 'BUY'>('SELL');
  const [cQty, setCQty] = useState('1');
  const [cTrig, setCTrig] = useState('');
  const [cPx, setCPx] = useState('');
  const [cMode, setCMode] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [cConfirm, setCConfirm] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000); };

  /* ── loaders ── */
  const loadStatus = useCallback(() => {
    fetch('/api/admin/trade/status', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setSt(j); }).catch(() => {});
  }, []);
  const loadPortfolio = useCallback(() => {
    fetch('/api/admin/trade/portfolio', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        setHoldings(listOf(j?.holdings));
        const bp = firstOf(j?.buyingPower);
        setBuyPower(pick(bp, 'buyingPower', 'amount', 'availableAmount', 'orderableAmount'));
        setPortErr(j?.holdingsStatus >= 400 ? `계좌 조회 실패 (${j.holdingsStatus}) ${JSON.stringify(j.holdings).slice(0, 140)}` : '');
      }).catch((e) => setPortErr(String(e)));
    fetch('/api/admin/trade/orders', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setOrders(listOf(j?.orders))).catch(() => {});
    fetch('/api/admin/trade/conditional', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setConds(listOf(j?.list))).catch(() => {});
  }, []);
  const loadSymbol = useCallback((s: string) => {
    fetch(`/api/admin/trade/market?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok || symRef.current !== s) return;
        setQuote(firstOf(j.price));
        setLevels(j.levels);
        setSellable(pick(firstOf(j.sellable), 'sellableQuantity', 'quantity', 'sellable'));
        const w = listOf(j.warnings).map((x) => String(x.title ?? x.message ?? x.name ?? '')).filter(Boolean);
        setWarn(w.join(' · '));
      }).catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); const iv = setInterval(loadStatus, 30_000); return () => clearInterval(iv); }, [loadStatus]);
  useEffect(() => {
    if (st?.executor.up && st.executor.configured) { loadPortfolio(); loadSymbol(symRef.current); }
  }, [st?.executor.up, st?.executor.configured, loadPortfolio, loadSymbol]);
  useEffect(() => {
    symRef.current = symbol;
    if (st?.executor.configured) loadSymbol(symbol);
    const iv = setInterval(() => { if (symRef.current && st?.executor.configured) loadSymbol(symRef.current); }, 10_000);
    return () => clearInterval(iv);
  }, [symbol, st?.executor.configured, loadSymbol]);

  /* ── actions ── */
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
      else { body.quantity = qty; if (orderType === 'LIMIT') body.price = price; else body.estPx = price || String(livePx ?? 0); }
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
      if (j.ok) { say(`✅ 조건주문 등록 — ${symbol} 트리거 $${cTrig}`); loadPortfolio(); loadStatus(); }
      else say(`❌ ${j.error || JSON.stringify(j.result).slice(0, 160)}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };
  const cancelOrder = async (orderId: string) => {
    if (!window.confirm(`주문 ${orderId} 취소?`)) return;
    setBusy('cancel');
    try {
      const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', orderId }) });
      const j = await r.json();
      say(j.ok ? '✅ 취소 접수' : `❌ ${JSON.stringify(j.result ?? j.error).slice(0, 120)}`);
      loadPortfolio();
    } finally { setBusy(''); }
  };
  const cancelCond = async (id: string) => {
    if (!window.confirm(`조건주문 ${id} 해제?`)) return;
    const r = await fetch('/api/admin/trade/conditional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', conditionalOrderId: id }) });
    const j = await r.json();
    say(j.ok ? '✅ 조건 해제' : '❌ 실패');
    loadPortfolio();
  };
  const pickSymbol = (t: string) => { setSymbol(t); setSymInput(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  /* ── derived ── */
  const connected = Boolean(st?.executor.up && st.executor.configured);
  const livePx = pick(quote, 'close', 'price', 'last', 'tradePrice', 'currentPrice');
  const chgPct = pick(quote, 'changeRate', 'changePercent', 'changePct', 'rate');
  const fxRate = pick(firstOf(st?.fx), 'rate', 'exchangeRate', 'price', 'basePrice');
  const usOpenRaw = firstOf(st?.usCalendar);
  const usState = String(usOpenRaw?.status ?? usOpenRaw?.marketStatus ?? usOpenRaw?.state ?? '').toUpperCase();
  const notional = mode === 'amount' ? Number(amount) : Number(qty) * Number(price || livePx || 0);
  const holdValue = holdings.reduce((s, h) => s + (pick(h, 'evaluationAmount', 'evalAmount', 'marketValue') ?? 0), 0);
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
          <span className={`tc-pill ${usState.includes('OPEN') ? 'live' : ''}`}>미국장 {usState ? (usState.includes('OPEN') ? '개장' : usState.includes('CLOS') ? '휴장' : usState) : '—'}</span>
          <span className="tc-pill">$1 = ₩{fmt(fxRate, 0)}</span>
          <span className={`tc-pill ${connected ? 'live' : 'warn'}`}>{connected ? '토스 연결됨' : st?.executor.up ? '키 미설치' : '실행기 오프라인'}</span>
        </div>
        <button className={`tc-killbtn ${st?.kill ? 'on' : ''}`} onClick={toggleKill} disabled={busy === 'kill' || !st}>
          {st?.kill ? '킬스위치 ON · 해제' : 'Kill Switch'}
        </button>
      </header>

      {toast && <div className="tc-toast">{toast}</div>}
      {!connected && st && (
        <div className="tc-connect">
          <strong>연결 마무리 필요:</strong> 터미널에서 <code>node scripts/deploy-toss-executor.js</code> 실행(실행기 갱신) 후 새로고침하세요. 이미 하셨다면 Vercel Redeploy 반영을 1~2분 기다려주세요.
        </div>
      )}

      <main className="tc-body">
        {/* ═══ hero row ═══ */}
        <section className="tc-hero">
          <div className="tc-card dark">
            <div className="tc-card-label">실계좌 · 토스증권</div>
            <div className="tc-big">${fmt(holdValue + (buyPower ?? 0))}</div>
            <div className="tc-kv"><span>매수 가능</span><strong>${fmt(buyPower)}</strong></div>
            <div className="tc-kv"><span>보유 평가</span><strong>${fmt(holdValue)}</strong></div>
            {portErr && <div className="tc-mini-err">{portErr}</div>}
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

        {/* ═══ workbench: symbol + ticket ═══ */}
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
              {sellable != null && sellable > 0 && <span className="tc-pill">매도 가능 {fmt(sellable, 4)}주</span>}
            </div>
            {warn && <div className="tc-warnline">⚠ {warn}</div>}
            {levels && (levels.maxPain != null || levels.gammaFlip != null) && (
              <div className="tc-levels">
                <div className="tc-card-label">SIGNUM 옵션 구조 <span className="hint">우리 엔진 실데이터</span></div>
                <div className="tc-lvgrid">
                  {([['콜월', levels.callWall], ['감마플립', levels.gammaFlip], ['맥스페인', levels.maxPain], ['풋플로어', levels.putFloor]] as const).map(([l, v], i) => (
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
            {Array.isArray(st?.paper?.newOrders) && st.paper.newOrders.length > 0 && (
              <div className="tc-picks">
                <div className="tc-card-label">오늘의 XS 픽 <span className="hint">클릭 = 심볼 선택</span></div>
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
                  <button className={side === 'BUY' ? 'act buy' : ''} onClick={() => { setSide('BUY'); }}>매수</button>
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
                    <p>{symbol} {fmt(Number(cTrig))}$ 도달 시 {cQty}주 {cSide === 'SELL' ? '매도' : '매수'} ({cMode})<br /><b>실계좌 조건주문입니다.</b></p>
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
                  {holdings.map((h, i) => {
                    const plr = pick(h, 'profitLossRate', 'plRate', 'returnRate');
                    const sym = String(h.symbol ?? h.ticker ?? h.name ?? '—');
                    return (
                      <tr key={i} onClick={() => pickSymbol(sym)}>
                        <td className="sym">{sym}</td>
                        <td>{fmt(pick(h, 'quantity', 'qty'), 4)}</td>
                        <td>${fmt(pick(h, 'averagePrice', 'avgPrice', 'purchasePrice'))}</td>
                        <td>${fmt(pick(h, 'evaluationAmount', 'evalAmount', 'marketValue'))}</td>
                        <td className={plr != null && plr >= 0 ? 'up' : 'dn'}>{plr != null ? `${plr >= 0 ? '+' : ''}${fmt(plr)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="tc-card">
            <div className="tc-card-label">주문 · 조건주문</div>
            {orders.length === 0 && conds.length === 0 && <div className="tc-empty">{connected ? '없음' : '연결 후 표시'}</div>}
            {orders.slice(0, 8).map((o, i) => {
              const stx = String(o.status ?? '');
              const oid = String(o.orderId ?? '');
              return (
                <div className="tc-orow" key={'o' + i}>
                  <span className={`badge ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side === 'BUY' ? '매수' : '매도'}</span>
                  <b>{String(o.symbol ?? '')}</b>
                  <span className="info">{String(o.orderType ?? '')} {o.quantity ? `×${o.quantity}` : ''} {o.price ? `@$${o.price}` : ''}</span>
                  <span className="stt">{stx}</span>
                  {oid && !/FILL|CANCEL|DONE|COMPLET/i.test(stx) && <button className="tc-ghost sm" onClick={() => cancelOrder(oid)}>취소</button>}
                </div>
              );
            })}
            {conds.slice(0, 6).map((c, i) => {
              const first = (c.first ?? {}) as Record<string, unknown>;
              const cid = String(c.conditionalOrderId ?? c.id ?? '');
              return (
                <div className="tc-orow cond" key={'c' + i}>
                  <span className="badge cond">조건</span>
                  <b>{String(c.symbol ?? '')}</b>
                  <span className="info">{String(first.orderSide ?? '')} 트리거 ${String(first.triggerPrice ?? '')} ×{String(c.quantity ?? '')}</span>
                  {cid && <button className="tc-ghost sm" onClick={() => cancelCond(cid)}>해제</button>}
                </div>
              );
            })}
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
