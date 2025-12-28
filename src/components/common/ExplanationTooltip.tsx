'use client';

// [S-50.0] Explanation Tooltip Component
// Displays Korean explanations for indicators on hover/click

import React, { useState } from 'react';
import { getExplanation, Explanation } from '@/lib/explanationLibrary';

interface ExplanationTooltipProps {
    indicatorId: string;
    children: React.ReactNode;
    className?: string;
}

export function ExplanationTooltip({ indicatorId, children, className = '' }: ExplanationTooltipProps) {
    const [isOpen, setIsOpen] = useState(false);
    const explanation = getExplanation(indicatorId);

    if (!explanation) {
        return <>{children}</>;
    }

    return (
        <div className={`relative inline-flex items-center gap-1 ${className}`}>
            {children}
            <button
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
                aria-label={`${explanation.label} 설명 보기`}
            >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-[#1A1F26] border border-slate-600 rounded-lg shadow-xl p-4 text-left">
                    <div className="text-xs font-bold text-emerald-400 mb-1">
                        {explanation.label}
                    </div>
                    <div className="space-y-2 text-[11px] text-slate-300">
                        <div>
                            <span className="text-slate-500 font-medium">정의: </span>
                            {explanation.meaning}
                        </div>
                        <div>
                            <span className="text-slate-500 font-medium">해석: </span>
                            {explanation.interpretation}
                        </div>
                        <div>
                            <span className="text-slate-500 font-medium">행동: </span>
                            {explanation.action}
                        </div>
                        {explanation.caution && (
                            <div className="text-amber-400/80">
                                <span className="font-medium">⚠️ 주의: </span>
                                {explanation.caution}
                            </div>
                        )}
                    </div>
                    {/* Arrow */}
                    <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-[#1A1F26] border-r border-b border-slate-600 transform rotate-45"></div>
                </div>
            )}
        </div>
    );
}

// Simple badge variant for inline use
interface ExplanationBadgeProps {
    indicatorId: string;
    showLabel?: boolean;
}

export function ExplanationBadge({ indicatorId, showLabel = false }: ExplanationBadgeProps) {
    const explanation = getExplanation(indicatorId);
    if (!explanation) return null;

    return (
        <ExplanationTooltip indicatorId={indicatorId}>
            {showLabel && <span className="text-slate-400 text-xs">{explanation.label}</span>}
        </ExplanationTooltip>
    );
}

// Wrapper for adding tooltip to any element with indicator context
interface WithExplanationProps {
    indicatorId: string;
    children: React.ReactNode;
    inline?: boolean;
}

export function WithExplanation({ indicatorId, children, inline = true }: WithExplanationProps) {
    return (
        <ExplanationTooltip indicatorId={indicatorId} className={inline ? 'inline-flex' : 'flex'}>
            {children}
        </ExplanationTooltip>
    );
}
