'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
    Shield, Command, Brain, PieChart, Star,
    Radio, ChevronRight, Home
} from 'lucide-react';

interface MenuItem {
    labelKey: string;
    href: string;
    icon: React.ReactNode;
    children?: MenuItem[];
}

export function HowItWorksSidebar() {
    const pathname = usePathname();
    const t = useTranslations('guide');
    const locale = useLocale();

    const menuItems: MenuItem[] = [
        { labelKey: 'overview', href: `/${locale}/how-it-works`, icon: <Home size={14} /> },
        { labelKey: 'guardian', href: `/${locale}/how-it-works/guardian`, icon: <Shield size={14} /> },
        {
            labelKey: 'command',
            href: `/${locale}/how-it-works/command`,
            icon: <Command size={14} />,
            children: [
                { labelKey: 'flowRadar', href: `/${locale}/how-it-works/command/flow-radar`, icon: <Radio size={12} /> }
            ]
        },
        { labelKey: 'intel', href: `/${locale}/how-it-works/intel`, icon: <Brain size={14} /> },
        { labelKey: 'portfolio', href: `/${locale}/how-it-works/portfolio`, icon: <PieChart size={14} /> },
        { labelKey: 'watchlist', href: `/${locale}/how-it-works/watchlist`, icon: <Star size={14} /> },
    ];

    const isActive = (href: string) => {
        if (href === `/${locale}/how-it-works`) return pathname === href;
        return pathname.startsWith(href);
    };

    return (
        <aside className="w-48 min-h-screen bg-[#0a1628] border-r border-white/5 py-4 px-3">
            {/* Menu */}
            <nav className="space-y-0.5">
                {menuItems.map((item) => (
                    <div key={item.href}>
                        <Link
                            href={item.href}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs ${isActive(item.href)
                                ? 'bg-cyan-500/10 text-cyan-400 font-bold'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            {item.icon}
                            <span>{t(item.labelKey)}</span>
                            {item.children && (
                                <ChevronRight size={12} className="ml-auto" />
                            )}
                        </Link>

                        {/* Children */}
                        {item.children && isActive(item.href) && (
                            <div className="ml-4 mt-0.5 space-y-0.5">
                                {item.children.map((child) => (
                                    <Link
                                        key={child.href}
                                        href={child.href}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-[11px] ${pathname === child.href
                                            ? 'bg-cyan-500/20 text-cyan-300'
                                            : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                    >
                                        {child.icon}
                                        <span>{t(child.labelKey)}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>
        </aside>
    );
}

