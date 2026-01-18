'use client';

import React from 'react';
import Image from 'next/image';

interface IndicatorCardProps {
    title: string;
    badge?: string;
    badgeColor?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple';
    imageSrc?: string;
    meaning: string;
    interpretation: React.ReactNode;
    signals?: { label: string; description: string; color: string }[];
}

export function IndicatorCard({
    title,
    badge,
    badgeColor = 'cyan',
    imageSrc,
    meaning,
    interpretation,
    signals
}: IndicatorCardProps) {
    const badgeColors = {
        cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    };

    return (
        <div className="relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />

            <div className="relative p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    {badge && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeColors[badgeColor]}`}>
                            {badge}
                        </span>
                    )}
                </div>

                {/* Screenshot Image */}
                {imageSrc && (
                    <div className="relative w-full h-48 mb-6 rounded-xl overflow-hidden border border-white/10">
                        <Image
                            src={imageSrc}
                            alt={title}
                            fill
                            className="object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    </div>
                )}

                {/* Meaning */}
                <div className="mb-6">
                    <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-2">
                        💡 의미
                    </h4>
                    <p className="text-slate-300 leading-relaxed">{meaning}</p>
                </div>

                {/* Interpretation */}
                <div className="mb-6">
                    <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-2">
                        📊 해석 가이드
                    </h4>
                    <div className="text-slate-300 leading-relaxed">
                        {interpretation}
                    </div>
                </div>

                {/* Signals */}
                {signals && signals.length > 0 && (
                    <div>
                        <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">
                            🎯 시그널 의미
                        </h4>
                        <div className="grid gap-2">
                            {signals.map((signal, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-white/5"
                                >
                                    <span className={`w-3 h-3 rounded-full ${signal.color}`} />
                                    <span className="font-bold text-white text-sm">{signal.label}</span>
                                    <span className="text-slate-400 text-sm">{signal.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
