"use client";

// ============================================================================
// SIGNUM TRADE — operator-only trading console (premium dark).
// Manual orders (Toss via fixed-IP executor) + auto-trade track monitoring
// (paper engine, 3-gate status). Every dangerous action is two-step confirmed.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import './trade-console.css';

/* ── types ── */
interface Health { configured: boolean; up: boolean }
interface Gates { ic: { pass: boolean; note: string }; duel: { pass: boolean; note: string }; calib: { pass: boolean; note: string } }
interface Paper { date?: string; nav?: number; cash?: number; posValue?: number; positions?: number; newOrders?: string[]; halted?: boolean; haltReason?: string | null; tradingDay?: boolean }
interface Journal { at: number; who: string; action: string; detail: string; orderId?: string }
interface StatusRes { ok: boolean; executor: Health; kill: boolean; paper: Paper | null; xs: { date?: string; labeled?: number; variants?: Record<string, { rolling: number | null; days: number }> } | null; gates: Gates; journal: Journal[] }
interface Holding { symbol?: string; name?: string; quantity?: string | number; averagePrice?: string | number; currentPrice?: string | number; evaluationAmount?: string | number; profitLoss?: string | number; profitLossRate?: string | number; [k: string]: unknown }
interface OrderRow { orderId?: string; symbol?: string; side?: string; orderType?: string; status?: string; quantity?: string; price?: string; filledQuantity?: string; createdAt?: string; [k: string]: unknown }

const fmt = (v: unknown, d = 2): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—';
};

