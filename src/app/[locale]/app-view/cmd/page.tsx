'use client';

import { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { ValueWall, useUnlockState } from '@/components/app/ValueWall';
import { AdBanner } from '@/components/app/AdBanner';
import s from './cmd.module.css';

// WebSocket real-time price hooks
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';

/* ═══════════════════════════════════════════
   DEMO DATA — used when API is unreachable
   ═══════════════════════════════════════════ */
const DEMO = {
  ticker: 'NVDA',
  company: 'NVIDIA Corp',
  price: 135.20,
  change: 3.45,
  changePct: 2.62,
  up: true,
  rsi14: 64.2,
  vwap: 133.80,
  high: 137.50,
  low: 131.20,
  session: 'REG' as const,
  analyst: { rating: 'STRONG BUY', target: 180.00, buy: 15, hold: 3, sell: 1 },
  fundamentals: [
    { label: 'P / E', value: '45.2', sub: 'Industry avg 38.5', trend: 'up' },
    { label: 'ROE', value: '56.3%', sub: 'vs 22.1% sector', trend: 'up' },
    { label: 'REVENUE TTM', value: '$35.1B', sub: '+122% YoY', trend: 'up' },
    { label: 'EPS', value: '$2.12', sub: 'Beat by $0.08', trend: 'up' },
  ],
  earnings: { date: 'Aug 25, 2026', daysLeft: 80, progress: 62, session: 'AMC' },
  premium: {
    gex: [-3, -5, -2, 4, 8, 14, 22, 30, 18, 9, 5, -2, -6, -3],
    gammaFlip: '$132.50',
    gammaFlipRaw: 132.50,
    callWall: 140.00,
    putFloor: 130.00,
    darkPool: '68.4%',
    blockTrades: 214,
    aiInsight:
      'Dealers are short gamma below $132.50 — a break lower accelerates volatility. Heavy dark-pool accumulation (68%) plus 214 block prints signal institutional positioning ahead of expiry. Bias: bullish above flip.',
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

/* ═══════════════════════════════════════════
   PREMIUM LOCK INDICATOR FOR TAB BAR
   ═══════════════════════════════════════════ */
function TabLockIcon({ unlocked }: { unlocked: boolean }) {
  if (unlocked) {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.34 6.34l2.83 2.83M14.83 14.83l2.83 2.83M6.34 17.66l2.83-2.83M14.83 9.17l2.83-2.83" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="#f59e0b" strokeWidth="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#f59e0b" strokeWidth="2.5" />
    </svg>
  );
}

/* ═══════════════════════════════════════════
   SVG CANDLESTICK CHART (PREMIUM INTEGRATED)
   ═══════════════════════════════════════════ */
function CandleChart({ ticker, price, vwap }: { ticker: string; price: number; vwap?: number }) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1D');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [candles, setCandles] = useState<{ o: number; h: number; l: number; c: number; dateET: string; session: string }[]>([]);
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
    async function fetchChart() {
      setLoading(true);
      try {
        const r = await fetch(`/api/chart?symbol=${ticker}&range=${range.toLowerCase()}`);
        if (!r.ok) throw new Error();
        const json = await r.json();
        if (!active) return;

        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          const mapped = json.data.map((item: any) => ({
            o: item.open ?? item.close,
            h: item.high ?? Math.max(item.open ?? item.close, item.close),
            l: item.low ?? Math.min(item.open ?? item.close, item.close),
            c: item.close,
            dateET: item.dateET ?? '',
            session: item.session ?? 'REG'
          }));
          setCandles(mapped);
        } else {
          throw new Error('Empty data');
        }
      } catch {
        if (active) {
          setCandles(genCandles(rangeCount[range], priceRef.current, rangeSeed[range]));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchChart();
    return () => { active = false; };
  }, [ticker, range]);

  const displayCandles = useMemo(() => {
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
  }, [candles, price]);

  // Trend detection to color the line/gradient green or red
  const isTrendUp = useMemo(() => {
    if (displayCandles.length < 2) return true;
    const firstVal = displayCandles[0].c;
    return price >= firstVal;
  }, [displayCandles, price]);

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
          <div className={s.c2Title}>PRICE HISTORY</div>
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
        <span>NBBO <b style={{ color: 'var(--green)' }}>${nbbo.bid}</b> ×100</span>
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
function SparklineBg({ up }: { up: boolean }) {
  const pts = useMemo(() => {
    const n = 40;
    const vals: number[] = [];
    let v = 50;
    for (let i = 0; i < n; i++) {
      v += (Math.random() - (up ? 0.42 : 0.58)) * 8;
      v = Math.max(10, Math.min(90, v));
      vals.push(v);
    }
    return vals.map((y, i) => `${(i / (n - 1)) * 100},${100 - y}`).join(' ');
  }, [up]);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"
      style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0.15" />
          <stop offset="100%" stopColor={up ? 'var(--green)' : 'var(--red)'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={up ? 'var(--green)' : 'var(--red)'}
        strokeWidth="0.8" opacity="0.4" />
      <polygon points={`0,100 ${pts} 100,100`} fill="url(#sparkGrad)" />
    </svg>
  );
}

/* ═══════════════════════════════════════════
   GEX BAR CHART (premium)
   ═══════════════════════════════════════════ */
function GexBarChart({ data }: { data: number[] }) {
  const maxAbs = Math.max(...data.map(Math.abs), 1);
  return (
    <div style={{ marginBottom: 'var(--s3)' }}>
      <div className={s.cardTitle} style={{ marginBottom: 'var(--s2)' }}>GEX PROFILE</div>
      <div className={s.gexChart}>
        {data.map((v, i) => {
          const h = (Math.abs(v) / maxAbs) * 80;
          const isPos = v >= 0;
          return (
            <div key={i} style={{
              width: 14,
              height: h,
              borderRadius: isPos ? '3px 3px 0 0' : '0 0 3px 3px',
              background: isPos
                ? 'linear-gradient(180deg, var(--green), rgba(16,185,129,0.4))'
                : 'linear-gradient(0deg, var(--red), rgba(239,68,68,0.4))',
              alignSelf: isPos ? 'flex-end' : 'flex-start',
              transition: 'height 0.4s ease',
            }} />
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ANALYST CONSENSUS CARD
   ═══════════════════════════════════════════ */
function AnalystConsensus({
  analyst, price
}: {
  analyst: typeof DEMO.analyst; price: number
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t); }, []);

  const total = analyst.buy + analyst.hold + analyst.sell;
  const buyPct = Math.round((analyst.buy / total) * 100);
  const holdPct = Math.round((analyst.hold / total) * 100);
  const sellPct = Math.round((analyst.sell / total) * 100);
  const upsidePct = ((analyst.target - price) / price * 100).toFixed(1);

  const ratingClass = analyst.rating.includes('BUY') ? s.ratingBuy
    : analyst.rating.includes('SELL') ? s.ratingSell : s.ratingHold;

  return (
    <div className={`${s.card} ${s.animateIn} ${s.delay3}`}>
      <div className={s.cardTitle}>ANALYST CONSENSUS</div>
      <div className={s.analystHead}>
        <span className={ratingClass}>{analyst.rating}</span>
      </div>
      <div className={s.targetRow}>
        <span className={s.targetLabel}>12M TARGET:</span>
        <span className={s.targetValue}>${analyst.target.toFixed(2)}</span>
        <span className={`${s.targetPct} ${s.pos}`}>+{upsidePct}%</span>
      </div>
      <div className={s.barGroup}>
        {[
          { label: 'Buy', count: analyst.buy, pct: buyPct, cls: s.barFillGreen },
          { label: 'Hold', count: analyst.hold, pct: holdPct, cls: s.barFillAmber },
          { label: 'Sell', count: analyst.sell, pct: sellPct, cls: s.barFillRed },
        ].map(b => (
          <div key={b.label} className={s.barRow}>
            <span className={s.barLabel}>{b.label}</span>
            <div className={s.barTrack}>
              <div className={b.cls} style={{ width: animated ? `${b.pct}%` : '0%' }} />
            </div>
            <span className={s.barCount}>{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FUNDAMENTALS CARD
   ═══════════════════════════════════════════ */
function FundamentalsCard({ items }: { items: typeof DEMO.fundamentals }) {
  return (
    <div className={`${s.card} ${s.animateIn} ${s.delay4}`}>
      <div className={s.cardTitle} style={{ marginBottom: 'var(--s3)' }}>FUNDAMENTALS</div>
      <div className={s.fundGrid}>
        {items.map(f => (
          <div key={f.label} className={s.fundItem}>
            <div className={s.fundLabel}>{f.label}</div>
            <div className={s.fundValue}>{f.value}</div>
            <div className={`${s.fundSub} ${f.trend === 'up' ? s.pos : s.neg}`}>{f.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EARNINGS CARD
   ═══════════════════════════════════════════ */
function EarningsCard({ earnings }: { earnings: typeof DEMO.earnings }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t); }, []);

  return (
    <div className={`${s.card} ${s.animateIn} ${s.delay5}`}>
      <div className={s.cardTitle} style={{ marginBottom: 'var(--s3)' }}>NEXT EARNINGS</div>
      <div className={s.earningsTop}>
        <span className={s.earningsDate}>{earnings.date}</span>
        <span className={s.countdownBadge}>D-{earnings.daysLeft}</span>
      </div>
      <div className={s.earningsBar}>
        <div className={s.earningsBarFill} style={{ width: animated ? `${earnings.progress}%` : '0%' }} />
      </div>
      <div className={s.earningsSession}>
        <span>⏱</span>
        After Market Close ({earnings.session})
      </div>
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
  const levels = [
    { label: 'R3 (Resistance)', val: r3, type: 'pivot', color: 'rgba(239, 68, 68, 0.5)' },
    { label: 'R2 (Resistance)', val: r2, type: 'pivot', color: 'rgba(239, 68, 68, 0.7)' },
    { label: 'R1 (Resistance)', val: r1, type: 'pivot', color: 'rgba(239, 68, 68, 0.95)' },
    { label: 'PP (Pivot Point)', val: pp, type: 'pivot', color: 'var(--text-muted)' },
    { label: 'S1 (Support)', val: s1, type: 'pivot', color: 'rgba(16, 185, 129, 0.95)' },
    { label: 'S2 (Support)', val: s2, type: 'pivot', color: 'rgba(16, 185, 129, 0.7)' },
    { label: 'S3 (Support)', val: s3, type: 'pivot', color: 'rgba(16, 185, 129, 0.5)' },
  ];

  if (callWall) levels.push({ label: 'Call Wall', val: callWall, type: 'gamma', color: '#f43f5e' });
  if (putFloor) levels.push({ label: 'Put Floor', val: putFloor, type: 'gamma', color: '#10b981' });
  if (gammaFlip) levels.push({ label: 'Gamma Flip', val: gammaFlip, type: 'gamma', color: '#f59e0b' });
  levels.push({ label: 'CURRENT PRICE', val: price, type: 'price', color: '#22d3ee' });

  // Sort by value descending
  levels.sort((a, b) => b.val - a.val);

  const minVal = Math.min(...levels.map(l => l.val));
  const maxVal = Math.max(...levels.map(l => l.val));
  const range = maxVal - minVal || 1;

  return (
    <div className={s.levelMapCard}>
      <div className={s.cardTitle} style={{ marginBottom: '16px' }}>TECHNICAL & GAMMA LEVELS MAP</div>
      <div className={s.rulerContainer}>
        <div className={s.verticalRuler} />
        {levels.map((l, idx) => {
          const pct = ((maxVal - l.val) / range) * 100;
          const isPrice = l.type === 'price';
          const isGamma = l.type === 'gamma';
          
          return (
            <div 
              key={`${l.label}-${idx}`} 
              className={`${s.rulerMarker} ${isPrice ? s.priceMarker : isGamma ? s.gammaMarker : s.pivotMarker}`}
              style={{ top: `${pct.toFixed(1)}%` }}
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

/* ═══════════════════════════════════════════
   PREMIUM CONTENT (inside ValueWall)
   ═══════════════════════════════════════════ */
interface PremiumProps {
  ticker: string;
  price: number;
  high: number;
  low: number;
  premium: typeof DEMO.premium;
}

function PremiumContent({ 
  ticker, 
  price, 
  high, 
  low, 
  premium 
}: PremiumProps) {
  return (
    <div className={s.premiumContent}>
      {/* 1. IV Skew Curve */}
      <div style={{ marginBottom: 'var(--s4)' }}>
        <IVSkewCurve ticker={ticker} underlyingPrice={price} />
      </div>

      {/* 2. Technical & Gamma Levels Map */}
      <div style={{ marginBottom: 'var(--s4)' }}>
        <TechnicalGammaMap 
          price={price} 
          high={high} 
          low={low} 
          callWall={premium.callWall} 
          putFloor={premium.putFloor} 
          gammaFlip={premium.gammaFlipRaw} 
        />
      </div>

      {/* 3. Original GEX profile */}
      <GexBarChart data={premium.gex} />

      {/* 4. Original metrics summary */}
      <div className={s.premiumMetrics} style={{ marginBottom: 'var(--s3)' }}>
        <div className={s.premiumMetric}>
          <span className={s.premiumMetricLabel}>GAMMA FLIP</span>
          <span className={s.premiumMetricValue}>{premium.gammaFlip}</span>
        </div>
        <div className={s.premiumMetric}>
          <span className={s.premiumMetricLabel}>DARK POOL</span>
          <span className={s.premiumMetricValue}>{premium.darkPool}</span>
        </div>
        <div className={s.premiumMetric}>
          <span className={s.premiumMetricLabel}>BLOCKS</span>
          <span className={s.premiumMetricValue}>{premium.blockTrades}</span>
        </div>
      </div>

      {/* 5. AI Insight */}
      <div className={s.aiInsight} style={{ marginBottom: 'var(--s4)' }}>
        <div className={s.aiInsightHead}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="var(--cyan)" strokeWidth="1.5" />
            <path d="M12 8v4l3 3" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className={s.aiInsightLabel}>AI DEEP INSIGHT</span>
        </div>
        <div className={s.aiInsightText}>{premium.aiInsight}</div>
      </div>

      {/* 6. 13F Holders & Insider Tracker */}
      <div>
        <div className={s.cardTitle} style={{ marginBottom: '12px' }}>INSTITUTIONAL & INSIDER FILINGS</div>
        <MobileCmd13F ticker={ticker} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PAGE CONTENT (needs Suspense boundary)
   ═══════════════════════════════════════════ */
function CmdPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale;
  const tIndicators = useTranslations('indicators');
  const tCommon = useTranslations('common');
  const ticker = (searchParams.get('t') || 'NVDA').toUpperCase();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const [data, setData] = useState<(typeof DEMO & { rawTickerData?: any }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'quant' | 'holders' | 'verdict'>('overview');
  const { unlocked } = useUnlockState();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchAll() {
      try {
        const [tickerRes, analystRes, fundRes, earningsRes] = await Promise.allSettled([
          fetch(`/api/live/ticker?t=${ticker}`).then(r => r.json()),
          fetch(`/api/live/analyst?t=${ticker}`).then(r => r.json()),
          fetch(`/api/live/fundamentals?t=${ticker}`).then(r => r.json()),
          fetch(`/api/live/earnings?t=${ticker}`).then(r => r.json()),
        ]);

        if (cancelled) return;

        const t = tickerRes.status === 'fulfilled' ? tickerRes.value : null;
        const a = analystRes.status === 'fulfilled' ? analystRes.value : null;
        const f = fundRes.status === 'fulfilled' ? fundRes.value : null;
        const e = earningsRes.status === 'fulfilled' ? earningsRes.value : null;

        const price = t?.display?.price ?? t?.price ?? DEMO.price;
        const changeAbs = t?.display?.changeAbs ?? DEMO.change;
        const changePct = t?.display?.changePctPct ?? DEMO.changePct;
        const up = changePct >= 0;
        const session = t?.session ?? DEMO.session;
        const company = t?.name ?? DEMO.company;

        const analyst = a?.consensus ? {
          rating: a.consensus.rating || DEMO.analyst.rating,
          target: a.consensus.targetPrice || DEMO.analyst.target,
          buy: a.consensus.buy ?? DEMO.analyst.buy,
          hold: a.consensus.hold ?? DEMO.analyst.hold,
          sell: a.consensus.sell ?? DEMO.analyst.sell,
        } : DEMO.analyst;

        const fundamentals = f?.fundamentals ? [
          { label: 'P / E', value: String(f.fundamentals.pe || '—'), sub: f.fundamentals.peSub || '', trend: 'up' },
          { label: 'ROE', value: f.fundamentals.roe ? `${f.fundamentals.roe}%` : '—', sub: f.fundamentals.roeSub || '', trend: 'up' },
          { label: 'REVENUE TTM', value: f.fundamentals.revenue || '—', sub: f.fundamentals.revenueSub || '', trend: 'up' },
          { label: 'EPS', value: f.fundamentals.eps ? `$${f.fundamentals.eps}` : '—', sub: f.fundamentals.epsSub || '', trend: 'up' },
        ] : DEMO.fundamentals;

        const earnings = e?.earnings ? {
          date: e.earnings.date || DEMO.earnings.date,
          daysLeft: e.earnings.daysLeft ?? DEMO.earnings.daysLeft,
          progress: e.earnings.progress ?? DEMO.earnings.progress,
          session: e.earnings.session || DEMO.earnings.session,
        } : DEMO.earnings;

        const flow = t?.flow || {};
        const gexData = flow.gexProfile || DEMO.premium.gex;
        const premium = {
          gex: Array.isArray(gexData) ? gexData : DEMO.premium.gex,
          gammaFlip: flow.gammaFlipLevel ? `$${Number(flow.gammaFlipLevel).toFixed(2)}` : DEMO.premium.gammaFlip,
          gammaFlipRaw: flow.gammaFlipLevel ?? DEMO.premium.gammaFlipRaw,
          callWall: flow.callWall ?? DEMO.premium.callWall,
          putFloor: flow.putFloor ?? DEMO.premium.putFloor,
          darkPool: flow.darkPoolPct != null ? `${flow.darkPoolPct}%` : DEMO.premium.darkPool,
          blockTrades: flow.blockTrades ?? DEMO.premium.blockTrades,
          aiInsight: t?.alpha?.whyKR || DEMO.premium.aiInsight,
        };

        const high = t?.prices?.high ?? DEMO.high;
        const low = t?.prices?.low ?? DEMO.low;

        setData({
          ticker,
          company,
          price,
          high,
          low,
          change: Math.abs(changeAbs),
          changePct: Math.abs(changePct),
          up,
          rsi14: DEMO.rsi14,
          vwap: t?.vwap ?? DEMO.vwap,
          session,
          analyst,
          fundamentals,
          earnings,
          premium,
          rawTickerData: t,
        });
      } catch {
        if (!cancelled) {
          setData({ ...DEMO, ticker, company: DEMO.company, rawTickerData: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [ticker]);

  // ── Live Price Hooks ──
  const { status: marketStatus } = useMarketStatus();
  const livePrice = useLivePrice(ticker, marketStatus.market);
  const { getPrice: wsGetPrice } = useRealtimeData([ticker]);
  const wsPrice = wsGetPrice(ticker);

  const t = data?.rawTickerData;

  const effectiveSession = marketStatus.isHoliday || marketStatus.market === 'closed'
    ? 'CLOSED'
    : (t?.session || data?.session || 'CLOSED').toUpperCase();

  const { displayPrice, displayChangePct, activeExtPrice, activeExtLabel, activeExtPct } = calcPriceDisplay({
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
  const prevPriceRef = useRef(displayPrice);

  useEffect(() => {
    if (displayPrice !== prevPriceRef.current) {
      const isUp = displayPrice >= prevPriceRef.current;
      setFlash(isUp ? 'up' : 'down');
      prevPriceRef.current = displayPrice;
      const tId = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(tId);
    }
  }, [displayPrice]);

  const resolvedPrevClose = t?.prices?.prevRegularClose || t?.prevClose || 0;
  const finalChangeAbs = resolvedPrevClose > 0 ? Math.abs(displayPrice - resolvedPrevClose) : Math.abs(t?.display?.changeAbs || data?.change || 0);
  const up = displayChangePct >= 0;

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

  return (
    <>
      {/* ── BACKGROUND GLOWS FOR GLASSMORPHISM DEPTH ── */}
      <div className={s.bgGlows}>
        <div className={s.glowCyan} />
        <div className={s.glowPurple} />
        <div className={s.glowAmber} />
      </div>

      {/* ── HEADER ── */}
      <div className={s.header}>
        <button className={s.headerBtn} onClick={() => router.back()} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 19l-7-7 7-7" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={s.headerCapsule}>
          <div className={s.headerLogoWrapper}>
            <img 
              src={`https://assets.parqet.com/logos/symbol/${data.ticker}?format=png`} 
              alt={data.ticker}
              className={s.headerLogo}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
            <span className={s.headerTicker}>{data.ticker}</span>
            <span className={s.headerCompany}>{data.company}</span>
          </div>
          <div className={s.headerIntel}>
            <span className={`${s.headerBadge} ${s.badgeGold}`}>
              {tIndicators('gammaFlip')} {data.premium.gammaFlip}
            </span>
          </div>
        </div>
        <button className={s.headerBtn} aria-label="Search" onClick={() => setIsSearchOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--text-dim)" strokeWidth="2" />
            <path d="m16.5 16.5 4 4" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── PRICE CARD v2 ── */}
      <div className={`${s.p2Card} ${s.animateIn} ${s.delay1}`}>
        <div className={s.p2Topline}>
          <div className={isOpen ? s.marketBadge : isPrePost ? s.marketBadgePrePost : s.marketBadgeClosed}>
            {isOpen ? (
              <span className={s.marketDotActive} />
            ) : isPrePost ? (
              <span className={s.marketDotPulse} />
            ) : null}
            {sessionLabel}
          </div>
          <span className={`${s.p2Tick} ${flash ? s[`show-${flash}`] : ''}`}>
            {flash === 'down' ? '▼ TICK' : '▲ TICK'}
          </span>
        </div>
        <div className={s.p2PriceRow}>
          <span className={`${s.p2Price} ${flash ? s[`flash-${flash}`] : ''}`}>
            ${displayPrice.toFixed(2)}
          </span>
          <span className={`${s.p2Chg} ${up ? s.pos : s.neg}`}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{finalChangeAbs.toFixed(2)} ({up ? '+' : ''}{displayChangePct.toFixed(2)}%)
          </span>
        </div>
        <div className={s.p2Vitals}>
          <div className={s.p2Vital}>
            <div className={s.k}>RSI 14</div>
            <div className={s.v}>{data.rsi14.toFixed(1)}</div>
            <div className={s.bar}><i style={{ width: `${data.rsi14}%` }} /></div>
          </div>
          <div className={s.p2Vital}>
            <div className={s.k}>VWAP</div>
            <div className={s.v}>${data.vwap.toFixed(2)}</div>
            <div className={s.bar}><i style={{ width: '52%' }} /></div>
          </div>
          <div className={s.p2Vital}>
            <div className={s.k}>DAY RANGE</div>
            <div className={s.v}>${data.low.toFixed(1)}–${data.high.toFixed(1)}</div>
            <div className={s.bar}>
              <i style={{ width: `${((displayPrice - data.low) / (data.high - data.low || 1)) * 100}%` }} />
            </div>
          </div>
        </div>
        {hasExt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--ext-session-dim)', flexShrink: 0, marginTop: '12px', width: 'fit-content', background: 'var(--ext-session-dim)' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--ext-session)', whiteSpace: 'nowrap' }}>{activeExtLabel}</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f1f5f9', fontFamily: 'var(--f-mono)', fontVariantNumeric: 'tabular-nums' }}>${activeExtPrice.toFixed(2)}</span>
            <span style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--f-mono)', fontVariantNumeric: 'tabular-nums', color: activeExtPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {activeExtPct >= 0 ? '+' : ''}{activeExtPct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* ── TAB BAR v2 (overview, quant, holders, verdict) ── */}
      <div className={`${s.seg} ${s.seg4}`}>
        <span className={s.segPill} style={{ left: `calc(3px + ${['overview', 'quant', 'holders', 'verdict'].indexOf(activeTab)} * (100% - 6px) / 4)` }}></span>
        <button 
          className={activeTab === 'overview' ? s.on : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'quant' ? s.on : ''}
          onClick={() => setActiveTab('quant')}
        >
          Quant <TabLockIcon unlocked={unlocked} />
        </button>
        <button 
          className={activeTab === 'holders' ? s.on : ''}
          onClick={() => setActiveTab('holders')}
        >
          Holders <TabLockIcon unlocked={unlocked} />
        </button>
        <button 
          className={activeTab === 'verdict' ? s.on : ''}
          onClick={() => setActiveTab('verdict')}
        >
          Verdict <TabLockIcon unlocked={unlocked} />
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      {activeTab === 'overview' && (
        <div className={`${s.animateIn} ${s.delay2}`}>
          {/* Chart card with upgrade */}
          <div className={s.card}>
            <CandleChart ticker={data.ticker} price={displayPrice} vwap={data.vwap} />
          </div>

          <AnalystConsensus analyst={data.analyst} price={displayPrice} />
          <FundamentalsCard items={data.fundamentals} />
          <EarningsCard earnings={data.earnings} />
        </div>
      )}

      {activeTab === 'quant' && (
        <div className={`${s.animateIn} ${s.delay2}`}>
          <div className={s.premiumLabel}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="2" />
            </svg>
            QUANTITATIVE INDICATORS
          </div>
          <ValueWall 
            title="Quant Intelligence"
            teaser={{ label: 'GAMMA FLIP · 1 OF 6 SIGNALS FREE', value: data.premium.gammaFlip }}
            socialProof="12,400 unlocked today"
            lockedPreview={
              <div className={s.premiumContent}>
                <div style={{ marginBottom: 'var(--s4)' }}>
                  <IVSkewCurve 
                    ticker="" 
                    underlyingPrice={135.20} 
                    expiration="Aug 25, 2026"
                    atmSlice={[
                      { strike: 120, type: 'call', iv: 0.45, gamma: 0.02, oi: 1500 },
                      { strike: 125, type: 'call', iv: 0.42, gamma: 0.04, oi: 2200 },
                      { strike: 130, type: 'call', iv: 0.38, gamma: 0.08, oi: 4500 },
                      { strike: 135, type: 'call', iv: 0.35, gamma: 0.12, oi: 8000 },
                      { strike: 140, type: 'call', iv: 0.39, gamma: 0.06, oi: 3800 },
                      { strike: 145, type: 'call', iv: 0.43, gamma: 0.03, oi: 1900 },
                      { strike: 120, type: 'put', iv: 0.58, gamma: 0.01, oi: 3400 },
                      { strike: 125, type: 'put', iv: 0.52, gamma: 0.03, oi: 4100 },
                      { strike: 130, type: 'put', iv: 0.44, gamma: 0.07, oi: 6200 },
                      { strike: 135, type: 'put', iv: 0.36, gamma: 0.10, oi: 7100 },
                      { strike: 140, type: 'put', iv: 0.32, gamma: 0.04, oi: 2500 },
                      { strike: 145, type: 'put', iv: 0.30, gamma: 0.02, oi: 1100 },
                    ]}
                  />
                </div>
                <div style={{ marginBottom: 'var(--s4)' }}>
                  <TechnicalGammaMap 
                    price={135.20} 
                    high={data.high} 
                    low={data.low} 
                    callWall={data.premium.callWall} 
                    putFloor={data.premium.putFloor} 
                    gammaFlip={data.premium.gammaFlipRaw} 
                  />
                </div>
                <GexBarChart data={data.premium.gex} />
                <div className={s.premiumMetrics} style={{ marginBottom: 'var(--s3)' }}>
                  <div className={s.premiumMetric}>
                    <span className={s.premiumMetricLabel}>GAMMA FLIP</span>
                    <span className={s.premiumMetricValue}>{data.premium.gammaFlip}</span>
                  </div>
                  <div className={s.premiumMetric}>
                    <span className={s.premiumMetricLabel}>DARK POOL</span>
                    <span className={s.premiumMetricValue}>{data.premium.darkPool}</span>
                  </div>
                  <div className={s.premiumMetric}>
                    <span className={s.premiumMetricLabel}>BLOCKS</span>
                    <span className={s.premiumMetricValue}>{data.premium.blockTrades}</span>
                  </div>
                </div>
              </div>
            }
          >
            <div className={s.premiumContent}>
              <div style={{ marginBottom: 'var(--s4)' }}>
                <IVSkewCurve ticker={data.ticker} underlyingPrice={displayPrice} />
              </div>
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
              <GexBarChart data={data.premium.gex} />
              <div className={s.premiumMetrics} style={{ marginBottom: 'var(--s3)' }}>
                <div className={s.premiumMetric}>
                  <span className={s.premiumMetricLabel}>GAMMA FLIP</span>
                  <span className={s.premiumMetricValue}>{data.premium.gammaFlip}</span>
                </div>
                <div className={s.premiumMetric}>
                  <span className={s.premiumMetricLabel}>DARK POOL</span>
                  <span className={s.premiumMetricValue}>{data.premium.darkPool}</span>
                </div>
                <div className={s.premiumMetric}>
                  <span className={s.premiumMetricLabel}>BLOCKS</span>
                  <span className={s.premiumMetricValue}>{data.premium.blockTrades}</span>
                </div>
              </div>
            </div>
          </ValueWall>
        </div>
      )}

      {activeTab === 'holders' && (
        <div className={`${s.animateIn} ${s.delay2}`}>
          <div className={s.premiumLabel}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="2" />
            </svg>
            OWNERSHIP INSIGHTS
          </div>
          <ValueWall 
            title="Institutional Holders"
            subtitle="Major institutional shareholders and ownership distribution insights."
            teaser={{ label: 'TOP HOLDER · 1 OF 20 SIGNALS FREE', value: 'Vanguard Group' }}
            socialProof="8,900 unlocked today"
            lockedPreview={
              <div className={s.premiumContent}>
                <div className="space-y-3" style={{ opacity: 0.8 }}>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                      <div className="text-[11px] text-slate-400 font-semibold mb-1">Holders</div>
                      <div className="text-[17px] font-bold text-white font-mono">1,824</div>
                    </div>
                    <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                      <div className="text-[11px] text-slate-400 font-semibold mb-1">Total Value</div>
                      <div className="text-[17px] font-bold text-emerald-400 font-mono">$18.2B</div>
                    </div>
                    <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                      <div className="text-[11px] text-slate-400 font-semibold mb-1">Period</div>
                      <div className="text-[15px] font-bold text-indigo-400 font-mono">Q2 2026</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-3" style={{ border: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[13px] font-bold w-5 text-center text-indigo-400">1</span>
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-bold text-white/90">VG</span>
                      </div>
                      <span className="text-[13px] font-semibold text-white truncate flex-1">Vanguard Group Inc</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pl-8">
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold">SHARES</div>
                        <div className="text-[13px] text-slate-200 font-mono font-semibold">1,024M</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold">VALUE</div>
                        <div className="text-[13px] text-slate-200 font-mono font-semibold">$138.2B</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold">WEIGHT</div>
                        <div className="text-[13px] font-mono font-bold text-indigo-300">8.4%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            <div className={s.premiumContent}>
              <MobileCmd13F ticker={data.ticker} />
            </div>
          </ValueWall>
        </div>
      )}

      {activeTab === 'verdict' && (
        <div className={`${s.animateIn} ${s.delay2}`}>
          <div className={s.sectionLabel}>AI VERDICT & CONTEXT</div>
          <div className={s.card}>
            <div className={s.aiInsight} style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className={s.aiInsightHead}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="var(--cyan)" strokeWidth="1.5" />
                  <path d="M12 8v4l3 3" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className={s.aiInsightLabel}>AI DEEP INSIGHT</span>
              </div>
              <div className={s.aiInsightText}>{data.premium.aiInsight}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── AD BANNER ── */}
      <div className={`${s.animateIn} ${s.delay7}`} style={{ padding: '0 var(--s4)', marginBottom: 'var(--s6)' }}>
        <AdBanner />
      </div>

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
