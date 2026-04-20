"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ArrowRight,
  X,
  Loader2,
  ChevronRight,
  Waves,
  Eye,
  Radar,
  Activity,
  TrendingUp,
  Zap,
  Target,
  Clock
} from "lucide-react";

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LiveFeedTicker } from '@/components/landing/LiveFeedTicker';

// --- Sparkline Component ---
function Sparkline({ data, color = "#22d3ee" }: { data: number[], color?: string }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 24;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Badge Component ---
function SignalBadge({ type }: { type: 'hot' | 'whale' | 'squeeze' | null }) {
  if (!type) return null;

  const config = {
    hot: { icon: Zap, label: 'HOT', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
    whale: { icon: Target, label: 'INSTITUTIONAL', color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30' },
    squeeze: { icon: TrendingUp, label: 'SQUEEZE', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
  };

  const { icon: Icon, label, color } = config[type];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider border ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

// --- Ticker Drawer ---
function TickerDrawer({ symbol, isOpen, onClose }: { symbol: string, isOpen: boolean, onClose: () => void }) {
  const t = useTranslations();
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
            <h3 className="text-xs font-black text-cyan-500 uppercase tracking-[0.2em] mb-4">{t('home.optionsChain')}</h3>
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
            ) : <p className="text-slate-500 text-sm">{t('common.noData')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveTickerCard({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDataChanged, setIsDataChanged] = useState(false);
  const [sparklineData, setSparklineData] = useState<number[]>([]);
  const prevDataRef = useRef<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Use structure API for unified Max Pain, GEX, changePercent data
        const res = await fetch(`/api/live/options/structure?t=${symbol}`);
        const json = await res.json();

        // Check if data changed (for fade-in animation)
        const prev = prevDataRef.current;
        if (prev && (prev.netGex !== json.netGex || prev.maxPain !== json.maxPain)) {
          setIsDataChanged(true);
          setTimeout(() => setIsDataChanged(false), 1000);
        }

        prevDataRef.current = json;
        setData(json);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    // Fetch real sparkline data (daily closes from Polygon) — one-time on mount
    const fetchSparkline = async () => {
      try {
        const res = await fetch(`/api/sparkline?t=${symbol}`);
        const json = await res.json();
        if (json.closes && json.closes.length > 0) {
          setSparklineData(json.closes);
        }
      } catch {
        setSparklineData([]);
      }
    };

    fetchData();
    fetchSparkline();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [symbol]); // Only symbol in dependency array!

  // Determine badge type based on data (uses PowerEngine logic from API)
  const getBadgeType = () => {
    if (!data) return null;
    // Use isGammaSqueeze from API (PowerEngine: GEX > $50M + Price ≥ CallWall*98% + PCR < 0.6)
    if (data.isGammaSqueeze) return 'squeeze';
    // Whale: Large GEX position (> $1B)
    if (data.netGex && Math.abs(data.netGex) > 1000000000) return 'whale';
    return 'hot'; // Default for active tickers
  };

  // Use actual change percent if available, otherwise show neutral
  const priceChange = data?.changePercent?.toFixed(2) || null;
  const isPositive = priceChange ? parseFloat(priceChange) >= 0 : true;

  return (
    <div
      onClick={() => router.push(`/ticker?ticker=${symbol}`)}
      className="group cursor-pointer relative overflow-hidden rounded-xl 
          transition-all duration-300 ease-out
          bg-[#0d1829]/80 border border-[#1a2942]
          hover:bg-[#0f1f33] hover:border-cyan-500/40
          hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(34,211,238,0.12)]
          active:translate-y-0 active:shadow-none"
    >
      {/* Live Indicator Dot */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Live</span>
      </div>

      <div className="p-5">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#0a1420] border border-[#1a2942] flex items-center justify-center overflow-hidden
                group-hover:border-cyan-500/20 transition-colors">
              <img
                src={`/api/logo/${symbol}`}
                alt={symbol}
                className="w-7 h-7 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white group-hover:text-cyan-100 transition-colors">{symbol}</h3>
              <p className="text-xs text-slate-400 uppercase tracking-wider">NASDAQ</p>
            </div>
          </div>
          <SignalBadge type={getBadgeType()} />
        </div>

        {/* Price & Sparkline */}
        <div className="flex items-center justify-between mb-3">
          <div>
            {loading ? (
              <div className="h-6 w-20 bg-white/5 rounded animate-pulse" />
            ) : (
              <div className={`transition-all duration-500 ${isDataChanged ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>
                <span className="text-xl font-mono font-bold text-white">
                  ${data?.underlyingPrice?.toFixed(2) || '—'}
                </span>
                {priceChange && (
                  <span className={`ml-2 text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}{priceChange}%
                  </span>
                )}
              </div>
            )}
          </div>
          {sparklineData.length > 0 && (
            <Sparkline data={sparklineData} color={isPositive ? "#22d3ee" : "#f43f5e"} />
          )}
        </div>

        {/* Metrics Row */}
        <div className="pt-3 border-t border-white/5">
          {loading ? (
            <div className="flex gap-4">
              <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
              <div className="h-4 w-20 bg-white/5 rounded animate-pulse" />
            </div>
          ) : (
            <div className={`flex items-center gap-5 text-[13px] transition-all duration-500 ${isDataChanged ? 'opacity-0' : 'opacity-100'}`}>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400">GEX</span>
                <span className="text-white font-mono font-medium">
                  {data?.netGex ? `${data.netGex > 0 ? '+' : ''}${(data.netGex / 1e9).toFixed(1)}B` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-400">Max Pain</span>
                <span className="text-white font-mono font-medium">
                  ${data?.maxPain?.toFixed(0) || '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Hover Arrow */}
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-0 -translate-x-2">
          <ChevronRight className="w-5 h-5 text-cyan-400" />
        </div>
      </div>
    </div>
  );
}


// --- Structure Awareness Section ---
function StructureAwarenessSection() {
  const t = useTranslations();
  const [lineIndex, setLineIndex] = useState(0);
  const lines = useMemo(() => [
    t('home.structureLine1'),
    t('home.structureLine2'),
    t('home.structureLine3'),
    t('home.structureLine4'),
  ], [t]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLineIndex(prev => (prev + 1) % lines.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [lines.length]);

  return (
    <section className="relative py-16 px-6 overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[200px] bg-amber-500/[0.04] rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-3xl mx-auto text-center relative z-10">
        {/* Gradient Separator */}
        <div className="w-24 h-px mx-auto mb-10 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        {/* Rotating Structure Insight */}
        <div className="relative h-[80px] md:h-[64px] flex items-center justify-center">
          {lines.map((line, i) => (
            <p
              key={i}
              className={`absolute inset-0 flex items-center justify-center text-xl md:text-2xl font-light text-slate-300 italic tracking-wide leading-relaxed transition-all duration-700 ease-in-out ${
                i === lineIndex
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-3'
              }`}
            >
              &ldquo;{line}&rdquo;
            </p>
          ))}
        </div>

        {/* Subtle progress dots */}
        <div className="flex items-center justify-center gap-2 mt-6 mb-8">
          {lines.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === lineIndex
                  ? 'w-6 bg-amber-400/60'
                  : 'w-1.5 bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/flow"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-300 group"
        >
          <span className="font-medium">{t('home.structureCta')}</span>
          <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </Link>

        {/* Bottom Separator */}
        <div className="w-24 h-px mx-auto mt-10 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
      </div>
    </section>
  );
}


export default function Page() {
  const t = useTranslations();
  const pathname = usePathname();
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setLastUpdate(new Date()), 3000);
    return () => clearInterval(interval);
  }, []);

  const getTimeAgo = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    return seconds < 5 ? t('home.justNow') : `${seconds}${t('home.secondsAgo')}`;
  };

  return (
    <div className="min-h-screen bg-[#0d1220] text-slate-200 font-sans" data-landing>
      {/* HERO SECTION */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden">
        {/* Layer 1: Light Grid */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(56,189,248,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(56,189,248,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Layer 2: Depth Glow */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] 
            bg-gradient-radial from-[#0e7490]/25 via-[#083344]/15 to-transparent blur-[120px]" />
          <div className="absolute top-[25%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] 
            bg-gradient-radial from-[#164e63]/30 via-transparent to-transparent blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[30%] 
            bg-gradient-to-t from-[#451a03]/10 to-transparent blur-[60px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Analytics Engine Live Indicator */}
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-lg mb-6
            bg-[#0a1628]/80 backdrop-blur-sm border border-emerald-500/20
            shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.15em] font-jakarta">
                ANALYTICS ENGINE LIVE
              </span>
            </div>
          </div>


          {/* Live Badge */}
          <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full 
            bg-transparent border border-[#d97706]/30
            shadow-[0_0_15px_rgba(217,119,6,0.15)]
            text-[11px] font-bold uppercase tracking-[0.2em] text-[#fbbf24] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
            {t('home.badge')}
          </div>

          {/* Main Headline */}
          <h1 className="text-6xl md:text-[6rem] font-black tracking-tighter leading-[0.9] mb-6 drop-shadow-2xl font-jakarta">
            <span className="block text-white mb-1">{t('home.headline1')}</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#fbbf24] via-[#fde047] to-[#22d3ee]">{t('home.headline2')}</span>
          </h1>

          {/* FOMO Subheadline */}
          <p className="text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed mb-10 font-medium">
            {t('home.fomoSubheadline')}<br /><span className="text-cyan-400 font-bold">{t('home.fomoHighlight')}</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-8">
            <Link href="/ticker?ticker=NVDA"
              className="group px-10 py-4 bg-gradient-to-r from-[#d97706] to-[#b45309]
                text-black rounded-md font-extrabold text-sm uppercase tracking-wider font-jakarta
                hover:brightness-110 transition-all 
                flex items-center gap-2 shadow-[0_0_40px_rgba(217,119,6,0.3)] border border-[#f59e0b]/20">
              {t('home.enterCommand')} <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/how-it-works"
              className="px-10 py-4 bg-[#0a1628]/50 border border-[#1e293b] 
                text-[#38bdf8] rounded-md font-bold text-sm uppercase tracking-wider font-jakarta
                hover:bg-[#0a1628] hover:border-[#38bdf8]/30 transition-all">
              {t('home.howItWorks')}
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 text-sm text-slate-400">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="font-jakarta">{t('home.earlyAccessLabel')}</span>
            <span className="text-white/60">|</span>
            <span className="text-slate-300">{t('home.earlyAccessCta')}</span>
          </div>

          {/* Regulatory Disclaimer */}
          <p className="mt-4 text-[11px] text-slate-500 max-w-lg mx-auto leading-relaxed">
            A market research workspace for price, options, sector, and session analytics.
            Built for informational and educational use only. No brokerage, execution, custody, or investment advisory services.
          </p>

          {/* Hero Dashboard Mockup — Perspective Preview */}
          <div className="relative mt-12 max-h-[680px] overflow-hidden" style={{ perspective: '1200px' }}>
            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-500/[0.07] rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute top-1/4 left-1/4 w-[300px] h-[200px] bg-amber-500/[0.05] rounded-full blur-[80px] pointer-events-none" />

            {/* Side Screens (Behind) — Flow & M7 */}
            <div className="hidden lg:block absolute -left-[5%] top-[8%] w-[38%] z-0 opacity-[0.55] blur-[0.5px]"
              style={{ transform: 'rotateY(18deg) rotateX(5deg) scale(0.8)' }}>
              <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                <img src="/images/flow.PNG" alt="Flow Radar" className="w-full h-auto" />
              </div>
            </div>
            <div className="hidden lg:block absolute -right-[5%] top-[8%] w-[38%] z-0 opacity-[0.55] blur-[0.5px]"
              style={{ transform: 'rotateY(-18deg) rotateX(5deg) scale(0.8)' }}>
              <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                <img src="/images/m7.PNG" alt="M7 Session Grid" className="w-full h-auto" />
              </div>
            </div>

            {/* Main Screen (Front) — Command */}
            <div className="relative z-10 mx-auto w-[85%] md:w-[65%] group transition-transform duration-700 hover:scale-[1.02]"
              style={{ transform: 'rotateX(6deg)', transformOrigin: 'center bottom' }}>
              <div className="rounded-xl overflow-hidden border border-white/15 shadow-[0_20px_60px_rgba(34,211,238,0.12),0_8px_24px_rgba(0,0,0,0.5)]">
                <img src="/images/command-v2.png" alt="SIGNUM HQ Command Dashboard" className="w-full h-auto" />
              </div>
              {/* Reflection glow on bottom edge */}
              <div className="absolute -bottom-3 left-[15%] right-[15%] h-6 bg-cyan-500/15 blur-[25px] rounded-full" />
            </div>

            {/* Bottom Gradient Fade — aggressive */}
            <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-gradient-to-t from-[#0d1220] via-[#0d1220]/60 to-transparent pointer-events-none z-20" />
          </div>
        </div>
      </section>

      {/* LIVE FEED MARQUEE — between hero and features */}
      <div className="relative z-30 max-w-6xl mx-auto px-6 -mt-10 mb-4">
        <LiveFeedTicker />
      </div>

      {/* FEATURES SECTION */}
      <section id="features" className="relative z-30 pt-0 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              {t('home.whySignumPrefix')}
              <span className="text-cyan-400 font-jakarta">SIGNUM HQ</span>
              {t('home.whySignumSuffix')}
            </h2>
            <p className="text-sm md:text-base font-semibold tracking-[0.15em] uppercase">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">{t('home.premiumValue')}</span>
            </p>
          </div>

          {/* Feature Cards - Glassmorphism */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="relative p-7 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-cyan-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(34,211,238,0.08)]">
              {/* Ambient Glow */}
              <div className="absolute -top-20 -left-20 w-60 h-60 bg-cyan-500/[0.07] rounded-full blur-[80px] group-hover:bg-cyan-500/[0.12] transition-all duration-700" />
              <div className="absolute bottom-0 right-0 w-40 h-40 bg-amber-500/[0.04] rounded-full blur-[60px] group-hover:bg-amber-500/[0.07] transition-all duration-700" />
              <div className="absolute -right-8 -bottom-8 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500">
                <Waves className="w-36 h-36 text-cyan-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                    <Waves className="w-6 h-6 text-cyan-400" />
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20">
                    $200/mo {t('home.valuePerMonth')}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white mb-3">{t('home.gammaExposure')}</h3>
                <p className="text-[13px] text-slate-400 leading-relaxed mb-6">
                  {t('home.gammaExposureDesc')}
                </p>

                <span className="text-[13px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {t('home.includedInSignum')}
                </span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="relative p-7 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-amber-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(245,158,11,0.08)]">
              {/* Ambient Glow */}
              <div className="absolute -top-20 -left-20 w-60 h-60 bg-amber-500/[0.07] rounded-full blur-[80px] group-hover:bg-amber-500/[0.12] transition-all duration-700" />
              <div className="absolute bottom-0 right-0 w-40 h-40 bg-cyan-500/[0.04] rounded-full blur-[60px] group-hover:bg-cyan-500/[0.07] transition-all duration-700" />
              <div className="absolute -right-8 -bottom-8 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500">
                <Eye className="w-36 h-36 text-amber-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <Eye className="w-6 h-6 text-amber-400" />
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20">
                    $150/mo {t('home.valuePerMonth')}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white mb-3">{t('home.darkPoolTracking')}</h3>
                <p className="text-[13px] text-slate-400 leading-relaxed mb-6">
                  {t('home.darkPoolTrackingDesc')}
                </p>

                <span className="text-[13px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {t('home.includedInSignum')}
                </span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="relative p-7 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 overflow-hidden group hover:border-cyan-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(34,211,238,0.08)]">
              {/* Ambient Glow */}
              <div className="absolute -top-20 -left-20 w-60 h-60 bg-cyan-500/[0.07] rounded-full blur-[80px] group-hover:bg-cyan-500/[0.12] transition-all duration-700" />
              <div className="absolute bottom-0 right-0 w-40 h-40 bg-emerald-500/[0.04] rounded-full blur-[60px] group-hover:bg-emerald-500/[0.07] transition-all duration-700" />
              <div className="absolute -right-8 -bottom-8 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500">
                <Radar className="w-36 h-36 text-cyan-400" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                    <Radar className="w-6 h-6 text-cyan-400" />
                  </div>
                  <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20">
                    $100/mo {t('home.valuePerMonth')}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white mb-3">{t('home.sniperSignal')}</h3>
                <p className="text-[13px] text-slate-400 leading-relaxed mb-6">
                  {t('home.sniperSignalDesc')}
                </p>

                <span className="text-[13px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {t('home.includedInSignum')}
                </span>
              </div>
            </div>
          </div>

          {/* Consolidated Pricing Badge */}
          <div className="mt-16 flex justify-center">
            <Link href="/pricing" className="inline-flex items-center gap-3 px-8 py-3 rounded-full bg-[#0a1628] border border-[#1e293b] hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)] transition-all duration-300 group cursor-pointer">
              <span className="text-sm text-slate-500 line-through">{t('home.priceStrikethrough')}</span>
              <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400 group-hover:from-cyan-300 group-hover:to-amber-300 transition-all">{t('home.consolidatedPricing')}</span>
              <ChevronRight size={14} className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </div>
        </div>
      </section>

      {/* STRUCTURE AWARENESS — Rotating Insight Band */}
      <StructureAwarenessSection />

      {/* POWERED BY — Technology Partner Logo Strip */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-[0.3em] mb-8">Powered by</p>
          <div className="flex items-center justify-center gap-12 sm:gap-16 md:gap-20 flex-wrap">
            {/* AWS — full logo with smile */}
            <a href="https://aws.amazon.com" target="_blank" rel="noopener noreferrer"
               className="opacity-85 hover:opacity-100 transition-opacity duration-500" title="Amazon Web Services">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/aws.svg" alt="AWS" style={{height: 42, width: 'auto'}} className="select-none" loading="lazy" />
            </a>
            {/* Anthropic — icon + text */}
            <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-2.5 opacity-85 hover:opacity-100 transition-opacity duration-500" title="Anthropic Claude AI">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/anthropic.svg" alt="" style={{height: 34, width: 'auto'}} className="select-none" loading="lazy" />
              <span className="text-[21px] font-medium text-[#E8C9A8]" style={{fontFamily:'Inter,system-ui,sans-serif'}}>Anthropic</span>
            </a>
            {/* Stripe — icon + text */}
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-2.5 opacity-85 hover:opacity-100 transition-opacity duration-500" title="Stripe Payments">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/stripe.svg" alt="" style={{height: 34, width: 'auto'}} className="select-none" loading="lazy" />
              <span className="text-[21px] font-semibold text-[#7A73FF]" style={{fontFamily:'Inter,system-ui,sans-serif'}}>Stripe</span>
            </a>
            {/* Vercel — icon + text */}
            <a href="https://vercel.com" target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-2.5 opacity-85 hover:opacity-100 transition-opacity duration-500" title="Vercel Edge Network">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/vercel.svg" alt="" style={{height: 32, width: 'auto'}} className="select-none" loading="lazy" />
              <span className="text-[21px] font-semibold text-white" style={{fontFamily:'Inter,system-ui,sans-serif'}}>Vercel</span>
            </a>
          </div>
        </div>
      </section>

      {/* LIVE ANALYTICS DASHBOARD */}
      <section id="live-demo" className="py-14 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em]">{t('common.liveFeed')}</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white font-jakarta">{t('home.signalDashboard')}</h2>
              <p className="text-sm text-slate-400 mt-1">{t('home.signalDashboardDesc')}</p>
            </div>
            <Link href="/watchlist" className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold transition-colors">
              {t('common.viewAll')} <ChevronRight size={14} />
            </Link>
          </div>

          {/* Ticker Grid - Enhanced */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {["NVDA", "TSLA", "AAPL", "MSFT"].map((ticker) => (
              <LiveTickerCard key={ticker} symbol={ticker} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer rendered by global Footer.tsx component */}
    </div>
  );
}
