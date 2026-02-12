'use client';

import { useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ConsentModal } from './ConsentModal';

interface ConsentGuardProps {
    children: ReactNode;
}

export function ConsentGuard({ children }: ConsentGuardProps) {
    const [status, setStatus] = useState<'loading' | 'needs-consent' | 'consented' | 'anonymous'>('loading');

    useEffect(() => {
        checkConsent();
    }, []);

    const checkConsent = async () => {
        const supabase = createClient();

        // 1. Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setStatus('anonymous');
            return;
        }

        // 2. Check if consent exists
        const { data, error } = await supabase
            .from('user_consent')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.error('Consent check error:', error);
            // If table doesn't exist yet or has errors, skip consent check
            setStatus('consented');
            return;
        }

        if (data) {
            setStatus('consented');
        } else {
            setStatus('needs-consent');
        }
    };

    // Listen for auth state changes (e.g., Google OAuth redirect landing)
    useEffect(() => {
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                checkConsent();
            } else {
                setStatus('anonymous');
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    // Loading state — transparent so user doesn't see a flash
    if (status === 'loading') {
        return <>{children}</>;
    }

    // Needs consent — show modal on top of the app
    if (status === 'needs-consent') {
        return (
            <>
                {children}
                <ConsentModal onConsented={() => setStatus('consented')} />
            </>
        );
    }

    // Consented or anonymous — render normally
    return <>{children}</>;
}
