"use client";

import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Zap, Shield, X, BarChart3, type LucideIcon } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

interface GuardianAlert {
    id: string;
    severity: 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO';
    title: string;
    description: string;
    metrics: Record<string, number>;
    color: string;
    timestamp?: string;
}

interface Props {
    alerts: GuardianAlert[];
    connectionMode: 'websocket' | 'polling' | 'connecting';
}

// ══════════════════════════════════════════════════════════════
// SEVERITY CONFIG — Institutional-Grade Visual Hierarchy
// ══════════════════════════════════════════════════════════════

const SEVERITY_CONFIG: Record<string, { icon: LucideIcon; bgClass: string; pulseClass: string; glowColor: string; textClass: string; borderAccent: string }> = {
    CRITICAL: {
        icon: AlertTriangle,
        bgClass: 'bg-red-500/8 border-red-500/30',
        pulseClass: 'animate-pulse',
        glowColor: 'rgba(239, 68, 68, 0.12)',
        textClass: 'text-red-400',
        borderAccent: 'border-l-red-500',
    },
    HIGH: {
        icon: Zap,
        bgClass: 'bg-amber-500/8 border-amber-500/30',
        pulseClass: '',
        glowColor: 'rgba(245, 158, 11, 0.08)',
        textClass: 'text-amber-400',
        borderAccent: 'border-l-amber-500',
    },
    WARNING: {
        icon: TrendingDown,
        bgClass: 'bg-yellow-500/8 border-yellow-500/25',
        pulseClass: '',
        glowColor: 'rgba(234, 179, 8, 0.06)',
        textClass: 'text-yellow-400',
        borderAccent: 'border-l-yellow-500',
    },
    INFO: {
        icon: TrendingUp,
        bgClass: 'bg-emerald-500/8 border-emerald-500/25',
        pulseClass: '',
        glowColor: 'rgba(16, 185, 129, 0.06)',
        textClass: 'text-emerald-400',
        borderAccent: 'border-l-emerald-500',
    },
};

const ALERT_ICON_MAP: Record<string, LucideIcon> = {
    TRIPLE_DANGER: AlertTriangle,
    HIDDEN_DIVERGENCE: TrendingDown,
    SQUEEZE_ALERT: Zap,
    FULL_BULL: TrendingUp,
    GEX_FLIP: Shield,
    EVENT_IMPACT: BarChart3,
};

// ══════════════════════════════════════════════════════════════
// COMPONENT — Bloomberg-Grade Alert Panel
// ══════════════════════════════════════════════════════════════

export default function GuardianAlertBanner({ alerts, connectionMode }: Props) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Auto-expand when new critical alert arrives
    useEffect(() => {
        const hasCritical = (alerts || []).some(a => a.severity === 'CRITICAL' && !dismissed.has(a.id));
        if (hasCritical) setIsCollapsed(false);
    }, [alerts, dismissed]);

    const visibleAlerts = (alerts || []).filter(a => !dismissed.has(a.id));
    if (visibleAlerts.length === 0) return null;

    const dismissAlert = (id: string) => {
        setDismissed(prev => new Set([...prev, id]));
    };

    return (
        <div className="space-y-2" id="guardian-alert-banner">
            {/* Header bar */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${connectionMode === 'websocket' ? 'bg-emerald-400 animate-pulse' :
                        connectionMode === 'polling' ? 'bg-amber-400' : 'bg-slate-500'
                        }`} />
                    <span className="text-xs uppercase tracking-widest text-slate-300 font-mono">
                        {connectionMode === 'websocket' ? 'LIVE' : connectionMode === 'polling' ? 'POLLING' : 'CONNECTING'}
                        {' · '}CROSS-INTELLIGENCE
                    </span>
                </div>

                {visibleAlerts.length > 1 && (
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-xs text-slate-400 hover:text-slate-200 transition-colors font-mono"
                    >
                        {isCollapsed ? `▼ ${visibleAlerts.length} ALERTS` : '▲ COLLAPSE'}
                    </button>
                )}
            </div>

            {/* Alert cards */}
            {(isCollapsed ? visibleAlerts.slice(0, 1) : visibleAlerts).map((alert, idx) => {
                const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
                const AlertIcon = ALERT_ICON_MAP[alert.id] || config.icon;

                return (
                    <div
                        key={alert.id}
                        className={`
                            relative overflow-hidden rounded-lg border border-l-[3px] backdrop-blur-md
                            ${config.bgClass} ${config.borderAccent} ${config.pulseClass}
                            transition-all duration-500 ease-out
                        `}
                        style={{
                            boxShadow: `0 0 24px ${config.glowColor}`,
                            animation: idx === 0 && alert.severity === 'CRITICAL'
                                ? 'guardian-alert-glow 2s ease-in-out infinite' : undefined,
                        }}
                    >
                        {/* Scanline overlay */}
                        <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-[0.02] pointer-events-none" />

                        <div className="relative flex items-start gap-3 px-4 py-2.5">
                            {/* Icon */}
                            <div className={`flex-shrink-0 mt-0.5 md:mt-1 ${config.textClass}`}>
                                <AlertIcon size={18} strokeWidth={2} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center pt-0.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                    <span className={`text-[10px] px-1.5 py-[3px] rounded font-mono uppercase tracking-wider ${config.bgClass} ${config.textClass} leading-none whitespace-nowrap`}>
                                        {alert.severity}
                                    </span>
                                    <h4 className={`text-[13px] md:text-sm font-bold tracking-wide ${config.textClass} leading-tight`}>
                                        {alert.title}
                                    </h4>
                                    
                                    <span className="hidden lg:inline text-slate-600 flex-shrink-0 leading-none">/</span>
                                    
                                    <p className="w-full lg:w-auto text-[12px] md:text-[13px] text-slate-300 leading-snug break-words flex-1 min-w-[200px]">
                                        {alert.description}
                                    </p>

                                    {/* Metrics pills strictly inline on desktop, wrap on mobile */}
                                    {alert.metrics && Object.keys(alert.metrics).length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0 lg:ml-auto w-full lg:w-auto mt-1 lg:mt-0">
                                            {Object.entries(alert.metrics).map(([key, val]) => (
                                                <span key={key} className="text-[10px] px-1.5 py-[3px] rounded bg-slate-800/80 text-slate-300 font-mono leading-none border border-slate-700/50 whitespace-nowrap">
                                                    {key.toUpperCase()}: {typeof val === 'number' ? val.toFixed(1) : val}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dismiss button */}
                            <button
                                onClick={() => dismissAlert(alert.id)}
                                className="flex-shrink-0 text-slate-400 hover:text-slate-200 transition-colors p-1"
                                aria-label="Dismiss alert"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* CSS keyframes for critical glow */}
            <style jsx>{`
                @keyframes guardian-alert-glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.08); }
                    50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.20); }
                }
            `}</style>
        </div>
    );
}
