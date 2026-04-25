
"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, QuadraticBezierLine } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { FlowParticle } from "./FlowParticle";
import { SECTOR_VISUALS, SECTOR_BG_COLORS } from "./SectorIcons";

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
    density: number; // Used for "+2.4%" label
    height: number;  // Used for Sizing (0.5 - 2.0)
    topTickers: string[];
    color?: string; // Fallback
}

interface SmartMoneyMapProps {
    sectors?: SectorData[];
    vectors?: FlowVector[];
    sourceId?: string | null;
    targetId?: string | null;
    onSectorSelect?: (sectorId: string) => void;
    isBullMode?: boolean; // [V3.0] Regime Flag
    isMarketActive?: boolean; // [V7.7] Disable animations when market closed
}

// === CONSTANTS ===
const CENTER_SCALE_BOOST = 2.5;

// === HELPER: HUB & SPOKE LAYOUT ===
function calculateHubLayout(sectors: SectorData[], vectors: FlowVector[], targetId?: string | null, ringRadius: number = 10) {
    if (sectors.length === 0) return [];

    // 1. Identify Center (Dominant) Sector
    // Priority: Explicit Target -> Target of Top Vector -> Highest Weight
    let centerId = targetId;

    // If no target selected, try to find the "Main Flow Target"
    if (!centerId && vectors && vectors.length > 0) {
        centerId = vectors[0].targetId; // Top ranked vector target
    }

    // Fallback: Max Height (Market Cap/Volume weight)
    if (!centerId) {
        const sorted = [...sectors].sort((a, b) => b.height - a.height);
        if (sorted.length > 0) centerId = sorted[0].id;
    }

    const centerSector = sectors.find(s => s.id === centerId);
    const others = sectors.filter(s => s.id !== centerId);

    const nodes = [];

    // 2. Place Center
    if (centerSector) {
        nodes.push({
            ...centerSector,
            pos: new THREE.Vector3(0, 0, 0),
            isCenter: true,
            angle: 0
        });
    }

    // 3. Place Ring (Solar System)
    const count = others.length;
    const angleStep = (2 * Math.PI) / count;
    // Offset to start nicely
    const angleOffset = -Math.PI / 2;

    others.forEach((s, i) => {
        const angle = angleOffset + (i * angleStep);
        const x = ringRadius * Math.cos(angle);
        const z = ringRadius * Math.sin(angle);
        nodes.push({
            ...s,
            pos: new THREE.Vector3(x, 0, z),
            isCenter: false,
            angle
        });
    });

    return nodes;
}

