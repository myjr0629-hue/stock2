"use client";

import React, { useEffect, useState } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  BarChart3,
  Clock,
  RefreshCw,
  AlertCircle,
  X,
  Loader2,
  Lock,
  Target,
  Radar,
  Eye,
  TrendingUp,
  Waves,
  ChevronRight
} from "lucide-react";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { TradingViewTicker } from "@/components/TradingViewTicker";

// --- Ticker Drawer (Detailed View) ---
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
      <div className="relative w-full max-w-md bg-[#0F172A] h-full shadow-2xl border-l border-white/10 p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={20} className="text-slate-400 hover:text-white" />
        </button>
        <div className="mt-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-4xl font-black text-white tracking-tighter">{symbol}</h2>
            {data?.underlyingPrice && (
              <p className="text-2xl font-mono font-bold text-cyan-400">
                ${data.underlyingPrice.toFixed(2)}
              </p>
            )}
          </div>
          <div className="pt-6 border-t border-white/10">
            <h3 className="text-xs font-black text-cyan-500 uppercase tracking-[0.2em] mb-4">Live Options Chain</h3>
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
      <div className="fixed top-[64px] left-0 right-0 z-40">
        <TradingViewTicker key="v7-subtle" />
      </div>

      {/* ========================================= */}
      {/* HERO SECTION */}
      {/* ========================================= */}
      <section className="relative pt-32 pb-16 px-6 overflow-hidden">
        {/* Background - Tech logos */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <img
            src="/us_tech_logos_tight.png?v=1"
            alt="Background"
            className="w-full h-full object-contain object-center opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050810]/70 via-[#050810]/50 to-[#050810]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050810_100%)] opacity-80" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-6">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full 
            bg-cyan-500/10 border border-cyan-500/20 
            text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Signal Command Active
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.95] text-white">
            MARKET LOGIC,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">SOLVED.</span>
          </h1>

          {/* Tagline */}
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            <span className="text-white font-semibold">옵션 · 다크풀 · 고래</span> — 분산된 프리미엄 신호를
            <span className="text-cyan-400 font-semibold"> 하나의 사령부</span>에서 통합합니다.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
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
      {/* FEATURES - Compact Grid */}
      {/* ========================================= */}
      <section id="features" className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
              왜 <span className="text-cyan-400">SIGNUM HQ</span>인가?
            </h2>
            <p className="text-sm text-slate-500">$500+/월 가치의 프리미엄 데이터를 통합</p>
          </div>

          {/* Compact Feature Cards - 4 columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Waves, title: "감마 분석", desc: "MM 포지션 추적", price: "$200", color: "cyan" },
              { icon: Eye, title: "다크풀", desc: "블록 트레이드 탐지", price: "$150", color: "amber" },
              { icon: Radar, title: "고래 추적", desc: "대형 매집 알림", price: "$100", color: "cyan" },
              { icon: Target, title: "3D 스나이퍼", desc: "급등 후보 스캔", price: "$50", color: "amber" }
            ].map((f, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all">
                <div className={`w-8 h-8 rounded-lg mb-3 flex items-center justify-center
                  ${f.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  <f.icon className="w-4 h-4" />
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-white">{f.title}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
                  </div>
                  <span className={`text-[10px] font-bold ${f.color === 'cyan' ? 'text-cyan-400/60' : 'text-amber-400/60'}`}>{f.price}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total Value - Inline */}
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">
              <span className="text-slate-500 line-through">$500/월</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">통합 제공</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* LIVE DEMO - Compact */}
      {/* ========================================= */}
      <section id="live-demo" className="py-16 px-6 bg-[#030508] border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
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

          {/* Ticker Grid - 4 columns for compactness */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["NVDA", "TSLA", "AAPL", "MSFT"].map((ticker) => (
              <TickerCard key={ticker} symbol={ticker} />
            ))}
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* FOOTER - Minimal */}
      {/* ========================================= */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/logo-signum.svg" alt="SIGNUM HQ" className="w-6 h-6" />
            <span className="font-bold text-sm text-white/60">SIGNUM HQ</span>
          </div>
          <p className="text-[10px] text-slate-600">© 2026 Market Signal Command</p>
        </div>
      </footer>
    </div>
  );
}
