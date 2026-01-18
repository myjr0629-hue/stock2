'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
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
    const [isOpen, setIsOpen] = useState(false);

    const currentLocale = locales.find(l => l.code === locale) || locales[0];

    const switchLocale = (newLocale: string) => {
        const segments = pathname.split('/');
        if (segments[1] && locales.some(l => l.code === segments[1])) {
            segments[1] = newLocale;
        } else {
            segments.splice(1, 0, newLocale);
        }
        const newPath = segments.join('/') || '/';

        router.push(newPath);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
            >
                <Globe size={10} className="text-slate-400" />
                <span className="text-slate-300">{currentLocale.label}</span>
                <ChevronDown size={10} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-28 py-1 rounded-lg bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50">
                        {locales.map((loc) => (
                            <button
                                key={loc.code}
                                onClick={() => switchLocale(loc.code)}
                                className={`w-full px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-white/5 transition-colors ${loc.code === locale ? 'text-cyan-400' : 'text-slate-300'
                                    }`}
                            >
                                <span>{loc.flag}</span>
                                <span>{loc.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
