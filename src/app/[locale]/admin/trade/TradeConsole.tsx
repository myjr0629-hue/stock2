"use client";

// ============================================================================
// SIGNUM TRADE — the fusion console. Five spaces behind a side menu:
//   개요      account + paper + gates at a glance
//   트레이딩   live workbench: quote/orderbook 4s + SIGNUM VERDICT fusion card
//   X-Ray    cold, engine-grounded read of every real holding (+AI synthesis)
//   엔진 랩   calibration table, factor ICs, 3-variant race, paper NAV/trades
//   저널      audit trail + order history
// All data is normalized server-side; this file renders exact fields only.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import TradeChart from './TradeChart';
import './trade-console.css';

const fmt = (v: unknown, d = 2): string => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—'; };
const fmtCompact = (n: number): string => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));
const KO_SESS: Record<string, string> = { day: '데이마켓', pre: '프리마켓', regular: '정규장', after: '애프터마켓' };

/* ── types ── */
interface Gates { ic: { pass: boolean; note: string }; duel: { pass: boolean; note: string }; calib: { pass: boolean; note: string } }
interface Paper { date?: string; nav?: number; cash?: number; posValue?: number; positions?: number; newOrders?: string[]; halted?: boolean; haltReason?: string | null }
interface Journal { at: number; who: string; action: string; detail: string }
interface StatusRes {
  ok: boolean; executor: { up: boolean; configured: boolean }; kill: boolean;
  fxRate: number | null; usSession: string | null;
  usSessions: { key: string; start: number; end: number }[];
  paper: Paper | null;
  xs: { date?: string; labeled?: number; variants?: Record<string, { rolling: number | null; days: number }> } | null;
  gates: Gates; journal: Journal[];
}
interface Holding { symbol: string | null; name: string | null; currency: string; qty: number | null; avg: number | null; px: number | null; evalAmt: number | null; plPct: number | null; dayPct: number | null }
interface PortfolioSummary { usdValue: number | null; krwValue: number | null; plRate: number | null; dayRate: number | null }
interface MarketRes {
  ok: boolean; symbol: string;
  quote: { px: number | null; chgPct: number | null; prevClose: number | null; name: string | null; priceStatus: number };
  closes: number[];
  candles: { t: number; o: number; h: number; l: number; c: number; v: number | null }[];
  limits: { upper: number | null; lower: number | null };
  sellable: number | null; warnings: (string | null)[];
  levels: { price: number | null; maxPain: number | null; gammaFlip: number | null; callWall: number | null; putFloor: number | null } | null;
}
interface BookRow { px: number | null; vol: number | null }
interface QuoteRes { ok: boolean; symbol: string; px: number | null; asks: BookRow[]; bids: BookRow[]; trades: { px: number | null; qty: number | null; at: string | null }[]; at: number }
interface RankRow { rank: number; symbol: string | null; px: number | null; chgPct: number | null; volume: number | null; amount: number | null }
type OrderRow = Record<string, unknown>;
interface Expect { decile: number; adjF3: number; hit: number; days: number }
interface StructRead { maxPainGapPct: number | null; flipSide: 'above' | 'below' | null; toCallWallPct: number | null; toPutFloorPct: number | null; flags: string[] }
interface VerdictRes {
  ok: boolean; symbol: string;
  xs: { score: number | null; date: string | null; z: Record<string, number> | null };
  expect: Expect | null;
  metrics: Record<string, number | null> | null;
  struct: StructRead; label: string; engineDate: string | null;
}
interface XrayRow {
  symbol: string; name: string | null; currency: string; qty: number | null; px: number | null; avg: number | null;
  evalAmt: number | null; plPct: number | null; xsScore: number | null; expect: Expect | null; struct: StructRead; label: string;
  stance: { t: string; cls: string };
  metrics: { squeeze: number | null; darkPool: number | null; shortVol: number | null; pcr: number | null; iv: number | null; netGex: number | null } | null;
}
interface PickRow {
  rank: number; symbol: string; score: number; price: number | null;
  expect: Expect | null; struct: StructRead; label: string; z: Record<string, number> | null;
}
interface AutoPosition { t: string; qty: number; entryPx: number; entryAt: number; stopPx?: number | null }
interface AutoRes {
  ok: boolean; deployed: boolean;
  state: { mode: string; ver: string; capital: number; nav: number; cash: number; positions: AutoPosition[]; universeDate: string | null; updatedAt: number; execQuality?: { fills: number; lapses: number; avgSpreadBps: number | null } | null } | null;
  heartbeatAgeSec: number | null; stale: boolean;
  log: { at: number; type: string; t?: string; px?: number; qty?: number; reason?: string }[];
  report: { date: string; nav: number; dayRet: number | null; trades: number; note?: string } | null;
  navHist: { d: string; nav: number }[];
  config: { capital: number; at: number } | null;
}
interface LabRes {
  ok: boolean;
  report: { date?: string; labeled?: number; calibration: Record<string, { adjF3: number; hit: number; days: number }> | null; variants: Record<string, { rolling: number | null; days: number }> | null; rollingIC: Record<string, number> | null; weights: Record<string, number> | null; top10: string[] | null } | null;
  paper: { nav: { date: unknown; nav: unknown }[]; positions: Record<string, unknown>[]; trades: Record<string, unknown>[] };
}

type NavKey = 'overview' | 'auto' | 'picks' | 'trade' | 'xray' | 'lab' | 'journal';
// The console has three clearly-separated characters: 자동 (the engine trades,
// humans only hold the kill switch), 수동 (operator judgment + 2-step confirm),
// 시뮬레이션 (paper/validation track). Grouped nav makes the boundary visible.
const NAV_GROUPS: { title: string | null; items: { key: NavKey; label: string; icon: string }[] }[] = [
  { title: null, items: [{ key: 'overview', label: '개요', icon: '◧' }] },
  { title: '자동 AUTO', items: [{ key: 'auto', label: '오토 엔진', icon: '⚙' }, { key: 'picks', label: '선별 픽', icon: '★' }] },
  { title: '수동 MANUAL', items: [{ key: 'trade', label: '트레이딩', icon: '⇄' }, { key: 'xray', label: '포지션 X-Ray', icon: '◉' }] },
  { title: '시뮬레이션 SIM', items: [{ key: 'lab', label: '엔진 랩', icon: '∑' }] },
  { title: null, items: [{ key: 'journal', label: '저널', icon: '≡' }] },
];

// Action-explicit labels (operator directive): the verdict must read as a
// direction, not an adjective. Long-only console → "열위" = don't buy / sell if held.
const LABEL_KO: Record<string, { t: string; cls: string }> = {
  STRONG_EDGE: { t: '강한 매수 우위', cls: 'edge strong' },
  EDGE: { t: '매수 우위', cls: 'edge' },
  NEUTRAL: { t: '중립 · 관망', cls: 'neutral' },
  AGAINST: { t: '매수 부적합', cls: 'against' },
  STRONG_AGAINST: { t: '강한 매도 우위', cls: 'against strong' },
  NO_DATA: { t: '데이터 없음', cls: 'nodata' },
};
const ACTION_KO: Record<string, string> = {
  STRONG_EDGE: '판정: 신규 매수 후보 (강) — 점수 상위 + 구조 순풍',
  EDGE: '판정: 신규 매수 후보',
  NEUTRAL: '판정: 관망 — 우위 근거 없음',
  AGAINST: '판정: 신규 매수 부적합',
  STRONG_AGAINST: '판정: 신규 매수 금지 · 보유 중이면 매도/축소 검토',
  NO_DATA: '판정 불가 — 엔진 데이터 없음',
};
const Z_LABEL: Record<string, string> = {
  revChg: '1D반전', revRet3: '3D반전', gexInv: '감마', dGex5: 'ΔGEX', pcr: 'PCR', ivLow: 'IV',
  squeeze: '스퀴즈', darkPool: '다크풀', shortVol: '숏볼륨', blockTrades: '블록', analystRev: '리비전', smaExt: 'SMA', dtc: 'DTC',
};

