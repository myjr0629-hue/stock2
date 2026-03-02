'use client';

import React, { useState } from 'react';
import { HowItWorksSidebar } from './HowItWorksSidebar';
import { Menu, X } from 'lucide-react';

interface HowItWorksLayoutProps {
    children: React.ReactNode;
    title: React.ReactNode;
    subtitle?: string;
}

export function HowItWorksLayout({ children, title, subtitle }: HowItWorksLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#0c1222]">
            {/* Ambient background glow */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-cyan-500/[0.04] rounded-full blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[350px] bg-purple-500/[0.04] rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10">
                {/* Desktop Sidebar — fixed, never moves */}
                <div className="hidden lg:block fixed top-[60px] left-0 h-[calc(100vh-60px)] z-30">
                    <HowItWorksSidebar />
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="lg:hidden fixed top-[110px] left-4 z-50 p-2 rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 text-white shadow-lg"
                >
                    {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>

                {/* Mobile Sidebar Overlay */}
                {mobileMenuOpen && (
                    <>
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
                        <div className="fixed left-0 top-0 bottom-0 z-50 lg:hidden pt-[100px]">
                            <HowItWorksSidebar />
                        </div>
                    </>
                )}

                {/* Main Content — offset by sidebar width on desktop */}
                <main className="lg:ml-56 min-w-0 px-4 sm:px-6 lg:px-10 py-6 max-w-5xl">
                    {/* Page Header — glassmorphism */}
                    <div className="mb-8 pl-10 lg:pl-0">
                        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">{title}</h1>
                        {subtitle && (
                            <p className="text-[14px] text-slate-300">{subtitle}</p>
                        )}
                        <div className="mt-3 h-px bg-gradient-to-r from-cyan-500/40 via-purple-500/30 to-transparent" />
                    </div>

                    {/* Content */}
                    <div className="space-y-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
