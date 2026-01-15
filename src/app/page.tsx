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
      <div className="relative w-full max-w-md bg-[#0a1628] h-full shadow-2xl border-l border-white/10 p-6 overflow-y-auto">
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

// --- Ticker Card ---
function TickerCard({ symbol }: { symbol: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setDrawerOpen(true)}
        className="group cursor-pointer p-4 rounded-xl transition-all duration-200
          bg-[#0d1829] hover:bg-[#111f36] border border-[#1a2942] hover:border-cyan-500/30"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-[#0a1420] border border-[#1a2942] flex items-center justify-center overflow-hidden">
            <img src={`https://financialmodelingprep.com/image-stock/${symbol}.png`} alt={symbol} className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">{symbol}</h3>
            <p className="text-[10px] text-slate-500">NASDAQ</p>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div className="h-6 flex items-end gap-0.5">
            <div className="w-1 rounded-t bg-cyan-500/50" style={{ height: '40%' }} />
            <div className="w-1 rounded-t bg-cyan-500/50" style={{ height: '60%' }} />
            <div className="w-1 rounded-t bg-cyan-500/60" style={{ height: '50%' }} />
            <div className="w-1 rounded-t bg-cyan-500/70" style={{ height: '80%' }} />
            <div className="w-1 rounded-t bg-cyan-500" style={{ height: '100%' }} />
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
    <div className="min-h-screen bg-[#060a12] text-slate-200 font-sans">
      <LandingHeader />

      {/* MACRO TICKER TAPE */}
      <div className="fixed top-[48px] left-0 right-0 z-40">
        <TradingViewTicker key="v7-subtle" />
      </div>

      {/* ========================================= */}
      {/* HERO SECTION */}
      {/* ========================================= */}
      {/* ========================================= */}
      {/* HERO SECTION */}
      {/* ========================================= */}
      <section className="relative pt-32 pb-16 px-6 overflow-hidden">
        {/* Background Glow Effect - Exact Match */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Top Center glow - Cyan/Teal mix */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-radial from-[#083344] via-transparent to-transparent blur-[100px] opacity-60" />
          {/* Detailed accent glow behind text */}
          <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-radial from-[#0c4a6e]/40 via-transparent to-transparent blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Live Badge - Exact Match */}
          <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full 
            bg-transparent border border-[#d97706]/30
            shadow-[0_0_15px_rgba(217,119,6,0.15)]
            text-[11px] font-bold uppercase tracking-[0.2em] text-[#fbbf24] mb-12">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
            실시간 미국 마켓 데이터
          </div>

          {/* Main Headline - Exact Match */}
          <h1 className="text-6xl md:text-[5.5rem] font-black italic tracking-tighter leading-[0.9] mb-10 drop-shadow-2xl">
            <span className="block text-white mb-2">MARKET LOGIC,</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] via-[#fcd34d] to-[#10b981]">SOLVED.</span>
          </h1>

          {/* Tagline - Exact Match */}
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed mb-12 tracking-wide font-medium">
            기관의 <span className="text-white font-bold">다크풀</span> 움직임과 알고리즘
            <span className="text-white font-bold"> 옵션 플로우</span>를 실시간으로 추적하세요.<br />
            <span className="text-[#fbbf24] font-bold">미국 주식 시장</span>을 위한 궁극의 사령부.
          </p>

          {/* CTA Buttons - Exact Match */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <a href="/ticker?ticker=NVDA"
              className="group px-10 py-4 bg-gradient-to-r from-[#d97706] to-[#b45309]
                text-black rounded-md font-extrabold text-sm uppercase tracking-wider
                hover:brightness-110 transition-all 
                flex items-center gap-2 shadow-[0_0_40px_rgba(217,119,6,0.3)] border border-[#f59e0b]/20">
              Enter Command <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a href="#features"
              className="px-10 py-4 bg-[#0a1628]/50 border border-[#1e293b] 
                text-[#38bdf8] rounded-md font-bold text-sm uppercase tracking-wider 
                hover:bg-[#0a1628] hover:border-[#38bdf8]/30 transition-all">
              View Demo
            </a>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* FEATURES SECTION */}
      {/* ========================================= */}
      <section id="features" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-3">
              왜 <span className="text-cyan-400">SIGNUM HQ</span>인가?
            </h2>
            <p className="text-[11px] text-slate-500 uppercase tracking-[0.25em]">
              $450+/월 가치의 프리미엄 데이터 통합
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1 */}
            <div className="relative p-6 rounded-2xl bg-[#0d1829] border border-[#1a2942] overflow-hidden group hover:border-cyan-500/30 transition-all duration-300">
              <div className="absolute -right-8 -bottom-8 opacity-[0.05] group-hover:opacity-[0.08] transition-opacity">
                <Waves className="w-36 h-36 text-cyan-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <Waves className="w-6 h-6 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg">
                    $200/mo 가치
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-3">감마 익스포져 분석</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-5">
                  MM의 감마 익스포져를 추적하여 가격 자석(Max Pain)과 저항선을 식별. 기관급 데이터 시각화.
                </p>

                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  SIGNUM HQ에 포함
                </span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="relative p-6 rounded-2xl bg-[#0d1829] border border-[#1a2942] overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
              <div className="absolute -right-8 -bottom-8 opacity-[0.05] group-hover:opacity-[0.08] transition-opacity">
                <Eye className="w-36 h-36 text-amber-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-amber-400" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg">
                    $150/mo 가치
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-3">다크풀 & 고래 추적</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-5">
                  일반 거래소에 보이지 않는 대형 블록 트레이드와 기관 매집을 실시간 탐지. 스마트 머니를 따라가세요.
                </p>

                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  SIGNUM HQ에 포함
                </span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="relative p-6 rounded-2xl bg-[#0d1829] border border-[#1a2942] overflow-hidden group hover:border-cyan-500/30 transition-all duration-300">
              <div className="absolute -right-8 -bottom-8 opacity-[0.05] group-hover:opacity-[0.08] transition-opacity">
                <Radar className="w-36 h-36 text-cyan-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <Radar className="w-6 h-6 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg">
                    $100/mo 가치
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-3">3일 스나이퍼 시그널</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-5">
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
          <div className="mt-12 flex justify-center">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#0d1829] border border-[#1a2942]">
              <span className="text-sm text-slate-500 line-through">$450+/월</span>
              <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">Consolidated Pricing</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================= */}
      {/* LIVE DASHBOARD */}
      {/* ========================================= */}
      <section id="live-demo" className="py-14 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {["NVDA", "TSLA", "AAPL", "MSFT"].map((ticker) => (
              <TickerCard key={ticker} symbol={ticker} />
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 px-6 border-t border-[#1a2942]">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 48 48" className="text-cyan-400">
              <path d="M24 4 L42 14 L42 34 L24 44 L6 34 L6 14 Z" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60" />
              <circle cx="24" cy="24" r="3" fill="currentColor" />
            </svg>
            <span className="font-bold text-sm text-white/60">SIGNUM HQ</span>
          </div>
          <div className="flex items-center gap-6 text-[10px] text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-[10px] text-slate-600">© 2026 Market Signal Command</p>
        </div>
      </footer>
    </div>
  );
}
