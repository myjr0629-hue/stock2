// ============================================================================
// SectorCommanderLog — AI 장마감 브리핑
// Auto-generated structured analysis from available indicators
// 3-Part per ticker: [옵션] [구조] [판단]
// ============================================================================
'use client';

import { useMemo } from 'react';
import { FileText, Shield, BarChart3, Brain, ChevronDown, Activity } from 'lucide-react';
import { useState } from 'react';
import type { SectorConfig } from '@/types/sector';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

interface SectorCommanderLogProps {
    config: SectorConfig;
    quotes: IntelQuote[];
}

// ── Analysis generation (client-side, no API needed) ──
interface TickerBriefing {
    ticker: string;
    price: number;
    changePct: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    options: string;      // [옵션] section
    structure: string;    // [구조] section
    verdict: string;      // [판단] section
    verdictAction: string; // HOLD | BUY_DIP | HEDGE | TRIM
    bullish: boolean;
}

function generateBriefing(q: IntelQuote): TickerBriefing {
    const gex = q.gex || 0;
    const pcr = q.pcr || 1;
    const regime = q.gammaRegime || 'NEUTRAL';
    const maxPain = q.maxPain || 0;
    const callWall = q.callWall || 0;
    const putFloor = q.putFloor || 0;
    const price = q.price || 0;
    const changePct = q.changePct || 0;
    const alpha = q.alphaScore || 0;

    // Regime description
    const regimeKR = regime === 'LONG' ? 'Long Gamma 구간 (변동성 억제, 안정적 흐름)'
        : regime === 'SHORT' ? 'Short Gamma 구간 (변동성 확대 가능, 급등/급락 주의)'
            : '중립 감마 구간';

    // PCR analysis
    const pcrLevel = pcr < 0.7 ? '매우 강세' : pcr < 0.9 ? '강세' : pcr > 1.3 ? '매우 약세' : pcr > 1.1 ? '약세' : '균형';

    // MaxPain distance
    const maxPainDist = maxPain > 0 && price > 0 ? ((price - maxPain) / maxPain * 100) : 0;
    const maxPainDir = maxPainDist >= 0 ? '상단' : '하단';

    // GEX format
    const gexFmt = Math.abs(gex) >= 1e9 ? `${(gex / 1e9).toFixed(1)}B` :
        Math.abs(gex) >= 1e6 ? `${(gex / 1e6).toFixed(0)}M` : `${(gex / 1e3).toFixed(0)}K`;

    // Call Wall / Put Floor proximity
    let levelProximity = '';
    if (callWall > 0 && price > 0) {
        const distWall = ((callWall - price) / price * 100);
        if (distWall > 0 && distWall < 3) {
            levelProximity = `Call Wall $${callWall} 까지 ${distWall.toFixed(1)}% — 돌파 시 감마스퀴즈 가능.`;
        } else if (distWall <= 0) {
            levelProximity = `Call Wall $${callWall} 돌파 상태 — 추가 상승 모멘텀 확보.`;
        }
    }
    if (!levelProximity && putFloor > 0 && price > 0) {
        const distFloor = ((price - putFloor) / price * 100);
        if (distFloor > 0 && distFloor < 3) {
            levelProximity = `Put Floor $${putFloor} 까지 ${distFloor.toFixed(1)}% — 하방 지지 구간 근접.`;
        } else if (distFloor <= 0) {
            levelProximity = `Put Floor $${putFloor} 이탈 — 추가 하락 압력 주의.`;
        }
    }
    if (!levelProximity) {
        levelProximity = callWall > 0 ? `주요 레벨: Call Wall $${callWall} / Put Floor $${putFloor || '-'}.` : '주요 레벨 데이터 대기 중.';
    }

    // [옵션] section
    const optionsText = `${regimeKR}. GEX ${gexFmt}. PCR ${pcr.toFixed(2)} (${pcrLevel} 포지셔닝). Max Pain $${maxPain || '-'} 대비 ${maxPainDir} ${Math.abs(maxPainDist).toFixed(1)}% 마감. ${levelProximity}`;

    // [구조] section — based on available data
    const alphaGrade = alpha >= 70 ? 'A (최상위)' : alpha >= 50 ? 'B (양호)' : alpha >= 30 ? 'C (주의)' : 'D (경고)';
    const momentumDir = changePct > 1 ? '강한 상승 모멘텀' :
        changePct > 0 ? '소폭 상승' :
            changePct > -1 ? '소폭 하락' : '강한 하락 모멘텀';

    const structureText = `Alpha Score ${alpha.toFixed(1)} (등급 ${alphaGrade}). 금일 ${momentumDir} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%).`;

    // [판단] section — verdict logic
    let verdictAction = 'HOLD';
    let verdictText = '';

    if (alpha >= 60 && pcr < 0.8 && changePct > 0) {
        verdictAction = 'BUY_DIP';
        verdictText = `강세 신호 집중. 조정 시 진입 기회. 지지: $${putFloor || Math.round(price * 0.97)}, 목표: $${callWall || Math.round(price * 1.03)}.`;
    } else if (alpha < 35 && pcr > 1.2) {
        verdictAction = 'HEDGE';
        verdictText = `약세 신호 우세. 헷지 또는 포지션 축소 권고. 하방 주의 구간 $${putFloor || Math.round(price * 0.95)}.`;
    } else if (changePct > 2 && pcr < 0.6) {
        verdictAction = 'TRIM';
        verdictText = `과열 징후. 일부 차익실현 고려. 저항: $${callWall || Math.round(price * 1.02)}.`;
    } else if (changePct < -2 && alpha >= 45) {
        verdictAction = 'BUY_DIP';
        verdictText = `기술적 조정. 알파 양호 → 조정 매수 기회. 지지: $${putFloor || Math.round(price * 0.97)}.`;
    } else if (regime === 'SHORT' && gex < 0) {
        verdictAction = 'HOLD';
        verdictText = `Short Gamma → 양방향 변동성 주의. 방향 확인 후 대응. 핵심 레벨: Max Pain $${maxPain || '-'}.`;
    } else {
        verdictAction = 'HOLD';
        verdictText = `현 수준 유지. 뚜렷한 방향성 부재. 다음 촉매(실적, 매크로) 대기.`;
    }

    return {
        ticker: q.ticker,
        price: q.price,
        changePct: q.changePct,
        extendedPrice: q.extendedPrice,
        extendedChangePct: q.extendedChangePct,
        extendedLabel: q.extendedLabel,
        options: optionsText,
        structure: structureText,
        verdict: verdictText,
        verdictAction,
        bullish: changePct >= 0 && alpha >= 45,
    };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SectorCommanderLog({ config, quotes }: SectorCommanderLogProps) {
    const accentColor = config.theme.accentHex;
    const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

    const briefings = useMemo(() => {
        if (quotes.length === 0) return [];
        return [...quotes]
            .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
            .map(q => generateBriefing(q));
    }, [quotes]);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

    const verdictStyle: Record<string, { bg: string; text: string; label: string }> = {
        BUY_DIP: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400', label: '매수 기회' },
        HOLD: { bg: 'bg-slate-700/30 border-slate-600/30', text: 'text-slate-300', label: '보유 유지' },
        HEDGE: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', label: '헷지 권고' },
        TRIM: { bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400', label: '차익실현' },
    };

    if (briefings.length === 0) {
        return (
            <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-4">
                <div className="text-xs text-white/40">분석 데이터 로딩 중...</div>
            </div>
        );
    }

    return (
        <div className="bg-[#0a0f18]/80 backdrop-blur-lg border border-slate-800/50 rounded-xl p-5 shadow-lg">
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase">
                        {config.shortName} DAILY BRIEFING
                    </span>
                </div>
                <span className="text-[10px] text-white/40 font-mono">
                    {dateStr} {timeStr}
                </span>
            </div>

            {/* ── Ticker Briefings ── */}
            <div className="space-y-1">
                {briefings.map((b) => {
                    const isExpanded = expandedTicker === b.ticker;
                    const vs = verdictStyle[b.verdictAction] || verdictStyle.HOLD;
                    const isUp = b.changePct >= 0;

                    return (
                        <div key={b.ticker} className="border border-slate-700/30 rounded-lg overflow-hidden transition-all duration-300 hover:border-slate-600/50">
                            {/* Ticker Header Row (always visible) */}
                            <button
                                onClick={() => setExpandedTicker(isExpanded ? null : b.ticker)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-black text-white">{b.ticker}</span>
                                    <span className={`text-xs font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ${b.price.toFixed(2)} ({isUp ? '+' : ''}{b.changePct.toFixed(2)}%)
                                    </span>
                                    {b.extendedPrice > 0 && (
                                        <span className="text-[10px] text-white/30">
                                            {b.extendedLabel} ${b.extendedPrice.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${vs.bg} ${vs.text}`}>
                                        {vs.label}
                                    </span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </button>

                            {/* Expanded Analysis (3-part) */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-slate-700/20 pt-3 animate-in slide-in-from-top-2 duration-300">
                                    {/* [옵션] */}
                                    <div className="flex gap-2">
                                        <div className="flex items-start gap-1.5 flex-shrink-0 pt-0.5">
                                            <Shield className="w-3 h-3 text-purple-400" />
                                            <span className="text-[9px] font-bold text-purple-400 uppercase whitespace-nowrap">[옵션]</span>
                                        </div>
                                        <p className="text-[11px] text-white/70 leading-relaxed">{b.options}</p>
                                    </div>
                                    {/* [구조] */}
                                    <div className="flex gap-2">
                                        <div className="flex items-start gap-1.5 flex-shrink-0 pt-0.5">
                                            <BarChart3 className="w-3 h-3 text-cyan-400" />
                                            <span className="text-[9px] font-bold text-cyan-400 uppercase whitespace-nowrap">[구조]</span>
                                        </div>
                                        <p className="text-[11px] text-white/70 leading-relaxed">{b.structure}</p>
                                    </div>
                                    {/* [판단] */}
                                    <div className="flex gap-2">
                                        <div className="flex items-start gap-1.5 flex-shrink-0 pt-0.5">
                                            <Brain className="w-3 h-3 text-amber-400" />
                                            <span className="text-[9px] font-bold text-amber-400 uppercase whitespace-nowrap">[판단]</span>
                                        </div>
                                        <p className={`text-[11px] leading-relaxed font-medium ${vs.text}`}>{b.verdict}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
