
"use client";

import React, { useMemo, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, QuadraticBezierLine, Edges } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { FlowParticle } from "./FlowParticle";

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
    density: number; // 0-100
    height: number;  // 0-1.0 (will be scaled)
    topTickers: string[];
    color?: string;
    pos?: [number, number, number];
}

interface SmartMoneyMapProps {
    sectors?: SectorData[];
    vectors?: FlowVector[]; // New: Top 3 Vectors
    sourceId?: string | null;
    targetId?: string | null;
    onSectorSelect?: (sectorId: string) => void;
}

// === MOCK DATA FOR DEV ===
const MOCK_SECTORS: SectorData[] = [
    { id: "XLK", name: "Technology", density: 95, height: 1.2, topTickers: ["NVDA"], color: "#10b981" },
    { id: "XLE", name: "Energy", density: 40, height: 0.4, topTickers: ["XOM"], color: "#f59e0b" },
];

/**
 * FIXED GRID LAYOUT MAP
 * Maps Sector IDs to Grid Coordinates [Row, Col]
 * 3x4 Grid (12 slots, 11 sectors)
 */
const SECTOR_GRID_MAP: Record<string, [number, number]> = {
    "XLK": [0, 0], "XLC": [0, 1], "XLY": [0, 2], "XLRE": [0, 3],
    "XLF": [1, 0], "XLV": [1, 1], "XLI": [1, 2], "XLB": [1, 3],
    "XLE": [2, 0], "XLP": [2, 1], "XLU": [2, 2]
    // Slot [2,3] is empty
};

function SectorBlock({ data, position, onClick, isSource, isTarget }: {
    data: SectorData,
    position: [number, number, number],
    onClick: (d: SectorData) => void,
    isSource: boolean,
    isTarget: boolean
}) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);

    // Dynamic Height scaling
    const targetScaleY = hovered
        ? Math.max(0.4, data.height * 4.0)
        : Math.max(0.3, data.height * 3.0);

    const baseColor = useMemo(() => new THREE.Color(data.color), [data.color]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, targetScaleY, delta * 5);
        meshRef.current.position.y = meshRef.current.scale.y / 2;
    });

    return (
        <group position={position}>
            <mesh
                ref={meshRef}
                onClick={(e) => { e.stopPropagation(); onClick(data); }}
                onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
                onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
            >
                <boxGeometry args={[1.5, 1, 1.5]} />
                {/* CRYSTAL MATERIAL (Institutional Glass - Low Glare) */}
                <meshPhysicalMaterial
                    color={baseColor}
                    emissive={baseColor}
                    emissiveIntensity={hovered ? 0.4 : 0.1}
                    transmission={0.9} // Glass
                    opacity={1}
                    metalness={0.2} // More metallic
                    roughness={0.1} // Slightly less perfect for realism
                    ior={1.5}
                    thickness={2.0}
                    clearcoat={1.0}
                    attenuationColor={baseColor}
                    attenuationDistance={2.0}
                />

                {/* INNER GLOW (Fake Volumetric) */}
                {(isSource || isTarget) && (
                    <mesh position={[0, 0, 0]} scale={[0.8, 0.8, 0.8]}>
                        <boxGeometry args={[1.5, 1, 1.5]} />
                        <meshBasicMaterial
                            color={isSource ? "#f43f5e" : "#10b981"}
                            transparent
                            opacity={0.5}
                        />
                    </mesh>
                )}
            </mesh>

            {/* LASER ETCHED LABEL (On top) */}
            <Html position={[0, 1.1 + (hovered ? 0.5 : 0), 0]} center pointerEvents="none">
                <div className={`px-2 py-1 rounded border ${hovered ? 'bg-black/80 border-white' : 'bg-black/40 border-white/20'} backdrop-blur-md transition-all flex flex-col items-center min-w-[80px]`}>
                    <div className="text-[10px] font-black tracking-widest text-slate-200 whitespace-nowrap uppercase">
                        {data.name}
                    </div>
                </div>
            </Html>
        </group>
    );
}

// === MAIN FLOW VECTOR (SOLID GLASS + PULSE) ===
function MainFlowArrow({ start, end, strength = 10 }: { start: THREE.Vector3, end: THREE.Vector3, strength?: number }) {
    // Draw a high, distinct arc
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 5.0; // Higher arch

    const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, mid, end), [start, end, mid]);

    // Calculate End Tangent for Arrow Head Orientation
    const endTangent = useMemo(() => curve.getTangent(1).normalize(), [curve]);
    const arrowHeadPos = end.clone();

    // Target calculation: Position + Tangent is where we look at
    const lookAtTarget = arrowHeadPos.clone().add(endTangent);

    // Dynamic Styles - Less Neon, More Solid
    const thickness = Math.min(5, 2 + (strength / 20));
    const speed = Math.min(1.0, 0.2 + (strength / 100));

    return (
        <group>
            {/* The Path Tube (Solid Core) */}
            <QuadraticBezierLine
                start={start}
                end={end}
                mid={mid}
                color="#10b981"
                lineWidth={thickness}
                dashed={false}
                transparent
                opacity={0.8} // Slightly transparent glass look
            />

            {/* Subtle Reflection (replaces Glow) */}
            <QuadraticBezierLine
                start={start}
                end={end}
                mid={mid}
                color="#ffffff"
                lineWidth={1}
                opacity={0.3}
                transparent
            />

            {/* Flow Particles (Dynamic Speed) */}
            <FlowParticle curve={curve} delay={0} speed={speed} />
            <FlowParticle curve={curve} delay={0.6 * (1 / speed)} speed={speed} />
            <FlowParticle curve={curve} delay={1.2 * (1 / speed)} speed={speed} />

            {/* Fixed Arrow Head at Destination with explicit orientation */}
            <ArrowHead position={arrowHeadPos} lookAtTarget={lookAtTarget} />
        </group>
    );
}

