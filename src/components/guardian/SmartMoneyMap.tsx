
"use client";

import React, { useMemo, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, QuadraticBezierLine, Edges, Text } from "@react-three/drei";
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

    // Height scaling - Reduced for 'Platform' look
    const targetScaleY = hovered
        ? Math.max(0.4, data.height * 2.5)
        : Math.max(0.3, data.height * 2.0);

    const baseColor = useMemo(() => new THREE.Color(data.color), [data.color]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        meshRef.current.scale.y = THREE.MathUtils.lerp(meshRef.current.scale.y, targetScaleY, delta * 5);
        meshRef.current.position.y = meshRef.current.scale.y / 2;
    });

    return (
        <group position={position}>
            {/* 1. LAYERED BASE PLATFORM (Simulation of steps) - DARKER, MORE INDUSTRIAL */}
            <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[1.8, 0.1, 1.8]} />
                <meshStandardMaterial color="#0f172a" transparent opacity={0.8} roughness={0.5} metalness={0.8} />
                <Edges color={data.color} threshold={15} opacity={0.2} transparent />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[2.0, 0.05, 2.0]} />
                <meshStandardMaterial color={data.color} transparent opacity={0.05} />
            </mesh>

            {/* 2. MAIN DATA BLOCK (Holographic Crystal) */}
            <mesh
                ref={meshRef}
                onClick={(e) => { e.stopPropagation(); onClick(data); }}
                onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
                onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
            >
                <boxGeometry args={[1.5, 1, 1.5]} />
                <meshPhysicalMaterial
                    color={baseColor}
                    emissive={baseColor}
                    emissiveIntensity={hovered ? 0.4 : 0.1}
                    transmission={0.4}
                    opacity={0.9}
                    metalness={0.8}
                    roughness={0.2}
                    ior={1.2}
                    thickness={2.0}
                    clearcoat={1.0}
                    attenuationColor={baseColor}
                    attenuationDistance={1.0}
                />

                <Edges
                    linewidth={1}
                    threshold={15}
                    color={hovered ? "white" : data.color}
                />

                {/* Inner Volumetric Glow */}
                {(isSource || isTarget) && (
                    <mesh scale={[0.9, 0.9, 0.9]}>
                        <boxGeometry args={[1.5, 1, 1.5]} />
                        <meshBasicMaterial color={baseColor} transparent opacity={0.2} side={THREE.DoubleSide} />
                    </mesh>
                )}
            </mesh>

            {/* 3. VERTICAL HUD PANEL (Glass Billboard) - TALLER & CLEANER */}
            <group position={[0, 3.5, 0]}> {/* Raised Higher */}
                {/* Glass Pane */}
                <mesh position={[0, 0, 0]}>
                    <planeGeometry args={[2.2, 1.5]} />
                    <meshPhysicalMaterial
                        color={baseColor}
                        transmission={0.9}
                        opacity={0.2}
                        roughness={0}
                        metalness={0.2}
                        side={THREE.DoubleSide}
                        transparent
                        emissive={baseColor}
                        emissiveIntensity={0.05}
                    />
                    <Edges color={data.color} threshold={1} opacity={0.5} />
                </mesh>

                {/* 3D Text Labels (Front Only for clarity) */}
                <group position={[0, 0, 0.05]}>
                    <Text
                        color="white"
                        fontSize={0.25}
                        font="https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff"
                        anchorX="center"
                        anchorY="middle"
                        position={[0, 0.3, 0]}
                    >
                        {data.name}
                        <meshBasicMaterial toneMapped={false} />
                    </Text>
                    <Text
                        color={data.density > 0 ? "#34d399" : "#f43f5e"}
                        fontSize={0.4}
                        anchorX="center"
                        anchorY="middle"
                        position={[0, -0.2, 0]}
                        font="https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff"
                    >
                        {data.density > 0 ? "+" : "-"}{(Math.abs(data.density) / 10).toFixed(1)}%
                        <meshBasicMaterial toneMapped={false} />
                    </Text>
                </group>

                {/* Connection Line to Base (Laser Beam) */}
                <mesh position={[0, -2.0, 0]}>
                    <cylinderGeometry args={[0.01, 0.01, 2.5]} />
                    <meshBasicMaterial color={data.color} opacity={0.6} transparent />
                </mesh>
            </group>
        </group>
    );
}

