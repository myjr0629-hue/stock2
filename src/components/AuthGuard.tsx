'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

const PROTECTED_PATHS = ['/dashboard', '/watchlist', '/portfolio', '/settings'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [checking, setChecking] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            setChecking(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setChecking(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (checking) return;

        // Check if current path is protected
        const isProtected = PROTECTED_PATHS.some(p => {
            // Match /xx/dashboard, /xx/watchlist, etc. (locale prefix)
            const segments = pathname.split('/').filter(Boolean);
            return segments.length >= 2 && PROTECTED_PATHS.includes('/' + segments[1]);
        });

        if (isProtected && !user) {
            // Extract locale from path
            const locale = pathname.split('/')[1] || 'ko';
            router.push(`/${locale}/login`);
        }
    }, [checking, user, pathname, router]);

    // While checking auth, show nothing for protected routes
    if (checking) {
        const segments = pathname.split('/').filter(Boolean);
        const isProtected = segments.length >= 2 && PROTECTED_PATHS.includes('/' + segments[1]);
        if (isProtected) {
            return (
                <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                </div>
            );
        }
    }

    return <>{children}</>;
}
