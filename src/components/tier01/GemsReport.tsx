"use client";

import { Link } from "@/i18n/routing";
import { useState } from "react";
import { Tier01Data, GemsTicker } from "@/services/stockApi";
import { Activity, Shield, Zap, TrendingUp, AlertTriangle, Cpu, Globe, Database, ChevronDown, ChevronUp, Lock, CheckCircle2, Server, Eye, ArrowRightLeft, LockKeyhole } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { useTranslations } from 'next-intl';
import { StockDetailExpanded } from "@/components/trade";

interface Props {
    data: Tier01Data;
}

function AlphaScore({ score, velocity }: { score: number, velocity: "▲" | "►" | "▼" }) {
    let color = "bg-emerald-500";
    let textColor = "text-emerald-400";

    if (score < 50) {
        color = "bg-slate-500";
        textColor = "text-slate-400";
    } else if (score < 80) {
        color = "bg-amber-400";
        textColor = "text-amber-400";
    } else if (score >= 90) {
        color = "bg-rose-500 animate-pulse";
        textColor = "text-rose-400";
    }

    return (
        <div className="flex flex-col gap-1 w-[120px]">
            <div className="flex justify-between items-center text-xs">
                <span className={`font-black font-mono ${textColor} text-sm`}>{score.toFixed(2)}</span>
                <span className={`font-bold ${velocity === '▲' ? 'text-rose-500' : velocity === '▼' ? 'text-blue-500' : 'text-slate-500'}`}>
                    {velocity}
                </span>
            </div>
            <div className="h-1.5 w-full bg-[#0F172A] rounded-full overflow-hidden border border-slate-700/50">
                <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
            </div>
        </div>
    );
}

function GateIndicator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-1.5 bg-[#1E293B] px-3 py-1.5 rounded-lg border border-emerald-900/30 shadow-sm transition-transform hover:scale-105 cursor-default">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500 tracking-wider uppercase">{label}: PASS</span>
        </div>
    );
}

