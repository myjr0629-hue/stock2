'use client';

// ============================================================================
// MobileSectorReport — Post-Market Tactical Report (Mobile)
// Fetches from /api/intel/snapshot?sector=X and renders premium report
// ISOLATED from web: no shared layout impact
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { Loader2, FileText, TrendingUp, Shield, Target, Eye, Activity, BarChart3, Brain, Newspaper, CircleDot, Swords, ShieldCheck, ArrowDownRight, ArrowRight, Gauge, Zap } from 'lucide-react';
import type { SectorDefBase } from '@/configs/intelSectors';

// ── Sector key → API sector_id mapping ──
const KEY_TO_ID: Record<string, string> = {
    m7: 'm7', physicalAI: 'physical_ai', siliconCore: 'silicon_core',
    powerMatrix: 'power_matrix', bioPulse: 'bio_pulse', cyberShield: 'cyber_shield',
    orbitDefense: 'orbit_defense', quantumEdge: 'quantum_edge', fintechPulse: 'fintech_pulse',
    cloudFortress: 'cloud_fortress',
};

function fmtGex(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

const LOGO_URL = (t: string) => `https://assets.parqet.com/logos/symbol/${t}?format=png`;

// Highlighted text renderer (<mark> → styled spans)
function Hl({ html, className }: { html: string; className?: string }) {
    const parts = html.split(/(<mark>.*?<\/mark>)/g);
    return (
        <span className={className}>
            {parts.map((p, i) => {
                if (p.startsWith('<mark>') && p.endsWith('</mark>')) {
                    return <span key={i} className="px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(250,204,21,0.18)', color: '#fcd34d' }}>{p.slice(6, -7)}</span>;
                }
                return <span key={i}>{p}</span>;
            })}
        </span>
    );
}

// Verdict group config
const VERDICT_GROUPS = {
    ATTACK: { verdicts: ['BUY_DIP', 'OVERSOLD_ZONE'], color: '#10b981', label: 'BULLISH', Icon: Swords },
    DEFEND: { verdicts: ['HOLD'], color: '#f59e0b', label: 'NEUTRAL', Icon: ShieldCheck },
    RETREAT: { verdicts: ['HEDGE', 'TRIM', 'ELEVATED_RISK', 'OVERBOUGHT_ZONE'], color: '#f43f5e', label: 'BEARISH', Icon: ArrowDownRight },
} as const;

type GroupKey = keyof typeof VERDICT_GROUPS;

interface MobileSectorReportProps {
    sector: SectorDefBase;
}

export function MobileSectorReport({ sector }: MobileSectorReportProps) {
    const locale = useLocale();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const sectorId = KEY_TO_ID[sector.key as string] || sector.key;
        setLoading(true);
        setError(null);
        fetch(`/api/intel/snapshot?sector=${sectorId}`, { cache: 'no-store' })
            .then(r => {
                if (r.status === 404) { setError('no_report'); return null; }
                if (!r.ok) { setError('fetch_fail'); return null; }
                return r.json();
            })
            .then(d => {
                if (d?.success && d?.snapshot) setData(d);
                else if (!error) setError('no_data');
            })
            .catch(() => setError('network'))
            .finally(() => setLoading(false));
    }, [sector.key]);

    // ── Loading ──
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: sector.accentHex }} />
                <span className="text-[14px] text-slate-400 font-semibold">Loading report...</span>
            </div>
        );
    }

    // ── Error / No Report ──
    if (error || !data) {
        return (
            <div className="py-16 text-center">
                <FileText className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                <p className="text-[15px] text-slate-400 font-semibold mb-1">
                    {error === 'no_report' ? 'No report yet' : 'Report unavailable'}
                </p>
                <p className="text-[13px] text-slate-500">
                    Reports generate automatically after market close (4:00 PM ET)
                </p>
            </div>
        );
    }

    const snap = data.snapshot;
    const { tickers, sector_summary: summary, meta } = snap;
    const sorted = [...tickers].sort((a: any, b: any) => b.change_pct - a.change_pct);
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];
    const outlookColor = summary.outlook === 'BULLISH' ? '#10b981' : summary.outlook === 'BEARISH' ? '#f43f5e' : '#64748b';

    // Briefing
    const rawBrief = summary.briefing || {};
    const headline = locale === 'en' ? (rawBrief.headlineEN || rawBrief.headline) : locale === 'ja' ? (rawBrief.headlineJP || rawBrief.headline) : rawBrief.headline || '';
    const bullets = locale === 'en' ? (rawBrief.bulletsEN?.length ? rawBrief.bulletsEN : rawBrief.bullets) : locale === 'ja' ? (rawBrief.bulletsJP?.length ? rawBrief.bulletsJP : rawBrief.bullets) : rawBrief.bullets || [];
    const watchpoints = locale === 'en' ? (rawBrief.watchpointsEN?.length ? rawBrief.watchpointsEN : rawBrief.watchpoints) : locale === 'ja' ? (rawBrief.watchpointsJP?.length ? rawBrief.watchpointsJP : rawBrief.watchpoints) : rawBrief.watchpoints || [];

    // Verdict groups
    const groups: Record<GroupKey, any[]> = {
        ATTACK: sorted.filter((t: any) => VERDICT_GROUPS.ATTACK.verdicts.includes(t.verdict)),
        DEFEND: sorted.filter((t: any) => VERDICT_GROUPS.DEFEND.verdicts.includes(t.verdict)),
        RETREAT: sorted.filter((t: any) => VERDICT_GROUPS.RETREAT.verdicts.includes(t.verdict)),
    };

    const timeStr = new Date(meta.snapshot_timestamp).toLocaleString('en-US', {
        timeZone: 'America/New_York', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });

    // News
    const newsItems = summary.newsDigest || [];

    // Icons for bullets
    const BULLET_ICONS = [TrendingUp, Shield, Gauge, BarChart3, Activity, Target];

    return (
        <div className="space-y-4 animate-in fade-in duration-300">

            {/* ══ HEADER ══ */}
            <div className="relative rounded-xl border overflow-hidden p-4"
                style={{ borderColor: `${sector.accentHex}25`, background: `linear-gradient(135deg, ${sector.accentHex}08, ${sector.accentHex}02)` }}>
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${sector.accentHex}60, transparent)` }} />
                <div className="flex items-center gap-2 mb-1.5">
                    <FileText className="w-4 h-4" style={{ color: sector.accentHex }} />
                    <span className="text-[14px] font-bold tracking-[0.1em] uppercase" style={{ color: sector.accentHex }}>Post-Market Report</span>
                </div>
                <div className="flex items-center gap-2.5 pl-6">
                    <span className="text-[13px] text-slate-400 font-mono">{timeStr} ET</span>
                    <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: `${outlookColor}15`, color: outlookColor, border: `1px solid ${outlookColor}30` }}>
                        {summary.outlook}
                    </span>
                </div>
            </div>

            {/* ══ SCOREBOARD ══ */}
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="grid grid-cols-3 gap-3 items-center">
                    {/* MVP + Worst */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-[#0a0f14] overflow-hidden border border-white/10 shrink-0">
                                <img src={LOGO_URL(topGainer.ticker)} alt="" className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <div>
                                <div className="text-[11px] text-white/60 font-bold tracking-wider">MVP</div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[14px] font-bold text-white">{topGainer.ticker}</span>
                                    <span className={`text-[13px] font-bold font-mono ${topGainer.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {topGainer.change_pct >= 0 ? '+' : ''}{topGainer.change_pct.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-60">
                            <div className="w-6 h-6 rounded-md bg-[#0a0f14] overflow-hidden border border-white/10 shrink-0">
                                <img src={LOGO_URL(topLoser.ticker)} alt="" className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <div>
                                <div className="text-[10px] text-white/50 font-bold tracking-wider">WORST</div>
                                <span className="text-[12px] font-bold text-rose-400 font-mono">{topLoser.ticker} {topLoser.change_pct.toFixed(2)}%</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-emerald-400 text-[16px] font-bold font-mono">{summary.gainers}W</span>
                            <span className="text-white/30">—</span>
                            <span className="text-rose-400 text-[16px] font-bold font-mono">{summary.losers}L</span>
                        </div>
                    </div>

                    {/* Context Score Gauge */}
                    <div className="flex flex-col items-center">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                            {(() => {
                                const score = summary.avg_alpha || 0;
                                const r = 38, cx = 50, cy = 50;
                                const start = 135, end = 405;
                                const scoreAngle = start + (Math.min(score, 100) / 100) * (end - start);
                                const polar = (a: number) => ({ x: cx + r * Math.cos(((a - 90) * Math.PI) / 180), y: cy + r * Math.sin(((a - 90) * Math.PI) / 180) });
                                const arc = (s: number, e: number) => { const sp = polar(s), ep = polar(e); return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`; };
                                const c = score >= 70 ? '#06b6d4' : score >= 50 ? '#10b981' : score >= 30 ? '#f59e0b' : '#f43f5e';
                                return (
                                    <>
                                        <path d={arc(start, end)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round" />
                                        <path d={arc(start, scoreAngle)} fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${c}80)` }} />
                                        <text x={cx} y={cy} textAnchor="middle" fill="white" fontSize="26" fontWeight="900" fontFamily="'Inter', monospace" dominantBaseline="central">{score.toFixed(0)}</text>
                                        <text x={cx} y={cy + 17} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontWeight="700" letterSpacing="1.5">CONTEXT</text>
                                    </>
                                );
                            })()}
                        </svg>
                    </div>

                    {/* Gamma Regime */}
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-[11px] text-white/60 font-bold tracking-wider">GAMMA</span>
                        <div className="flex items-center gap-1.5">
                            {(['SHORT', 'NEUTRAL', 'LONG'] as const).map(r => {
                                const isActive = summary.dominant_regime === r || (r === 'NEUTRAL' && summary.dominant_regime !== 'LONG' && summary.dominant_regime !== 'SHORT');
                                const c = r === 'SHORT' ? '#f43f5e' : r === 'LONG' ? '#10b981' : '#f59e0b';
                                return <div key={r} className="w-5 h-5 rounded-full transition-all" style={{ backgroundColor: isActive ? c : `${c}20`, boxShadow: isActive ? `0 0 10px ${c}80` : 'none' }} />;
                            })}
                        </div>
                        <span className="text-[12px] font-bold font-mono" style={{ color: summary.dominant_regime === 'LONG' ? '#10b981' : summary.dominant_regime === 'SHORT' ? '#f43f5e' : '#f59e0b' }}>
                            {summary.dominant_regime === 'LONG' ? 'RISK ON' : summary.dominant_regime === 'SHORT' ? 'RISK OFF' : 'NEUTRAL'}
                        </span>
                        <span className="text-[12px] text-white/40 font-mono">GEX {fmtGex(summary.total_gex)}</span>
                        <span className="text-[12px] text-white/40 font-mono">PCR {summary.avg_pcr.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* ══ NEXT DAY OUTLOOK ══ */}
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4.5 h-4.5 text-amber-400" />
                    <span className="text-[13px] font-bold text-white uppercase tracking-[0.1em]">Next Day Outlook</span>
                </div>

                {headline && (
                    <h3 className="text-[15px] font-bold text-white leading-snug mb-3">{headline}</h3>
                )}

                <div className="space-y-3 mb-3">
                    {bullets.map((b: string, i: number) => {
                        const Icon = BULLET_ICONS[i % BULLET_ICONS.length];
                        const clean = b.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]\s*/u, '');
                        const colors = ['text-emerald-400', 'text-amber-400', 'text-cyan-400', 'text-purple-400', 'text-orange-400', 'text-sky-400'];
                        return (
                            <div key={i} className="flex items-start gap-2.5">
                                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${colors[i % colors.length]}`} />
                                <Hl html={clean} className="text-[13px] text-white/90 leading-relaxed" />
                            </div>
                        );
                    })}
                </div>

                {watchpoints.length > 0 && (
                    <div className="rounded-lg border border-white/[0.06] p-3.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center gap-1.5 mb-2.5">
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-[12px] font-bold text-white/80 uppercase tracking-wider">Watchpoints</span>
                        </div>
                        {watchpoints.map((wp: string, i: number) => {
                            const clean = wp.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]\s*/u, '');
                            return (
                                <div key={i} className="flex items-start gap-2 mb-1.5 last:mb-0">
                                    <Target className="w-3.5 h-3.5 mt-0.5 text-amber-400/60 shrink-0" />
                                    <span className="text-[13px] text-white/75 leading-relaxed">{clean}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Macro Context */}
                {summary.macroContext && (
                    <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                        {[
                            { label: 'VIX', ...summary.macroContext.vix },
                            { label: 'S&P', ...summary.macroContext.spx },
                            { label: 'NDX', ...summary.macroContext.nq },
                            { label: '10Y', ...summary.macroContext.tnx },
                        ].map((m: any) => (
                            <div key={m.label} className="text-center">
                                <div className="text-[11px] text-white/50 font-bold mb-0.5">{m.label}</div>
                                <div className="text-[14px] text-white font-bold font-mono">{m.label === '10Y' ? `${m.price}%` : m.price?.toLocaleString()}</div>
                                <div className={`text-[12px] font-bold font-mono ${m.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {m.changePct >= 0 ? '+' : ''}{m.changePct?.toFixed(2)}%
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══ TACTICAL SENTIMENT ══ */}
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-purple-400" />
                        <span className="text-[13px] font-bold text-white uppercase tracking-[0.1em]">Tactical Sentiment</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {(['ATTACK', 'DEFEND', 'RETREAT'] as GroupKey[]).map(k => {
                            const g = VERDICT_GROUPS[k];
                            const count = groups[k].length;
                            return (
                                <span key={k} className="text-[11px] font-bold px-2 py-0.5 rounded-md"
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

                {(['ATTACK', 'DEFEND', 'RETREAT'] as GroupKey[]).filter(k => groups[k].length > 0).map(k => {
                    const g = VERDICT_GROUPS[k];
                    const GIcon = g.Icon;
                    return (
                        <div key={k} className="mb-3 last:mb-0">
                            <div className="flex items-center gap-1.5 mb-2">
                                <GIcon className="w-4 h-4" style={{ color: g.color }} />
                                <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: g.color }}>{g.label}</span>
                            </div>
                            <div className="space-y-1.5">
                                {groups[k].map((t: any) => {
                                    const isUp = t.change_pct >= 0;
                                    return (
                                        <div key={t.ticker} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-white/[0.04]"
                                            style={{ background: 'rgba(255,255,255,0.02)' }}>
                                            <div className="w-7 h-7 rounded-md bg-[#0a0f14] overflow-hidden border border-white/10 shrink-0">
                                                <img src={LOGO_URL(t.ticker)} alt="" className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            </div>
                                            <span className="text-[14px] font-bold text-white">{t.ticker}</span>
                                            <span className="text-[13px] text-white/50 font-mono">${t.close_price.toFixed(2)}</span>
                                            <span className={`text-[13px] font-bold font-mono ml-auto ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {isUp ? '+' : ''}{t.change_pct.toFixed(2)}%
                                            </span>
                                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${g.color}15`, color: g.color }}>
                                                Ctx {t.alpha_score.toFixed(0)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ══ NEWS DIGEST ══ */}
            {newsItems.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-center gap-2 mb-3">
                        <Newspaper className="w-4 h-4 text-cyan-400" />
                        <span className="text-[13px] font-bold text-white uppercase tracking-[0.1em]">News Digest</span>
                        {summary.newsSentimentOverall && (
                            <span className={`ml-auto text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${summary.newsSentimentOverall === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                                    summary.newsSentimentOverall === 'BEARISH' ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' :
                                        'bg-amber-500/15 text-amber-400 border-amber-500/25'
                                }`}>
                                {summary.newsSentimentOverall}
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {newsItems.slice(0, 5).map((news: any, i: number) => {
                            const sColor = news.sentiment === 'positive' ? '#10b981' : news.sentiment === 'negative' ? '#f43f5e' : '#94a3b8';
                            const title = locale === 'ko' ? news.summaryKR : locale === 'ja' ? news.summaryJP : news.headline;
                            const insight = locale === 'ko' ? news.insightKR : locale === 'ja' ? news.insightJP : news.insightEN;
                            const hrs = Math.max(1, Math.round((Date.now() - new Date(news.publishedAt).getTime()) / 3600000));
                            return (
                                <div key={i}>
                                    <div className="flex items-start gap-2.5">
                                        <CircleDot className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: sColor }} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[14px] text-white font-semibold leading-snug">{title}</div>
                                            {insight && <div className="text-[13px] text-cyan-200/80 mt-0.5 leading-relaxed">→ {insight}</div>}
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                {news.tickers?.slice(0, 3).map((t: string) => (
                                                    <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60">{t}</span>
                                                ))}
                                                <span className="text-[11px] text-white/40 ml-auto">{news.source} · {hrs}h</span>
                                            </div>
                                        </div>
                                    </div>
                                    {i < Math.min(newsItems.length, 5) - 1 && <div className="border-b border-white/[0.04] mt-2.5" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ══ FOOTER ══ */}
            <div className="text-center py-2">
                <span className="text-[11px] text-slate-500">Auto-generated after market close · Not investment advice</span>
            </div>
        </div>
    );
}
