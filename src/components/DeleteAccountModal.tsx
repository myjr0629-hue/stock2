'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { Shield, AlertTriangle, Briefcase, Star, BarChart3, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    user: User;
}

export default function DeleteAccountModal({ isOpen, onClose, user }: Props) {
    const t = useTranslations('settings');
    const [step, setStep] = useState<'warning' | 'confirm'>('warning');
    const [loading, setLoading] = useState(false);
    const [counts, setCounts] = useState({ portfolio: 0, watchlist: 0 });

    // Fetch real data counts
    useEffect(() => {
        if (!isOpen) return;
        const supabase = createClient();

        Promise.all([
            supabase.from('user_portfolio').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
            supabase.from('user_watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ]).then(([portfolio, watchlist]) => {
            setCounts({
                portfolio: portfolio.count || 0,
                watchlist: watchlist.count || 0,
            });
        });
    }, [isOpen, user.id]);

    const handleDeactivate = async () => {
        setLoading(true);
        try {
            const supabase = createClient();
            const scheduledDate = new Date();
            scheduledDate.setDate(scheduledDate.getDate() + 30);

            await supabase.from('user_deactivation').insert({
                user_id: user.id,
                deactivated_at: new Date().toISOString(),
                scheduled_deletion_at: scheduledDate.toISOString(),
            });

            await supabase.auth.signOut();
            window.location.href = '/';
        } catch (err) {
            console.error('Deactivation error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-md rounded-2xl border border-red-500/20 bg-[#0d1117]/95 backdrop-blur-xl shadow-2xl shadow-red-500/5">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">
                                {t('deleteAccount')}
                            </h2>
                            <p className="text-xs text-red-400/70 uppercase tracking-widest font-semibold">
                                {t('irreversibleAction')}
                            </p>
                        </div>
                    </div>
                </div>

                {step === 'warning' ? (
                    <div className="px-6 py-5 space-y-5">
                        {/* Warning text */}
                        <p className="text-sm text-slate-300 leading-relaxed">
                            {t('deleteWarning')}
                        </p>

                        {/* Loss items - real data counts */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <Briefcase className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="text-sm text-slate-300">
                                    <span className="text-white font-semibold">{counts.portfolio}</span> {t('portfolioItems')}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <Star className="w-4 h-4 text-cyan-400 shrink-0" />
                                <span className="text-sm text-slate-300">
                                    <span className="text-white font-semibold">{counts.watchlist}</span> {t('watchlistItems')}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="text-sm text-slate-300">{t('aiAccess')}</span>
                            </div>
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                                <Settings2 className="w-4 h-4 text-violet-400 shrink-0" />
                                <span className="text-sm text-slate-300">{t('dashboardConfig')}</span>
                            </div>
                        </div>

                        {/* 30-day notice */}
                        <div className="px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                            <p className="text-xs text-amber-400/80 leading-relaxed">
                                {t('deleteConfirm')}
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold text-slate-400 hover:text-white hover:border-white/20 transition-all"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={() => setStep('confirm')}
                                className="flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-all"
                            >
                                {t('confirmDelete')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="px-6 py-5 space-y-5">
                        {/* Final confirmation */}
                        <div className="text-center py-4">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                <Shield className="w-8 h-8 text-red-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">
                                {t('finalConfirmTitle')}
                            </h3>
                            <p className="text-sm text-slate-400">
                                {t('finalConfirmDesc')}
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('warning')}
                                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold text-slate-400 hover:text-white hover:border-white/20 transition-all"
                            >
                                {t('goBack')}
                            </button>
                            <button
                                onClick={handleDeactivate}
                                disabled={loading}
                                className="flex-1 py-3 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    </span>
                                ) : (
                                    t('deleteForever')
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