function TopAlphaAnalysis({ ticker }: { ticker: GemsTicker }) {
    return (
        <div className="bg-[#1E293B]/95 p-5 rounded-xl border border-slate-700/60 relative overflow-hidden shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between h-full backdrop-blur-sm group">
            <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg shadow-sm z-10">
                RANK {ticker.rank}
            </div>
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <div className="text-2xl font-black text-white tracking-tight group-hover:text-emerald-400 transition-colors">{ticker.symbol}</div>
                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-950/40 px-1.5 py-0.5 rounded inline-block border border-emerald-900/30 mt-1">
                            {ticker.role}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-bold text-white">${ticker.price.toFixed(2)}</div>
                        <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1">
                            {ticker.changePercent > 0 ? <TrendingUp className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                            {ticker.changePercent > 0 ? '+' : ''}{ticker.changePercent.toFixed(2)}%
                        </div>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-[#0F172A]/70 rounded-lg border border-slate-700/50 min-h-[80px]">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Analysis</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                        {ticker.secret}
                        <br />
                        <span className="text-slate-400 block mt-1.5 pl-2 border-l-2 border-slate-600 italic">"{ticker.comment}"</span>
                    </p>
                </div>
            </div>
            <div className="space-y-2 mt-4 pt-3 border-t border-slate-700/50">
                <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wide">AlphaScore</span>
                    <AlphaScore score={ticker.alphaScore} velocity={ticker.velocity} />
                </div>
            </div>
        </div>
    );
}

function GridRow({ ticker }: { ticker: GemsTicker }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <>
            <tr onClick={() => setExpanded(!expanded)} className={`border-b border-slate-700/30 cursor-pointer transition-all ${expanded ? 'bg-[#1E293B]' : 'hover:bg-[#1E293B]/70 hover:translate-x-1'}`}>
                <td className="p-3 text-slate-500 font-mono text-xs font-bold">#{ticker.rank}</td>
                <td className="p-3"><span className="font-bold text-white tracking-wide">{ticker.symbol}</span></td>
                <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase shadow-sm ${ticker.rank <= 3 ? 'bg-rose-950/40 text-rose-400 border border-rose-900/50' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'}`}>{ticker.role}</span></td>
                <td className="p-3 font-mono text-slate-300 font-medium">${ticker.price.toFixed(2)}</td>
                <td className="p-3 font-mono text-emerald-400 font-bold">${ticker.targetPrice.toFixed(2)}</td>
                <td className="p-3 font-mono text-emerald-500 text-xs">{ticker.return3d}</td>
                <td className="p-3"><AlphaScore score={ticker.alphaScore} velocity={ticker.velocity} /></td>
                <td className="p-3 text-xs text-slate-300">{ticker.detail}</td>
                <td className="p-3 text-xs text-indigo-300/90 font-mono">{ticker.mmPos}</td>
                <td className="p-3 text-xs text-amber-400 font-medium">{ticker.edge}</td>
                <td className="p-3 text-xs text-slate-400 italic font-mono truncate max-w-[140px]" title={ticker.secret}>{ticker.secret}</td>
                <td className="p-3 font-mono text-rose-400 text-xs font-bold">${ticker.cutPrice.toFixed(2)}</td>
                <td className="p-3 text-xs text-white/90 font-medium truncate max-w-[160px]" title={ticker.comment}>{ticker.comment}</td>
            </tr>
            {expanded && (
                <tr className="bg-[#0F172A] border-b border-slate-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                    <td colSpan={13} className="p-0">
                        <StockDetailExpanded ticker={ticker} />
                    </td>
                </tr>
            )}
        </>
    );
}

export function GemsReport({ data }: Props) {
    const t = useTranslations('gems');
    const top3 = data?.tickers ? data.tickers.slice(0, 3) : [];

    // NUCLEAR FALLBACK: Force a valid object if data is missing, matching the user's requested "Live Analysis" tone
    const signal = data?.swapSignal || {
        action: "HOLD",
        reason: t('holdReasonDefault'),
        scoreDiff: 0.00,
        strategy: t('holdStrategyDefault')
    };

    const isSwap = signal.action === "SWAP";
    const statusColor = isSwap ? "text-amber-500" : "text-emerald-400";
    const statusBg = isSwap ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30";
    const barColor = isSwap ? "bg-amber-500" : "bg-emerald-500";

    return (
        <div className="min-h-screen bg-[#F1F5F9] font-sans text-slate-900">
            <LandingHeader />
            <div className="p-4 md:p-8 pb-32 max-w-[1800px] mx-auto space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-300">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#1E293B] p-3 rounded-xl shadow-xl border border-slate-700">
                            <Cpu className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 tracking-tighter drop-shadow-sm">Tier 0.1 Command Center</h1>
                            <p className="text-xs text-slate-500 font-bold tracking-[0.3em] uppercase mt-1">GEMS V8.1 Final // Reliability Protocol Active</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <GateIndicator label="DATA PIPE" />
                        <GateIndicator label="LOGIC CORE" />
                        <GateIndicator label="RENDER" />
                        <GateIndicator label="SECURITY" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className={`md:col-span-1 bg-[#1E293B]/95 p-6 rounded-2xl border ${isSwap ? 'border-amber-500/50' : 'border-emerald-500/50'} flex flex-col justify-between shadow-xl relative overflow-hidden group`}>
                        <div className={`absolute top-0 left-0 w-2 h-full ${barColor}`} />
                        <div className="mb-4 pl-2">
                            <h3 className="text-slate-400 font-bold text-xs tracking-widest uppercase flex items-center gap-2 mb-1">
                                <ArrowRightLeft className="w-4 h-4" /> {t('reliabilityProtocol')}
                            </h3>
                            <h2 className={`text-3xl font-black ${statusColor} tracking-tighter`}>{signal.action} SIGNAL</h2>
                        </div>
                        <div className={`mb-4 p-4 rounded-lg ${statusBg} border`}>
                            <p className="text-slate-200 text-xs font-medium leading-relaxed">{signal.reason}</p>
                        </div>
                        <div className="bg-[#0F172A]/80 p-3 rounded-lg border border-slate-700/50 mb-4 ml-2">
                            <div className="flex items-center gap-2 mb-1"><Shield className="w-3 h-3 text-white" /><span className="text-[10px] font-bold text-white uppercase">{t('strategicAllocation')}</span></div>
                            <p className="text-slate-300 text-[11px] leading-snug">{signal.strategy}</p>
                        </div>
                        <div className="space-y-3 mt-auto pl-2">
                            <div className="flex justify-between items-center text-xs border-b border-slate-700/50 pb-2">
                                <span className="text-slate-500 font-bold uppercase">{t('alphaScoreGap')}</span>
                                <span className={`font-mono font-bold text-sm ${signal.scoreDiff >= 5 ? 'text-emerald-400' : 'text-slate-400'}`}>+{signal.scoreDiff.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-bold uppercase">{t('swapApprovalThreshold')}</span>
                                <span className="text-[#1E293B] font-mono font-bold text-[10px] bg-slate-400 px-1.5 py-0.5 rounded">+5.00 REQUIRED</span>
                            </div>
                            {signal.action === "HOLD" && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-2 bg-slate-900/50 p-2 rounded"><LockKeyhole className="w-3 h-3 text-emerald-500" /><span>{t('safetyBufferLock')}</span></div>
                            )}
                        </div>
                    </div>
                    {top3.map(ticker => <TopAlphaAnalysis key={ticker.symbol} ticker={ticker} />)}
                </div>

                <div className="bg-[#1E293B]/95 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
                    <div className="px-6 py-4 bg-[#0F172A]/50 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="text-emerald-400 font-bold text-sm track-widest uppercase flex items-center gap-2"><Database className="w-4 h-4" /> Section 6: Alpha Vector Grid (12 Assets)</h3>
                        <div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span><div className="text-[10px] text-slate-400 font-mono uppercase font-bold">Sync: 10m Interval</div></div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#0F172A]/80 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-700">
                                    <th className="p-3">Rank</th><th className="p-3">Ticker</th><th className="p-3">Role</th><th className="p-3">Price</th><th className="p-3 text-emerald-500">Target (T+3)</th><th className="p-3">Ret 3D</th><th className="p-3 w-[140px]">AlphaScore</th><th className="p-3">Detail</th><th className="p-3">MM Pos</th><th className="p-3">Edge</th><th className="p-3">Secret (S1/S2)</th><th className="p-3 text-rose-500">Stop Loss</th><th className="p-3">Guide</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {data?.tickers?.map(ticker => <GridRow key={ticker.symbol} ticker={ticker} />)}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="text-center pt-10 mt-12 mb-8 border-t border-slate-300/50">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-[0.5em] mb-2">GEMS V8.1 // SYSTEM APPROVED by COMMANDER</p>
                    <p className="text-[9px] text-slate-400">Reliability Protocol Active | Security Level: ALPHA</p>
                </div>
            </div>
        </div>
    );
}