export default function TradeConsole({ operator }: { operator: string }) {
  const [st, setSt] = useState<StatusRes | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [buyPower, setBuyPower] = useState<string>('—');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [portErr, setPortErr] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [toast, setToast] = useState<string>('');

  /* order ticket state */
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [mode, setMode] = useState<'amount' | 'qty'>('amount');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [amount, setAmount] = useState('100');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [confirming, setConfirming] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000); };

  const loadStatus = useCallback(() => {
    fetch('/api/admin/trade/status', { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (j.ok) setSt(j); }).catch(() => {});
  }, []);

  const loadPortfolio = useCallback(() => {
    fetch('/api/admin/trade/portfolio', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const list = j?.holdings?.result ?? j?.holdings?.holdings ?? j?.holdings;
        setHoldings(Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : []);
        const bp = j?.buyingPower?.result ?? j?.buyingPower;
        setBuyPower(fmt(bp?.buyingPower ?? bp?.amount ?? bp?.availableAmount));
        if (j?.holdingsStatus >= 400) setPortErr(`계좌 조회 실패 (${j.holdingsStatus}) — ${JSON.stringify(j.holdings).slice(0, 120)}`);
        else setPortErr('');
      }).catch((e) => setPortErr(String(e)));
    fetch('/api/admin/trade/orders', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const list = j?.orders?.result ?? j?.orders?.orders ?? j?.orders;
        setOrders(Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : []);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
    const iv = setInterval(loadStatus, 30_000);
    return () => clearInterval(iv);
  }, [loadStatus]);

  useEffect(() => {
    if (st?.executor.up && st.executor.configured) loadPortfolio();
  }, [st?.executor.up, st?.executor.configured, loadPortfolio]);

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
      const body: Record<string, string> = { symbol: symbol.toUpperCase().trim(), side, orderType };
      if (mode === 'amount') body.orderAmount = amount;
      else { body.quantity = qty; if (orderType === 'LIMIT') body.price = price; else body.estPx = price || '0'; }
      const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { say(`✅ 주문 접수 — ${body.symbol} ${side} (id ${j.orderId || j.clientOrderId})`); loadPortfolio(); loadStatus(); }
      else say(`❌ ${j.error || JSON.stringify(j.result).slice(0, 140)}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };

  const cancelOrder = async (orderId: string) => {
    if (!window.confirm(`주문 ${orderId} 취소할까요?`)) return;
    setBusy('cancel');
    try {
      const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', orderId }) });
      const j = await r.json();
      say(j.ok ? '✅ 취소 접수' : `❌ ${JSON.stringify(j.result).slice(0, 120)}`);
      loadPortfolio();
    } finally { setBusy(''); }
  };

  const quickBuy = (t: string) => {
    setSymbol(t); setSide('BUY'); setMode('amount'); setOrderType('MARKET');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const connected = Boolean(st?.executor.up && st.executor.configured);
  const notionalPreview = mode === 'amount' ? Number(amount) : Number(qty) * Number(price || 0);
  const paperRet = st?.paper?.nav != null ? ((st.paper.nav - 1000) / 10).toFixed(2) : null;
  const gatesPassed = st ? Number(st.gates.ic.pass) + Number(st.gates.duel.pass) + Number(st.gates.calib.pass) : 0;

  return (
    <div className="tc-root">
      {/* ── header ── */}
      <header className="tc-head">
        <div className="tc-brand">
          <span className="tc-logo">SIGNUM</span><span className="tc-logo-sub">TRADE</span>
          <span className="tc-op">{operator}</span>
        </div>
        <div className="tc-head-right">
          <span className={`tc-chip ${connected ? 'g' : st?.executor.up ? 'a' : 'r'}`}>
            {connected ? '● 토스 연결됨' : st?.executor.up ? '● 실행기 가동 · 키 미설치' : '● 실행기 오프라인'}
          </span>
          <button className={`tc-kill ${st?.kill ? 'on' : ''}`} onClick={toggleKill} disabled={busy === 'kill' || !st}>
            {st?.kill ? '🔴 킬스위치 ON — 해제' : 'KILL SWITCH'}
          </button>
        </div>
      </header>

      {toast && <div className="tc-toast">{toast}</div>}

      {!connected && (
        <div className="tc-banner">
          <strong>API 연결 대기.</strong> ① WTS 허용 IP에 <code>52.23.98.13</code> 추가 → ② 터미널에서 <code>node scripts/deploy-toss-executor.js</code> → ③ <code>node scripts/setup-toss-keys.js</code> (키 입력) → ④ Vercel env에 <code>EXECUTOR_URL</code>·<code>EXECUTOR_SECRET</code> 추가 후 재배포. 그 전까지 주문 버튼은 실패합니다 (페이퍼 트랙은 무관하게 가동 중).
        </div>
      )}

      <main className="tc-grid">
        {/* ── left column: account + ticket ── */}
        <section className="tc-col">
          <div className="tc-card">
            <div className="tc-card-title">실계좌 <span className="tc-note">토스증권 · USD</span></div>
            <div className="tc-stats">
              <div className="tc-stat"><span className="l">매수 가능</span><span className="v">${buyPower}</span></div>
              <div className="tc-stat"><span className="l">보유 종목</span><span className="v">{holdings.length || '—'}</span></div>
            </div>
            {portErr && <div className="tc-err">{portErr}</div>}
            {holdings.length > 0 && (
              <table className="tc-table">
                <thead><tr><th>종목</th><th>수량</th><th>평단</th><th>평가</th><th>손익</th></tr></thead>
                <tbody>
                  {holdings.slice(0, 12).map((h, i) => {
                    const plr = Number(h.profitLossRate ?? h.plRate);
                    return (
                      <tr key={i}>
                        <td className="sym" onClick={() => quickBuy(String(h.symbol || ''))}>{String(h.symbol ?? h.name ?? '—')}</td>
                        <td>{fmt(h.quantity, 4)}</td>
                        <td>${fmt(h.averagePrice ?? h.avgPrice)}</td>
                        <td>${fmt(h.evaluationAmount ?? h.evalAmount)}</td>
                        <td className={plr >= 0 ? 'up' : 'dn'}>{Number.isFinite(plr) ? `${plr >= 0 ? '+' : ''}${fmt(plr)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* order ticket */}
          <div className="tc-card tc-ticket">
            <div className="tc-card-title">수동 주문 <span className="tc-note">1회 ≤ $2,000 · 일 40건 · 미국주식</span></div>
            <div className="tc-row">
              <input className="tc-input tc-sym" placeholder="티커 (예: NVDA)" value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={6} />
              <div className="tc-seg">
                <button className={side === 'BUY' ? 'act buy' : ''} onClick={() => setSide('BUY')}>매수</button>
                <button className={side === 'SELL' ? 'act sell' : ''} onClick={() => setSide('SELL')}>매도</button>
              </div>
            </div>
            <div className="tc-row">
              <div className="tc-seg">
                <button className={orderType === 'MARKET' ? 'act' : ''} onClick={() => setOrderType('MARKET')}>시장가</button>
                <button className={orderType === 'LIMIT' ? 'act' : ''} onClick={() => { setOrderType('LIMIT'); setMode('qty'); }}>지정가</button>
              </div>
              <div className="tc-seg">
                <button className={mode === 'amount' ? 'act' : ''} disabled={orderType === 'LIMIT' || side === 'SELL'}
                  onClick={() => setMode('amount')}>금액($)</button>
                <button className={mode === 'qty' ? 'act' : ''} onClick={() => setMode('qty')}>수량</button>
              </div>
            </div>
            <div className="tc-row">
              {mode === 'amount'
                ? <input className="tc-input" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="주문 금액 USD" />
                : <>
                    <input className="tc-input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="수량(주)" />
                    <input className="tc-input" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
                      placeholder={orderType === 'LIMIT' ? '지정가 $' : '예상가 $ (한도 검증용)'} />
                  </>}
            </div>
            <div className="tc-preview">
              예상 주문액 <strong>${Number.isFinite(notionalPreview) ? fmt(notionalPreview) : '—'}</strong>
              {notionalPreview > 2000 && <span className="tc-err-inline"> — 한도 초과!</span>}
            </div>
            {!confirming ? (
              <button className={`tc-submit ${side === 'BUY' ? 'buy' : 'sell'}`}
                disabled={!symbol || busy === 'order' || Boolean(st?.kill)}
                onClick={() => setConfirming(true)}>
                {st?.kill ? '킬스위치 ON — 차단됨' : `${symbol || '—'} ${side === 'BUY' ? '매수' : '매도'} 검토`}
              </button>
            ) : (
              <div className="tc-confirm">
                <span>{symbol} · {side === 'BUY' ? '매수' : '매도'} · {orderType}{mode === 'amount' ? ` · $${amount}` : ` · ${qty}주${price ? ` @$${price}` : ''}`} — 실계좌 주문입니다.</span>
                <div className="tc-confirm-btns">
                  <button className={`tc-submit ${side === 'BUY' ? 'buy' : 'sell'}`} onClick={submitOrder} disabled={busy === 'order'}>
                    {busy === 'order' ? '전송 중…' : '확정 주문'}
                  </button>
                  <button className="tc-ghost" onClick={() => setConfirming(false)}>취소</button>
                </div>
              </div>
            )}
          </div>

          {/* open orders */}
          <div className="tc-card">
            <div className="tc-card-title">주문 내역 <span className="tc-note">토스 실계좌</span></div>
            {orders.length === 0 && <div className="tc-empty">주문 없음</div>}
            {orders.slice(0, 10).map((o, i) => (
              <div className="tc-order" key={i}>
                <span className={`tc-side ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side === 'BUY' ? '매수' : '매도'}</span>
                <span className="tc-order-sym">{String(o.symbol || '—')}</span>
                <span className="tc-order-info">{String(o.orderType || '')} {o.quantity ? `×${o.quantity}` : ''} {o.price ? `@$${o.price}` : ''}</span>
                <span className="tc-order-st">{String(o.status || '')}</span>
                {o.orderId && !/FILLED|CANCELLED|CANCELED|DONE/i.test(String(o.status || '')) && (
                  <button className="tc-ghost sm" onClick={() => cancelOrder(String(o.orderId))} disabled={busy === 'cancel'}>취소</button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── right column: auto-trade track ── */}
        <section className="tc-col">
          <div className="tc-card tc-auto">
            <div className="tc-card-title">자동매매 트랙 <span className="tc-note">사전등록 §42.3-5 · 단계 게이트</span></div>
            <div className="tc-stage">
              <div className="tc-stage-item on">A 페이퍼<span>가동 중</span></div>
              <div className="tc-stage-item">B 배관 테스트<span>키 연결 후</span></div>
              <div className={`tc-stage-item ${gatesPassed === 3 ? 'ready' : 'lock'}`}>C 실전 $1,000<span>게이트 {gatesPassed}/3</span></div>
            </div>
            <div className="tc-gates">
              {st && ([['IC ≥ +0.03', st.gates.ic], ['V8 맞대결 우위', st.gates.duel], ['상위데실 α > 0', st.gates.calib]] as const).map(([label, g], i) => (
                <div className="tc-gate" key={i}>
                  <span className={`tc-dot ${g.pass ? 'g' : 'r'}`} />
                  <span className="tc-gate-l">{label}</span>
                  <span className="tc-gate-n">{g.note}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tc-card">
            <div className="tc-card-title">페이퍼 트랙 <span className="tc-note">$1,000 가상 · 실전과 동일 규칙</span></div>
            {st?.paper ? (
              <>
                <div className="tc-stats">
                  <div className="tc-stat big"><span className="l">NAV</span><span className="v">${fmt(st.paper.nav)}</span>
                    {paperRet && <span className={`d ${Number(paperRet) >= 0 ? 'up' : 'dn'}`}>{Number(paperRet) >= 0 ? '+' : ''}{paperRet}%</span>}</div>
                  <div className="tc-stat"><span className="l">현금</span><span className="v">${fmt(st.paper.cash)}</span></div>
                  <div className="tc-stat"><span className="l">포지션</span><span className="v">{st.paper.positions ?? 0}</span></div>
                </div>
                {st.paper.halted && <div className="tc-err">🔴 정지: {st.paper.haltReason}</div>}
                {Array.isArray(st.paper.newOrders) && st.paper.newOrders.length > 0 && (
                  <>
                    <div className="tc-sub">내일 진입 예정 (XS 상위데실)</div>
                    <div className="tc-picks">
                      {st.paper.newOrders.map((o, i) => {
                        const t = String(o).split(':')[0];
                        return (
                          <button className="tc-pick" key={i} onClick={() => quickBuy(t)} title="클릭 = 수동 주문 티켓에 채우기">
                            <span className="t">{t}</span><span className="a">{String(o).split(':')[1]}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="tc-note" style={{ marginTop: 6 }}>픽 클릭 → 왼쪽 티켓에 자동 입력 (실계좌 수동 매수용)</div>
                  </>
                )}
              </>
            ) : <div className="tc-empty">페이퍼 데이터 대기 (첫 기록: 다음 평일 22:40 UTC)</div>}
            {st?.xs?.variants && (
              <div className="tc-variants">
                <span className="tc-sub">엔진 3파전 (롤링 IC)</span>
                {Object.entries(st.xs.variants).map(([k, v]) => (
                  <span className="tc-var" key={k}>{k}: {v.rolling ?? '—'} ({v.days}일)</span>
                ))}
              </div>
            )}
          </div>

          <div className="tc-card">
            <div className="tc-card-title">감사 로그 <span className="tc-note">전 주문·킬스위치 기록</span></div>
            {(!st || st.journal.length === 0) && <div className="tc-empty">기록 없음</div>}
            {st?.journal.map((j, i) => (
              <div className="tc-jrow" key={i}>
                <span className={`tc-jact ${/buy/.test(j.action) ? 'buy' : /sell/.test(j.action) ? 'sell' : ''}`}>{j.action}</span>
                <span className="tc-jdetail">{j.detail}</span>
                <span className="tc-jtime">{new Date(j.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="tc-foot">
        수동 주문 = 운영자 판단·운영자 계좌 · 자동 실전(C)은 3게이트 통과 후에만 활성화 · 킬스위치는 즉시 전 주문 차단 · 모든 행위 감사 기록
      </footer>
    </div>
  );
}
