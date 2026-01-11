'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from "@/lib/utils";

interface GammaVoidProps {
    price: number;
    callWall: number;
    putFloor: number;
    gex: number;
}

export function GammaVoid({ price, callWall, putFloor, gex }: GammaVoidProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Physics State
    const isBreakout = price > callWall;
    const isCrisis = price < putFloor;
    const isZeroG = isBreakout || (gex > 0 && price > callWall * 0.98);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize
        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Particle System
        const particles: { x: number; y: number; s: number; v: number; a: number }[] = [];
        for (let i = 0; i < 50; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                s: Math.random() * 1.5,
                v: Math.random() * 0.5 + 0.1,
                a: Math.random()
            });
        }

        let frameId: number;

        const draw = () => {
            if (!ctx || !canvas) return;

            // Clear ("Deep Space")
            ctx.fillStyle = '#020617'; // Slate 950
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Stars (Particles)
            particles.forEach(p => {
                p.y += p.v * (isZeroG ? 5 : 1); // Warp speed if Zero-G
                if (p.y > canvas.height) {
                    p.y = 0;
                    p.x = Math.random() * canvas.width;
                }

                ctx.fillStyle = `rgba(255, 255, 255, ${p.a})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
                ctx.fill();
            });

            // Calculate Positions
            const range = (callWall - putFloor) * 1.5 || price * 0.2;
            const center = (callWall + putFloor) / 2 || price;
            const pxPerDollar = (canvas.height * 0.6) / range;

            const getY = (p: number) => {
                const dy = (center - p) * pxPerDollar;
                return (canvas.height / 2) + dy;
            };

            const yPrice = getY(price);
            const yCall = getY(callWall);
            const yPut = getY(putFloor);

            // Draw Walls
            if (callWall > 0) {
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)'; // Emerald
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(0, yCall);
                ctx.lineTo(canvas.width, yCall);
                ctx.stroke();

                ctx.fillStyle = '#10b981';
                ctx.font = 'bold 12px monospace'; // [V4.7] Increased Readability
                ctx.fillText(`CW $${callWall} (저항/천장)`, 5, yCall - 5);
            }

            if (putFloor > 0) {
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)'; // Rose
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(0, yPut);
                ctx.lineTo(canvas.width, yPut);
                ctx.stroke();

                ctx.fillStyle = '#f43f5e';
                ctx.font = 'bold 12px monospace'; // [V4.7] Increased Readability
                ctx.fillText(`PF $${putFloor} (지지/바닥)`, 5, yPut + 15); // Adjusted Y for larger font
            }

            // Draw Price Line (Laser)
            ctx.strokeStyle = isZeroG ? '#ec4899' : '#ffffff'; // Pink if Zero-G
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.shadowBlur = isZeroG ? 15 : 0;
            ctx.shadowColor = '#ec4899';

            ctx.beginPath();
            ctx.moveTo(0, yPrice);
            ctx.lineTo(canvas.width, yPrice);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Zero-G Effect (Burning Particles at Price Line)
            if (isZeroG) {
                for (let i = 0; i < 5; i++) {
                    const px = Math.random() * canvas.width;
                    const py = yPrice + (Math.random() - 0.5) * 10;
                    ctx.fillStyle = `rgba(236, 72, 153, ${Math.random()})`;
                    ctx.fillRect(px, py, 2, 2);
                }
            }

            frameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(frameId);
    }, [price, callWall, putFloor, isZeroG]);

    return (
        <div ref={containerRef} className="relative w-full h-48 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden group">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

            {/* Status Overlay */}
            <div className="absolute top-2 right-2 flex flex-col items-end pointer-events-none">
                <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border backdrop-blur-sm",
                    isZeroG ? "text-fuchsia-400 border-fuchsia-500/50 bg-fuchsia-500/10" : "text-slate-500 border-slate-700 bg-slate-900/50"
                )}>
                    {isZeroG ? "ZERO-G (무중력)" : "GRAVITY WELL (중력장)"}
                </span>
                <span className="text-[9px] text-slate-500 font-mono mt-1">GEX: {(gex / 1000000).toFixed(1)}M</span>
            </div>
        </div>
    );
}
