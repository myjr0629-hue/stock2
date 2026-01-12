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
  Target
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
              <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em]">Live Options Chain (ATM)</h3>
              {data?.options_status === 'PENDING' && (
                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-black px-2 py-0.5 rounded uppercase">OI Verifying</span>
              )}
            </div>

            {loading ? (
              <div className="py-12 flex justify-center text-emerald-500">
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

// --- Ticker Card Component ---
function TickerCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [grade, setGrade] = useState<"A" | "B" | "C">("C");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setRefreshing(true);
      const res = await fetch(`/api/live/ticker?t=${symbol}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setGrade(json.sourceGrade);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const price = data?.price;
  const changePct = data?.changePct;
  const isUp = (changePct || 0) >= 0;
  const vwapDiff = (price && data?.vwap) ? ((price - data.vwap) / data.vwap * 100) : null;

  // Static Placeholders for Demo (replaced by live data per card)
  const scoreMap: any = { NVDA: 78.4, TSLA: 72.1, AAPL: 68.9 };

  return (
    <>
      <div
        onClick={() => setDrawerOpen(true)}
        className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 hover:bg-slate-800/60 hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)] transition-all group flex flex-col justify-between h-[380px] cursor-pointer relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
          <Target size={100} className="text-emerald-500" />
        </div>

        <div className="space-y-6 relative z-10">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-3xl font-black tracking-tight text-white group-hover:text-emerald-400 transition-colors">{symbol}</h3>
                <button onClick={fetchData} disabled={refreshing} className="text-slate-600 hover:text-emerald-400 transition-colors">
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                </button>
              </div>
              <p className="text-sm font-mono text-slate-400 flex items-center gap-2">
                {price ? `$${price.toFixed(2)}` : "—"}
                {typeof changePct === 'number' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    {isUp ? "+" : ""}{changePct.toFixed(2)}%
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              {/* Score Circle Concept */}
              <div className="relative flex items-center justify-center w-12 h-12 rounded-full border-2 border-emerald-500/20 group-hover:border-emerald-500 transition-colors">
                <span className="text-lg font-black text-white">{scoreMap[symbol] || "-"}</span>
              </div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 text-center">Score</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[11px] font-bold uppercase tracking-tight pt-4 border-t border-white/5">
            <div className="space-y-1">
              <p className="text-slate-500 font-black">VWAP</p>
              <p className="text-emerald-400 font-mono">
                {data?.vwap ? `$${data.vwap.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-slate-500 font-black">VWAP Dist</p>
              <p className={`${(vwapDiff || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {vwapDiff !== null ? (vwapDiff > 0 ? `+${vwapDiff.toFixed(2)}%` : `${vwapDiff.toFixed(2)}%`) : "—"}
              </p>
            </div>

          </div>

        </div>

        <div className="space-y-3 pt-6 mt-auto border-t border-white/5 relative z-10">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <p className="text-[9px] text-rose-500 font-black uppercase tracking-widest">Hard Stop</p>
              <p className="text-xs font-mono font-bold text-rose-400/80">
                {price ? `$${(price * 0.95).toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Target</p>
              <p className="text-xs font-mono font-bold text-emerald-400/80">
                {price ? `$${(price * 1.1).toFixed(2)}` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div >
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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 scroll-smooth">
      <LandingHeader />

      {/* 0) MACRO TICKER TAPE (Moved below header as requested) */}
      <div className="fixed top-[64px] left-0 right-0 z-40 shadow-lg shadow-black/20">
        <TradingViewTicker key="v7-subtle" />
      </div>

      {/* 1) HERO SECTION */}
      <section className="relative pt-48 pb-24 px-6 overflow-hidden">
        {/* Background Elements (Luxury / Cinematic) */}
        {/* Background Elements (Luxury / Cinematic) - VISIBILITY TEST MODE */}
        {/* Background Elements - FIXED Z-INDEX & RESTORED LOGOS */}
        {/* z-0 ensures it sits above the root background but below content (z-10) */}
        {/* Background Elements - TIGHT CLUSTER & DARKENED FOR READABILITY */}
        {/* z-0 ensures it sits above the root background but below content (z-10) */}
        <div className="absolute inset-0 z-0 select-none pointer-events-none">
          <img
            src="/us_tech_logos_tight.png?v=1"
            alt="US Tech Logos Atmosphere"
            className="w-full h-full object-cover opacity-40"
          />
          {/* Gradient Overlay for Text Readability - Stronger Scrim */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/40 to-slate-950 h-full mix-blend-multiply" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020617_100%)] opacity-90" />
        </div>

        {/* Content Container - Z-10 to sit ABOVE background */}
        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 animate-in fade-in slide-in-from-bottom-2 duration-700 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Activity size={12} />
            Alpha V2 Engine Restored
          </div>

          <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9] text-white">
            MARKET LOGIC, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">SOLVED.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            3일 스나이퍼 전략을 위한 유일한 커맨드 센터. <br className="hidden md:block" />
            <span className="text-slate-200 font-bold">옵션(Gamma) · 수급(Flow) · 매크로(Regime)</span>를 하나로 통합합니다.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-5 pt-6">
            <a
              href="#live-demo"
              className="w-full md:w-auto px-10 py-4 bg-white text-slate-900 rounded-xl font-black text-sm tracking-tight hover:bg-slate-200 transition-all flex items-center justify-center gap-2 group shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              Start Command
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#features"
              className="w-full md:w-auto px-10 py-4 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-bold text-sm hover:bg-white/10 transition-all text-center backdrop-blur-md"
            >
              Engine Logic
            </a>
          </div>

          {/* Unique Selling Points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-4xl mx-auto pt-16 border-t border-white/5 mt-16">
            {[
              { title: "Gamma Levels", desc: "MM이 방어해야 하는 Call Wall/Put Floor 가격대 식별", icon: ShieldCheck, color: "text-indigo-400" },
              { title: "Flow Sniper", desc: "단순 거래량이 아닌 '3일 내 승부'를 보는 고래들의 베팅(Net Premium) 추적", icon: Target, color: "text-rose-400" },
              { title: "Macro Gate", desc: "금리/공포 지수가 임계치를 넘으면 '진입 금지' 신호 발동", icon: Lock, color: "text-amber-400" }
            ].map((feature, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                <div className={`w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center ${feature.color} border border-white/5`}>
                  <feature.icon size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">{feature.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2) LIVE DEMO */}
      <section id="live-demo" className="py-24 px-6 bg-slate-900/50 relative border-y border-white/5 scroll-mt-20">
        <div className="max-w-6xl mx-auto space-y-12 relative z-10">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight text-white">TACTICAL MAP (LIVE)</h2>
              <p className="text-sm text-slate-400 font-medium">시스템 연동 실시간 프리뷰 (Alpha V2 Engine)</p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-8 border border-white/5 relative overflow-hidden shadow-2xl shadow-black/50">
            {/* Macro HUD Row */}


            {/* Ticker Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {["NVDA", "TSLA", "AAPL"].map((ticker) => (
                <TickerCard key={ticker} symbol={ticker} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 22h20L12 2z" className="text-slate-600 transition-colors" strokeWidth="1.5" />
              <path d="M12 6l-6 16h12l-6-16" stroke="currentColor" />
              <path d="M12 11h.01" stroke="currentColor" strokeWidth="3" />
            </svg>
            <span className="font-bold text-slate-300">ALPHA V2</span>
          </div>
          <p className="text-xs text-slate-600">© 2025 Alpha Engine. Tier 1.5 Intelligence.</p>
        </div>
      </footer>
    </div>
  );
}
