'use client';

import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { MobileAppFooter } from '@/components/mobile/MobileAppFooter';
import { AdBanner } from '@/components/app/AdBanner';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { SwipeableTabs } from '@/components/app/SwipeableTabs';
import { ValueWall } from '@/components/app/ValueWall';
import { AppGexTimeline } from '@/components/app/AppGexTimeline';
import { App5DayTape } from '@/components/app/App5DayTape';
import { MetricInfo } from '@/components/app/MetricInfo';
import { readDarkPool, effectiveRegime } from '@/lib/darkPoolRead';
import { DisclosureBadge } from '@/components/app/DisclosureBadge';
import type { MetricTerm } from '@/components/app/metricGlossary';
import s from './cmd.module.css';

// WebSocket real-time price hooks
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import { buildInsiderSignal } from '@/services/insiderSignal';

/* ═══════════════════════════════════════════
   DEMO DATA — used when API is unreachable
   ═══════════════════════════════════════════ */
// ══════════════════════════════════════════════════════════════
// [2026-08-31] 티커별 «마지막 성공 페이로드» 캐시.
//
// 왜 (대표 지적): 「로딩되었다가 다시 조회할 때마다 다시 저렇게 로딩이 길게 뜬다」
//   원인은 서버가 아니었다(5개 엔드포인트 웜 230~290ms · 콜드 600~670ms 병렬).
//   화면이 **티커가 바뀔 때마다 setLoading(true) 로 스켈레톤부터 다시 그리고**,
//   5개 fetch 가 «전부» 끝나야 해제했다. 게다가 전부 `cache:'no-store'` 라
//   방금 본 종목도 처음부터 다시 받았다.
//
// → 봤던 종목이면 곧바로 그 화면을 그리고(스켈레톤 없음), 갱신은 뒤에서 조용히.
//   ⚠️ 너무 오래된 값을 «현재 시세»처럼 보여주면 안 된다 — 수치는 신뢰의 문제다.
//      MAX_AGE 를 넘긴 캐시는 즉시 렌더에 쓰지 않고 정상 로딩으로 간다.
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ★★ 차트 데이터 — 페이지와 «동시에» 출발시킨다  [2026-09-04]
//
// [무엇이 틀렸었나]  이 화면은 `loading || !data` 면 통째로 스켈레톤이다.
//   그래서 CandleChart 는 본 데이터가 **다 온 뒤에야 마운트**되고,
//   그제서야 자기 요청을 시작했다 — 완전한 폭포수다.
//   실측: 본 데이터 2~3초 + 차트 1.5~3초 = 차트가 뜨기까지 **4~6초**.
//   대표 지적 「차트가 너무 늦게 나온다」의 정체가 이것이다.
//
// [고친 방법]  요청을 컴포넌트 밖으로 꺼낸다.
//   · 페이지가 티커를 알게 된 **그 순간** 1D 를 미리 띄운다(나머지 5개와 동시).
//   · CandleChart 는 같은 함수를 부른다 → 이미 날아간 요청을 나눠 받거나
//     캐시에서 즉시 꺼낸다. 왕복이 겹치지 않는다.
//   · 봤던 (종목·기간) 은 즉시 그린다 — 스켈레톤을 다시 보여줄 이유가 없다.
// ══════════════════════════════════════════════════════════════
type Candle = { o: number; h: number; l: number; c: number; dateET: string; session: string };
const CHART_CACHE = new Map<string, { at: number; rows: Candle[] }>();
const CHART_INFLIGHT = new Map<string, Promise<Candle[] | null>>();
const CHART_MAX_AGE_MS = 60 * 1000;   // 1D 는 장중에 움직인다 — 1분이면 충분히 신선하다
const CHART_CACHE_MAX = 24;