// === COMPONENT: HTML NODE (2D Overlay) ===
function HtmlNode({ data, position, onClick, isSource, isTarget, isCenter, isMarketActive = true, compact = false }: {
    data: SectorData & { pos: THREE.Vector3 },
    position: THREE.Vector3,
    onClick: (d: SectorData) => void,
    isSource: boolean,
    isTarget: boolean,
    isCenter?: boolean,
    isMarketActive?: boolean,
    compact?: boolean
}) {
    const visual = SECTOR_VISUALS[data.id];
    const Icon = visual?.icon;
    const color = visual?.color || data.color || "#ffffff";
    const bgFill = SECTOR_BG_COLORS[data.id] || "rgba(255,255,255,0.1)";

    const [hovered, setHovered] = useState(false);

    // Dynamic Sizing based on Weight (Height)
    // Central Hub gets massive boost. Compact mode for mobile.
    let baseSize = compact ? 55 : 90;
    if (isCenter) baseSize = compact ? 80 : 140;

    // Weight Modifier: 0.9 ... 1.5
    let weightMod = 0.9 + (data.height * (compact ? 0.2 : 0.4));
    if (isCenter) weightMod = 1.0; // Fixed large scale for center

    const sizePx = baseSize * weightMod;

    // Active State Styling
    const isActive = isSource || isTarget || hovered || isCenter;
    const borderColor = isActive ? color : "#334155";
    // Center gets stronger glow
    const shadowClass = isCenter
        ? `0 0 50px ${color}50`
        : (isActive ? `0 0 20px ${color}40` : "none");

    const changeColor = data.density >= 0 ? "#34d399" : "#f43f5e";

    return (
        <group position={position}>
            {/* 3D Anchor for HTML */}
            <Html center zIndexRange={[100, 0]} distanceFactor={compact ? 22 : 30}>
                <div
                    className="relative flex flex-col items-center justify-center transition-all duration-300 cursor-pointer"
                    style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
                    onClick={(e) => { e.stopPropagation(); onClick(data); }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    {/* RING ANIMATION FOR CENTER or AI_PWR (Turbo) — static when market closed */}
                    {(isCenter || data.id === 'AI_PWR') && (
                        <div
                            className={`absolute inset-[-15px] rounded-full border-2 border-dashed opacity-30 ${isMarketActive ? (isCenter ? 'animate-spin-slow' : 'animate-spin') : ''}`}
                            style={{
                                borderColor: color,
                                animationDuration: isMarketActive ? (data.id === 'AI_PWR' ? '1.5s' : '10s') : undefined
                            }}
                        />
                    )}

                    {/* EXTRA PULSE FOR AI_PWR (High Voltage) — disabled when market closed */}
                    {data.id === 'AI_PWR' && isMarketActive && (
                        <div className="absolute inset-[-5px] rounded-full border border-cyan-400 opacity-60 animate-ping" />
                    )}

                    {/* [SMART MONEY FOOTPRINT] Heatmap intensity ring — flow magnitude visualization */}
                    {Math.abs(data.density) > 0.3 && (
                        <div
                            className={`absolute rounded-full pointer-events-none ${Math.abs(data.density) > 2 && isMarketActive ? 'animate-pulse' : ''
                                }`}
                            style={{
                                inset: '-6px',
                                border: `2px solid ${data.density >= 0 ? 'rgba(52,211,153,' : 'rgba(248,113,113,'}${Math.min(0.7, Math.abs(data.density) / 5)})`,
                                boxShadow: `0 0 ${Math.min(20, Math.abs(data.density) * 4)}px ${data.density >= 0 ? 'rgba(52,211,153,' : 'rgba(248,113,113,'
                                    }${Math.min(0.4, Math.abs(data.density) / 8)})`,
                                borderRadius: '9999px',
                            }}
                        />
                    )}

                    {/* MAIN CIRCLE */}
                    <div
                        className="absolute inset-0 rounded-full border-2 backdrop-blur-sm flex items-center justify-center transition-all duration-500"
                        style={{
                            borderColor: borderColor,
                            backgroundColor: hovered || isCenter ? `${color}15` : bgFill,
                            boxShadow: shadowClass,
                            transform: hovered ? "scale(1.1)" : "scale(1)"
                        }}
                    >
                        {/* ICON */}
                        {Icon && <Icon size={sizePx * 0.4} color={isActive ? "white" : color} strokeWidth={isCenter ? "2" : "1.5"} />}
                    </div>

                    {/* LABELS (Below) */}
                    <div
                        className="absolute top-full mt-2 flex flex-col items-center whitespace-nowrap pointer-events-none"
                    >
                        <span className={`text-white font-bold tracking-wider uppercase opacity-90 shadow-black drop-shadow-md ${isCenter ? (compact ? 'text-[11px]' : 'text-[14px]') : (compact ? 'text-[10px]' : 'text-[12px]')}`}>
                            {visual?.label || data.name}
                        </span>
                        <span className={`font-mono drop-shadow-md ${compact ? 'text-[10px]' : 'text-[12px]'}`} style={{ color: changeColor }}>
                            {data.density > 0 ? "+" : ""}{(data.density).toFixed(2)}%
                        </span>
                    </div>

                    {/* ACTIVE INDICATOR DOT — static when market closed */}
                    {!isCenter && isSource && (
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 border border-black ${isMarketActive ? 'animate-pulse' : ''}`} />
                    )}
                    {!isCenter && isTarget && (
                        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-black ${isMarketActive ? 'animate-pulse' : ''}`} />
                    )}
                </div>
            </Html>
        </group>
    );
}

