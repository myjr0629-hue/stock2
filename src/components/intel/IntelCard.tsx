/**
 * IntelCard — Reusable intel section card template
 * 
 * Features:
 *  - SVG infographic background (pass your own or use built-in presets)
 *  - Top accent gradient line
 *  - Consistent padding, border, rounded corners
 *  - h-full for grid height sync
 *  - Dark theme matching M7/PhysicalAI design system
 * 
 * Usage:
 *   <IntelCard
 *     title="ANALYST CONSENSUS"
 *     icon={<Users className="w-3.5 h-3.5 text-cyan-400" />}
 *     accentColor="cyan"
 *     badge="467 analysts"
 *     background="gauge"            // preset: 'gauge' | 'calendar' | 'bars' | 'flow' | 'none'
 *     // OR pass custom SVG:
 *     // customBackground={<MySvgBg />}
 *   >
 *     {children}
 *   </IntelCard>
 */
'use client';
import { ReactNode } from 'react';

// ── Preset SVG Infographic Backgrounds ──

function GaugeBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            <path d="M30 140 A70 70 0 0 1 170 140" stroke="currentColor" strokeWidth="3" fill="none" />
            <path d="M45 140 A55 55 0 0 1 155 140" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <line x1="100" y1="140" x2="55" y2="85" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="100" cy="140" r="4" fill="currentColor" />
            <line x1="30" y1="140" x2="35" y2="130" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="95" x2="58" y2="100" stroke="currentColor" strokeWidth="1.5" />
            <line x1="100" y1="70" x2="100" y2="78" stroke="currentColor" strokeWidth="1.5" />
            <line x1="150" y1="95" x2="142" y2="100" stroke="currentColor" strokeWidth="1.5" />
            <line x1="170" y1="140" x2="165" y2="130" stroke="currentColor" strokeWidth="1.5" />
            <text x="155" y="45" fontSize="32" fill="currentColor" opacity="0.25" fontWeight="bold">%</text>
        </svg>
    );
}

function CalendarBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            <rect x="25" y="30" width="150" height="120" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <line x1="25" y1="55" x2="175" y2="55" stroke="currentColor" strokeWidth="1" />
            <line x1="62" y1="55" x2="62" y2="150" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
            <line x1="100" y1="55" x2="100" y2="150" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
            <line x1="137" y1="55" x2="137" y2="150" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
            <line x1="25" y1="87" x2="175" y2="87" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
            <line x1="25" y1="119" x2="175" y2="119" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
            <rect x="63" y="56" width="36" height="30" rx="2" fill="currentColor" opacity="0.15" />
            <line x1="55" y1="22" x2="55" y2="38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="145" y1="22" x2="145" y2="38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="165" cy="30" r="12" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3" />
            <line x1="165" y1="30" x2="165" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.3" />
            <line x1="165" y1="30" x2="172" y2="33" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
    );
}

function BarsBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            <rect x="20" y="120" width="16" height="45" rx="2" fill="currentColor" />
            <rect x="45" y="95" width="16" height="70" rx="2" fill="currentColor" />
            <rect x="70" y="70" width="16" height="95" rx="2" fill="currentColor" />
            <rect x="95" y="50" width="16" height="115" rx="2" fill="currentColor" />
            <rect x="120" y="30" width="16" height="135" rx="2" fill="currentColor" />
            <rect x="145" y="55" width="16" height="110" rx="2" fill="currentColor" />
            <rect x="170" y="40" width="16" height="125" rx="2" fill="currentColor" />
            <path d="M28 118 L53 93 L78 68 L103 48 L128 28 L153 53 L178 38" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            <text x="160" y="30" fontSize="28" fill="currentColor" opacity="0.3" fontWeight="bold">$</text>
        </svg>
    );
}

function FlowBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            {/* Network flow pattern */}
            <circle cx="40" cy="50" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="100" cy="30" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="160" cy="50" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="70" cy="110" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="130" cy="110" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="100" cy="160" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <line x1="48" y1="50" x2="92" y2="30" stroke="currentColor" strokeWidth="1" />
            <line x1="108" y1="30" x2="152" y2="50" stroke="currentColor" strokeWidth="1" />
            <line x1="40" y1="58" x2="70" y2="102" stroke="currentColor" strokeWidth="1" />
            <line x1="160" y1="58" x2="130" y2="102" stroke="currentColor" strokeWidth="1" />
            <line x1="78" y1="110" x2="122" y2="110" stroke="currentColor" strokeWidth="1" />
            <line x1="70" y1="118" x2="100" y2="152" stroke="currentColor" strokeWidth="1" />
            <line x1="130" y1="118" x2="100" y2="152" stroke="currentColor" strokeWidth="1" />
        </svg>
    );
}

// ── Background Registry ──
const BG_PRESETS: Record<string, () => ReactNode> = {
    gauge: GaugeBg,
    calendar: CalendarBg,
    bars: BarsBg,
    flow: FlowBg,
};

// ── Accent Color Map ──
const ACCENT_COLORS: Record<string, string> = {
    cyan: 'via-cyan-400/40',
    amber: 'via-amber-400/40',
    emerald: 'via-emerald-400/40',
    rose: 'via-rose-400/40',
    violet: 'via-violet-400/40',
    blue: 'via-blue-400/40',
    orange: 'via-orange-400/40',
};

// ── Main Component ──
interface IntelCardProps {
    /** Card title (uppercase recommended) */
    title: string;
    /** Icon element (e.g., lucide-react icon) */
    icon: ReactNode;
    /** Accent color for top gradient line */
    accentColor?: keyof typeof ACCENT_COLORS;
    /** Right-side badge text (e.g., "467 analysts") */
    badge?: string;
    /** Preset background: 'gauge' | 'calendar' | 'bars' | 'flow' | 'none' */
    background?: string;
    /** Custom SVG background (overrides preset) */
    customBackground?: ReactNode;
    /** Card border color override */
    borderColor?: string;
    /** Card background color override */
    bgColor?: string;
    /** Card content */
    children: ReactNode;
}

export function IntelCard({
    title,
    icon,
    accentColor = 'cyan',
    badge,
    background = 'none',
    customBackground,
    borderColor = 'border-slate-800/50',
    bgColor = 'bg-[#0a0f18]',
    children,
}: IntelCardProps) {
    const BgComponent = customBackground ? null : BG_PRESETS[background];
    const accentClass = ACCENT_COLORS[accentColor] || ACCENT_COLORS.cyan;

    return (
        <div className={`relative overflow-hidden ${bgColor} border ${borderColor} rounded-lg p-3 shadow-md h-full`}>
            {/* SVG Background */}
            {customBackground || (BgComponent && <BgComponent />)}

            {/* Top accent line */}
            <div className={`absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent ${accentClass} to-transparent`} />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {icon}
                        <span className="text-xs font-bold text-white tracking-wider uppercase">{title}</span>
                    </div>
                    {badge && <span className="text-[11px] text-white/70">{badge}</span>}
                </div>

                {/* Content */}
                {children}
            </div>
        </div>
    );
}

// Re-export background presets for standalone use
export { GaugeBg, CalendarBg, BarsBg, FlowBg };
