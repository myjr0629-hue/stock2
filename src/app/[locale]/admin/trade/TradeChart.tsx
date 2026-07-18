"use client";

// Command-center price chart: 1m candlesticks (Toss, spec-exact OHLC) with
// SIGNUM structure levels drawn as price lines (콜월/감마플립/맥스페인/풋플로어)
// and the 4s quote lane folded into the live minute bar.
import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, IPriceLine, LineStyle, ColorType, CrosshairMode, UTCTimestamp } from 'lightweight-charts';

export interface ChartCandle { t: number; o: number; h: number; l: number; c: number; v: number | null }
export interface ChartLevels { maxPain?: number | null; gammaFlip?: number | null; callWall?: number | null; putFloor?: number | null }

type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

// lightweight-charts v4 renders UTCTimestamp as UTC — format axis/crosshair in
// KST ourselves so the chart agrees with the operator's wall clock + SessionBar
const kstFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const kstFmtFull = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const asKst = (t: unknown, full: boolean) => {
  const sec = Number(t);
  if (!Number.isFinite(sec)) return '';
  return (full ? kstFmtFull : kstFmt).format(new Date(sec * 1000));
};

export default function TradeChart({ symbol, candles, livePx, liveAt, levels }: {
  symbol: string;
  candles: ChartCandle[];
  livePx: number | null;
  liveAt: number | null;
  levels: ChartLevels | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastBarRef = useRef<Bar | null>(null);
  const fittedSymRef = useRef<string | null>(null);

  useEffect(() => {
    if (!boxRef.current) return;
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8a8578', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(230,226,217,0.45)' }, horzLines: { color: 'rgba(230,226,217,0.45)' } },
      rightPriceScale: { borderColor: '#e6e2d9' },
      timeScale: { borderColor: '#e6e2d9', timeVisible: true, secondsVisible: false, tickMarkFormatter: (t: UTCTimestamp) => asKst(t, false) },
      localization: { timeFormatter: (t: UTCTimestamp) => `${asKst(t, true)} KST` },
      crosshair: { mode: CrosshairMode.Magnet },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#0e9f6e', downColor: '#dc2626', borderVisible: false,
      wickUpColor: '#0e9f6e', wickDownColor: '#dc2626',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; priceLinesRef.current = []; lastBarRef.current = null; };
  }, []);

  // full candle reload (symbol change / 30s slow lane). fitContent only on a
  // symbol switch — a periodic reload must not wipe the operator's zoom/pan.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const rows: Bar[] = candles.map((c) => ({ time: c.t as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c }));
    s.setData(rows);
    lastBarRef.current = rows.length ? rows[rows.length - 1] : null;
    if (fittedSymRef.current !== symbol && rows.length) {
      fittedSymRef.current = symbol;
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, symbol]);

  // 4s live tick → extend the current minute bar; a NEW bar is minted only when
  // the price actually moved (closed sessions repeat a static lastPrice — do
  // not accrete phantom flat candles past the last real bar)
  useEffect(() => {
    const s = seriesRef.current;
    const last = lastBarRef.current;
    if (!s || !last || livePx == null || liveAt == null) return;
    const minute = Math.floor(liveAt / 60_000) * 60;
    if (minute > (last.time as number) && livePx === last.close) return;
    const bar: Bar = minute > (last.time as number)
      ? { time: minute as UTCTimestamp, open: livePx, high: livePx, low: livePx, close: livePx }
      : { ...last, high: Math.max(last.high, livePx), low: Math.min(last.low, livePx), close: livePx };
    lastBarRef.current = bar;
    s.update(bar);
  }, [livePx, liveAt]);

  // SIGNUM structure levels as labeled price lines
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    for (const pl of priceLinesRef.current) { try { s.removePriceLine(pl); } catch { /* removed with chart */ } }
    priceLinesRef.current = [];
    const defs = [
      { v: levels?.callWall, title: '콜월', color: '#0e9f6e' },
      { v: levels?.gammaFlip, title: '감마플립', color: '#7c3aed' },
      { v: levels?.maxPain, title: '맥스페인', color: '#e8552f' },
      { v: levels?.putFloor, title: '풋플로어', color: '#b45309' },
    ];
    for (const d of defs) {
      if (d.v == null || !(d.v > 0)) continue;
      priceLinesRef.current.push(s.createPriceLine({
        price: d.v, color: d.color, lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: d.title,
      }));
    }
  }, [levels]);

  return <div className="tc-chart" ref={boxRef} />;
}
