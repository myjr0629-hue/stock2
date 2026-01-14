'use client';

import React, { useState, useEffect } from 'react';
import { usePortfolio, type EnrichedHolding } from '@/hooks/usePortfolio';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { TradingViewTicker } from '@/components/TradingViewTicker';
import {
    TrendingUp,
    TrendingDown,
    Plus,
    RefreshCw,
    Briefcase,
    ChevronRight,
    Trash2,
    ArrowUpRight,
    ArrowDownRight,
    Wallet,
    PiggyBank,
    Activity,
    Zap,
    Target
} from 'lucide-react';
import Link from 'next/link';

export default function PortfolioPage() {
    const { holdings, summary, loading, refresh, removeHolding } = usePortfolio();
    const [showAddModal, setShowAddModal] = useState(false);

    // Calculate portfolio score (average of all alpha scores)
    const portfolioScore = holdings.length > 0
        ? Math.round(holdings.reduce((sum, h) => sum + (h.alphaScore || 50), 0) / holdings.length)
        : 0;

    return (
        <div className="min-h-screen bg-[#0a0e14] text-slate-100">
            {/* Global Header */}
            <LandingHeader />

            {/* Live Ticker Bar */}
            <TradingViewTicker />

            {/* Page Header */}
            <div className="border-b border-white/5 bg-gradient-to-r from-[#0a0e14] via-[#0f1520] to-[#0a0e14]">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                                PORTFOLIO
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded-full border border-slate-700">PREMIUM</span>
                            </h1>
                            <p className="text-[10px] text-slate-500">Alpha Engine 기반 실시간 분석</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refresh()}
                            className="p-2.5 hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-slate-700"
                            title="Refresh prices"
                        >
                            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-400 rounded-xl hover:from-cyan-500/30 hover:to-indigo-500/30 transition-all text-sm font-bold border border-cyan-500/30"
                        >
                            <Plus className="w-4 h-4" />
                            종목 추가
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
                {/* Summary Cards - Glassmorphism */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard
                        icon={<Wallet className="w-4 h-4 text-cyan-400" />}
                        label="총 평가금액"
                        value={`$${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <SummaryCard
                        icon={<PiggyBank className="w-4 h-4 text-indigo-400" />}
                        label="총 투자금액"
                        value={`$${summary.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    {/* Profit Gauge Card */}
                    <ProfitGaugeCard
                        gainLoss={summary.totalGainLoss}
                        gainLossPct={summary.totalGainLossPct}
                    />
                    {/* Portfolio Score Card */}
                    <PortfolioScoreCard score={portfolioScore} holdingsCount={holdings.length} />
                </div>

                {/* Premium Holdings Table - Glassmorphism */}
                <div className="relative rounded-2xl overflow-hidden">
                    {/* Glass Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-slate-900/30 to-slate-900/50 backdrop-blur-xl border border-white/5" />

                    {/* Table Content */}
                    <div className="relative">
                        {/* Table Header - 8 Clear Columns */}
                        <div className="grid grid-cols-16 gap-2 px-4 py-3 bg-gradient-to-r from-slate-900/80 to-slate-800/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5">
                            <div className="col-span-3">종목</div>
                            <div className="col-span-1 text-right">수량</div>
                            <div className="col-span-2 text-right">매입가</div>
                            <div className="col-span-2 text-right">현재가</div>
                            <div className="col-span-2 text-right">손익</div>
                            <div className="col-span-2 text-center">Alpha</div>
                            <div className="col-span-2 text-center">Signal</div>
                            <div className="col-span-2 text-center">Edge</div>
                        </div>

                        {/* Holdings Rows */}
                        {loading ? (
                            <div className="px-4 py-16 text-center">
                                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-cyan-500/50" />
                                <p className="text-slate-500 text-sm">포트폴리오 로딩 중...</p>
                            </div>
                        ) : holdings.length === 0 ? (
                            <div className="px-4 py-16 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-white/5 flex items-center justify-center">
                                    <Briefcase className="w-8 h-8 text-slate-600" />
                                </div>
                                <p className="text-slate-400 font-medium mb-1">보유 종목이 없습니다</p>
                                <p className="text-slate-600 text-xs mb-4">종목을 추가하여 포트폴리오를 시작하세요</p>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="text-cyan-400 hover:text-cyan-300 text-sm font-bold"
                                >
                                    + 첫 번째 종목 추가하기
                                </button>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {holdings.map(holding => (
                                    <PremiumHoldingRow
                                        key={holding.ticker}
                                        holding={holding}
                                        onRemove={() => removeHolding(holding.ticker)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Add Modal */}
            {showAddModal && (
                <AddHoldingModal onClose={() => setShowAddModal(false)} />
            )}
        </div>
    );
}

// === SUMMARY COMPONENTS ===

function SummaryCard({ icon, label, value }: {
    icon?: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="relative rounded-xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-900/60 backdrop-blur-xl border border-white/5 group-hover:border-white/10 transition-colors" />
            <div className="relative p-4">
                <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
                </div>
                <div className="text-xl font-black font-num tracking-tight text-white">{value}</div>
            </div>
        </div>
    );
}

// Profit Gauge with Semi-circular visualization
function ProfitGaugeCard({ gainLoss, gainLossPct }: { gainLoss: number; gainLossPct: number }) {
    const isPositive = gainLossPct >= 0;
    const absPercent = Math.min(Math.abs(gainLossPct), 50); // Cap at 50%
    const rotation = isPositive ? (absPercent / 50) * 90 : -(absPercent / 50) * 90;

    return (
        <div className="relative rounded-xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-900/60 backdrop-blur-xl border border-white/5 group-hover:border-white/10 transition-colors" />
            <div className="relative p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Activity className={`w-4 h-4 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">수익률</span>
                </div>
                <div className="flex items-center gap-3">
                    {/* Mini Gauge */}
                    <div className="relative w-12 h-6 overflow-hidden">
                        <div className="absolute bottom-0 left-0 right-0 h-12 w-12 border-4 border-slate-700 rounded-full" style={{ clipPath: 'inset(50% 0 0 0)' }} />
                        <div
                            className={`absolute bottom-0 left-1/2 w-0.5 h-5 origin-bottom ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            style={{ transform: `rotate(${rotation}deg)` }}
                        />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
                    </div>
                    <div>
                        <div className={`text-xl font-black font-num tracking-tight ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{gainLossPct.toFixed(2)}%
                        </div>
                        <div className={`text-[10px] font-num ${isPositive ? 'text-emerald-400/60' : 'text-rose-400/60'}`}>
                            {isPositive ? '+' : ''}${gainLoss.toFixed(0)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Portfolio Score Card with Grade
function PortfolioScoreCard({ score, holdingsCount }: { score: number; holdingsCount: number }) {
    const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
    const gradeColor = grade === 'A' ? 'text-emerald-400 border-emerald-400' :
        grade === 'B' ? 'text-cyan-400 border-cyan-400' :
            grade === 'C' ? 'text-amber-400 border-amber-400' : 'text-rose-400 border-rose-400';

    return (
        <div className="relative rounded-xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-900/60 backdrop-blur-xl border border-white/5 group-hover:border-white/10 transition-colors" />
            <div className="relative p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-indigo-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">포트폴리오 점수</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg border-2 ${gradeColor} flex items-center justify-center text-xl font-black`}>
                        {grade}
                    </div>
                    <div>
                        <div className="text-xl font-black font-num tracking-tight text-white">{score}</div>
                        <div className="text-[10px] text-slate-500">{holdingsCount}개 종목 평균</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// === PREMIUM HOLDING ROW ===

function PremiumHoldingRow({ holding, onRemove }: { holding: EnrichedHolding; onRemove: () => void }) {
    const isPositive = holding.gainLossPct >= 0;

    return (
        <Link
            href={`/ticker?ticker=${holding.ticker}`}
            className="grid grid-cols-16 gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors items-center group"
        >
            {/* TICKER (3 cols) - Logo + Name */}
            <div className="col-span-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700 flex items-center justify-center overflow-hidden">
                    <img
                        src={`https://financialmodelingprep.com/image-stock/${holding.ticker}.png`}
                        alt={holding.ticker}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-[9px] font-bold text-slate-600 absolute">{holding.ticker.slice(0, 2)}</span>
                </div>
                <div>
                    <div className="font-bold text-sm text-white">{holding.ticker}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[80px]">{holding.name}</div>
                </div>
            </div>

            {/* QUANTITY (1 col) */}
            <div className="col-span-1 text-right font-num text-sm text-slate-300">
                {holding.quantity}
            </div>

            {/* AVG PRICE (2 cols) - 매입가 */}
            <div className="col-span-2 text-right">
                <div className="font-num text-sm text-slate-400">${holding.avgPrice.toFixed(2)}</div>
                <div className="text-[9px] text-slate-600">매입가</div>
            </div>

            {/* CURRENT PRICE (2 cols) - 현재가 */}
            <div className="col-span-2 text-right">
                <div className="font-bold font-num text-sm text-white">${holding.currentPrice.toFixed(2)}</div>
                <div className={`flex items-center justify-end gap-0.5 text-[10px] font-num font-bold ${holding.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {holding.changePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {holding.changePct >= 0 ? '+' : ''}{holding.changePct.toFixed(2)}%
                </div>
            </div>

            {/* P/L (2 cols) - 손익 */}
            <div className="col-span-2 text-right">
                <div className={`font-bold font-num text-sm ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}${holding.gainLoss.toFixed(0)}
                </div>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                    <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            style={{ width: `${Math.min(Math.abs(holding.gainLossPct), 50) * 2}%` }}
                        />
                    </div>
                    <span className={`text-[10px] font-num font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? '+' : ''}{holding.gainLossPct.toFixed(1)}%
                    </span>
                </div>
            </div>

            {/* ALPHA (2 cols) - Circular Gauge */}
            <div className="col-span-2 flex justify-center">
                <CircularAlphaGauge score={holding.alphaScore || 50} grade={holding.alphaGrade || 'C'} />
            </div>

            {/* SIGNAL (2 cols) - Action + Confidence */}
            <div className="col-span-2 flex justify-center">
                <SignalBadge action={holding.action || 'HOLD'} confidence={holding.confidence || 50} />
            </div>

            {/* EDGE (2 cols) - RVOL + Triple-A with tooltips */}
            <div className="col-span-2 flex items-center justify-center gap-2">
                <EdgeIndicators
                    rvol={holding.rvol || 1.0}
                    maxPainDist={holding.maxPainDist || 0}
                    tripleA={holding.tripleA || { direction: false, acceleration: false, accumulation: false }}
                />
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    <button
                        onClick={(e) => { e.preventDefault(); onRemove(); }}
                        className="p-1 hover:bg-rose-500/20 rounded text-rose-400"
                        title="삭제"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </Link>
    );
}

// === PREMIUM COMPONENTS ===

// Circular Alpha Gauge with Grade
function CircularAlphaGauge({ score, grade }: { score: number; grade: string }) {
    const percentage = Math.min(Math.max(score, 0), 100);
    const circumference = 2 * Math.PI * 16;
    const offset = circumference - (percentage / 100) * circumference;

    const gradeColor = grade === 'A' ? 'text-emerald-400 stroke-emerald-400' :
        grade === 'B' ? 'text-cyan-400 stroke-cyan-400' :
            grade === 'C' ? 'text-amber-400 stroke-amber-400' : 'text-rose-400 stroke-rose-400';

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-10 h-10">
                <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#1e293b" strokeWidth="3" />
                    <circle
                        cx="20" cy="20" r="16"
                        fill="none"
                        className={gradeColor}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                    />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-xs font-black ${gradeColor}`}>
                    {grade}
                </div>
            </div>
            <div className="text-sm font-bold font-num text-white">{score}</div>
        </div>
    );
}

// Signal Badge with Confidence
function SignalBadge({ action, confidence }: { action: string; confidence: number }) {
    const config: Record<string, { bg: string; text: string; border: string }> = {
        'HOLD': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
        'ADD': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
        'WATCH': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
        'TRIM': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
    };
    const c = config[action] || config['HOLD'];

    return (
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg ${c.bg} border ${c.border}`}>
            <span className={`text-[10px] font-black ${c.text}`}>{action}</span>
            <span className="text-[9px] font-bold font-num text-slate-400">{confidence}%</span>
        </div>
    );
}

// Edge Indicators with tooltips (RVOL, Triple-A)
function EdgeIndicators({ rvol, maxPainDist, tripleA }: {
    rvol: number;
    maxPainDist: number;
    tripleA: { direction: boolean; acceleration: boolean; accumulation: boolean };
}) {
    const rvolColor = rvol >= 1.5 ? 'text-amber-400' : rvol >= 1.0 ? 'text-emerald-400' : 'text-slate-500';
    const tripleACount = [tripleA.direction, tripleA.acceleration, tripleA.accumulation].filter(Boolean).length;

    return (
        <div className="flex items-center gap-3">
            {/* RVOL with tooltip */}
            <div
                className={`flex items-center gap-0.5 text-[10px] font-num font-bold ${rvolColor}`}
                title={`상대 거래량: ${rvol}x\n1.0x = 평균, 1.5x+ = 높은 관심`}
            >
                <Zap className="w-3 h-3" />
                <span>{rvol}x</span>
            </div>

            {/* Triple-A dots with tooltip */}
            <div
                className="flex items-center gap-1"
                title={`Triple-A 정렬: ${tripleACount}/3\n● 방향: ${tripleA.direction ? 'ON' : 'OFF'}\n● 가속: ${tripleA.acceleration ? 'ON' : 'OFF'}\n● 매집: ${tripleA.accumulation ? 'ON' : 'OFF'}`}
            >
                <div className="flex gap-0.5">
                    {[tripleA.direction, tripleA.acceleration, tripleA.accumulation].map((active, i) => (
                        <div
                            key={i}
                            className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-700'}`}
                        />
                    ))}
                </div>
                <span className="text-[9px] text-slate-500 font-bold">{tripleACount}/3</span>
            </div>
        </div>
    );
}

// === ENHANCED ADD MODAL ===

function AddHoldingModal({ onClose }: { onClose: () => void }) {
    const { addHolding } = usePortfolio();
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [avgPrice, setAvgPrice] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [validated, setValidated] = useState(false);

    // Auto-fetch company info when ticker changes
    const fetchTickerInfo = async (t: string) => {
        if (!t || t.length < 1) {
            setCompanyName('');
            setCurrentPrice(null);
            setValidated(false);
            setError('');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/stock?ticker=${t.toUpperCase()}`);
            if (!res.ok) throw new Error('Ticker not found');
            const data = await res.json();

            setCompanyName(data.name || data.shortName || t.toUpperCase());
            setCurrentPrice(data.price || data.last || data.close || null);
            setValidated(true);

            // Auto-fill current price as default avgPrice if empty
            if (!avgPrice && data.price) {
                setAvgPrice(data.price.toFixed(2));
            }
        } catch {
            setError('유효하지 않은 티커입니다');
            setCompanyName('');
            setCurrentPrice(null);
            setValidated(false);
        } finally {
            setLoading(false);
        }
    };

    // Debounced ticker lookup
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (ticker.length >= 1) {
                fetchTickerInfo(ticker);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [ticker]);

    // Calculate preview
    const qty = parseFloat(quantity) || 0;
    const avg = parseFloat(avgPrice) || 0;
    const totalCost = qty * avg;
    const estimatedValue = qty * (currentPrice || avg);
    const estimatedPL = estimatedValue - totalCost;
    const estimatedPLPct = totalCost > 0 ? (estimatedPL / totalCost) * 100 : 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (ticker && quantity && avgPrice && validated) {
            addHolding({
                ticker: ticker.toUpperCase(),
                name: companyName || ticker.toUpperCase(),
                quantity: qty,
                avgPrice: avg
            });
            onClose();
        }
    };

    const canSubmit = ticker && quantity && avgPrice && qty > 0 && avg > 0 && validated && !loading;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative rounded-2xl overflow-hidden max-w-lg w-full"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-900/95 backdrop-blur-xl border border-white/10" />

                <div className="relative p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold">종목 추가</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">포트폴리오에 새 종목을 추가합니다</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Ticker Input with Validation */}
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                티커 심볼
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    placeholder="NVDA, AAPL, TSLA..."
                                    className={`w-full bg-slate-900/70 border ${error ? 'border-rose-500/50' : validated ? 'border-emerald-500/50' : 'border-slate-700'} rounded-xl px-4 py-3 text-white text-lg font-bold focus:border-cyan-500 focus:outline-none uppercase tracking-wider placeholder:text-slate-600 placeholder:font-normal`}
                                    autoFocus
                                />
                                {loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                                    </div>
                                )}
                                {validated && !loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">✓</div>
                                )}
                            </div>
                            {error && <p className="text-rose-400 text-xs mt-1">{error}</p>}
                            {companyName && !error && (
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                                        <img
                                            src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
                                            alt={ticker}
                                            className="w-5 h-5 object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                    <span className="text-sm text-slate-300">{companyName}</span>
                                    {currentPrice && (
                                        <span className="text-sm font-num text-cyan-400 ml-auto">${currentPrice.toFixed(2)}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Quantity & Price Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    보유 수량
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="10"
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white font-num text-lg focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5 font-bold">
                                    평균 매수가 ($)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={avgPrice}
                                    onChange={(e) => setAvgPrice(e.target.value)}
                                    placeholder={currentPrice ? currentPrice.toFixed(2) : '150.00'}
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-white font-num text-lg focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Investment Preview */}
                        {qty > 0 && avg > 0 && (
                            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4">
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 font-bold">투자 요약</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-[10px] text-slate-600 mb-0.5">총 투자금액</div>
                                        <div className="text-lg font-bold font-num text-white">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    </div>
                                    {currentPrice && currentPrice !== avg && (
                                        <div>
                                            <div className="text-[10px] text-slate-600 mb-0.5">예상 손익</div>
                                            <div className={`text-lg font-bold font-num ${estimatedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {estimatedPL >= 0 ? '+' : ''}${estimatedPL.toFixed(2)}
                                                <span className="text-xs ml-1">({estimatedPLPct >= 0 ? '+' : ''}{estimatedPLPct.toFixed(1)}%)</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors font-bold"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className={`flex-1 py-3 rounded-xl font-bold transition-all ${canSubmit
                                    ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white hover:from-cyan-400 hover:to-indigo-400 shadow-lg shadow-cyan-500/20'
                                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                    }`}
                            >
                                포트폴리오에 추가
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