// === MAIN FLOW VECTOR (HD Electric Arc) ===
function MainFlowArrow({ start, end, strength = 10 }: { start: THREE.Vector3, end: THREE.Vector3, strength?: number }) {
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 5.0; // Higher Arc for lower camera

    // Adjust start/end to top of the glass panels (approx Y=3) or centers (Y=2.5) to mimic image connecting PANELS
    // The image shows arcs connecting the BLOCKS, but swirling high.
    // Let's keep block-to-block for clarity but high arc.

    const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, mid, end), [start, end, mid]);
    const endTangent = useMemo(() => curve.getTangent(1).normalize(), [curve]);
    const arrowHeadPos = end.clone();
    const lookAtTarget = arrowHeadPos.clone().add(endTangent);

    // Thinner, sharper lines for "Electric" feel
    const thickness = Math.min(2, 0.5 + (strength / 40));
    const speed = Math.min(1.5, 0.4 + (strength / 80));

    return (
        <group>
            {/* Core Energy Line (White Hot) */}
            <QuadraticBezierLine
                start={start}
                end={end}
                mid={mid}
                color="#ffffff"
                lineWidth={thickness * 0.5}
                dashed={false}
                transparent
                opacity={1}
            />

            {/* Outer Glow Halo (Green) */}
            <QuadraticBezierLine
                start={start}
                end={end}
                mid={mid}
                color="#10b981"
                lineWidth={thickness * 4}
                dashed={false}
                transparent
                opacity={0.2}
            />

            {/* Fast Data Particles */}
            <FlowParticle curve={curve} delay={0} speed={speed} size={1.2} />
            <FlowParticle curve={curve} delay={0.4 / speed} speed={speed} size={0.8} />
            <FlowParticle curve={curve} delay={0.8 / speed} speed={speed} size={1.0} />

            <ArrowHead position={arrowHeadPos} lookAtTarget={lookAtTarget} />
        </group>
    );
}

function ArrowHead({ position, lookAtTarget }: { position: THREE.Vector3, lookAtTarget: THREE.Vector3 }) {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.lookAt(lookAtTarget);
            meshRef.current.rotateX(Math.PI / 2);
        }
    });
    return (
        <mesh ref={meshRef} position={position}>
            <coneGeometry args={[0.3, 1.0, 16]} />
            <meshBasicMaterial color="#ffffff" />
            <mesh scale={[1.2, 1.2, 1.2]}>
                <coneGeometry args={[0.3, 1.0, 16]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
            </mesh>
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
            const x = (coords[1] * 3.0) - 4.5; // Wider spacing
            const z = (coords[0] * 3.0) - 3.0; // Wider spacing
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
            <ambientLight intensity={0.1} />
            <pointLight position={[0, 20, 0]} intensity={1.0} color="#ffffff" />
            <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={2} color="#4ade80" />
            <spotLight position={[-10, 20, -10]} angle={0.3} penumbra={1} intensity={2} color="#60a5fa" />

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

            {/* BASE GRID - Darker, Technical */}
            <gridHelper args={[60, 60, 0x1e293b, 0x020617]} position={[0, -0.05, 0]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
                <planeGeometry args={[200, 200]} />
                <meshStandardMaterial color="#000000" roughness={0.1} metalness={0.9} />
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
            <Canvas shadows camera={{ position: [0, 6, 16], fov: 35 }}>
                <color attach="background" args={['#020617']} />
                <fog attach="fog" args={['#020617', 10, 40]} />

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
                    maxPolarAngle={Math.PI / 2.1}
                    maxDistance={30}
                    minDistance={5}
                    target={[0, 0, 0]}
                    enablePan={true}
                />

                <EffectComposer>
                    <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={0.5} />
                    <Vignette eskil={false} offset={0.1} darkness={0.6} />
                </EffectComposer>
            </Canvas>
        </div>
    );
}
