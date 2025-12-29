'use client';

// [S-50.4] Report Selector Component
// Allows switching between EOD/Pre+2h/Open-30m reports and dates

import React, { useState, useEffect, useCallback } from 'react';

type ReportType = 'post_market' | 'night_watch' | 'pre_market' | 'eod' | 'pre2h' | 'open30m'; // Backward compat

interface ArchiveItem {
    date: string;
    types: ReportType[];
}

interface PremiumReport {
    meta: {
        id: string;
        type: ReportType;
        generatedAt: string;
        generatedAtET: string;
        marketDate: string;
        version: string;
    };
    macro: any;
    events: any;
    policy: any;
    news: any;
    shakeReasons: string[];
    marketSentiment: {
        likes: string[];
        dislikes: string[];
    };
}

const REPORT_LABELS: Record<ReportType, { label: string; labelKR: string; time: string }> = {
    'post_market': { label: 'Post-Market', labelKR: '장마감 (Post)', time: '16:30 ET' },
    'night_watch': { label: 'Night-Watch', labelKR: '야간 (Night)', time: '20:00 ET' },
    'pre_market': { label: 'Pre-Market', labelKR: '장전 (Pre)', time: '04:00 ET' },
    'eod': { label: 'EOD Final', labelKR: 'EOD (구)', time: '16:30 ET' },
    'pre2h': { label: 'Pre+2h', labelKR: 'Pre+2h (구)', time: '06:30 ET' },
    'open30m': { label: 'Open-30m', labelKR: 'Open (구)', time: '09:00 ET' }
};

interface ReportSelectorProps {
    onReportLoad?: (report: PremiumReport) => void;
}

