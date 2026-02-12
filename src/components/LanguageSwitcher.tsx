'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Globe, ChevronDown } from 'lucide-react';

const locales = [
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);

    const currentLocale = locales.find(l => l.code === locale) || locales[0];

    const switchLocale = (newLocale: string) => {
        const queryString = searchParams.toString();
        const newPath = queryString ? `${pathname}?${queryString}` : pathname;
        router.replace(newPath, { locale: newLocale as 'ko' | 'en' | 'ja' });
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] font-medium bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all w-full"
            >
                <Globe size={14} className="text-slate-400" />
                <span className="text-slate-300">{currentLocale.label}</span>
                <ChevronDown size={12} className={`text-slate-500 transition-transform ml-auto ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 py-1 rounded-lg bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50">
                        {locales.map((loc) => (
                            <button
                                key={loc.code}
                                onClick={() => switchLocale(loc.code)}
                                className={`w-full px-3 py-2 text-left text-[13px] font-medium flex items-center gap-2.5 hover:bg-white/5 transition-colors ${loc.code === locale ? 'text-cyan-400' : 'text-slate-300'
                                    }`}
                            >
                                <span className="text-base">{loc.flag}</span>
                                <span>{loc.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