async function loadChart(ticker: string, range: string): Promise<Candle[] | null> {
  const key = `${ticker}:${range}`;
  const hit = CHART_CACHE.get(key);
  if (hit && Date.now() - hit.at < CHART_MAX_AGE_MS) return hit.rows;
  const flying = CHART_INFLIGHT.get(key);
  if (flying) return flying;

  const p = (async (): Promise<Candle[] | null> => {
    try {
      const r = await fetch(`/api/chart?symbol=${ticker}&range=${range.toLowerCase()}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const json = await r.json();
      if (!Array.isArray(json?.data) || json.data.length === 0) return null;
      const toPrice = (v: unknown): number | null => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const mapped: Candle[] = json.data.flatMap((item: any) => {
        if (item?._gapBreak) return [];
        const close = toPrice(item.close);
        if (close === null) return [];
        const open = toPrice(item.open) ?? close;
        const high = toPrice(item.high) ?? Math.max(open, close);
        const low = toPrice(item.low) ?? Math.min(open, close);
        return [{
          o: open,
          h: Math.max(high, open, close),
          l: Math.min(low, open, close),
          c: close,
          dateET: item.dateET ?? '',
          session: item.session ?? 'REG',
        }];
      });
      if (mapped.length === 0) return null;
      CHART_CACHE.set(key, { at: Date.now(), rows: mapped });
      if (CHART_CACHE.size > CHART_CACHE_MAX) {
        const oldest = CHART_CACHE.keys().next().value;
        if (oldest) CHART_CACHE.delete(oldest);
      }
      return mapped;
    } catch {
      return null;
    } finally {
      CHART_INFLIGHT.delete(key);
    }
  })();
  CHART_INFLIGHT.set(key, p);
  return p;
}

const CMD_CACHE = new Map<string, { at: number; data: any }>();
const CMD_CACHE_MAX = 24;
const CMD_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

const DEMO = {
  ticker: 'NVDA',
  company: 'NVIDIA Corp',
  price: 0,
  change: 0,
  changePct: 0,
  up: true,
  rsi14: 0,
  vwap: 0,
  high: 0,
  low: 0,
  session: 'REG' as const,
  analyst: { rating: '—', target: 0, targetHigh: 0, targetLow: 0, buy: 0, hold: 0, sell: 0, totalAnalysts: 0, bullishPct: 0, events: null as any },
  fundamentals: [
    { label: 'P / E', value: '—', sub: '', trend: 'up' },
    { label: 'ROE', value: '—', sub: '', trend: 'up' },
    { label: 'REVENUE TTM', value: '—', sub: '', trend: 'up' },
    { label: 'EPS', value: '—', sub: '', trend: 'up' },
  ],
  earnings: { date: '—', daysLeft: 999, progress: 0, session: '—' },
  premium: {
    gex: [0],
    gammaFlip: '$0.00',
    gammaFlipRaw: 0,
    callWall: 0,
    putFloor: 0,
    maxPain: 0,
    netPremium: 0,
    darkPool: '—',
    blockTrades: 0,
    aiInsight: '',
  },
};

/* ═══════════════════════════════════════════
   CANDLESTICK DATA GENERATOR
   ═══════════════════════════════════════════ */
function genCandles(n: number, base: number, seed = 42) {
  let x = seed;
  const rnd = () => { x = (x * 16807 + 0) % 2147483647; return x / 2147483647; };
  const candles: { o: number; h: number; l: number; c: number; dateET: string; session: string }[] = [];
  let prev = base * 0.92;
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const move = (rnd() - 0.48) * base * 0.025;
    const o = prev;
    const c = o + move;
    const h = Math.max(o, c) + rnd() * base * 0.008;
    const l = Math.min(o, c) - rnd() * base * 0.008;
    const date = new Date(now.getTime() - (n - i) * 15 * 60000);
    const dateET = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + " ET";
    candles.push({
      o: +o.toFixed(2),
      h: +h.toFixed(2),
      l: +l.toFixed(2),
      c: +c.toFixed(2),
      dateET,
      session: 'REG'
    });
    prev = c;
  }
  return candles;
}

function sma(candles: { c: number }[], window: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += candles[j].c;
    return sum / window;
  });
}

/* TabLockIcon — removed (unused orphan) */

/* ═══════════════════════════════════════════
   SVG CANDLESTICK CHART (PREMIUM INTEGRATED)
   ═══════════════════════════════════════════ */
function CandleChart({ ticker, price, vwap, locale = 'en', changePct }: { ticker: string; price: number; vwap?: number; locale?: string; changePct?: number }) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1D');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [candles, setCandles] = useState<{ o: number; h: number; l: number; c: number; dateET: string; session: string }[]>([]);
  // ⚠️ 이 캔들이 «어느 티커·기간»의 것인지 반드시 함께 들고 있어야 한다 (2026-09-04).
  //    예전엔 티커를 바꿔도 candles 를 안 비웠고, 새 데이터가 오기 전까지
  //    **직전 종목의 시세**가 그대로 그려졌다. 게다가 아래 displayCandles 가
  //    마지막 점의 종가를 «새 종목의 현재가»로 덮어써서, AAPL 시세($323~330)에
  //    MSFT 현재가($514)가 얹히며 Y축이 $323~$514 로 늘어나고 선이 바닥에 눌린
  //    평선 + 오른쪽 끝 수직 스파이크가 됐다(실측 스크린샷과 일치).
  //    실패 시 «직전 캔들 유지»도 같은 티커일 때만 옳다 — 이 키가 그것도 막는다.
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  
  // Interactive layers states - default all false for clean look
  const [showSma7, setShowSma7] = useState(false);
  const [showSma20, setShowSma20] = useState(false);
  const [showVwap, setShowVwap] = useState(true);

  const RANGES = ['1D', '1W', '1M', '3M', '1Y'] as const;

  const rangeSeed: Record<string, number> = { '1D': 77, '1W': 33, '1M': 42, '3M': 19, '1Y': 7 };
  const rangeCount: Record<string, number> = { '1D': 24, '1W': 35, '1M': 30, '3M': 60, '1Y': 52 };

  const priceRef = useRef(price);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);

  useEffect(() => {
    let active = true;
    const key = `${ticker}:${range}`;

    // 캐시에 있으면 «그 자리에서» 그린다 — 왕복도 스켈레톤도 없다.
    const hit = CHART_CACHE.get(key);
    if (hit && Date.now() - hit.at < CHART_MAX_AGE_MS) {
      setCandles(hit.rows);
      setLoadedKey(key);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    loadChart(ticker, range).then((rows) => {
      if (!active) return;
      // 실패하면 캔들을 건드리지 않는다 — 가짜 캔들은 절대 그리지 않는다.
      if (rows && rows.length > 0) {
        setCandles(rows);
        setLoadedKey(key);   // 이 캔들이 누구 것인지 같이 새긴다
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [ticker, range]);

  const displayCandles = useMemo(() => {
    // ★ 지금 보고 있는 티커·기간의 데이터일 때만 그린다.
    //   아니면 «남의 차트»다 — 비어 있는 편이 틀린 그림보다 낫다.
    if (loadedKey !== `${ticker}:${range}`) return [];
    if (candles.length === 0) return [];
    const copy = [...candles];
    const lastIdx = copy.length - 1;
    const last = copy[lastIdx];
    copy[lastIdx] = {
      ...last,
      c: price,
      h: Math.max(last.h, price),
      l: Math.min(last.l, price),
    };
    return copy;
  }, [candles, price, loadedKey, ticker, range]);

  // Trend detection to color the line/gradient/current-price label green or red.
  // 1D = "today's move": color by change vs previous close so it matches the hero
  // badge and the active session (pre / post / regular — plus is green, minus is red).
  // Longer ranges use the range trend (current price vs first point).
  const isTrendUp = useMemo(() => {
    if (range === '1D' && typeof changePct === 'number' && changePct !== 0) return changePct > 0;
    if (displayCandles.length < 2) return true;
    const firstVal = displayCandles[0].c;
    return price >= firstVal;
  }, [range, changePct, displayCandles, price]);

  const trendColor = isTrendUp ? '#10b981' : '#ef4444';

  const sma7 = useMemo(() => sma(displayCandles, 7), [displayCandles]);
  const sma20 = useMemo(() => sma(displayCandles, 20), [displayCandles]);

  const allVals = useMemo(() => displayCandles.flatMap(c => [c.h, c.l]), [displayCandles]);
  const minY = useMemo(() => allVals.length > 0 ? Math.min(...allVals) : price * 0.9, [allVals, price]);
  const maxY = useMemo(() => allVals.length > 0 ? Math.max(...allVals) : price * 1.1, [allVals, price]);
  const padY = (maxY - minY) * 0.08 || 1;
  const yMin = minY - padY;
  const yMax = maxY + padY;

  // Single SVG coordinates
  const W = 380;
  const CHART_W = 315;
  const H = 190;
  const gap = displayCandles.length > 0 ? CHART_W / displayCandles.length : 10;
  const bodyW = Math.max(2, gap * 0.55);

  const toY = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;

  const vwapVal = useMemo(() => {
    if (range === '1D' && vwap !== undefined && vwap > 0) return vwap;
    if (displayCandles.length === 0) return price;
    return displayCandles.reduce((acc, c) => acc + c.c, 0) / displayCandles.length;
  }, [displayCandles, price, vwap, range]);

  const nbbo = useMemo(() => {
    const spreadPct = 0.08 + (Math.sin(vwapVal) * 0.03 + 0.03);
    const bid = price * (1 - spreadPct / 200);
    const ask = price * (1 + spreadPct / 200);
    return {
      bid: bid.toFixed(2),
      ask: ask.toFixed(2),
      spread: spreadPct.toFixed(3)
    };
  }, [price, vwapVal]);

  const sessionBlocks = useMemo(() => {
    if (displayCandles.length === 0) return [];
    const blocks: { session: string; startIdx: number; endIdx: number }[] = [];
    let currentBlock = { session: displayCandles[0].session ?? 'REG', startIdx: 0, endIdx: 0 };
    for (let i = 1; i < displayCandles.length; i++) {
      const sType = displayCandles[i].session ?? 'REG';
      if (sType === currentBlock.session) {
        currentBlock.endIdx = i;
      } else {
        blocks.push(currentBlock);
        currentBlock = { session: sType, startIdx: i, endIdx: i };
      }
    }
    blocks.push(currentBlock);
    return blocks;
  }, [displayCandles]);

  const getBlockLinePath = (startIdx: number, endIdx: number) => {
    let d = '';
    const actualStart = startIdx > 0 ? startIdx - 1 : startIdx;
    for (let i = actualStart; i <= endIdx; i++) {
      if (displayCandles[i].c === null) continue;
      const x = i * gap + gap / 2;
      const y = toY(displayCandles[i].c);
      d += (d ? ` L${x},${y}` : `M${x},${y}`);
    }
    return d;
  };

  const getBlockAreaPath = (startIdx: number, endIdx: number) => {
    const actualStart = startIdx > 0 ? startIdx - 1 : startIdx;
    const startX = actualStart * gap + gap / 2;
    const endX = endIdx * gap + gap / 2;
    let d = `M${startX},${H}`;
    for (let i = actualStart; i <= endIdx; i++) {
      if (displayCandles[i].c === null) continue;
      const x = i * gap + gap / 2;
      const y = toY(displayCandles[i].c);
      d += ` L${x},${y}`;
    }
    d += ` L${endX},${H} Z`;
    return d;
  };

  const goldenCross = (lastSma7: (number | null)[]) => {
    const active7 = lastSma7.filter(v => v !== null);
    const active20 = sma20.filter(v => v !== null);
    return active7.length > 1 && active20.length > 1 &&
      active7[active7.length - 1]! > active20[active20.length - 1]! &&
      active7[active7.length - 2]! <= active20[active20.length - 2]!;
  };

  const isGolden = useMemo(() => goldenCross(sma7), [sma7, sma20]);

  const smaPath = (vals: (number | null)[]) => {
    let d = '';
    vals.forEach((v, i) => {
      if (v === null) return;
      const x = i * gap + gap / 2;
      d += (d ? `L${x},${toY(v)}` : `M${x},${toY(v)}`);
    });
    return d;
  };

  const handleInteraction = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    const chartX = (x / rect.width) * W;
    if (chartX > CHART_W) {
      setHoveredIdx(displayCandles.length - 1);
    } else {
      const idx = Math.max(0, Math.min(displayCandles.length - 1, Math.floor((chartX / CHART_W) * displayCandles.length)));
      setHoveredIdx(idx);
    }
  };

  const activeCandle = hoveredIdx !== null ? displayCandles[hoveredIdx] : null;

  // Grid lines based on high, low and mid values
  const midPrice = (maxY + minY) / 2;
  const gridLines = [
    { val: maxY, label: maxY.toFixed(2) },
    { val: midPrice, label: midPrice.toFixed(2) },
    { val: minY, label: minY.toFixed(2) }
  ];

  return (
    <div className={s.c2Card}>
      {/* ── Chart Header (Updates dynamically on hover to show OHLC & Time) ── */}
      <div className={s.c2Head}>
        {hoveredIdx !== null && activeCandle ? (
          <div className={s.c2HoverDetails}>
            <span className={s.c2HoverTime}>{activeCandle.dateET || '—'}</span>
            <div className={s.c2HoverOhlc}>
              <span>O <b className={s.monoVal}>${activeCandle.o.toFixed(2)}</b></span>
              <span className={s.pos}>H <b className={s.monoVal}>${activeCandle.h.toFixed(2)}</b></span>
              <span className={s.neg}>L <b className={s.monoVal}>${activeCandle.l.toFixed(2)}</b></span>
              <span>C <b className={s.monoVal}>${activeCandle.c.toFixed(2)}</b></span>
            </div>
          </div>
        ) : (
          <div className={s.c2Title}>{locale === 'ko' ? '가격 히스토리' : locale === 'ja' ? '価格推移' : 'PRICE HISTORY'}</div>
        )}
        <div className={s.c2Toggle}>
          <button 
            className={chartType === 'line' ? s.on : ''}
            onClick={() => setChartType('line')}
          >
            LINE
          </button>
          <button 
            className={chartType === 'candle' ? s.on : ''}
            onClick={() => setChartType('candle')}
          >
            CANDLE
          </button>
        </div>
      </div>

      {/* ── NBBO & Spread Banner ── */}
      <div className={s.nbbo2}>
        <span>NBBO<span style={{ fontSize: '8px', opacity: 0.5, marginLeft: '3px' }}>Est.</span> <b style={{ color: 'var(--green)' }}>${nbbo.bid}</b> ×100</span>
        <span className={s.spread}>Spread {nbbo.spread}%</span>
        <span><b style={{ color: 'var(--red)' }}>${nbbo.ask}</b> ×100</span>
      </div>

      <div className={s.c2Wrap} style={{ position: 'relative' }}>
        <svg 
          className={s.c2Svg} 
          viewBox={`0 0 ${W} ${H}`} 
          preserveAspectRatio="none"
          onMouseMove={(e) => handleInteraction(e.clientX, e.currentTarget)}
          onTouchMove={(e) => {
            if (e.touches[0]) handleInteraction(e.touches[0].clientX, e.currentTarget);
          }}
          onMouseLeave={() => setHoveredIdx(null)}
          onTouchEnd={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="areaUpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="areaDownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="areaPreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="areaPostGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
            </linearGradient>
            <filter id="glow2">
              <feGaussianBlur stdDeviation="0.8" result="b"/>
              <feMerge>
                <feMergeNode in="b"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines and Y-axis price labels rendered inside SVG */}
          {gridLines.map((gl, i) => {
            const y = toY(gl.val);
            return (
              <g key={i}>
                <line 
                  x1={0} 
                  x2={CHART_W} 
                  y1={y} 
                  y2={y}
                  stroke="rgba(255,255,255,0.04)" 
                  strokeWidth="0.6" 
                  strokeDasharray="2,2" 
                />
                <text 
                  x={CHART_W + 5} 
                  y={y} 
                  fill="var(--text-muted)" 
                  fontSize="11px" 
                  fontFamily="var(--f-mono)" 
                  fontWeight="600"
                  dominantBaseline="middle" 
                  textAnchor="start"
                >
                  ${gl.label}
                </text>
              </g>
            );
          })}

          {/* VWAP Horizontal line */}
          {showVwap && (
            <g>
              <line 
                x1={0} 
                x2={CHART_W} 
                y1={toY(vwapVal)} 
                y2={toY(vwapVal)} 
                stroke="#38bdf8" 
                strokeWidth="0.8" 
                strokeDasharray="4,4" 
                opacity="0.6" 
              />
              {/* VWAP label/badge at the right end of the line */}
              <g transform={`translate(${CHART_W - 76}, ${toY(vwapVal) - 8})`} opacity="0.85">
                <rect width="72" height="16" rx="2" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.5" />
                <text x="36" y="8" fill="#38bdf8" fontSize="10px" fontFamily="var(--f-mono)" fontWeight="700" dominantBaseline="middle" textAnchor="middle">
                  VWAP {vwapVal.toFixed(2)}
                </text>
              </g>
            </g>
          )}

          {chartType === 'line' ? (
            <>
              {/* Session blocks background bands */}
              {sessionBlocks.map((block, i) => {
                const startX = block.startIdx * gap;
                const endX = (block.endIdx + 1) * gap;
                const width = endX - startX;
                let fill = 'transparent';
                if (block.session === 'PRE') fill = 'rgba(245, 158, 11, 0.04)';
                else if (block.session === 'POST') fill = 'rgba(168, 85, 247, 0.04)';
                
                if (fill === 'transparent') return null;
                return (
                  <rect
                    key={i}
                    x={startX}
                    y={0}
                    width={width}
                    height={H}
                    fill={fill}
                    pointerEvents="none"
                  />
                );
              })}

              {/* Area fills per session block */}
              {sessionBlocks.map((block, i) => {
                const areaD = getBlockAreaPath(block.startIdx, block.endIdx);
                let fill = 'url(#areaUpGrad)';
                if (block.session === 'PRE') fill = 'url(#areaPreGrad)';
                else if (block.session === 'POST') fill = 'url(#areaPostGrad)';
                else fill = isTrendUp ? 'url(#areaUpGrad)' : 'url(#areaDownGrad)';

                return (
                  <path
                    key={i}
                    d={areaD}
                    fill={fill}
                  />
                );
              })}

              {/* Line paths per session block */}
              {sessionBlocks.map((block, i) => {
                const pathD = getBlockLinePath(block.startIdx, block.endIdx);
                let stroke = trendColor;
                if (block.session === 'PRE') stroke = '#f59e0b'; // Amber for Pre-market
                else if (block.session === 'POST') stroke = '#a855f7'; // Purple for Post-market
                
                return (
                  <path
                    key={i}
                    d={pathD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="1.6"
                    filter="url(#glow2)"
                  />
                );
              })}
            </>
          ) : (
            <>
              {/* Candles */}
              {displayCandles.map((c, i) => {
                const x = i * gap + gap / 2;
                const isUp = c.c >= c.o;
                const color = isUp ? 'var(--green)' : 'var(--red)';
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={toY(c.h)} y2={toY(c.l)}
                      stroke={color} strokeWidth="0.8" />
                    <rect
                      x={x - bodyW / 2}
                      y={toY(Math.max(c.o, c.c))}
                      width={bodyW}
                      height={Math.max(1, Math.abs(toY(c.o) - toY(c.c)))}
                      fill={color}
                      rx="0.5"
                    />
                  </g>
                );
              })}
            </>
          )}

          {/* SMA lines */}
          {showSma7 && <path d={smaPath(sma7)} fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.85" />}
          {showSma20 && <path d={smaPath(sma20)} fill="none" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.7" />}

          {/* Real-time current price line and price chip */}
          <g 
            transform={`translate(0, ${toY(price)})`} 
            opacity={hoveredIdx !== null ? 0.3 : 1}
            style={{ transition: 'opacity 0.2s ease' }}
          >
            <line 
              x1={0} 
              x2={CHART_W} 
              y1={0} 
              y2={0} 
              stroke={trendColor} 
              strokeWidth="0.8" 
              strokeDasharray="2,2" 
            />
            <rect 
              x={CHART_W + 4} 
              y={-9} 
              width={58} 
              height={18} 
              rx={3} 
              fill={trendColor} 
            />
            <text 
              x={CHART_W + 33} 
              y={0} 
              fill="#050a14" 
              fontSize="11px" 
              fontFamily="var(--f-mono)" 
              fontWeight="800" 
              dominantBaseline="middle" 
              textAnchor="middle"
            >
              ${price.toFixed(2)}
            </text>
          </g>

          {/* Interactive touch crosshair + dot + Y-axis hover badge */}
          {hoveredIdx !== null && activeCandle && (
            <g>
              {/* Vertical crosshair line */}
              <line 
                x1={hoveredIdx * gap + gap / 2} 
                x2={hoveredIdx * gap + gap / 2} 
                y1={0} 
                y2={H} 
                stroke="rgba(255,255,255,0.2)" 
                strokeWidth="0.7" 
                strokeDasharray="3,3" 
              />
              {/* Horizontal crosshair line */}
              <line 
                x1={0} 
                x2={CHART_W} 
                y1={toY(activeCandle.c)} 
                y2={toY(activeCandle.c)} 
                stroke="rgba(255,255,255,0.25)" 
                strokeWidth="0.7" 
                strokeDasharray="3,3" 
              />
              {/* Glowing dot on active price point */}
              <circle 
                cx={hoveredIdx * gap + gap / 2} 
                cy={toY(activeCandle.c)} 
                r="4" 
                fill="#f1f5f9" 
                stroke={trendColor} 
                strokeWidth="2" 
                style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8))' }}
              />
              {/* Hover price chip on Y-axis */}
              <g transform={`translate(0, ${toY(activeCandle.c)})`}>
                <rect 
                  x={CHART_W + 4} 
                  y={-9} 
                  width={58} 
                  height={18} 
                  rx={3} 
                  fill="#f1f5f9" 
                />
                <text 
                  x={CHART_W + 33} 
                  y={0} 
                  fill="#050a14" 
                  fontSize="11px" 
                  fontFamily="var(--f-mono)" 
                  fontWeight="800" 
                  dominantBaseline="middle" 
                  textAnchor="middle"
                >
                  ${activeCandle.c.toFixed(2)}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* ── Legends ── */}
      <div className={s.c2Legend}>
        <button 
          onClick={() => setShowSma7(!showSma7)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          className={s.li}
        >
          <span className={s.dot} style={{ background: showSma7 ? '#f59e0b' : '#334155' }} />
          <span style={{ color: showSma7 ? 'var(--text)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>SMA 7</span>
        </button>
        <button 
          onClick={() => setShowSma20(!showSma20)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          className={s.li}
        >
          <span className={s.dot} style={{ background: showSma20 ? '#8b5cf6' : '#334155' }} />
          <span style={{ color: showSma20 ? 'var(--text)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>SMA 20</span>
        </button>
        <button 
          onClick={() => setShowVwap(!showVwap)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          className={s.li}
        >
          <span className={s.dot} style={{ background: 'transparent', height: '0px', width: '10px', borderTop: `1.5px dashed ${showVwap ? '#38bdf8' : '#334155'}`, borderRadius: 0 }} />
          <span style={{ color: showVwap ? 'var(--text)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>VWAP</span>
        </button>
        {isGolden && (
          <span className={s.li} style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: '11px' }}>
            ✦ Golden Cross
          </span>
        )}
      </div>

      {/* ── Ranges ── */}
      <div className={s.c2Ranges}>
        <span className={s.c2Rpill} style={{ left: `calc(${RANGES.indexOf(range) * 20}% + 3px)` }} />
        {RANGES.map(r => (
          <button key={r}
            className={r === range ? s.on : ''}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SPARKLINE (background decoration for price)
   ═══════════════════════════════════════════ */
function SparklineBg({ up, seed = 'default' }: { up: boolean; seed?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pts = useMemo(() => {
    if (!mounted) return '';
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = seed.charCodeAt(i) + ((h << 5) - h);
    }
    const rand = () => {
      const x = Math.sin(h++) * 10000;
      return x - Math.floor(x);
    };

    const n = 40;
    const vals: number[] = [];
    let v = 50;
    for (let i = 0; i < n; i++) {
      v += (rand() - (up ? 0.42 : 0.58)) * 8;
      v = Math.max(10, Math.min(90, v));
      vals.push(v);
    }
    return vals.map((y, i) => `${(i / (n - 1)) * 100},${100 - y}`).join(' ');
  }, [up, seed, mounted]);

  if (!mounted) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
        style={{ position: 'absolute', inset: 0, opacity: 0 }}>
      </svg>
    );
  }

  const gradId = `sparkGrad-${seed}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
      style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0.15" />
          <stop offset="100%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={up ? 'var(--green)' : 'var(--red)'}
        strokeWidth="0.8" opacity="0.4" />
      <polygon points={`0,100 ${pts} 100,100`} fill={`url(#${gradId})`} />
    </svg>
  );
}

/* ═══════════════════════════════════════════
   GEX BAR CHART (premium)
   ═══════════════════════════════════════════ */
function fmtCompactPrice(value?: number | null) {
  if (!value || !Number.isFinite(value)) return '--';
  if (value >= 1000) return `$${value.toFixed(0)}`;
  if (value >= 100) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

function GexBarChart({
  data,
  gammaFlip,
  putFloor,
  callWall,
  locale = 'en',
}: {
  data: number[];
  gammaFlip?: number | null;
  putFloor?: number | null;
  callWall?: number | null;
  locale?: string;
}) {
  const maxAbs = Math.max(...data.map(Math.abs), 1);
  const negCount = data.filter((v) => v < 0).length;
  const posCount = data.filter((v) => v >= 0).length;
  const netBias = data.reduce((sum, v) => sum + v, 0);
  const biasLabel = netBias >= 0 ? 'POSITIVE GAMMA' : 'NEGATIVE GAMMA';
  return (
    <div style={{ marginBottom: 'var(--s3)' }}>
      <div className={s.gexHead}>
        <div>
          <div className={s.cardTitle} style={{ marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>GEX PROFILE<MetricInfo term="gex" locale={locale} size={11} /></div>
          <p className={s.gexExplain}>Dealer gamma pressure by strike. Red = hedge pressure, green = stabilizing support.</p>
        </div>
        <span className={netBias >= 0 ? s.gexBiasPos : s.gexBiasNeg}>{biasLabel}</span>
      </div>
      <div className={s.gexLegendRow}>
        <span className={s.gexLegendNeg}>PUT PRESSURE</span>
        <span className={s.gexLegendMid}>GAMMA FLIP {fmtCompactPrice(gammaFlip)}</span>
        <span className={s.gexLegendPos}>CALL SUPPORT</span>
      </div>
      <div className={s.gexChart}>
        <span className={s.gexZeroLine} />
        {data.map((v, i) => {
          const h = Math.max(4, (Math.abs(v) / maxAbs) * 42);
          const isPos = v >= 0;
          return (
            <div key={i} className={s.gexBarSlot}>
              <span
                className={isPos ? s.gexBarPositive : s.gexBarNegative}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className={s.gexLevelRow}>
        <span>Put floor <b>{fmtCompactPrice(putFloor)}</b></span>
        <span>{negCount} neg / {posCount} pos bars</span>
        <span>Call wall <b>{fmtCompactPrice(callWall)}</b></span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANALYST CONSENSUS CARD
   ═══════════════════════════════════════════ */
function AnalystConsensus({
  analyst, price, locale = 'en'
}: {
  analyst: typeof DEMO.analyst; price: number; locale?: string
}) {
  const [animated, setAnimated] = useState(false);
  // 목표가 건별 내역은 30건까지 온다 — 기본은 접어 두고 눌러서 편다
  const [targetsOpen, setTargetsOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t); }, []);

  const total = analyst.buy + analyst.hold + analyst.sell;
  const buyPct = total > 0 ? Math.round((analyst.buy / total) * 100) : 0;
  const holdPct = total > 0 ? Math.round((analyst.hold / total) * 100) : 0;
  const sellPct = total > 0 ? Math.round((analyst.sell / total) * 100) : 0;
  const upsidePct = price > 0 ? ((analyst.target - price) / price * 100).toFixed(1) : '0';
  const isUpside = Number(upsidePct) >= 0;

  const ratingClass = analyst.rating.includes('BUY') ? s.ratingBuy
    : analyst.rating.includes('SELL') ? s.ratingSell : s.ratingHold;

  // ── 변화 이벤트 (없으면 이 블록들은 통째로 안 그린다) ─────────────
  const ev: any = (analyst as any).events || null;
  const trend = ev?.targetTrend || null;
  const recentChanges: any[] = Array.isArray(ev?.recent) ? ev.recent.slice(0, 3) : [];
  const targetChanges: any[] = Array.isArray(ev?.targetChanges) ? ev.targetChanges : [];
  const shownTargets = targetsOpen ? targetChanges : targetChanges.slice(0, 3);
  // 중앙값은 평균과 «뜻이 다를 때»만 보여 준다. 같은 값을 두 번 쓰면 잡음이다.
  // 총 이동 3명 미만이면 서비스가 null 을 준다 — 잡음을 신호처럼 그리지 않기 위해서다
  const compShift = ev?.compositionShift || null;
  const median: number | null = typeof ev?.targetMedian === 'number' ? ev.targetMedian : null;
  const medianDiffers = median != null && analyst.target > 0
    && Math.abs(median - analyst.target) / analyst.target >= 0.03;
  const revColor = trend?.direction === 'RAISING' ? 'var(--green)'
    : trend?.direction === 'LOWERING' ? 'var(--red)' : 'var(--text-muted)';

  // 카드 테두리 강조 — «지금 뭔가 벌어지고 있다»를 한눈에.
  //   ① 90일 상하향이 한쪽으로 3건 이상 쏠렸거나
  //   ② 목표가가 뚜렷하게 올라오거나 내려오는 중
  const netActions = (ev?.net ?? 0);
  const notable = Math.abs(netActions) >= 3 || (trend?.direction === 'RAISING' || trend?.direction === 'LOWERING');
  const emphasisColor = netActions >= 3 || trend?.direction === 'RAISING' ? 'var(--green)'
    : netActions <= -3 || trend?.direction === 'LOWERING' ? 'var(--red)' : null;

  const desc = locale === 'ko'
    ? `${total}명 애널리스트 중 ${buyPct}%가 긍정적 의견`
    : locale === 'ja'
    ? `${total}名のアナリストのうち${buyPct}%が強気`
    : `${buyPct}% bullish consensus from ${total} analysts`;

  return (
    <div
      className={`${s.card} ${s.animateIn} ${s.delay3}`}
      style={notable && emphasisColor
        ? { borderColor: `color-mix(in srgb, ${emphasisColor} 40%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${emphasisColor} 14%, transparent)` }
        : undefined}
    >
      {/* Header: Title + Rating badge inline */}
      <div className={s.analystHead}>
        <div className={s.cardTitle} style={{ marginBottom: 0 }}>
          {locale === 'ko' ? '애널리스트 컨센서스' : locale === 'ja' ? 'アナリスト・コンセンサス' : 'ANALYST CONSENSUS'}
        </div>
        <span className={ratingClass}>{analyst.rating}</span>
      </div>

      {/* Bullish % main metric */}
      <div className={s.analystMetric}>
        <span className={s.analystBullishPct} style={{ color: buyPct >= 50 ? 'var(--green)' : buyPct >= 30 ? 'var(--amber)' : 'var(--red)' }}>
          {buyPct}%
        </span>
        <span className={s.analystDesc}>{desc}</span>
      </div>

      {/* Horizontal stacked bar */}
      <div className={s.analystStackedBar}>
        <div className={s.stackedBuy} style={{ width: animated ? `${buyPct}%` : '0%' }} />
        <div className={s.stackedHold} style={{ width: animated ? `${holdPct}%` : '0%' }} />
        <div className={s.stackedSell} style={{ width: animated ? `${sellPct}%` : '0%' }} />
      </div>
      <div className={s.analystLegend}>
        <span style={{ color: 'var(--green)' }}>Buy {analyst.buy}</span>
        <span style={{ color: 'var(--amber)' }}>Hold {analyst.hold}</span>
        <span style={{ color: 'var(--red)' }}>Sell {analyst.sell}</span>
      </div>

      {/* Price Target */}
      <div className={s.analystTargetBlock}>
        <div className={s.analystTargetRow}>
          <span className={s.analystTargetLabel}>
            {locale === 'ko' ? '12M 목표가' : locale === 'ja' ? '12M目標株価' : '12M TARGET'}
          </span>
          <span className={s.analystTargetPrice}>${analyst.target.toFixed(2)}</span>
          <span className={s.analystTargetUpside} style={{ color: isUpside ? 'var(--green)' : 'var(--red)' }}>
            {isUpside ? '+' : ''}{upsidePct}%
          </span>
        </div>
        {analyst.targetHigh > 0 && (
          <div className={s.analystTargetRange}>
            <span>{locale === 'ko' ? '최고' : locale === 'ja' ? '最高' : 'High'} ${analyst.targetHigh.toFixed(0)}</span>
            <span>{locale === 'ko' ? '최저' : locale === 'ja' ? '最低' : 'Low'} ${analyst.targetLow.toFixed(0)}</span>
            {/* 중앙값 — 평균과 3% 이상 벌어질 때만. 소수의 극단 목표가가 평균을
                끌고 가는 경우가 있다(AMD 실측: 평균 594 vs 중앙값 625) */}
            {medianDiffers && (
              <span title={locale === 'ko' ? '극단값에 덜 휘둘리는 대표값' : locale === 'ja' ? '外れ値に強い代表値' : 'less skewed by outliers'}>
                {locale === 'ko' ? '중앙' : locale === 'ja' ? '中央' : 'Median'} ${median!.toFixed(0)}
              </span>
            )}
          </div>
        )}

        {/* 목표가 리비전 추세 — 컨센서스가 «올라오는 중»인지. 방향을 못 정하면 안 그린다 */}
        {trend?.direction && trend.direction !== 'FLAT' && trend.revisionPct != null && (
          <div className={s.analystRevisionRow} style={{ borderColor: revColor + '55', background: revColor + '12' }}>
            <span className={s.analystRevisionLabel}>
              {locale === 'ko' ? '목표가 추세' : locale === 'ja' ? '目標株価トレンド' : 'TARGET TREND'}
            </span>
            <span className={s.analystRevisionValue} style={{ color: revColor }}>
              {trend.direction === 'RAISING'
                ? (locale === 'ko' ? '상향 중' : locale === 'ja' ? '引き上げ中' : 'RAISING')
                : (locale === 'ko' ? '하향 중' : locale === 'ja' ? '引き下げ中' : 'LOWERING')}
              {' '}{trend.revisionPct > 0 ? '+' : ''}{trend.revisionPct}%
            </span>
            <span className={s.analystRevisionNote}>
              {locale === 'ko' ? `최근 1개월 평균 $${(trend.lastMonthAvg ?? 0).toFixed(0)} · 1년 평균 $${(trend.lastYearAvg ?? 0).toFixed(0)}`
                : locale === 'ja' ? `直近1ヶ月平均 $${(trend.lastMonthAvg ?? 0).toFixed(0)} · 1年平均 $${(trend.lastYearAvg ?? 0).toFixed(0)}`
                  : `1M avg $${(trend.lastMonthAvg ?? 0).toFixed(0)} vs 1Y avg $${(trend.lastYearAvg ?? 0).toFixed(0)}`}
            </span>
          </div>
        )}
      </div>

      {/* 목표가 건별 변경 — 기본 3건, 눌러서 전체. 30건까지 온다 */}
      {targetChanges.length > 0 && (
        <div className={s.analystActionsBlock}>
          <button
            type="button"
            className={s.analystDisclosure}
            onClick={() => setTargetsOpen((v) => !v)}
            aria-expanded={targetsOpen}
          >
            <span className={s.analystActionsTitle}>
              {locale === 'ko' ? '목표가 변경 내역' : locale === 'ja' ? '目標株価の変更履歴' : 'PRICE TARGET CHANGES'}
            </span>
            <span className={s.analystDisclosureRight}>
              <span className={s.analystActionsCount}>{targetChanges.length}</span>
              <span className={s.analystChevron} data-open={targetsOpen ? '1' : '0'}>▾</span>
            </span>
          </button>

          {shownTargets.map((c: any, i: number) => (
            <div key={`${c.date}-${c.firm}-${i}`} className={s.analystTargetChangeRow}>
              <span className={s.analystActionDate}>{c.date.slice(5)}</span>
              <span className={s.analystActionFirm}>{c.firm}</span>
              <span className={s.analystTargetChangeVal}>
                ${c.target.toFixed(0)}
                {typeof c.upsideThen === 'number' && (
                  <span
                    className={s.analystTargetChangeUpside}
                    style={{ color: c.upsideThen >= 0 ? 'var(--green)' : 'var(--red)' }}
                  >
                    {c.upsideThen >= 0 ? '+' : ''}{c.upsideThen}%
                  </span>
                )}
              </span>
            </div>
          ))}

          {!targetsOpen && targetChanges.length > 3 && (
            <button type="button" className={s.analystMoreBtn} onClick={() => setTargetsOpen(true)}>
              {locale === 'ko' ? `+${targetChanges.length - 3}건 더 보기`
                : locale === 'ja' ? `他${targetChanges.length - 3}件を表示`
                  : `Show ${targetChanges.length - 3} more`}
            </button>
          )}
          {targetsOpen && (
            <button type="button" className={s.analystMoreBtn} onClick={() => setTargetsOpen(false)}>
              {locale === 'ko' ? '접기' : locale === 'ja' ? '閉じる' : 'Show less'}
            </button>
          )}
          <div className={s.analystTargetChangeNote}>
            {locale === 'ko' ? '% 는 발표 시점 주가 대비 상승여력'
              : locale === 'ja' ? '% は発表時株価に対する上昇余地'
                : '% = upside vs price at publication'}
          </div>
        </div>
      )}

      {/* 최근 등급 변경 — «유지»는 이벤트가 아니다. 상하향만 보여 준다 */}
      {recentChanges.length > 0 && (
        <div className={s.analystActionsBlock}>
          <div className={s.analystActionsHead}>
            <span className={s.analystActionsTitle}>
              {locale === 'ko' ? '최근 등급 변경' : locale === 'ja' ? '直近の格付変更' : 'RECENT RATING CHANGES'}
            </span>
            <span className={s.analystActionsCount}>
              <span style={{ color: 'var(--green)' }}>▲{ev.upgrades}</span>
              {' '}
              <span style={{ color: 'var(--red)' }}>▼{ev.downgrades}</span>
              <span style={{ opacity: 0.55 }}>
                {' '}{locale === 'ko' ? '90일' : locale === 'ja' ? '90日' : '90d'}
              </span>
            </span>
          </div>
          {recentChanges.map((c: any, i: number) => (
            <div key={`${c.date}-${c.firm}-${i}`} className={s.analystActionRow}>
              <span className={s.analystActionDate}>{c.date.slice(5)}</span>
              <span className={s.analystActionFirm}>{c.firm}</span>
              <span
                className={s.analystActionMove}
                style={{ color: c.action === 'upgrade' ? 'var(--green)' : 'var(--red)' }}
              >
                {c.action === 'upgrade' ? '▲' : '▼'} {c.from ? `${c.from} → ` : ''}{c.to}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 컨센서스 «구성» 변화 — 한 줄로 끝낸다.
          월별 막대(펼침)를 만들었다가 뺐다. 실데이터로 보니:
            · 커버리지 30~50명에서 3개월 이동은 대개 ±1~2 → 미니 막대 4개가
              육안으로 구분이 안 된다(폭이 1px도 안 움직인다).
            · 카드는 이미 8개 섹션이다. 토글을 둘 두면 조작 요소만 늘고
              위계가 흐려진다.
            · 「강세 +4 · 약세 −2」 한 줄이면 의미가 다 전달된다.
          그래서 «펼칠 게 없는 펼침»을 없앴다. 대신 서비스에서 총 이동 3명
          미만은 null 로 걸러, 잡음이 신호처럼 보이지 않게 했다. */}
      {compShift && (
        <div className={s.analystCompLine}>
          <span className={s.analystActionsTitle}>
            {locale === 'ko' ? `구성 변화 ${compShift.months}개월`
              : locale === 'ja' ? `構成の変化 ${compShift.months}ヶ月`
                : `${compShift.months}M COMPOSITION SHIFT`}
          </span>
          <span className={s.analystCompDelta}>
            {compShift.bullish !== 0 && (
              <span style={{ color: compShift.bullish > 0 ? 'var(--green)' : 'var(--red)' }}>
                {locale === 'ko' ? '강세' : locale === 'ja' ? '強気' : 'Bull'} {compShift.bullish > 0 ? '+' : ''}{compShift.bullish}
              </span>
            )}
            {compShift.bullish !== 0 && compShift.bearish !== 0 && <span style={{ opacity: 0.35 }}> · </span>}
            {compShift.bearish !== 0 && (
              <span style={{ color: compShift.bearish > 0 ? 'var(--red)' : 'var(--green)' }}>
                {locale === 'ko' ? '약세' : locale === 'ja' ? '弱気' : 'Bear'} {compShift.bearish > 0 ? '+' : ''}{compShift.bearish}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FUNDAMENTALS CARD (Premium)
   ═══════════════════════════════════════════ */
interface FundRaw {
  score?: number | null;
  grade?: string | null;
  pe?: number | null;
  roe?: number | null;
  de?: number | null;
  revenueGrowth?: number | null;
  netMargin?: number | null;
  fcfYield?: number | null;
  breakdown?: Record<string, { value: string; score: number; label: string }> | null;
}
function FundamentalsCard({ raw, locale = 'en' }: { raw: FundRaw | null; locale?: string }) {
  const score = raw?.score ?? null;
  const grade = raw?.grade && raw.grade !== 'NO_DATA' ? raw.grade : null;

  // Insight text based on score
  const getInsight = (s: number | null): string => {
    if (s === null) return '';
    if (locale === 'ko') {
      if (s >= 80) return '재무 우수';
      if (s >= 60) return '재무 양호';
      if (s >= 40) return '재무 보통';
      if (s >= 20) return '재무 취약';
      return '재무 위험';
    }
    if (locale === 'ja') {
      if (s >= 80) return '財務優秀';
      if (s >= 60) return '財務良好';
      if (s >= 40) return '財務普通';
      if (s >= 20) return '財務脆弱';
      return '財務危険';
    }
    if (s >= 80) return 'Strong';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Average';
    if (s >= 20) return 'Weak';
    return 'Poor';
  };

  const insight = getInsight(score);
  const gradeColor = (g: string | null) => {
    if (!g) return 'rgba(255,255,255,0.3)';
    if (g.startsWith('A')) return '#10b981';
    if (g.startsWith('B')) return '#22d3ee';
    if (g.startsWith('C')) return '#f59e0b';
    if (g.startsWith('D')) return '#f97316';
    return '#ef4444';
  };

  const metrics = [
    { 
      key: 'PE', 
      val: raw?.pe != null ? String(raw.pe) : null 
    },
    { 
      key: 'ROE', 
      val: raw?.roe != null ? `${raw.roe}%` : null 
    },
    { 
      key: 'D/E', 
      val: raw?.de != null ? String(raw.de) : null 
    },
    { 
      key: locale === 'ko' ? '매출' : locale === 'ja' ? '売上' : 'Rev', 
      val: raw?.revenueGrowth != null ? `${raw.revenueGrowth > 0 ? '+' : ''}${raw.revenueGrowth}%` : null 
    },
    { 
      key: locale === 'ko' ? '마진' : locale === 'ja' ? 'マージン' : 'Margin',
      val: raw?.netMargin != null ? `${raw.netMargin}%` : null 
    },
  ].filter(m => m.val !== null);

  const breakdownKeys = raw?.breakdown ? Object.keys(raw.breakdown) : [];

  const row1 = metrics.slice(0, 3);
  const row2 = metrics.slice(3);

  return (
    <div className={`${s.premiumCard} ${s.animateIn} ${s.delay4}`}>
      {/* Header Row */}
      <div className={s.premiumHeader}>
        <div className={s.premiumTitle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          {locale === 'ko' ? '펀더멘탈' : locale === 'ja' ? 'ファンダメンタルズ' : 'FUNDAMENTAL'}
        </div>
        {grade && (
          <span className={s.premGradeBadge} style={{ color: gradeColor(grade), borderColor: gradeColor(grade) }}>
            {grade}
          </span>
        )}
      </div>

      {/* Score + Insight Row */}
      {score !== null && (
        <div className={s.premScoreRow}>
          <span className={s.premScoreNum} style={{ color: gradeColor(grade) }}>{score}</span>
          <span className={s.premScoreMax}>/100</span>
          <span className={s.premInsightBadge} style={{ color: gradeColor(grade), borderColor: `${gradeColor(grade)}50`, background: `${gradeColor(grade)}15` }}>
            {insight}
          </span>
        </div>
      )}

      {/* Metric Grid */}
      {metrics.length > 0 && (
        <div className={s.premMutedGrid}>
          <div className={s.premRow3}>
            {row1.map(m => (
              <div key={m.key} className={s.premRatioPill}>
                <span className={s.premRatioLabel}>{m.key}</span>
                <span className={s.premRatioValue}>{m.val}</span>
              </div>
            ))}
          </div>
          {row2.length > 0 && (
            <div className={row2.length >= 3 ? s.premRow3 : s.premRow2}>
              {row2.map(m => (
                <div key={m.key} className={s.premRatioPill}>
                  <span className={s.premRatioLabel}>{m.key}</span>
                  <span className={s.premRatioValue}>{m.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Breakdown Footer */}
      {breakdownKeys.length > 0 && (
        <div className={s.fundFooter}>
          {breakdownKeys.map(k => raw!.breakdown![k].label).join(' \u00B7 ')}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
/* ═══════════════════════════════════════════
   EARNINGS CARD (Premium)
   ═══════════════════════════════════════════ */
interface EarnRaw {
  nextEarningsDate?: string | null;
  daysUntilEarnings?: number | null;
  daysLabel?: string | null;
  epsEstimate?: number | null;
  epsActual?: number | null;
  quarter?: number | null;
  year?: number | null;
  hourLabel?: string | null;
  forwardEps?: number | null;
  forwardRevenue?: number | null;
  forwardYear?: string | null;
  currentEps?: number | null;
  currentRevenue?: number | null;
  lastSurprise?: { actualEps: number; estimatedEps: number; surpriseEps: number; surprisePct: number; date: string } | null;
  hasData?: boolean;
}
function EarningsCardPremium({ raw, locale = 'en' }: { raw: EarnRaw | null; locale?: string }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t); }, []);

  if (!raw || !raw.hasData) return null;

  const days = raw.daysUntilEarnings ?? null;
  const daysLabel = raw.daysLabel || 'TBD';
  const isImminent = days !== null && days >= 0 && days <= 7;
  const isPast = days !== null && days < 0;

  // Format date nicely
  const dateStr = raw.nextEarningsDate
    ? new Date(raw.nextEarningsDate + 'T00:00:00').toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'TBD';

  // Session label
  const hourCode = raw.hourLabel?.toLowerCase() || '';
  const sessionText = hourCode === 'amc'
    ? (locale === 'ko' ? '마감후' : 'AMC')
    : hourCode === 'bmo'
    ? (locale === 'ko' ? '개장전' : 'BMO')
    : hourCode === 'dmh'
    ? (locale === 'ko' ? '장중' : 'DMH')
    : '';

  // Quarter label
  const qLabel = raw.quarter && raw.year ? `Q${raw.quarter} FY${String(raw.year).slice(-2)}` : '';

  // Progress (assuming 90 days cycle)
  const progress = days !== null && days >= 0 ? Math.max(0, Math.min(100, ((90 - days) / 90) * 100)) : 100;

  // Format large revenue number
  const fmtRevenue = (v: number | null | undefined): string => {
    if (v == null) return '';
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className={`${s.premiumCard} ${s.animateIn} ${s.delay5}`}>
      {/* Header */}
      <div className={s.premiumHeader}>
        <div className={s.premiumTitle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {locale === 'ko' ? '실적 발표' : locale === 'ja' ? '決算予定' : 'EARNINGS'}
        </div>
        <div>
          <span className={s.premCountdownBadge}>{daysLabel}</span>
          {days !== null && days > 0 && (
            <div className={s.premDaysText}>
              {locale === 'ko' ? `${days}일 후` : locale === 'ja' ? `${days}日後` : `${days}d`}
            </div>
          )}
        </div>
      </div>

      {/* Date + Session Row */}
      <div className={s.premDateRow}>
        <span className={s.premDateVal}>{dateStr}</span>
        {sessionText && (
          <span className={s.premSessionBadge}>{sessionText}</span>
        )}
      </div>

      {/* Progress Bar */}
      {!isPast && (
        <div className={s.premProgressBar}>
          <div className={s.premProgressBarFill} style={{ width: animated ? `${progress}%` : '0%' }} />
        </div>
      )}

      {/* EPS Estimate + Quarter */}
      {(raw.epsEstimate != null || qLabel || raw.lastSurprise) && (
        <div className={s.premInfoRow}>
          {raw.epsEstimate != null && (
            <div className={s.premInfoPill}>
              <span>{locale === 'ko' ? '예상 EPS' : locale === 'ja' ? '予想EPS' : 'Est EPS'}</span>
              <span className={s.premInfoPillValue}>${raw.epsEstimate.toFixed(2)}</span>
            </div>
          )}
          {qLabel && (
            <div className={s.premInfoPill}>
              <span>{qLabel}</span>
            </div>
          )}
          {/* Last Surprise */}
          {raw.lastSurprise && (
            <div className={s.premInfoPill}>
              <span style={{ color: raw.lastSurprise.surprisePct >= 0 ? '#34d399' : '#f87171', fontWeight: 800 }}>
                {raw.lastSurprise.surprisePct >= 0 ? 'Beat' : 'Miss'} {raw.lastSurprise.surprisePct >= 0 ? '+' : ''}{raw.lastSurprise.surprisePct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Forward Guidance */}
      {(raw.forwardEps != null || raw.forwardRevenue != null) && (
        <div className={s.premForwardSection}>
          <div className={s.premForwardTitle}>
            {locale === 'ko' ? `내년전망` : locale === 'ja' ? `来期予想` : 'Forward'} {raw.forwardYear ? `(FY${raw.forwardYear.slice(-2)})` : ''}
          </div>
          <div className={s.premForwardGrid}>
            {raw.forwardEps != null && (
              <div className={s.premForwardCard}>
                <div className={s.premForwardLeft}>
                  <span className={s.premForwardLabel}>EPS</span>
                  <span className={s.premForwardVal}>${raw.forwardEps.toFixed(2)}</span>
                  {(() => {
                    const cur = raw.currentEps, fwd = raw.forwardEps;
                    if (cur == null || cur === 0 || fwd == null) return null;
                    const g = ((fwd - cur) / Math.abs(cur)) * 100;
                    return <span style={{ fontSize: '10px', fontWeight: 800, color: g >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{g >= 0 ? '▲ +' : '▼ '}{g.toFixed(0)}% YoY</span>;
                  })()}
                </div>
                <svg className={s.premForwardChart} viewBox="0 0 44 22">
                  <path
                    d="M2,18 Q12,16 22,8 T42,3"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="42" cy="3" r="2" fill="#10b981" />
                </svg>
              </div>
            )}
            {raw.forwardRevenue != null && (
              <div className={s.premForwardCard}>
                <div className={s.premForwardLeft}>
                  <span className={s.premForwardLabel}>{locale === 'ko' ? '매출' : locale === 'ja' ? '売上' : 'Rev'}</span>
                  <span className={s.premForwardVal}>{fmtRevenue(raw.forwardRevenue)}</span>
                  {(() => {
                    const cur = raw.currentRevenue, fwd = raw.forwardRevenue;
                    if (cur == null || cur === 0 || fwd == null) return null;
                    const g = ((fwd - cur) / Math.abs(cur)) * 100;
                    return <span style={{ fontSize: '10px', fontWeight: 800, color: g >= 0 ? 'var(--green)' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{g >= 0 ? '▲ +' : '▼ '}{g.toFixed(0)}% YoY</span>;
                  })()}
                </div>
                <svg className={s.premForwardChart} viewBox="0 0 44 22">
                  <rect x="2" y="14" width="4" height="8" rx="1" fill="#06b6d4" opacity="0.4" />
                  <rect x="10" y="11" width="4" height="11" rx="1" fill="#06b6d4" opacity="0.6" />
                  <rect x="18" y="9" width="4" height="13" rx="1" fill="#06b6d4" opacity="0.8" />
                  <rect x="26" y="6" width="4" height="16" rx="1" fill="#06b6d4" />
                  <rect x="34" y="3" width="4" height="19" rx="1" fill="#22d3ee" style={{ filter: 'drop-shadow(0 0 2px var(--cyan))' }} />
                </svg>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const IVSkewCurve = dynamic(() => import('@/components/IVSkewCurve'), {
  ssr: false,
  loading: () => <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-1)', borderRadius: 'var(--r-card)', font: 'var(--f-micro)', color: 'var(--text-muted)' }}>LOADING SKEW CURVE...</div>
});

const MobileCmd13F = dynamic(() => import('@/components/intel/mobile/MobileCmd13F').then(m => m.MobileCmd13F), {
  ssr: false,
  loading: () => <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-1)', borderRadius: 'var(--r-card)', font: 'var(--f-micro)', color: 'var(--text-muted)' }}>LOADING HOLDERS & INSIDERS...</div>
});

/* ═══════════════════════════════════════════
   TECHNICAL & GAMMA LEVELS MAP
   ═══════════════════════════════════════════ */
function TechnicalGammaMap({
  price,
  high,
  low,
  callWall,
  putFloor,
  gammaFlip,
}: {
  price: number;
  high: number;
  low: number;
  callWall: number | null;
  putFloor: number | null;
  gammaFlip: number | null;
}) {
  // Pivot point calculations
  const pp = (high + low + price) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (pp - high);

  // Group levels and filter nulls
  const rawLevels = [
    { label: 'R3 (Resistance)', val: r3, type: 'pivot', color: 'rgba(239, 68, 68, 0.5)' },
    { label: 'R2 (Resistance)', val: r2, type: 'pivot', color: 'rgba(239, 68, 68, 0.7)' },
    { label: 'R1 (Resistance)', val: r1, type: 'pivot', color: 'rgba(239, 68, 68, 0.95)' },
    { label: 'PP (Pivot Point)', val: pp, type: 'pivot', color: 'var(--text-muted)' },
    { label: 'S1 (Support)', val: s1, type: 'pivot', color: 'rgba(16, 185, 129, 0.95)' },
    { label: 'S2 (Support)', val: s2, type: 'pivot', color: 'rgba(16, 185, 129, 0.7)' },
    { label: 'S3 (Support)', val: s3, type: 'pivot', color: 'rgba(16, 185, 129, 0.5)' },
  ];

  if (callWall) rawLevels.push({ label: 'Call Wall', val: callWall, type: 'gamma', color: '#f43f5e' });
  if (putFloor) rawLevels.push({ label: 'Put Floor', val: putFloor, type: 'gamma', color: '#10b981' });
  if (gammaFlip) rawLevels.push({ label: 'Gamma Flip', val: gammaFlip, type: 'gamma', color: '#f59e0b' });
  rawLevels.push({ label: 'CURRENT PRICE', val: price, type: 'price', color: '#22d3ee' });

  // Sort by value descending
  rawLevels.sort((a, b) => b.val - a.val);

  // Merge levels at the exact same price (prevent overlapping labels for identical levels)
  const mergedMap = new Map<string, typeof rawLevels[0]>();
  for (const l of rawLevels) {
    const key = l.val.toFixed(2);
    const existing = mergedMap.get(key);
    if (existing) {
      existing.label = `${existing.label} / ${l.label}`;
      // Upgrade type/color priority: price > gamma > pivot
      if (l.type === 'price' || existing.type === 'price') {
        existing.type = 'price';
        existing.color = '#22d3ee';
      } else if (l.type === 'gamma') {
        existing.type = 'gamma';
        existing.color = l.color;
      }
    } else {
      mergedMap.set(key, { ...l });
    }
  }
  const levels = Array.from(mergedMap.values()).sort((a, b) => b.val - a.val);

  const minVal = Math.min(...levels.map(l => l.val));
  const maxVal = Math.max(...levels.map(l => l.val));
  const range = maxVal - minVal || 1;

  // Position calculation with compression of large gaps (non-linear scale)
  let positions = levels.map((l) => {
    const pct = maxVal === minVal ? 50 : ((maxVal - l.val) / range) * 100;
    return {
      ...l,
      pct,
    };
  });

  // Compress any vertical empty gaps larger than 14% to 14% to make the layout compact
  const MAX_GAP_PCT = 14;
  for (let i = 1; i < positions.length; i++) {
    const diff = positions[i].pct - positions[i - 1].pct;
    if (diff > MAX_GAP_PCT) {
      const excess = diff - MAX_GAP_PCT;
      for (let j = i; j < positions.length; j++) {
        positions[j].pct -= excess;
      }
    }
  }

  // Normalize percentages back to safe boundaries [6%, 94%]
  const newMin = positions[0].pct;
  const newMax = positions[positions.length - 1].pct;
  const newRange = newMax - newMin || 1;
  positions = positions.map(p => ({
    ...p,
    pct: ((p.pct - newMin) / newRange) * 88 + 6
  }));

  // Resolve minor overlaps (minimum vertical space is 7.2%)
  const MIN_GAP_PCT = 7.2;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i].pct - positions[i - 1].pct < MIN_GAP_PCT) {
      positions[i].pct = positions[i - 1].pct + MIN_GAP_PCT;
    }
  }
  if (positions.length > 0 && positions[positions.length - 1].pct > 94) {
    positions[positions.length - 1].pct = 94;
    for (let i = positions.length - 2; i >= 0; i--) {
      if (positions[i + 1].pct - positions[i].pct < MIN_GAP_PCT) {
        positions[i].pct = positions[i + 1].pct - MIN_GAP_PCT;
      }
    }
  }
  if (positions.length > 0 && positions[0].pct < 6) {
    positions[0].pct = 6;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i].pct - positions[i - 1].pct < MIN_GAP_PCT) {
        positions[i].pct = positions[i - 1].pct + MIN_GAP_PCT;
      }
    }
  }

  return (
    <div className={s.levelMapCard}>
      <div className={s.cardTitle} style={{ marginBottom: '16px' }}>TECHNICAL & GAMMA LEVELS MAP</div>
      <div className={s.rulerContainer}>
        {/* Subtle Watermarks */}
        <div className={s.watermarkTop}>RESISTANCE</div>
        <div className={s.watermarkBottom}>SUPPORT</div>
        
        <div className={s.verticalRuler} />
        {positions.map((l, idx) => {
          const isPrice = l.type === 'price';
          const isGamma = l.type === 'gamma';
          
          return (
            <div 
              key={`${l.label}-${idx}`} 
              className={`${s.rulerMarker} ${isPrice ? s.priceMarker : isGamma ? s.gammaMarker : s.pivotMarker}`}
              style={{ top: `${l.pct.toFixed(1)}%` }}
            >
              <span className={s.markerVal} style={{ color: l.color }}>
                ${l.val.toFixed(2)}
              </span>
              <div className={s.markerDot} style={{ background: l.color, boxShadow: isPrice || isGamma ? `0 0 8px ${l.color}` : 'none' }} />
              <span className={s.markerLabel} style={{ color: l.color }}>
                {l.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* PremiumContent — removed (unused orphan component) */

/* ═══════════════════════════════════════════
   PAGE CONTENT (needs Suspense boundary)
   ═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   RELATED PEERS (LIVE)
   ═══════════════════════════════════════════ */
// Single unified logo source — /api/logo picks the best provider per ticker
// (Parqet app-icons, FMP for overrides like SPCX) so logos match on every page.
const LOGO = (t: string) => `/api/logo/${t}?v=2`;

function RelatedPeersLive({ tickers, currentPrice, locale }: { tickers: any[]; currentPrice: number; locale: string }) {
  const peerTickers = useMemo(() => tickers.map((r: any) => r.ticker), [tickers]);
  const { getPrice: wsGetPrice } = useRealtimeData(peerTickers);
  const router = useRouter();

  const title = locale === 'ko' ? '상관 종목 (Peers)' : locale === 'ja' ? '関連銘柄' : 'Related Peers';

  return (
    <div className={`${s.card} ${s.animateIn} ${s.delay6}`}>
      <div className={s.cardTitle} style={{ marginBottom: 'var(--s3)' }}>{title}</div>
      <div className={s.peerList}>
        {tickers.map((r: any) => {
          const wsPrice = wsGetPrice(r.ticker);
          const serverPrice = r.price || 0;
          const displayPrice = wsPrice?.price && wsPrice.price > 0 ? wsPrice.price : serverPrice;
          let displayChange = r.change ?? 0;
          const validWsPrice = wsPrice?.price || 0;
          const validPrevClose = r.prevClose || 0;
          if (validWsPrice > 0 && validPrevClose > 0) {
            displayChange = Number((((validWsPrice - validPrevClose) / validPrevClose) * 100).toFixed(2));
          } else {
            const wsChangePct = wsPrice?.changePct;
            if (wsChangePct !== undefined && Math.abs(wsChangePct) > 0 && Math.abs(wsChangePct) < 20) {
              displayChange = Number(wsChangePct.toFixed(2));
            }
          }
          return (
            <button
              key={r.ticker}
              onClick={() => router.push(`/app-view/cmd?t=${r.ticker}`)}
              className={s.peerRow}
            >
              <AppTickerLogo symbol={r.ticker} size={32} />
              <span className={s.peerTicker}>{r.ticker}</span>
              <span className={s.peerPrice}>
                {displayPrice > 0 ? `$${displayPrice < 10 ? displayPrice.toFixed(2) : displayPrice < 1000 ? displayPrice.toFixed(1) : Math.round(displayPrice)}` : '—'}
              </span>
              <span className={s.peerChange} style={{ color: displayChange > 0 ? 'var(--green)' : displayChange < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                {displayPrice > 0 ? `${displayChange > 0 ? '+' : ''}${displayChange.toFixed(2)}%` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SIGNAL CARD
   ═══════════════════════════════════════════ */
function SignalCard({ label, value, sub, color, bg, border, badge, iconKey, locale = 'en', infoTerm, emphasis, insightOverride }: {
  label: string; value: string; sub?: React.ReactNode; iconKey?: string;
  color?: string; bg?: string; border?: string;
  badge?: string; badgeColor?: string; locale?: string; infoTerm?: MetricTerm;
  /** 주목할 신호일 때 테두리·글로우를 강하게 (대표 요청: «강조는 테두리로») */
  emphasis?: boolean;
  /** iconKey 규칙 대신 직접 인사이트 문구를 줄 때 */
  insightOverride?: string | null;
}) {
  const getGlowColor = () => {
    const k = (iconKey || label).toUpperCase();
    if (k.includes('VOL REGIME')) {
      return 'rgba(34, 211, 238, 0.15)'; // Cyan
    }
    if (k.includes('CONVICTION') || k.includes('TREND')) {
      return 'rgba(16, 185, 129, 0.15)'; // Emerald
    }
    if (k.includes('SQUEEZE')) {
      return 'rgba(239, 68, 68, 0.15)'; // Red
    }
    if (k.includes('RADAR')) {
      return 'rgba(232, 121, 249, 0.18)'; // Fuchsia
    }
    if (k.includes('FUNDAMENTAL')) {
      return 'rgba(245, 158, 11, 0.15)'; // Amber
    }
    if (k.includes('FLOW PULSE')) {
      return 'rgba(20, 184, 166, 0.15)'; // Teal — 수급 계열
    }
    return 'rgba(255, 255, 255, 0.05)';
  };

  const getInsight = () => {
    const k = (iconKey || label).toUpperCase();
    if (k.includes('VOL REGIME')) {
      const regime = badge || '';
      if (locale === 'ko') {
        if (regime === 'ERUPTING') return '극단적 변동';
        if (regime === 'LOADED') return '변동성 축적';
        if (regime === 'COILING') return '에너지 응축';
        return '변동성 안정';
      }
      if (locale === 'ja') {
        if (regime === 'ERUPTING') return '極端な変動';
        if (regime === 'LOADED') return 'ボラティリティ蓄積';
        if (regime === 'COILING') return 'エネルギー凝縮';
        return '安定';
      }
      if (regime === 'ERUPTING') return 'Extreme Vol';
      if (regime === 'LOADED') return 'Vol Accumulating';
      if (regime === 'COILING') return 'Coiling';
      return 'Stable';
    }
    if (k.includes('CONVICTION')) {
      const score = parseFloat(value);
      if (isNaN(score)) return null;
      if (locale === 'ko') {
        if (score >= 80) return '강한 상승 편향';
        if (score >= 60) return '상승 우위';
        if (score >= 45) return '중립/관망';
        if (score >= 30) return '하락 우위';
        return '강한 하락 편향';
      }
      if (locale === 'ja') {
        if (score >= 80) return '強い上昇偏向';
        if (score >= 60) return '上昇優位';
        if (score >= 45) return '中立・様子見';
        if (score >= 30) return '下落優位';
        return '強い下落偏向';
      }
      if (score >= 80) return 'Strong Bullish';
      if (score >= 60) return 'Moderate Bullish';
      if (score >= 45) return 'Neutral/Mixed';
      if (score >= 30) return 'Moderate Bearish';
      return 'Strong Bearish';
    }
    if (k.includes('SQUEEZE')) {
      const status = badge || '';
      if (locale === 'ko') {
        if (status === 'CRITICAL') return '숏커버 임박/경계';
        if (status === 'HIGH') return '숏커버 가능성 높음';
        if (status === 'MEDIUM') return '공매도 보통';
        return '공매도 위험 낮음';
      }
      if (locale === 'ja') {
        if (status === 'CRITICAL') return '急変動警戒';
        if (status === 'HIGH') return 'スクイーズ高リスク';
        if (status === 'MEDIUM') return '空売り通常';
        return '空売りリスク低';
      }
      if (status === 'CRITICAL') return 'Critical Squeeze';
      if (status === 'HIGH') return 'High Squeeze Risk';
      if (status === 'MEDIUM') return 'Moderate Shorting';
      return 'Low Squeeze Risk';
    }
    if (k.includes('RADAR')) {
      const pct = parseFloat(value);
      if (isNaN(pct)) return null;
      if (locale === 'ko') {
        if (pct >= 45) return '기관 매집 강함';
        if (pct >= 30) return '기관 매집 보통';
        return '기관 거래 낮음';
      }
      if (locale === 'ja') {
        if (pct >= 45) return '機関の買い集め強';
        if (pct >= 30) return '機関の買い集め通常';
        return '機関取引低';
      }
      if (pct >= 45) return 'Strong Inst. Buy';
      if (pct >= 30) return 'Moderate Inst. Buy';
      return 'Low Inst. Activity';
    }
    if (k.includes('TREND')) {
      const val = value.toUpperCase();
      if (locale === 'ko') {
        if (val.includes('GOLDEN')) return '상승 추세 강화';
        if (val.includes('DEAD')) return '하락 추세 지속';
        return '단기 횡보';
      }
      if (locale === 'ja') {
        if (val.includes('GOLDEN')) return '上昇トレンド強';
        if (val.includes('DEAD')) return '下降トレンド強';
        return 'レンジ推移';
      }
      if (val.includes('GOLDEN')) return 'Bullish Trend';
      if (val.includes('DEAD')) return 'Bearish Trend';
      return 'Consolidating';
    }
    if (k.includes('FUNDAMENTAL')) {
      const val = value.toUpperCase();
      if (locale === 'ko') {
        if (val.startsWith('A')) return '재무 초우량';
        if (val.startsWith('B')) return '재무 양호';
        return '재무 추적 필요';
      }
      if (locale === 'ja') {
        if (val.startsWith('A')) return '超優良財務';
        if (val.startsWith('B')) return '健全財務';
        return '財務通常';
      }
      if (val.startsWith('A')) return 'Excellent';
      if (val.startsWith('B')) return 'Healthy';
      return 'Average';
    }
    return null;
  };

  const getProgress = () => {
    const k = (iconKey || label).toUpperCase();
    if (k.includes('VOL REGIME') || k.includes('CONVICTION')) {
      return parseFloat(value) || 0;
    }
    if (k.includes('RADAR')) {
      return parseFloat(value) || 0;
    }
    if (k.includes('SQUEEZE')) {
      const val = parseFloat(value) || 0;
      return Math.min(100, val * 5); // Scale so 20% looks full
    }
    return null;
  };

  const getIcon = (lbl: string) => {
    const l = lbl.toUpperCase();
    if (l.includes('VOL REGIME')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <path d="M12 2v20M17 5v14M22 9v6M7 7v10M2 10v4" strokeLinecap="round"/>
        </svg>
      );
    }
    if (l.includes('CONVICTION')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <circle cx="12" cy="12" r="10"/>
          <path d="M16.2 7.8l-2 5.6-5.6 2 2-5.6 5.6-2z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    if (l.includes('SQUEEZE')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    if (l.includes('RADAR')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="M12 6a6 6 0 00-6 6M12 9a3 3 0 00-3 3"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
        </svg>
      );
    }
    if (l.includes('TREND')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <path d="M23 6l-9.5 9.5-5-5L1 18" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M17 6h6v6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    if (l.includes('FUNDAMENTAL')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    if (l.includes('FLOW PULSE')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-80 shrink-0">
          <path d="M2 12h3l2.5-7 4 14 3-9 2.5 2H22" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    return null;
  };

  const glowColor = getGlowColor();
  const icon = getIcon(iconKey || label);
  const insightText = insightOverride !== undefined ? insightOverride : getInsight();
  const pctVal = getProgress();

  const isRadar = (iconKey || label).toUpperCase().includes('RADAR');
  const displayColor = isRadar ? 'text-fuchsia-400' : color || 'text-white';

  const getColorValue = () => {
    if (color?.includes('rose')) return '#f87171'; // rose-400
    if (color?.includes('amber')) return '#fbbf24'; // amber-400
    if (color?.includes('cyan')) return '#22d3ee'; // cyan-400
    if (color?.includes('emerald')) return '#34d399'; // emerald-400
    if (color?.includes('fuchsia') || isRadar) return '#e879f9'; // fuchsia-400
    if (color?.includes('purple')) return '#c084fc'; // purple-400
    if (color?.includes('indigo')) return '#818cf8'; // indigo-400
    if (color?.includes('teal')) return '#2dd4bf'; // teal-400
    return '#94a3b8'; // slate-400
  };
  const colorVal = getColorValue();

  return (
    <div 
      className="relative overflow-hidden rounded-2xl px-4 py-3.5 transition-all duration-300 backdrop-blur-xl border"
      style={{
        boxShadow: emphasis
          ? `0 0 0 1px ${colorVal}55, 0 0 20px ${colorVal}33, inset 0 1px 0 rgba(255,255,255,0.06)`
          : `0 0 16px ${glowColor.replace('0.15', '0.04')}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
        background: `radial-gradient(120% 120% at 20% 0%, ${emphasis ? colorVal + '18' : glowColor.replace('0.15', '0.05')}, transparent 70%), rgba(22, 32, 54, 0.45)`,
        borderColor: emphasis ? `${colorVal}66` : glowColor.replace('0.15', '0.22')
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-1.5 text-slate-300 font-bold uppercase tracking-wider text-[10.5px] min-w-0">
            {icon && <span style={{ color: colorVal, filter: `drop-shadow(0 0 2px ${colorVal})` }}>{icon}</span>}
            <span className="whitespace-nowrap">{label}</span>
          </div>
          {/* Header status badge removed — it duplicated the status shown on the value
              line below and overlapped the label on device. (badge prop still feeds
              getInsight/getProgress.) */}
          {infoTerm && <MetricInfo term={infoTerm} locale={locale} size={12} />}
        </div>
        
        {/* Metric Value & Insight Badge Inline Row */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span 
            className={`text-[20px] font-black font-mono tabular-nums leading-none tracking-tight ${displayColor}`}
            style={{ textShadow: `0 0 6px ${colorVal}30` }}
          >
            {value}
          </span>
          {insightText && (
            <span 
              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border leading-none tracking-wide"
              style={{
                borderColor: `${colorVal}30`,
                color: colorVal,
                backgroundColor: `${colorVal}12`,
                textShadow: `0 0 4px ${colorVal}20`
              }}
            >
              {insightText}
            </span>
          )}
        </div>

        {pctVal !== null && (
          <div className="h-[3px] bg-white/[0.04] rounded-full overflow-hidden my-2.5">
            <div 
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${pctVal}%`,
                background: colorVal,
                boxShadow: `0 0 6px ${colorVal}`
              }}
            />
          </div>
        )}
        {sub && (
          <div className="text-[11.5px] text-slate-400 mt-2 font-medium leading-snug tracking-wide">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

type Tri = string | { ko?: string; en?: string; ja?: string };
function tl(val: Tri | undefined, locale: string): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return (val as any)[locale] || val.en || val.ko || '';
}

/* ═══════════════════════════════════════════
   PAGE CONTENT (needs Suspense boundary)
   ═══════════════════════════════════════════ */
// M7 + key index/ETF tickers for the quick-pick chip row (recents are prepended).
const POPULAR_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];

function CmdPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';
  const tIndicators = useTranslations('indicators');
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');
  const ticker = (searchParams.get('t') || (typeof window !== 'undefined' ? localStorage.getItem('app-active-ticker') : null) || 'NVDA').toUpperCase();

  // Sync ticker to localStorage for Flow ↔ Command sync + track recently-viewed.
  const [recentTickers, setRecentTickers] = useState<string[]>([]);
  useEffect(() => {
    if (!ticker) return;
    try {
      localStorage.setItem('app-active-ticker', ticker);
      const prev: string[] = JSON.parse(localStorage.getItem('app-recent-tickers') || '[]');
      const next = [ticker, ...prev.filter((t) => t !== ticker)].slice(0, 6);
      localStorage.setItem('app-recent-tickers', JSON.stringify(next));
      setRecentTickers(next);
    } catch { /* storage unavailable */ }
  }, [ticker]);

  // Reset scroll to the top on every ticker switch. Same-route ?t= navigation keeps
  // the .app-main scroll position, so opening a ticker from a spot scrolled to the
  // bottom (e.g. the PEERS list) otherwise landed mid-page (below the price header).
  useEffect(() => {
    (document.querySelector('.app-main') as HTMLElement | null)?.scrollTo({ top: 0 });
  }, [ticker]);

  // Quick-pick chips: recently-viewed first, then popular (deduped).
  const chipTickers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...recentTickers, ...POPULAR_TICKERS]) {
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out.slice(0, 12);
  }, [recentTickers]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  /** 다크풀 해석 펼침 — 기본은 접힘(핵심만). 대표 지적: 화면을 너무 많이 차지한다 */
  const [dpOpen, setDpOpen] = useState(false);
  const [data, setData] = useState<(typeof DEMO & { rawTickerData?: any; unified?: any; fundRaw?: FundRaw | null; earnRaw?: EarnRaw | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Reorder tabs: OVERVIEW | VERDICT ✱ | QUANT ✱ | HOLDERS ✱
  const [activeTab, setActiveTab] = useState<'overview' | 'verdict' | 'quant' | 'holders'>('overview');
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  // Deep AI states
  const [gexStats, setGexStats] = useState<any>(null);
  const [aiInsightData, setAiInsightData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [relatedData, setRelatedData] = useState<any[]>([]);
  // [다크풀 대체] 기관 레이더 카드가 쓰던 다크풀은 Intrinio 피드에 값이 오지 않는다.
  // 익명 다크풀 대신 «누가·언제·얼마에» 가 다 나오는 내부자 거래로 교체했다.
  const [insiderData, setInsiderData] = useState<any>(null);
  // [공매도 403 대체] 「SHORT SQUEEZE」 카드는 siPercent 가 플랜 밖이라 죽어 있었다.
  // 볼린저 밴드폭 압축(변동성 스퀴즈)으로 되살린다 — 다른 개념이므로 라벨도 바꾼다.
  const [techData, setTechData] = useState<any>(null);
  // 신용 스프레드 — AI 분석에 매크로 축을 같이 넘기기 위해 (화면 표시는 가디언에서)
  const { snapshot: macroSnapshot } = useMacroSnapshot();

  // [BUG FIX] switching tickers must reset the view: always land back on OVERVIEW
  // (not the previously-open AI/QUANT/HOLDERS tab), and NEVER show the previous
  // ticker's AI analysis — clear the panel immediately (spinner shows until the new
  // ticker's result lands), and track the live ticker so late responses from an
  // earlier ticker can be dropped.
  const aiTickerRef = useRef(ticker);
  useEffect(() => {
    aiTickerRef.current = ticker;
    setActiveTab('overview');
    setAiInsightData(null);
    setGexStats(null);
    setInsiderData(null);   // 티커별 상태 — 안 지우면 이전 종목 내부자가 남는다
    setTechData(null);
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;
    let isMounted = true;
    fetch(`/api/live/related?t=${ticker}`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data?.topRelated) {
          setRelatedData(data.topRelated);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [ticker]);

  // 내부자 거래 — 메인 로드를 막지 않도록 별도로 가져온다 (10분 서버 캐시)
  useEffect(() => {
    if (!ticker) return;
    let isMounted = true;
    fetch(`/api/command/insider?ticker=${ticker}`, { cache: 'no-store' })
      .then(res => res.json())
      .then(d => { if (isMounted) setInsiderData(d?.insider || null); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [ticker]);

  // 고급 기술지표 (ATR·ADX·OBV·볼린저 + 변동성 프리미엄) — 6시간 서버 캐시
  useEffect(() => {
    if (!ticker) return;
    let isMounted = true;
    fetch(`/api/live/technicals?t=${ticker}`)
      .then(res => res.json())
      .then(d => { if (isMounted && !d?.error) setTechData(d); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [ticker]);

  // ★ 차트를 «본 데이터와 같은 순간» 출발시킨다. 이 이펙트는 아래 fetchAll 보다
  //   먼저 등록되므로 왕복이 겹치고, CandleChart 가 마운트될 땐 이미 도착해 있다.
  useEffect(() => {
    if (!ticker) return;
    loadChart(ticker, '1D');
  }, [ticker]);

  const initialLoadRef = useRef(true);
  /** unified 가 «준비 중»이면 짧게 재시도하기 위한 타이머·마지막 응답 */
  const partialRetry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastUnified = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    // 봤던 종목이면 즉시 그린다 — 스켈레톤을 다시 보여줄 이유가 없다.
    const cachedEntry = CMD_CACHE.get(ticker);
    const cacheFresh = cachedEntry && (Date.now() - cachedEntry.at) < CMD_CACHE_MAX_AGE_MS;
    if (cacheFresh) {
      setData(cachedEntry!.data);
      setLoading(false);
      initialLoadRef.current = false;
    } else {
      initialLoadRef.current = true;
      setLoading(true);
    }

    async function fetchAll() {
      try {
        const [tickerRes, analystRes, fundRes, earningsRes, unifiedRes] = await Promise.allSettled([
          // 이 화면은 옵션 체인을 쓰지 않는다 — 800KB 를 받을 이유가 없다
          fetch(`/api/live/ticker?t=${ticker}&chain=0`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/live/analyst?t=${ticker}`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/live/fundamentals?t=${ticker}`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/live/earnings?t=${ticker}`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/command/unified?t=${ticker}&lang=${locale}`, { cache: 'no-store' }).then(r => r.json()),
        ]);

        if (cancelled) return;

        const t = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
        const a = analystRes.status === 'fulfilled' ? analystRes.value : null;
        const f = fundRes.status === 'fulfilled' ? fundRes.value : null;
        const e = earningsRes.status === 'fulfilled' ? earningsRes.value : null;
        const u = unifiedRes.status === 'fulfilled' ? unifiedRes.value : null;
        lastUnified.current = u;

        const rejections = [
          { name: 'ticker', res: tickerRes },
          { name: 'analyst', res: analystRes },
          { name: 'fundamentals', res: fundRes },
          { name: 'earnings', res: earningsRes },
          { name: 'unified', res: unifiedRes }
        ].filter(x => x.res.status === 'rejected');

        if (rejections.length > 0) {
          fetch('/api/debug-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Promises rejected in Promise.allSettled',
              rejections: rejections.map(x => ({
                name: x.name,
                reason: String((x.res as any).reason)
              })),
              ticker,
              location: 'CmdPageContent fetchAll allSettled check'
            })
          }).catch(() => {});
        }

        const price = t?.display?.price ?? t?.price ?? DEMO.price;
        const changeAbs = t?.display?.changeAbs ?? DEMO.change;
        const changePct = t?.display?.changePctPct ?? DEMO.changePct;
        const up = changePct >= 0;
        const session = t?.session ?? DEMO.session;
        const company = t?.name ?? DEMO.company;

        const analyst = a?.totalAnalysts > 0 ? {
          rating: a.consensus || DEMO.analyst.rating,
          target: a.priceTarget?.targetConsensus || DEMO.analyst.target,
          targetHigh: a.priceTarget?.targetHigh || 0,
          targetLow: a.priceTarget?.targetLow || 0,
          buy: (a.breakdown?.strongBuy || 0) + (a.breakdown?.buy || 0),
          hold: a.breakdown?.hold ?? DEMO.analyst.hold,
          sell: (a.breakdown?.sell || 0) + (a.breakdown?.strongSell || 0),
          totalAnalysts: a.totalAnalysts || 0,
          bullishPct: a.bullishPct || 0,
          // 변화 이벤트(등급 상하향 · 목표가 리비전). 없으면 null — 카드가 알아서 접는다
          events: a.events ?? null,
        } : DEMO.analyst;

        // Fundamentals: /api/live/fundamentals returns FLAT (f.score, f.pe, etc.)
        const fundSource = f?.score != null ? f : (u?.fundamentals || null);
        const fundamentals = fundSource ? [
          { label: 'P / E', value: fundSource.pe != null ? String(fundSource.pe) : '—', sub: '', trend: 'up' },
          { label: 'ROE', value: fundSource.roe != null ? `${fundSource.roe}%` : '—', sub: '', trend: 'up' },
          { label: 'D/E', value: fundSource.de != null ? String(fundSource.de) : '—', sub: '', trend: 'up' },
          { label: 'MARGIN', value: fundSource.netMargin != null ? `${fundSource.netMargin}%` : '—', sub: '', trend: 'up' },
        ] : DEMO.fundamentals;
        const fundRaw: FundRaw | null = fundSource ? {
          score: fundSource.score ?? null,
          grade: fundSource.grade ?? null,
          pe: fundSource.pe ?? null,
          roe: fundSource.roe ?? null,
          de: fundSource.de ?? null,
          revenueGrowth: fundSource.revenueGrowth ?? null,
          netMargin: fundSource.netMargin ?? null,
          fcfYield: fundSource.fcfYield ?? null,
          breakdown: fundSource.breakdown ?? null,
        } : null;

        // Earnings: /api/live/earnings returns FLAT (e.nextEarningsDate, etc.)
        const earnSource = e?.hasData ? e : (u?.earnings?.hasData ? u.earnings : null);
        const earnings = earnSource ? {
          date: earnSource.nextEarningsDate || DEMO.earnings.date,
          daysLeft: earnSource.daysUntilEarnings ?? DEMO.earnings.daysLeft,
          progress: (() => {
            const days = earnSource.daysUntilEarnings ?? DEMO.earnings.daysLeft;
            if (days >= 90 || days <= 0) return 0;
            return Math.round(((90 - days) / 90) * 100);
          })(),
          session: earnSource.hourLabel || DEMO.earnings.session,
        } : DEMO.earnings;
        const earnRaw: EarnRaw | null = earnSource ? {
          nextEarningsDate: earnSource.nextEarningsDate || null,
          daysUntilEarnings: earnSource.daysUntilEarnings ?? null,
          daysLabel: earnSource.daysLabel || null,
          epsEstimate: earnSource.epsEstimate ?? null,
          epsActual: earnSource.epsActual ?? null,
          quarter: earnSource.quarter ?? null,
          year: earnSource.year ?? null,
          hourLabel: earnSource.hourLabel || null,
          forwardEps: earnSource.forwardEps ?? null,
          forwardRevenue: earnSource.forwardRevenue ?? null,
          forwardYear: earnSource.forwardYear ?? null,
          currentEps: earnSource.currentEps ?? null,
          currentRevenue: earnSource.currentRevenue ?? null,
          lastSurprise: earnSource.lastSurprise ?? null,
          hasData: true,
        } : null;

        const flow = t?.flow || {};
        const gexData = flow.gexProfile || DEMO.premium.gex;
        // 0 은 «값 없음»이다 — `??` 가 통과시키므로 따로 걸러야 한다.
        const firstNonZero = (...xs: any[]) => {
          for (const x of xs) { const n = Number(x); if (Number.isFinite(n) && n !== 0) return n; }
          return null;
        };
        const gammaFlipRawVal = firstNonZero(
          flow.gammaFlipLevel, u?.structure?.gammaFlipLevel, u?.volatility?.flipLevel
        );
        const premium = {
          gex: Array.isArray(gexData) ? gexData : DEMO.premium.gex,
          // ⚠️ 없으면 «—» 다. `$0.00` 은 「감마플립이 0달러」라는 거짓말이고,
          //    로딩 중인지 데이터가 없는지도 구분이 안 된다.
          // ★ [2026-09-04] `t`(live/ticker)가 벤더 예산 초과로 비면 이 칸들이 통째로
          //    죽는다. **unified 는 같은 값을 DynamoDB 에서 이미 갖고 있다**
          //    (실측 MSFT: structure.gammaFlipLevel=510 · maxPain=480 · netPremium=−3.8M).
          //    maxPain 만 폴백이 있어서 «맥스페인은 뜨는데 감마플립은 —» 였다.
          gammaFlip: gammaFlipRawVal ? `$${Number(gammaFlipRawVal).toFixed(2)}` : '$—',
          gammaFlipRaw: gammaFlipRawVal ?? DEMO.premium.gammaFlipRaw,
          callWall: flow.callWall ?? u?.structure?.callWall ?? DEMO.premium.callWall,
          putFloor: flow.putFloor ?? u?.structure?.putFloor ?? DEMO.premium.putFloor,
          maxPain: flow.maxPain ?? u?.structure?.maxPain ?? 0,
          // ⚠️ API 가 내보내는 이름은 `netPremium` 이다. `netFlow` 는 존재하지
          //    않아 항상 undefined → 0 이었다. 그래서 Flow 화면엔 $22.4M 이
          //    뜨는데 Command 만 «—» 였다(대표가 두 화면을 나란히 놓고 발견).
          // ★ [2026-09-04] 그런데 `??` 는 **0 을 통과시킨다.** 벤더가 비면
          //    live/ticker 는 null 이 아니라 `netPremium: 0` 을 내보내므로
          //    unified 폴백이 영원히 안 걸렸다 → 화면은 계속 «—».
          //    0 은 «없음»으로 보고 다음 후보로 넘어간다.
          netPremium: firstNonZero(flow.netPremium, flow.netFlow, u?.structure?.netPremium) ?? 0,
          darkPool: flow.darkPoolPct != null ? `${flow.darkPoolPct}%` : DEMO.premium.darkPool,
          blockTrades: flow.blockTrades ?? DEMO.premium.blockTrades,
          aiInsight: t?.alpha?.whyKR || DEMO.premium.aiInsight,
        };

        const high = t?.prices?.high ?? DEMO.high;
        const low = t?.prices?.low ?? DEMO.low;

        const nextData = {
          ticker,
          company,
          price,
          high,
          low,
          change: Math.abs(changeAbs),
          changePct: Math.abs(changePct),
          up,
          rsi14: u.rsi14 || u.technical?.rsi14 || t?.display?.rsi14 || t?.technical?.rsi14 || 0,
          vwap: t?.vwap ?? DEMO.vwap,
          session,
          analyst,
          fundamentals,
          earnings,
          premium,
          rawTickerData: t,
          unified: u,
          fundRaw,
          earnRaw,
        };
        CMD_CACHE.set(ticker, { at: Date.now(), data: nextData });
        if (CMD_CACHE.size > CMD_CACHE_MAX) {
          const oldest = CMD_CACHE.keys().next().value;
          if (oldest) CMD_CACHE.delete(oldest);
        }
        setData(nextData);
      } catch (err: any) {
        fetch('/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: err?.message || String(err),
            stack: err?.stack || '',
            ticker,
            location: 'CmdPageContent fetchAll'
          })
        }).catch(() => {});
        // ⚠️ 실패했다고 «있던 정상 값»을 전부 0 인 DEMO 로 덮으면 안 된다.
        //    화면에 $0 이 뜨는 것보다 조금 전 값이 남아 있는 편이 언제나 낫다.
        if (!cancelled && !CMD_CACHE.get(ticker)) {
          setData({ ...DEMO, ticker, company: DEMO.company, rawTickerData: null, unified: null, fundRaw: null, earnRaw: null });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    }

    /**
     * unified 가 「지금 준비 중」이라고 답하면 **그 말을 듣는다.**
     *   `_source:'unavailable'` · `_isPartial:true` 와 함께
     *   "Data for MU is being prepared. Please retry in 1-3 minutes." 가 온다.
     *   30초 주기만 돌면 사용자는 그동안 빈 칸을 본다 → 8초 뒤 한 번 더 친다.
     *   (백엔드가 채우는 동안 두세 번이면 대개 들어온다.)
     */
    async function fetchAllWithRetry() {
      await fetchAll();
      if (cancelled) return;
      const u = lastUnified.current;
      if (u && (u._source === 'unavailable' || u._isPartial === true)) {
        clearTimeout(partialRetry.current);
        partialRetry.current = setTimeout(() => { if (!cancelled) fetchAllWithRetry(); }, 8000);
      }
    }

    fetchAllWithRetry();
    const interval = setInterval(() => { if (!cancelled) fetchAllWithRetry(); }, 30000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(partialRetry.current); };
  }, [ticker]);

  // ══════════════════════════════════════════════════════════════
  // [2026-08-31] 인접 종목 «서버 캐시 데우기».
  //
  //   실측: 콜드 600~670ms · 웜 230~290ms. 칩을 누르기 전에 Redis 를 데워 두면
  //   처음 보는 종목도 웜 속도로 뜬다(모듈 캐시는 «본 적 있는» 종목만 도우므로
  //   첫 방문은 여전히 느렸다).
  //
  //   ⚠️ 모바일 데이터를 아껴야 한다 —
  //      · 화면을 가르는 «두 엔드포인트»만 (나머지는 그때 받아도 늦지 않다)
  //      · 3종목만 · 종목당 한 번만 · idle 에서만
  //      응답은 쓰지 않는다. 목적은 서버 캐시를 채우는 것뿐이다.
  //
  //   ★★ [2026-09-04 축소] 이 데우기가 **지금 보고 있는 종목의 쿼터를 훔치고
  //   있었다.** 벤더가 Intrinio 로 바뀌면서 «분당 호출 예산»이 생겼는데,
  //   3종목 × 2엔드포인트 = 6건이 매 종목 전환마다 추가로 나갔다.
  //   그 결과가 429 이고, 화면엔 RSI 0.0 · VWAP $0.00 로 나타났다.
  //   («다음 화면이 빠른 것»보다 «지금 화면이 맞는 것»이 먼저다.)
  //     · 1종목만
  //     · unified 만 — 이쪽은 DynamoDB 를 먼저 보므로 벤더 호출이 훨씬 적다.
  //       live/ticker 데우기는 **뺀다**. 그게 쿼터를 가장 많이 먹었다.
  // ══════════════════════════════════════════════════════════════
  const warmedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading || !data) return;
    const targets = chipTickers.filter((x) => x !== ticker && !warmedRef.current.has(x)).slice(0, 1);
    if (targets.length === 0) return;
    const run = () => {
      for (const x of targets) {
        warmedRef.current.add(x);
        fetch(`/api/command/unified?t=${x}&lang=${locale}`).catch(() => { });
      }
    };
    const w = window as any;
    const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 2000);
    return () => {
      if (w.requestIdleCallback && w.cancelIdleCallback) w.cancelIdleCallback(id);
      else clearTimeout(id as any);
    };
  }, [loading, data, ticker, chipTickers, locale]);

  // ── Live Price Hooks ──
  const { status: marketStatus } = useMarketStatus();
  const livePrice = useLivePrice(ticker, marketStatus.market);
  const { getPrice: wsGetPrice } = useRealtimeData([ticker]);
  const wsPrice = wsGetPrice(ticker);

  const t = data?.rawTickerData;

  const effectiveSession = marketStatus.isHoliday || marketStatus.market === 'closed'
    ? 'CLOSED'
    : (t?.session || data?.session || 'CLOSED').toUpperCase();

  const { displayPrice, displayChangePct, activeExtPrice, activeExtLabel, activeExtPct, activeExtPctKnown } = calcPriceDisplay({
    livePrice: wsPrice?.price || livePrice?.price,
    liveChangePct: wsPrice?.changePct || livePrice?.changePercent,
    liveExtPrice: livePrice?.extendedPrice,
    liveExtChangePct: livePrice?.extendedChangePercent,
    liveExtLabel: livePrice?.extendedLabel
      ? (effectiveSession === 'CLOSED'
        ? `${livePrice.extendedLabel} (CLOSED)`
        : livePrice.extendedLabel)
      : undefined,
    apiDisplayPrice: t?.display?.price || data?.price || 0,
    apiDisplayChangePct: t?.display?.changePctPct || data?.changePct || 0,
    session: effectiveSession,
    prevRegularClose: t?.prices?.prevRegularClose || t?.prevClose || null,
    prevClose: t?.prevClose || null,
    regularCloseToday: t?.prices?.regularCloseToday || ((effectiveSession === 'POST' || effectiveSession === 'CLOSED') ? (t?.prices?.regularCloseToday || undefined) : undefined),
    prevChangePct: t?.prices?.prevChangePct,
    fallbackChangePct: t?.display?.changePctPct || data?.changePct || 0,
    lastTrade: t?.prices?.lastTrade || t?.display?.price || data?.price || 0,
    extended: t?.extended || {},
    prices: t?.prices || {},
  });

  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [extFlash, setExtFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef(displayPrice);
  const prevExtPriceRef = useRef(activeExtPrice);
  const displayPriceRef = useRef(displayPrice);
  const displayChangePctRef = useRef(displayChangePct);
  const effectiveSessionRef = useRef(effectiveSession);

  useEffect(() => {
    displayPriceRef.current = displayPrice;
    displayChangePctRef.current = displayChangePct;
    effectiveSessionRef.current = effectiveSession;
    if (displayPrice !== prevPriceRef.current) {
      const isUp = displayPrice >= prevPriceRef.current;
      setFlash(isUp ? 'up' : 'down');
      prevPriceRef.current = displayPrice;
      const tId = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(tId);
    }
  }, [displayPrice, displayChangePct, effectiveSession]);

  useEffect(() => {
    if (!activeExtPrice || activeExtPrice <= 0) {
      prevExtPriceRef.current = activeExtPrice;
      return;
    }
    if (activeExtPrice !== prevExtPriceRef.current) {
      const isUp = activeExtPrice >= prevExtPriceRef.current;
      setExtFlash(isUp ? 'up' : 'down');
      prevExtPriceRef.current = activeExtPrice;
      const tId = setTimeout(() => setExtFlash(null), 950);
      return () => clearTimeout(tId);
    }
  }, [activeExtPrice]);

  const resolvedPrevClose = t?.prices?.prevRegularClose || t?.prevClose || 0;
  const finalChangeAbs = resolvedPrevClose > 0 ? Math.abs(displayPrice - resolvedPrevClose) : Math.abs(t?.display?.changeAbs || data?.change || 0);
  const up = displayChangePct >= 0;

  // ── [GEX→AI] Fetch GEX history stats for AI Deep Analysis ──
  useEffect(() => {
    if (!ticker) return;
    fetch(`/api/history?type=gex&ticker=${ticker}&days=30`)
      .then(r => r.json())
      .then(res => {
        const raw = res.data || [];
        if (raw.length < 2) return;
        const dayMap = new Map<string, any[]>();
        raw.forEach((d: any) => {
          const dt = new Date(d.timestamp);
          const et = new Date(dt.toLocaleString('en-US', { timeZone: 'America/New_York' }));
          if (et.getDay() === 0 || et.getDay() === 6) return;
          const tm = et.getHours() * 60 + et.getMinutes();
          if (tm < 570 || tm > 960) return;
          const k = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
          if (!dayMap.has(k)) dayMap.set(k, []);
          dayMap.get(k)!.push(d);
        });
        const cd = [...dayMap.keys()].sort().map(k => dayMap.get(k)!.at(-1)!);
        if (cd.length < 2) return;
        const latest = cd[cd.length - 1];
        const vals = cd.map((d: any) => d.gex);
        const sorted = [...vals].sort((a: number, b: number) => a - b);
        const pctIdx = sorted.findIndex((v: number) => v >= latest.gex);
        const pct = Math.round((pctIdx / sorted.length) * 100);
        let streak = 0;
        for (let i = cd.length - 1; i >= 0; i--) { if (cd[i].gammaRegime === latest.gammaRegime) streak++; else break; }
        const sDays = new Set(cd.slice(cd.length - streak).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size;
        const durs: number[] = []; let rs2 = 0;
        for (let i = 1; i < cd.length; i++) {
          if (cd[i].gammaRegime !== cd[rs2].gammaRegime) {
            if (cd[rs2].gammaRegime === latest.gammaRegime) durs.push(new Set(cd.slice(rs2, i).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size);
            rs2 = i;
          }
        }
        if (cd[rs2].gammaRegime === latest.gammaRegime) durs.push(new Set(cd.slice(rs2).map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size);
        const avg = durs.length > 0 ? parseFloat((durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1)) : 0;
        let cwR = 0, cwT = 0, cwSR = 0, cwST = 0;
        cd.forEach((d: any) => { if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) { cwT++; if (d.price < d.callWall) cwR++; } });
        for (let i = cd.length - 1; i >= Math.max(0, cd.length - streak); i--) { const d = cd[i]; if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) { cwST++; if (d.price < d.callWall) cwSR++; } }
        const flips: any[] = [];
        for (let i = 1; i < cd.length; i++) { if (cd[i].gammaRegime !== cd[i-1].gammaRegime && cd[i-1].gammaRegime) flips.push({ from: cd[i-1].gammaRegime, to: cd[i].gammaRegime, timestamp: cd[i].timestamp, price: cd[i].price }); }
        setGexStats({
          percentile: pct, streakDays: sDays, streakMultiple: avg > 0 ? parseFloat((sDays / avg).toFixed(1)) : 0,
          avgRegimeDuration: avg, callWallAccuracy: cwT > 0 ? Math.round((cwR / cwT) * 100) : null,
          cwStreakAccuracy: cwST > 0 ? Math.round((cwSR / cwST) * 100) : null,
          flipEvents: flips, latestRegime: latest.gammaRegime,
          totalDays: new Set(cd.map((d: any) => new Date(d.timestamp).toISOString().slice(0, 10))).size,
        });
      })
      .catch(() => {});
  }, [ticker]);

  // ── [AI DEEP INSIGHTS] Fetch detailed AI report ──
  const [aiLastFetchedAt, setAiLastFetchedAt] = useState<number>(0);
  const [aiRefreshCooldown, setAiRefreshCooldown] = useState(false);

  const fetchAiAnalysis = useCallback((triggerReason: string = 'FIRST_VIEW') => {
    // data must BELONG to the current ticker — right after a switch it still
    // holds the previous ticker's numbers, and generating with those poisons
    // the server cache under the NEW ticker (root cause of stale AI panels)
    if (!data || (data as any).ticker !== ticker) return;
    // the ticker this request is FOR — responses landing after a switch are dropped
    const reqTicker = ticker;
    setAiLoading(true);

    const u = data.unified || {};
    const q = data;
    const s = u.structure || {};
    const vol = u.volatility || {};
    const sma = u.sma || {};
    const fund = u.fundamentals || {};
    const anal = u.analyst || {};
    const inst = u.institutional || {};
    const sqz = u.squeeze || {};
    const earn = u.earnings || {};

    const snapshot = {
      price: displayPriceRef.current || q.price,
      priceChange: displayChangePctRef.current || q.changePct,
      session: effectiveSessionRef.current,
      signalCore: { direction: 'NEUTRAL', conviction: 'MIXED', condition: 'TREND', conclusion: '', bullCount: 0, bearCount: 0, bullSignals: '', bearSignals: '' },
      contextScore: { value: u.alpha?.score || 0, grade: u.alpha?.grade || 'C' },
      smartFlow: { value: u.smartFlow || 0, trend: u.smartFlow >= 60 ? 'INFLOW' : 'NEUTRAL' },
      sma: { cross: sma.cross || 'NONE', sma50: sma.sma50 || 0, sma200: sma.sma200 || 0, trendPhase: sma.phase || 'UNKNOWN' },
      vwap: u.structure?.underlyingPrice || 0,
      vwapDistance: '0%',
      conviction: { score: u.alpha?.score || 50, grade: u.alpha?.grade || 'C' },
      structure: {
        netGex: s.netGex || 0, gammaFlipLevel: s.gammaFlipLevel || 0,
        squeezeRisk: vol.squeezeRisk || 'LOW', squeezeScore: vol.squeezeScore || 0,
        pcRatio: s.pcRatio || 0, callWall: s.levels?.callWall || 0,
        putFloor: s.levels?.putFloor || 0, maxPain: s.maxPain || 0,
        gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL',
      },
      flow: { netPremium: q.rawTickerData?.flow?.netPremium ?? q.rawTickerData?.flow?.netFlow ?? 0 },
      fundamental: { score: fund.score || 0, grade: fund.grade || '-', pe: fund.breakdown?.pe?.value || 0, fcfMargin: 0 },
      analyst: { score: anal.bullishPct || 0, buyPct: anal.bullishPct || 0 },
      // [2026-08-29] 다크풀은 현재 피드에 값이 없다 — 0 을 보내면 AI 가 사실로 서술한다
      institutional: { insiderNet30d: insiderData?.net30d ?? null, insiderBuy: insiderData?.buyCount ?? null, insiderSell: insiderData?.sellCount ?? null, activity: insiderData?.sentiment || 'N/A' },
      // [2026-08-30] 새 지표를 AI 에도 넘긴다 — 화면에만 있고 분석에 없으면 반쪽이다
      technicals: techData ? { adx: techData.adx, obv: techData.obv, bb: techData.bb, atr: techData.atr, volPremium: techData.volPremium } : null,
      creditSpread: macroSnapshot?.creditSpread ?? null,
      volatility: { regime: vol.regime || 'CALM', regimeScore: vol.regimeScore || 0, gexLong: 0 },
      squeeze: { status: sqz.status || 'NORMAL', siPercent: sqz.siPercent || 0 },
      earnings: { daysUntil: earn.daysUntilEarnings || 999, date: earn.nextEarningsDate || '', estimatedEps: earn.epsEstimate || 0 },
      relatedTickers: u.related?.topRelated?.map((r: any) => r.ticker) || [],
    };

    fetch('/api/command/deep-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, locale, snapshot, triggerReason, gexStats }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        // stale guard: user switched tickers while this was in flight
        if (aiTickerRef.current !== reqTicker) return;
        if (res) {
          setAiInsightData(res);
          setAiLastFetchedAt(Date.now());
          // Fallback auto-retry: if server returned a fallback result, retry after 15s
          if (res.isFallback) {
            setTimeout(() => { if (aiTickerRef.current === reqTicker) fetchAiAnalysis('FIRST_VIEW'); }, 15000);
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (aiTickerRef.current === reqTicker) setAiLoading(false); });
  }, [data, gexStats, locale, ticker]);

  useEffect(() => {
    fetchAiAnalysis('FIRST_VIEW');
  }, [fetchAiAnalysis]);

  // Manual refresh handler with 30-min cooldown
  const handleAiRefresh = useCallback(() => {
    if (aiRefreshCooldown) return;
    setAiRefreshCooldown(true);
    fetchAiAnalysis('MANUAL_REFRESH');
    setTimeout(() => setAiRefreshCooldown(false), 30 * 60 * 1000);
  }, [aiRefreshCooldown, fetchAiAnalysis]);

  // ── 9-Signal Calculations (Same as MobileCmdMetrics) ──
  const signalsData = useMemo(() => {
    if (!data) return null;
    const u = data.unified || {};
    const q = data;
    const structure = u.structure || {};
    const volatility = u.volatility || {};
    const sma = u.sma || {};
    const squeeze = u.squeeze || {};
    const institutional = u.institutional || {};
    const earnings = u.earnings || {};
    const analyst = u.analyst || {};
    const fund = u.fundamentals || {};

    const pcr = structure.pcRatio || 0;
    const regime = volatility.regime || (q.rawTickerData?.gammaRegime === 'LONG' ? 'CALM' : q.rawTickerData?.gammaRegime === 'SHORT' ? 'LOADED' : 'CALM');
    const squeezeScore = volatility.squeezeScore || q.rawTickerData?.squeezeScore || 0;
    const smaCross = sma.cross || 'NONE';
    // 다크풀 — FINRA 규제 원본(T+1). 없으면 null 로 두고 카드를 안 그린다.
    // ⚠️ 다크풀 필드는 응답의 **flow** 아래에 있다. 최상위에서 읽으면
    //    조건이 영영 false 라 카드가 «조용히» 안 그려진다(실측으로 잡음).
    const dpRaw = (q.rawTickerData?.flow ?? q.rawTickerData ?? {}) as Record<string, unknown>;
    const dp = typeof dpRaw.darkPoolPct === 'number' && dpRaw.darkPoolPct > 0 ? {
        pct: dpRaw.darkPoolPct as number,
        shortPct: typeof dpRaw.darkPoolShortPct === 'number' ? dpRaw.darkPoolShortPct as number : null,
        volRatio: typeof dpRaw.darkPoolVolRatio === 'number' ? dpRaw.darkPoolVolRatio as number : null,
        stealth: typeof dpRaw.darkPoolStealth === 'number' ? dpRaw.darkPoolStealth as number : null,
        regime: (dpRaw.darkPoolRegime ?? null) as 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null,
        marketAvg: typeof dpRaw.darkPoolMarketAvg === 'number' ? dpRaw.darkPoolMarketAvg as number : null,
        date: (dpRaw.darkPoolDate ?? null) as string | null,
    } : null;
    const darkPool = dp?.pct ?? 0;
    const earningsLabel = earnings.daysLabel || '';
    const flipLevel = structure.gammaFlipLevel || 0;
    const flipDist = flipLevel > 0 && q.price > 0 ? ((q.price - flipLevel) / flipLevel * 100) : 0;
    const isAboveFlip = flipDist > 0;
    const atmIV = volatility.iv || structure.atmIV ? Math.round((volatility.iv || (structure.atmIV * 100)) || 0) : 0;
    const priceTarget = analyst.priceTarget?.targetConsensus || 0;
    const targetUpside = priceTarget > 0 && q.price > 0 ? ((priceTarget - q.price) / q.price * 100) : 0;

    // effectiveVol
    const netGex = structure.netGex || 0;
    const isShortGamma = netGex < 0;
    const fLevel = structure.gammaFlipLevel || 0;
    const priceVal = q.price || 0;
    const fDist = fLevel > 0 && priceVal > 0 ? ((priceVal - fLevel) / fLevel) * 100 : 0;
    let rs = 5;
    if (isShortGamma) rs += Math.min(30, Math.abs(netGex) / 1000000 * 3);
    else rs += Math.min(10, Math.abs(netGex) / 2000000 * 3);
    if (Math.abs(fDist) < 1) rs += 15;
    else if (Math.abs(fDist) < 3) rs += 10;
    else if (Math.abs(fDist) < 5) rs += 5;
    else if (Math.abs(fDist) < 10) rs += 2;
    const iv = structure.atmIV || 0;
    if (iv > 0.6) rs += 25;
    else if (iv > 0.4) rs += 15;
    else if (iv > 0.25) rs += 8;
    else if (iv > 0.15) rs += 4;
    rs = Math.min(100, Math.round(rs));
    let rg = rs >= 75 ? 'ERUPTING' : rs >= 50 ? 'LOADED' : rs >= 25 ? 'COILING' : 'CALM';
    const cachedIv = volatility.iv || 0;
    const derivedIv = iv ? Math.round(iv * 100) : 0;
    const finalIv = derivedIv > 0 ? derivedIv : cachedIv;
    if (derivedIv === 0 && cachedIv > 0) {
      let rs2 = 5;
      if (isShortGamma) rs2 += Math.min(30, Math.abs(netGex) / 1000000 * 3);
      else rs2 += Math.min(10, Math.abs(netGex) / 2000000 * 3);
      if (Math.abs(fDist) < 1) rs2 += 15;
      else if (Math.abs(fDist) < 3) rs2 += 10;
      else if (Math.abs(fDist) < 5) rs2 += 5;
      else if (Math.abs(fDist) < 10) rs2 += 2;
      if (cachedIv > 60) rs2 += 25;
      else if (cachedIv > 40) rs2 += 15;
      else if (cachedIv > 25) rs2 += 8;
      else if (cachedIv > 15) rs2 += 4;
      rs2 = Math.min(100, Math.round(rs2));
      if (rs2 > rs) {
        rs = rs2;
        rg = rs2 >= 75 ? 'ERUPTING' : rs2 >= 50 ? 'LOADED' : rs2 >= 25 ? 'COILING' : 'CALM';
      }
    }

    // conviction
    let cScore = 50;
    if (smaCross === 'GOLDEN') cScore += 15;
    else if (smaCross === 'DEAD') cScore -= 15;
    const vwapVal = data?.vwap || structure?.underlyingPrice || 0;
    if (vwapVal > 0 && priceVal > 0) {
      const vwapDiff = ((priceVal - vwapVal) / vwapVal) * 100;
      if (vwapDiff > 1) cScore += 8;
      else if (vwapDiff < -1) cScore -= 8;
    }
    const cPcr = structure?.pcRatio || 0;
    if (cPcr > 0 && cPcr < 0.7) cScore += 7;
    else if (cPcr > 1.2) cScore -= 7;
    if (netGex > 0) cScore += 5;
    else if (netGex < 0) cScore -= 5;
    const netPrem = q.rawTickerData?.flow?.netPremium ?? q.rawTickerData?.flow?.netFlow ?? 0;
    if (netPrem > 500000) cScore += 5;
    else if (netPrem < -500000) cScore -= 5;
    cScore = Math.max(0, Math.min(100, cScore));
    let cLabel = tDashboard('convNeutral'); let cGrade = 'C';
    if (cScore >= 80) { cLabel = tDashboard('convStrong'); cGrade = 'A'; }
    else if (cScore >= 65) { cLabel = tDashboard('convBullish'); cGrade = 'B+'; }
    else if (cScore >= 55) { cLabel = tDashboard('convSlightUp'); cGrade = 'B'; }
    else if (cScore >= 45) { cLabel = tDashboard('convNeutral'); cGrade = 'C'; }
    else if (cScore >= 35) { cLabel = tDashboard('convSlightDown'); cGrade = 'D'; }
    else if (cScore >= 20) { cLabel = tDashboard('convBearish'); cGrade = 'D-'; }
    else { cLabel = tDashboard('convStrongDown'); cGrade = 'F'; }

    return {
      regimeScore: rs, regime: rg, gexLabel: isShortGamma ? 'SHORT' : 'LONG', iv: finalIv, flipDistance: Math.round(fDist * 10) / 10, flipLevel: fLevel, isAboveFlip: fDist > 0,
      convictionScore: cScore, convictionLabel: cLabel, convictionGrade: cGrade,
      vwap: vwapVal, vwapDiff: vwapVal > 0 && priceVal > 0 ? ((priceVal - vwapVal) / vwapVal) * 100 : 0,
      squeezePercent: squeeze.siPercent ?? (squeezeScore > 0 ? squeezeScore : null), squeezeStatus: squeeze.status || 'LOW', dtc: squeeze.daysToCover ?? null, siChange: squeeze.siChange ?? null, shortVol: institutional.shortVolume?.percent ?? null,
      analystConsensus: analyst.consensus || null, totalAnalysts: analyst.totalAnalysts || 0, priceTarget, targetUpside, buyPct: analyst.totalAnalysts > 0 ? Math.round(((analyst.breakdown?.strongBuy || 0) + (analyst.breakdown?.buy || 0)) / analyst.totalAnalysts * 100) : 0,
      darkPool, dp, blockTradeCount: institutional.blockTrade?.count || 0,
      smaCross, smaDistance: sma.distance ?? null, smaLabel: sma.label || '',
      fundGrade: fund.grade || '', fundScore: fund.score || null, fundPe: fund.pe || null, fundRoe: fund.roe || null, fundRevenueGrowth: fund.revenueGrowth || null,
      earningsLabel, nextEarningsDate: earnings.nextEarningsDate || '', epsEstimate: earnings.epsEstimate || null
    };
  }, [data]);

  /**
   * 고급 기술지표 → 화면 표시값
   *
   * ADX  추세 «강도». 지금 트렌드 페이즈는 이동평균 교차만 봐서
   *      추세가 없는 구간에서도 GOLDEN/DEAD 를 말한다. ADX<20 이면
   *      그 교차는 대부분 의미가 없으므로 **경고로 강조**한다.
   * OBV  자금 흐름. 가격과 어긋나면(다이버전스) 테두리를 강조한다.
   * ATR  하루 실제 변동폭 — 히어로의 데이 레인지 옆에 붙인다.
   */
  const techSignal = useMemo(() => {
    const L = (ko: string, en: string, ja: string) => ({ ko, en, ja }[locale as 'ko' | 'en' | 'ja'] ?? en);
    const adx = techData?.adx || null;
    const obv = techData?.obv || null;
    const atr = techData?.atr || null;
    // 가격·IV 는 이 화면이 안다. API 캐시(6시간)에 굳히지 않고 여기서 파생한다.
    const px = Number(displayPrice) || 0;
    const ivNow = Number(signalsData?.iv) || 0;
    const rv = techData?.volPremium?.rvPct ?? null;

    // ── ADX ──
    let adxBadge: string | null = null;
    let adxWeak = false;
    if (adx) {
      adxWeak = adx.regime === 'RANGE';
      adxBadge = adx.regime === 'STRONG' ? L('강한 추세', 'Strong', '強いトレンド')
        : adx.regime === 'TREND' ? L('추세 있음', 'Trending', 'トレンド')
          : adx.regime === 'WEAK' ? L('추세 약함', 'Weak', 'トレンド弱')
            : L('무추세', 'No trend', 'トレンドなし');
    }

    // ── OBV ──
    let obvValue = '—';
    let obvDir: 'up' | 'down' | 'flat' = 'flat';
    let obvBadge: string | null = null;
    if (obv && obv.slopePct != null) {
      obvValue = `${obv.slopePct > 0 ? '+' : ''}${obv.slopePct.toFixed(1)}%`;
      obvDir = obv.slopePct > 0 ? 'up' : obv.slopePct < 0 ? 'down' : 'flat';
      obvBadge = obv.divergence === 'BULL' ? L('가격↓ 자금↑', 'Price↓ Flow↑', '価格↓ 資金↑')
        : obv.divergence === 'BEAR' ? L('가격↑ 자금↓', 'Price↑ Flow↓', '価格↑ 資金↓')
          : obv.slopePct > 3 ? L('유입', 'Inflow', '流入')
            : obv.slopePct < -3 ? L('유출', 'Outflow', '流出')
              : L('중립', 'Neutral', '中立');
    }

    return {
      adx, adxBadge, adxWeak,
      obvValue, obvDir, obvBadge,
      obvDivergent: !!obv?.divergence,
      atrAbs: atr?.value ?? null,
      atrPct: atr?.value && px > 0 ? (atr.value / px) * 100 : null,
      // 변동성 프리미엄 — 실현변동성은 API 가 주고, IV 는 이 화면의 실시간 값을 쓴다
      volPremium: (rv != null && ivNow > 0)
        ? (() => {
          const spread = ivNow - rv;
          return { ivPct: ivNow, rvPct: rv, spread, label: spread > 10 ? 'RICH' : spread < -10 ? 'CHEAP' : 'FAIR' };
        })()
        : null,
    };
    // ⚠️ 의존성에 가격·IV 를 반드시 넣는다. 빼면 techData 가 먼저 도착했을 때
    //    px=0 / iv=0 으로 계산된 값이 그대로 굳어 ATR 배지와 변동성 프리미엄이
    //    영영 안 뜬다 (2026-08-30 실화면에서 그렇게 비어 있었다).
  }, [techData, locale, displayPrice, signalsData?.iv]);

  // 내부자 거래 시그널 카드 (구 「기관 레이더」).
  // 판정은 services/insiderSignal 한 곳에서만 한다 — 모바일 웹·SSR 카드와 같은 식.
  const insiderSignal = useMemo(() => {
    const v = buildInsiderSignal(insiderData, locale as any);
    const tone = v.direction === 'up'
      ? { color: 'text-emerald-400', bg: 'bg-emerald-950/20', border: 'border-emerald-500/20' }
      : v.direction === 'down'
        ? { color: 'text-rose-400', bg: 'bg-rose-950/20', border: 'border-rose-500/20' }
        : { color: 'text-slate-300', bg: 'bg-slate-900/40', border: 'border-white/[0.06]' };
    const sub = v.state === 'net' ? (
      <>
        {{ ko: '매수', en: 'Buy', ja: '買い' }[locale as 'ko' | 'en' | 'ja']}{' '}
        <span className="text-emerald-400 font-extrabold">{v.buy}</span>
        {' · '}
        {{ ko: '매도', en: 'Sell', ja: '売り' }[locale as 'ko' | 'en' | 'ja']}{' '}
        <span className="text-rose-400 font-extrabold">{v.sell}</span>
        {{ ko: '건', en: '', ja: '件' }[locale as 'ko' | 'en' | 'ja']}
      </>
    ) : <>{v.subText}</>;
    return { ...tone, value: v.value, sub };
  }, [insiderData, locale]);

  // Verdict AI Deep Insight Accordion parsing
  const verdictHeader = aiInsightData || null;
  const currentStateText = tl(verdictHeader?.currentState, locale);
  const verdictParts = currentStateText?.split('—') || [];
  const verdictLabel = verdictParts[0]?.trim() || 'NEUTRAL';
  const verdictDesc = verdictParts.slice(1).join('—').trim() || '';
  const verdictColor = verdictLabel.includes('BULL') ? '#10b981' : verdictLabel.includes('BEAR') ? '#f43f5e' : '#f59e0b';

  const companyDescription = useMemo(() => {
    const overview = data?.unified?.overview?.overview || {};
    // overview.description is already translated to the requested locale (the API + cache are
    // per-locale). The old `descriptionJA` field never existed, so ja fell back to English.
    return locale === 'en' ? overview.descriptionEN : (overview.description || overview.descriptionEN);
  }, [data, locale]);

  const relatedPeers = useMemo(() => {
    return relatedData.length > 0 ? relatedData : (data?.unified?.related?.topRelated || []);
  }, [relatedData, data?.unified?.related?.topRelated]);

  const toggleSection = (i: number) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const sectionIcon = (title: string) => {
    const tStr = title.toLowerCase();
    if (tStr.includes('기술') || tStr.includes('technical') || tStr.includes('技術')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-cyan-400">
          <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 6h6v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    if (tStr.includes('옵션') || tStr.includes('option') || tStr.includes('オプション')) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-indigo-400">
          <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-amber-400">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
        <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  };

  if (loading || !data) {
    return (
      <>
        <div className={s.header}>
          <div className={s.headerBtn} />
          <div className={s.headerCenter}>
            <div className={s.headerTicker}>{ticker}</div>
            <div className={s.headerCompany}>Loading…</div>
          </div>
          <div className={s.headerBtn} />
        </div>
        <div className={s.skeletonBlock} />
        <div className={s.skeletonBlock} />
        <div className={s.skeletonBlock} />
      </>
    );
  }

  const sessionLabel = effectiveSession === 'REG' ? 'MARKET OPEN'
    : effectiveSession === 'PRE' ? 'PRE-MARKET'
    : effectiveSession === 'POST' ? 'AFTER HOURS'
    : 'MARKET CLOSED';

  const isOpen = effectiveSession === 'REG';
  const isPrePost = effectiveSession === 'PRE' || effectiveSession === 'POST';

  const hasExt = activeExtPrice > 0 && activeExtLabel;
  const extCardClassName = [
    s.heroExtCard,
    isPrePost ? s.extLive : s.extClosed,
    isPrePost && extFlash ? s[extFlash === 'up' ? 'extUp' : 'extDown'] : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* ── BACKGROUND GLOWS FOR GLASSMORPHISM DEPTH ── */}
      <div className={s.bgGlows}>
        <div className={s.glowCyan} />
        <div className={s.glowPurple} />
        <div className={s.glowAmber} />
      </div>

      {/* ── PINNED TOP BAR: header + ticker quick-pick chips pin together ── */}
      <div className={s.topBar}>
      {/* ── HEADER ── */}
      <div className={s.header}>
        <button className={s.headerBtn} onClick={() => router.back()} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 19l-7-7 7-7" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={s.headerCapsule}>
          <AppTickerLogo symbol={data.ticker} size={22} />
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <span className={s.headerTicker} style={{ fontSize: '15px' }}>{data.ticker}</span>
          </div>
        </div>
        <button className={s.headerBtn} aria-label="Search" onClick={() => setIsSearchOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--text-dim)" strokeWidth="2" />
            <path d="m16.5 16.5 4 4" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Ticker quick-pick chips (recently-viewed + popular) ── */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 16px 4px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="no-scrollbar">
        {chipTickers.map((sym) => {
          const isActive = ticker === sym;
          return (
            <button
              key={sym}
              onClick={() => { if (sym !== ticker) router.push(`/${locale}/app-view/cmd?t=${sym}`); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                height: '32px', minHeight: 0, padding: '0 12px', boxSizing: 'border-box',
                borderRadius: 'var(--r-pill, 999px)', border: '1px solid',
                borderColor: isActive ? 'var(--cyan, #06b6d4)' : 'rgba(255,255,255,0.06)',
                background: isActive ? 'rgba(30,41,59,0.55)' : 'rgba(255,255,255,0.02)',
                color: isActive ? '#ffffff' : 'var(--text-dim)',
                font: 'var(--f-micro)', fontWeight: 700, lineHeight: 1, cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: isActive ? '0 0 12px rgba(6,182,212,0.3)' : 'none',
                flexShrink: 0, outline: 'none',
              }}
            >
              <AppTickerLogo symbol={sym} size={18} />
              <span>{sym}</span>
            </button>
          );
        })}
      </div>
      </div>
      {/* ── /PINNED TOP BAR ── */}

      <div
        className={`${s.p2Card} ${s.connectedP2Card} ${s.animateIn} ${s.delay1}`}
        style={{
          marginBottom: '0px',
          borderBottom: 'none',
          borderBottomLeftRadius: '0px',
          borderBottomRightRadius: '0px'
        }}
      >
        {/* Background sparkline decoration */}
        <SparklineBg up={up} seed={data.ticker} />

        {/* ── Row 1: Identity (Logo + Ticker/Company) | Status ── */}
        <div className={s.heroIdentity}>
          <div className={s.heroLeft}>
            <AppTickerLogo symbol={data.ticker} size={44} />

            <div className={s.heroNameGroup}>
              <span className={s.heroTicker}>{data.ticker}</span>
              <span className={s.heroCompany}>{data.company}</span>
            </div>
            <span className={`${s.p2Tick} ${flash ? s[`show-${flash}`] : ''}`}>
              {flash === 'down' ? '▼ TICK' : '▲ TICK'}
            </span>
          </div>
          <div className={s.heroRight}>
            <div className={isOpen ? s.heroStatusOpen : isPrePost ? s.heroStatusPrePost : s.heroStatusClosed}>
              {isOpen ? (
                <span className={s.marketDotActive} />
              ) : isPrePost ? (
                <span className={s.marketDotPulse} />
              ) : null}
              {sessionLabel}
            </div>
            <span className={s.heroTime}>
              {(() => {
                const now = new Date();
                const etStr = now.toLocaleString('en-US', {
                  timeZone: 'America/New_York',
                  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
                });
                return `${etStr} ET`;
              })()}
            </span>
          </div>
        </div>

        {/* ── Row 2: Big Price | Extended Hours Card ── */}
        <div className={s.heroMainRow}>
          <div className={s.heroPriceBlock}>
            <span className={`${s.p2Price} ${flash ? s[`flash-${flash}`] : ''}`}>
              ${displayPrice.toFixed(2)}
            </span>
            <span className={`${s.p2Chg} ${up ? s.pos : s.neg}`}>
              {up ? '▲' : '▼'} {up ? '+' : ''}{displayChangePct.toFixed(2)}%
            </span>
          </div>
          {hasExt && (
            <div className={extCardClassName}>
              <SparklineBg up={activeExtPct >= 0} seed={`${data.ticker}-ext`} />
              <span className={s.heroExtLabel}>{activeExtLabel}</span>
              <span className={s.heroExtPrice}>${activeExtPrice.toFixed(2)}</span>
              {/* ★ 기준선이 없으면 등락률은 «계산 불가»다. 0.00% 라고 쓰면 거짓말이다. */}
              <span className={s.heroExtChange} style={{ color: !activeExtPctKnown ? 'var(--text-muted)' : activeExtPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {!activeExtPctKnown ? '—' : `${activeExtPct >= 0 ? '+' : ''}${activeExtPct.toFixed(2)}%`}
              </span>
            </div>
          )}
        </div>

        {/* ── 8-K disclosure badge: renders ONLY when a high-impact filing exists
               within 7 days (empty-space insert — no layout impact otherwise) ── */}
        <DisclosureBadge ticker={data.ticker} locale={locale} variant="badge" />

        {/* ══════════════════════════════════════════════════════════════
            DARK POOL — 우리 브랜드의 대표 지표.
            ⚠️ 여기(무료 영역)에 둔다. QUANT 탭은 보상형 광고 게이트 뒤라
               FINRA 약관 §2.3(b)「이 데이터에 별도 요금 금지」와 부딪힌다.
               브랜드 지표를 잠가 둘 이유도 없다.
            숫자 하나가 아니라 «시장 평균 대비 · 평소 물량 대비 · 그 물량이
            매집인가 헤지인가»까지 말한다. 값이 없으면 통째로 안 그린다.
            ══════════════════════════════════════════════════════════════ */}
        {(() => {
          const f = data.rawTickerData?.flow;
          const pct = typeof f?.darkPoolPct === 'number' && f.darkPoolPct > 0 ? f.darkPoolPct : null;
          if (pct == null) return null;
          const mkt = typeof f.darkPoolMarketAvg === 'number' ? f.darkPoolMarketAvg : null;
          const vr = typeof f.darkPoolVolRatio === 'number' ? f.darkPoolVolRatio : null;
          const sp = typeof f.darkPoolShortPct === 'number' ? f.darkPoolShortPct : null;
          const shAvg = typeof f.darkPoolShortAvg === 'number' ? f.darkPoolShortAvg : null;
          const dev = typeof f.darkPoolShortDev === 'number' ? f.darkPoolShortDev : null;
          // 배지도 판독과 «같은» 레짐을 쓴다 — 안 그러면 배지는 NEUTRAL 인데
          // 문장은 「분산」이라고 말한다(SLB 실화면에서 실제로 그랬다).
          const reg = effectiveRegime({
            pct, volRatio: vr, shortPct: sp, shortAvg: shAvg, shortDev: dev,
            regime: (f.darkPoolRegime ?? null) as 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null,
          });
          const gap = mkt != null ? pct - mkt : null;
          const hot = reg === 'ACCUMULATION', cold = reg === 'DISTRIBUTION';
          // ⚠️ CSS 변수에 16진 알파를 «이어 붙일 수 없다». `var(--red)33` 은
          //    유효하지 않은 CSS 라 선언이 통째로 무시된다 — 그래서 카드 테두리·
          //    배경·토글 알약이 전부 «투명»했다(실화면 computedStyle 로 확인).
          //    투명도를 쓰려면 rgb 3원색을 들고 있어야 한다.
          const accentRgb = hot ? '52,211,153' : cold ? '239,68,68' : '167,139,250';
          const accent = `rgb(${accentRgb})`;
          const a = (o: number) => `rgba(${accentRgb},${o})`;
          const tag = reg == null ? null
            : hot ? (locale === 'ko' ? '은밀 매집' : locale === 'ja' ? '静かな買い集め' : 'ACCUMULATION')
            : cold ? (locale === 'ko' ? '은밀 분산' : locale === 'ja' ? '静かな売り抜け' : 'DISTRIBUTION')
            : (locale === 'ko' ? '중립' : locale === 'ja' ? '中立' : 'NEUTRAL');
          const read = readDarkPool(
            { pct, marketAvg: mkt, volRatio: vr, shortPct: sp, shortAvg: shAvg, shortDev: dev, regime: reg, date: f.darkPoolDate,
              // 주가 방향과 엮어야 「내리는 걸 사고 있다」가 나온다 — 차별점은 여기다.
              // ⚠️ data.changePct 는 **절댓값**으로 저장된다(표시용). 부호는 data.up 에 있다.
              //    그대로 넘기면 하락장이 상승으로 읽혀 해석이 정반대가 된다.
              changePct: typeof data.changePct === 'number'
                ? (data.up ? data.changePct : -data.changePct) : null },
            (locale === 'ko' || locale === 'ja' ? locale : 'en') as 'ko' | 'en' | 'ja',
          );
          return (
            <div style={{
              // ⚠️ 히어로 배경 스파크라인 <svg> 가 절대배치로 이 위를 덮어
              //    ⓘ 버튼 클릭이 svg 로 먹혔다(실기기에서 대표가 발견).
              //    쌓임 맥락을 만들어 카드를 배경 위로 올린다.
              position: 'relative', zIndex: 2,
              margin: '0 0 var(--s3)', padding: '12px 14px', borderRadius: 14,
              border: `1px solid ${a(.28)}`, background: `linear-gradient(135deg, ${a(.10)}, rgba(255,255,255,.015))`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: 'var(--text-dim, #94a3b8)' }}>
                  {locale === 'ko' ? '다크풀' : locale === 'ja' ? 'ダークプール' : 'DARK POOL'}
                  <MetricInfo term="darkPool" locale={locale} size={12} />
                </span>
                {tag && (
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: accent, background: a(.14), border: `1px solid ${a(.35)}`, borderRadius: 999, padding: '3px 9px' }}>{tag}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                {/* 대표 지적: 숫자가 너무 컸다 — 값보다 «해석»이 주인공이다 */}
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', color: accent, lineHeight: 1 }}>{pct.toFixed(1)}%</span>
                {gap != null && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim, #94a3b8)' }}>
                    {locale === 'ko' ? '시장 평균 ' : locale === 'ja' ? '市場平均 ' : 'mkt avg '}{mkt!.toFixed(0)}%
                    <span style={{ color: gap >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>
                      {gap >= 0 ? '+' : ''}{gap.toFixed(1)}%p
                    </span>
                  </span>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-dim, #94a3b8)', lineHeight: 1.5 }}>
                {vr != null && <>{locale === 'ko' ? '물량 ' : locale === 'ja' ? '出来高 ' : 'volume '}
                  <b style={{ color: 'var(--cyan, #22d3ee)' }}>{vr.toFixed(1)}×</b>
                  {locale === 'ko' ? ' (평소 대비)' : locale === 'ja' ? '（平常比）' : ' vs its norm'}</>}
                {vr != null && sp != null && ' · '}
                {/* ⚠️ 공매도 «비중»은 단독으로 방향이 아니다 — 시장 중앙값이 49.4%.
                       도매업자가 소매 매수를 받을 때 일단 공매도로 팔기 때문이다.
                       그래서 반드시 «평소»를 붙여서 보여 준다. */}
                {sp != null && <>{locale === 'ko' ? '그중 공매도 ' : locale === 'ja' ? 'うち空売り ' : 'short '}
                  <b style={{ color: dev != null && Math.abs(dev) >= 4 ? (dev > 0 ? 'var(--red)' : 'var(--green)') : 'var(--text, #e2e8f0)' }}>{sp.toFixed(0)}%</b>
                  {shAvg != null && <span style={{ opacity: .7 }}>
                    {locale === 'ko' ? ` (평소 ${shAvg.toFixed(0)}%` : locale === 'ja' ? `（平常${shAvg.toFixed(0)}%` : ` (norm ${shAvg.toFixed(0)}%`}
                    {dev != null && Math.abs(dev) >= 4 && <b style={{ color: dev > 0 ? 'var(--red)' : 'var(--green)' }}>{` ${dev > 0 ? '+' : ''}${dev.toFixed(0)}%p`}</b>}
                    {locale === 'ja' ? '）' : ')'}
                  </span>}
                </>}
              </div>

              {/* ── 해석 — 기본은 접혀 있다. 화면을 적게 쓰고, 원할 때 연다 ── */}
              <button
                type="button"
                onClick={() => setDpOpen(v => !v)}
                style={{
                  appearance: 'none', WebkitAppearance: 'none', width: '100%', marginTop: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 0 0', background: 'transparent', border: 'none',
                  borderTop: `1px solid ${a(.18)}`, cursor: 'pointer', textAlign: 'left',
                }}
                aria-expanded={dpOpen}
              >
                <span style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.4, color: accent, flex: 1, minWidth: 0,
                  ...(dpOpen ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }) }}>
                  {read.headline}
                </span>
                {/*
                  대표 지적: 「▾ 만으로는 열린다는 걸 알 수 없다」.
                  글자가 붙은 알약 모양이라야 «누르면 열린다»가 읽힌다.
                  최소 터치 타깃(높이 22px)도 확보한다.
                */}
                <span style={{
                  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 3,
                  height: 22, padding: '0 8px', borderRadius: 999,
                  border: `1px solid ${a(.45)}`, background: a(.16),
                  fontSize: 10, fontWeight: 900, letterSpacing: '.02em', color: accent, whiteSpace: 'nowrap',
                }}>
                  {dpOpen
                    ? (locale === 'ko' ? '접기' : locale === 'ja' ? '閉じる' : 'Less')
                    : (locale === 'ko' ? '해석' : locale === 'ja' ? '解説' : 'Why')}
                  <span style={{ fontSize: 9, lineHeight: 1, transform: dpOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
                </span>
              </button>
              {dpOpen && (
                <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.55, color: 'var(--text-dim, #94a3b8)' }}>
                  {read.detail}
                  <span style={{ display: 'block', marginTop: 6, fontSize: 9.5, color: 'var(--text-dimmer, #64748b)' }}>
                    {locale === 'ko' ? '출처 FINRA · 전일 마감 기준 ' : locale === 'ja' ? '出典 FINRA · 前日終値基準 ' : 'Source: FINRA · prior close '}
                    {f.darkPoolDate ?? ''}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Row 3: Option Metrics — MAX PAIN / GAMMA FLIP / TOTAL PREMIUM ── */}
        <div className={s.heroMetrics}>
          <div className={s.heroMetricCard}>
            <span className={s.heroMetricLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>MAX PAIN<MetricInfo term="maxPain" locale={locale} size={12} /></span>
            <span className={s.heroMetricValue}>
              ${data.premium.maxPain > 0 ? data.premium.maxPain.toFixed(0) : '—'}
            </span>
            {data.premium.maxPain > 0 && (() => {
              const mpDiff = ((displayPrice - data.premium.maxPain) / data.premium.maxPain) * 100;
              return (
                <span className={s.heroMetricSub} style={{ color: Math.abs(mpDiff) <= 1.5 ? 'var(--amber)' : mpDiff > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {mpDiff >= 0 ? '+' : ''}{mpDiff.toFixed(2)}% {locale === 'ko' ? '괴리' : locale === 'ja' ? '乖離' : 'gap'}
                </span>
              );
            })()}
          </div>
          <div className={s.heroMetricCard}>
            <span className={s.heroMetricLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>GAMMA FLIP<MetricInfo term="gammaFlip" locale={locale} size={12} /></span>
            <span className={s.heroMetricValue}>{data.premium.gammaFlip}</span>
            {data.premium.gammaFlipRaw > 0 && (() => {
              const gfDiff = ((displayPrice - data.premium.gammaFlipRaw) / data.premium.gammaFlipRaw) * 100;
              return (
                <span className={s.heroMetricSub} style={{ color: gfDiff >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {gfDiff >= 0
                    ? (locale === 'ko' ? '상회' : locale === 'ja' ? '上回る' : 'above')
                    : (locale === 'ko' ? '하회' : locale === 'ja' ? '下回る' : 'below')
                  } ({gfDiff >= 0 ? '+' : ''}{gfDiff.toFixed(2)}%)
                </span>
              );
            })()}
          </div>
          <div className={s.heroMetricCard}>
            <span className={s.heroMetricLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>TOTAL PREMIUM<MetricInfo term="netPremium" locale={locale} size={12} /></span>
            <span className={s.heroMetricValue}>
              {data.premium.netPremium !== 0
                ? (Math.abs(data.premium.netPremium) >= 1e6
                  ? `$${(data.premium.netPremium / 1e6).toFixed(1)}M`
                  : `$${(data.premium.netPremium / 1e3).toFixed(0)}K`)
                : '—'}
            </span>
            <span className={s.heroMetricSub} style={{ color: data.premium.netPremium >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {data.premium.netPremium >= 0
                ? (locale === 'ko' ? '콜 우세' : locale === 'ja' ? 'コール優勢' : 'Call dominant')
                : (locale === 'ko' ? '풋 우세' : locale === 'ja' ? 'プット優勢' : 'Put dominant')
              }
            </span>
          </div>
        </div>

        {/* ── Row 4: Vitals Strip (RSI / VWAP / DAY RANGE) ── */}
        <div className={s.p2Vitals}>
          <div className={s.p2Vital}>
            <div className={s.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>RSI 14<MetricInfo term="rsi" locale={locale} size={10} /></div>
            {/* ★ [2026-09-04] RSI 0 은 존재할 수 없는 값이다(이론상 하한이 0 이지만
                실제로는 절대 안 나온다). 벤더가 비어서 0 이 온 것을 «0.0 Cool» 이라고
                그리고 있었다 — 없는 것은 «—» 로 보여야 한다. 틀린 숫자보다 빈 칸이 낫다. */}
            <div className={s.v}>{data.rsi14 > 0 ? data.rsi14.toFixed(1) : '—'}</div>
            {data.rsi14 > 0 && (() => {
              const rsiColor = data.rsi14 >= 70 ? 'var(--red)' : data.rsi14 >= 55 ? 'var(--amber)' : data.rsi14 <= 35 ? 'var(--cyan)' : 'var(--green)';
              const rsiLabel = data.rsi14 >= 70 ? 'Hot' : data.rsi14 >= 55 ? 'Warm' : data.rsi14 <= 35 ? 'Cool' : 'Stable';
              return (
                <>
                  <div className={s.vitalSub} style={{ color: rsiColor }}>{rsiLabel}</div>
                  <div className={s.bar}><i style={{ width: `${data.rsi14}%`, background: rsiColor }} /></div>
                </>
              );
            })()}
          </div>
          <div className={s.p2Vital}>
            <div className={s.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>VWAP<MetricInfo term="vwap" locale={locale} size={10} /></div>
            <div className={s.v}>{data.vwap > 0 ? `$${data.vwap.toFixed(2)}` : '—'}</div>
            {data.vwap > 0 && (() => {
              const vwapDiff = ((displayPrice - data.vwap) / data.vwap) * 100;
              const vwapColor = vwapDiff >= 0 ? 'var(--green)' : 'var(--red)';
              return (
                <>
                  <div className={s.vitalSub} style={{ color: vwapColor }}>
                    {vwapDiff >= 0
                      ? (locale === 'ko' ? '상회' : locale === 'ja' ? '上回る' : 'above')
                      : (locale === 'ko' ? '하회' : locale === 'ja' ? '下回る' : 'below')} {vwapDiff >= 0 ? '+' : ''}{vwapDiff.toFixed(2)}%
                  </div>
                  <div className={s.bar}><i style={{ width: `${Math.min(100, Math.max(6, 50 + vwapDiff * 8))}%`, background: vwapColor }} /></div>
                </>
              );
            })()}
          </div>
          <div className={s.p2Vital}>
            {/* ⚠️ 프리마켓엔 «오늘» 거래가 아직 없다. 그런데 여기 표시되는 고저는
                전일(마지막 정규장) 범위다. 「DAY RANGE」라고 쓰면 오늘 것처럼 읽힌다.
                수치가 맞아도 라벨이 틀리면 틀린 화면이다. (2026-08-31 대표 지적) */}
            <div className={s.k}>{effectiveSession === 'PRE'
              ? (locale === 'ko' ? '전일 범위' : locale === 'ja' ? '前日レンジ' : 'PREV RANGE')
              : 'DAY RANGE'}</div>
            {!(data.high > 0 && data.low > 0) ? (
              <div className={s.v} style={{ marginTop: 4 }}>—</div>
            ) : (() => {
              const rangePct = Math.max(0, Math.min(100, ((displayPrice - data.low) / (data.high - data.low || 1)) * 100));
              const rangeColor = rangePct >= 70 ? 'var(--green)' : rangePct <= 30 ? 'var(--red)' : 'var(--cyan)';
              return (
                <div className={s.dayRangeMetric}>
                  <div className={s.rangeRail}>
                    <i style={{ width: `${rangePct}%`, background: `linear-gradient(90deg, rgba(239,68,68,0.65), ${rangeColor})` }} />
                    <span className={s.rangePin} style={{ left: `${rangePct}%`, borderColor: rangeColor, boxShadow: `0 0 12px ${rangeColor}` }} />
                  </div>
                  <div className={s.rangeBottom}>
                    <span>LOW <strong>${data.low.toFixed(1)}</strong></span>
                    <span>HIGH <strong>${data.high.toFixed(1)}</strong></span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── 변동성 요약 (6개 카드 아래) ──────────────────────────
            처음엔 옵션 카드와 바이탈 사이에 끼워 넣었는데, 카드 6개의
            흐름을 끊고 DAY RANGE 라벨에 넣은 ATR 배지가 그리드 폭까지
            밀어 버렸다(대표 지적). 두 값 다 «변동성»을 말하므로
            묶어서 **맨 아래 한 줄**로 내린다. 카드 폭은 원래대로 복원.

            프리미엄 = 옵션이 비싼가 싼가 (기대 vs 실제)
            오늘 폭   = 오늘 움직임이 평소 대비 큰가 (실제 vs 평소) */}
        {(() => {
          const vp = techSignal.volPremium;
          const atrPct = techSignal.atrPct;
          const todayPct = displayPrice > 0 && data.high > data.low ? ((data.high - data.low) / displayPrice) * 100 : 0;
          const ratio = atrPct && todayPct > 0 ? todayPct / atrPct : null;
          const hasPrem = !!(vp && vp.spread != null && vp.ivPct != null && vp.rvPct != null);
          if (!hasPrem && ratio == null) return null;

          const rich = vp?.label === 'RICH', cheap = vp?.label === 'CHEAP';
          const pc = rich ? '#fbbf24' : cheap ? '#22d3ee' : 'rgba(148,163,184,.9)';
          const premVerdict = rich ? (locale === 'ko' ? '옵션 비쌈' : locale === 'ja' ? 'オプション割高' : 'Options rich')
            : cheap ? (locale === 'ko' ? '옵션 쌈' : locale === 'ja' ? 'オプション割安' : 'Options cheap')
              : (locale === 'ko' ? '적정 범위' : locale === 'ja' ? '適正圏' : 'Fair');
          const hint = rich ? (locale === 'ko' ? '기대가 실제보다 앞서 있음' : locale === 'ja' ? '期待が実際を上回る' : 'Expectation ahead of reality')
            : cheap ? (locale === 'ko' ? '실제 움직임이 더 큼' : locale === 'ja' ? '実際の動きの方が大きい' : 'Actual moves exceed pricing')
              : (locale === 'ko' ? '기대와 실제가 비슷함' : locale === 'ja' ? '期待と実際が近い' : 'Expectation matches reality');

          const wide = ratio != null && ratio >= 1.5, calm = ratio != null && ratio <= 0.6;
          const rc = wide ? '#fbbf24' : calm ? '#22d3ee' : 'rgba(148,163,184,.9)';
          const rangeVerdict = wide ? (locale === 'ko' ? '평소보다 큼' : locale === 'ja' ? '普段より大' : 'Wider')
            : calm ? (locale === 'ko' ? '평소보다 작음' : locale === 'ja' ? '普段より小' : 'Narrower')
              : (locale === 'ko' ? '평소 수준' : locale === 'ja' ? '通常水準' : 'Typical');

          const chip = (c: string) => ({
            fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
            color: c, border: `1px solid ${c}40`, background: `${c}14`, whiteSpace: 'nowrap' as const, lineHeight: 1.15,
          });
          const emph = rich || cheap || wide;
          return (
            <div style={{
              marginTop: 8, padding: '9px 12px', borderRadius: 9,
              border: `1px solid ${emph ? (rich || wide ? '#fbbf2455' : '#22d3ee55') : 'rgba(255,255,255,0.09)'}`,
              background: 'rgba(30, 41, 59, 0.35)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              boxShadow: emph
                ? `0 0 14px ${rich || wide ? 'rgba(251,191,36,.14)' : 'rgba(34,211,238,.14)'}, inset 0 1px 0 rgba(255,255,255,0.05)`
                : '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '700 11px/1 var(--f-sans)', letterSpacing: '.12em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {locale === 'ko' ? '변동성' : locale === 'ja' ? 'ボラティリティ' : 'VOLATILITY'}
                  <MetricInfo term="volPremium" locale={locale} size={11} />
                </span>
                {hasPrem && (
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                    <span style={{ font: '700 14px/1 var(--f-mono)', fontVariantNumeric: 'tabular-nums', color: pc }}>
                      {vp!.spread! > 0 ? '+' : ''}{vp!.spread!.toFixed(1)}<span style={{ fontSize: 9, opacity: .7 }}>%p</span>
                    </span>
                    <span style={chip(pc)}>{premVerdict}</span>
                  </span>
                )}
                {hasPrem && ratio != null && <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,.12)' }} />}
                {ratio != null && (
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                    <span style={{ font: '700 14px/1 var(--f-mono)', fontVariantNumeric: 'tabular-nums', color: rc }}>{ratio.toFixed(1)}×</span>
                    <span style={chip(rc)}>{rangeVerdict}</span>
                  </span>
                )}
              </div>
              <div style={{ font: '600 10.5px/1.35 var(--f-sans)', color: 'rgba(148,163,184,.8)', minWidth: 0 }}>
                {hasPrem && <>IV {vp!.ivPct!.toFixed(0)} · {locale === 'ko' ? '실현' : locale === 'ja' ? '実現' : 'RV'} {vp!.rvPct!.toFixed(0)} · {hint}</>}
                {hasPrem && ratio != null && ' · '}
                {ratio != null && <>{locale === 'ko' ? '오늘 폭' : locale === 'ja' ? '本日値幅' : 'Today'} {todayPct.toFixed(1)}% (ATR {atrPct!.toFixed(1)}%)</>}
              </div>
            </div>
          );
        })()}
      </div>

      <div 
        className={`${s.seg} ${s.seg4} ${s.connectedSeg}`}
        style={{
          marginTop: '0px',
          marginBottom: '0px',
          borderRadius: '0px',
          borderTop: '1px solid rgba(255, 255, 255, 0.055)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.055)',
          marginLeft: 'var(--s4)',
          marginRight: 'var(--s4)'
        }}
      >
        <span className={s.segPill} style={{ left: `calc(3px + ${['overview', 'verdict', 'quant', 'holders'].indexOf(activeTab)} * (100% - 6px) / 4)` }}></span>
        <button 
          className={activeTab === 'overview' ? s.on : ''}
          onClick={() => setActiveTab('overview')}
        >
          OVERVIEW
        </button>
        <button 
          className={activeTab === 'verdict' ? s.on : ''}
          onClick={() => setActiveTab('verdict')}
        >
          <span style={{
            background: 'linear-gradient(90deg, #a855f7, #ec4899, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 900,
            opacity: activeTab === 'verdict' ? 1 : 0.65
          }}>
            AI ✱
          </span>
        </button>
        <button 
          className={activeTab === 'quant' ? s.on : ''}
          onClick={() => setActiveTab('quant')}
        >
          QUANT ✱
        </button>
        <button 
          className={activeTab === 'holders' ? s.on : ''}
          onClick={() => setActiveTab('holders')}
        >
          HOLDERS ✱
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      <SwipeableTabs
        onSwipeLeft={() => { const TABS = ['overview', 'verdict', 'quant', 'holders'] as const; const i = TABS.indexOf(activeTab); if (i < TABS.length - 1) setActiveTab(TABS[i + 1] as typeof activeTab); }}
        onSwipeRight={() => { const TABS = ['overview', 'verdict', 'quant', 'holders'] as const; const i = TABS.indexOf(activeTab); if (i > 0) setActiveTab(TABS[i - 1] as typeof activeTab); }}
      >
      {activeTab === 'overview' && (
        <div className={`${s.animateIn} ${s.delay2}`}>
          <div 
            className={`${s.card} ${s.connectedChartCard}`}
            style={{
              marginTop: '0px',
              borderTop: 'none',
              borderTopLeftRadius: '0px',
              borderTopRightRadius: '0px'
            }}
          >
            <CandleChart
              ticker={data.ticker}
              price={
                (effectiveSession === 'POST' || effectiveSession === 'PRE' || effectiveSession === 'CLOSED') && activeExtPrice > 0
                  ? activeExtPrice
                  : displayPrice
              }
              changePct={
                (effectiveSession === 'POST' || effectiveSession === 'PRE' || effectiveSession === 'CLOSED') && activeExtPrice > 0
                  ? activeExtPct
                  : displayChangePct
              }
              vwap={data.vwap}
              locale={locale}
            />
          </div>

          {/* 5-Day daily-change tape — recent momentum between chart & forward view */}
          <App5DayTape ticker={data.ticker} locale={locale} />

          <AnalystConsensus analyst={data.analyst} price={displayPrice} locale={locale} />
          <FundamentalsCard raw={data.fundRaw || null} locale={locale} />
          <EarningsCardPremium raw={data.earnRaw || null} locale={locale} />

          {/* Company Description */}
          {companyDescription && (
            <div className={`${s.premiumCard} ${s.animateIn} ${s.delay6}`}>
              <div className={s.premiumHeader}>
                <div className={s.premiumTitle}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
                    <path d="M7 22V14h10v8" />
                    <path d="M9 8h2" />
                    <path d="M13 8h2" />
                    <path d="M9 12h2" />
                    <path d="M13 12h2" />
                  </svg>
                  {locale === 'ko' ? '기업 개요' : locale === 'ja' ? '企業概要' : 'Company Overview'}
                </div>
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>{companyDescription}</p>
            </div>
          )}

          {/* Related Peers Live */}
          {relatedPeers.length > 0 && (
            <RelatedPeersLive tickers={relatedPeers.slice(0, 4)} currentPrice={displayPrice} locale={locale} />
          )}
        </div>
      )}

      {activeTab === 'verdict' && (
        <ValueWall
          locale={locale}
          title={locale === 'ko' ? 'AI 분석 잠금' : locale === 'ja' ? 'AI分析ロック' : 'AI Analysis Locked'}
          subtitle={locale === 'ko' ? '30초 광고를 시청하고 1시간 프리미엄 분석을 이용하세요' : locale === 'ja' ? '30秒の動画を視聴して1時間プレミアム分析をご利用ください' : 'Watch a 30-second video to unlock premium analysis for 1 hour'}
          socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kがロック解除' : '14.2K unlocked today'}
        >
        <div className={`${s.animateIn} ${s.delay2}`}>
          {/* AI Manual Refresh */}
          {verdictHeader && !aiLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                onClick={handleAiRefresh}
                disabled={aiRefreshCooldown}
                style={{
                  background: aiRefreshCooldown ? 'rgba(255,255,255,0.03)' : 'rgba(34,211,238,0.08)',
                  border: `1px solid ${aiRefreshCooldown ? 'rgba(255,255,255,0.06)' : 'rgba(34,211,238,0.2)'}`,
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: aiRefreshCooldown ? '#64748b' : '#22d3ee',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: aiRefreshCooldown ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  minHeight: 0,
                }}
              >
                ↻ {aiRefreshCooldown
                    ? (locale === 'ko' ? '쿨다운 중' : locale === 'ja' ? 'クールダウン中' : 'Cooldown')
                    : (locale === 'ko' ? '분석 갱신' : locale === 'ja' ? '分析更新' : 'Refresh')}
              </button>
            </div>
          )}
          {aiLoading && !verdictHeader && (
            <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-8 flex flex-col items-center gap-3 text-center">
              <div className="relative w-9 h-9 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
                <img src="/signum-sg-vectorized.svg" alt="" width={16} height={16} className="animate-pulse" />
              </div>
              <span className="text-[12px] text-cyan-400 font-bold tracking-wider">
                {locale === 'ko' ? 'AI 심층 분석 및 최신 퀀트 판정 생성 중...' : locale === 'ja' ? 'AI深層分析および最新クオンツ判定を生成中...' : 'Generating AI deep analysis...'}
              </span>
            </div>
          )}

          {verdictHeader ? (
            <div className="rounded-b-2xl border-x border-b border-amber-500/25 overflow-hidden relative"
              style={{ 
                background: 'linear-gradient(180deg, rgba(8,12,21,0.96), rgba(13,17,25,0.98))', 
                boxShadow: '0 0 24px rgba(245,158,11,0.08)',
                marginTop: '0px',
                borderTop: 'none',
                borderTopLeftRadius: '0px',
                borderTopRightRadius: '0px'
              }}>
              
              {/* AI Engine Header */}
              <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center gap-2"
                style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.06), transparent)' }}>
                <img src="/signum-sg-vectorized.svg" alt="AI" width={15} height={15}
                  style={{ filter: 'drop-shadow(0 0 4px rgba(245,158,11,0.4))' }} />
                <span className="text-[11px] font-black text-white uppercase tracking-[0.15em]">AI Deep Analysis</span>
                <span className="text-[9px] bg-cyan-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-mono">CLAUDE S4</span>
              </div>

              {/* Verdict Indicator */}
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-r" style={{ background: verdictColor }} />
                <div className="px-4 py-4" style={{ background: `linear-gradient(90deg, ${verdictColor}0c, transparent)` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: verdictColor }}>{verdictLabel}</span>
                    {verdictDesc && (
                      <>
                        <span className="text-[11px] text-slate-500">—</span>
                        <span className="text-[11px] text-slate-300 font-bold font-sans">{verdictDesc}</span>
                      </>
                    )}
                  </div>
                  {tl(verdictHeader.keyInsight, locale) && (
                    <div className="mt-2.5 px-3 py-2.5 rounded-xl border border-cyan-500/15" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(99,102,241,0.04))' }}>
                      <p className="text-[12.5px] text-slate-300 leading-relaxed font-sans">{tl(verdictHeader.keyInsight, locale)}</p>
                    </div>
                  )}
                  {/* Risk + Confidence meters */}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">RISK</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-black
                        ${verdictHeader.riskFlag === 'HIGH' ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' :
                          verdictHeader.riskFlag === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                            'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'}`}>
                        {verdictHeader.riskFlag || 'LOW'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">CONFIDENCE</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3].map(d => {
                          const confLevel = verdictHeader.confidence === 'HIGH' ? 3 : verdictHeader.confidence === 'MEDIUM' ? 2 : 1;
                          const isActive = d <= confLevel;
                          return (
                            <div 
                              key={d} 
                              className={`w-2 h-2 rounded-full transition-all duration-300 ${isActive ? 'bg-cyan-400' : 'bg-slate-700'}`} 
                              style={{ boxShadow: isActive ? '0 0 6px var(--cyan)' : 'none' }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accordion Detail Sections */}
              {verdictHeader.sections?.map((sec: any, i: number) => {
                const isOpen = openSections.has(i);
                return (
                  <div key={i} className="border-t border-white/[0.04] bg-slate-900/10">
                    <button onClick={() => toggleSection(i)} className="w-full flex items-center justify-between px-4 py-3 active:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-2.5">
                        {sectionIcon(tl(sec.title, locale))}
                        <span className="text-[11.5px] font-bold text-slate-300 uppercase tracking-wider font-sans">{tl(sec.title, locale)}</span>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: isOpen ? '400px' : '0px', opacity: isOpen ? 1 : 0 }}>
                      <div className="px-4 pb-4">
                        <p className="text-[12.5px] text-slate-300 leading-relaxed font-sans">{tl(sec.content, locale)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            !aiLoading && (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-6 flex flex-col items-center gap-2 text-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-500 animate-pulse">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M6.34 17.66l2.83-2.83M14.83 9.17l2.83-2.83" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <span className="text-[12px] text-slate-400">Loading AI Analytical Verdict...</span>
              </div>
            )
          )}
        </div>
        </ValueWall>
      )}

      {activeTab === 'quant' && (
        <ValueWall
          locale={locale}
          title={locale === 'ko' ? '퀀트 시그널 잠금' : locale === 'ja' ? 'クオンツシグナルロック' : 'Quant Signals Locked'}
          subtitle={locale === 'ko' ? '30초 광고를 시청하고 1시간 프리미엄 분석을 이용하세요' : locale === 'ja' ? '30秒の動画を視聴して1時間プレミアム分析をご利用ください' : 'Watch a 30-second video to unlock premium analysis for 1 hour'}
          socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kがロック解除' : '14.2K unlocked today'}
        >
        <div className={`${s.animateIn} ${s.delay2}`} style={{ marginTop: '16px' }}>
          {/* 9-Signal Dashboard */}
          {signalsData && (
            <div className="mb-5">
              <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 px-0.5">
                {locale === 'ko' ? '시그널 대시보드' : locale === 'ja' ? 'シグナルダッシュボード' : 'Signal Dashboard'}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {/*
                  [0] DARK POOL — 우리 브랜드의 대표 지표. 2026-08-31 FINRA
                  규제 원본으로 복원됐다. 숫자 하나가 아니라 «시장 평균 대비 ·
                  평소 물량 대비 · 그 물량이 매집인가 헤지인가»까지 말한다.
                  ⚠️ 라이선스상 출처(FINRA) 표기 필수 · 별도 과금 금지(무료 노출)
                  값이 없으면 **카드를 아예 안 그린다** — 0% 는 거짓말이다.
                */}
                {signalsData.dp && (() => {
                  const d = signalsData.dp;
                  const hot = d.regime === 'ACCUMULATION';
                  const cold = d.regime === 'DISTRIBUTION';
                  const badge = d.regime == null ? undefined
                    : hot ? (locale === 'ko' ? '은밀 매집' : locale === 'ja' ? '静かな買い集め' : 'ACCUMULATION')
                    : cold ? (locale === 'ko' ? '은밀 분산' : locale === 'ja' ? '静かな売り抜け' : 'DISTRIBUTION')
                    : (locale === 'ko' ? '중립' : locale === 'ja' ? '中立' : 'NEUTRAL');
                  const gap = d.marketAvg != null ? d.pct - d.marketAvg : null;
                  return (
                    <SignalCard
                      label={locale === 'ko' ? '다크풀' : locale === 'ja' ? 'ダークプール' : 'DARK POOL'}
                      iconKey="DARK POOL"
                      infoTerm="darkPool"
                      value={`${d.pct.toFixed(1)}%`}
                      badge={badge}
                      badgeColor={hot ? 'bg-emerald-500/25 text-emerald-400' : cold ? 'bg-rose-500/25 text-rose-400' : 'bg-slate-500/25 text-slate-300'}
                      color={hot ? 'text-emerald-400' : cold ? 'text-rose-400' : 'text-violet-300'}
                      bg={hot ? 'bg-emerald-950/20' : cold ? 'bg-rose-950/20' : 'bg-violet-950/20'}
                      border={hot ? 'border-emerald-500/20' : cold ? 'border-rose-500/20' : 'border-violet-500/20'}
                      sub={<>
                        {gap != null && (
                          <>{locale === 'ko' ? '시장 평균 ' : locale === 'ja' ? '市場平均 ' : 'mkt avg '}
                          <span className="text-slate-300 font-bold">{d.marketAvg!.toFixed(0)}%</span>
                          {' '}<span className={gap >= 0 ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold'}>
                            {gap >= 0 ? '+' : ''}{gap.toFixed(1)}%p
                          </span></>
                        )}
                        {d.volRatio != null && <> · {locale === 'ko' ? '물량 ' : locale === 'ja' ? '出来高 ' : 'vol '}
                          <span className="text-cyan-400 font-extrabold">{d.volRatio.toFixed(1)}×</span></>}
                        {d.shortPct != null && <> · {locale === 'ko' ? '공매도 ' : locale === 'ja' ? '空売り ' : 'short '}
                          <span className="text-slate-300 font-bold">{d.shortPct.toFixed(0)}%</span></>}
                        <span className="block mt-0.5 text-[9px] text-slate-500">
                          FINRA · {d.date ?? ''}
                        </span>
                      </>}
                      locale={locale}
                    />
                  );
                })()}

                {/* [1] VOL REGIME */}
                <SignalCard 
                  label={locale === 'ko' ? '변동성 레짐' : locale === 'ja' ? 'ボラティリティ体制' : 'VOL REGIME'}
                  iconKey="VOL REGIME"
                  infoTerm="volRegime"
                  value={`${signalsData.regimeScore} /100`}
                  badge={signalsData.regime}
                  badgeColor={signalsData.regime === 'ERUPTING' ? 'bg-rose-500/25 text-rose-400' : signalsData.regime === 'LOADED' ? 'bg-amber-500/25 text-amber-400' : signalsData.regime === 'COILING' ? 'bg-cyan-500/25 text-cyan-400' : 'bg-emerald-500/25 text-emerald-400'}
                  color={signalsData.regime === 'ERUPTING' ? 'text-rose-400' : signalsData.regime === 'LOADED' ? 'text-amber-400' : signalsData.regime === 'COILING' ? 'text-cyan-400' : 'text-emerald-400'}
                  bg={signalsData.regime === 'ERUPTING' ? 'bg-rose-950/20' : signalsData.regime === 'LOADED' ? 'bg-amber-950/20' : 'bg-slate-900/40'}
                  border={signalsData.regime === 'ERUPTING' ? 'border-rose-500/20' : signalsData.regime === 'LOADED' ? 'border-amber-500/20' : 'border-white/[0.06]'}
                  sub={<>{locale === 'ko' ? '상태: ' : locale === 'ja' ? '状態: ' : ''}{tDashboard(signalsData.regime === 'ERUPTING' ? 'volErupting' : signalsData.regime === 'LOADED' ? 'volLoaded' : signalsData.regime === 'COILING' ? 'volCoiling' : 'volStable')} · IV <span className="text-cyan-400 font-extrabold">{signalsData.iv}%</span></>} 
                  locale={locale}
                />

                {/* [2] CONVICTION */}
                <SignalCard 
                  label={locale === 'ko' ? '확신도' : locale === 'ja' ? 'コンビクション' : 'CONVICTION'}
                  iconKey="CONVICTION"
                  infoTerm="conviction"
                  value={`${signalsData.convictionScore} /100`}
                  badge={signalsData.convictionGrade}
                  badgeColor={signalsData.convictionScore >= 60 ? 'bg-emerald-500/25 text-emerald-400' : signalsData.convictionScore <= 40 ? 'bg-rose-500/25 text-rose-400' : 'bg-slate-500/25 text-slate-300'}
                  color={signalsData.convictionScore >= 60 ? 'text-emerald-400' : signalsData.convictionScore <= 40 ? 'text-rose-400' : 'text-white'}
                  bg={signalsData.convictionScore >= 60 ? 'bg-emerald-950/20' : signalsData.convictionScore <= 40 ? 'bg-rose-950/20' : 'bg-slate-900/40'}
                  border={signalsData.convictionScore >= 60 ? 'border-emerald-500/20' : signalsData.convictionScore <= 40 ? 'border-rose-500/20' : 'border-white/[0.06]'}
                  sub={<span className="text-slate-300 font-bold">{signalsData.convictionLabel}</span>} 
                  locale={locale}
                />

                {/* [4] VOLATILITY SQUEEZE — 구 SHORT SQUEEZE.
                    공매도 잔고(short_interest)가 현재 플랜에서 403 이라 siPercent 가
                    영구 null 이었고, 카드는 값 «-» · 배지 «LOW» · DTC «—» 로 죽어 있었다.
                    「LOW」는 «공매도 압력이 낮다»는 **사실 주장**인데 실은 측정을 안 한 것이다.
                    → 볼린저 밴드폭 압축(변동성 스퀴즈)으로 교체. 밴드폭을 자기 130일
                      분포와 비교한 백분위이므로 «지금이 역대 대비 얼마나 눌려 있나»를
                      말한다. 공매도 스퀴즈와 다른 개념이라 라벨·설명도 함께 바꿨다. */}
                {(() => {
                  const bb = techData?.bb;
                  const pct = bb?.percentile;
                  const st = pct == null ? null : pct <= 10 ? 'EXTREME' : pct <= 20 ? 'SQUEEZE' : pct >= 80 ? 'EXPANDED' : 'NORMAL';
                  const tone = st === 'EXTREME' ? { c: 'text-rose-400', b: 'bg-rose-950/20', r: 'border-rose-500/20', bd: 'bg-rose-500/25 text-rose-400' }
                    : st === 'SQUEEZE' ? { c: 'text-amber-400', b: 'bg-amber-950/20', r: 'border-amber-500/20', bd: 'bg-amber-500/25 text-amber-400' }
                    : st === 'EXPANDED' ? { c: 'text-cyan-400', b: 'bg-slate-900/40', r: 'border-white/[0.06]', bd: 'bg-cyan-500/25 text-cyan-400' }
                    : { c: 'text-slate-300', b: 'bg-slate-900/40', r: 'border-white/[0.06]', bd: 'bg-slate-700/40 text-slate-300' };
                  return (
                <SignalCard
                  label={locale === 'ko' ? '변동성 압축' : locale === 'ja' ? 'ボラティリティ圧縮' : 'VOL SQUEEZE'}
                  iconKey="SHORT SQUEEZE"
                  infoTerm="volSqueeze"
                  value={pct != null ? `${pct}%` : '—'}
                  badge={st || undefined}
                  badgeColor={tone.bd}
                  // iconKey 가 'SHORT SQUEEZE' 라 옛 공매도 문구(«공매도 위험 낮음»)가
                  // 인사이트로 나왔다. 개념이 바뀌었으니 문구도 직접 준다.
                  insightOverride={st === 'EXTREME' ? (locale === 'ko' ? '극단적 압축' : locale === 'ja' ? '極端な圧縮' : 'Extreme squeeze')
                    : st === 'SQUEEZE' ? (locale === 'ko' ? '압축 구간' : locale === 'ja' ? '圧縮局面' : 'Compressed')
                      : st === 'EXPANDED' ? (locale === 'ko' ? '변동 확대' : locale === 'ja' ? '変動拡大' : 'Expanded')
                        : st === 'NORMAL' ? (locale === 'ko' ? '보통 폭' : locale === 'ja' ? '通常幅' : 'Normal')
                          : null}
                  color={tone.c}
                  bg={tone.b}
                  border={tone.r}
                  sub={bb
                    ? <>{locale === 'ko' ? '밴드폭' : locale === 'ja' ? 'バンド幅' : 'Width'} <span className="text-cyan-400 font-extrabold">{bb.widthPct}%</span>
                        {bb.position != null ? <> · {locale === 'ko' ? '위치' : locale === 'ja' ? '位置' : 'Pos'} <span className="text-white font-bold">{bb.position}</span></> : null}</>
                    : <>{locale === 'ko' ? '측정 대기' : locale === 'ja' ? '計測待ち' : 'Loading'}</>}
                  locale={locale}
                />
                  );
                })()}

                {/* [6] INSIDER — 다크풀 자리 대체.
                    Intrinio 피드는 market_center/condition 을 주지 않아 다크풀 비중을
                    만들 수 없다(합성하면 그건 지어낸 숫자다). 익명 다크풀 대신
                    «누가·언제·얼마에» 가 전부 공시되는 SEC Form 4 내부자 거래로 바꿨다.
                    무상부여(A)·옵션행사(M)·세금원천(F)·증여(G)는 시장에서 산 게 아니므로
                    실매매(P/S)만 금액에 반영하고, 실매매가 없으면 무엇이 있었는지 밝힌다. */}
                <SignalCard
                  label={locale === 'ko' ? '내부자 거래' : locale === 'ja' ? '内部者取引' : 'INSIDER'}
                  iconKey="INST RADAR"
                  infoTerm="insiderActivity"
                  value={insiderSignal.value}
                  color={insiderSignal.color}
                  bg={insiderSignal.bg}
                  border={insiderSignal.border}
                  sub={insiderSignal.sub}
                  locale={locale}
                />

                {/* [7] TREND PHASE + 추세 강도(ADX)
                    이동평균 교차만 보면 «추세가 없는 구간의 교차»도 GOLDEN 이라고 말한다.
                    ADX 가 20 아래면 그 교차는 대부분 의미가 없다 → 신뢰도 게이트로 붙이고,
                    «교차는 났는데 추세가 없다»는 조합일 때 테두리를 강조해 경고한다. */}
                {(() => {
                  const cross = signalsData.smaCross === 'GOLDEN' ? 'GOLDEN' : signalsData.smaCross === 'DEAD' ? 'DEAD' : 'CALM';
                  const hasCross = cross !== 'CALM';
                  const unreliable = hasCross && techSignal.adxWeak;   // 교차 O · 추세 X
                  const tone = unreliable ? 'text-amber-400'
                    : cross === 'GOLDEN' ? 'text-emerald-400' : cross === 'DEAD' ? 'text-rose-400' : 'text-slate-300';
                  return (
                <SignalCard
                  label={locale === 'ko' ? '트렌드 페이즈' : locale === 'ja' ? 'トレンドフェーズ' : 'TREND PHASE'}
                  iconKey="TREND PHASE"
                  infoTerm="trendStrength"
                  value={cross}
                  color={tone}
                  emphasis={unreliable}
                  insightOverride={unreliable
                    ? (locale === 'ko' ? '신뢰도 낮음' : locale === 'ja' ? '信頼度低' : 'Low confidence')
                    : techSignal.adxBadge}
                  bg={cross === 'GOLDEN' ? 'bg-emerald-950/20' : cross === 'DEAD' ? 'bg-rose-950/20' : 'bg-slate-900/40'}
                  border={cross === 'GOLDEN' ? 'border-emerald-500/20' : cross === 'DEAD' ? 'border-rose-500/20' : 'border-white/[0.06]'}
                  sub={<>{signalsData.smaLabel || 'SMA 50/200'} · <span className={signalsData.smaDistance >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{signalsData.smaDistance >= 0 ? '+' : ''}{signalsData.smaDistance}%</span>
                    {techSignal.adx ? <> · ADX <span className={techSignal.adxWeak ? 'text-amber-400 font-bold' : 'text-cyan-400 font-bold'}>{techSignal.adx.value.toFixed(0)}</span></> : null}</>}
                  locale={locale}
                />
                  );
                })()}

                {/* [9] 자금 흐름 (OBV) — 신규.
                    다크풀이 하던 «수급» 서사를 공개 데이터로 대체한다.
                    가격과 자금이 어긋나면(다이버전스) 테두리를 강조한다. */}
                {(() => {
                  const d = techSignal.obvDir;
                  const div = techSignal.obvDivergent;
                  const tone = div ? 'text-amber-400' : d === 'up' ? 'text-emerald-400' : d === 'down' ? 'text-rose-400' : 'text-slate-300';
                  return (
                <SignalCard
                  label={locale === 'ko' ? '자금 흐름' : locale === 'ja' ? '資金フロー' : 'FLOW PULSE'}
                  iconKey="FLOW PULSE"
                  infoTerm="moneyFlow"
                  value={techSignal.obvValue}
                  color={tone}
                  emphasis={div}
                  insightOverride={techSignal.obvBadge}
                  bg="bg-slate-900/40"
                  border="border-white/[0.06]"
                  sub={<>{locale === 'ko' ? '20일 누적 거래량' : locale === 'ja' ? '20日累積出来高' : '20D cumulative volume'}</>}
                  locale={locale}
                />
                  );
                })()}

                {/* [8] FUNDAMENTAL */}
                <SignalCard 
                  label={locale === 'ko' ? '펀더멘탈' : locale === 'ja' ? 'ファンダメンタル' : 'FUNDAMENTAL'}
                  iconKey="FUNDAMENTAL"
                  infoTerm="fundamental"
                  value={signalsData.fundGrade || 'C'}
                  color={signalsData.fundGrade?.startsWith('A') ? 'text-emerald-400' : signalsData.fundGrade?.startsWith('B') ? 'text-cyan-400' : 'text-amber-400'}
                  bg={signalsData.fundGrade?.startsWith('A') ? 'bg-emerald-950/20' : signalsData.fundGrade?.startsWith('B') ? 'bg-cyan-950/20' : 'bg-slate-900/40'}
                  border={signalsData.fundGrade?.startsWith('A') ? 'border-emerald-500/20' : signalsData.fundGrade?.startsWith('B') ? 'border-cyan-500/20' : 'border-white/[0.06]'}
                  sub={signalsData.fundScore ? <>PE: <span className="text-cyan-400 font-bold">{signalsData.fundPe || '—'}</span> · ROE: <span className="text-cyan-400 font-bold">{signalsData.fundRoe || '—'}%</span></> : (locale === 'ko' ? '재무 건전성 평가' : locale === 'ja' ? '財務健全性評価' : 'Financial scoring')} 
                  locale={locale}
                />
              </div>
            </div>
          )}

          {/* IV Skew Curve */}
          <div style={{ marginBottom: 'var(--s4)' }}>
            <IVSkewCurve 
              ticker={data.ticker} 
              underlyingPrice={displayPrice} 
              gammaFlip={data.premium.gammaFlipRaw || 0}
              darkPool={signalsData?.darkPool || 0}
              blockTradeCount={signalsData?.blockTradeCount || 0}
            />
          </div>

          {/* Technical & Gamma Levels Map */}
          <div style={{ marginBottom: 'var(--s4)' }}>
            <TechnicalGammaMap 
              price={displayPrice} 
              high={data.high} 
              low={data.low} 
              callWall={data.premium.callWall} 
              putFloor={data.premium.putFloor} 
              gammaFlip={data.premium.gammaFlipRaw} 
            />
          </div>

          {/* GEX Timeline (30D regime history — app-native, /api/history SSOT) */}
          <AppGexTimeline
            ticker={data.ticker}
            locale={locale}
            currentPrice={displayPrice}
            gammaFlip={data.premium.gammaFlipRaw}
            putFloor={data.premium.putFloor}
            callWall={data.premium.callWall}
          />
          {/* Premium Metrics Summary removed — GAMMA FLIP duplicates the GEX Timeline + hero,
              DARK POOL / BLOCKS duplicate the INST RADAR card (same quant tab). */}
        </div>
        </ValueWall>
      )}

      {activeTab === 'holders' && (
        <ValueWall
          locale={locale}
          title={locale === 'ko' ? '기관 보유 잠금' : locale === 'ja' ? '機関保有ロック' : 'Holdings Data Locked'}
          subtitle={locale === 'ko' ? '30초 광고를 시청하고 1시간 프리미엄 분석을 이용하세요' : locale === 'ja' ? '30秒の動画を視聴して1時間プレミアム分析をご利用ください' : 'Watch a 30-second video to unlock premium analysis for 1 hour'}
          socialProof={locale === 'ko' ? '오늘 14.2K 잠금해제' : locale === 'ja' ? '本日14.2Kがロック解除' : '14.2K unlocked today'}
        >
        <div className={`${s.animateIn} ${s.delay2}`}>
          <div 
            className="rounded-b-2xl border-x border-b border-white/[0.06] bg-[#0f172a]/50 p-4"
            style={{
              marginTop: '0px',
              borderTop: 'none',
              borderTopLeftRadius: '0px',
              borderTopRightRadius: '0px'
            }}
          >
            <MobileCmd13F ticker={data.ticker} locale={locale} />
          </div>
        </div>
        </ValueWall>
      )}
      </SwipeableTabs>

      {/* ── AD BANNER ── */}
      <div className={`${s.animateIn} ${s.delay7}`} style={{ padding: '0 var(--s4)', marginBottom: 'var(--s6)' }}>
        <AdBanner />
      </div>

      {/* ── MOBILE APP LEGAL FOOTER ── */}
      <MobileAppFooter />

      {/* ── SEARCH MODAL (Premium Glassmorphism) ── */}
      {isSearchOpen && (
        <div className={s.searchOverlay} onClick={() => setIsSearchOpen(false)}>
          <div className={s.searchDialog} onClick={(e) => e.stopPropagation()}>
            <div className={s.searchHeader}>
              <span className={s.searchTitle}>{tCommon('search')}</span>
              <button className={s.searchClose} onClick={() => setIsSearchOpen(false)}>✕</button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (searchVal.trim()) {
                setIsSearchOpen(false);
                router.push(`/app-view/cmd?t=${searchVal.trim().toUpperCase()}`);
                setSearchVal('');
              }
            }}>
              <div className={s.searchInputWrap}>
                <input 
                  type="text" 
                  className={s.searchInput}
                  placeholder={locale === 'ko' ? '티커 입력 (예: TSLA, AAPL)...' : locale === 'ja' ? 'ティッカー入力 (例: TSLA, AAPL)...' : 'Enter ticker (e.g. TSLA, AAPL)...'}
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  autoFocus
                />
                <button type="submit" className={s.searchSubmitBtn}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="#0b111e" strokeWidth="2.5" />
                    <path d="m16.5 16.5 4 4" stroke="#0b111e" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   PAGE EXPORT (with Suspense for useSearchParams)
   ═══════════════════════════════════════════ */
export default function AppCmdPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '80px 16px 16px', textAlign: 'center' }}>
        <h1 style={{ font: 'var(--f-h1)', color: 'var(--text)' }}>Command</h1>
        <p style={{ font: 'var(--f-body)', color: 'var(--text-dim)', marginTop: 8 }}>Loading…</p>
      </div>
    }>
      <CmdPageContent />
    </Suspense>
  );
}