// 24h US session strip (데이→프리→정규→애프터, 실제 캘린더 창) with a now-marker.
// Toss covers ~23h50m/day: day market = Blue Ocean ATS during Korean daytime.
function SessionBar({ sessions }: { sessions: { key: string; start: number; end: number }[] }) {
  const now = Date.now();
  const KO: Record<string, string> = { day: '데이', pre: '프리', regular: '정규장', after: '애프터' };
  // live window: the surrounding ~24h; outside any window (weekend/holiday)
  // show the upcoming session as a countdown line instead of an empty strip
  const win = sessions.filter((s) => s.end > now - 2 * 3600_000 && s.start < now + 24 * 3600_000);
  if (!win.length) {
    const next = sessions.find((s) => s.start > now);
    if (!next) return null;
    const hrs = Math.round((next.start - now) / 3600_000);
    return (
      <div className="tc-sessions-idle">
        휴장 — 다음 세션: <b>{KO_SESS[next.key] ?? next.key}</b> {new Date(next.start).toLocaleString('ko-KR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} KST (약 {hrs}시간 후)
      </div>
    );
  }
  const min = Math.min(...win.map((s) => s.start));
  const max = Math.max(...win.map((s) => s.end));
  const span = max - min;
  if (!(span > 0)) return null;
  const pct = (v: number) => `${(((v - min) / span) * 100).toFixed(2)}%`;
  return (
    <div className="tc-sessions" title="토스 미국주식 세션 (데이마켓 = 한국 낮 Blue Ocean ATS · 총 ~23시간 50분)">
      {win.map((s, i) => (
        <span key={i} className={`seg ${s.key} ${now >= s.start && now < s.end ? 'now' : ''}`}
          style={{ left: pct(s.start), width: `${(((s.end - s.start) / span) * 100).toFixed(2)}%` }}>
          {KO[s.key] ?? s.key}
        </span>
      ))}
      {now >= min && now <= max && <span className="mark" style={{ left: pct(now) }} />}
    </div>
  );
}

function Spark({ data, w = 220, h = 44, fluid = false }: { data: number[]; w?: number; h?: number; fluid?: boolean }) {
  if (data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rg = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rg) * (h - 4) - 2}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={fluid ? undefined : w} height={fluid ? undefined : h} preserveAspectRatio="none" className={`tc-spark${fluid ? ' fluid' : ''}`} aria-hidden>
      <polyline fill="none" stroke={up ? '#0e9f6e' : '#dc2626'} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Compound-growth stats from a daily NAV series (measured, not promised):
 * per-day geometric growth g, compound vs simple(no-reinvest) NAV delta,
 * and doubling time at the measured rate. */
function compoundStats(hist: { d: string; nav: number }[] | null | undefined) {
  if (!hist || hist.length < 2) return null;
  const first = hist[0], last = hist[hist.length - 1];
  if (!(first.nav > 0) || !(last.nav > 0)) return null;
  const n = hist.length - 1;
  const g = Math.pow(last.nav / first.nav, 1 / n) - 1;
  let simpleSum = 0;
  for (let i = 1; i < hist.length; i++) simpleSum += (hist[i].nav - hist[i - 1].nav) / hist[i - 1].nav;
  return {
    days: n,
    g,
    total: last.nav / first.nav - 1,
    lastNav: last.nav,
    simpleNav: first.nav * (1 + simpleSum),
    doubleDays: g > 0 ? Math.ceil(Math.log(2) / Math.log(1 + g)) : null,
  };
}

export default function TradeConsole({ operator }: { operator: string }) {
  const [nav, setNav] = useState<NavKey>('overview');
  const [st, setSt] = useState<StatusRes | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [buyPower, setBuyPower] = useState<number | null>(null);
  const [buyPowerKrw, setBuyPowerKrw] = useState<number | null>(null);
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
  const [quote, setQuote] = useState<QuoteRes | null>(null);
  const [verdict, setVerdict] = useState<VerdictRes | null>(null);
  const [flash, setFlash] = useState<'up' | 'dn' | ''>('');
  const [lastTick, setLastTick] = useState<number | null>(null);
  const symRef = useRef(symbol);
  const prevPxRef = useRef<number | null>(null);
  const visRef = useRef(true);

  const [xray, setXray] = useState<{ rows: XrayRow[]; ai: Record<string, { note: string }> | null } | null>(null);
  const [xrayLoading, setXrayLoading] = useState(false);
  const [xrayErr, setXrayErr] = useState('');
  const [lab, setLab] = useState<LabRes | null>(null);
  const [labErr, setLabErr] = useState('');
  const [picks, setPicks] = useState<PickRow[] | null>(null);
  const [picksErr, setPicksErr] = useState('');
  const [picksMeta, setPicksMeta] = useState<{ engineDate: string | null; labeled: number | null } | null>(null);
  const [auto, setAuto] = useState<AutoRes | null>(null);
  const [autoErr, setAutoErr] = useState('');
  const [realNav, setRealNav] = useState<{ d: string; nav: number }[]>([]);
  const [plan, setPlan] = useState<{
    date: string | null; capital: number; slot: number;
    rows: { rank: number; symbol: string; score: number; px: number | null; spreadBps: number | null; eligible: boolean; reasons: string[]; amount: number }[];
    totals: { deployToday: number; reservedD1D2: number; cashBuffer: number };
    mechanics: string; error?: string;
  } | null>(null);

  const [capInput, setCapInput] = useState('');
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

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (m: string) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6000); };

  /* ── loaders ── */
  const loadStatus = useCallback(() => {
    fetch('/api/admin/trade/status', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setSt(j); }).catch(() => {});
  }, []);
  const loadPortfolio = useCallback(() => {
    fetch('/api/admin/trade/portfolio', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        setHoldings(Array.isArray(j.rows) ? j.rows : []);
        setSummary(j.summary ?? null);
        setRealNav(Array.isArray(j.navHist) ? j.navHist : []);
        setBuyPower(j.buyingPowerUsd ?? null);
        setBuyPowerKrw(j.buyingPowerKrw ?? null);
        setPortErr(j.holdingsStatus >= 400 ? `계좌 조회 실패 (${j.holdingsStatus})` : '');
      }).catch((e) => setPortErr(String(e)));
    fetch('/api/admin/trade/orders', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { setOpenOrders(j.open || []); setClosedOrders(j.closed || []); }).catch(() => {});
    fetch('/api/admin/trade/conditional', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setConds(Array.isArray(j.list) ? j.list : [])).catch(() => {});
  }, []);
  const loadSymbol = useCallback((s: string) => {
    fetch(`/api/admin/trade/market?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (j.ok && symRef.current === s) setMkt(j); }).catch(() => {});
  }, []);
  const loadVerdict = useCallback((s: string, px?: number | null) => {
    fetch(`/api/admin/trade/verdict?symbol=${encodeURIComponent(s)}${px ? `&px=${px}` : ''}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (j.ok && symRef.current === s) setVerdict(j); }).catch(() => {});
  }, []);
  const loadQuote = useCallback((s: string) => {
    fetch(`/api/admin/trade/quote?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: QuoteRes) => {
        if (!j.ok || symRef.current !== s) return;
        const prev = prevPxRef.current;
        if (j.px != null && prev != null && j.px !== prev) { setFlash(j.px > prev ? 'up' : 'dn'); setTimeout(() => setFlash(''), 600); }
        if (j.px != null) prevPxRef.current = j.px;
        setQuote(j); setLastTick(Date.now());
      }).catch(() => {});
  }, []);
  const loadRanks = useCallback((t: string) => {
    fetch(`/api/admin/trade/rankings?type=${t}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setRanks(j.rows || []); }).catch(() => {});
  }, []);
  const loadXray = useCallback(() => {
    setXrayLoading(true); setXrayErr('');
    fetch('/api/admin/trade/xray', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setXray({ rows: j.rows || [], ai: j.ai ?? null }); else setXrayErr(`판독 실패 (계좌 ${j.holdingsStatus ?? '오류'})`); })
      .catch((e) => setXrayErr(String(e))).finally(() => setXrayLoading(false));
  }, []);
  const loadLab = useCallback(() => {
    setLabErr('');
    fetch('/api/admin/trade/lab', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setLab(j); else setLabErr('로드 실패'); }).catch((e) => setLabErr(String(e)));
  }, []);
  const loadPicks = useCallback(() => {
    setPicksErr('');
    fetch('/api/admin/trade/picks', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        if (j.ok) { setPicks(j.rows || []); setPicksMeta({ engineDate: j.engineDate ?? null, labeled: j.labeled ?? null }); }
        else setPicksErr('로드 실패');
      }).catch((e) => setPicksErr(String(e)));
  }, []);
  const loadAuto = useCallback(() => {
    setAutoErr('');
    fetch('/api/admin/trade/auto', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setAuto(j); else setAutoErr('로드 실패'); })
      .catch((e) => setAutoErr(String(e)));
  }, []);
  const loadPlan = useCallback(() => {
    fetch('/api/admin/trade/plan', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j.ok) setPlan(j); else setPlan({ date: null, capital: 0, slot: 0, rows: [], totals: { deployToday: 0, reservedD1D2: 0, cashBuffer: 0 }, mechanics: '', error: j.error || '플랜 로드 실패' }); })
      .catch(() => {});
  }, []);

  /* ── real-time lanes (pause when hidden) ── */
  useEffect(() => {
    visRef.current = !document.hidden; // background-tab open: start paused, not polling
    const onVis = () => {
      visRef.current = !document.hidden;
      if (visRef.current && st?.executor.configured) { loadQuote(symRef.current); loadPortfolio(); loadStatus(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [st?.executor.configured, loadQuote, loadPortfolio, loadStatus]);
  useEffect(() => { loadStatus(); const iv = setInterval(() => { if (visRef.current) loadStatus(); }, 30_000); return () => clearInterval(iv); }, [loadStatus]);
  useEffect(() => {
    if (st?.executor.up && st.executor.configured) { loadPortfolio(); loadSymbol(symRef.current); loadQuote(symRef.current); loadVerdict(symRef.current); loadPlan(); }
  }, [st?.executor.up, st?.executor.configured, loadPortfolio, loadSymbol, loadQuote, loadVerdict, loadPlan]);
  useEffect(() => {
    if (st?.executor.up && st.executor.configured) loadRanks(rankType);
  }, [rankType, st?.executor.up, st?.executor.configured, loadRanks]);
  useEffect(() => {
    if (!st?.executor.configured) return;
    const iv = setInterval(() => { if (visRef.current) loadPortfolio(); }, 15_000);
    return () => clearInterval(iv);
  }, [st?.executor.configured, loadPortfolio]);
  useEffect(() => {
    symRef.current = symbol; prevPxRef.current = null;
    setVerdict(null); setQuote(null); setMkt(null); setLastTick(null); setConfirming(false); setCConfirm(false);
    if (st?.executor.configured) { loadSymbol(symbol); loadQuote(symbol); loadVerdict(symbol); }
    const slow = setInterval(() => { if (visRef.current && st?.executor.configured) { loadSymbol(symRef.current); loadVerdict(symRef.current, prevPxRef.current); } }, 30_000);
    const fast = setInterval(() => { if (visRef.current && st?.executor.configured) loadQuote(symRef.current); }, 4_000);
    return () => { clearInterval(slow); clearInterval(fast); };
  }, [symbol, st?.executor.configured, loadSymbol, loadQuote, loadVerdict]);
  /* lazy loads per section */
  useEffect(() => { if (nav === 'xray' && !xray && st?.executor.configured) loadXray(); }, [nav, xray, st?.executor.configured, loadXray]);
  useEffect(() => { if (nav === 'lab' && !lab) loadLab(); }, [nav, lab, loadLab]);
  useEffect(() => { loadPicks(); loadAuto(); }, [loadPicks, loadAuto]); // engine-only, no executor needed
  useEffect(() => {
    if (nav !== 'auto') return;
    loadAuto();
    const iv = setInterval(() => { if (visRef.current) loadAuto(); }, 15_000);
    return () => clearInterval(iv);
  }, [nav, loadAuto]);

  /* ── derived (q/mk render-guarded: never show another symbol's data) ── */
  const connected = Boolean(st?.executor.up && st.executor.configured);
  const q = quote && quote.symbol === symbol ? quote : null;
  const mk = mkt && mkt.symbol === symbol ? mkt : null;
  const livePx = q?.px ?? mk?.quote.px ?? null;
  const prevCloseD = mk?.quote.prevClose ?? null;
  const chgPct = livePx != null && prevCloseD != null && prevCloseD > 0 ? ((livePx - prevCloseD) / prevCloseD) * 100 : (mk?.quote.chgPct ?? null);
  const fxRate = st?.fxRate ?? null;
  const usSession = st?.usSession ?? null;
  const usOpen = usSession != null && usSession !== '휴장' && usSession !== '장외';
  const nextSess = (st?.usSessions ?? []).find((s) => s.start > Date.now()) ?? null;
  const sessCls = usSession === '데이마켓' ? 'day' : usOpen ? 'live' : '';
  const effPx = orderType === 'LIMIT' ? Number(price || 0) : Number(price || livePx || 0);
  const notional = mode === 'amount' ? Number(amount) : Number(qty) * effPx;
  const usdTotal = (summary?.usdValue ?? 0) + (buyPower ?? 0);
  const paperRet = st?.paper?.nav != null ? (st.paper.nav - 1000) / 10 : null;
  const pc = compoundStats(auto?.navHist);
  const rc = compoundStats(realNav);
  const gatesPassed = st ? Number(st.gates.ic.pass) + Number(st.gates.duel.pass) + Number(st.gates.calib.pass) : 0;
  const vLabel = verdict ? LABEL_KO[verdict.label] ?? LABEL_KO.NO_DATA : null;

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
      if (j.ok) { say(`✅ 주문 접수 — ${symbol} ${side === 'BUY' ? '매수' : '매도'}`); loadPortfolio(); }
      else say(`❌ ${j.error || JSON.stringify(j.result).slice(0, 160)}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };
  const submitCond = async () => {
    setBusy('cond'); setCConfirm(false);
    try {
      const body = { symbol, type: 'SINGLE', orderType: cMode, quantity: cQty, first: { orderSide: cSide, triggerPrice: cTrig, ...(cMode === 'LIMIT' ? { orderPrice: cPx || cTrig } : {}) } };
      const r = await fetch('/api/admin/trade/conditional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { say(`✅ 조건주문 등록 — 트리거 $${cTrig}`); loadPortfolio(); }
      else say(`❌ ${j.error || JSON.stringify(j.result).slice(0, 160)}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };
  const cancelOrder = async (orderId: string) => {
    if (!window.confirm(`주문 취소?`)) return;
    const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', orderId }) });
    const j = await r.json(); say(j.ok ? '✅ 취소 접수' : '❌ 실패'); loadPortfolio();
  };
  const modifyOrder = async (orderId: string) => {
    const np = window.prompt('새 지정가($):');
    if (!np || !(Number(np) > 0)) return;
    const r = await fetch('/api/admin/trade/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'modify', orderId, orderType: 'LIMIT', price: np }) });
    const j = await r.json(); say(j.ok ? '✅ 정정 접수' : '❌ 실패'); loadPortfolio();
  };
  const cancelCond = async (id: string) => {
    if (!window.confirm(`조건 해제?`)) return;
    const r = await fetch('/api/admin/trade/conditional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', conditionalOrderId: id }) });
    const j = await r.json(); say(j.ok ? '✅ 해제' : '❌ 실패'); loadPortfolio();
  };
  const setCapital = async () => {
    const v = Number(capInput);
    if (!(v >= 100 && v <= 1_000_000)) { say('❌ 투입 자본은 $100–$1,000,000 범위'); return; }
    if (!window.confirm(`오토 엔진 투입 자본을 $${v.toLocaleString('en-US')} 로 변경합니다 (가상 트랙). 진행할까요?`)) return;
    setBusy('capital');
    try {
      const r = await fetch('/api/admin/trade/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capital: v }) });
      const j = await r.json();
      if (j.ok) { say(`✅ 자본 $${v.toLocaleString('en-US')} 설정 — 엔진이 다음 틱에 적용`); setCapInput(''); loadAuto(); }
      else say(`❌ ${j.error || '설정 실패'}`);
    } catch (e) { say('❌ ' + String(e)); } finally { setBusy(''); }
  };
  const pickSymbol = (t: string | null, opt?: { buy?: boolean }) => {
    if (!t) return;
    setSymbol(t); setSymInput(t);
    if (opt?.buy) {
      // clean buy ticket — no leftover limit price/qty/confirm from a previous symbol
      setTab('order'); setSide('BUY'); setOrderType('MARKET'); setMode('amount');
      setPrice(''); setConfirming(false); setCConfirm(false);
    }
    setNav('trade');
  };

  /* level ladder rows (sorted desc, price highlighted) */
  const ladder: { label: string; v: number; hi?: boolean }[] = [];
  if (verdict?.metrics) {
    const m = verdict.metrics;
    if (m.callWall) ladder.push({ label: '콜월', v: m.callWall });
    if (m.gammaFlip) ladder.push({ label: '감마플립', v: m.gammaFlip });
    if (livePx) ladder.push({ label: '현재가', v: livePx, hi: true });
    if (m.maxPain) ladder.push({ label: '맥스페인', v: m.maxPain });
    if (m.putFloor) ladder.push({ label: '풋플로어', v: m.putFloor });
    ladder.sort((a, b) => b.v - a.v);
  }

  /* ═══════════════ sections ═══════════════ */

  const AccountCard = (
    <div className="tc-card dark">
      <div className="tc-card-label">실계좌 · 토스증권</div>
      <div className="tc-big">${fmt(usdTotal)}
        {summary?.plRate != null && <span className={`tc-delta ${summary.plRate >= 0 ? 'up' : 'dn'}`}>{summary.plRate >= 0 ? '+' : ''}{fmt(summary.plRate)}%</span>}
      </div>
      <div className="tc-kv"><span>매수 가능 (USD)</span><strong>${fmt(buyPower)}</strong></div>
      <div className="tc-kv"><span>보유 평가 (USD)</span><strong>${fmt(summary?.usdValue)}</strong></div>
      {(summary?.krwValue ?? 0) > 0 || (buyPowerKrw ?? 0) > 0 ? (
        <div className="tc-kv"><span>원화 (평가+예수)</span><strong>₩{fmt((summary?.krwValue ?? 0) + (buyPowerKrw ?? 0), 0)}</strong></div>
      ) : null}
      <div className="tc-kv"><span>보유 {holdings.length}종목 {summary?.dayRate != null ? `· 오늘 ${summary.dayRate >= 0 ? '+' : ''}${fmt(summary.dayRate)}%` : ''}</span><strong /></div>
    </div>
  );

  const Overview = (
    <>
      <section className="tc-hero">
        {AccountCard}
        <div className="tc-card">
          <div className="tc-card-label">자동매매 · 페이퍼 $1,000 <span className="hint">가상 검증 트랙</span></div>
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
      <section className="tc-duo">
        <div className="tc-card">
          <div className="tc-card-label">복리 엔진 · 페이퍼 실측{pc ? ` (${pc.days}거래일)` : ''}</div>
          {auto?.navHist && auto.navHist.length > 1 && pc ? (
            <>
              <div style={{ marginBottom: 10 }}><Spark data={auto.navHist.map((n) => n.nav)} w={420} h={64} fluid /></div>
              <div className="tc-kv"><span>누적 수익 (복리)</span><strong className={pc.total >= 0 ? 'up' : 'dn'}>{pc.total >= 0 ? '+' : ''}{(pc.total * 100).toFixed(2)}%</strong></div>
              <div className="tc-kv"><span>실측 일복리율</span><strong>{pc.g >= 0 ? '+' : ''}{(pc.g * 100).toFixed(3)}%/일</strong></div>
              <div className="tc-kv"><span>재투자 없었다면</span><strong>${fmt(pc.simpleNav)} <span className="hint">→ 복리 프리미엄 +${fmt(pc.lastNav - pc.simpleNav)}</span></strong></div>
              <div className="tc-kv"><span>현재 속도로 자본 2배</span><strong>{pc.doubleDays ? `약 ${pc.doubleDays}거래일` : '—'}</strong></div>
            </>
          ) : <span className="tc-empty">NAV 이력 축적 중 (엔진이 매일 기록)</span>}
        </div>
        <div className="tc-card">
          <div className="tc-card-label">실계좌 복리 트랙 <span className="hint">접속 시 일별 자동 기록</span></div>
          {realNav.length > 1 && rc ? (
            <>
              <div style={{ marginBottom: 10 }}><Spark data={realNav.map((n) => n.nav)} w={420} h={64} fluid /></div>
              <div className="tc-kv"><span>기록 구간 수익 (복리)</span><strong className={rc.total >= 0 ? 'up' : 'dn'}>{rc.total >= 0 ? '+' : ''}{(rc.total * 100).toFixed(2)}%</strong></div>
              <div className="tc-kv"><span>실측 일복리율</span><strong>{rc.g >= 0 ? '+' : ''}{(rc.g * 100).toFixed(3)}%/일</strong></div>
              <div className="tc-kv"><span>현재 속도로 자본 2배</span><strong>{rc.doubleDays ? `약 ${rc.doubleDays}거래일` : '—'}</strong></div>
            </>
          ) : (
            <>
              <div className="tc-big ink">${fmt(usdTotal)}</div>
              <span className="tc-empty">복리 곡선 기록 {realNav.length === 1 ? '1일차 — 내일부터 곡선이 그려집니다' : '시작 대기'}</span>
            </>
          )}
        </div>
      </section>
      {pc && pc.g > 0 && (
        <section className="tc-card" style={{ marginBottom: 14 }}>
          <div className="tc-card-label">복리 프로젝션 <span className="hint">실측 페이퍼 일복리율의 단순 연장 · 추정치 · 게이트 판정({st?.gates?.ic?.pass ? '통과' : '대기'}) 전 참고용 — 수익 보장 아님</span></div>
          <table className="tc-tbl">
            <thead><tr><th>기간</th><th>보수 (실측의 ½)</th><th>실측 유지 시</th><th>실계좌 ${fmt(usdTotal, 0)} 환산</th></tr></thead>
            <tbody>
              {([[21, '1개월'], [63, '3개월'], [126, '6개월'], [252, '1년']] as const).map(([d, l]) => {
                const half = Math.pow(1 + pc.g / 2, d), full = Math.pow(1 + pc.g, d);
                return (
                  <tr key={d}>
                    <td>{l} ({d}거래일)</td>
                    <td>${fmt(1000 * half, 0)} <span className="hint">{((half - 1) * 100).toFixed(0)}%</span></td>
                    <td className="up">${fmt(1000 * full, 0)} <span className="hint">+{((full - 1) * 100).toFixed(0)}%</span></td>
                    <td>{usdTotal > 0 ? `$${fmt(usdTotal * full, 0)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <section className="tc-card" style={{ marginBottom: 14 }}>
        <div className="tc-vhead">
          <div className="tc-card-label">실전 포트폴리오 플랜 <span className="hint">{plan && !plan.error ? `자본 $${fmt(plan.capital, 0)} · 슬롯 $${fmt(plan.slot)} × 30 · ${plan.date ?? ''}` : '미리보기'}</span></div>
          <button className="tc-ghost sm" onClick={() => setNav('auto')}>자본 설정 →</button>
        </div>
        {plan && !plan.error && plan.rows.length > 0 ? (
          <>
            <table className="tc-tbl">
              <thead><tr><th>#</th><th>심볼</th><th>XS</th><th>현재가</th><th>스프레드</th><th>실전 적합</th><th>주문 금액</th></tr></thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.symbol} onClick={() => pickSymbol(r.symbol)} style={{ cursor: 'pointer' }}>
                    <td>{r.rank}</td>
                    <td className="sym">{r.symbol}</td>
                    <td>{fmt(r.score, 1)}</td>
                    <td>{r.px != null ? `$${fmt(r.px)}` : '—'}</td>
                    <td>{r.spreadBps != null ? `${fmt(r.spreadBps, 1)}bps` : '—'}</td>
                    <td>{r.eligible ? <span className="up">✓</span> : <span className="dn" title={r.reasons.join(' · ')}>✕ {r.reasons[0] ?? ''}</span>}</td>
                    <td>{r.amount > 0 ? `$${fmt(r.amount)}` : '현금 유지'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tc-kv" style={{ marginTop: 8 }}><span>오늘 투입</span><strong>${fmt(plan.totals.deployToday)}</strong></div>
            <div className="tc-kv"><span>D+1·D+2 코호트 예비</span><strong>${fmt(plan.totals.reservedD1D2)}</strong></div>
            <div className="tc-kv"><span>현금 버퍼</span><strong>${fmt(plan.totals.cashBuffer)}</strong></div>
            <div className="hint" style={{ marginTop: 6 }}>{plan.mechanics} · 부적합 슬롯은 그날 현금 유지(재배분 없음 — 페이퍼 트윈과 측정 연속성) · <b>C게이트 통과 + 수동 스위치 후 이 플랜 그대로 자동 발주</b></div>
          </>
        ) : <span className="tc-empty">{plan?.error ?? (connected ? '플랜 계산 중…' : '토스 연결 후 표시')}</span>}
      </section>
      <section className="tc-duo">
        <div className="tc-card">
          <div className="tc-vhead">
            <div className="tc-card-label">엔진 선별 TOP 3 <span className="hint">{picksMeta?.engineDate ?? ''} · 클릭=매수 티켓</span></div>
            <button className="tc-ghost sm" onClick={() => setNav('picks')}>전체 픽 →</button>
          </div>
          {(picks ?? []).slice(0, 3).map((p) => {
            const L = LABEL_KO[p.label] ?? LABEL_KO.NO_DATA;
            return (
              <div className="tc-orow" key={p.symbol} style={{ cursor: 'pointer' }} onClick={() => pickSymbol(p.symbol, { buy: true })}>
                <span className="badge cond">#{p.rank}</span>
                <b>{p.symbol}</b>
                <span className="info">XS {fmt(p.score, 1)}{p.expect ? ` · 실측 ${p.expect.adjF3 >= 0 ? '+' : ''}${p.expect.adjF3}%/3일${p.expect.days < 15 ? ' (검증 축적 중)' : ''}` : ''}</span>
                <span className={`tc-vlabel sm ${L.cls}`}>{L.t}</span>
              </div>
            );
          })}
          {!picks && <span className="tc-empty">{picksErr || '로딩…'}</span>}
          {picks && picks.length === 0 && <span className="tc-empty">엔진 리포트 대기</span>}
          {(st?.paper?.newOrders?.length ?? 0) > 0 && (
            <div className="tc-pickrow" style={{ marginTop: 10 }}>
              {(st?.paper?.newOrders ?? []).map((o, i) => {
                const t = String(o).split(':')[0];
                return <button className="tc-chip" key={i} onClick={() => pickSymbol(t)}>{t} <em>페이퍼 진입</em></button>;
              })}
            </div>
          )}
        </div>
        <div className="tc-card">
          <div className="tc-card-label">미국 랭킹
            <span className="hint">
              {([['MARKET_TRADING_AMOUNT', '거래대금'], ['TOP_GAINERS', '상승'], ['TOP_LOSERS', '하락']] as const).map(([t, l]) => (
                <button key={t} className={`tc-mini ${rankType === t ? 'act' : ''}`} onClick={() => setRankType(t)}>{l}</button>
              ))}
            </span>
          </div>
          {ranks.length > 0 ? (
            <table className="tc-tbl">
              <thead><tr><th>#</th><th>심볼</th><th>현재가</th><th>등락</th><th>거래대금</th></tr></thead>
              <tbody>
                {ranks.map((r) => (
                  <tr key={`${r.rank}-${r.symbol}`} onClick={() => pickSymbol(r.symbol)}>
                    <td>{r.rank}</td>
                    <td className="sym">{r.symbol}</td>
                    <td>${fmt(r.px)}</td>
                    <td className={r.chgPct != null && r.chgPct >= 0 ? 'up' : 'dn'}>{r.chgPct != null ? `${r.chgPct >= 0 ? '+' : ''}${fmt(r.chgPct, 1)}%` : '—'}</td>
                    <td>{r.amount != null ? `$${fmtCompact(r.amount)}` : r.volume != null ? fmtCompact(r.volume) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <span className="tc-empty">{connected ? '로딩…' : '연결 후 표시'}</span>}
        </div>
      </section>
    </>
  );

  const autoPos = auto?.state?.positions ?? [];
  const autoRet = auto?.state && auto.state.capital > 0 ? ((auto.state.nav - auto.state.capital) / auto.state.capital) * 100 : null;
  const LOG_BADGE: Record<string, string> = { ENTRY: 'buy', EXIT: 'sell', KILL: 'sell', REBALANCE: 'cond' };
  const Auto = (
    <section className="tc-col1">
      <div className={`tc-automode ${!auto?.deployed ? 'off' : auto.stale ? 'stale' : auto.state?.mode === 'OFF' ? 'halt' : 'run'}`}>
        {!auto && <span>{autoErr ? `⚠ ${autoErr}` : '로딩…'}</span>}
        {auto && !auto.deployed && (
          <><b>REALTIME-1 미가동</b><span>EC2 배포 대기 (또는 프록시 연결 불가) — 가동되면 이 화면에서 선별→배분→진입→청산 전 과정이 실시간으로 흐릅니다</span></>
        )}
        {auto?.deployed && auto.state && (
          <>
            <b>REALTIME-1 {auto.state.ver} · {auto.state.mode === 'PAPER' ? '페이퍼 가동 중' : auto.state.mode === 'LIVE' ? '실전 가동 중' : '정지'}</b>
            <span>{auto.stale ? `⚠ 심장박동 끊김 (${auto.heartbeatAgeSec}s 전)` : `심장박동 ${auto.heartbeatAgeSec}s 전 · 정상`}</span>
          </>
        )}
      </div>
      <div className="tc-duo">
        <div className="tc-card dark">
          <div className="tc-card-label">엔진 계정{auto?.state?.mode === 'PAPER' ? ' (가상)' : ''}</div>
          <div className="tc-big">${fmt(auto?.state?.nav ?? auto?.state?.capital ?? 0)}
            {autoRet != null && <span className={`tc-delta ${autoRet >= 0 ? 'up' : 'dn'}`}>{autoRet >= 0 ? '+' : ''}{autoRet.toFixed(2)}%</span>}
          </div>
          <div className="tc-kv"><span>투입 자본</span><strong>${fmt(auto?.state?.capital)}</strong></div>
          <div className="tc-caprow">
            <input className="tc-field slim" type="number" min={100} max={1000000} placeholder="자본 변경 ($100–1M)" value={capInput} onChange={(e) => setCapInput(e.target.value)} />
            <button className="tc-ghost sm" onClick={setCapital} disabled={busy === 'capital' || !auto?.deployed}>설정</button>
          </div>
          {auto?.config && auto.state && auto.config.capital !== auto.state.capital && (
            <div className="tc-mini-err">설정 대기: ${fmt(auto.config.capital)} — 엔진 다음 틱에 적용</div>
          )}
          <div className="tc-kv"><span>현금</span><strong>${fmt(auto?.state?.cash)}</strong></div>
          <div className="tc-kv"><span>유니버스 기준</span><strong>{auto?.state?.universeDate ?? '—'}</strong></div>
          {auto?.state?.execQuality && (
            <div className="tc-kv"><span>실행 품질</span><strong>체결 {auto.state.execQuality.fills} · 소멸 {auto.state.execQuality.lapses}{auto.state.execQuality.avgSpreadBps != null ? ` · 평균 스프레드 ${auto.state.execQuality.avgSpreadBps}bps` : ''}</strong></div>
          )}
          {autoPos.map((p, i) => (
            <div className="tc-kv" key={i}><span>{p.t} ×{fmt(p.qty, 4)}</span><strong>@${fmt(p.entryPx)}{p.stopPx ? ` · 스톱 $${fmt(p.stopPx)}` : ''}</strong></div>
          ))}
          {auto?.deployed && autoPos.length === 0 && <div className="tc-kv"><span>포지션 없음</span><strong /></div>}
        </div>
        <div className="tc-card accent">
          <div className="tc-card-label">운영 원칙 — 인간 개입 배제</div>
          <div className="tc-rules">
            <p>선별·배분·진입·청산 전 과정을 엔진이 실시간 판단합니다. 운영자 개입 수단은 <b>킬스위치 하나</b>뿐입니다.</p>
            <ul>
              <li>선별: 데일리 XS 코호트 그대로 승계 — 인간 취향 0%</li>
              <li>배분: 종목당 NAV/30 · 일 10종목 · 3거래일 롤링</li>
              <li>진입: 개장 창(ET 09:30–10:00) ask 체결 · 스프레드 50bps 가드</li>
              <li>리스크: 일중 -2% 북스톱 + 주간 -3% 킬 — 15초 실시간 평가</li>
              <li>정합: 실측 보정이 음수 확정(≥15일)이면 진입 거부</li>
              <li>승격: 쌍둥이 페이퍼 실측 3게이트 통과 시에만 실전(C)</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="tc-duo">
        <div className="tc-card">
          <div className="tc-card-label">실시간 의사결정 로그 <span className="hint">15초 갱신</span></div>
          {(auto?.log ?? []).map((l, i) => (
            <div className="tc-orow" key={i}>
              <span className={`badge ${LOG_BADGE[l.type] ?? 'cond'}`}>{l.type}</span>
              <b>{l.t ?? ''}</b>
              <span className="info">{l.px != null ? `$${fmt(l.px)}` : ''}{l.qty != null ? ` ×${fmt(l.qty, 4)}` : ''} {l.reason ?? ''}</span>
              <span className="stt">{new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
          {(auto?.log ?? []).length === 0 && <div className="tc-empty">{auto?.deployed ? '의사결정 대기' : '엔진 미가동'}</div>}
        </div>
        <div className="tc-card">
          <div className="tc-card-label">NAV 곡선 · 일일 리포트 <span className="hint">엔진 자동 생성</span></div>
          {auto?.navHist && auto.navHist.length > 1 && (
            <div style={{ marginBottom: 10 }}><Spark data={auto.navHist.map((n) => n.nav)} w={420} h={70} fluid /></div>
          )}
          {auto?.report ? (
            <>
              <div className="tc-kv"><span>{auto.report.date}</span><strong>NAV ${fmt(auto.report.nav)}{auto.report.dayRet != null ? ` (${auto.report.dayRet >= 0 ? '+' : ''}${fmt(auto.report.dayRet)}%)` : ''}</strong></div>
              <div className="tc-kv"><span>체결</span><strong>{auto.report.trades}건</strong></div>
              {auto.report.note && <div className="tc-xnote">{auto.report.note}</div>}
            </>
          ) : <div className="tc-empty">리포트 대기 (장 마감 후 자동 생성)</div>}
        </div>
      </div>
    </section>
  );

  const Picks = (
    <section className="tc-col1">
      <div className="tc-card">
        <div className="tc-vhead">
          <div className="tc-card-label">엔진 선별 TOP 10 <span className="hint">XS {picksMeta?.engineDate ?? ''} · 실측 보정 {picksMeta?.labeled ?? '—'}라벨</span></div>
          <button className="tc-ghost sm" onClick={loadPicks}>새로고침</button>
        </div>
        {!picks && <div className="tc-empty">{picksErr ? `⚠ ${picksErr} — 새로고침을 눌러주세요` : '로딩…'}</div>}
        {picks && picksErr && <div className="tc-mini-err">⚠ 새로고침 실패 — 아래는 이전 데이터</div>}
        {picks && picks.length === 0 && <div className="tc-empty">엔진 리포트 대기 (매 거래일 산출)</div>}
        {(picks ?? []).map((p) => {
          const L = LABEL_KO[p.label] ?? LABEL_KO.NO_DATA;
          return (
            <div className={`tc-pickcard ${p.rank <= 3 ? 'top3' : ''}`} key={p.symbol}>
              <span className="rank">#{p.rank}</span>
              <div className="mid" onClick={() => pickSymbol(p.symbol)}>
                <div className="top">
                  <b className="sym">{p.symbol}</b>
                  <span className="score">XS {fmt(p.score, 1)}</span>
                  <span className={`tc-vlabel sm ${L.cls}`}>{L.t}</span>
                  {p.price != null && <span className="px">${fmt(p.price)}</span>}
                </div>
                <div className="sub">
                  {p.expect && <span className={p.expect.adjF3 >= 0 ? 'up' : 'dn'}>실측 {p.expect.adjF3 >= 0 ? '+' : ''}{p.expect.adjF3}%/3일 · 적중 {p.expect.hit}% ({p.expect.days}일{p.expect.days < 15 ? ' · 검증 축적 중' : ''})</span>}
                  {p.struct.flags.slice(0, 3).map((f, i) => <span className="fl" key={i}>{f}</span>)}
                </div>
              </div>
              <button className="tc-go buy slim" onClick={() => pickSymbol(p.symbol, { buy: true })}>매수 티켓</button>
            </div>
          );
        })}
        <div className="tc-caps">선별 = XS 전 유니버스 상위 10 · 기대치 = 해당 점수대의 과거 실측(3일 시장조정 알파·적중률) · 주문은 티켓에서 2단 확인</div>
      </div>
    </section>
  );

  const VerdictCard = verdict && (
    <div className="tc-card verdict">
      <div className="tc-vhead">
        <div className="tc-card-label">SIGNUM VERDICT <span className="hint">엔진 {verdict.engineDate ?? ''} 기준</span></div>
        {vLabel && <span className={`tc-vlabel ${vLabel.cls}`}>{vLabel.t}</span>}
      </div>
      <div className="tc-action">{ACTION_KO[verdict.label] ?? ''}</div>
      <div className="tc-vbody">
        <div className="tc-vscore">
          <span className="s">{verdict.xs.score != null ? fmt(verdict.xs.score, 1) : '—'}</span>
          <span className="l">XS 스코어</span>
          {verdict.expect && (
            <div className="tc-vexpect">
              데실 {verdict.expect.decile} 실측<br />
              <b className={verdict.expect.adjF3 >= 0 ? 'up' : 'dn'}>{verdict.expect.adjF3 >= 0 ? '+' : ''}{verdict.expect.adjF3}%</b>/3일 · 적중 {verdict.expect.hit}%
              <span className="d">({verdict.expect.days}일 표본{verdict.expect.days < 15 ? ' · 검증 축적 중' : ''})</span>
            </div>
          )}
        </div>
        {ladder.length >= 3 && (
          <div className="tc-ladder">
            {ladder.map((r, i) => (
              <div className={`row ${r.hi ? 'hi' : ''}`} key={i}>
                <span className="l">{r.label}</span>
                <span className="line" />
                <span className="v">${fmt(r.v)}</span>
                {!r.hi && livePx != null && <span className={`g ${r.v >= livePx ? 'up' : 'dn'}`}>{(((r.v - livePx) / livePx) * 100).toFixed(1)}%</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {verdict.xs.z && (
        <div className="tc-zstrip">
          {Object.entries(verdict.xs.z).map(([k, v]) => (
            <span className={`z ${v >= 0.4 ? 'hot' : v <= -0.4 ? 'cold' : ''}`} key={k} title={`${k}: ${fmt(v, 3)}`}>
              {Z_LABEL[k] ?? k}<b>{v >= 0 ? '+' : ''}{fmt(v, 2)}</b>
            </span>
          ))}
        </div>
      )}
      {verdict.struct.flags.length > 0 && (
        <div className="tc-vflags">{verdict.struct.flags.map((f, i) => <span key={i} className="tc-pill warn">{f}</span>)}</div>
      )}
    </div>
  );

  const Trade = (
    <>
      <section className="tc-work">
        <div className="tc-card grow">
          <div className="tc-symrow">
            <form onSubmit={(e) => { e.preventDefault(); if (/^[A-Z]{1,6}(\.[A-Z])?$/.test(symInput)) setSymbol(symInput); }}>
              <input className="tc-syminput" value={symInput} onChange={(e) => setSymInput(e.target.value.toUpperCase())} maxLength={8} placeholder="티커" />
            </form>
            <div className="tc-quote">
              <span className={`px ${flash ? `flash-${flash}` : ''}`}>${fmt(livePx)}</span>
              {chgPct != null && <span className={`chg ${chgPct >= 0 ? 'up' : 'dn'}`}>{chgPct >= 0 ? '+' : ''}{fmt(chgPct)}%</span>}
              <span className="tc-live"><span className="dot" />{lastTick ? `${Math.max(0, Math.round((Date.now() - lastTick) / 1000))}s` : 'LIVE'}</span>
              <span className={`tc-pill ${sessCls}`}>{usSession ?? '세션 —'}</span>
            </div>
          </div>
          <div className="tc-metarow">
            {mk?.quote.name && <span className="tc-pill">{mk.quote.name}</span>}
            {mk?.sellable != null && mk.sellable > 0 && <span className="tc-pill live">매도가능 {fmt(mk.sellable, 4)}주</span>}
            {(mk?.warnings ?? []).map((w, i) => <span className="tc-pill warn" key={i}>⚠ {w}</span>)}
          </div>
          <SessionBar sessions={st?.usSessions ?? []} />
          {mk?.candles && mk.candles.length > 5 && (
            <TradeChart symbol={symbol} candles={mk.candles} livePx={q?.px ?? null} liveAt={q?.at ?? null} levels={mk.levels} />
          )}
          {VerdictCard}
          {(q?.asks?.length || q?.bids?.length) ? (
            <div className="tc-bookwrap">
              <div className="tc-book">
                <div className="tc-card-label">호가 <span className="hint">막대 = 잔량 깊이</span></div>
                {(() => {
                  const maxVol = Math.max(1, ...q!.asks.map((x) => x.vol ?? 0), ...q!.bids.map((x) => x.vol ?? 0));
                  return (
                    <>
                      {q!.asks.slice().reverse().map((a, i) => (
                        <div className="tc-bookrow ask" key={'a' + i}>
                          <span className="depth" style={{ width: `${(((a.vol ?? 0) / maxVol) * 100).toFixed(1)}%` }} />
                          <span className="p">${fmt(a.px)}</span><span className="v">{fmt(a.vol, 0)}</span>
                        </div>
                      ))}
                      <div className="tc-bookmid">${fmt(livePx)}</div>
                      {q!.bids.map((b, i) => (
                        <div className="tc-bookrow bid" key={'b' + i}>
                          <span className="depth" style={{ width: `${(((b.vol ?? 0) / maxVol) * 100).toFixed(1)}%` }} />
                          <span className="p">${fmt(b.px)}</span><span className="v">{fmt(b.vol, 0)}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
              <div className="tc-book grow">
                <div className="tc-card-label">실시간 체결 <span className="hint">4초</span></div>
                <div className="tc-trades">
                  {(q?.trades ?? []).slice(0, 8).map((t, i) => (
                    <span className="tc-trade" key={i}>${fmt(t.px)} <em>×{fmt(t.qty, 0)}</em></span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ticket */}
        <div className="tc-card ticket">
          <div className="tc-tabs">
            <button className={tab === 'order' ? 'act' : ''} onClick={() => setTab('order')}>일반 주문</button>
            <button className={tab === 'cond' ? 'act' : ''} onClick={() => setTab('cond')}>조건 주문</button>
          </div>
          {usSession === '데이마켓' && (
            <div className="tc-warnline day">데이마켓 (Blue Ocean ATS) — 유동성 얇음·지정가 권장 · 미체결 주문은 익일 09:50 KST 자동취소</div>
          )}
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
              {mode === 'amount' && usSession !== '정규장' && (
                <div className="tc-warnline">금액(소수점) 주문은 정규장 전용 (스펙 422 amount-order-outside-regular-hours) — 현재 {usSession ?? '장외'}에서는 수량 주문을 사용하세요</div>
              )}
              {mode === 'qty' && Number(qty) > 0 && !Number.isInteger(Number(qty)) && orderType === 'LIMIT' && (
                <div className="tc-warnline">지정가 주문은 정수 수량만 가능합니다 (소수점은 시장가 매도·금액 매수 전용)</div>
              )}
              {mode === 'qty' && Number(qty) > 0 && !Number.isInteger(Number(qty)) && orderType === 'MARKET' && side === 'SELL' && usSession !== '정규장' && (
                <div className="tc-warnline">소수점 수량 시장가 매도는 정규장 전용 — 정수 수량으로 조정하세요</div>
              )}
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
              <input className="tc-field" type="number" min="0" step="any" value={cTrig} onChange={(e) => setCTrig(e.target.value)} placeholder={`트리거 $ (현재 ${fmt(livePx)})`} />
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

          <div className="tc-card-label" style={{ marginTop: 16 }}>주문 · 조건</div>
          {openOrders.slice(0, 5).map((o, i) => {
            const oid = String(o.orderId ?? '');
            return (
              <div className="tc-orow" key={'o' + i}>
                <span className={`badge ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side === 'BUY' ? '매수' : '매도'}</span>
                <b>{String(o.symbol ?? '')}</b>
                <span className="info">{String(o.orderType ?? '')} {o.quantity ? `×${o.quantity}` : ''} {o.price ? `@$${o.price}` : ''}</span>
                {oid && <><button className="tc-ghost sm" onClick={() => modifyOrder(oid)}>정정</button><button className="tc-ghost sm" onClick={() => cancelOrder(oid)}>취소</button></>}
              </div>
            );
          })}
          {conds.slice(0, 4).map((c, i) => {
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
          {openOrders.length === 0 && conds.length === 0 && <div className="tc-empty">대기 주문 없음</div>}
        </div>
      </section>
    </>
  );

  const Xray = (
    <section className="tc-col1">
      <div className="tc-card">
        <div className="tc-vhead">
          <div className="tc-card-label">포지션 X-Ray <span className="hint">토스 손익 × XS 스코어 × 옵션 구조 × AI 판독 — 냉정 평가</span></div>
          <button className="tc-ghost sm" onClick={loadXray} disabled={xrayLoading}>{xrayLoading ? '판독 중…' : '재판독'}</button>
        </div>
        {!xray && <div className="tc-empty">{xrayLoading ? 'AI 판독 생성 중… (수 초)' : xrayErr ? `⚠ ${xrayErr} — 재판독을 눌러주세요` : connected ? '로딩…' : '연결 후 표시'}</div>}
        {xray?.rows.map((r, i) => {
          const L = LABEL_KO[r.label] ?? LABEL_KO.NO_DATA;
          const note = xray.ai?.[r.symbol]?.note;
          return (
            <div className="tc-xrow" key={i}>
              <div className="tc-xtop" onClick={() => pickSymbol(r.symbol)}>
                <b className="sym">{r.symbol}</b>
                <span className="nm">{r.name}</span>
                <span className={`pl ${(r.plPct ?? 0) >= 0 ? 'up' : 'dn'}`}>{r.plPct != null ? `${r.plPct >= 0 ? '+' : ''}${fmt(r.plPct)}%` : '—'}</span>
                <span className={`tc-vlabel ${L.cls}`}>{L.t}</span>
                <span className="xs">XS {r.xsScore != null ? fmt(r.xsScore, 1) : '—'}</span>
                {r.expect && <span className={`exp ${r.expect.adjF3 >= 0 ? 'up' : 'dn'}`}>실측 {r.expect.adjF3 >= 0 ? '+' : ''}{r.expect.adjF3}%/3일 · {r.expect.hit}%</span>}
              </div>
              <div className="tc-xmeta">
                <span>{fmt(r.qty, 4)}주 @ {r.currency === 'KRW' ? '₩' : '$'}{fmt(r.avg)}</span>
                {r.struct.maxPainGapPct != null && <span>맥스페인 {r.struct.maxPainGapPct >= 0 ? '+' : ''}{fmt(r.struct.maxPainGapPct, 1)}%</span>}
                {r.struct.flipSide && <span>감마플립 {r.struct.flipSide === 'above' ? '상단' : '하단'}</span>}
                {r.metrics?.squeeze != null && <span>스퀴즈 {fmt(r.metrics.squeeze, 0)}</span>}
                {r.metrics?.shortVol != null && <span>숏볼 {fmt(r.metrics.shortVol, 0)}%</span>}
                {r.metrics?.darkPool != null && <span>다크풀 {fmt(r.metrics.darkPool, 0)}%</span>}
              </div>
              <div className={`tc-stance ${r.stance?.cls ?? 'mid'}`}>{r.stance?.t ?? '판단 보류'}</div>
              {note && <div className="tc-xnote">{note}</div>}
            </div>
          );
        })}
        {xray && xray.rows.length === 0 && <div className="tc-empty">보유 없음</div>}
        <div className="tc-caps">판독·스탠스 = SIGNUM 엔진 실측 데이터 기반 단호 판정 · 실행은 운영자 결정</div>
      </div>
    </section>
  );

  const Lab = (
    <section className="tc-col1">
      <div className="tc-duo">
        <div className="tc-card">
          <div className="tc-vhead">
            <div className="tc-card-label">보정 테이블 <span className="hint">"점수의 실측 정의" — 데실별 3일 시장조정 알파 · {lab?.report?.labeled ?? '—'}라벨</span></div>
            <button className="tc-ghost sm" onClick={loadLab}>새로고침</button>
          </div>
          {lab?.report?.calibration ? (
            <table className="tc-tbl">
              <thead><tr><th>점수대</th><th>실측 α/3일</th><th>적중</th><th>표본</th></tr></thead>
              <tbody>
                {Array.from({ length: 10 }, (_, i) => 9 - i).map((d) => {
                  const c = lab.report!.calibration![String(d)];
                  if (!c) return null;
                  return (
                    <tr key={d}>
                      <td className="sym">{d * 10}–{d * 10 + 10}</td>
                      <td className={c.adjF3 >= 0 ? 'up' : 'dn'}>{c.adjF3 >= 0 ? '+' : ''}{c.adjF3}%</td>
                      <td>{c.hit}%</td>
                      <td>{c.days}일</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="tc-empty">{labErr ? `⚠ ${labErr} — 새로고침을 눌러주세요` : '로딩…'}</div>}
        </div>
        <div className="tc-card">
          <div className="tc-card-label">엔진 3파전 + 팩터 IC <span className="hint">{lab?.report?.date ?? ''}</span></div>
          <div className="tc-varrow">
            {lab?.report?.variants ? Object.entries(lab.report.variants).map(([k, v]) => (
              <div className="tc-var" key={k}><span className="k">{k === 'frozen' ? '동결' : k === 'anti' ? '반적응' : k === 'clean' ? '클린' : k === 'adaptive' ? '적응(구메인)' : k}</span><span className="v">{v.rolling ?? '—'}</span><span className="d">{v.days}일</span></div>
            )) : <span className="tc-empty">변형 라벨 축적 중</span>}
          </div>
          {lab?.report?.rollingIC && (
            <div className="tc-icbars">
              {Object.entries(lab.report.rollingIC).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div className="tc-icbar" key={k}>
                  <span className="k">{Z_LABEL[k] ?? k}</span>
                  <span className="track"><span className={`fill ${v >= 0 ? 'up' : 'dn'}`} style={{ width: `${Math.min(100, Math.abs(v) * 600)}%` }} /></span>
                  <span className={`v ${v >= 0 ? 'up' : 'dn'}`}>{v >= 0 ? '+' : ''}{fmt(v, 3)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tc-duo">
        <div className="tc-card">
          <div className="tc-card-label">페이퍼 NAV 곡선 <span className="hint">$1,000 가상 · 실전과 동일 규칙</span></div>
          {lab?.paper.nav && lab.paper.nav.length > 1
            ? <Spark data={lab.paper.nav.map((n) => Number(n.nav)).filter(Number.isFinite)} w={420} h={90} fluid />
            : <div className="tc-empty">기록 축적 중 (매 거래일 22:40 UTC)</div>}
          <div className="tc-pickrow" style={{ marginTop: 10 }}>
            {(lab?.paper.positions ?? []).map((p, i) => (
              <span className="tc-pill" key={i}>{String(p.t)} ×{fmt(p.qty, 3)} @${fmt(p.entryPx)}</span>
            ))}
            {(lab?.paper.positions ?? []).length === 0 && <span className="tc-empty">페이퍼 포지션 없음</span>}
          </div>
        </div>
        <div className="tc-card">
          <div className="tc-card-label">페이퍼 체결 이력 <span className="hint">막대 = 건별 손익%</span></div>
          {(lab?.paper.trades ?? []).length > 0 && (
            <div className="tc-pnlbars">
              {(lab?.paper.trades ?? []).slice(0, 20).slice().reverse().map((t, i) => {
                const p = Number(t.pnlPct) || 0;
                return <span key={i} className={`bar ${p >= 0 ? 'up' : 'dn'}`} style={{ height: `${Math.min(40, Math.abs(p) * 8 + 4)}px` }} title={`${String(t.sym)} ${p >= 0 ? '+' : ''}${p}%`} />;
              })}
            </div>
          )}
          {(lab?.paper.trades ?? []).slice(0, 10).map((t, i) => (
            <div className="tc-orow" key={i}>
              <span className={`badge ${Number(t.pnl) >= 0 ? 'buy' : 'sell'}`}>{Number(t.pnl) >= 0 ? '+' : ''}{fmt(t.pnlPct, 1)}%</span>
              <b>{String(t.sym)}</b>
              <span className="info">{String(t.entryDate)} ${fmt(t.entryPx)} → {String(t.exitDate)} ${fmt(t.exitPx)}</span>
              <span className="stt">{t.kill ? 'KILL' : ''}</span>
            </div>
          ))}
          {(lab?.paper.trades ?? []).length === 0 && <div className="tc-empty">아직 체결 없음</div>}
        </div>
      </div>
    </section>
  );

  const JournalSec = (
    <section className="tc-duo">
      <div className="tc-card">
        <div className="tc-card-label">감사 로그 <span className="hint">전 주문·킬스위치</span></div>
        {(!st || st.journal.length === 0) && <div className="tc-empty">기록 없음</div>}
        {st?.journal.slice(0, 14).map((j, i) => (
          <div className="tc-jrow" key={i}>
            <span className={`jact ${/buy/.test(j.action) ? 'up' : /sell/.test(j.action) ? 'dn' : ''}`}>{j.action}</span>
            <span className="jd">{j.detail}</span>
            <span className="jt">{new Date(j.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
      <div className="tc-card">
        <div className="tc-card-label">주문 이력 (토스)</div>
        {closedOrders.slice(0, 12).map((o, i) => (
          <div className="tc-orow done" key={i}>
            <span className={`badge ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side === 'BUY' ? '매수' : '매도'}</span>
            <b>{String(o.symbol ?? '')}</b>
            <span className="info">{String(o.orderType ?? '')} {o.quantity ? `×${o.quantity}` : ''} {o.price ? `@$${o.price}` : ''}</span>
            <span className="stt">{String(o.status ?? '')}</span>
          </div>
        ))}
        {closedOrders.length === 0 && <div className="tc-empty">이력 없음</div>}
      </div>
    </section>
  );

  /* ═══════════════ shell ═══════════════ */
  return (
    <div className="tc tc-shell">
      <aside className="tc-side">
        <div className="tc-brand">
          <span className="tc-mark">S</span>
          <div><div className="tc-title">SIGNUM</div><div className="tc-sub">Trade</div></div>
        </div>
        <nav className="tc-nav">
          {NAV_GROUPS.map((g, gi) => (
            <div className="tc-navgrp" key={gi}>
              {g.title && <div className="tc-navtitle">{g.title}</div>}
              {g.items.map((n) => (
                <button key={n.key} className={nav === n.key ? 'act' : ''} onClick={() => setNav(n.key)}>
                  <span className="ic">{n.icon}</span>{n.label}
                  {n.key === 'xray' && holdings.length > 0 && <span className="badge">{holdings.length}</span>}
                  {n.key === 'auto' && auto?.deployed && auto.state?.mode === 'PAPER' && !auto.stale && <span className="badge on">P</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="tc-sidefoot">
          <button className={`tc-killbtn ${st?.kill ? 'on' : ''}`} onClick={toggleKill} disabled={busy === 'kill' || !st}>
            {st?.kill ? '킬스위치 ON' : 'Kill Switch'}
          </button>
          <div className="tc-op">{operator}</div>
        </div>
      </aside>

      <div className="tc-main">
        <header className="tc-top slim">
          <div className="tc-pills">
            <span className={`tc-pill ${sessCls}`}>
              {usOpen ? `미국장 ${usSession}` : `미국장 ${usSession ?? '—'}${nextSess ? ` · 다음 ${KO_SESS[nextSess.key] ?? nextSess.key} ${new Date(nextSess.start).toLocaleString('ko-KR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`}
            </span>
            <span className="tc-pill">$1 = ₩{fmt(fxRate, 0)}</span>
            <span className={`tc-pill ${connected ? 'live' : 'warn'}`}>{connected ? '토스 연결됨' : st?.executor.up ? '키 미설치' : '실행기 오프라인'}</span>
            {st?.xs && <span className="tc-pill">XS 라벨 {st.xs.labeled ?? '—'}</span>}
          </div>
          <div className="tc-date">
            <span className="tc-daynum">{new Date().getDate()}</span>
            <span className="tc-dayrest">{new Date().toLocaleDateString('ko-KR', { weekday: 'short', month: 'long' })}</span>
          </div>
        </header>

        {toast && <div className="tc-toast">{toast}</div>}
        {portErr && <div className="tc-connect"><strong>계좌:</strong> {portErr}</div>}

        <main className="tc-body">
          {nav === 'overview' && Overview}
          {nav === 'auto' && Auto}
          {nav === 'picks' && Picks}
          {nav === 'trade' && Trade}
          {nav === 'xray' && Xray}
          {nav === 'lab' && Lab}
          {nav === 'journal' && JournalSec}
        </main>

        <footer className="tc-foot">
          수동 = 2단 확인 · 자동 실전(C)은 3게이트 통과 시에만 · 킬스위치 = 즉시 전 주문 차단 · 판정·스탠스 = SIGNUM 엔진 실측 기반 (운영자 전용 콘솔)
        </footer>
      </div>
    </div>
  );
}
