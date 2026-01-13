'use client';

import React, { useState } from 'react';
import { usePortfolio, type EnrichedHolding } from '@/hooks/usePortfolio';
import {
    TrendingUp,
    TrendingDown,
    Minus,
    Plus,
    RefreshCw,
    Briefcase,
    ChevronRight,
    Trash2,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react';
import Link from 'next/link';

export default function PortfolioPage() {
    const { holdings, summary, loading, refresh, removeHolding } = usePortfolio();
    const [showAddModal, setShowAddModal] = useState(false);

    return (
        <div className="min-h-screen bg-[#050505] text-slate-100">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Briefcase className="w-5 h-5 text-cyan-400" />
                        <h1 className="text-lg font-bold tracking-tight">PORTFOLIO</h1>
                        <span className="text-[10px] text-slate-500 font-mono">BETA</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refresh()}
                            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Refresh prices"
                        >
                            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            종목 추가
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard
                        label="총 평가금액"
                        value={`$${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <SummaryCard
                        label="총 투자금액"
                        value={`$${summary.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <SummaryCard
                        label="총 손익"
                        value={`${summary.totalGainLoss >= 0 ? '+' : ''}$${summary.totalGainLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        variant={summary.totalGainLoss >= 0 ? 'positive' : 'negative'}
                    />
                    <SummaryCard
                        label="수익률"
                        value={`${summary.totalGainLossPct >= 0 ? '+' : ''}${summary.totalGainLossPct.toFixed(2)}%`}
                        variant={summary.totalGainLossPct >= 0 ? 'positive' : 'negative'}
                    />
                </div>

                {/* Holdings Table */}
                <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-900/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                        <div className="col-span-3">종목</div>
                        <div className="col-span-1 text-right">수량</div>
                        <div className="col-span-1 text-right">평균가</div>
                        <div className="col-span-1 text-right">현재가</div>
                        <div className="col-span-1 text-right">수익률</div>
                        <div className="col-span-1 text-center">액션</div>
                        <div className="col-span-1 text-center">Alpha</div>
                        <div className="col-span-1 text-center">3D</div>
                        <div className="col-span-1 text-center">섹터</div>
                        <div className="col-span-1"></div>
                    </div>

                    {/* Holdings Rows */}
                    {loading ? (
                        <div className="px-4 py-12 text-center text-slate-500">
                            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                            Loading portfolio...
                        </div>
                    ) : holdings.length === 0 ? (
                        <div className="px-4 py-12 text-center text-slate-500">
                            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p>보유 종목이 없습니다</p>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="mt-4 text-cyan-400 hover:text-cyan-300 text-sm"
                            >
                                + 종목 추가하기
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800/50">
                            {holdings.map(holding => (
                                <HoldingRow
                                    key={holding.ticker}
                                    holding={holding}
                                    onRemove={() => removeHolding(holding.ticker)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Add Modal (simplified placeholder) */}
            {showAddModal && (
                <AddHoldingModal onClose={() => setShowAddModal(false)} />
            )}
        </div>
    );
}

// Summary Card Component
function SummaryCard({ label, value, variant = 'neutral' }: {
    label: string;
    value: string;
    variant?: 'positive' | 'negative' | 'neutral'
}) {
    const colorClass = variant === 'positive' ? 'text-emerald-400' :
        variant === 'negative' ? 'text-rose-400' : 'text-white';

    return (
        <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-xl font-bold font-num tracking-tight ${colorClass}`}>{value}</div>
        </div>
    );
}

// Holding Row Component with Infographic Design
function HoldingRow({ holding, onRemove }: { holding: EnrichedHolding; onRemove: () => void }) {
    const isPositive = holding.gainLossPct >= 0;

    return (
        <Link
            href={`/ticker?ticker=${holding.ticker}`}
            className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-slate-800/30 transition-colors items-center group"
        >
            {/* Ticker */}
            <div className="col-span-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                    <img
                        src={`https://financialmodelingprep.com/image-stock/${holding.ticker}.png`}
                        alt={holding.ticker}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-[8px] font-bold text-slate-600 absolute">{holding.ticker.slice(0, 2)}</span>
                </div>
                <div>
                    <div className="font-bold text-sm">{holding.ticker}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[100px]">{holding.name}</div>
                </div>
            </div>

            {/* Quantity */}
            <div className="col-span-1 text-right font-num text-sm text-slate-300">
                {holding.quantity}
            </div>

            {/* Avg Price */}
            <div className="col-span-1 text-right font-num text-sm text-slate-400">
                ${holding.avgPrice.toFixed(2)}
            </div>

            {/* Current Price */}
            <div className="col-span-1 text-right font-num text-sm text-white">
                ${holding.currentPrice.toFixed(2)}
            </div>

            {/* Gain/Loss % with Arrow */}
            <div className={`col-span-1 flex items-center justify-end gap-1 font-num text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {isPositive ? '+' : ''}{holding.gainLossPct.toFixed(1)}%
            </div>

            {/* Action Badge */}
            <div className="col-span-1 flex justify-center">
                <ActionBadge action={holding.action} />
            </div>

            {/* Alpha Score Gauge */}
            <div className="col-span-1 flex justify-center">
                <MiniGauge value={holding.alphaScore || 50} />
            </div>

            {/* 3D Return */}
            <div className="col-span-1 flex justify-center">
                <ThreeDayIndicator value={holding.threeDay || 0} />
            </div>

            {/* Sector Flow */}
            <div className="col-span-1 flex justify-center">
                <SectorFlowBadge flow={holding.sectorFlow} />
            </div>

            {/* Actions */}
            <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.preventDefault(); onRemove(); }}
                    className="p-1.5 hover:bg-rose-500/20 rounded text-rose-400"
                    title="Remove"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-4 h-4 text-slate-600" />
            </div>
        </Link>
    );
}

// Action Badge (HOLD, TRIM, ADD, WATCH)
function ActionBadge({ action }: { action?: string }) {
    const config: Record<string, { bg: string; text: string; bar: string }> = {
        'HOLD': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-400' },
        'ADD': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', bar: 'bg-cyan-400' },
        'WATCH': { bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-400' },
        'TRIM': { bg: 'bg-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-400' },
    };
    const c = config[action || 'HOLD'] || config['HOLD'];

    return (
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${c.bg}`}>
            <div className={`w-1 h-3 rounded-full ${c.bar}`}></div>
            <span className={`text-[9px] font-bold ${c.text}`}>{action || 'HOLD'}</span>
        </div>
    );
}

// Mini Gauge for Alpha Score
function MiniGauge({ value }: { value: number }) {
    const percentage = Math.min(Math.max(value, 0), 100);
    const color = percentage >= 60 ? 'bg-emerald-400' : percentage >= 40 ? 'bg-slate-400' : 'bg-rose-400';

    return (
        <div className="flex items-center gap-1.5">
            <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${color} transition-all`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="text-[10px] font-num font-bold text-slate-300 w-5">{value}</span>
        </div>
    );
}

// 3-Day Return Indicator
function ThreeDayIndicator({ value }: { value: number }) {
    const isPositive = value >= 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;

    return (
        <div className={`flex items-center gap-0.5 text-[10px] font-num font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            <Icon className="w-3 h-3" />
            {isPositive ? '+' : ''}{value.toFixed(1)}%
        </div>
    );
}

// Sector Flow Badge
function SectorFlowBadge({ flow }: { flow?: string }) {
    const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
        'INFLOW': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: <ArrowUpRight className="w-3 h-3" /> },
        'OUTFLOW': { bg: 'bg-rose-500/10', text: 'text-rose-400', icon: <ArrowDownRight className="w-3 h-3" /> },
        'NEUTRAL': { bg: 'bg-slate-500/10', text: 'text-slate-400', icon: <Minus className="w-3 h-3" /> },
    };
    const c = config[flow || 'NEUTRAL'] || config['NEUTRAL'];

    return (
        <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
            {c.icon}
            <span className="text-[9px] font-bold">{flow === 'INFLOW' ? '유입' : flow === 'OUTFLOW' ? '이탈' : '중립'}</span>
        </div>
    );
}

// Add Holding Modal (simplified)
function AddHoldingModal({ onClose }: { onClose: () => void }) {
    const { addHolding } = usePortfolio();
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [avgPrice, setAvgPrice] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (ticker && quantity && avgPrice) {
            addHolding({
                ticker: ticker.toUpperCase(),
                name: ticker.toUpperCase(), // Will be enriched later
                quantity: parseFloat(quantity),
                avgPrice: parseFloat(avgPrice)
            });
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] border border-slate-800 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-bold mb-4">종목 추가</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">티커</label>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value)}
                            placeholder="NVDA"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">수량</label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                placeholder="10"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">평균 매수가</label>
                            <input
                                type="number"
                                step="0.01"
                                value={avgPrice}
                                onChange={(e) => setAvgPrice(e.target.value)}
                                placeholder="150.00"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 border border-slate-700 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2 bg-cyan-500 text-black font-bold rounded-lg hover:bg-cyan-400 transition-colors"
                        >
                            추가
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