// === COMPONENT: CURVED ARROW ===
function CurvedFlowArrow({ start, end, strength, color = "#3b82f6", isBullMode = false, isMarketActive = true }: { start: THREE.Vector3, end: THREE.Vector3, strength: number, color?: string, isBullMode?: boolean, isMarketActive?: boolean }) {
    // Logic: Lift the curve in Y to jump over other nodes if needed.
    const mid = start.clone().lerp(end, 0.5);

    // Arc Height based on distance
    const dist = start.distanceTo(end);
    const controlPoint = mid.clone();
    controlPoint.y += Math.max(2.0, dist * 0.2); // Proportional arc

    const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, controlPoint, end), [start, end, controlPoint]);
    const endTangent = useMemo(() => curve.getTangent(1).normalize(), [curve]);
    // Back off slightly from center to avoid hitting the icon
    const arrowHeadPos = end.clone().sub(endTangent.clone().multiplyScalar(2.0));

    // [VISUAL PHYSICS V3.0]
    // Speed: dynamic based on Strength (0.5 ~ 3.0)
    const speed = Math.min(3.0, 0.5 + (strength / 15));

    // Golden Sparkle: If strength is massive (>25), OR if Regime is Bull and strength is moderate (>15), use GOLD.
    const isTorrent = strength > 25;
    const isGolden = isTorrent || (isBullMode && strength > 15);

    const particleColor = isGolden ? "#FFD700" : (color === "#ffffff" ? "#818cf8" : color);
    const particleSize = isTorrent ? 1.5 : (isBullMode ? 1.2 : 1.0);

    return (
        <group>
            {/* GLOW LINE */}
            <QuadraticBezierLine
                start={start}
                end={end}
                mid={controlPoint}
                color={particleColor} // Tint the line too
                lineWidth={isTorrent ? 3 : 2}
                transparent
                opacity={isTorrent ? 0.6 : 0.4}
            />
            {/* WHITE CORE (Reduced opacity for Gold to shine) */}
            <QuadraticBezierLine
                start={start}
                end={end}
                mid={controlPoint}
                color="white"
                lineWidth={0.5}
                transparent
                opacity={0.4}
            />
            {/* PARTICLES - High Velocity. Only animate during active market */}
            {isMarketActive && (
                <>
                    <FlowParticle curve={curve} delay={0} speed={speed} size={particleSize} color={particleColor} />
                    {/* Secondary Particle only for strong flows */}
                    {strength > 10 && (
                        <FlowParticle curve={curve} delay={0.3 / speed} speed={speed * 1.1} size={particleSize * 0.7} color={particleColor} />
                    )}
                    {/* Torrent gets a third particle! */}
                    {isTorrent && (
                        <FlowParticle curve={curve} delay={0.6 / speed} speed={speed * 0.9} size={particleSize * 0.8} color="#ffffff" />
                    )}
                </>
            )}

            {/* ARROW HEAD */}
            <ArrowHead position={arrowHeadPos} lookAtTarget={end} color={particleColor} />
        </group>
    )
}

function ArrowHead({ position, lookAtTarget, color }: { position: THREE.Vector3, lookAtTarget: THREE.Vector3, color: string }) {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.lookAt(lookAtTarget);
            meshRef.current.rotateX(Math.PI / 2); // Cone default points up
        }
    });
    return (
        <mesh ref={meshRef} position={position}>
            <coneGeometry args={[0.3, 0.8, 12]} />
            <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
    );
}


