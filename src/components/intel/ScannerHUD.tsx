'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function ScannerHUD({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(0);

    useEffect(() => {
        const sequence = async () => {
            await new Promise(r => setTimeout(r, 800)); // Initial Load
            setStep(1); // Connecting
            await new Promise(r => setTimeout(r, 1200));
            setStep(2); // Scanning Markets
            await new Promise(r => setTimeout(r, 1500));
            setStep(3); // Analysing Sentiment
            await new Promise(r => setTimeout(r, 1000));
            setStep(4); // Complete
            await new Promise(r => setTimeout(r, 800));
            onComplete();
        };
        sequence();
    }, [onComplete]);

    const steps = [
        "INITIALIZING CORE SYSTEMS...",
        "ESTABLISHING SECURE UPLINK...",
        "SCANNING 8,432 TICKERS (MASSIVE API)...",
        "ANALYSING SENTIMENT & FLOW...",
        "TARGETS ACQUIRED."
    ];

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center font-mono text-cyan-500">
            <div className="w-[600px] h-2 bg-white/10 rounded-full overflow-hidden mb-8 relative">
                <motion.div
                    className="absolute top-0 bottom-0 left-0 bg-cyan-500 box-shadow-[0_0_20px_rgba(6,182,212,0.8)]"
                    initial={{ width: "0%" }}
                    animate={{ width: `${(step / 4) * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                />
            </div>

            <div className="h-8 overflow-hidden text-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        className="text-lg tracking-[0.2em] font-bold"
                    >
                        {steps[step]}
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="mt-12 grid grid-cols-4 gap-4 text-xs text-white/30 w-[600px]">
                {['MEM: OK', 'NET: OK', 'GPU: OK', 'SEC: OK'].map((item, i) => (
                    <div key={i} className={`border border-white/10 p-2 text-center ${step > 0 ? 'text-emerald-500/50' : ''}`}>
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );
}
