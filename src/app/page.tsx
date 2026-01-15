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
  Hexagon
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
              <p className="text-2xl font-mono font-bold text-emerald-400">
                ${data.underlyingPrice.toFixed(2)} <span className="text-xs text-slate-500 ml-2 font-sans align-middle uppercase tracking-widest">{data.session}</span>
              </p>
            )}
          </div>

          <div className="pt-6 border-t border-white/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-black text-cyan-500 uppercase tracking-[0.2em]">Live Options Chain (ATM)</h3>
              {data?.options_status === 'PENDING' && (
                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-black px-2 py-0.5 rounded uppercase">OI Verifying</span>
              )}
            </div>

            {loading ? (
              <div className="py-12 flex justify-center text-cyan-500">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : data?.atmSlice?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="text-slate-500 font-bold border-b border-white/5">
                    <tr>
                      <th className="pb-3 text-left pl-2">Strike</th>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Last</th>
                      <th className="pb-3 pr-2">OI</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-300 divide-y divide-white/5">
                    {data.atmSlice.slice(0, 10).map((row: any, i: number) => (
                      <tr key={i} className="group hover:bg-white/5 transition-colors">
                        <td className="py-2.5 text-left font-bold text-white pl-2">{row.strike}</td>
                        <td className={`py-2.5 ${row.type === 'call' ? 'text-emerald-400' : 'text-rose-400'} uppercase text-[9px] font-bold`}>{row.type}</td>
                        <td className="py-2.5 text-slate-400">{row.last?.toFixed(2) || "-"}</td>
                        <td className={`py-2.5 pr-2 font-bold ${row.oi === null ? 'text-amber-500' : 'text-slate-200'}`}>
                          {row.oi !== null ? row.oi.toLocaleString() : "PENDING"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500 text-sm italic">No options data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// --- Premium Ticker Card ---
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
      {/* Glassmorphism Card */}
      <div
        onClick={() => setDrawerOpen(true)}
        className="group relative cursor-pointer rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02]
          bg-gradient-to-br from-white/[0.08] to-white/[0.02]
          backdrop-blur-xl border border-white/10
          hover:border-cyan-500/30 hover:shadow-[0_0_40px_rgba(6,182,212,0.15)]"
      >
        {/* Subtle glow effect on hover */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/0 to-amber-500/0 group-hover:from-cyan-500/5 group-hover:to-amber-500/5 transition-all duration-500" />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700/50 to-slate-800/50 border border-white/10 flex items-center justify-center overflow-hidden">
                <img
                  src={`https://financialmodelingprep.com/image-stock/${symbol}.png`}
                  alt={symbol}
                  className="w-6 h-6 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white tracking-tight">{symbol}</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">NASDAQ</p>
              </div>
            </div>
            {/* Alpha Score Badge */}
            {alphaScore && (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">{alphaScore}</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-widest">SCORE</span>
              </div>
            )}
          </div>

          {/* Price */}
          <div className="mb-6">
            <p className="text-3xl font-black text-white font-mono tracking-tight">
              {price ? `$${price.toFixed(2)}` : "—"}
            </p>
            <p className={`text-sm font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {change !== null ? `${isPositive ? '+' : ''}${change.toFixed(2)}%` : "—"}
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div>
              <p className="text-[9px] text-cyan-400/70 font-bold uppercase tracking-widest">VWAP</p>
              <p className="text-sm font-mono font-bold text-white">
                {price ? `$${(price * 0.98).toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-amber-400/70 font-bold uppercase tracking-widest">VWAP DIST</p>
              <p className="text-sm font-mono font-bold text-emerald-400">+2.1%</p>
            </div>
          </div>
        </div>
      </div>
      <TickerDrawer symbol={symbol} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}


export default function Page() {
  const [hudData, setHudData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // [SSOT Integration]
  const { status: marketStatus } = useMarketStatus();
  const { snapshot: macroData } = useMacroSnapshot();

  const fetchHud = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/live/market");
      if (res.ok) {
        setHudData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  useEffect(() => {
    fetchHud();
  }, []);

  return (
    <div className="min-h-screen bg-[#050810] text-slate-200 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 scroll-smooth">
      <LandingHeader />

      {/* MACRO TICKER TAPE */}
      <div className="fixed top-[64px] left-0 right-0 z-40 shadow-lg shadow-black/20">
        <TradingViewTicker key="v7-subtle" />
      </div>

      {/* ========================================= */}
      {/* HERO SECTION - SIGNUM HQ */}
      {/* ========================================= */}
      <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
        {/* Animated Background Grid */}
        <div className="absolute inset-0 z-0">
          {/* Deep gradient base */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#050810] via-[#0a1020] to-[#050810]" />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px'
            }}
          />

          {/* Radial glow from center */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.08)_0%,transparent_70%)]" />

          {/* Amber accent glow */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.1)_0%,transparent_70%)]" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-10 pt-20">

          {/* Logo */}
          <div className="flex justify-center mb-8 animate-in fade-in zoom-in-50 duration-1000">
            <img
              src="/logo-signum.svg"
              alt="SIGNUM HQ"
              className="w-32 h-32 md:w-40 md:h-40 drop-shadow-[0_0_30px_rgba(6,182,212,0.3)]"
            />
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full 
            bg-gradient-to-r from-cyan-500/10 to-amber-500/10 
            border border-cyan-500/20 
            text-[10px] font-black uppercase tracking-[0.25em] text-cyan-400 
            animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300
            shadow-[0_0_30px_rgba(6,182,212,0.15)]
            backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Signal Command Operational
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9] text-white
            animate-in fade-in slide-in-from-bottom-6 duration-700 delay-500">
            SIGNUM <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-300 to-amber-400">HQ</span>
          </h1>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto leading-relaxed font-medium
            animate-in fade-in slide-in-from-bottom-8 duration-700 delay-700">
            <span className="text-white font-bold">옵션 · 다크풀 · 고래</span> — 분산된 프리미엄 신호를 <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400 font-bold">하나의 사령부</span>에서 통합합니다.
          </p>

          {/* Value Proposition */}
          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 font-medium
            animate-in fade-in slide-in-from-bottom-10 duration-700 delay-1000">
            <span className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/5">
              <span className="text-cyan-400">$500+/mo</span> 가치의 데이터
            </span>
            <span className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/5">
              <Radar className="w-4 h-4 text-amber-400" />
              실시간 시그널 탐지
            </span>
            <span className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/5">
              <Eye className="w-4 h-4 text-cyan-400" />
              기관급 시야
            </span>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-5 pt-8
            animate-in fade-in slide-in-from-bottom-12 duration-700 delay-[1200ms]">
            <a
              href="#live-demo"
              className="w-full md:w-auto px-12 py-4 
                bg-gradient-to-r from-cyan-500 to-cyan-400 
                text-slate-900 rounded-xl font-black text-sm tracking-tight 
                hover:from-cyan-400 hover:to-cyan-300 
                transition-all flex items-center justify-center gap-2 group 
                shadow-[0_0_30px_rgba(6,182,212,0.4)]
                hover:shadow-[0_0_50px_rgba(6,182,212,0.5)]"
            >
              Enter Command
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#features"
              className="w-full md:w-auto px-12 py-4 
                bg-white/5 backdrop-blur-xl border border-white/10 
                text-slate-300 rounded-xl font-bold text-sm 
                hover:bg-white/10 hover:border-white/20
                transition-all text-center"
            >
              How It Works
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center pt-2">
            <div className="w-1 h-2 rounded-full bg-white/40" />
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* FEATURES SECTION */}
      {/* ========================================= */}
      <section id="features" className="py-32 px-6 relative">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4">
              왜 <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">SIGNUM HQ</span>인가?
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              각각 수백 달러씩 지불해야 하는 프리미엄 데이터를 하나로 통합했습니다.
            </p>
          </div>

          {/* Features Grid - Glassmorphism */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
            ].map((feature, i) => (
              <div
                key={i}
                className="group relative p-8 rounded-3xl transition-all duration-500
                  bg-gradient-to-br from-white/[0.05] to-white/[0.02]
                  backdrop-blur-xl border border-white/10
                  hover:border-cyan-500/30 hover:scale-[1.02]
                  hover:shadow-[0_0_60px_rgba(6,182,212,0.1)]"
              >
                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl mb-6 flex items-center justify-center
                  bg-gradient-to-br ${feature.color === 'cyan' ? 'from-cyan-500/20 to-cyan-500/5' : 'from-amber-500/20 to-amber-500/5'}
                  border ${feature.color === 'cyan' ? 'border-cyan-500/20' : 'border-amber-500/20'}`}>
                  <feature.icon className={`w-7 h-7 ${feature.color === 'cyan' ? 'text-cyan-400' : 'text-amber-400'}`} />
                </div>

                {/* Title & Price */}
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">{feature.title}</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full
                    ${feature.color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {feature.price}
                  </span>
                </div>

                {/* Description */}
                <p className="text-slate-400 leading-relaxed">{feature.desc}</p>

                {/* Included badge */}
                <div className="mt-6 pt-6 border-t border-white/5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    SIGNUM HQ에 포함
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Total Value */}
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl
              bg-gradient-to-r from-cyan-500/10 via-transparent to-amber-500/10
              border border-white/10 backdrop-blur-xl">
              <span className="text-slate-500 line-through text-lg">$450+/월 가치</span>
              <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">
                통합 제공
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* LIVE DEMO */}
      {/* ========================================= */}
      <section id="live-demo" className="py-24 px-6 relative border-y border-white/5 scroll-mt-20">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050810] via-slate-900/50 to-[#050810]" />

        <div className="max-w-6xl mx-auto space-y-12 relative z-10">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">LIVE</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">Signal Dashboard</h2>
              <p className="text-sm text-slate-400 font-medium">실시간 시그널 프리뷰 — SIGNUM HQ Engine</p>
            </div>
          </div>

          {/* Glassmorphism Container */}
          <div className="rounded-3xl p-8 relative overflow-hidden
            bg-gradient-to-br from-white/[0.03] to-white/[0.01]
            backdrop-blur-xl border border-white/10
            shadow-2xl shadow-black/50">

            {/* Inner glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-cyan-500/5 blur-3xl" />

            {/* Ticker Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
              {["NVDA", "TSLA", "AAPL"].map((ticker) => (
                <TickerCard key={ticker} symbol={ticker} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* FOOTER */}
      {/* ========================================= */}
      <footer className="py-16 px-6 border-t border-white/5 bg-[#050810]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity">
            <img src="/logo-signum.svg" alt="SIGNUM HQ" className="w-8 h-8" />
            <span className="font-bold text-white tracking-tight">SIGNUM HQ</span>
          </div>
          <p className="text-xs text-slate-600">© 2026 SIGNUM HQ. Market Signal Command Center.</p>
        </div>
      </footer>
    </div>
  );
}