// === MAIN SCENE ===
export default function SmartMoneyMap({ sectors = [], vectors = [], sourceId, targetId, onSectorSelect, isBullMode = false, isMarketActive = true }: SmartMoneyMapProps) {
    // Detect mobile IMMEDIATELY for useState defaults — critical for R3F Canvas
    // Canvas camera prop is only applied on initial mount, NOT on subsequent state changes
    const isMobileInit = typeof window !== 'undefined' && window.innerWidth < 768;

    const [cameraPos, setCameraPos] = useState<[number, number, number]>(isMobileInit ? [0, 72, 0] : [0, 55, 0]);
    const [ringRadius, setRingRadius] = useState<number>(isMobileInit ? 11 : 10);
    const [isCompact, setIsCompact] = useState(isMobileInit);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                // Mobile viewport: Wider ring + Higher camera = nodes properly spaced and smaller
                setRingRadius(11);
                setCameraPos([0, 72, 0]);
                setIsCompact(true);
            } else {
                // Desktop — UNCHANGED
                setRingRadius(10);
                setCameraPos([0, 55, 0]);
                setIsCompact(false);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Layout: Hub & Spoke
    const nodes = useMemo(() => calculateHubLayout(sectors, vectors, targetId, ringRadius), [sectors, vectors, targetId, ringRadius]);

    // Helper to find position
    const getPos = (id: string) => nodes.find(n => n.id === id)?.pos;

    // Build Arrows
    const renderArrows = useMemo(() => {
        const els: React.ReactNode[] = [];

        if (vectors && vectors.length > 0) {
            vectors.forEach((v, i) => {
                const sPos = getPos(v.sourceId);
                const tPos = getPos(v.targetId);
                const color = SECTOR_VISUALS[v.sourceId]?.color || "#3b82f6";

                if (sPos && tPos) {
                    els.push(
                        <CurvedFlowArrow
                            key={`vec-${i}`}
                            start={sPos}
                            end={tPos}
                            strength={v.strength}
                            color={color}
                            isBullMode={isBullMode} // Pass Regime
                            isMarketActive={isMarketActive}
                        />
                    );
                }
            });
        }
        else if (sourceId && targetId) {
            const sPos = getPos(sourceId);
            const tPos = getPos(targetId);
            if (sPos && tPos) {
                els.push(
                    <CurvedFlowArrow
                        key="sel-arrow"
                        start={sPos}
                        end={tPos}
                        strength={20}
                        color="#ffffff"
                        isBullMode={isBullMode}
                        isMarketActive={isMarketActive}
                    />
                );
            }
        }
        return els;
    }, [nodes, vectors, sourceId, targetId, isBullMode]); // Added isBullMode dep

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ background: '#0a0e14', clipPath: 'inset(0)' }}>
            {/* Adjusted Camera: key forces full Canvas recreation with correct camera on tab re-mount */}
            <Canvas key={isCompact ? 'mobile' : 'desktop'} camera={{ position: cameraPos, fov: 35 }} frameloop="always">
                <ambientLight intensity={0.5} />
                <pointLight position={[0, 20, 0]} intensity={1} />

                {/* NODES */}
                {nodes.map((node) => (
                    <HtmlNode
                        key={node.id}
                        data={node}
                        position={node.pos}
                        onClick={(d) => onSectorSelect && onSectorSelect(d.id)}
                        isSource={node.id === sourceId || vectors?.some(v => v.sourceId === node.id) || false}
                        isTarget={node.id === targetId || vectors?.some(v => v.targetId === node.id) || false}
                        isCenter={node.isCenter}
                        isMarketActive={isMarketActive}
                        compact={isCompact}
                    />
                ))}

                {/* ARROWS */}
                {renderArrows}

                {/* CONTROLS - Limit Max Distance to preventing zooming out too far */}
                <OrbitControls
                    enableZoom={true}
                    minDistance={10}
                    maxDistance={80}
                    maxPolarAngle={Math.PI / 2.2}
                />

                <EffectComposer>
                    <Bloom luminanceThreshold={0.3} intensity={0.3} radius={0.4} />
                    <Vignette eskil={false} offset={0.1} darkness={0.5} />
                </EffectComposer>

            </Canvas>
        </div>
    );
}
