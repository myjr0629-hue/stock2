'use client';

import React, { useState, useMemo, useRef } from 'react';

// === TYPES ===
export interface FlowVector {
    sourceId: string;
    targetId: string;
    strength: number;
    rank: number;
}

export interface SectorData {
    id: string;
    name: string;
    density: number; // change percent
    height: number;  // size weight (0.5 - 2.0)
    topTickers: string[];
    color?: string;
}

interface MobileSmartMoneyMapProps {
    sectors: SectorData[];
    vectors: FlowVector[];
    sourceId?: string | null;
    targetId?: string | null;
    onSectorSelect?: (sectorId: string) => void;
    isBullMode?: boolean;
    isMarketActive?: boolean;
}

// === CONSTANTS FOR 2D LAYOUT ===
const FT_W = 360;
const FT_H = 400;
const FT_CX = 180;
const FT_CY = 192;
const FT_RING_X = 94;  // horizontal radius (narrower so side labels don't clip)
const FT_RING_Y = 122; // vertical radius (taller to fill the tall card)
const LABEL_MIN_R = 25; // Hide details on small bubbles unless focused

// Mapping system sector names to short codes for compact fallback
const SECTOR_SHORT_CODES: Record<string, string> = {
    'AI_PWR': 'AI',
    'SMH': 'SM',
    'XLK': 'TK',
    'XLC': 'CM',
    'ICLN': 'CN',
    'XLE': 'EN',
    'XLF': 'FN',
    'HACK': 'CY',
    'XLV': 'HC',
    'SAFE_HAVEN': 'SH',
    'XLY': 'CD',
    'XLI': 'ID',
    'XLB': 'MT',
    'XLP': 'CS',
    'XLRE': 'RE',
    'XLU': 'UT',
    // English variations
    'Communication': 'CM',
    'Communication Services': 'CM',
    // Korean Fallbacks
    '기술주': 'TK',
    '커뮤니케이션': 'CM',
    '임의소비재': 'CD',
    '에너지': 'EN',
    '금융': 'FN',
    '헬스케어': 'HC',
    '산업재': 'ID',
    '소재': 'MT',
    '필수소비재': 'CS',
    '부동산': 'RE',
    '유틸리티': 'UT',
    'AI 전력망': 'AI',
    '반도체': 'SM',
    '사이버보안': 'CY',
    '클린에너지': 'CN',
    '안전자산': 'SH',
};

// Sector Display Labels (Upper text)
const SECTOR_SHORT_LABELS: Record<string, string> = {
    'AI_PWR': 'AI INFRA',
    'SMH': 'SEMIS',
    'XLK': 'TECH',
    'XLC': 'COMMUN.',
    'ICLN': 'CLEAN NRG',
    'XLE': 'ENERGY',
    'XLF': 'FINLS',
    'HACK': 'CYBER',
    'XLV': 'HEALTH',
    'SAFE_HAVEN': 'SAFE HVN',
    'XLY': 'CONS DSC',
    'XLI': 'INDUST',
    'XLB': 'MATERIALS',
    'XLP': 'STAPLES',
    'XLRE': 'REAL EST',
    'XLU': 'UTILITIES',
    // English variations
    'Communication': 'COMMUN.',
    'Communication Services': 'COMMUN.',
    // Korean Fallbacks
    '기술주': 'TECH',
    '커뮤니케이션': 'COMMUN.',
    '임의소비재': 'CONS DSC',
    '에너지': 'ENERGY',
    '금융': 'FINANCIALS',
    '헬스케어': 'HEALTH',
    '산업재': 'INDUST',
    '소재': 'MATERIALS',
    '필수소비재': 'STAPLES',
    '부동산': 'REAL EST',
    '유틸리티': 'UTILITIES',
    'AI 전력망': 'AI INFRA',
    '반도체': 'SEMIS',
    '사이버보안': 'CYBER',
    '클린에너지': 'CLEAN NRG',
    '안전자산': 'SAFE HVN',
};

