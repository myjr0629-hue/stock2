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
        const hasCritical = alerts.some(a => a.severity === 'CRITICAL' && !dismissed.has(a.id));
        if (hasCritical) setIsCollapsed(false);
    }, [alerts, dismissed]);

    const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));
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
                    <span className="text-xs uppercase tracking-widest text-slate-500 font-mono">
                        {connectionMode === 'websocket' ? 'LIVE' : connectionMode === 'polling' ? 'POLLING' : 'CONNECTING'}
                        {' · '}CROSS-INTELLIGENCE
                    </span>
                </div>

                {visibleAlerts.length > 1 && (
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-mono"
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

                        <div className="relative flex items-start gap-3 px-4 py-3">
                            {/* Icon */}
                            <div className={`flex-shrink-0 mt-0.5 ${config.textClass}`}>
                                <AlertIcon size={18} strokeWidth={2} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className={`text-sm font-bold tracking-wide ${config.textClass}`}>
                                        {alert.title}
                                    </h4>
                                    <span className={`text-xs px-2 py-0.5 rounded font-mono uppercase tracking-wider ${config.bgClass} ${config.textClass}`}>
                                        {alert.severity}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                    {alert.description}
                                </p>

                                {/* Metrics pills */}
                                {alert.metrics && Object.keys(alert.metrics).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {Object.entries(alert.metrics).map(([key, val]) => (
                                            <span key={key} className="text-xs px-2 py-0.5 rounded bg-slate-800/60 text-slate-300 font-mono">
                                                {key.toUpperCase()}: {typeof val === 'number' ? val.toFixed(1) : val}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Dismiss button */}
                            <button
                                onClick={() => dismissAlert(alert.id)}
                                className="flex-shrink-0 text-slate-600 hover:text-slate-300 transition-colors p-1"
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
