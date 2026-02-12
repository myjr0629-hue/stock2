'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Shield, FileText, Lock, Users, Megaphone, ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ConsentModalProps {
    onConsented: () => void;
}

export function ConsentModal({ onConsented }: ConsentModalProps) {
    const locale = useLocale();
    const tLegal = useTranslations('legal');

    const [agreeTerms, setAgreeTerms] = useState(false);
    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [agreeAge, setAgreeAge] = useState(false);
    const [agreeMarketing, setAgreeMarketing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const allRequired = agreeTerms && agreePrivacy && agreeAge;
    const allChecked = allRequired && agreeMarketing;

    const handleSelectAll = (checked: boolean) => {
        setAgreeTerms(checked);
        setAgreePrivacy(checked);
        setAgreeAge(checked);
        setAgreeMarketing(checked);
    };

    const handleSubmit = async () => {
        if (!allRequired) return;
        setSubmitting(true);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('user_consent')
                .insert({
                    user_id: user.id,
                    terms_accepted_at: new Date().toISOString(),
                    marketing_agreed: agreeMarketing,
                    ip_address: null,
                    user_agent: navigator.userAgent,
                });

            if (!error) {
                onConsented();
            } else {
                console.error('Consent save error:', error);
            }
        } catch (err) {
            console.error('Consent submit error:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const checkboxItems = [
        {
            id: 'terms',
            icon: FileText,
            color: 'text-cyan-400',
            label: tLegal('consentTerms'),
            required: true,
            checked: agreeTerms,
            onChange: setAgreeTerms,
            viewHref: `/${locale}/terms`,
        },
        {
            id: 'privacy',
            icon: Lock,
            color: 'text-emerald-400',
            label: tLegal('consentPrivacy'),
            required: true,
            checked: agreePrivacy,
            onChange: setAgreePrivacy,
            viewHref: `/${locale}/privacy`,
        },
        {
            id: 'age',
            icon: Users,
            color: 'text-amber-400',
            label: tLegal('consentAge'),
            required: true,
            checked: agreeAge,
            onChange: setAgreeAge,
            viewHref: null,
        },
        {
            id: 'marketing',
            icon: Megaphone,
            color: 'text-violet-400',
            label: tLegal('consentMarketing'),
            required: false,
            checked: agreeMarketing,
            onChange: setAgreeMarketing,
            viewHref: null,
        },
    ];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Animated Background Auras */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute -top-20 -left-20 w-[400px] h-[400px] bg-cyan-600/15 rounded-full blur-[120px] animate-pulse"
                    style={{ animationDuration: '8s' }}
                />
                <div
                    className="absolute -bottom-20 -right-20 w-[450px] h-[450px] bg-indigo-600/15 rounded-full blur-[130px] animate-pulse"
                    style={{ animationDuration: '10s', animationDelay: '2s' }}
                />
            </div>

            {/* Modal Card */}
            <div className="relative w-full max-w-lg backdrop-blur-2xl bg-white/[0.04] border-t border-l border-white/[0.1] border-b border-r border-white/[0.04] rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/60">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-white/[0.08] mb-5">
                        <Shield className="w-7 h-7 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
                        {tLegal('consentTitle')}
                    </h2>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        {tLegal('consentSubtitle')}
                    </p>
                </div>

                {/* Select All */}
                <label className="flex items-center gap-3 cursor-pointer group mb-4 pb-3 border-b border-white/[0.08]">
                    <div className="relative">
                        <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-5 h-5 rounded-md border border-white/20 bg-white/5 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-all flex items-center justify-center group-hover:border-white/40">
                            {allChecked && <Check className="w-3 h-3 text-white" />}
                        </div>
                    </div>
                    <span className="text-sm font-bold text-white">{tLegal('selectAll')}</span>
                </label>

                {/* Checkbox Items */}
                <div className="space-y-3">
                    {checkboxItems.map((item) => (
                        <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={(e) => item.onChange(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-5 h-5 rounded-md border border-white/20 bg-white/5 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-all flex items-center justify-center group-hover:border-white/40">
                                    {item.checked && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <item.icon className={`w-4 h-4 ${item.color} shrink-0`} />
                            <span className="text-sm text-slate-300 flex-1">
                                <span className={`font-bold ${item.required ? 'text-amber-400' : 'text-slate-500'} mr-1`}>
                                    {item.required ? tLegal('required') : tLegal('optional')}
                                </span>
                                {item.label}
                            </span>
                            {item.viewHref && (
                                <a
                                    href={item.viewHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] text-cyan-400/70 hover:text-cyan-400 transition-colors shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {tLegal('consentView')}
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </label>
                    ))}
                </div>

                {/* Submit Button */}
                <button
                    onClick={handleSubmit}
                    disabled={!allRequired || submitting}
                    className="w-full mt-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold text-sm tracking-wide transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                >
                    {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <Shield className="w-4 h-4" />
                            {tLegal('consentConfirm')}
                        </>
                    )}
                </button>

                {/* Footer Note */}
                <p className="mt-4 text-center text-[11px] text-slate-500 leading-relaxed">
                    {tLegal('consentFooter')}
                </p>
            </div>
        </div>
    );
}
