import React from "react";
import { Lock } from "lucide-react";

interface PremiumBlurProps {
    children: React.ReactNode;
    isPremium?: boolean; // If true, shows content. If false, blurs.
    label?: string;
}

export function PremiumBlur({ children, isPremium = true, label = "PREMIUM DATA" }: PremiumBlurProps) {
    if (isPremium) {
        return <>{children}</>;
    }

    return (
        <div className="relative group overflow-hidden rounded-lg">
            {/* Blurred Content */}
            <div className="filter blur-md select-none pointer-events-none opacity-50 grayscale transition-all duration-500 group-hover:blur-lg">
                {children}
            </div>

            {/* Lock Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 border border-amber-500/30 rounded-full shadow-2xl backdrop-blur-md transform transition-transform group-hover:scale-105">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-amber-500 tracking-widest uppercase">{label}</span>
                </div>
            </div>
        </div>
    );
}