export function ReportSelector({ onReportLoad }: ReportSelectorProps) {
    const [archives, setArchives] = useState<ArchiveItem[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedType, setSelectedType] = useState<ReportType>('eod');
    const [currentReport, setCurrentReport] = useState<PremiumReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load archive list on mount
    useEffect(() => {
        loadArchives();
    }, []);

    const loadArchives = async () => {
        try {
            const res = await fetch('/api/reports/archive');
            const data = await res.json();
            setArchives(data.archives || []);

            // Auto-select first available date
            if (data.archives?.length > 0) {
                setSelectedDate(data.archives[0].date);
                if (data.archives[0].types?.length > 0) {
                    setSelectedType(data.archives[0].types[0]);
                }
            }
        } catch (e) {
            console.error('Failed to load archives:', e);
        }
    };

    // Load report when selection changes
    useEffect(() => {
        if (selectedDate && selectedType) {
            loadReport(selectedDate, selectedType);
        }
    }, [selectedDate, selectedType]);

    const loadReport = async (date: string, type: ReportType) => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/reports/archive?date=${date}&type=${type}`);
            if (res.ok) {
                const report = await res.json();
                setCurrentReport(report);
                onReportLoad?.(report);
            } else if (res.status === 404) {
                setCurrentReport(null);
                setError('해당 리포트가 없습니다.');
            }
        } catch (e) {
            setError('리포트 로딩 실패');
        } finally {
            setLoading(false);
        }
    };

    const generateReport = async () => {
        setGenerating(true);
        setError(null);

        try {
            const res = await fetch(`/api/reports/generate?type=${selectedType}`, { method: 'POST' });
            if (res.ok) {
                // Refresh archives and load new report
                await loadArchives();
                const today = new Date().toISOString().split('T')[0];
                setSelectedDate(today);
                await loadReport(today, selectedType);
            } else {
                setError('리포트 생성 실패');
            }
        } catch (e) {
            setError('리포트 생성 중 오류');
        } finally {
            setGenerating(false);
        }
    };

    // Get available types for selected date
    const availableTypes = archives.find(a => a.date === selectedDate)?.types || [];

    return (
        <div className="bg-[#1A1F26] rounded-xl border border-slate-700/50 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-200">📊 Premium Report</h3>
                <span className="text-[10px] text-slate-500">S50.0-MVP</span>
            </div>

            {/* Selector Row */}
            <div className="flex flex-wrap gap-3 mb-4">
                {/* Date Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">날짜</label>
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                        {archives.length === 0 && <option value="">아카이브 없음</option>}
                        {archives.map(a => (
                            <option key={a.date} value={a.date}>{a.date}</option>
                        ))}
                    </select>
                </div>

                {/* Type Selector */}
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">타입</label>
                    <div className="flex gap-1">
                        {(['post_market', 'night_watch', 'pre_market'] as ReportType[]).map(type => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${selectedType === type
                                    ? 'bg-emerald-500 text-white'
                                    : availableTypes.includes(type)
                                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                                    }`}
                                disabled={!availableTypes.includes(type) && selectedDate !== ''}
                            >
                                {REPORT_LABELS[type].labelKR}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Generate Button */}
                <div className="flex flex-col gap-1 ml-auto">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">수동 생성</label>
                    <button
                        onClick={generateReport}
                        disabled={generating}
                        className="px-3 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors disabled:opacity-50"
                    >
                        {generating ? '생성 중...' : `${REPORT_LABELS[selectedType].labelKR} 생성`}
                    </button>
                </div>
            </div>

            {/* Status / Error */}
            {loading && (
                <div className="text-xs text-slate-400 animate-pulse">리포트 로딩 중...</div>
            )}
            {error && !loading && (
                <div className="text-xs text-rose-400 mb-2">{error}</div>
            )}

            {/* Report Preview */}
            {currentReport && !loading && (
                <div className="space-y-3">
                    {/* Meta */}
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                            {REPORT_LABELS[currentReport.meta.type].label}
                        </span>
                        <span>{currentReport.meta.generatedAtET}</span>
                        <span className="text-slate-600">|</span>
                        <span>{currentReport.meta.version}</span>
                    </div>

                    {/* Shake Reasons - "오늘 흔들릴 이유 3가지" */}
                    {currentReport.shakeReasons?.length > 0 && (
                        <div className="bg-slate-800/50 rounded-lg p-3">
                            <h4 className="text-[10px] font-bold text-amber-400 mb-2">⚠️ 오늘 흔들릴 이유</h4>
                            <ul className="space-y-1">
                                {currentReport.shakeReasons.map((reason, i) => (
                                    <li key={i} className="text-[11px] text-slate-300 leading-tight">
                                        {i + 1}. {reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* [S-53.8] Market Sentiment with source transparency */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-emerald-500/10 rounded-lg p-2">
                            <h4 className="text-[9px] font-bold text-emerald-400 mb-1">👍 시장이 좋아하는 것</h4>
                            <ul className="space-y-1">
                                {currentReport.marketSentiment?.likes?.map((item: any, i: number) => {
                                    const text = typeof item === 'string' ? item : item.text;
                                    const source = typeof item === 'string' ? '' : item.source;
                                    const timeET = typeof item === 'string' ? '' : item.publishedAtET;
                                    const isStale = typeof item === 'string' ? false : item.isStale;
                                    return (
                                        <li key={i} className={`text-[10px] ${isStale ? 'text-slate-500' : 'text-slate-300'}`}>
                                            <span className="truncate block">{text}</span>
                                            {source && (
                                                <span className="flex gap-1 mt-0.5">
                                                    <span className="text-[8px] text-slate-600">[{source}]</span>
                                                    {timeET && <span className="text-[8px] text-slate-600">{timeET}</span>}
                                                    {isStale && <span className="text-[7px] text-amber-600">과거(참고)</span>}
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <div className="bg-rose-500/10 rounded-lg p-2">
                            <h4 className="text-[9px] font-bold text-rose-400 mb-1">👎 시장이 싫어하는 것</h4>
                            <ul className="space-y-1">
                                {currentReport.marketSentiment?.dislikes?.map((item: any, i: number) => {
                                    const text = typeof item === 'string' ? item : item.text;
                                    const source = typeof item === 'string' ? '' : item.source;
                                    const timeET = typeof item === 'string' ? '' : item.publishedAtET;
                                    const isStale = typeof item === 'string' ? false : item.isStale;
                                    return (
                                        <li key={i} className={`text-[10px] ${isStale ? 'text-slate-500' : 'text-slate-300'}`}>
                                            <span className="truncate block">{text}</span>
                                            {source && (
                                                <span className="flex gap-1 mt-0.5">
                                                    <span className="text-[8px] text-slate-600">[{source}]</span>
                                                    {timeET && <span className="text-[8px] text-slate-600">{timeET}</span>}
                                                    {isStale && <span className="text-[7px] text-amber-600">과거(참고)</span>}
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>

                    {/* Macro Summary */}
                    {currentReport.macro?.factors && (
                        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-700/50">
                            {Object.entries(currentReport.macro.factors).map(([key, factor]: [string, any]) => (
                                <div key={key} className="text-center">
                                    <div className="text-[9px] text-slate-500 uppercase">{factor.label}</div>
                                    <div className="text-sm font-bold text-slate-200">
                                        {factor.level != null ? (
                                            key === 'us10y' ? `${factor.level.toFixed(2)}%` : factor.level.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                        ) : '—'}
                                    </div>
                                    <div className={`text-[10px] ${factor.chgPct == null ? 'text-slate-500' : factor.chgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {factor.chgPct != null ? `${factor.chgPct >= 0 ? '+' : ''}${factor.chgPct.toFixed(2)}%` : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* No Report State */}
            {!currentReport && !loading && !error && (
                <div className="text-center py-6 text-slate-500 text-xs">
                    리포트를 선택하거나 생성하세요.
                </div>
            )}
        </div>
    );
}
