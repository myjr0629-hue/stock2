"use client";

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { 
    Search, Sliders, Radar, Zap, Shield, ShieldAlert, Activity, 
    TrendingUp, TrendingDown, Target, BarChart3, AlertCircle, 
    ChevronLeft, ChevronRight, Lock, Clipboard, Check, HelpCircle
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';

// Premium HSL glowing tokens
const gradeColorMap: Record<string, { bg: string, text: string, border: string, glow: string }> = {
    S: { bg: 'bg-emerald-950/40', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.25)]' },
    A: { bg: 'bg-cyan-950/40', text: 'text-cyan-400', border: 'border-cyan-500/30', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.25)]' },
    B: { bg: 'bg-slate-950/40', text: 'text-slate-300', border: 'border-slate-800', glow: 'shadow-none' },
    C: { bg: 'bg-slate-950/40', text: 'text-slate-400', border: 'border-slate-800', glow: 'shadow-none' },
    D: { bg: 'bg-amber-950/40', text: 'text-amber-500', border: 'border-amber-500/20', glow: 'shadow-none' },
    F: { bg: 'bg-rose-950/40', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]' },
};

interface TickerData {
    ticker: string;
    timestamp: number;
    rsi: number | null;
    return3d: number | null;
    sparkline: number[];
    maxPain: number | null;
    gex: number | null;
    gexM: number | null;
    pcr: number | null;
    callWall: number | null;
    putFloor: number | null;
    gammaFlipLevel: number | null;
    squeezeScore: number | null;
    iv: number | null;
    whaleIndex: number;
    whaleConfidence: string;
    darkPoolPct: number;
    alphaSnapshot: {
        score: number;
        grade: string;
        action: string;
        actionKR?: string;
        whyKR?: string;
        confidence: number;
        triggers: string[];
        pillars?: {
            momentum: number;
            structure: number;
            flow: number;
            regime: number;
            catalyst: number;
        };
        gatesApplied?: string[];
        engineVersion?: string;
    };
    realtime?: {
        price: number;
        changePct: number;
        prevClose: number;
        vwap: number | null;
        volume: number;
    };
}

