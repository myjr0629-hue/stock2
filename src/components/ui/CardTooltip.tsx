'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface CardTooltipProps {
    text: string;
    children: React.ReactNode;
}

/**
 * Premium card-style tooltip popover.
 * Uses portal + fixed positioning to escape overflow:hidden containers.
 * Glassmorphism dark design, appears above the trigger element.
 */
export function CardTooltip({ text, children }: CardTooltipProps) {
    const [show, setShow] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const triggerRef = useRef<HTMLSpanElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleEnter = useCallback(() => {
        timer.current = setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setPos({
                    x: rect.left,
                    y: rect.top - 8, // 8px gap above
                });
            }
            setShow(true);
        }, 250);
    }, []);

    const handleLeave = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        setShow(false);
    }, []);

    return (
        <>
            <span
                ref={triggerRef}
                className="inline-flex items-center gap-1 cursor-help"
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
            >
                {children}
            </span>
            {show && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed z-[9999] pointer-events-none"
                    style={{
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        transform: 'translateY(-100%)',
                    }}
                >
                    <div
                        className="w-72 px-4 py-3 rounded-xl
                            bg-[#0a1020]/95 backdrop-blur-xl border border-cyan-500/20
                            shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_12px_rgba(34,211,238,0.08)]"
                    >
                        <p style={{ fontSize: '12px', lineHeight: '1.6' }} className="text-slate-200">{text}</p>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
