'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Pencil, Check, LogOut, AlertTriangle, ChevronRight, Sparkles, Shield, Globe, Calendar, Mail, Crown, Zap, ArrowRight } from 'lucide-react';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import { useTier } from '@/contexts/TierContext';
import { Link } from '@/i18n/routing';

export default function SettingsPage() {
    const t = useTranslations('settings');
    const locale = useLocale();
    const router = useRouter();
    const supabase = createClient();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [displayName, setDisplayName] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [stats, setStats] = useState({ watchlist: 0, portfolio: 0 });
    const { tier } = useTier();

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push(`/${locale}/login`); return; }
        setUser(user);
        const { data: profile } = await supabase.from('user_profiles').select('display_name').eq('user_id', user.id).maybeSingle();
        setDisplayName(profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || '');
        const [wl, pf] = await Promise.all([
            supabase.from('user_watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
            supabase.from('user_portfolio').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ]);
        setStats({ watchlist: wl.count || 0, portfolio: pf.count || 0 });
        setLoading(false);
    };

    const handleSaveName = async () => {
        if (!user || !displayName.trim()) return;
        setSaving(true);
        await supabase.from('user_profiles').upsert({ user_id: user.id, display_name: displayName.trim() }, { onConflict: 'user_id' });
        setSaving(false); setEditingName(false); setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
    };

    const handleSignOut = async () => { await supabase.auth.signOut(); router.push(`/${locale}/login`); };
    const getProvider = () => user?.app_metadata?.provider === 'google' ? 'Google' : 'Email';
    const getJoinDate = () => {
        if (!user) return '';
        const d = new Date(user.created_at);
        return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
    };
    const getDaysSince = () => {
        if (!user) return 0;
        const diff = Date.now() - new Date(user.created_at).getTime();
        return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    };
    const getInitials = () => (displayName || user?.email || 'U').charAt(0).toUpperCase();

    if (loading) {
        return (<div className="min-h-screen bg-[#060910] flex items-center justify-center pt-20"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>);
    }

    return (
        <>
            {/* Modal Backdrop — click outside to dismiss */}
            <div
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget) router.back();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') router.back();
                }}
                tabIndex={-1}
                role="dialog"
                style={{ animation: 'fadeIn 0.2s ease-out' }}
            >
                <div
                    className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[28px]"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'rgba(10, 14, 26, 0.97)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: `
                            0 0 40px rgba(99, 102, 241, 0.06),
                            0 0 80px rgba(59, 130, 246, 0.04),
                            0 32px 64px -12px rgba(0, 0, 0, 0.6),
                            inset 0 1px 0 rgba(255, 255, 255, 0.06)
                        `,
                        animation: 'slideUp 0.25s ease-out',
                    }}
                >
                    {/* Gradient border glow — top edge */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[28px]" style={{
                        background: 'linear-gradient(90deg, transparent 5%, rgba(99, 130, 255, 0.4) 25%, rgba(139, 92, 246, 0.35) 50%, rgba(99, 130, 255, 0.3) 75%, transparent 95%)'
                    }} />
                    {/* Top glow bleed */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-[80px] bg-gradient-to-b from-blue-500/[0.04] to-transparent pointer-events-none rounded-t-[28px]" />

                    {/* ──────── PROFILE HEADER ──────── */}
                    <div className="px-10 pt-10 pb-0">
                        <div className="flex items-start gap-6">
                            {/* Avatar with glow */}
                            <div className="relative shrink-0">
                                <div className="w-20 h-20 rounded-[20px] overflow-hidden" style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)',
                                    padding: '2px',
                                    boxShadow: '0 0 24px rgba(99, 102, 241, 0.2), 0 8px 32px rgba(99, 102, 241, 0.12)'
                                }}>
                                    <div className="w-full h-full rounded-[18px] flex items-center justify-center text-[28px] font-black text-white"
                                        style={{ background: 'rgba(10, 12, 20, 0.85)' }}>
                                        {getInitials()}
                                    </div>
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
                                    style={{ border: '3px solid rgba(10, 12, 20, 0.9)', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}>
                                    <Check className="w-3 h-3 text-white" />
                                </div>
                            </div>

                            {/* Name + Email */}
                            <div className="flex-1 min-w-0 pt-1">
                                {editingName ? (
                                    <div className="flex items-center gap-2">
                                        <input type="text" value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            className="flex-1 px-4 py-2.5 rounded-xl text-lg text-white font-semibold placeholder-slate-500 focus:outline-none transition-all"
                                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}
                                            autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                                        />
                                        <button onClick={handleSaveName} disabled={saving}
                                            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                                            {saving ? '...' : t('save')}
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setEditingName(true)} className="group flex items-center gap-2.5 w-full text-left">
                                        <h1 className="text-[26px] font-black text-white tracking-tight truncate leading-tight">
                                            {displayName || 'User'}
                                        </h1>
                                        <Pencil className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0 mt-1" />
                                    </button>
                                )}
                                <p className="text-sm text-slate-400 mt-1 font-mono truncate">{user?.email}</p>
                            </div>
                        </div>

                        {saveSuccess && (
                            <div className="mt-4 px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                                <Check className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-medium text-emerald-400">{t('saved')}</span>
                            </div>
                        )}
                    </div>

                    {/* ──────── STATS BAR ──────── */}
                    <div className="px-10 py-8">
                        <div className="flex items-center">
                            <div className="flex-1 text-center">
                                <p className="text-[32px] font-black text-white leading-none">{stats.watchlist}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mt-2 font-semibold">Watchlist</p>
                            </div>
                            <div className="w-px h-10 bg-white/[0.08]" />
                            <div className="flex-1 text-center">
                                <p className="text-[32px] font-black text-white leading-none">{stats.portfolio}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mt-2 font-semibold">Portfolio</p>
                            </div>
                            <div className="w-px h-10 bg-white/[0.08]" />
                            <div className="flex-1 flex flex-col items-center">
                                <div className="flex items-center gap-1.5">
                                    {tier === 'elite' ? (
                                        <Crown className="w-4 h-4 text-cyan-400" />
                                    ) : tier === 'pro' ? (
                                        <Sparkles className="w-4 h-4" style={{ color: '#d4a853' }} />
                                    ) : (
                                        <Zap className="w-4 h-4 text-slate-400" />
                                    )}
                                    <span className="text-lg font-black tracking-wide" style={{
                                        background: tier === 'elite'
                                            ? 'linear-gradient(135deg, #22d3ee, #06b6d4, #0891b2)'
                                            : tier === 'pro'
                                                ? 'linear-gradient(135deg, #d4a853, #f0d68a, #c9944a)'
                                                : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                    }}>{tier === 'elite' ? 'ELITE' : tier === 'pro' ? 'PRO' : 'FREE'}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mt-1.5 font-semibold">Plan</p>
                                {tier === 'free' && (
                                    <Link href="/pricing" className="mt-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 uppercase tracking-wider hover:bg-amber-500/20 transition-colors flex items-center gap-1">
                                        Upgrade <ArrowRight className="w-3 h-3" />
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ──────── SEPARATOR ──────── */}
                    <div className="mx-10 h-px bg-white/[0.07]" />

                    {/* ──────── ACCOUNT DETAILS ──────── */}
                    <div className="px-10 py-8 space-y-7">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <Mail className="w-[18px] h-[18px] text-blue-400/50" />
                                <span className="text-[13px] text-slate-300 font-medium">{t('email')}</span>
                            </div>
                            <span className="text-[13px] text-white font-mono">{user?.email}</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <Globe className="w-[18px] h-[18px] text-emerald-400/50" />
                                <span className="text-[13px] text-slate-300 font-medium">{t('joinedVia')}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                {getProvider() === 'Google' && (
                                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                )}
                                <span className="text-[13px] text-white">{getProvider()}</span>
                                <span className="text-white/10">·</span>
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.12)' }}>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">{t('verified')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <Calendar className="w-[18px] h-[18px] text-violet-400/50" />
                                <span className="text-[13px] text-slate-300 font-medium">{t('joinedAt')}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[13px] text-white">{getJoinDate()}</span>
                                <span className="text-[11px] font-bold text-indigo-400/70 px-2 py-0.5 rounded-full" style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.12)' }}>D+{getDaysSince()}</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                                <Shield className="w-[18px] h-[18px] text-cyan-400/50" />
                                <span className="text-[13px] text-slate-300 font-medium">Security</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52, 211, 153, 0.5)' }} />
                                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Protected</span>
                            </div>
                        </div>
                    </div>

                    {/* ──────── SEPARATOR ──────── */}
                    <div className="mx-10 h-px bg-white/[0.07]" />

                    {/* ──────── SIGN OUT ──────── */}
                    <button onClick={handleSignOut}
                        className="w-full px-10 py-5 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3.5">
                            <LogOut className="w-[18px] h-[18px] text-slate-500 group-hover:text-slate-300 transition-colors" />
                            <span className="text-[13px] font-semibold text-slate-300 group-hover:text-white transition-colors">{t('signOut')}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
                    </button>

                    {/* ──────── DANGER ZONE ──────── */}
                    <div className="mx-10 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.2), transparent)' }} />

                    <div className="px-10 py-7">
                        <div className="flex items-center gap-2.5 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400/50 shrink-0" />
                            <p className="text-[11px] font-bold text-red-400/50 uppercase tracking-[0.15em]">{t('dangerZone')}</p>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-relaxed mb-5 pl-6">{t('dangerDesc')}</p>
                        <div className="pl-6">
                            <button onClick={() => setShowDeleteModal(true)}
                                className="px-5 py-2.5 rounded-xl text-[12px] font-semibold text-red-300/80 hover:text-red-200 transition-all"
                                style={{
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                }}>
                                {t('deleteAccount')}
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            {/* CSS Keyframes for animations */}
            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>

            {user && <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} user={user} />}
        </>
    );
}
