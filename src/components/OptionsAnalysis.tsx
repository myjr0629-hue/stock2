"use client";

import { useState, useEffect } from 'react';
import { OptionData } from "@/services/stockTypes";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Anchor, AlertCircle } from "lucide-react";
import { useTranslations } from 'next-intl';

interface OptionsAnalysisProps {
    data: OptionData;
}

export function OptionsAnalysis({ data }: OptionsAnalysisProps) {
    const t = useTranslations('options');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // [수정 핵심] 데이터가 존재하지 않거나 필수 배열(strikes)이 없을 경우 에러 화면 방지
    // Also check for empty array (valid object but no data)
    if (!data || !data.strikes || !Array.isArray(data.strikes) || data.strikes.length === 0) {
        return (
            <div className="flex items-center justify-center p-12 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-500">{t('noData')}</p>
                    <p className="text-[10px] text-slate-400">{t('noDataDesc')}</p>
                </div>
            </div>
        );
    }

    // [Zero OI Check]
    const totalOI = (data.callsOI?.reduce((a, b) => a + b, 0) || 0) + (data.putsOI?.reduce((a, b) => a + b, 0) || 0);
    const isOIMissing = totalOI === 0;

    // [수정 핵심] 안전한 데이터 매핑 (Optional Chaining 적용)
    const chartData = data.strikes.map((strike, idx) => ({
        strike,
        calls: (data.callsOI && data.callsOI[idx]) || 0,
        puts: (data.putsOI && data.putsOI[idx]) || 0,
    }));

    // 수치 계산 시 안전 장치 추가
    const currentPrice = data.currentPrice || 0;
    const maxPain = data.maxPain || 0;
    const maxPainDiff = currentPrice !== 0 ? ((maxPain - currentPrice) / currentPrice) * 100 : 0;

    // GEMS Data Access
    const mmPos = data.gems?.mmPos || "Calculating...";
    const edge = data.gems?.edge || "Neutral";
    const gex = data.gems?.gex || 0;

    // Put-Call Ratio Logic
    const pcr = data.putCallRatio || 0;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        Advanced Options Analysis
                        <span className="text-sm font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-md ml-2">
                            {t('expiration')}: {data.expirationDate || "N/A"}
                        </span>
                    </h2>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium italic">
                        * GEMS V8.1 정밀 엔진: 전체 옵션 체인 딥 스캔 기반 연산 완료
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="flex flex-col items-end">
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${gex > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : gex < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            Net GEX: {gex > 0 ? '+' : ''}{(gex / 1000000).toFixed(1)}M
                        </span>
                        <span className="text-[9px] text-slate-400 mt-1">{t('gammaExposure')}</span>
                    </div>
                </div>
            </div>

            {isOIMissing && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <p className="text-xs text-amber-700">
                        <strong>{t('partialDataMissing')}:</strong> {t('partialDataMissingDesc')}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* KPI Card: Max Pain */}
                <Card className="shadow-sm border-slate-200 bg-white hover:border-emerald-200 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Anchor className="w-4 h-4 text-emerald-500" /> {t('maxPain')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-3xl font-black text-slate-900 tracking-tighter">
                            ${maxPain.toFixed(2)}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                            {t('maxPainDesc')}
                        </p>
                        <div className="flex items-center gap-2 text-xs pt-1 border-t border-slate-50 mt-2">
                            <span className="text-slate-500 font-semibold">{t('vsCurrentPrice')}:</span>
                            <span className={`font-black ${maxPainDiff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {maxPainDiff > 0 ? '+' : ''}{maxPainDiff.toFixed(2)}%
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* KPI Card: MM Position */}
                <Card className="shadow-sm border-slate-200 bg-white hover:border-blue-200 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
                            MM Dealer Positioning
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-2xl font-black text-slate-900 tracking-tight">
                            {mmPos.replace("Dealer ", "")}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                            {gex > 0 ? t('dealerStable') : t('dealerVolatile')}
                        </p>
                        <div className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded inline-block">
                            Net GEX: {gex > 0 ? '+' : ''}{(gex / 1000000).toFixed(2)}M
                        </div>
                    </CardContent>
                </Card>

                {/* KPI Card: Strategic Edge */}
                <Card className="shadow-sm border-blue-100 bg-blue-50/20 hover:bg-blue-50/40 transition-colors">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-extrabold text-blue-600 uppercase tracking-widest">
                            Strategic Edge ({t('recommendedStrategy')})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-lg font-black text-blue-700 leading-tight">
                            {edge}
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                            {t('strategicEdgeDesc')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Commander's Narrative Section (New) */}
            {data.gems?.comment && (
                <Card className="shadow-sm border-emerald-100 bg-emerald-50/20 overflow-hidden border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2 border-b border-emerald-100 bg-emerald-50/40">
                        <CardTitle className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] flex items-center gap-2">
                            Commander's Supply/Demand Narrative
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-medium">
                            {data.gems.comment}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* OI Histogram Chart */}
            <Card className="shadow-sm border-slate-200 bg-white overflow-hidden">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                        Open Interest (OI) Structure
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs font-medium">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-rose-400"></div> Calls
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-400"></div> Puts
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="h-[300px] w-full p-4 flex flex-col min-w-0 min-h-0">
                    {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                <XAxis
                                    dataKey="strike"
                                    stroke="#94a3b8"
                                    fontSize={10}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    fontSize={10}
                                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                                    labelFormatter={(label) => `Strike: $${label}`}
                                />
                                <ReferenceLine x={currentPrice} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Current', position: 'top', fill: '#3b82f6', fontSize: 10 }} />
                                <ReferenceLine x={maxPain} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Max Pain', position: 'top', fill: '#f59e0b', fontSize: 10 }} />

                                <Bar dataKey="calls" name="Call OI" fill="#fb7185" opacity={0.8} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="puts" name="Put OI" fill="#34d399" opacity={0.8} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-50/50 rounded-lg">
                            <span className="text-xs text-slate-400 font-medium">Loading Chart...</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="text-right text-[10px] text-slate-400 font-medium">
                * GEMS V8.1 Metric: MM Position derived from Net Gamma Exposure. Max Pain calculated on Full Chain IO.
            </div>
        </div >
    );
}