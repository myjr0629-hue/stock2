
"use client";

import React from 'react';
import { useTranslations } from 'next-intl';

interface MarketStatusProps {
    status: {
        market: "open" | "closed" | "extended-hours";
        session: "pre" | "regular" | "post" | "closed";
        isHoliday: boolean;
        holidayName?: string;
        serverTime?: string;
        source?: string;
    };
    variant?: "header" | "dashboard" | "live";
    className?: string;
}

export const MarketStatusBadge: React.FC<MarketStatusProps> = ({ status, variant = "dashboard", className = "" }) => {
    const { market, session, isHoliday, holidayName, serverTime } = status;
    const isClosed = market === "closed";
    const t = useTranslations('common');

    // Status Logic
    const displayText = isHoliday
        ? `${t('holidayClosed')} (${holidayName || "Holiday"})`
        : isClosed
            ? t('marketClosed')
            : session === "pre"
                ? t('preMarket')
                : session === "regular"
                    ? t('regularOpen')
                    : session === "post"
                        ? t('afterMarket')
                        : t('marketClosed');

    // Color Logic
    const dotColor = isHoliday
        ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
        : isClosed
            ? "bg-slate-500"
            : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";

    const textColor = isHoliday
        ? "text-rose-400"
        : isClosed
            ? "text-slate-400"
            : "text-emerald-400";

    // Header Variant (Compact)
    if (variant === "header") {
        return (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 ${className}`}>
                <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`}></span>
                <span className={`text-[11px] font-bold ${textColor}`}>
                    {session === "regular" ? "US Market OPEN" : session === "pre" ? "Pre-Market" : session === "post" ? "Post-Market" : "Market Closed"}
                </span>
            </div>
        );
    }

    // Dashboard Variant (Full info)
    if (variant === "dashboard") {
        return (
            <div className={`flex flex-col ${className}`}>
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                    <span className={`text-sm font-bold ${textColor}`}>
                        {displayText}
                    </span>
                </div>
                {serverTime && (
                    <span className="text-[9px] text-slate-600 mt-0.5 font-mono">
                        {t('basedOn')}: {new Date(serverTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET
                        {status.source === "FALLBACK" && " (Logic)"}
                    </span>
                )}
            </div>
        );
    }

    // Live Variant (Simple text)
    if (variant === "live") {
        return (
            <div className={`flex items-center gap-1.5 ${className}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                <span className={`text-[10px] font-bold ${textColor}`}>
                    {isHoliday ? `CLOSED (${holidayName || "Holiday"})` : session.toUpperCase()}
                </span>
            </div>
        );
    }

    return null;
};
