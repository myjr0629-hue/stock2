'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function QuantRadarError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[QuantRadar] Client error:', error);
    }, [error]);

    return (
        <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center px-4 relative overflow-hidden">
            {/* Background grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[350px] h-[350px] rounded-full bg-rose-500/5 blur-[100px] pointer-events-none" />

            <div className="max-w-md w-full p-8 rounded-3xl bg-[#0b0f19]/90 border border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.05)] backdrop-blur-xl relative z-10 flex flex-col items-center text-center gap-6">
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <AlertCircle className="w-8 h-8" />
                </div>

                <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-black text-rose-400 tracking-widest uppercase">SYSTEM ERROR</h2>
                    <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                        Radar Recovery Mode
                    </h1>
                    <p className="text-[13px] text-slate-400 leading-relaxed mt-2">
                        The Quant Radar encountered a temporary issue. This is usually caused by a data synchronization delay. Retrying should resolve it.
                    </p>
                </div>

                {error.digest && (
                    <div className="w-full p-3 rounded-xl bg-slate-950/60 border border-slate-900">
                        <span className="text-[11px] font-mono text-slate-600 break-all">
                            Error digest: {error.digest}
                        </span>
                    </div>
                )}

                <button
                    onClick={reset}
                    className="w-full h-11 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-400 font-black text-[13px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                >
                    <RefreshCw className="w-4 h-4" />
                    RETRY RADAR
                </button>
            </div>
        </div>
    );
}
