'use client';

import React, { useState } from 'react';
import { Link } from '@/i18n/routing';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
    LayoutDashboard, Shield, Command, Radio,
    Brain, PieChart, Star, BookOpen, ChevronRight
} from 'lucide-react';

interface MenuItem {
    labelKey: string;
    href: string;
    icon: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    gradient: string;
    hoverFrom: string;
    hoverTo: string;
    children?: MenuItem[];
}

export function HowItWorksSidebar() {
    const pathname = usePathname();
    const t = useTranslations('guide');
    const locale = useLocale();

    const menuItems: MenuItem[] = [
        {
            labelKey: 'overview',
            href: '/how-it-works',
            icon: BookOpen,
            gradient: 'from-slate-400 to-slate-500',
            hoverFrom: '#94a3b8', hoverTo: '#64748b',
        },
        {
            labelKey: 'dashboard',
            href: '/how-it-works/dashboard',
            icon: LayoutDashboard,
            gradient: 'from-indigo-400 to-indigo-600',
            hoverFrom: '#818cf8', hoverTo: '#4f46e5',
        },
        {
            labelKey: 'guardian',
            href: '/how-it-works/guardian',
            icon: Shield,
            gradient: 'from-emerald-400 to-teal-600',
            hoverFrom: '#34d399', hoverTo: '#0d9488',
        },
        {
            labelKey: 'command',
            href: '/how-it-works/command',
            icon: Command,
            gradient: 'from-cyan-400 to-blue-600',
            hoverFrom: '#22d3ee', hoverTo: '#2563eb',
        },
        {
            labelKey: 'flow',
            href: '/how-it-works/flow',
            icon: Radio,
            gradient: 'from-sky-400 to-cyan-600',
            hoverFrom: '#38bdf8', hoverTo: '#0891b2',
        },
        {
            labelKey: 'intel',
            href: '/how-it-works/intel',
            icon: Brain,
            gradient: 'from-purple-400 to-pink-600',
            hoverFrom: '#c084fc', hoverTo: '#db2777',
        },
        {
            labelKey: 'portfolio',
            href: '/how-it-works/portfolio',
            icon: PieChart,
            gradient: 'from-amber-400 to-orange-600',
            hoverFrom: '#fbbf24', hoverTo: '#ea580c',
        },
        {
            labelKey: 'watchlist',
            href: '/how-it-works/watchlist',
            icon: Star,
            gradient: 'from-rose-400 to-red-600',
            hoverFrom: '#fb7185', hoverTo: '#dc2626',
        },
    ];

    const isActive = (href: string) => {
        const fullHref = `/${locale}${href}`;
        if (href === '/how-it-works') return pathname === fullHref;
        return pathname.startsWith(fullHref);
    };

    return (
        <aside className="w-56 min-h-screen bg-[#0e1a2e]/90 backdrop-blur-xl border-r border-white/[0.08] pt-10 pb-5 px-3 flex flex-col">
            {/* Brand */}
            <div className="px-3 mb-5">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                        <BookOpen size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-black text-white tracking-wide">GUIDE</span>
                </div>
                <div className="h-px bg-gradient-to-r from-white/10 to-transparent mt-3" />
            </div>

            {/* Menu */}
            <nav className="space-y-0.5 flex-1">
                {menuItems.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                        <SidebarItem key={item.href} item={item} active={active} Icon={Icon} label={t(item.labelKey)}>
                        </SidebarItem>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="px-3 pt-4 border-t border-white/[0.06]">
                <p className="text-[10px] text-slate-600 leading-relaxed">
                    SIGNUM HQ v65
                </p>
            </div>
        </aside>
    );
}

/* ─── Sidebar Item with hover gradient ─── */
function SidebarItem({ item, active, Icon, label, children }: {
    item: MenuItem; active: boolean; Icon: any; label: string; children?: React.ReactNode;
}) {
    const [hovered, setHovered] = useState(false);

    return (
        <div>
            <Link
                href={item.href}
                className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-[14px] font-jakarta ${active
                    ? 'bg-white/[0.08] text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                    }`}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${active
                        ? `bg-gradient-to-br ${item.gradient} shadow-md`
                        : 'bg-white/[0.06]'
                        }`}
                    style={!active && hovered ? {
                        background: `linear-gradient(to bottom right, ${item.hoverFrom}, ${item.hoverTo})`,
                        boxShadow: `0 2px 8px ${item.hoverFrom}40`,
                    } : undefined}
                >
                    <Icon size={13} className={`transition-colors duration-200 ${active || hovered ? 'text-white' : 'text-slate-400'}`} />
                </div>
                <span className="flex-1">{label}</span>
                {item.children && (
                    <ChevronRight size={12} className={`transition-transform ${active ? 'rotate-90 text-white/60' : 'text-slate-600'}`} />
                )}
            </Link>
            {children}
        </div>
    );
}