function ArrowHead({ position, lookAtTarget }: { position: THREE.Vector3, lookAtTarget: THREE.Vector3 }) {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.lookAt(lookAtTarget);
            // Cone Geometry points UP (Y+). 
            // lookAt points Z+ towards target.
            // Rotating X by 90 degrees (PI/2) maps Y+ to Z+.
            meshRef.current.rotateX(Math.PI / 2);
        }
    });

    return (
        <mesh ref={meshRef} position={position}>
            <coneGeometry args={[0.5, 1.5, 16]} />
            <meshStandardMaterial color="#00ff94" emissive="#00ff94" emissiveIntensity={2} toneMapped={false} />
        </mesh>
    );
}

function SceneContent({ sectors, onSectorClick, sourceId, targetId, vectors }: {
    sectors: SectorData[],
    onSectorClick: (d: SectorData) => void,
    sourceId?: string | null,
    targetId?: string | null,
    vectors?: FlowVector[]
}) {
    // 1. Calculate Grid Positions
    const gridSectors = useMemo(() => {
        return sectors.map(s => {
            const coords = SECTOR_GRID_MAP[s.id];
            if (!coords) return null;
            const x = (coords[1] * 2.5) - 3.75;
            const z = (coords[0] * 2.5) - 2.5;
            return { ...s, pos: [x, 0, z] as [number, number, number] };
        }).filter(Boolean) as SectorData[];
    }, [sectors]);

    // Helper to get position for a sector ID
    const getSectorPosition = (sectorId: string, yOffset: number = 0.5) => {
        const sector = gridSectors.find(x => x.id === sectorId);
        if (sector?.pos) {
            return new THREE.Vector3(sector.pos[0], yOffset, sector.pos[2]);
        }
        return null;
    };

    // Prepare flow vectors for rendering
    const flowArrows = useMemo(() => {
        const arrows: { start: THREE.Vector3, end: THREE.Vector3, strength: number }[] = [];

        // If specific vectors are provided, use them
        if (vectors && vectors.length > 0) {
            vectors.forEach(vector => {
                const start = getSectorPosition(vector.sourceId, 0.5);
                const end = getSectorPosition(vector.targetId, 1);
                if (start && end) {
                    arrows.push({ start, end, strength: vector.strength });
                }
            });
        } else if (sourceId && targetId) {
            // Fallback to single source/target if no vectors
            const start = getSectorPosition(sourceId, 0.5);
            const end = getSectorPosition(targetId, 1);
            if (start && end) {
                arrows.push({ start, end, strength: 10 });
            }
        }
        return arrows;
    }, [gridSectors, sourceId, targetId, vectors]);

    return (
        <>
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 20, 10]} intensity={1.5} color="#ffffff" />

            {/* BLOCKS */}
            {gridSectors.map((s) => (
                <SectorBlock
                    key={s.id}
                    data={s}
                    position={s.pos!}
                    onClick={onSectorClick}
                    isSource={s.id === sourceId || vectors?.some(v => v.sourceId === s.id) || false}
                    isTarget={s.id === targetId || vectors?.some(v => v.targetId === s.id) || false}
                />
            ))}

            {/* MAIN FLOW ARROWS (from vectors or single source/target) */}
            {flowArrows.map((arrow, index) => (
                <MainFlowArrow key={`flow-arrow-${index}`} start={arrow.start} end={arrow.end} strength={arrow.strength} />
            ))}

            {/* BASE GRID */}
            <gridHelper args={[30, 30, 0x334155, 0x0f172a]} position={[0, -0.05, 0]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.8} />
            </mesh>
        </>
    );
}

export default function SmartMoneyMap({ sectors = MOCK_SECTORS, vectors, sourceId, targetId, onSectorSelect }: SmartMoneyMapProps) {
    const [selected, setSelected] = useState<SectorData | null>(null);

    const handleSectorClick = (d: SectorData) => {
        setSelected(d);
        console.log("Selected Sector:", d);
        // Notify parent component
        if (onSectorSelect) {
            onSectorSelect(d.id);
        }
    };

    return (
        <div className="w-full h-full relative cursor-move">
            <Canvas shadows camera={{ position: [0, 8, 12], fov: 40 }}>
                {/* 3D SCENE CONTENT */}
                <SceneContent
                    sectors={sectors}
                    vectors={vectors}
                    sourceId={sourceId}
                    targetId={targetId}
                    onSectorClick={handleSectorClick}
                />

                <OrbitControls
                    makeDefault
                    minPolarAngle={0}
                    maxPolarAngle={Math.PI / 2.2}
                    maxDistance={25}
                    minDistance={5}
                />

                <EffectComposer>
                    {/* REDUCED NEON: Subtle Bloom only for high-energy elements */}
                    <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.5} height={300} intensity={0.2} />
                    <Vignette eskil={false} offset={0.1} darkness={0.4} />
                </EffectComposer>
            </Canvas>
        </div>
    );
}
