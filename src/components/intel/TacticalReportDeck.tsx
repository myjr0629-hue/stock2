// ============================================================================
// TacticalReportDeck v3.0 — PREMIUM POST-MARKET REPORT
// Design: Glassmorphism + Scoreboard + Newsletter + Smart Tactical Grouping
// Data source: Supabase daily_sector_snapshots
// LOCKED until next market close
// ============================================================================
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    Lock, Camera, TrendingUp, TrendingDown, Shield,
    Target, BarChart3, Brain, RefreshCw, Clock, AlertCircle,
    Swords, ShieldCheck, ArrowDownRight
} from 'lucide-react';
import type { SectorConfig, SnapshotData, TickerSnapshot, BriefingData } from '@/types/sector';

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

// Verdict grouping config
const VERDICT_GROUPS = {
    ATTACK: {
        verdicts: ['BUY_DIP'],
        icon: Swords,
        label: '공격',
        labelEN: 'BUY',
        color: '#10b981',
        borderGlow: 'rgba(16, 185, 129, 0.3)',
        emptyMsg: '공격 진입 종목 없음',
    },
    DEFEND: {
        verdicts: ['HOLD'],
        icon: ShieldCheck,
        label: '수비',
        labelEN: 'HOLD',
        color: '#f59e0b',
        borderGlow: 'rgba(245, 158, 11, 0.3)',
        emptyMsg: '보유 종목 없음',
    },
    RETREAT: {
        verdicts: ['HEDGE', 'TRIM'],
        icon: ArrowDownRight,
        label: '후퇴',
        labelEN: 'SELL',
        color: '#f43f5e',
        borderGlow: 'rgba(244, 63, 94, 0.3)',
        emptyMsg: '청산/헷지 대상 없음',
    },
};

type GroupKey = 'ATTACK' | 'DEFEND' | 'RETREAT';

// ── SVG Alpha Gauge Component ──
function AlphaGauge({ score, size = 140 }: { score: number; size?: number }) {
    const radius = (size - 20) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const startAngle = 135;
    const endAngle = 405;
    const totalArc = endAngle - startAngle;
    const scoreAngle = startAngle + (Math.min(score, 100) / 100) * totalArc;

    const polarToCartesian = (r: number, angleDeg: number) => {
        const rad = ((angleDeg - 90) * Math.PI) / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };

    const describeArc = (r: number, start: number, end: number) => {
        const s = polarToCartesian(r, start);
        const e = polarToCartesian(r, end);
        const largeArc = end - start > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
    };

    const getColor = (s: number) => {
        if (s >= 70) return '#06b6d4';
        if (s >= 50) return '#10b981';
        if (s >= 30) return '#f59e0b';
        return '#f43f5e';
    };

    const color = getColor(score);

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <path d={describeArc(radius, startAngle, endAngle)}
                fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" strokeLinecap="round" />
            <path d={describeArc(radius, startAngle, scoreAngle)}
                fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 8px ${color}80)` }} />
            <text x={cx} y={cy - 2} textAnchor="middle" fill="white"
                fontSize="32" fontWeight="900" fontFamily="'Inter', sans-serif">
                {score.toFixed(1)}
            </text>
            <text x={cx} y={cy + 18} textAnchor="middle" fill="rgba(255,255,255,0.5)"
                fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="'Inter', sans-serif">
                SECTOR ALPHA
            </text>
        </svg>
    );
}

// ── Gamma Signal Light ──
function GammaSignal({ regime, pcr }: { regime: string; pcr: number }) {
    const isLong = regime === 'LONG';
    const isShort = regime === 'SHORT';

    return (
        <div className="flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-full transition-all duration-500 ${isShort ? 'shadow-[0_0_14px_rgba(244,63,94,0.7)]' : ''}`}
                    style={{ backgroundColor: isShort ? '#f43f5e' : 'rgba(244,63,94,0.12)' }} />
                <div className={`w-6 h-6 rounded-full transition-all duration-500 ${!isLong && !isShort ? 'shadow-[0_0_14px_rgba(245,158,11,0.7)]' : ''}`}
                    style={{ backgroundColor: !isLong && !isShort ? '#f59e0b' : 'rgba(245,158,11,0.12)' }} />
                <div className={`w-6 h-6 rounded-full transition-all duration-500 ${isLong ? 'shadow-[0_0_14px_rgba(16,185,129,0.7)]' : ''}`}
                    style={{ backgroundColor: isLong ? '#10b981' : 'rgba(16,185,129,0.12)' }} />
            </div>
            <span className="text-xs font-black tracking-wider"
                style={{ color: isShort ? '#f43f5e' : isLong ? '#10b981' : '#f59e0b' }}>
                {isShort ? 'RISK OFF' : isLong ? 'RISK ON' : 'NEUTRAL'}
            </span>
            <span className="text-[10px] text-white/40 font-mono">PCR {pcr.toFixed(2)}</span>
        </div>
    );
}

