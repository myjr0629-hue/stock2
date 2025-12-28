"use client";

import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Award, BarChart3 } from "lucide-react";

interface PerformanceSummary {
    sampleSize: number;
    avgReturnD1: number | null;
    avgReturnD2: number | null;
    avgReturnD3: number | null;
    winRate: number | null;
    maxWin: number | null;
    maxLoss: number | null;
    noTradeCount: number;
    lastUpdated: string;
}

interface PerformanceCardProps {
    compact?: boolean;
}

export function PerformanceCard({ compact = false }: PerformanceCardProps) {
    const [summary, setSummary] = useState<PerformanceSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPerformance() {
            try {
                const res = await fetch('/api/performance?limit=20');
                if (res.ok) {
                    const data = await res.json();
                    if (data.ok) {
                        setSummary(data.summary);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch performance:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchPerformance();
    }, []);

    if (loading) {
        return (
            <div className="bg-[#1A1F26] border border-slate-700/50 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-slate-700 rounded w-3/4"></div>
            </div>
        );
    }

    if (!summary || summary.sampleSize === 0) {
        return (
            <div className="bg-[#1A1F26] border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-slate-500" />
                    <span className="badge-text text-slate-500">ENGINE PERFORMANCE</span>
                </div>
                <p className="text-sm text-slate-400">성과 데이터 수집 중...</p>
                <p className="text-xs text-slate-500 mt-1">리포트 생성 후 D+3부터 측정됩니다.</p>
            </div>
        );
    }

    const isPositive = summary.avgReturnD3 !== null && summary.avgReturnD3 > 0;
    const returnColor = isPositive ? 'text-emerald-400' : 'text-rose-400';
    const winRateColor = (summary.winRate ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400';

    if (compact) {
        return (
            <div className="bg-[#1A1F26] border border-slate-700/50 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-400">D+3 수익률</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold num-highlight ${returnColor}`}>
                        {summary.avgReturnD3 !== null ? `${summary.avgReturnD3 >= 0 ? '+' : ''}${summary.avgReturnD3.toFixed(2)}%` : '—'}
                    </span>
                    <span className={`text-xs font-medium ${winRateColor}`}>
                        승률 {summary.winRate?.toFixed(0) ?? '—'}%
                    </span>
                    <span className="text-xs text-slate-500">({summary.sampleSize}회)</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#1A1F26] border border-slate-700/50 rounded-xl p-4 shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-indigo-400" />
                    <span className="section-title text-slate-200">Engine Performance</span>
                </div>
                <span className="badge-text text-slate-500">최근 {summary.sampleSize}회</span>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
                {/* D+3 Return */}
                <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1">D+3 평균</p>
                    <p className={`text-xl font-bold num-highlight ${returnColor}`}>
                        {summary.avgReturnD3 !== null ? `${summary.avgReturnD3 >= 0 ? '+' : ''}${summary.avgReturnD3.toFixed(2)}%` : '—'}
                    </p>
                </div>

                {/* Win Rate */}
                <div className="text-center border-x border-slate-700/50">
                    <p className="text-xs text-slate-500 mb-1">승률</p>
                    <p className={`text-xl font-bold num-highlight ${winRateColor}`}>
                        {summary.winRate !== null ? `${summary.winRate.toFixed(0)}%` : '—'}
                    </p>
                </div>

                {/* Sample Size */}
                <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1">표본수</p>
                    <p className="text-xl font-bold num-highlight text-slate-300">
                        {summary.sampleSize * 3}종목
                    </p>
                </div>
            </div>

            {/* Detail Row */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-700/40 text-xs">
                <div className="flex items-center gap-4">
                    <span className="text-slate-500">
                        D+1: <span className="text-slate-300">{summary.avgReturnD1 !== null ? `${summary.avgReturnD1.toFixed(2)}%` : '—'}</span>
                    </span>
                    <span className="text-slate-500">
                        D+2: <span className="text-slate-300">{summary.avgReturnD2 !== null ? `${summary.avgReturnD2.toFixed(2)}%` : '—'}</span>
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {summary.maxWin !== null && (
                        <span className="flex items-center gap-1 text-emerald-400">
                            <TrendingUp className="w-3 h-3" />
                            +{summary.maxWin.toFixed(1)}%
                        </span>
                    )}
                    {summary.maxLoss !== null && (
                        <span className="flex items-center gap-1 text-rose-400">
                            <TrendingDown className="w-3 h-3" />
                            {summary.maxLoss.toFixed(1)}%
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
