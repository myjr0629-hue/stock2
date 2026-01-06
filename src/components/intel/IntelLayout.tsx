'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Shield, Radar, Activity, Clock } from 'lucide-react';

interface IntelLayoutProps {
    children: ReactNode;
    status?: 'SCANNING' | 'ACTIVE' | 'OFFLINE';
}

export function IntelLayout({ children, status = 'ACTIVE' }: IntelLayoutProps) {
    return (
        <div className="min-h-screen bg-[#050505] text-white font-mono relative overflow-hidden selection:bg-cyan-900 selection:text-cyan-100">
            {/* Background Grid */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[url('/scanline.png')] opacity-5 animate-pulse z-50 mix-blend-overlay" />

            {/* Header / Status Bar */}
            <header className="fixed top-0 left-0 right-0 h-14 border-b border-white/10 bg-[#050505]/80 backdrop-blur-md flex items-center px-6 z-40">
                <div className="flex items-center gap-4">
                    <Shield className="w-5 h-5 text-cyan-500 animate-pulse" />
                    <span className="text-sm font-bold tracking-widest text-cyan-500">ALPHA ENGINE V3.5</span>
                </div>

                <div className="flex-1 flex justify-center">
                    <div className="px-4 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full animate-ping",
                            status === 'SCANNING' ? 'bg-yellow-500' :
                                status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-red-500'
                        )} />
                        <span className="text-xs text-white/70">
                            {status === 'SCANNING' ? 'SYSTEM SCANNING...' :
                                status === 'ACTIVE' ? 'SYSTEM OPTIMAL' : 'SYSTEM OFFLINE'}
                        </span>
                    </div>
                </div>

                {/* Navigation Links (Added) */}
                <nav className="hidden md:flex items-center gap-6 mr-8">
                    {[
                        { label: "GUARDIAN", href: "/intel-guardian" },
                        { label: "COMMAND", href: "/ticker?ticker=NVDA" },
                        { label: "PORTFOLIO", href: "/portfolio" },
                        { label: "WATCHLIST", href: "/favorites" }
                    ].map(item => (
                        <a key={item.label} href={item.href} className="text-[10px] font-bold text-white/50 hover:text-emerald-400 transition-colors tracking-widest uppercase group relative">
                            {item.label}
                            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-emerald-500 group-hover:w-full transition-all duration-300" />
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-6 text-xs text-white/50">
                    <div className="flex items-center gap-2">
                        <Radar className="w-4 h-4" />
                        <span>EST: {new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="pt-20 px-6 pb-12 max-w-[1920px] mx-auto relative z-10 min-h-[calc(100vh-80px)]">
                {children}
            </main>

            {/* Footer Status */}
            <footer className="fixed bottom-0 left-0 right-0 h-8 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-between px-6 text-[10px] text-white/30 z-40">
                <span>SECURE CONNECTION: ENCRYPTED (TLS 1.3)</span>
                <span>DATA STREAM: MASSIVE API (LIVE)</span>
            </footer>
        </div>
    );
}
