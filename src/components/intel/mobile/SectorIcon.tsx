'use client';

// ============================================================================
// SectorIcon — Premium Infographic SVG Icons for Sector List
// Replaces emoji with clean, colored vector icons
// Each icon uses the sector's accent color for a cohesive, premium look
// ============================================================================

import React from 'react';

interface SectorIconProps {
    sectorKey: string;
    color: string;  // hex color
    size?: number;
}

export function SectorIcon({ sectorKey, color, size = 20 }: SectorIconProps) {
    const s = size;
    const half = s / 2;

    const iconMap: Record<string, React.ReactNode> = {
        // ⚡ M7 — Lightning bolt
        m7: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M13 2L4.5 14H12L11 22L19.5 10H12L13 2Z" fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        // 🤖 Physical AI — CPU/chip
        physicalAI: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="6" y="6" width="12" height="12" rx="2" fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
                <rect x="9" y="9" width="6" height="6" rx="1" fill={color} fillOpacity={0.3} />
                <line x1="9" y1="4" x2="9" y2="6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="12" y1="4" x2="12" y2="6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="15" y1="4" x2="15" y2="6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="9" y1="18" x2="9" y2="20" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="12" y1="18" x2="12" y2="20" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="15" y1="18" x2="15" y2="20" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="4" y1="9" x2="6" y2="9" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="4" y1="12" x2="6" y2="12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="4" y1="15" x2="6" y2="15" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="18" y1="9" x2="20" y2="9" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="18" y1="12" x2="20" y2="12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="18" y1="15" x2="20" y2="15" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
            </svg>
        ),
        // 💎 Silicon Core — Diamond/gem
        siliconCore: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M6 3H18L21 9L12 21L3 9L6 3Z" fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                <path d="M3 9H21" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
                <path d="M12 21L9 9L12 3L15 9L12 21Z" fill={color} fillOpacity={0.2} />
            </svg>
        ),
        // 🔋 Power Matrix — Energy/power
        powerMatrix: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="6" y="4" width="12" height="16" rx="2" fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} />
                <rect x="10" y="2" width="4" height="2" rx="0.5" fill={color} />
                <rect x="8.5" y="8" width="7" height="3" rx="0.5" fill={color} fillOpacity={0.4} />
                <rect x="8.5" y="12.5" width="7" height="3" rx="0.5" fill={color} fillOpacity={0.25} />
            </svg>
        ),
        // 🧬 Bio Pulse — DNA helix
        bioPulse: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M7 4C7 4 7 8 12 12C17 16 17 20 17 20" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <path d="M17 4C17 4 17 8 12 12C7 16 7 20 7 20" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1="8" y1="7" x2="16" y2="7" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.5} />
                <line x1="9" y1="10" x2="15" y2="10" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.5} />
                <line x1="9" y1="14" x2="15" y2="14" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.5} />
                <line x1="8" y1="17" x2="16" y2="17" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.5} />
            </svg>
        ),
        // 🛡️ Cyber Shield — Shield
        cyberShield: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M12 3L4 7V12C4 16.4 7.4 20.5 12 21.5C16.6 20.5 20 16.4 20 12V7L12 3Z" fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                <path d="M9 12L11 14L15 10" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        // 🚀 Orbit Defense — Rocket/orbit
        orbitDefense: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} />
                <ellipse cx="12" cy="12" rx="9" ry="4" stroke={color} strokeWidth={1.2} strokeOpacity={0.4} transform="rotate(-30 12 12)" />
                <ellipse cx="12" cy="12" rx="9" ry="4" stroke={color} strokeWidth={1.2} strokeOpacity={0.4} transform="rotate(30 12 12)" />
            </svg>
        ),
        // ⚛️ Quantum Edge — Atom
        quantumEdge: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="2.5" fill={color} fillOpacity={0.5} />
                <ellipse cx="12" cy="12" rx="10" ry="4" stroke={color} strokeWidth={1.3} strokeOpacity={0.6} />
                <ellipse cx="12" cy="12" rx="10" ry="4" stroke={color} strokeWidth={1.3} strokeOpacity={0.6} transform="rotate(60 12 12)" />
                <ellipse cx="12" cy="12" rx="10" ry="4" stroke={color} strokeWidth={1.3} strokeOpacity={0.6} transform="rotate(120 12 12)" />
            </svg>
        ),
        // 💳 Fintech Pulse — Finance chart
        fintechPulse: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1.5} />
                <path d="M7 15L10 11L13 13L17 9" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="17" cy="9" r="1.5" fill={color} fillOpacity={0.4} />
            </svg>
        ),
        // ☁️ Cloud Fortress — Cloud
        cloudFortress: (
            <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
                <path d="M6 19C3.8 19 2 17.2 2 15C2 13.1 3.3 11.5 5.1 11.1C5 10.7 5 10.4 5 10C5 7.2 7.2 5 10 5C12.1 5 13.9 6.3 14.6 8.1C15 8 15.5 8 16 8C18.8 8 21 10.2 21 13C21 15.8 18.8 18 16 18" 
                    fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 19V15M12 19V13M15 19V16" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
            </svg>
        ),
    };

    return (
        <div className="shrink-0 flex items-center justify-center" style={{ width: s, height: s }}>
            {iconMap[sectorKey] || <span style={{ fontSize: s * 0.75 }}>●</span>}
        </div>
    );
}
