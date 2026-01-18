'use client';

import React from 'react';
import { HowItWorksSidebar } from './HowItWorksSidebar';
import { LandingHeader } from '@/components/landing/LandingHeader';

interface HowItWorksLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
}

export function HowItWorksLayout({ children, title, subtitle }: HowItWorksLayoutProps) {
    return (
        <div className="min-h-screen bg-[#060a12]">
            {/* Top Header */}
            <LandingHeader />

            <div className="flex pt-12">
                {/* Sidebar - Compact */}
                <HowItWorksSidebar />

                {/* Main Content - Compact */}
                <main className="flex-1 p-6 max-w-5xl">
                    {/* Page Header */}
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
                        {subtitle && (
                            <p className="text-slate-400 text-sm">{subtitle}</p>
                        )}
                    </div>

                    {/* Content */}
                    <div className="space-y-4">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