const getIconKey = (id: string): string => {
    const keyMap: Record<string, string> = {
        'AI_PWR': 'AI_PWR', 'AI 전력망': 'AI_PWR',
        'SMH': 'SMH', '반도체': 'SMH',
        'XLK': 'XLK', '기술주': 'XLK',
        'ICLN': 'ICLN', '클린에너지': 'ICLN',
        'XLE': 'XLE', '에너지': 'XLE',
        'XLF': 'XLF', '금융': 'XLF',
        'HACK': 'HACK', '사이버보안': 'HACK',
        'XLV': 'XLV', '헬스케어': 'XLV',
        'SAFE_HAVEN': 'SAFE_HAVEN', '안전자산': 'SAFE_HAVEN',
        'XLY': 'XLY', '임의소비재': 'XLY',
        'XLI': 'XLI', '산업재': 'XLI',
        'XLB': 'XLB', '소재': 'XLB',
        'XLP': 'XLP', '필수소비재': 'XLP',
        'XLRE': 'XLRE', '부동산': 'XLRE',
        'XLU': 'XLU', '유틸리티': 'XLU',
        'XLC': 'XLC', '커뮤니케이션': 'XLC',
        'Communication': 'XLC', 'Communication Services': 'XLC'
    };
    return keyMap[id] || id;
};

function renderSectorIcon(id: string, color: string, size: number) {
    const key = getIconKey(id);
    const strokeWidth = 1.8;
    const props = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: color,
        strokeWidth: strokeWidth,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const
    };

    switch (key) {
        case 'AI_PWR': // Pulse
            return (
                <svg {...props}>
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
            );
        case 'SMH': // Server
            return (
                <svg {...props}>
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth={2.2} />
                    <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth={2.2} />
                    <line x1="20" y1="6" x2="16" y2="6" />
                    <line x1="20" y1="18" x2="16" y2="18" />
                </svg>
            );
        case 'XLK': // CPU
            return (
                <svg {...props}>
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" fill={color} fillOpacity={0.15} />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="15" x2="23" y2="15" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="15" x2="4" y2="15" />
                </svg>
            );
        case 'ICLN': // Leaf
            return (
                <svg {...props}>
                    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 7a7 7 0 0 1-9 11z" />
                    <path d="M9 22v-2" />
                </svg>
            );
        case 'XLE': // Zap (Lightning)
            return (
                <svg {...props}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={color} fillOpacity={0.15} />
                </svg>
            );
        case 'XLF': // Landmark
            return (
                <svg {...props}>
                    <line x1="3" y1="22" x2="21" y2="22" />
                    <line x1="6" y1="18" x2="6" y2="11" />
                    <line x1="10" y1="18" x2="10" y2="11" />
                    <line x1="14" y1="18" x2="14" y2="11" />
                    <line x1="18" y1="18" x2="18" y2="11" />
                    <polygon points="12 2 2 7 22 7 12 2" />
                </svg>
            );
        case 'HACK': // Shield
            return (
                <svg {...props}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={color} fillOpacity={0.1} />
                </svg>
            );
        case 'XLV': // Heart
            return (
                <svg {...props}>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
            );
        case 'SAFE_HAVEN': // Anchor
            return (
                <svg {...props}>
                    <circle cx="12" cy="5" r="3" />
                    <line x1="12" y1="22" x2="12" y2="8" />
                    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                </svg>
            );
        case 'XLY': // Shopping Bag
            return (
                <svg {...props}>
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
            );
        case 'XLI': // Hard Hat
            return (
                <svg {...props}>
                    <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" />
                    <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
                    <path d="M4 15a8 8 0 0 1 16 0" />
                </svg>
            );
        case 'XLB': // Pickaxe
            return (
                <svg {...props}>
                    <path d="M14.5 2L22 9.5" />
                    <path d="M16 8.5L2 22" />
                    <path d="M8 4.5l6.5 6.5" />
                </svg>
            );
        case 'XLP': // Shopping Cart
            return (
                <svg {...props}>
                    <circle cx="9" cy="21" r="1" fill={color} />
                    <circle cx="20" cy="21" r="1" fill={color} />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
            );
        case 'XLRE': // Building
            return (
                <svg {...props}>
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                    <line x1="9" y1="22" x2="9" y2="16" />
                    <line x1="15" y1="22" x2="15" y2="16" />
                    <line x1="9" y1="16" x2="15" y2="16" />
                    <path d="M8 6h2v2H8V6zm0 4h2v2H8v-2zm8-4h-2v2h2V6zm-2 4h2v2h-2v-2z" />
                </svg>
            );
        case 'XLU': // Droplet
            return (
                <svg {...props}>
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
            );
        case 'XLC': // Wifi
            return (
                <svg {...props}>
                    <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.59 16.11a6 6 0 0 1 6.82 0M12 20h.01" />
                </svg>
            );
        default:
            return (
                <svg {...props}>
                    <circle cx="12" cy="12" r="10" />
                </svg>
            );
    }
}

