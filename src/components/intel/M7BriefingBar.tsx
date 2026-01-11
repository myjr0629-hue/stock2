
// M7 Briefing Bar - AI Commander's Voice
'use client';
import { useState, useEffect } from 'react';
import { TypewriterText } from '@/components/guardian/TypewriterText'; // Assuming this exists or using simple implementation
import { Terminal } from 'lucide-react';

interface M7BriefingBarProps {
    message: string;
}

export function M7BriefingBar({ message }: M7BriefingBarProps) {
    return (
        <div className="w-full bg-[#0a0f18] border-y border-slate-800/50 py-3 px-6 flex items-center gap-4 shadow-inner">
            <div className="flex items-center gap-2 text-emerald-500 animate-pulse">
                <Terminal className="w-4 h-4" />
                <span className="text-[10px] font-bold tracking-widest uppercase">COMMANDER__LOG:</span>
            </div>

            <div className="flex-1 font-mono text-sm text-slate-300 overflow-hidden whitespace-nowrap">
                <TypewriterText text={message} speed={30} />
            </div>
        </div>
    );
}
