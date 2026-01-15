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
  Radar
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
        }
      })
      .catch(() => { });
  }, [symbol]);

  const isPositive = (change ?? 0) >= 0;

  return (
    <>
      <div
        onClick={() => setDrawerOpen(true)}
        className="group cursor-pointer p-4 rounded-lg transition-all duration-200
          bg-[#0a1628] hover:bg-[#0d1d35] border border-white/5 hover:border-cyan-500/30"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-white/10 flex items-center justify-center overflow-hidden">
            <img src={`https://financialmodelingprep.com/image-stock/${symbol}.png`} alt={symbol} className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">{symbol}</h3>
            <p className="text-[10px] text-slate-500">NASDAQ</p>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div className="h-8 w-16 flex items-end gap-0.5">
            {/* Mini chart placeholder */}
            <div className={`w-1 rounded-t ${isPositive ? 'bg-cyan-500/60' : 'bg-rose-500/60'}`} style={{ height: '40%' }} />
            <div className={`w-1 rounded-t ${isPositive ? 'bg-cyan-500/60' : 'bg-rose-500/60'}`} style={{ height: '60%' }} />
            <div className={`w-1 rounded-t ${isPositive ? 'bg-cyan-500/60' : 'bg-rose-500/60'}`} style={{ height: '45%' }} />
            <div className={`w-1 rounded-t ${isPositive ? 'bg-cyan-500/60' : 'bg-rose-500/60'}`} style={{ height: '80%' }} />
            <div className={`w-1 rounded-t ${isPositive ? 'bg-cyan-500' : 'bg-rose-500'}`} style={{ height: '100%' }} />
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
        </div>
      </div>
      <TickerDrawer symbol={symbol} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}


export default function Page() {
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
      <section className="relative pt-20 pb-8 px-6">
        {/* Content */}
        <div className="max-w-4xl mx-auto text-center space-y-5">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full 
            bg-cyan-500/10 border border-cyan-500/20 
            text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            실시간 미국 마켓 데이터
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] text-white">
            MARKET LOGIC,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">SOLVED.</span>
          </h1>

          {/* Tagline */}
          <p className="text-sm md:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            기관의 <span className="text-white font-semibold">다크풀</span> 움직임과 알고리즘
            <span className="text-white font-semibold"> 옵션 플로우</span>를 실시간으로 추적하세요.
            <span className="text-cyan-400 font-semibold"> 미국 주식 시장</span>을 위한 궁극의 사령부.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <a href="/ticker?ticker=NVDA"
              className="px-10 py-3.5 bg-gradient-to-r from-cyan-500 to-cyan-400 
                text-slate-900 rounded-full font-bold text-sm 
                hover:from-cyan-400 hover:to-cyan-300 transition-all 
                flex items-center gap-2 shadow-[0_0_30px_rgba(6,182,212,0.4)]">
              Enter Command <ArrowRight size={16} />
            </a>
            <a href="#features"
              className="px-10 py-3.5 bg-[#0a1628] border border-white/10 
                text-slate-300 rounded-full font-medium text-sm hover:bg-white/5 transition-all">
              How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Decorative Separator - Radar Signal */}
      <div className="flex justify-center py-6">
        <svg width="60" height="30" viewBox="0 0 60 30" className="text-cyan-500/30">
          <path d="M10,25 Q30,5 50,25" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="30" cy="10" r="3" fill="currentColor" className="animate-pulse" />
        </svg>
      </div>

      {/* ========================================= */}
      {/* FEATURES SECTION */}
      {/* ========================================= */}
      <section id="features" className="py-14 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
              왜 <span className="text-cyan-400">SIGNUM HQ</span>인가?
            </h2>
            <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">
              $450+/월 가치의 프리미엄 데이터 통합
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Gamma */}
            <div className="relative p-5 rounded-xl bg-[#0a1628] border border-white/5 overflow-hidden group hover:border-cyan-500/20 transition-all">
              {/* Watermark Icon */}
              <div className="absolute -right-6 -bottom-6 opacity-[0.06] group-hover:opacity-[0.1] transition-opacity">
                <Waves className="w-32 h-32 text-cyan-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Waves className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                    $200/mo 가치
                  </span>
                </div>

                <h3 className="text-base font-bold text-white mb-2">감마 익스포져 분석</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  MM의 감마 익스포져를 추적하여 가격 자석(Max Pain)과 저항선을 식별. 기관급 데이터 시각화.
                </p>

                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  SIGNUM HQ에 포함
                </span>
              </div>
            </div>

            {/* Card 2: Dark Pool */}
            <div className="relative p-5 rounded-xl bg-[#0a1628] border border-white/5 overflow-hidden group hover:border-amber-500/20 transition-all">
              {/* Watermark Icon */}
              <div className="absolute -right-6 -bottom-6 opacity-[0.06] group-hover:opacity-[0.1] transition-opacity">
                <Eye className="w-32 h-32 text-amber-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Eye className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                    $150/mo 가치
                  </span>
                </div>

                <h3 className="text-base font-bold text-white mb-2">다크풀 & 고래 추적</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  일반 거래소에 보이지 않는 대형 블록 트레이드와 기관 매집을 실시간 탐지. 스마트 머니를 따라가세요.
                </p>

                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  SIGNUM HQ에 포함
                </span>
              </div>
            </div>

            {/* Card 3: 3-Day Sniper */}
            <div className="relative p-5 rounded-xl bg-[#0a1628] border border-white/5 overflow-hidden group hover:border-cyan-500/20 transition-all">
              {/* Watermark Icon */}
              <div className="absolute -right-6 -bottom-6 opacity-[0.06] group-hover:opacity-[0.1] transition-opacity">
                <Radar className="w-32 h-32 text-cyan-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Radar className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                    $100/mo 가치
                  </span>
                </div>

                <h3 className="text-base font-bold text-white mb-2">3일 스나이퍼 시그널</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  모멘텀, 수급, 기술적 조건이 정렬된 '3일 급등 후보' 자동 스캔. 고확률 진입 타이밍 포착.
                </p>

                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  SIGNUM HQ에 포함
                </span>
              </div>
            </div>
          </div>

          {/* Consolidated Pricing Badge */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500/10 to-cyan-500/10 border border-amber-500/20">
              <span className="text-sm text-slate-500 line-through">$450+/월</span>
              <span className="text-sm font-bold text-amber-400">통합 제공</span>
            </div>
          </div>
        </div>
      </section>

      {/* Decorative Separator - Signal Wave */}
      <div className="flex justify-center py-8">
        <svg width="80" height="40" viewBox="0 0 80 40" className="text-cyan-500/20">
          <path d="M5,35 Q20,10 40,20 T75,10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="40" cy="20" r="4" fill="currentColor" className="animate-pulse opacity-60" />
          <circle cx="60" cy="15" r="2" fill="currentColor" className="opacity-40" />
        </svg>
      </div>

      {/* ========================================= */}
      {/* LIVE DASHBOARD */}
      {/* ========================================= */}
      <section id="live-demo" className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">LIVE FEED</span>
              </div>
              <h2 className="text-xl font-black text-white">Signal Dashboard</h2>
            </div>
            <a href="/watchlist" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold">
              View All <ChevronRight size={14} />
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
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-gradient-to-b from-cyan-400 to-amber-500 rounded-full" />
            <span className="font-bold text-sm text-white/60">SIGNUM HQ</span>
          </div>
          <p className="text-[10px] text-slate-600">© 2026 Market Signal Command</p>
        </div>
      </footer>
    </div>
  );
}
