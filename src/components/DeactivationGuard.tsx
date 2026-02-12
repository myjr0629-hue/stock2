'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { RefreshCw, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DeactivationGuard({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [deactivation, setDeactivation] = useState<{ scheduledDate: string } | null>(null);
    const [checking, setChecking] = useState(true);
    const [reactivating, setReactivating] = useState(false);
    const t = useTranslations('settings');

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            setUser(user);
            if (user) {
                const { data } = await supabase
                    .from('user_deactivation')
                    .select('scheduled_deletion_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (data) {
                    setDeactivation({ scheduledDate: data.scheduled_deletion_at });
                }
            }
            setChecking(false);
        });
    }, []);

    const handleReactivate = async () => {
        if (!user) return;
        setReactivating(true);
        const supabase = createClient();
        await supabase
            .from('user_deactivation')
            .delete()
            .eq('user_id', user.id);
        setDeactivation(null);
        setReactivating(false);
    };

    if (checking) return <>{children}</>;
    if (!deactivation) return <>{children}</>;

    // Deactivated account — show recovery screen
    const scheduledDate = new Date(deactivation.scheduledDate);
    const daysLeft = Math.max(0, Math.ceil((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    return (
        <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1117]/90 backdrop-blur-xl shadow-2xl p-8 text-center">
                {/* Countdown */}
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Clock className="w-10 h-10 text-amber-400" />
                </div>

                <h2 className="text-xl font-bold text-white mb-2">
                    {t('deactivatedTitle')}
                </h2>

                <p className="text-sm text-slate-400 mb-6">
                    {t('deactivatedDesc', { date: scheduledDate.toLocaleDateString() })}
                </p>

                {/* Days countdown */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
                    <span className="text-2xl font-bold text-amber-400">{daysLeft}</span>
                    <span className="text-xs text-slate-500 uppercase tracking-wider">days left</span>
                </div>

                {/* Reactivate button */}
                <button
                    onClick={handleReactivate}
                    disabled={reactivating}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {reactivating ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <RefreshCw className="w-4 h-4" />
                            {t('reactivate')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
