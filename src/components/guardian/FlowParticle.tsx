import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FlowParticleProps {
    curve: THREE.QuadraticBezierCurve3;
    delay: number;
    speed?: number;
    size?: number;
}

export function FlowParticle({ curve, delay, speed = 0.3, size = 1.0 }: FlowParticleProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const progressRef = useRef(0);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        // Wait for delay before starting
        if (state.clock.elapsedTime < delay) return;

        // Update progress along curve
        progressRef.current = (progressRef.current + delta * speed) % 1;

        // Get position on curve
        const position = curve.getPoint(progressRef.current);
        meshRef.current.position.copy(position);

        // Scale based on size
        meshRef.current.scale.set(size, size, size);

        // Fade in/out at start/end
        const material = meshRef.current.material as THREE.MeshStandardMaterial;
        if (progressRef.current < 0.1) {
            material.opacity = progressRef.current / 0.1;
        } else if (progressRef.current > 0.9) {
            material.opacity = (1 - progressRef.current) / 0.1;
        } else {
            material.opacity = 1;
        }
    });

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial
                color="#00ffaa"
                emissive="#00ffaa"
                emissiveIntensity={3}
                toneMapped={false}
                transparent
                opacity={0}
            />
            <pointLight color="#00ffaa" intensity={2} distance={1} />
        </mesh>
    );
}
