'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { Mail, Lock, Loader2, AlertCircle, User, Check } from 'lucide-react';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing/LandingHeader';

export default function LoginPage() {
    const t = useTranslations('auth');
    const tLegal = useTranslations('legal');
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [agreeToTerms, setAgreeToTerms] = useState(false);

    const supabase = createClient();

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        if (isLogin) {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError(error.message);
            } else {
                router.push('/');
                router.refresh();
            }
        } else {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (error) {
                setError(error.message);
            } else {
                setMessage(t('checkEmail'));
            }
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
            {/* Header Navigation */}
            <LandingHeader />

            {/* Login Content */}
            <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-[120px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
                </div>

                {/* Login Card */}
                <div className="w-full max-w-md relative z-10">
                    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/50">
                        {/* Logo & Header */}
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center justify-center gap-3 mb-4">
                                <svg width="48" height="48" viewBox="0 0 48 48" className="text-cyan-400">
                                    <path
                                        d="M24 4 L42 14 L42 34 L24 44 L6 34 L6 14 Z"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        className="opacity-80"
                                    />
                                    <circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50" />
                                    <circle cx="24" cy="24" r="3" fill="currentColor" className="animate-pulse" />
                                    <line x1="24" y1="24" x2="34" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </div>
                            <h1 className="text-2xl font-black tracking-tight text-white mb-3">
                                SIGNUM<span className="text-cyan-400">HQ</span>
                            </h1>
                            <p className="text-sm text-white/80 font-light">
                                {t('subtitle')}
                            </p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                                <p className="text-sm text-rose-300">{error}</p>
                            </div>
                        )}

                        {/* Success Message */}
                        {message && (
                            <div className="mb-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <p className="text-sm text-emerald-300">{message}</p>
                            </div>
                        )}

                        {/* Google OAuth Button */}
                        <button
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 group disabled:opacity-50 disabled:cursor-not-allowed mb-6"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                                        {t('continueWithGoogle')}
                                    </span>
                                </>
                            )}
                        </button>

                        {/* Divider */}
                        <div className="relative mb-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="px-3 bg-[#0a0f1a] text-slate-500 uppercase tracking-wider">
                                    {t('orContinueWith')}
                                </span>
                            </div>
                        </div>

                        {/* Email/Password Form */}
                        <form onSubmit={handleEmailAuth} className="space-y-4">
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={t('email')}
                                    required
                                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                />
                            </div>

                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('password')}
                                    required
                                    minLength={6}
                                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                />
                            </div>

                            {/* Terms Checkbox - Signup only */}
                            {!isLogin && (
                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <div className="relative mt-0.5">
                                        <input
                                            type="checkbox"
                                            checked={agreeToTerms}
                                            onChange={(e) => setAgreeToTerms(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-5 h-5 rounded border border-white/20 bg-white/5 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-all flex items-center justify-center group-hover:border-white/40">
                                            {agreeToTerms && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-400 leading-relaxed">
                                        <Link href="/terms" className="text-cyan-400 hover:underline">
                                            {tLegal('termsLink')}
                                        </Link>
                                        {' '}{tLegal('and')}{' '}
                                        <Link href="/privacy" className="text-cyan-400 hover:underline">
                                            {tLegal('privacyLink')}
                                        </Link>
                                        에 동의합니다. (필수)
                                    </span>
                                </label>
                            )}

                            <button
                                type="submit"
                                disabled={loading || (!isLogin && !agreeToTerms)}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold text-sm uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <User className="w-4 h-4" />
                                        {isLogin ? t('signIn') : t('signUp')}
                                    </>
                                )}
                            </button>
                        </form>

                        {/* OAuth Disclaimer - Login mode */}
                        {isLogin && (
                            <div className="mt-6 pt-4 border-t border-white/[0.05] text-center">
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    {tLegal('disclaimer')}
                                </p>
                                <p className="text-[11px] mt-1">
                                    <Link href="/terms" className="text-cyan-400/80 hover:text-cyan-400 hover:underline">
                                        {tLegal('termsLink')}
                                    </Link>
                                    <span className="text-slate-600 mx-2">|</span>
                                    <Link href="/privacy" className="text-cyan-400/80 hover:text-cyan-400 hover:underline">
                                        {tLegal('privacyLink')}
                                    </Link>
                                </p>
                            </div>
                        )}

                        {/* Toggle Login/Signup */}
                        <div className="mt-8 pt-6 border-t border-white/[0.05] text-center">
                            <p className="text-sm text-slate-500 mb-2">
                                {isLogin ? t('noAccount') : t('hasAccount')}
                            </p>
                            <button
                                onClick={() => {
                                    setIsLogin(!isLogin);
                                    setAgreeToTerms(false);
                                    setError(null);
                                    setMessage(null);
                                }}
                                className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                                {isLogin ? t('signUp') : t('signIn')} →
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <Link
                            href="/"
                            className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                        >
                            ← {t('backToHome')}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