// ── Render HTML string with <mark> highlights ──
function HighlightedText({ html, className }: { html: string; className?: string }) {
    const parts = html.split(/(<mark>.*?<\/mark>)/g);
    return (
        <span className={className}>
            {parts.map((part, i) => {
                if (part.startsWith('<mark>') && part.endsWith('</mark>')) {
                    const text = part.slice(6, -7);
                    return (
                        <span key={i} className="px-1 py-0.5 rounded"
                            style={{ backgroundColor: 'rgba(250, 204, 21, 0.18)', color: '#fcd34d' }}>
                            {text}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

// ── Ticker Card Component (compact, used in tactical groups) ──
function TacticalTickerCard({ t }: { t: TickerSnapshot }) {
    const isUp = t.change_pct >= 0;
    return (
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all duration-200">
            {/* Row 1: Logo + Ticker + Change */}
            <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-md bg-[#0a0f14] overflow-hidden border border-white/10 flex-shrink-0">
                    <img src={getLogoUrl(t.ticker)} alt={t.ticker}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <span className="text-[13px] font-black text-white">{t.ticker}</span>
                <span className={`text-[13px] font-black ml-auto ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isUp ? '+' : ''}{t.change_pct.toFixed(2)}%
                </span>
            </div>
            {/* Row 2: Price + Alpha */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-white">${t.close_price.toFixed(2)}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.alpha_score >= 50 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/30 text-slate-400'}`}>
                    α{t.alpha_score.toFixed(0)}
                </span>
            </div>
            {/* Row 3: Analysis — white, readable */}
            <p className="text-[11px] text-white/75 leading-relaxed">
                {t.analysis_kr}
            </p>
        </div>
    );
}


// ── Client-side briefing generator (for legacy snapshots without structured briefing) ──
function generateClientBriefing(sorted: TickerSnapshot[], summary: any): BriefingData {
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];
    const gainers = summary.gainers || 0;
    const losers = summary.losers || 0;
    const total = sorted.length;
    const allUp = losers === 0;
    const allDown = gainers === 0;
    const pcr = summary.avg_pcr || 0;
    const outlookKR = summary.outlook === 'BULLISH' ? '강세 편향' : summary.outlook === 'BEARISH' ? '약세 편향' : '중립';

    // Headline
    let headline = '';
    if (allUp) {
        headline = `전 종목 상승 마감 — ${topGainer.ticker} +${topGainer.change_pct.toFixed(2)}% 선도`;
    } else if (allDown) {
        headline = `전 종목 하락 마감 — ${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}% 최대 낙폭`;
    } else if (gainers >= losers) {
        headline = `${gainers}종 상승 vs ${losers}종 하락 — ${topGainer.ticker} 주도 혼조세`;
    } else {
        headline = `${losers}종 하락 우위 — ${topLoser.ticker} 주도 하방, 방어 모드`;
    }

    // Bullets — 5 detailed items
    const bullets: string[] = [];
    const leaderPct = topGainer.change_pct >= 0 ? '+' : '';
    bullets.push(`📈 주도주: <mark>${topGainer.ticker} ${leaderPct}${topGainer.change_pct.toFixed(2)}%</mark> — $${topGainer.close_price.toFixed(2)} 마감${gainers > 1 ? `, 외 ${gainers - 1}종 동반 상승` : ''}`);
    bullets.push(`📉 약세주: <mark>${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}%</mark> — $${topLoser.close_price.toFixed(2)} 마감${losers > 1 ? `, 외 ${losers - 1}종 동반 하락` : ''}`);

    const gammaLong = sorted.filter(t => t.gamma_regime === 'LONG').length;
    const gammaShort = total - gammaLong;
    if (gammaLong === total) {
        bullets.push(`🛡️ 감마 환경: 전 종목 <mark>Long Gamma</mark> — 변동성 억제 구간, 큰 움직임 제한적`);
    } else if (gammaShort === total) {
        bullets.push(`⚡ 감마 환경: 전 종목 <mark>Short Gamma</mark> — 변동성 확대 구간, 급등/급락 주의`);
    } else {
        bullets.push(`⚡ 감마 환경: <mark>${gammaShort}/${total}종 Short Gamma</mark> — 변동성 확대 가능, ${gammaLong}종은 Long Gamma로 안정적`);
    }

    const pcrEmoji = pcr < 0.8 ? '🟢' : pcr > 1.2 ? '🔴' : '🟡';
    const pcrComment = pcr < 0.7 ? '콜 매수 강세, 상방 기대감 형성'
        : pcr < 0.8 ? '콜 약간 우위, 완만한 상승 기대'
            : pcr > 1.3 ? '풋 매수 과열, 패닉 또는 헷지 수요 급증'
                : pcr > 1.2 ? '풋 우위, 하방 압력 감지'
                    : '콜/풋 균형, 방향성 탐색 중';
    bullets.push(`${pcrEmoji} PCR 평균 <mark>${pcr.toFixed(2)}</mark> → ${outlookKR}. ${pcrComment}`);

    const avgAlpha = summary.avg_alpha || 0;
    const highAlpha = sorted.filter(t => t.alpha_score >= 60);
    const lowAlpha = sorted.filter(t => t.alpha_score < 40);
    let alphaComment = `📊 섹터 평균 Alpha <mark>${avgAlpha.toFixed(1)}</mark>`;
    if (highAlpha.length > 0) alphaComment += ` — ${highAlpha.map(t => t.ticker).join(', ')} 고점수(60+)`;
    if (lowAlpha.length > 0) alphaComment += `, ${lowAlpha.map(t => t.ticker).join(', ')} 저점수(40-)`;
    bullets.push(alphaComment);

    // Watchpoints
    const watchpoints: string[] = [];
    sorted.forEach(t => {
        if (t.call_wall > 0 && t.close_price > 0) {
            const dist = ((t.call_wall - t.close_price) / t.close_price * 100);
            if (dist > 0 && dist < 3) {
                watchpoints.push(`🎯 ${t.ticker} Call Wall $${t.call_wall} 근접 (${dist.toFixed(1)}%), 돌파 시 감마 스퀴즈 가능`);
            }
        }
        if (t.put_floor > 0 && t.close_price > 0) {
            const dist = ((t.close_price - t.put_floor) / t.close_price * 100);
            if (dist > 0 && dist < 3) {
                watchpoints.push(`🛡️ ${t.ticker} Put Floor $${t.put_floor} 근접 (${dist.toFixed(1)}%), 하방 지지 예상`);
            }
        }
    });
    if (watchpoints.length === 0) {
        watchpoints.push(`📊 주요 옵션 레벨 근접 종목 없음 — 레인지 내 등락 예상`);
    }

    return { headline, bullets, watchpoints };
}


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
            <div className="rounded-2xl border-2 border-white/[0.08] overflow-hidden"
                style={{ background: 'linear-gradient(145deg, rgba(10,15,24,0.97), rgba(15,20,30,0.97))' }}>
                <div className="backdrop-blur-xl p-10 flex items-center justify-center min-h-[300px]">
                    <RefreshCw className="w-6 h-6 animate-spin text-white/20" />
                </div>
            </div>
        );
    }

    // ── Error/Empty state ──
    if (error || !snapshot) {
        return (
            <div className="rounded-2xl border-2 border-white/[0.08] overflow-hidden"
                style={{ background: 'linear-gradient(145deg, rgba(10,15,24,0.97), rgba(15,20,30,0.97))' }}>
                <div className="backdrop-blur-xl p-8">
                    <div className="flex items-center gap-3 mb-4">
                        <Camera className="w-4 h-4" style={{ color: accentColor }} />
                        <span className="text-xs font-bold text-white tracking-wider uppercase">
                            {config.shortName} POST-MARKET REPORT
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/50">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error || '스냅샷 데이터가 없습니다.'}</span>
                    </div>
                    <p className="text-[11px] text-white/25 mt-3">
                        장마감 후 POST /api/intel/snapshot 호출 시 자동 생성됩니다.
                    </p>
                </div>
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
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];
    const outlookColor = summary.outlook === 'BULLISH' ? '#10b981' :
        summary.outlook === 'BEARISH' ? '#f43f5e' : '#64748b';

    // Generate briefing data (from structured or client-side fallback)
    const briefing: BriefingData = summary.briefing || generateClientBriefing(sorted, summary);

    // Group tickers by verdict
    const groups: Record<GroupKey, TickerSnapshot[]> = {
        ATTACK: sorted.filter(t => VERDICT_GROUPS.ATTACK.verdicts.includes(t.verdict)),
        DEFEND: sorted.filter(t => VERDICT_GROUPS.DEFEND.verdicts.includes(t.verdict)),
        RETREAT: sorted.filter(t => VERDICT_GROUPS.RETREAT.verdicts.includes(t.verdict)),
    };

    // Determine active groups (non-empty)
    const activeGroups = (['ATTACK', 'DEFEND', 'RETREAT'] as GroupKey[]).filter(k => groups[k].length > 0);
    const emptyGroups = (['ATTACK', 'DEFEND', 'RETREAT'] as GroupKey[]).filter(k => groups[k].length === 0);

    // Smart layout: if only 1 group active, full width. If 2, 50/50. If 3, equal.
    const getColSpan = () => {
        if (activeGroups.length === 1) return 'col-span-3';
        if (activeGroups.length === 2) return 'col-span-1'; // will use a different grid
        return 'col-span-1';
    };

    // Glass panel style
    const glass = 'backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-xl';

    return (
        <div className="rounded-2xl overflow-hidden relative"
            style={{
                background: 'linear-gradient(145deg, rgba(10,15,24,0.97), rgba(15,20,30,0.97))',
                border: `2px solid ${accentColor}30`,
                boxShadow: `0 0 40px ${accentColor}10, inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}>
            {/* ── CLASSIFIED Watermark ── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0"
                style={{ opacity: 0.06 }}>
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="absolute whitespace-nowrap"
                        style={{
                            transform: 'rotate(-35deg)',
                            top: `${i * 120 - 60}px`,
                            left: '-120px',
                            fontSize: '42px',
                            fontWeight: 900,
                            letterSpacing: '18px',
                            color: 'white',
                        }}>
                        CLASSIFIED &nbsp;&nbsp; CLASSIFIED &nbsp;&nbsp; CLASSIFIED &nbsp;&nbsp; CLASSIFIED &nbsp;&nbsp; CLASSIFIED
                    </div>
                ))}
            </div>

            {/* ── Ambient glow ── */}
            <div className="absolute top-0 right-0 w-80 h-80 blur-[120px] rounded-full pointer-events-none opacity-10"
                style={{ backgroundColor: accentColor }} />
            <div className="absolute bottom-0 left-0 w-60 h-60 blur-[100px] rounded-full pointer-events-none opacity-8"
                style={{ backgroundColor: outlookColor }} />

            <div className="relative z-10 p-7">
                {/* ══════════════════════════════════════════════
                    HEADER — Emphasized border bar
                   ══════════════════════════════════════════════ */}
                <div className="flex items-center justify-between mb-7 pb-5 border-b border-white/[0.08]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${accentColor}20`, border: `1px solid ${accentColor}40` }}>
                            <Camera className="w-4.5 h-4.5" style={{ color: accentColor }} />
                        </div>
                        <div>
                            <div className="text-sm font-black text-white tracking-[0.2em] uppercase">
                                {config.shortName} POST-MARKET REPORT
                            </div>
                            <div className="text-[10px] text-white/35 font-mono mt-0.5">{timeStr} ET</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {isLocked && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
                                <Lock className="w-3 h-3" />
                                LOCKED
                            </span>
                        )}
                        <span className="text-[10px] font-bold px-3 py-1.5 rounded-lg"
                            style={{
                                backgroundColor: `${outlookColor}15`,
                                color: outlookColor,
                                border: `1px solid ${outlookColor}30`,
                            }}>
                            {summary.outlook}
                        </span>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════
                    1. SCOREBOARD PANEL
                   ══════════════════════════════════════════════ */}
                <div className={`${glass} p-6 mb-6`}>
                    <div className="grid grid-cols-3 gap-6 items-center">
                        {/* LEFT: MVP + Worst */}
                        <div className="flex flex-col gap-3">
                            {/* MVP */}
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-[#0a0f14] overflow-hidden border border-white/10 flex-shrink-0">
                                    <img src={getLogoUrl(topGainer.ticker)} alt={topGainer.ticker}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                                <div>
                                    <div className="text-[10px] text-white/50 font-bold tracking-wider">MVP</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-black text-white">{topGainer.ticker}</span>
                                        <span className={`text-base font-black ${topGainer.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {topGainer.change_pct >= 0 ? '+' : ''}{topGainer.change_pct.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* Worst */}
                            <div className="flex items-center gap-3 opacity-60">
                                <div className="w-8 h-8 rounded-lg bg-[#0a0f14] overflow-hidden border border-white/10 flex-shrink-0">
                                    <img src={getLogoUrl(topLoser.ticker)} alt={topLoser.ticker}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                                <div>
                                    <div className="text-[9px] text-white/35 font-bold tracking-wider">WORST</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white/70">{topLoser.ticker}</span>
                                        <span className="text-sm font-bold text-rose-400">
                                            {topLoser.change_pct.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* W/L Record */}
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-emerald-400 text-lg font-black">{summary.gainers}W</span>
                                <span className="text-white/25 text-base">—</span>
                                <span className="text-rose-400 text-lg font-black">{summary.losers}L</span>
                            </div>
                        </div>

                        {/* CENTER: Alpha Score Gauge */}
                        <div className="flex flex-col items-center">
                            <AlphaGauge score={summary.avg_alpha} size={140} />
                        </div>

                        {/* RIGHT: Gamma Signal Light */}
                        <div className="flex flex-col items-center">
                            <div className="text-[10px] text-white/50 font-bold tracking-wider mb-3">GAMMA REGIME</div>
                            <GammaSignal regime={summary.dominant_regime} pcr={summary.avg_pcr} />
                            <div className="flex items-center gap-3 mt-3 text-[10px] text-white/35 font-mono">
                                <span>GEX {fmtGex(summary.total_gex)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════
                    2. NEXT DAY OUTLOOK — Newsletter Style
                   ══════════════════════════════════════════════ */}
                <div className={`${glass} p-5 mb-5`}>
                    <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-4 h-4 text-amber-400" />
                        <span className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">NEXT DAY OUTLOOK</span>
                    </div>

                    {/* Headline — readable, not oversized */}
                    <h3 className="text-[15px] font-bold text-white leading-snug mb-3">
                        {briefing.headline}
                    </h3>

                    {/* Bullet Points */}
                    <div className="space-y-2 mb-4">
                        {briefing.bullets.map((bullet, i) => (
                            <div key={i} className="flex items-start gap-2 leading-relaxed">
                                <HighlightedText html={bullet} className="text-[12px] text-white/80" />
                            </div>
                        ))}
                    </div>

                    {/* Watchpoints */}
                    {briefing.watchpoints.length > 0 && (
                        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                            <div className="text-[9px] font-bold text-white/45 uppercase tracking-wider mb-1.5">WATCHPOINTS</div>
                            {briefing.watchpoints.map((wp, i) => (
                                <div key={i} className="text-[11px] text-white/65 leading-relaxed mb-1 last:mb-0">
                                    {wp}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ══════════════════════════════════════════════
                    3. TACTICAL ORDERS — Smart Grouped Layout
                   ══════════════════════════════════════════════ */}
                <div className="mb-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-4 h-4 text-purple-400" />
                        <span className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">TACTICAL ORDERS</span>
                        {/* Summary badges */}
                        <div className="flex items-center gap-1.5 ml-auto">
                            {(['ATTACK', 'DEFEND', 'RETREAT'] as GroupKey[]).map(key => {
                                const g = VERDICT_GROUPS[key];
                                const count = groups[key].length;
                                return (
                                    <span key={key} className="text-[10px] font-bold px-2.5 py-1 rounded-md"
                                        style={{
                                            backgroundColor: count > 0 ? `${g.color}15` : 'rgba(255,255,255,0.03)',
                                            color: count > 0 ? g.color : 'rgba(255,255,255,0.2)',
                                            border: `1px solid ${count > 0 ? `${g.color}25` : 'rgba(255,255,255,0.05)'}`,
                                        }}>
                                        {g.label} {count}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Active Groups (with tickers) ── */}
                    <div className={`grid gap-4 ${activeGroups.length === 1 ? 'grid-cols-1' : activeGroups.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {activeGroups.map(key => {
                            const g = VERDICT_GROUPS[key];
                            const items = groups[key];
                            const Icon = g.icon;

                            return (
                                <div key={key} className={`${glass} p-5`}
                                    style={{ borderColor: `${g.color}20` }}>
                                    {/* Group Header */}
                                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                            style={{ backgroundColor: `${g.color}15` }}>
                                            <Icon className="w-3.5 h-3.5" style={{ color: g.color }} />
                                        </div>
                                        <span className="text-sm font-black" style={{ color: g.color }}>
                                            {g.label}
                                        </span>
                                        <span className="text-xs text-white/30 font-bold ml-1">
                                            {g.labelEN}
                                        </span>
                                        <span className="text-xs font-bold ml-auto px-2 py-0.5 rounded-md"
                                            style={{ backgroundColor: `${g.color}15`, color: g.color }}>
                                            {items.length}종목
                                        </span>
                                    </div>

                                    {/* Ticker Cards — 2-col when many items */}
                                    <div className={`grid gap-2 ${items.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        {items.map(t => (
                                            <TacticalTickerCard key={t.ticker} t={t} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Empty Groups Summary Bar ── */}
                    {emptyGroups.length > 0 && (
                        <div className="mt-3 flex items-center gap-3">
                            {emptyGroups.map(key => {
                                const g = VERDICT_GROUPS[key];
                                const Icon = g.icon;
                                return (
                                    <div key={key} className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-4 py-2.5 border border-white/[0.04] flex-1">
                                        <Icon className="w-3.5 h-3.5" style={{ color: `${g.color}60` }} />
                                        <span className="text-[11px] font-bold" style={{ color: `${g.color}60` }}>
                                            {g.label}
                                        </span>
                                        <span className="text-[11px] text-white/30 ml-auto">{g.emptyMsg}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ══════════════════════════════════════════════
                    FOOTER — Signature
                   ══════════════════════════════════════════════ */}
                <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-[10px] text-white/25">
                        <Clock className="w-3.5 h-3.5" />
                        <span>스냅샷: {snapshotDate}</span>
                        {isLocked && (
                            <span className="flex items-center gap-1 ml-2">
                                <Lock className="w-2.5 h-2.5" /> Locked until next close
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-white/20 italic">
                        Generated by SIGNUM AI Core • Valid until Next Open
                    </div>
                </div>
            </div>
        </div>
    );
}