export default function MobileSmartMoneyMap({
    sectors = [],
    vectors = [],
    sourceId,
    targetId,
    onSectorSelect,
    isBullMode = false,
    isMarketActive = true
}: MobileSmartMoneyMapProps) {
    const [focusedId, setFocusedId] = useState<string | null>(null);

    // Gestures & 3D Interactive States
    const [zoom, setZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [rotationAngle, setRotationAngle] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const touchStartRef = useRef<{
        touchCount: number;
        startX: number;
        startY: number;
        startPanX: number;
        startPanY: number;
        startAngle: number;
        startDistance: number;
        startZoom: number;
    }>({
        touchCount: 0,
        startX: 0,
        startY: 0,
        startPanX: 0,
        startPanY: 0,
        startAngle: 0,
        startDistance: 0,
        startZoom: 1
    });

    const handleTouchStart = (e: React.TouchEvent) => {
        const touches = e.touches;
        if (touches.length === 1) {
            touchStartRef.current = {
                touchCount: 1,
                startX: touches[0].clientX,
                startY: touches[0].clientY,
                startPanX: panX,
                startPanY: panY,
                startAngle: rotationAngle,
                startDistance: 0,
                startZoom: zoom
            };
            setIsDragging(true);
        } else if (touches.length === 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            touchStartRef.current = {
                touchCount: 2,
                startX: (touches[0].clientX + touches[1].clientX) / 2,
                startY: (touches[0].clientY + touches[1].clientY) / 2,
                startPanX: panX,
                startPanY: panY,
                startAngle: rotationAngle,
                startDistance: dist,
                startZoom: zoom
            };
            setIsDragging(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const touches = e.touches;
        const start = touchStartRef.current;

        if (touches.length === 1 && start.touchCount === 1) {
            const dx = touches[0].clientX - start.startX;
            const dy = touches[0].clientY - start.startY;

            // If zoomed in, drag pans the viewport. If not, drag rotates the options ring!
            if (zoom > 1.1) {
                setPanX(start.startPanX + dx);
                setPanY(start.startPanY + dy);
            } else {
                setRotationAngle(start.startAngle + dx * 0.012);
            }
        } else if (touches.length === 2 && start.touchCount === 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const dist = Math.hypot(dx, dy);

            const factor = dist / (start.startDistance || 1);
            const nextZoom = Math.min(3.0, Math.max(0.6, start.startZoom * factor));
            setZoom(nextZoom);

            const midX = (touches[0].clientX + touches[1].clientX) / 2;
            const midY = (touches[0].clientY + touches[1].clientY) / 2;
            setPanX(start.startPanX + (midX - start.startX));
            setPanY(start.startPanY + (midY - start.startY));
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        touchStartRef.current = {
            touchCount: 1,
            startX: e.clientX,
            startY: e.clientY,
            startPanX: panX,
            startPanY: panY,
            startAngle: rotationAngle,
            startDistance: 0,
            startZoom: zoom
        };
        setIsDragging(true);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const start = touchStartRef.current;
        const dx = e.clientX - start.startX;
        const dy = e.clientY - start.startY;

        if (zoom > 1.1) {
            setPanX(start.startPanX + dx);
            setPanY(start.startPanY + dy);
        } else {
            setRotationAngle(start.startAngle + dx * 0.012);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const nextZoom = Math.min(3.0, Math.max(0.6, zoom - e.deltaY * 0.001));
        setZoom(nextZoom);
    };

    const handleDoubleClick = () => {
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setRotationAngle(0);
    };

    // Identify target sector
    const currentTargetId = targetId || (vectors.length > 0 ? vectors[0].targetId : null) || (sectors.length > 0 ? sectors[0].id : 'AI_PWR');

    // Layout Calculation (Hub & Spoke in 2D SVG space)
    const nodes = useMemo(() => {
        if (sectors.length === 0) return [];
        const center = sectors.find(s => s.id === currentTargetId);
        const others = sectors.filter(s => s.id !== currentTargetId);
        const count = others.length;
        const step = (2 * Math.PI) / (count || 1);
        const offset = -Math.PI / 2;

        return [
            ...(center ? [{ ...center, x: FT_CX, y: FT_CY, isCenter: true, angle: 0 }] : []),
            ...others.map((s, i) => {
                const angle = offset + i * step + rotationAngle;
                return {
                    ...s,
                    x: FT_CX + FT_RING_X * Math.cos(angle),
                    y: FT_CY + FT_RING_Y * Math.sin(angle),
                    isCenter: false,
                    angle
                };
            })
        ];
    }, [sectors, currentTargetId, rotationAngle]);

    const activeNodes = useMemo(() => {
        const focusedNode = nodes.find(node => node.id === focusedId);
        return nodes.map(n => {
            let tx = n.x;
            let ty = n.y;

            if (focusedNode && !focusedNode.isCenter) {
                if (n.id === focusedId) {
                    tx = FT_CX;
                    ty = FT_CY;
                } else if (n.isCenter) {
                    tx = focusedNode.x;
                    ty = focusedNode.y;
                }
            }

            return {
                ...n,
                tx,
                ty
            };
        });
    }, [nodes, focusedId]);

    const activeNodeMap = useMemo(() => {
        const map = new Map<string, typeof activeNodes[0]>();
        activeNodes.forEach(n => map.set(n.id, n));
        return map;
    }, [activeNodes]);

    // Radius calculation by weight
    const getBubbleRadius = (node: typeof nodes[0]) => {
        if (node.isCenter) return 44;
        // height is roughly between 0.5 and 2.5
        return 18 + (node.height || 1.0) * 11;
    };

    const handleNodeClick = (nodeId: string) => {
        if (onSectorSelect) {
            onSectorSelect(nodeId);
        }
        setFocusedId(prev => prev === nodeId ? null : nodeId);
    };

    return (
        <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center" style={{ background: '#0a0e14' }}>
            {/* Tap hint */}
            {!focusedId && (
                <span className="absolute top-10 right-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest pointer-events-none select-none animate-pulse">
                    Tap Bubble to Focus
                </span>
            )}

            <svg
                className="w-full h-full select-none touch-none"
                viewBox={`0 0 ${FT_W} ${FT_H}`}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setFocusedId(null);
                        if (onSectorSelect && currentTargetId) {
                            onSectorSelect(currentTargetId);
                        }
                    }
                }}
                onDoubleClick={handleDoubleClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <defs>
                    {/* Radial gradients for sleek glassmorphic bubbles */}
                    {nodes.map(n => (
                        <radialGradient key={n.id} id={`ftg-${n.id}`} cx="0.35" cy="0.3" r="1">
                            <stop offset="0%" stopColor={n.color} stopOpacity="0.34" />
                            <stop offset="70%" stopColor={n.color} stopOpacity="0.10" />
                            <stop offset="100%" stopColor={n.color} stopOpacity="0.03" />
                        </radialGradient>
                    ))}
                    {/* Shadow filters for glows */}
                    <filter id="glow-heavy" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="8" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glow-soft" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* 3D viewport transform wrap group */}
                <g
                    transform={`translate(${panX}, ${panY}) scale(${zoom})`}
                    style={{
                        transformOrigin: `${FT_CX}px ${FT_CY}px`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                    }}
                >
                    {/* Concentric orbital guides */}
                <ellipse
                    cx={FT_CX}
                    cy={FT_CY}
                    rx={FT_RING_X}
                    ry={FT_RING_Y}
                    fill="none"
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth="1.2"
                    strokeDasharray="2 6"
                />

                {/* ── FLOW VECTORS (Lines with animations) ── */}
                {vectors.map((v, i) => {
                    const sourceNode = activeNodeMap.get(v.sourceId);
                    const targetNode = activeNodeMap.get(v.targetId);
                    if (!sourceNode || !targetNode) return null;

                    const mx = (sourceNode.tx + targetNode.tx) / 2 + (sourceNode.ty - targetNode.ty) * 0.18;
                    const my = (sourceNode.ty + targetNode.ty) / 2 + (targetNode.tx - sourceNode.tx) * 0.18;

                    const isAnyFocused = focusedId !== null;
                    const isPartofFocus = focusedId === v.sourceId || focusedId === v.targetId;
                    const isDimmed = isAnyFocused && !isPartofFocus;

                    const strokeColor = sourceNode.color || '#3b82f6';
                    const lineWidth = 1.2 + Math.min(2.5, v.strength / 15);

                    return (
                        <g key={`vec-${i}`} style={{ transition: 'opacity 0.3s ease' }} opacity={isDimmed ? 0.08 : 0.65}>
                            <path
                                d={`M ${sourceNode.tx} ${sourceNode.ty} Q ${mx} ${my} ${targetNode.tx} ${targetNode.ty}`}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth={lineWidth}
                                strokeLinecap="round"
                            />
                            {isMarketActive && (
                                <path
                                    d={`M ${sourceNode.tx} ${sourceNode.ty} Q ${mx} ${my} ${targetNode.tx} ${targetNode.ty}`}
                                    fill="none"
                                    stroke="#ffffff"
                                    strokeWidth={lineWidth * 0.7}
                                    strokeDasharray="4 24"
                                    strokeDashoffset="0"
                                    strokeLinecap="round"
                                    opacity="0.9"
                                >
                                    <animate
                                        attributeName="stroke-dashoffset"
                                        values="200;0"
                                        dur={`${Math.max(1.5, 4 - (v.strength / 8))}s`}
                                        repeatCount="indefinite"
                                    />
                                </path>
                            )}
                        </g>
                    );
                })}

                {activeNodes.map(n => {
                    const r = getBubbleRadius(n);
                    const isFocus = focusedId === n.id;
                    const isAnyFocused = focusedId !== null;
                    const isDimmed = isAnyFocused && !isFocus;

                    const scale = isFocus ? (n.isCenter ? 1.08 : 1.48) : 1;

                    const showFullLabel = isFocus || r >= LABEL_MIN_R;
                    const shortCode = SECTOR_SHORT_CODES[n.id] || n.name.substring(0, 2);
                    const displayLabel = SECTOR_SHORT_LABELS[n.id] || n.name;

                    const mainColor = n.color || '#ffffff';
                    const chgColor = n.density >= 0 ? '#34d399' : '#f87171';

                    return (
                        <g
                            key={n.id}
                            style={{
                                transform: `translate(${n.tx}px, ${n.ty}px) scale(${scale})`,
                                transformOrigin: '0px 0px',
                                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
                                cursor: 'pointer'
                            }}
                            opacity={isDimmed ? 0.25 : 1}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleNodeClick(n.id);
                            }}
                        >
                            <circle
                                r={r + 6}
                                fill="none"
                                stroke={mainColor}
                                strokeOpacity={isFocus ? 0.6 : 0.18}
                                strokeWidth="1"
                                strokeDasharray={n.isCenter ? "3 5" : "none"}
                                style={{
                                    animation: n.isCenter && isMarketActive ? 'spin-slow 20s linear infinite' : 'none',
                                    transformOrigin: '0 0'
                                }}
                            />

                            {/* Dark Glossy Glass Base */}
                            <circle
                                r={r}
                                fill="rgba(10, 14, 22, 0.48)"
                            />

                            {/* Radial Glow Overlay */}
                            <circle
                                r={r}
                                fill={`url(#ftg-${n.id})`}
                                stroke={mainColor}
                                strokeOpacity={isFocus ? 0.95 : 0.4}
                                strokeWidth={isFocus ? 1.8 : 1}
                                style={{
                                    filter: isFocus ? 'url(#glow-heavy)' : 'url(#glow-soft)',
                                    transition: 'stroke-width 0.3s ease'
                                }}
                            />

                            {/* Specular glass reflection shine */}
                            <circle
                                cx={-r * 0.35}
                                cy={-r * 0.35}
                                r={r * 0.22}
                                fill="#ffffff"
                                fillOpacity="0.15"
                                pointerEvents="none"
                            />

                            {/* Glass inner rim */}
                            <circle
                                r={r - 1.5}
                                fill="none"
                                stroke="#ffffff"
                                strokeOpacity="0.08"
                                strokeWidth="1"
                                pointerEvents="none"
                            />

                            {/* Center-aligned Outline Icon */}
                            {(() => {
                                const iconSize = n.isCenter ? 32 : Math.max(16, r * 0.82);
                                const offset = -iconSize / 2;
                                return (
                                    <g transform={`translate(${offset}, ${offset})`} pointerEvents="none" opacity={isFocus ? 0.95 : 0.72}>
                                        {renderSectorIcon(n.id, mainColor, iconSize)}
                                    </g>
                                );
                            })()}

                            {/* Projected Text underneath the Bubble */}
                            <g pointerEvents="none">
                                <text
                                    textAnchor="middle"
                                    y={r + 14}
                                    fill="#f1f5f9"
                                    fontWeight="900"
                                    letterSpacing="0.04em"
                                    style={{ font: `800 ${n.isCenter ? 10.5 : 8.5}px Inter, Pretendard, sans-serif` }}
                                >
                                    {displayLabel}
                                </text>
                                <text
                                    textAnchor="middle"
                                    y={r + 24}
                                    fill={chgColor}
                                    fontWeight="700"
                                    style={{ font: '700 9px Inter, sans-serif', fontVariantNumeric: 'tabular-nums' }}
                                >
                                    {n.density > 0 ? '+' : ''}{n.density.toFixed(1)}%
                                </text>
                            </g>

                            {isFocus && n.topTickers && n.topTickers.length > 0 && n.topTickers.map((ticker, idx) => {
                                const baseAngle = -Math.PI / 2;
                                const fanAngle = baseAngle + idx * (2 * Math.PI / Math.max(1, n.topTickers.length));
                                
                                const dist = r + 26;
                                const sx = dist * Math.cos(fanAngle);
                                const sy = dist * Math.sin(fanAngle);

                                return (
                                    <g key={ticker} className="animate-reveal">
                                        <line
                                            x1={r * Math.cos(fanAngle) * 0.95}
                                            y1={r * Math.sin(fanAngle) * 0.95}
                                            x2={sx}
                                            y2={sy}
                                            stroke={mainColor}
                                            strokeOpacity="0.65"
                                            strokeWidth="0.8"
                                        />
                                        <g transform={`translate(${sx}, ${sy})`}>
                                            <rect
                                                x={-19}
                                                y={-8}
                                                width={38}
                                                height={16}
                                                rx={8}
                                                fill="rgba(5, 10, 20, 0.92)"
                                                stroke={mainColor}
                                                strokeOpacity="0.6"
                                                strokeWidth="0.8"
                                                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                                            />
                                            <mask id={`mask-${ticker}`}>
                                                <rect x={-18} y={-7} width={14} height={14} rx={7} fill="#ffffff" />
                                            </mask>
                                            <g transform="translate(-11, 0)">
                                                <circle r="6" fill="#111827" />
                                                <image
                                                    href={`/api/logo/${ticker}`}
                                                    x={-6}
                                                    y={-6}
                                                    width={12}
                                                    height={12}
                                                    onError={(e) => {
                                                        (e.target as SVGImageElement).setAttribute('visibility', 'hidden');
                                                    }}
                                                />
                                            </g>
                                            <text
                                                x={4}
                                                y={3}
                                                textAnchor="middle"
                                                fill="#ffffff"
                                                fontWeight="800"
                                                style={{ font: '800 7px Inter, sans-serif' }}
                                            >
                                                {ticker}
                                            </text>
                                        </g>
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}
                </g>
            </svg>
            
            {/* Spinning CSS animation support */}
            <style jsx global>{`
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-reveal {
                    animation: reveal 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes reveal {
                    from { opacity: 0; transform: scale(0.6); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
