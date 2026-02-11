// ============================================================================
// TacticalReportDeck — 장마감 고정 스냅샷 보고서
// Data source: Supabase daily_sector_snapshots
// LOCKED until next market close
// ============================================================================
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    Lock, Camera, TrendingUp, TrendingDown, Shield,
    Target, BarChart3, Brain, RefreshCw, Clock, AlertCircle
} from 'lucide-react';
import type { SectorConfig, SnapshotData, TickerSnapshot } from '@/types/sector';

interface TacticalReportDeckProps {
    config: SectorConfig;
}

// ── Helpers ──
function fmtGex(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

function getLogoUrl(ticker: string): string {
    return `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;
}

const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; label: string; labelKR: string }> = {
    BUY_DIP: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'BUY DIP', labelKR: '매수 기회' },
    HOLD: { bg: 'bg-slate-700/30', border: 'border-slate-600/30', text: 'text-slate-300', label: 'HOLD', labelKR: '보유 유지' },
    HEDGE: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: 'HEDGE', labelKR: '헷지 권고' },
    TRIM: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', label: 'TRIM', labelKR: '차익실현' },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TacticalReportDeck({ config }: TacticalReportDeckProps) {
    const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
    const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const accentColor = config.theme.accentHex;

    const fetchSnapshot = useCallback(async () => {
        try {
            const res = await fetch(config.apiEndpoints.snapshot, { cache: 'no-store' });
            if (!res.ok) {
                if (res.status === 404) {
                    setError('아직 스냅샷이 생성되지 않았습니다. 장마감 후 자동 생성됩니다.');
                } else {
                    setError('스냅샷 로드 실패');
                }
                setLoading(false);
                return;
            }
            const text = await res.text();
            if (!text) { setError('빈 응답'); setLoading(false); return; }
            let data: any;
            try { data = JSON.parse(text); } catch { setError('JSON 파싱 오류'); setLoading(false); return; }

            if (data.success && data.snapshot) {
                setSnapshot(data.snapshot);
                setSnapshotDate(data.snapshot_date);
                setError(null);
            } else {
                setError('스냅샷 데이터가 없습니다.');
            }
        } catch (e: any) {
            setError('네트워크 오류');
        } finally {
            setLoading(false);
        }
    }, [config.apiEndpoints.snapshot]);

    useEffect(() => {
        fetchSnapshot();
    }, [fetchSnapshot]);

    // ── Loading state ──
    if (loading) {
        return (
            <div className="bg-[#0a0f18]/80 backdrop-blur-lg border border-slate-800/50 rounded-xl p-8 flex items-center justify-center min-h-[200px]">
                <RefreshCw className="w-5 h-5 animate-spin text-white/30" />
            </div>
        );
    }

    // ── Error/Empty state ──
    if (error || !snapshot) {
        return (
            <div className="bg-[#0a0f18]/80 backdrop-blur-lg border border-slate-800/50 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                    <Camera className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase">
                        {config.shortName} POST-MARKET REPORT
                    </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/40">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error || '스냅샷 데이터가 없습니다.'}</span>
                </div>
                <p className="text-[10px] text-white/20 mt-2">
                    장마감 후 POST /api/intel/snapshot 호출 시 자동 생성됩니다.
                </p>
            </div>
        );
    }

    const { tickers, sector_summary: summary, meta } = snapshot;
    const snapshotTime = new Date(meta.snapshot_timestamp);
    const lockedUntil = new Date(meta.locked_until);
    const isLocked = new Date() < lockedUntil;

    const timeStr = snapshotTime.toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });

    const sorted = [...tickers].sort((a, b) => b.change_pct - a.change_pct);
    const outlookColor = summary.outlook === 'BULLISH' ? '#10b981' :
        summary.outlook === 'BEARISH' ? '#f43f5e' : '#64748b';

    return (
        <div className="bg-[#0a0f18]/80 backdrop-blur-lg border border-slate-800/50 rounded-xl p-5 shadow-lg relative overflow-hidden">
            {/* Ambient background */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 blur-[80px] rounded-full pointer-events-none opacity-20"
                style={{ backgroundColor: accentColor }} />

            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-5 relative z-10">
                <div className="flex items-center gap-3">
                    <Camera className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase">
                        {config.shortName} POST-MARKET REPORT
                    </span>
                    <span className="text-[9px] text-white/30 font-mono">{timeStr}</span>
                </div>
                <div className="flex items-center gap-2">
                    {isLocked && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                            <Lock className="w-2.5 h-2.5" />
                            LOCKED
                        </span>
                    )}
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                            backgroundColor: `${outlookColor}1a`,
                            color: outlookColor,
                        }}>
                        {summary.outlook}
                    </span>
                </div>
            </div>

            {/* ── Ticker Cards Grid ── */}
            <div className="grid grid-cols-4 gap-2 mb-5 relative z-10">
                {sorted.map((t) => {
                    const vs = VERDICT_STYLES[t.verdict] || VERDICT_STYLES.HOLD;
                    const isUp = t.change_pct >= 0;
                    const regimeColor = t.gamma_regime === 'LONG' ? '#06b6d4' :
                        t.gamma_regime === 'SHORT' ? '#f59e0b' : '#64748b';

                    return (
                        <div key={t.ticker}
                            className={`p-3 rounded-lg border bg-slate-800/30 backdrop-blur-md ${vs.border} hover:bg-slate-800/50 transition-all`}>
                            {/* Row 1: Ticker + Verdict */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-[#0a0f14] overflow-hidden border border-white/10">
                                        <img src={getLogoUrl(t.ticker)} alt={t.ticker}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    </div>
                                    <span className="text-xs font-black text-white">{t.ticker}</span>
                                </div>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${vs.bg} ${vs.text}`}>
                                    {vs.label}
                                </span>
                            </div>

                            {/* Row 2: Price + Change */}
                            <div className="mb-2">
                                <div className="text-sm font-black text-white">${t.close_price.toFixed(2)}</div>
                                <div className={`text-[10px] font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{t.change_pct.toFixed(2)}%
                                </div>
                            </div>

                            {/* Row 3: Alpha + Key Levels */}
                            <div className="grid grid-cols-2 gap-1 mb-2">
                                <div className="text-center bg-slate-900/50 rounded px-1 py-1">
                                    <div className="text-[7px] text-white/30">ALPHA</div>
                                    <div className={`text-[10px] font-bold ${t.alpha_score >= 50 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                        {t.alpha_score.toFixed(1)}
                                    </div>
                                </div>
                                <div className="text-center bg-slate-900/50 rounded px-1 py-1">
                                    <div className="text-[7px] text-white/30">GEX</div>
                                    <div className={`text-[10px] font-bold ${t.gex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {fmtGex(t.gex)}
                                    </div>
                                </div>
                            </div>

                            {/* Row 4: Gamma regime */}
                            <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: regimeColor }} />
                                <span className="text-[8px] font-medium" style={{ color: regimeColor }}>
                                    {t.gamma_regime || 'NEUTRAL'}
                                </span>
                                <span className="text-[8px] text-white/20 ml-auto">PCR {t.pcr.toFixed(2)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── SESSION RECAP ── */}
            <div className="border-t border-slate-700/30 pt-4 mb-4 relative z-10">
                <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">SESSION RECAP</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                        <div className="text-[8px] text-white/40 uppercase mb-1">결과</div>
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-lg font-black text-emerald-400">{summary.gainers}↑</span>
                            <span className="text-white/20">/</span>
                            <span className="text-lg font-black text-rose-400">{summary.losers}↓</span>
                        </div>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                        <div className="text-[8px] text-white/40 uppercase mb-1">평균 알파</div>
                        <div className={`text-lg font-black ${summary.avg_alpha >= 50 ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {summary.avg_alpha.toFixed(1)}
                        </div>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                        <div className="text-[8px] text-white/40 uppercase mb-1">감마 환경</div>
                        <div className="text-lg font-black" style={{
                            color: summary.dominant_regime === 'LONG' ? '#06b6d4' : '#f59e0b'
                        }}>
                            {summary.dominant_regime}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── NEXT DAY OUTLOOK ── */}
            <div className="border-t border-slate-700/30 pt-4 mb-4 relative z-10">
                <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">NEXT DAY OUTLOOK</span>
                </div>
                <div className="bg-slate-800/20 rounded-lg p-4 border border-slate-700/20">
                    <p className="text-[11px] text-white/70 leading-relaxed">
                        {summary.next_day_briefing_kr}
                    </p>
                </div>
            </div>

            {/* ── TACTICAL ORDERS ── */}
            <div className="border-t border-slate-700/30 pt-4 relative z-10">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">TACTICAL ORDERS</span>
                </div>
                <div className="space-y-1.5">
                    {sorted.map(t => {
                        const vs = VERDICT_STYLES[t.verdict] || VERDICT_STYLES.HOLD;
                        return (
                            <div key={t.ticker} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/20 hover:bg-slate-800/40 transition-colors">
                                <span className="text-xs font-bold text-white w-10">{t.ticker}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${vs.bg} ${vs.text}`}>
                                    {vs.labelKR}
                                </span>
                                <span className="text-[10px] text-white/50 flex-1 truncate">
                                    {t.analysis_kr}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Footer: Lock status ── */}
            <div className="mt-4 pt-3 border-t border-slate-700/20 flex items-center justify-between text-[9px] text-white/20 relative z-10">
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>스냅샷: {snapshotDate}</span>
                </div>
                {isLocked && (
                    <span className="flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Next update after market close
                    </span>
                )}
            </div>
        </div>
    );
}
