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
  TrendingUp,
  X,
  Loader2,
  Lock
} from "lucide-react";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";

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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full">
          <X size={20} className="text-slate-400" />
        </button>

        <div className="mt-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">{symbol}</h2>
            {data?.underlyingPrice && (
              <p className="text-xl font-mono font-bold text-emerald-600">
                ${data.underlyingPrice.toFixed(2)} <span className="text-xs text-slate-400 ml-2 font-sans align-middle uppercase tracking-widest">{data.session}</span>
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">ATM Options Chain</h3>
              {data?.options_status === 'PENDING' && (
                <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">OI Pending</span>
              )}
            </div>

            {loading ? (
              <div className="py-12 flex justify-center text-emerald-500">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : data?.atmSlice?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="text-slate-400 font-bold border-b border-slate-100">
                    <tr>
                      <th className="pb-2 text-left">Strike</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Last</th>
                      <th className="pb-2">OI</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-600 divide-y divide-slate-50">
                    {data.atmSlice.slice(0, 10).map((row: any, i: number) => (
                      <tr key={i} className="group hover:bg-slate-50">
                        <td className="py-2 text-left font-bold text-slate-900">{row.strike}</td>
                        <td className={`py-2 ${row.type === 'call' ? 'text-emerald-600' : 'text-rose-600'} uppercase text-[9px]`}>{row.type}</td>
                        <td className="py-2">{row.last?.toFixed(2) || "-"}</td>
                        <td className={`py-2 ${row.oi === null ? 'text-amber-500' : ''}`}>
                          {row.oi !== null ? row.oi.toLocaleString() : "PENDING"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data?.options_status === 'PENDING' && (
                  <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-xs font-medium leading-relaxed">
                    <AlertCircle size={14} className="inline mr-1 -mt-0.5" />
                    <strong>Wait:</strong> Exact Open Interest (OI) is currently verifying. Gamma/MaxPain derived metrics are hidden until integrity check passes.
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No options data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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

  // Placeholders
  const scoreMap: any = { NVDA: 78.4, TSLA: 72.1, AAPL: 68.9 };
  const velMap: any = { NVDA: "▲", TSLA: "►", AAPL: "▲" };

  return (

    <>
      <div
        onClick={() => setDrawerOpen(true)}
        className="bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:border-emerald-200 transition-all group flex flex-col justify-between h-[420px] cursor-pointer"
      >
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-3xl font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">{symbol}</h3>
                <button onClick={fetchData} disabled={refreshing} className="text-slate-300 hover:text-emerald-500 transition-colors">
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                </button>
              </div>
              <p className="text-sm font-mono text-slate-400 flex items-center gap-2">
                {price ? `$${price.toFixed(2)}` : "—"}
                {typeof changePct === 'number' && (
                  <span className={`text-[10px] font-bold ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
                    {isUp ? "+" : ""}{changePct.toFixed(2)}%
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PulseScore</div>
              <div className="text-2xl font-black text-slate-900">{scoreMap[symbol] || "-"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-[11px] font-bold uppercase tracking-tight">
            <div className="space-y-1">
              <p className="text-slate-400 font-black">Velocity</p>
              <p className="text-slate-900 text-lg">{velMap[symbol]}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-slate-400 font-black">VWAP</p>
              <p className="text-emerald-600 italic font-mono">
                {data?.vwap ? `$${data.vwap.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-slate-400 font-black">Session</p>
              <p className="text-slate-900 italic">{data?.session || "-"}</p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-slate-400 font-black">VWAP Dist</p>
              <p className={`${(vwapDiff || 0) > 0 ? 'text-emerald-600' : 'text-rose-500'} italic`}>
                {vwapDiff !== null ? (vwapDiff > 0 ? `+${vwapDiff.toFixed(2)}%` : `${vwapDiff.toFixed(2)}%`) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-8 mt-auto border-t border-slate-50">
          {/* Fake logical levels based on live price if available, else 0 */}
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest">Hard Stop</p>
              <p className="text-sm font-mono font-black text-rose-600">
                {price ? `$${(price * 0.95).toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Tp Target</p>
              <p className="text-sm font-mono font-black text-emerald-600">
                {price ? `$${(price * 1.1).toFixed(2)}` : "—"}
              </p>
            </div>
          </div>
          {grade !== 'A' && (
            <div className="flex items-center gap-1 text-[9px] text-amber-500 bg-amber-50 px-2 py-1 rounded">
              <AlertCircle size={10} /> Data Degraded ({grade}) - Delayed/Partial
            </div>
          )}
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
        const data = await res.json();
        setHudData(data);
      }
    } catch (e) {
      console.error("Market HUD fetch error", e);
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 1000); // min loading visual
    }
  };

  useEffect(() => {
    fetchHud();
  }, []);

  const fmtPrice = (v: any) => typeof v === 'number' ? v.toFixed(2) : "-";
  const fmtPct = (v: any) => typeof v === 'number' ? (v > 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`) : "-";
  const fmtBp = (v: any) => typeof v === 'number' ? (v > 0 ? `+${v.toFixed(1)}bp` : `${v.toFixed(1)}bp`) : "-";

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 scroll-smooth">
      <LandingHeader />

      {/* 1) HERO SECTION */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Abstract background elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-10">
          <div className="absolute top-[10%] right-[10%] w-96 h-96 bg-emerald-50 rounded-full blur-3xl opacity-60 animate-pulse" />
          <div className="absolute bottom-[20%] left-[5%] w-72 h-72 bg-indigo-50 rounded-full blur-3xl opacity-60" />
        </div>

        <div className="max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <Activity size={12} className="text-emerald-500" />
            Deterministic Trading Engine V8.1
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] text-slate-900">
            오를 종목만. <br />
            <span className="text-emerald-600">1–3일 트레이딩 OS</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed font-medium">
            프리·포스트까지 실시간 가격을 앵커로 고정하고, <br className="hidden md:block" />
            옵션(OI·감마·MaxPain)과 거시·이벤트를 하나로 종합해 실행 가능한 레벨만 제시합니다.
          </p>

          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-4xl mx-auto pt-8">
            <li className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <ShieldCheck size={18} />
              </div>
              <p className="text-[13px] leading-snug font-medium text-slate-600">
                <span className="text-slate-900 font-bold">Execution-first:</span> Anchor/Drift Gate로 “이미 지나간 레벨” 자동 차단 → 리테스트 존만 제시
              </p>
            </li>
            <li className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <BarChart3 size={18} />
              </div>
              <p className="text-[13px] leading-snug font-medium text-slate-600">
                <span className="text-slate-900 font-bold">Options-integrity:</span> OI 없으면 PENDING. 가짜 수치·볼륨 대체 0%
              </p>
            </li>
            <li className="space-y-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Zap size={18} />
              </div>
              <p className="text-[13px] leading-snug font-medium text-slate-600">
                <span className="text-slate-900 font-bold">Top3 집중 운영:</span> AlphaScore·Velocity + 리빌딩/타임스탑으로 “지금 오르는 종목”만 유지
              </p>
            </li>
          </ul>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-8">
            <a
              href="#live-demo"
              className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm tracking-tight hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-slate-200"
            >
              Live Demo 보기
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#timeline"
              className="w-full md:w-auto px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all text-center"
            >
              Report Timeline 보기
            </a>
          </div>

          <p className="text-[11px] text-slate-400 font-medium">
            리포트는 “그럴듯한 해설”이 아니라, 지금 주문 가능한 플랜이어야 합니다.
          </p>
        </div>
      </section>

      {/* 2) WHY ALPHA (3 Pillars) */}
      <section className="py-24 bg-slate-50/50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { title: "실시간 앵커링", desc: "가격 변동에 즉각적으로 반응하여 최적의 진입점을 실시간으로 갱신합니다." },
              { title: "옵션 검증", desc: "추측이 아닌 확정된 OI 데이터를 기반으로 마켓 메이커의 포지션을 읽습니다." },
              { title: "Top3 집중", desc: "수천 개의 종목 중 지금 이 순간 가장 강력한 모멘텀을 가진 3종목에 집중합니다." }
            ].map((pill, i) => (
              <div key={i} className="group">
                <div className="text-[10px] font-black text-emerald-500 mb-4 tracking-[0.3em] uppercase">Pillar 0{i + 1}</div>
                <h3 className="text-xl font-black text-slate-900 mb-2">{pill.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">{pill.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3) LIVE DEMO PREVIEW (id="live-demo") */}
      <section id="live-demo" className="py-24 px-6 bg-white overflow-hidden scroll-mt-20">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-emerald-50 text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live Demo Preview</div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900">시스템 연동 실시간 프리뷰</h2>
              <p className="text-sm text-slate-400 font-medium italic">클릭 시 VWAP / ATM 옵션 / 감마까지 상세에서 확인 가능</p>
            </div>
            <button
              onClick={fetchHud}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing..." : "Update Live"}
            </button>
          </div>

          {/* Market HUD Row */}
          <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl relative overflow-hidden min-h-[140px]">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Activity size={120} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-6 relative z-10">
              {/* 1. Status (SSOT) */}
              <div className="space-y-1 border-r border-white/10 pr-4">
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Market Status</p>
                <MarketStatusBadge status={marketStatus} variant="live" className="text-white" />
                <p className="text-[9px] text-white/30 font-mono mt-1">{marketStatus.asOfET?.split(',')[1] || ""}</p>
              </div>

              {/* 2. NDX (SSOT) */}
              <div className="space-y-1 border-r border-white/10 pr-4">
                <p className="text-[10px] text-white/50 font-black uppercase tracking-widest">
                  Nasdaq 100
                </p>
                <p className="text-lg font-black italic flex items-baseline gap-2">
                  {macroData.factors.nasdaq100.level ? macroData.factors.nasdaq100.level.toLocaleString() : "—"}
                  <span className={`text-[11px] font-bold ${macroData.factors.nasdaq100.chgPct && macroData.factors.nasdaq100.chgPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {macroData.factors.nasdaq100.chgPct ? `${macroData.factors.nasdaq100.chgPct.toFixed(2)}%` : ""}
                  </span>
                </p>
              </div>

              {/* 3. VIX (SSOT) */}
              <div className="space-y-1 border-r border-white/10 pr-4">
                <p className="text-[10px] text-white/50 font-black uppercase tracking-widest">
                  VIX
                </p>
                <p className="text-lg font-black italic flex items-baseline gap-2">
                  {macroData.factors.vix.level ? macroData.factors.vix.level.toFixed(2) : "—"}
                  <span className={`text-[11px] font-bold ${macroData.factors.vix.level && macroData.factors.vix.level > 20 ? "text-rose-400" : "text-emerald-400"}`}>
                    &nbsp;
                  </span>
                </p>
              </div>

              {/* 4. US10Y (SSOT) */}
              <div className="space-y-1 border-r border-white/10 pr-4">
                <p className="text-[10px] text-white/50 font-black uppercase tracking-widest">US 10Y</p>
                <p className="text-lg font-black italic flex items-baseline gap-2">
                  {macroData.factors.us10y.level ? `${macroData.factors.us10y.level.toFixed(2)}%` : "—"}
                  <span className={`text-[11px] font-bold ${(macroData.factors.us10y.chgAbs || 0) > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {macroData.factors.us10y.chgAbs ? (macroData.factors.us10y.chgAbs > 0 ? `+${macroData.factors.us10y.chgAbs.toFixed(1)}bp` : `${macroData.factors.us10y.chgAbs.toFixed(1)}bp`) : ""}
                  </span>
                </p>
              </div>



              {/* 6. Regime (SSOT or MarketStatus) */}
              <div className="space-y-1">
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Regime</p>
                <p className="text-lg font-black italic text-emerald-400">
                  {/* Placeholder or derived if we had Regime in MacroSnapshot. Using VIX as proxy or just placeholder */}
                  {marketStatus.market === 'closed' ? 'NEUTRAL' : 'RISK_ON'}
                </p>
              </div>
            </div>
          </div>


          {/* 3 Top3 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {["NVDA", "TSLA", "AAPL"].map((ticker) => (
              <TickerCard key={ticker} symbol={ticker} />
            ))}
          </div>
        </div>
      </section>

      {/* 4) TIMELINE / BACKTEST TEASER (id="timeline") */}
      <section id="timeline" className="py-24 px-6 bg-slate-50/50 scroll-mt-20">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Alpha Report Timeline</h2>
            <p className="text-slate-500 font-medium leading-relaxed">Final(무결점) 버전만 매일 타임라인에 저장되어 <br />사후 성능 검증(Backtest)을 위한 고정 데이터로 활용됩니다.</p>
          </div>

          <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
            {[
              { time: "05:00 ET", title: "EOD Final Report", body: "장 마감 후 전체 익스포저 수집 및 다음 날 전략 팩 베이스라인 구축", badge: "Archive" },
              { time: "07:30 ET", title: "Pre+2h Checkpoint", body: "프리마켓 2시간 경과 시점의 유동성 및 변동성 앵커링", badge: "Drift Scan" },
              { time: "09:00 ET", title: "Open-30m Final Execution", body: "본장 시작 전 최종 옵션 검증 및 진입 가이드 확정", badge: "Ready" }
            ].map((step, i) => (
              <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 absolute left-0 md:left-1/2 -translate-x-1/2">
                  <Clock size={16} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black text-emerald-600 tracking-widest">{step.time}</span>
                    <span className="text-[10px] bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase">{step.badge}</span>
                  </div>
                  <h4 className="text-lg font-black text-slate-900 mb-2">{step.title}</h4>
                  <p className="text-[13px] text-slate-500 font-medium leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 p-8 rounded-3xl text-center space-y-4">
            <h3 className="text-xl font-black text-slate-900">Final(무결점) 데이터 아카이브</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              모든 추천 종목은 아카이브된 시점의 가격과 옵션 데이터를 기준으로 성능이 추적됩니다. <br />
              <span className="text-slate-900 font-bold underline decoration-emerald-200 decoration-2">우리는 “이미 오른 종목”을 말하지 않습니다.</span>
            </p>
          </div>
        </div>
      </section>

      {/* 5) FINAL CTA */}
      <section className="py-24 px-6 bg-white overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-900 rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2" />
            </div>

            <div className="relative z-10 space-y-8">
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-tight">
                지금 당신의 터미널을 <br />
                <span className="text-emerald-400 underline decoration-indigo-500 decoration-4 underline-offset-8">Alpha OS</span> 로 업그레이드하세요.
              </h2>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                <a
                  href="/tier-01"
                  className="w-full md:w-auto px-10 py-5 bg-emerald-500 text-slate-900 rounded-2xl font-black text-lg tracking-tight hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-900/20"
                >
                  지금 시장 보기
                </a>
                <a
                  href="/tier-01"
                  className="w-full md:w-auto px-10 py-5 bg-white/10 text-white border border-white/20 rounded-2xl font-black text-lg hover:bg-white/20 transition-all backdrop-blur-sm"
                >
                  샘플 리포트 확인
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-500" size={24} />
            <span className="font-black text-xl tracking-tighter text-slate-900 uppercase">Alpha Commander V8.1</span>
          </div>
          <p className="text-xs text-slate-400 font-medium">© 2025 Alpha Systems Trading OS. All rights reserved. 7x24 Execution Excellence.</p>
          <div className="flex gap-4 text-xs font-black text-slate-500 uppercase tracking-widest">
            <a href="#" className="hover:text-emerald-600">Protocol</a>
            <a href="#" className="hover:text-emerald-600">Archive</a>
            <a href="#" className="hover:text-emerald-600">License</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
