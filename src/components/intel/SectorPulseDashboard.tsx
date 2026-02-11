// ============================================================================
// SectorPulseDashboard V2 — 컴팩트 카드형 + 글래스모피즘
// "누가 섹터를 주도하고, 누가 소외되었는가" — 한국어 해석 포함
// ============================================================================
'use client';

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import type { SectorConfig } from '@/types/sector';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

interface SectorPulseDashboardProps {
    config: SectorConfig;
    quotes: IntelQuote[];
}

// Helper: format large numbers
function fmtGex(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

// Korean interpretation helpers
function pcrLabel(pcr: number): string {
    if (pcr < 0.6) return '극강세';
    if (pcr < 0.8) return '강세';
    if (pcr < 1.0) return '중립';
    if (pcr < 1.2) return '약세';
    return '극약세';
}

function flowLabelKR(dir: string): string {
    if (dir === 'CALL') return '콜 자금 유입';
    if (dir === 'PUT') return '풋 헷지 우세';
    return '방향성 없음';
}

function regimeLabelKR(regime: string): string {
    if (regime === 'LONG') return '안정적 흐름';
    if (regime === 'SHORT') return '변동성 확대 주의';
    return '중립 구간';
}

export function SectorPulseDashboard({ config, quotes }: SectorPulseDashboardProps) {
    const accentColor = config.theme.accentHex;

    const analysis = useMemo(() => {
        if (quotes.length === 0) return null;

        const tickers = quotes.map(q => {
            const gex = q.gex || 0;
            const pcr = q.pcr || 1;
            const regime = q.gammaRegime || 'NEUTRAL';
            const changePct = q.changePct || 0;

            const flowScore = (1 - Math.min(pcr, 2)) + (changePct / 5);
            const flowDirection = flowScore > 0.2 ? 'CALL' : flowScore < -0.2 ? 'PUT' : 'NEUTRAL';

            return {
                ticker: q.ticker,
                gex,
                pcr,
                regime,
                changePct,
                flowScore,
                flowDirection,
            };
        });

        tickers.sort((a, b) => Math.abs(b.flowScore) - Math.abs(a.flowScore));
        const maxFlow = Math.max(...tickers.map(t => Math.abs(t.flowScore)), 0.1);

        const totalGex = tickers.reduce((s, t) => s + t.gex, 0);
        const avgPcr = tickers.reduce((s, t) => s + t.pcr, 0) / tickers.length;
        const gammaLong = tickers.filter(t => t.regime === 'LONG').length;
        const gammaShort = tickers.filter(t => t.regime === 'SHORT').length;
        const callDom = tickers.filter(t => t.flowDirection === 'CALL').length;
        const putDom = tickers.filter(t => t.flowDirection === 'PUT').length;

        const overallSentiment = avgPcr < 0.8 ? 'BULLISH' :
            avgPcr > 1.2 ? 'BEARISH' : 'NEUTRAL';

        // Korean insight for footer
        const gexInsight = totalGex > 0
            ? '딜러 롱감마 → 주가 안정 기여'
            : '딜러 숏감마 → 변동성 확대 가능';
        const pcrInsight = avgPcr < 0.8
            ? '콜 옵션 우세 → 강세 포지셔닝'
            : avgPcr > 1.1
                ? '풋 옵션 우세 → 약세/헷지 포지셔닝'
                : '풋콜 균형 → 방향성 탐색 중';
        const gammaInsight = gammaShort > gammaLong
            ? `${gammaShort}종목 Short Gamma → 급변동 가능`
            : gammaLong > 0
                ? `${gammaLong}종목 Long Gamma → 안정적 흐름`
                : '감마 환경 중립';

        return {
            tickers,
            maxFlow,
            totalGex,
            avgPcr,
            gammaLong,
            gammaShort,
            callDom,
            putDom,
            overallSentiment,
            gexInsight,
            pcrInsight,
            gammaInsight,
        };
    }, [quotes]);

    if (!analysis) {
        return (
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
                <div className="text-xs text-white/40">Loading flow data...</div>
            </div>
        );
    }

    const sentimentColor = analysis.overallSentiment === 'BULLISH' ? '#10b981' :
        analysis.overallSentiment === 'BEARISH' ? '#f43f5e' : '#94a3b8';
    const sentimentKR = analysis.overallSentiment === 'BULLISH' ? '강세' :
        analysis.overallSentiment === 'BEARISH' ? '약세' : '중립';

    return (
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-white/[0.05]">
                        <Zap className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    </div>
                    <span className="text-[11px] font-bold text-white/90 tracking-wider uppercase">
                        {config.shortName} 자금 흐름
                    </span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md"
                    style={{
                        backgroundColor: `${sentimentColor}15`,
                        color: sentimentColor,
                        border: `1px solid ${sentimentColor}30`,
                    }}>
                    {sentimentKR}
                </span>
            </div>

            {/* ── Compact Ticker Rows ── */}
            <div className="space-y-1.5 mb-4">
                {analysis.tickers.map(t => {
                    const barWidth = Math.max(8, (Math.abs(t.flowScore) / analysis.maxFlow) * 100);
                    const isCall = t.flowDirection === 'CALL';
                    const isPut = t.flowDirection === 'PUT';
                    const barColor = isCall ? '#10b981' : isPut ? '#f43f5e' : '#475569';

                    const regimeColor = t.regime === 'LONG' ? '#06b6d4' :
                        t.regime === 'SHORT' ? '#f59e0b' : '#64748b';

                    return (
                        <div key={t.ticker}
                            className="bg-white/[0.02] backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-2.5 hover:bg-white/[0.04] transition-all group">
                            {/* Row 1: Ticker + Flow description + PCR */}
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-xs font-black text-white/90 w-12">{t.ticker}</span>
                                    <span className={`text-[10px] font-semibold ${isCall ? 'text-emerald-400' : isPut ? 'text-rose-400' : 'text-slate-400'}`}>
                                        {flowLabelKR(t.flowDirection)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-medium" style={{ color: regimeColor }}>
                                        {regimeLabelKR(t.regime)}
                                    </span>
                                    <span className="text-[10px] text-white/70 font-mono bg-white/[0.05] px-1.5 py-0.5 rounded">
                                        PCR {t.pcr.toFixed(2)} <span className={`${t.pcr < 0.8 ? 'text-emerald-400' : t.pcr > 1.1 ? 'text-rose-400' : 'text-white/40'}`}>({pcrLabel(t.pcr)})</span>
                                    </span>
                                </div>
                            </div>

                            {/* Row 2: Thin flow bar */}
                            <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                    style={{
                                        width: `${barWidth}%`,
                                        backgroundColor: barColor,
                                        boxShadow: `0 0 8px ${barColor}40`,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Aggregate Footer (with Korean insights) ── */}
            <div className="border-t border-white/[0.06] pt-3">
                <div className="grid grid-cols-3 gap-3">
                    {/* Total GEX */}
                    <div className="bg-white/[0.03] backdrop-blur-md rounded-lg p-3 border border-white/[0.05]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-white/40 font-bold uppercase">총 GEX</span>
                            <span className={`text-sm font-black ${analysis.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {analysis.totalGex > 0 ? '+' : ''}{fmtGex(analysis.totalGex)}
                            </span>
                        </div>
                        <p className="text-[9px] text-white/30 leading-tight">{analysis.gexInsight}</p>
                    </div>

                    {/* Avg PCR */}
                    <div className="bg-white/[0.03] backdrop-blur-md rounded-lg p-3 border border-white/[0.05]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-white/40 font-bold uppercase">평균 PCR</span>
                            <span className={`text-sm font-black ${analysis.avgPcr < 0.8 ? 'text-emerald-400' : analysis.avgPcr > 1.1 ? 'text-rose-400' : 'text-white/80'}`}>
                                {analysis.avgPcr.toFixed(2)}
                            </span>
                        </div>
                        <p className="text-[9px] text-white/30 leading-tight">{analysis.pcrInsight}</p>
                    </div>

                    {/* Gamma */}
                    <div className="bg-white/[0.03] backdrop-blur-md rounded-lg p-3 border border-white/[0.05]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-white/40 font-bold uppercase">감마 환경</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-cyan-400">{analysis.gammaLong}L</span>
                                <span className="text-[8px] text-white/20">/</span>
                                <span className="text-xs font-bold text-amber-400">{analysis.gammaShort}S</span>
                            </div>
                        </div>
                        <p className="text-[9px] text-white/30 leading-tight">{analysis.gammaInsight}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
