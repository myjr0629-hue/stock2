"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Server, Database, Lock, CheckCircle2 } from "lucide-react";

export function IntegrityGate({ children }: { children: React.ReactNode }) {
    const [step, setStep] = useState(0);
    const [isGranted, setIsGranted] = useState(false);

    const checks = [
        { id: 1, label: "Checking Data Pipe...", icon: Database, duration: 800 },
        { id: 2, label: "Verifying Logic Core...", icon: Server, duration: 800 },
        { id: 3, label: "Loading Rendering Engine...", icon: ShieldCheck, duration: 600 },
        { id: 4, label: "Security Protocol: GEMS V8.1...", icon: Lock, duration: 600 },
    ];

    useEffect(() => {
        let currentStep = 0;

        const processNext = () => {
            if (currentStep >= checks.length) {
                setTimeout(() => setIsGranted(true), 500);
                return;
            }

            setTimeout(() => {
                setStep(currentStep + 1);
                currentStep++;
                processNext();
            }, checks[currentStep].duration);
        };

        processNext();
    }, []);

    if (isGranted) {
        return <div className="animate-in fade-in duration-1000">{children}</div>;
    }

    return (
        <div className="fixed inset-0 bg-[#111827] flex flex-col items-center justify-center text-emerald-500 z-50 font-mono">
            <div className="w-full max-w-md p-8 border border-emerald-900/50 bg-gray-900/50 rounded-xl relative overflow-hidden">
                {/* Background Grid */}
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />

                {/* Header */}
                <div className="mb-8 text-center relative z-10">
                    <h1 className="text-2xl font-bold tracking-widest text-emerald-400 mb-2">INTEGRITY GATE</h1>
                    <p className="text-xs text-emerald-700 font-medium">PROTOCOL: GEMS V8.1 PRE-FLIGHT</p>
                </div>

                {/* Checks */}
                <div className="space-y-4 relative z-10">
                    {checks.map((check, idx) => {
                        const isDone = step > idx;
                        const isCurrent = step === idx;
                        const Icon = check.icon;

                        return (
                            <div key={check.id} className={`flex items-center gap-4 transition-all duration-300 ${isDone || isCurrent ? 'opacity-100' : 'opacity-20'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${isDone ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-emerald-900 text-emerald-800'}`}>
                                    {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Icon className={`w-4 h-4 ${isCurrent ? 'animate-pulse' : ''}`} />}
                                </div>
                                <span className={`text-sm tracking-wide ${isDone ? 'text-emerald-300' : isCurrent ? 'text-emerald-500' : 'text-emerald-900'}`}>
                                    {check.label} {isCurrent && <span className="animate-pulse">_</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Progress Bar */}
                <div className="mt-8 h-1 bg-emerald-900/30 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-300 ease-out"
                        style={{ width: `${(step / checks.length) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
