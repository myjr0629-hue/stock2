"use client";

import React, { useEffect, useState } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import {
  ArrowRight,
  X,
  Loader2,
  ChevronRight,
  Waves,
  Eye,
  Radar,
  Target
} from "lucide-react";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { TradingViewTicker } from "@/components/TradingViewTicker";

// --- Ticker Drawer ---
function TickerDrawer({ symbol, isOpen, onClose }: { symbol: string, isOpen: boolean, onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`/api/live/options/atm?t=${symbol}`)
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [isOpen, symbol]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0F172A] h-full shadow-2xl border-l border-white/10 p-6 overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full">
          <X size={20} className="text-slate-400" />
        </button>
        <div className="mt-8 space-y-6">
          <h2 className="text-4xl font-black text-white">{symbol}</h2>
          {data?.underlyingPrice && (
            <p className="text-2xl font-mono font-bold text-cyan-400">${data.underlyingPrice.toFixed(2)}</p>
          )}
          <div className="pt-6 border-t border-white/10">
            <h3 className="text-xs font-black text-cyan-500 uppercase tracking-[0.2em] mb-4">Options Chain</h3>
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-cyan-500" size={24} /></div>
            ) : data?.atmSlice?.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="text-slate-500 border-b border-white/5">
                  <tr><th className="pb-2 text-left">Strike</th><th className="pb-2">Type</th><th className="pb-2 text-right">OI</th></tr>
                </thead>
                <tbody className="font-mono text-slate-300">
                  {data.atmSlice.slice(0, 8).map((row: any, i: number) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 font-bold text-white">{row.strike}</td>
                      <td className={`py-2 text-center ${row.type === 'call' ? 'text-emerald-400' : 'text-rose-400'}`}>{row.type}</td>
                      <td className="py-2 text-right">{row.oi?.toLocaleString() || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-slate-500 text-sm">No data</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Compact Ticker Card ---
function TickerCard({ symbol }: { symbol: string }) {
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [alphaScore, setAlphaScore] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/portfolio/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: [symbol] })
    })
      .then(r => r.json())
      .then((d) => {
        const item = d.results?.[0];
        if (item) {
          setPrice(item.price);
          setChange(item.changePct);
          setAlphaScore(item.alphaScore);
        }
      })
      .catch(() => { });
  }, [symbol]);

  const isPositive = (change ?? 0) >= 0;

  return (
    <>
      <div
        onClick={() => setDrawerOpen(true)}
        className="group cursor-pointer p-4 rounded-xl transition-all duration-200
          bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-cyan-500/30"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800/50 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={`https://financialmodelingprep.com/image-stock/${symbol}.png`} alt={symbol} className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{symbol}</h3>
              <p className="text-[9px] text-slate-500">NASDAQ</p>
            </div>
          </div>
          {alphaScore && (
            <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">{alphaScore}</span>
          )}
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xl font-black text-white font-mono">{price ? `$${price.toFixed(2)}` : "—"}</p>
            <p className={`text-xs font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {change !== null ? `${isPositive ? '+' : ''}${change.toFixed(2)}%` : "—"}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
        </div>
      </div>
      <TickerDrawer symbol={symbol} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}


export default function Page() {
  const { status: marketStatus } = useMarketStatus();
  const { snapshot: macroData } = useMacroSnapshot();

  return (
    <div className="min-h-screen bg-[#050810] text-slate-200 font-sans">
      <LandingHeader />

      {/* MACRO TICKER TAPE */}
      <div className="fixed top-[48px] left-0 right-0 z-40">
        <TradingViewTicker key="v7-subtle" />
      </div>

      {/* ========================================= */}
      {/* HERO SECTION */}
      {/* ========================================= */}
      <section className="relative pt-24 pb-10 px-6 overflow-hidden">
        {/* Background - Premium Abstract Grid + Glow */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden">
          {/* Subtle grid pattern - MORE VISIBLE */}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(6,182,212,0.8) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6,182,212,0.8) 1px, transparent 1px)
              `,
              backgroundSize: '80px 80px'
            }}
          />

          {/* Abstract chart line suggestion */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
                <stop offset="30%" stopColor="#06b6d4" stopOpacity="1" />
                <stop offset="70%" stopColor="#f59e0b" stopOpacity="1" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,70% Q15%,65% 25%,55% T50%,45% T75%,50% T100%,40%"
              fill="none"
              stroke="url(#chartLine)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M0,80% Q20%,75% 35%,60% T60%,55% T85%,60% T100%,50%"
              fill="none"
              stroke="url(#chartLine)"
              strokeWidth="1"
              strokeOpacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Center glow - STRONGER */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-cyan-500/8 rounded-full blur-[150px]" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[300px] bg-amber-500/8 rounded-full blur-[120px]" />

          {/* Bottom fade */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050810]" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-4">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full 
            bg-cyan-500/10 border border-cyan-500/20 
            text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Signal Command Active
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-[0.95] text-white">
            MARKET LOGIC,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">SOLVED.</span>
          </h1>

          {/* Tagline */}
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            <span className="text-white font-semibold">옵션 · 다크풀 · 고래</span> — 분산된 프리미엄 신호를
            <span className="text-cyan-400 font-semibold"> 하나의 사령부</span>에서 통합합니다.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a href="#live-demo"
              className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-cyan-400 
                text-slate-900 rounded-lg font-bold text-sm 
                hover:from-cyan-400 hover:to-cyan-300 transition-all 
                flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              Enter Command <ArrowRight size={14} />
            </a>
            <a href="#features"
              className="px-8 py-3 bg-white/5 border border-white/10 
                text-slate-300 rounded-lg font-medium text-sm hover:bg-white/10 transition-all">
              How It Works
            </a>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* FEATURES - Glassmorphism Cards with Content */}
      {/* ========================================= */}
      <section id="features" className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
              왜 <span className="text-cyan-400">SIGNUM HQ</span>인가?
            </h2>
            <p className="text-sm text-slate-500">$450+/월 가치의 프리미엄 데이터를 통합</p>
          </div>

          {/* Feature Cards - 3 columns with descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Waves,
                title: "옵션 감마 분석",
                desc: "MM의 감마 익스포져를 추적하여 가격 자석(Max Pain)과 저항선을 식별. 기관은 이 정보에 월 $200+ 지불합니다.",
                price: "$200/mo",
                color: "cyan"
              },
              {
                icon: Eye,
                title: "다크풀 & 고래 추적",
                desc: "일반 거래소에 보이지 않는 블록 트레이드와 대형 기관의 매집을 실시간 탐지.",
                price: "$150/mo",
                color: "amber"
              },
              {
                icon: Radar,
                title: "3일 스나이퍼 시그널",
                desc: "모멘텀, 수급, 기술적 조건이 정렬된 '3일 급등 후보' 자동 스캔. 고확률 진입 타이밍 포착.",
                price: "$100/mo",
                color: "cyan"
              }
            ].map((f, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl transition-all duration-300
                  bg-gradient-to-br from-white/[0.04] to-white/[0.01]
                  backdrop-blur-xl border border-white/5
                  hover:border-cyan-500/20 hover:scale-[1.01]"
              >
                {/* Icon & Price */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                    ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    <f.icon className="w-5 h-5" />
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full
                    ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {f.price}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>

                {/* Description */}
                <p className="text-xs text-slate-400 leading-relaxed mb-3">{f.desc}</p>

                {/* Included badge */}
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  SIGNUM HQ에 포함
                </span>
              </div>
            ))}
          </div>

          {/* Total Value */}
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">
              <span className="text-slate-500 line-through">$450+/월</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">통합 제공</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* LIVE DEMO */}
      {/* ========================================= */}
      <section id="live-demo" className="py-12 px-6 bg-[#030508]/50">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">LIVE</span>
              </div>
              <h2 className="text-xl font-black text-white">Signal Dashboard</h2>
            </div>
            <a href="/watchlist" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              View All <ChevronRight size={12} />
            </a>
          </div>

          {/* Ticker Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["NVDA", "TSLA", "AAPL", "MSFT"].map((ticker) => (
              <TickerCard key={ticker} symbol={ticker} />
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-6 px-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/logo-signum-original.jpg" alt="SIGNUM HQ" className="w-6 h-6 rounded" />
            <span className="font-bold text-sm text-white/60">SIGNUM HQ</span>
          </div>
          <p className="text-[10px] text-slate-600">© 2026 Market Signal Command</p>
        </div>
      </footer>
    </div>
  );
}