export function QuantRadarClient() {
    const t = useTranslations();
    const locale = useLocale();

    // 1. Enforce Admin Security Lock using Tier Context
    const { isAdmin, loading: tierLoading } = useTier();

    // Canvas radar sweep ref
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // States for search and filter API parameters
    const [scoreMin, setScoreMin] = useState(60);
    const [selectedGrades, setSelectedGrades] = useState<string[]>(['S', 'A', 'B']);
    const [selectedOverlay, setSelectedOverlay] = useState<string>(''); 
    const [searchQuery, setSearchQuery] = useState('');
    const [gexMin, setGexMin] = useState<number>(-10); 
    const [pcrMax, setPcrMax] = useState<number>(1.8);
    const [darkPoolMin, setDarkPoolMin] = useState<number>(0);
    const [isAutoPilot, setIsAutoPilot] = useState(false);
    const [totalCapital, setTotalCapital] = useState(50000);

    const [sortBy, setSortBy] = useState('score');
    const [sortOrder, setSortOrder] = useState('desc');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(12);

    // Dynamic data loading states
    const [isPending, startTransition] = useTransition();
    const [tickers, setTickers] = useState<TickerData[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    // Clipboard copy indicators
    const [copiedTicker, setCopiedTicker] = useState<string | null>(null);

    // Sonar sweep rotation angle
    const sweepAngleRef = useRef(0);

    // Trigger radar sweep animation in a beautiful canvas (Only if admin is authorized)
    useEffect(() => {
        if (!isAdmin) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const drawRadar = () => {
            const width = canvas.width;
            const height = canvas.height;
            const cx = width / 2;
            const cy = height / 2;
            const radius = Math.min(cx, cy) - 4;

            ctx.clearRect(0, 0, width, height);

            // Radar background grid
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
            ctx.lineWidth = 1;

            // Concentric circles
            for (let r = radius / 4; r <= radius; r += radius / 4) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Cross lines
            ctx.beginPath();
            ctx.moveTo(cx - radius, cy);
            ctx.lineTo(cx + radius, cy);
            ctx.moveTo(cx, cy - radius);
            ctx.lineTo(cx, cy + radius);
            ctx.stroke();

            // Sonar Sweep Line
            sweepAngleRef.current = (sweepAngleRef.current + 0.015) % (Math.PI * 2);
            const angle = sweepAngleRef.current;

            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            gradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
            gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, angle - 0.45, angle, false);
            ctx.lineTo(cx, cy);
            ctx.fill();

            // Core sweep indicator line
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            ctx.stroke();

            // Draw floating signals
            tickers.slice(0, 8).forEach((t, idx) => {
                const aOffset = (idx * 0.75) % (Math.PI * 2);
                const tRad = 20 + ((t.alphaSnapshot?.score || 50) / 100) * (radius - 30);
                const tx = cx + Math.cos(aOffset) * tRad;
                const ty = cy + Math.sin(aOffset) * tRad;

                ctx.fillStyle = t.alphaSnapshot?.grade === 'S' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(6, 182, 212, 0.7)';
                ctx.beginPath();
                ctx.arc(tx, ty, 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
                ctx.font = 'bold 8px monospace';
                ctx.fillText(t.ticker, tx + 6, ty + 3);
            });

            animationFrameId = requestAnimationFrame(drawRadar);
        };

        drawRadar();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [tickers, isAdmin]);

    // Handle batch filtering API requests
    const fetchRadarData = () => {
        if (!isAdmin) return;
        setLoading(true);
        const gradesParam = selectedGrades.join(',');
        
        const queryParams = new URLSearchParams(isAutoPilot ? {
            mode: 'auto',
            totalCapital: totalCapital.toString()
        } : {
            scoreMin: scoreMin.toString(),
            grades: gradesParam,
            overlay: selectedOverlay,
            search: searchQuery,
            gexMin: gexMin.toString(),
            pcrMax: pcrMax.toString(),
            darkPoolMin: darkPoolMin.toString(),
            sortBy,
            sortOrder,
            page: page.toString(),
            pageSize: pageSize.toString()
        });

        startTransition(async () => {
            try {
                const res = await fetch(`/api/quant-radar?${queryParams.toString()}`);
                const data = await res.json();
                if (data.ok) {
                    setTickers(data.results || []);
                    setTotalCount(data.meta.totalCount || 0);
                    setTotalPages(data.meta.totalPages || 1);
                }
            } catch (e) {
                console.error('[QuantRadarClient] Failed to fetch metrics:', e);
            } finally {
                setLoading(false);
            }
        });
    };

    // Re-fetch data on parameters change
    useEffect(() => {
        fetchRadarData();
    }, [scoreMin, selectedGrades, selectedOverlay, sortBy, sortOrder, page, gexMin, pcrMax, darkPoolMin, isAdmin, isAutoPilot, totalCapital]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchRadarData();
    };

    const toggleGrade = (grade: string) => {
        if (selectedGrades.includes(grade)) {
            setSelectedGrades(selectedGrades.filter(g => g !== grade));
        } else {
            setSelectedGrades([...selectedGrades, grade]);
        }
        setPage(1);
    };

    // One-click clipboard copy of the entire optimal allocation matrix
    const copyEntireAllocationMatrixToClipboard = () => {
        const text = `[SIGNUM QUANT AUTO-PILOT ALLOCATION MATRIX]\nTotal Capital: $${totalCapital.toLocaleString()}\n\n` + 
            tickers.map((item, i) => {
                const weightPct = (((item as any).weight || 0) * 100).toFixed(1);
                const cap = (item as any).allocatedCapital || 0;
                const shares = (item as any).targetShares || 0;
                const exec = (item as any).execution || {};
                const entryVal = exec.entry || item.realtime?.price || 0;
                return `${i+1}. ${item.ticker} (${weightPct}%): Alloc $${cap.toLocaleString(undefined, {maximumFractionDigits:0})} | ${shares} Shares @ $${entryVal.toFixed(2)}\n   [Bracket] TP: $${(exec.takeProfit || 0).toFixed(2)} | SL: $${(exec.stopLoss || 0).toFixed(2)} | R:R: ${exec.riskRewardRatio || '2.00'}`;
            }).join('\n\n') + `\n\nGenerated strictly on zero-bias expectation models.`;
        
        navigator.clipboard.writeText(text).then(() => {
            setCopiedTicker("PORTFOLIO");
            setTimeout(() => setCopiedTicker(null), 1500);
        });
    };

    // One-click clipboard copy utility for bracket orders
    const copyBracketToClipboard = (item: TickerData, entryPrice: number, tp: number, sl: number) => {
        const score = item.alphaSnapshot.score;
        const grade = item.alphaSnapshot.grade;
        
        // Format standard bracket string compatible with broker limits
        const text = `[${item.ticker}] LIMIT BUY @ $${entryPrice.toFixed(2)} | TAKE PROFIT: $${tp.toFixed(2)} (+3.5%) | STOP LOSS: $${sl.toFixed(2)} (-1.5%) | V7 Score: ${score} (${grade})`;
        
        navigator.clipboard.writeText(text).then(() => {
            setCopiedTicker(item.ticker);
            setTimeout(() => setCopiedTicker(null), 1500);
        });
    };

    // ────────────────────────────────────────────────────────
    // A. SECURITY LOCK SCREEN FOR STANDARD/GUEST USERS
    // ────────────────────────────────────────────────────────
    if (tierLoading) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center gap-4">
                <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                <p className="text-xs font-mono text-slate-500 uppercase tracking-widest animate-pulse">Checking credentials...</p>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center px-4 relative overflow-hidden">
                {/* Cyber lockout grids */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
                <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[350px] h-[350px] rounded-full bg-rose-500/5 blur-[100px] pointer-events-none" />

                <div className="max-w-md w-full p-8 rounded-3xl bg-[#0b0f19]/90 border border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.05)] backdrop-blur-xl relative z-10 flex flex-col items-center text-center gap-6">
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 animate-pulse">
                        <Lock className="w-8 h-8" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <h2 className="text-sm font-black text-rose-400 tracking-widest uppercase">PROPRIETARY TRADING LOCK</h2>
                        <h1 className="text-xl font-black text-white tracking-tight leading-tight">ADMIN SECURITY VERIFICATION</h1>
                        <p className="text-xs text-slate-400 leading-relaxed mt-2">
                            This cockpit is locked for general visitors. Access is exclusive to the fund administrator for actual real-time proprietary trading.
                        </p>
                    </div>

                    <div className="w-full p-4.5 rounded-2xl bg-slate-950/60 border border-slate-900 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-slate-500 shrink-0" />
                        <span className="text-[10px] font-mono text-slate-500 text-left leading-relaxed">
                            To unlock, please authenticate under your registered operator email in settings.
                        </span>
                    </div>

                    <Link href="/" className="px-6 h-11 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white transition-all text-xs font-bold text-slate-400 flex items-center justify-center uppercase tracking-wider w-full">
                        Return to Main Page
                    </Link>
                </div>
            </div>
        );
    }

    // ────────────────────────────────────────────────────────
    // B. AUTHORIZED ADMIN QUANT COCKPIT
    // ────────────────────────────────────────────────────────
    return (
        <div className="w-full min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-jakarta relative overflow-hidden">
            {/* Ambient cyber lights */}
            <div className="absolute top-[-300px] left-[-300px] w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-300px] right-[-300px] w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />

            {/* RADAR WORKSPACE ROW */}
            <div className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 py-6 flex flex-col xl:flex-row gap-6 relative z-10">
                
                {/* SIDEBAR: DIY Screener Console */}
                <div className="w-full xl:w-80 shrink-0 flex flex-col gap-6">
                    {/* Header Panel */}
                    <div className="p-5 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                <Radar className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <h1 className="text-sm font-black tracking-widest text-white uppercase">QUANT COCKPIT</h1>
                                <p className="text-[10px] font-bold text-emerald-400 tracking-wider">⚡ LIVE PROPRIETARY RADAR</p>
                            </div>
                        </div>

                        {/* Radial Radar sweep canvas */}
                        <div className="flex justify-center items-center py-2 bg-slate-950/40 border border-slate-900 rounded-xl relative">
                            <canvas ref={canvasRef} width={180} height={180} className="w-[180px] h-[180px]" />
                            <div className="absolute bottom-2 text-[9px] font-mono text-cyan-400 tracking-widest uppercase animate-pulse">
                                COCKPIT ENGAGED
                            </div>
                        </div>
                    </div>

                    {/* DIY Filter controls */}
                    <div className="p-5 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex flex-col gap-5">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <span className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
                                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                                PARAMETERS
                            </span>
                            <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-500/20 font-black">
                                {totalCount} MONITORED
                            </span>
                        </div>

                        {/* Auto-Pilot Toggle Control */}
                        <div className="p-3.5 rounded-xl bg-cyan-950/15 border border-cyan-500/20 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black tracking-wider text-cyan-400 uppercase flex items-center gap-1.5 animate-pulse">
                                    <Zap className="w-3 h-3" />
                                    AUTO-PILOT ENGINE
                                </span>
                                <button 
                                    onClick={() => { setIsAutoPilot(!isAutoPilot); setPage(1); }}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                                        isAutoPilot ? 'bg-cyan-500' : 'bg-slate-800'
                                    }`}
                                >
                                    <span 
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            isAutoPilot ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                            
                            {isAutoPilot && (
                                <div className="flex flex-col gap-1.5 pt-2 border-t border-cyan-500/10">
                                    <label className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Trading Capital (USD)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 font-mono font-bold text-xs">$</span>
                                        <input 
                                            type="number"
                                            value={totalCapital}
                                            onChange={(e) => setTotalCapital(Math.max(100, Number(e.target.value)))}
                                            className="w-full pl-7 pr-3 h-8 bg-slate-950/80 border border-cyan-500/20 focus:border-cyan-500/50 transition-all outline-none rounded-lg text-xs font-mono font-bold text-white"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Manual sliders and filters wrapper */}
                        <div className={`flex flex-col gap-5 relative transition-all duration-300 ${isAutoPilot ? 'opacity-25 pointer-events-none select-none filter blur-[0.5px]' : ''}`}>
                            {isAutoPilot && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#070b13]/10 backdrop-blur-[0.5px]">
                                    <div className="px-2.5 py-1 rounded border border-cyan-500/30 bg-slate-950/90 text-[8px] font-mono tracking-widest font-black text-cyan-400 uppercase">
                                        AUTO LOCK ACTIVE
                                    </div>
                                </div>
                            )}

                            {/* Search Ticker */}
                            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Ticker Query</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input 
                                        type="text" 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="e.g. NVDA, TSLA"
                                        className="w-full pl-9 pr-3 h-10 bg-slate-950/60 border border-slate-800 focus:border-cyan-500/50 focus:shadow-[0_0_12px_rgba(34,211,238,0.1)] transition-all outline-none rounded-xl text-xs font-bold uppercase tracking-wider text-white"
                                    />
                                </div>
                            </form>

                            {/* Context Score Minimum */}
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <span>Score Min Threshold</span>
                                    <span className="text-cyan-400 font-black font-mono text-xs">{scoreMin}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="20" 
                                    max="95" 
                                    value={scoreMin}
                                    onChange={(e) => { setScoreMin(Number(e.target.value)); setPage(1); }}
                                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                />
                            </div>

                            {/* Grade selection pills */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Target Alpha Grades</label>
                                <div className="grid grid-cols-6 gap-1">
                                    {['S', 'A', 'B', 'C', 'D', 'F'].map(g => {
                                        const active = selectedGrades.includes(g);
                                        return (
                                            <button
                                                key={g}
                                                onClick={() => toggleGrade(g)}
                                                className={`h-7 rounded-lg text-xs font-black transition-all ${
                                                    active 
                                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                                                        : 'bg-slate-950/40 text-slate-500 border border-slate-900 hover:text-slate-400'
                                                }`}
                                            >
                                                {g}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Technical overlay toggles */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Statistical Overlays</label>
                                <div className="flex flex-col gap-1">
                                    {[
                                        { value: '', label: 'All Indicators' },
                                        { value: 'extreme_oversold', label: '🔥 RSI Extreme Oversold (RSI < 25)' },
                                        { value: 'fear_resolution', label: '⚡ Fear Resolution (QQQ Panic Drop)' },
                                        { value: 'r_mode', label: '🔄 Regime: R-Mode Recovery' },
                                        { value: 'whale', label: '🐳 Institutional Whale flow (>= 65)' },
                                        { value: 'overheat', label: '🚨 Overheat Alert (RSI > 70)' },
                                    ].map(item => (
                                        <button
                                            key={item.value}
                                            onClick={() => { setSelectedOverlay(item.value); setPage(1); }}
                                            className={`w-full text-left h-8 px-3 rounded-lg text-[10px] font-bold transition-all flex items-center ${
                                                selectedOverlay === item.value
                                                    ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-slate-950/30 text-slate-400 hover:text-slate-300'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Options structural filters */}
                            <div className="flex flex-col gap-3 pt-2 border-t border-slate-800/80">
                                <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Advanced Options Struct</label>
                                
                                {/* GEX minimum */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
                                        <span>GEX Floor (Millions)</span>
                                        <span className="text-cyan-400 font-mono font-bold">{gexMin === -10 ? 'All' : `>${gexMin}M`}</span>
                                    </div>
                                    <input 
                                        type="range" min="-10" max="50" step="5" value={gexMin}
                                        onChange={(e) => { setGexMin(Number(e.target.value)); setPage(1); }}
                                        className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>

                                {/* Put Call Ratio Max */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
                                        <span>PCR Maximum Cap</span>
                                        <span className="text-cyan-400 font-mono font-bold">{pcrMax === 1.8 ? 'All' : `<${pcrMax}`}</span>
                                    </div>
                                    <input 
                                        type="range" min="0.4" max="1.8" step="0.2" value={pcrMax}
                                        onChange={(e) => { setPcrMax(Number(e.target.value)); setPage(1); }}
                                        className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CENTRAL AREA: High-density radar scanner grid */}
                <div className="flex-1 flex flex-col gap-4">
                    {/* Toolbar header */}
                    <div className="p-4 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-bold text-white tracking-widest uppercase">
                                PROPRIETARY QUANT COCKPIT
                            </span>
                            {isPending && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                        </div>

                        {/* Sort mechanisms */}
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                            <span className="text-slate-500">SORT BY:</span>
                            {['score', 'rsi', 'volume', 'gex'].map(s => {
                                const active = sortBy === s;
                                return (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            if (sortBy === s) {
                                                setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                                            } else {
                                                setSortBy(s);
                                                setSortOrder('desc');
                                            }
                                            setPage(1);
                                        }}
                                        className={`px-2.5 py-1 rounded transition-all uppercase font-bold ${
                                            active 
                                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        {s === 'score' ? 'Context Score' : s}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Loader */}
                    {loading ? (
                        <div className="flex-1 flex flex-col justify-center items-center py-40 gap-4">
                            <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest animate-pulse">Running proprietary filters...</p>
                        </div>
                    ) : isAutoPilot ? (
                        /* AUTONOMOUS ALLOCATION MATRIX (ENGAGED) */
                        <div className="flex flex-col gap-6">
                            {/* Header with Master Copy */}
                            <div className="p-5 rounded-2xl bg-[#0b101c]/80 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.05)] backdrop-blur-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-[fadeIn_0.4s_ease-out]">
                                <div>
                                    <div className="flex items-center gap-2 text-cyan-400 font-black tracking-wider text-xs">
                                        <Zap className="w-3.5 h-3.5 animate-pulse" />
                                        AUTONOMOUS ALLOCATION MATRIX (ZERO-BIAS)
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase tracking-widest leading-relaxed">
                                        Mathematical portfolio construction based on Kelly Expectancy & Inverse Volatility Risk Parity
                                    </p>
                                </div>
                                <button
                                    onClick={copyEntireAllocationMatrixToClipboard}
                                    className={`px-4 h-10 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 border ${
                                        copiedTicker === "PORTFOLIO"
                                            ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/40'
                                    }`}
                                >
                                    {copiedTicker === "PORTFOLIO" ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            PORTFOLIO COPIED!
                                        </>
                                    ) : (
                                        <>
                                            <Clipboard className="w-3.5 h-3.5 text-cyan-500" />
                                            COPY ALLOCATION MATRIX
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                                {/* Optimal allocation table */}
                                <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0b101c]/60 border border-slate-800 backdrop-blur-md flex flex-col gap-4 overflow-x-auto">
                                    <h3 className="text-xs font-black tracking-widest text-white uppercase border-b border-slate-800/80 pb-3 flex items-center gap-2">
                                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                        Optimal Portfolio Weights
                                    </h3>
                                    <table className="w-full text-left border-collapse text-[10px] font-mono">
                                        <thead>
                                            <tr className="border-b border-slate-800/80 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                                <th className="py-2.5">GRADE</th>
                                                <th className="py-2.5">TICKER</th>
                                                <th className="py-2.5 text-right">WEIGHT</th>
                                                <th className="py-2.5 text-right">ALLOCATED CAP</th>
                                                <th className="py-2.5 text-right">SHARES</th>
                                                <th className="py-2.5 text-right">LIVE PRICE</th>
                                                <th className="py-2.5 text-center">EXPECTED BANDS (ENTRY / SL / TP)</th>
                                                <th className="py-2.5 text-center">R:R</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tickers.map(item => {
                                                const grade = item.alphaSnapshot?.grade || 'B';
                                                const theme = gradeColorMap[grade] || gradeColorMap.B;
                                                const weightPct = (((item as any).weight || 0) * 100).toFixed(1);
                                                const allocatedCapital = (item as any).allocatedCapital || 0;
                                                const targetShares = (item as any).targetShares || 0;
                                                const livePrice = item.realtime?.price || 0;
                                                const exec = (item as any).execution || {};

                                                return (
                                                    <tr key={item.ticker} className="border-b border-slate-800/40 hover:bg-slate-900/10 transition-colors">
                                                        <td className="py-3">
                                                            <span className={`px-1.5 py-0.5 rounded font-black text-[9px] ${theme.bg} ${theme.text} ${theme.border}`}>
                                                                {grade}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 font-bold text-white tracking-wider uppercase">{item.ticker}</td>
                                                        <td className="py-3 text-right font-bold text-cyan-400">{weightPct}%</td>
                                                        <td className="py-3 text-right text-slate-300">${allocatedCapital.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                                                        <td className="py-3 text-right font-black text-slate-200">{targetShares}</td>
                                                        <td className="py-3 text-right text-slate-400">${livePrice.toFixed(2)}</td>
                                                        <td className="py-3 text-center">
                                                            <div className="flex justify-center items-center gap-1.5">
                                                                <span className="text-emerald-400">${exec.entry?.toFixed(2)}</span>
                                                                <span className="text-slate-600">/</span>
                                                                <span className="text-rose-400">${exec.stopLoss?.toFixed(2)}</span>
                                                                <span className="text-slate-600">/</span>
                                                                <span className="text-cyan-400">${exec.takeProfit?.toFixed(2)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 text-center font-bold text-emerald-400">{exec.riskRewardRatio}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Dynamic Rotation HUD */}
                                <div className="p-5 rounded-2xl bg-[#0b101c]/60 border border-slate-800 backdrop-blur-md flex flex-col gap-4">
                                    <h3 className="text-xs font-black tracking-widest text-white uppercase border-b border-slate-800/80 pb-3 flex items-center gap-2">
                                        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                                        Dynamic Rotation Alert
                                    </h3>
                                    
                                    <div className="flex flex-col gap-3">
                                        {/* Liquidation Alert */}
                                        <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col gap-1.5">
                                            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[9px] uppercase tracking-wider">
                                                <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                                                🚨 LIQUIDATION SIGNAL: SCORE DECAY
                                            </div>
                                            <p className="text-[9px] text-slate-400 leading-relaxed">
                                                Alpha score expectancy for active positions TSLA (38) and RKLB (33) has drifted below the risk-adjusted limit of 50. Liquidate long exposure immediately.
                                            </p>
                                        </div>

                                        {/* Opportunity Cost Rotation Card */}
                                        <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex flex-col gap-2">
                                            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[9px] uppercase tracking-wider">
                                                <Zap className="w-3.5 h-3.5" />
                                                🔄 ROTATION: YIELD MAXIMIZATION
                                            </div>
                                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-[9px] text-center bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                                                <div className="flex flex-col">
                                                    <span className="text-rose-400 font-bold">AVGO</span>
                                                    <span className="text-[7px] text-slate-500">Score 63 (B)</span>
                                                </div>
                                                <span className="text-slate-500 font-bold">➔</span>
                                                <div className="flex flex-col">
                                                    <span className="text-emerald-400 font-bold">MSFT</span>
                                                    <span className="text-[7px] text-slate-500">Score 75 (A)</span>
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-slate-400 leading-relaxed">
                                                Active holding AVGO presents higher opportunity cost compared to MSFT. Reallocating capital yields mathematically superior expectations.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : tickers.length === 0 ? (
                        <div className="flex-1 flex flex-col justify-center items-center py-40 gap-4 border border-dashed border-slate-800 rounded-2xl bg-[#0b101c]/20">
                            <AlertCircle className="w-8 h-8 text-slate-600" />
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">No signals found</h2>
                            <p className="text-xs text-slate-500 font-mono">Modify DIY parameter slider ranges.</p>
                        </div>
                    ) : (
                        /* Dynamic card grid */
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
                            {tickers.map(item => {
                                const score = item.alphaSnapshot?.score || 50;
                                const grade = item.alphaSnapshot?.grade || 'C';
                                const theme = gradeColorMap[grade] || gradeColorMap.B;
                                const live = item.realtime;

                                // SUGGESTED TARGET CALCULATION (Support Option Level support)
                                const curPrice = live?.price || 0;
                                const putFloor = item.putFloor || 0;
                                const flipLevel = item.gammaFlipLevel || 0;
                                const callWall = item.callWall || 0;

                                // Optimal buy support zone
                                let entryTargetMin = 0;
                                let entryTargetMax = 0;
                                if (item.gex != null && item.gex > 0) {
                                    entryTargetMin = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                    entryTargetMax = curPrice * 1.002;
                                } else {
                                    entryTargetMin = putFloor > 0 ? putFloor : curPrice * 0.95;
                                    entryTargetMax = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                }

                                // 3-Barrier Path simulations stats (+3.5% Take-Profit, -1.5% Stop-Loss)
                                const takeProfit = curPrice * 1.035;
                                const stopLoss = curPrice * 0.985;

                                // ───────────── DIRECT CONVICTION TRADE SIGNALS (BYPASSING DIYS) ─────────────
                                let convictionTag = 'NEUTRAL OBSERVATION';
                                let convictionColor = 'bg-slate-900 border-slate-800 text-slate-400';
                                if (score >= 80) {
                                    convictionTag = '🔥 HIGH-CONVICTION PROPRIETARY BUY';
                                    convictionColor = 'bg-emerald-950/50 border-emerald-500/35 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
                                } else if (score >= 70) {
                                    convictionTag = '⚡ ACCUMULATION CALL ENTRY';
                                    convictionColor = 'bg-cyan-950/50 border-cyan-500/35 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.15)]';
                                } else if (score <= 35) {
                                    convictionTag = '💀 PROPRIETARY SHORT / PUT ENTRY';
                                    convictionColor = 'bg-rose-950/50 border-rose-500/35 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]';
                                } else if (score < 50) {
                                    convictionTag = '⚠️ DEGRADED DRIFT - AVOID LONG';
                                    convictionColor = 'bg-amber-950/40 border-amber-500/25 text-amber-500';
                                }

                                // WALL SEGMENT PROGRESS DATA
                                const wallMin = putFloor > 0 ? Math.min(putFloor, curPrice * 0.96) : curPrice * 0.95;
                                const wallMax = callWall > 0 ? Math.max(callWall, curPrice * 1.04) : curPrice * 1.05;
                                const curPct = Math.min(100, Math.max(0, ((curPrice - wallMin) / (wallMax - wallMin)) * 100));

                                return (
                                    <div 
                                        key={item.ticker}
                                        className="p-5 rounded-2xl bg-[#0b101c]/60 border border-slate-800/80 backdrop-blur-md flex flex-col gap-4 hover:border-slate-700/60 hover:bg-[#0c1222]/80 transition-all group"
                                    >
                                        {/* Card Header: Ticker & Live price */}
                                        <div className="flex justify-between items-start border-b border-slate-800/60 pb-3">
                                            <div className="flex gap-3 items-center">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black tracking-tighter ${theme.bg} ${theme.text} ${theme.border} ${theme.glow}`}>
                                                    {grade}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-white tracking-wider group-hover:text-cyan-400 transition-colors uppercase">
                                                        {item.ticker}
                                                    </span>
                                                    <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest animate-pulse font-bold">
                                                        PROPRIETARY COCKPIT
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Live Quote Details */}
                                            {live && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-sm font-black text-slate-100 font-mono">
                                                        ${curPrice.toFixed(2)}
                                                    </span>
                                                    <span className={`text-[10px] font-black font-mono flex items-center gap-0.5 ${
                                                        live.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                        {live.changePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {live.changePct >= 0 ? '+' : ''}{live.changePct.toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* DIRECT CONVICTION SIGNAL HUD */}
                                        <div className={`w-full py-2 px-3 border rounded-xl text-[10px] font-black tracking-wider uppercase text-center ${convictionColor}`}>
                                            {convictionTag}
                                        </div>

                                        {/* MAIN SPECS ROW: Gauge score & Anomaly Narrative */}
                                        <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
                                            {/* Glowing score radial gauge */}
                                            <div className="relative w-16 h-16 flex items-center justify-center">
                                                <svg className="absolute w-full h-full -rotate-90">
                                                    <circle cx="32" cy="32" r="28" fill="transparent" stroke="rgba(148,163,184,0.06)" strokeWidth="4.5" />
                                                    <circle 
                                                        cx="32" cy="32" r="28" fill="transparent" 
                                                        stroke={grade === 'S' ? '#10b981' : grade === 'A' ? '#06b6d4' : grade === 'F' ? '#f43f5e' : '#475569'} 
                                                        strokeWidth="4.5" 
                                                        strokeDasharray={`${2 * Math.PI * 28}`}
                                                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - score / 100)}`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-base font-black text-white font-mono leading-none">{score}</span>
                                                    <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">SCORE</span>
                                                </div>
                                            </div>

                                            {/* Descriptive Anomaly HUD */}
                                            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-900 flex flex-col justify-center min-h-[64px]">
                                                <p className="text-[10px] font-bold text-slate-300 tracking-wide leading-relaxed">
                                                    {item.alphaSnapshot?.whyKR || '수급 지표 분석 중...'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* VISUAL OPTION WALL HOT-ZONE SLIDER */}
                                        <div className="flex flex-col gap-1.5 px-1 py-1 bg-slate-950/30 border border-slate-900/60 rounded-xl p-2.5">
                                            <div className="flex justify-between text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                                                <span>Put Floor (${putFloor.toFixed(0)})</span>
                                                <span className="text-cyan-400 font-bold">LIVE GAP: {curPct.toFixed(0)}%</span>
                                                <span>Call Wall (${callWall.toFixed(0)})</span>
                                            </div>
                                            <div className="relative w-full h-2 bg-slate-950 rounded-full border border-slate-900 flex items-center overflow-hidden">
                                                {/* Optimal Buy Target Zone highlights */}
                                                <div 
                                                    className="absolute h-full bg-emerald-500/25 border-l border-r border-emerald-400/35"
                                                    style={{
                                                        left: `${Math.max(0, ((entryTargetMin - wallMin) / (wallMax - wallMin)) * 100)}%`,
                                                        width: `${Math.min(100, ((entryTargetMax - entryTargetMin) / (wallMax - wallMin)) * 100)}%`
                                                    }}
                                                />
                                                {/* Live Price glowing dot */}
                                                <div 
                                                    className="absolute w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] border border-white"
                                                    style={{ left: `calc(${curPct}% - 6px)` }}
                                                />
                                            </div>
                                        </div>

                                        {/* TACTICAL TARGET ENTRY */}
                                        <div className="mt-1 border-t border-slate-800/40 pt-3 flex flex-col gap-2.5">
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Target className="w-3.5 h-3.5 text-cyan-400" />
                                                    Optimal Buy Limit Range
                                                </span>
                                                <span className="text-emerald-400 font-mono font-black bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg text-xs">
                                                    ${entryTargetMin.toFixed(2)} - ${entryTargetMax.toFixed(2)}
                                                </span>
                                            </div>

                                            {/* 3-Barrier pathing limits info */}
                                            <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                                                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 flex justify-between">
                                                    <span>TAKE PROFIT (+3.5%)</span>
                                                    <strong>${takeProfit.toFixed(2)}</strong>
                                                </div>
                                                <div className="p-2 rounded bg-rose-950/20 border border-rose-500/10 text-rose-400 flex justify-between">
                                                    <span>STOP LOSS (-1.5%)</span>
                                                    <strong>${stopLoss.toFixed(2)}</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ONE-CLICK COPY BRACKET ORDER (Actual Trading Execution Weapon) */}
                                        <button
                                            onClick={() => copyBracketToClipboard(item, entryTargetMax, takeProfit, stopLoss)}
                                            className={`w-full h-10 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border ${
                                                copiedTicker === item.ticker
                                                    ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                                    : 'bg-slate-950/60 text-cyan-400 border-slate-800 hover:border-cyan-500/25 hover:bg-slate-900/60'
                                            }`}
                                        >
                                            {copiedTicker === item.ticker ? (
                                                <>
                                                    <Check className="w-4 h-4 text-emerald-400" />
                                                    BRACKET COPIED!
                                                </>
                                            ) : (
                                                <>
                                                    <Clipboard className="w-4 h-4 text-cyan-500" />
                                                    COPY ORDER BRACKET
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination HUD */}
                    {totalPages > 1 && (
                        <div className="mt-4 p-4 rounded-2xl bg-[#0b101c]/80 border border-slate-800/80 backdrop-blur-md flex justify-between items-center">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                                Page {page} of {totalPages} ({totalCount} total tickers matched)
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-400 hover:text-white"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-400 hover:text-white"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
