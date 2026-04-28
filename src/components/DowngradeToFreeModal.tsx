'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { X, AlertTriangle, ShieldOff, BarChart3, Bell, Brain, Zap, Clock, ChevronRight, Check } from 'lucide-react';

// ── Multi-language content ──
const CONTENT = {
    ko: {
        title: '플랜 다운그레이드',
        subtitle: '정말 Free 플랜으로 변경하시겠습니까?',
        activeUntilPrefix: '현재 구독은',
        activeUntilSuffix: '까지 유효합니다',
        activeUntilDesc: '해당 날짜까지 모든 프리미엄 기능을 계속 사용할 수 있으며, 이후 자동으로 Free 플랜으로 전환됩니다.',
        loseAccessTitle: '다운그레이드 시 이용이 제한되는 기능',
        features: [
            { icon: 'chart', text: 'Context Score 실시간 분석' },
            { icon: 'brain', text: 'Alpha Engine V5.0 인텔리전스' },
            { icon: 'bell', text: '실시간 알림 및 시그널' },
            { icon: 'shield', text: 'Dark Pool / 기관 데이터' },
            { icon: 'zap', text: '고급 옵션 플로우 분석' },
        ],
        dataNote: '워치리스트 및 포트폴리오 데이터는 보존됩니다.',
        keepPlan: '현재 플랜 유지',
        confirmDowngrade: '다운그레이드 확인',
        processing: '처리 중...',
        reasonTitle: '다운그레이드 사유를 선택해 주세요',
        reasons: [
            { id: 'price', label: '비용 부담' },
            { id: 'not_using', label: '사용 빈도가 낮음' },
            { id: 'missing_feature', label: '필요한 기능 부재' },
            { id: 'alternative', label: '다른 서비스 이용' },
            { id: 'break', label: '일시적 휴식' },
            { id: 'other', label: '기타' },
        ],
        successTitle: '다운그레이드가 예약되었습니다',
        successDesc: '까지 프리미엄 기능을 계속 이용하실 수 있습니다.',
        close: '확인',
    },
    en: {
        title: 'Downgrade Plan',
        subtitle: 'Are you sure you want to switch to Free?',
        activeUntilPrefix: 'Your current subscription is active until',
        activeUntilSuffix: '',
        activeUntilDesc: 'You will retain full access to all premium features until this date. After that, your account will automatically switch to the Free plan.',
        loseAccessTitle: 'Features you will lose access to',
        features: [
            { icon: 'chart', text: 'Real-time Context Score Analysis' },
            { icon: 'brain', text: 'Alpha Engine V5.0 Intelligence' },
            { icon: 'bell', text: 'Real-time Alerts & Signals' },
            { icon: 'shield', text: 'Dark Pool / Institutional Data' },
            { icon: 'zap', text: 'Advanced Options Flow Analytics' },
        ],
        dataNote: 'Your watchlist and portfolio data will be preserved.',
        keepPlan: 'Keep Current Plan',
        confirmDowngrade: 'Confirm Downgrade',
        processing: 'Processing...',
        reasonTitle: 'Please select a reason for downgrading',
        reasons: [
            { id: 'price', label: 'Too expensive' },
            { id: 'not_using', label: 'Not using it enough' },
            { id: 'missing_feature', label: 'Missing features I need' },
            { id: 'alternative', label: 'Using another service' },
            { id: 'break', label: 'Taking a break' },
            { id: 'other', label: 'Other' },
        ],
        successTitle: 'Downgrade Scheduled',
        successDesc: 'You will continue to enjoy premium features until',
        close: 'Done',
    },
    ja: {
        title: 'プランのダウングレード',
        subtitle: '本当にFreeプランに変更しますか？',
        activeUntilPrefix: '現在のサブスクリプションは',
        activeUntilSuffix: 'まで有効です',
        activeUntilDesc: 'この日付まですべてのプレミアム機能をご利用いただけます。期間終了後、自動的にFreeプランに切り替わります。',
        loseAccessTitle: 'ダウングレードにより制限される機能',
        features: [
            { icon: 'chart', text: 'リアルタイム Context Score 分析' },
            { icon: 'brain', text: 'Alpha Engine V5.0 インテリジェンス' },
            { icon: 'bell', text: 'リアルタイムアラート＆シグナル' },
            { icon: 'shield', text: 'Dark Pool / 機関投資家データ' },
            { icon: 'zap', text: '高度なオプションフロー分析' },
        ],
        dataNote: 'ウォッチリストとポートフォリオのデータは保持されます。',
        keepPlan: '現在のプランを維持',
        confirmDowngrade: 'ダウングレードを確認',
        processing: '処理中...',
        reasonTitle: 'ダウングレードの理由をお選びください',
        reasons: [
            { id: 'price', label: '費用の負担' },
            { id: 'not_using', label: '利用頻度が低い' },
            { id: 'missing_feature', label: '必要な機能の不足' },
            { id: 'alternative', label: '他のサービスを利用' },
            { id: 'break', label: '一時的な休止' },
            { id: 'other', label: 'その他' },
        ],
        successTitle: 'ダウングレードが予約されました',
        successDesc: 'まで引き続きプレミアム機能をお楽しみいただけます。',
        close: '確認',
    },
};

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
    chart: BarChart3,
    brain: Brain,
    bell: Bell,
    shield: ShieldOff,
    zap: Zap,
};

interface DowngradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    tier: string;
    onSuccess?: () => void;
}

export default function DowngradeToFreeModal({ isOpen, onClose, tier, onSuccess }: DowngradeModalProps) {
    const locale = useLocale() as 'ko' | 'en' | 'ja';
    const t = CONTENT[locale] || CONTENT.en;

    const [step, setStep] = useState<'reason' | 'confirm' | 'success'>('reason');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeUntil, setActiveUntil] = useState<string | null>(null);
    const [fetchingDate, setFetchingDate] = useState(true);

    // Fetch renewal date on mount
    useEffect(() => {
        if (!isOpen) return;
        setStep('reason');
        setReason('');
        setFetchingDate(true);

        fetch('/api/stripe/cancel')
            .then(r => r.json())
            .then(d => {
                if (d.activeUntil) {
                    const date = new Date(d.activeUntil);
                    setActiveUntil(date.toLocaleDateString(
                        locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US',
                        { year: 'numeric', month: 'long', day: 'numeric' }
                    ));
                }
            })
            .catch(() => {})
            .finally(() => setFetchingDate(false));
    }, [isOpen, locale]);

    const handleConfirm = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/stripe/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.activeUntil) {
                    const date = new Date(data.activeUntil);
                    setActiveUntil(date.toLocaleDateString(
                        locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US',
                        { year: 'numeric', month: 'long', day: 'numeric' }
                    ));
                }
                setStep('success');
            } else {
                alert(data.error || 'Something went wrong');
            }
        } catch {
            alert('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [reason, locale]);

    const handleClose = useCallback(() => {
        if (step === 'success') {
            onSuccess?.();
            window.location.reload();
        }
        onClose();
    }, [step, onClose, onSuccess]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
                onClick={(e) => { if (e.target === e.currentTarget && step !== 'success') handleClose(); }}
                style={{ animation: 'fadeIn 0.2s ease-out' }}
            >
                <div
                    className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[24px]"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'rgba(10, 14, 28, 0.98)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: `
                            0 0 60px rgba(239, 68, 68, 0.06),
                            0 32px 64px -12px rgba(0, 0, 0, 0.7),
                            inset 0 1px 0 rgba(255, 255, 255, 0.05)
                        `,
                        animation: 'slideUp 0.25s ease-out',
                    }}
                >
                    {/* Top warning gradient */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-[24px]" style={{
                        background: 'linear-gradient(90deg, transparent 5%, rgba(239, 68, 68, 0.3) 25%, rgba(251, 146, 60, 0.35) 50%, rgba(239, 68, 68, 0.25) 75%, transparent 95%)'
                    }} />

                    {/* Close button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all z-10"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    {/* ─── STEP 1: REASON ─── */}
                    {step === 'reason' && (
                        <div className="p-8">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                }}>
                                    <AlertTriangle className="w-5 h-5 text-red-400/80" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white tracking-tight">{t.title}</h2>
                                    <p className="text-[13px] text-slate-400">{t.subtitle}</p>
                                </div>
                            </div>

                            {/* Reason Selection */}
                            <p className="text-[13px] text-slate-300 font-semibold mt-7 mb-4">{t.reasonTitle}</p>
                            <div className="space-y-2">
                                {t.reasons.map((r) => (
                                    <button
                                        key={r.id}
                                        onClick={() => setReason(r.id)}
                                        className={`w-full text-left px-4 py-3 rounded-xl text-[13px] font-medium transition-all ${
                                            reason === r.id
                                                ? 'bg-white/[0.08] border-white/20 text-white'
                                                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.05] hover:text-slate-300'
                                        }`}
                                        style={{ border: `1px solid ${reason === r.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}` }}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                reason === r.id ? 'border-red-400' : 'border-slate-600'
                                            }`}>
                                                {reason === r.id && <span className="w-2 h-2 rounded-full bg-red-400" />}
                                            </span>
                                            {r.label}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 mt-8">
                                <button
                                    onClick={handleClose}
                                    className="flex-1 py-3.5 rounded-xl text-[13px] font-bold text-white transition-all"
                                    style={{
                                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                        boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)',
                                    }}
                                >
                                    {t.keepPlan}
                                </button>
                                <button
                                    onClick={() => reason && setStep('confirm')}
                                    disabled={!reason}
                                    className={`flex-1 py-3.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        reason
                                            ? 'text-slate-300 hover:text-white border border-white/10 hover:border-white/20'
                                            : 'text-slate-600 border border-white/[0.04] cursor-not-allowed'
                                    }`}
                                >
                                    {locale === 'ko' ? '다음' : locale === 'ja' ? '次へ' : 'Next'}
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 2: CONFIRM ─── */}
                    {step === 'confirm' && (
                        <div className="p-8">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                }}>
                                    <AlertTriangle className="w-5 h-5 text-red-400/80" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white tracking-tight">{t.title}</h2>
                                    <p className="text-[13px] text-slate-400">{t.subtitle}</p>
                                </div>
                            </div>

                            {/* Active Until Banner */}
                            {activeUntil && (
                                <div className="px-4 py-3.5 rounded-xl mb-6" style={{
                                    background: 'rgba(59, 130, 246, 0.06)',
                                    border: '1px solid rgba(59, 130, 246, 0.12)',
                                }}>
                                    <div className="flex items-center gap-2.5 mb-1.5">
                                        <Clock className="w-4 h-4 text-blue-400/70" />
                                        <span className="text-[13px] font-bold text-blue-400">
                                            {t.activeUntilPrefix} {activeUntil}{t.activeUntilSuffix}
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-slate-400 leading-relaxed pl-6.5">
                                        {t.activeUntilDesc}
                                    </p>
                                </div>
                            )}

                            {/* Features Lost */}
                            <p className="text-[12px] text-red-400/70 font-bold uppercase tracking-[0.15em] mb-3">{t.loseAccessTitle}</p>
                            <div className="space-y-1.5 mb-5">
                                {t.features.map((f, i) => {
                                    const IconComp = ICON_MAP[f.icon] || Zap;
                                    return (
                                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{
                                            background: 'rgba(239, 68, 68, 0.03)',
                                            border: '1px solid rgba(239, 68, 68, 0.06)',
                                        }}>
                                            <IconComp className="w-4 h-4 text-red-400/50 shrink-0" />
                                            <span className="text-[13px] text-slate-300">{f.text}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Data preservation note */}
                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg mb-7" style={{
                                background: 'rgba(16, 185, 129, 0.04)',
                                border: '1px solid rgba(16, 185, 129, 0.1)',
                            }}>
                                <Check className="w-4 h-4 text-emerald-400/60 shrink-0" />
                                <span className="text-[12px] text-emerald-400/80">{t.dataNote}</span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleClose}
                                    className="flex-1 py-3.5 rounded-xl text-[13px] font-bold text-white transition-all"
                                    style={{
                                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                        boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)',
                                    }}
                                >
                                    {t.keepPlan}
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={loading}
                                    className="flex-1 py-3.5 rounded-xl text-[13px] font-semibold text-red-300/70 hover:text-red-200 transition-all disabled:opacity-50"
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.06)',
                                        border: '1px solid rgba(239, 68, 68, 0.12)',
                                    }}
                                >
                                    {loading ? t.processing : t.confirmDowngrade}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 3: SUCCESS ─── */}
                    {step === 'success' && (
                        <div className="p-8 text-center">
                            <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{
                                background: 'rgba(59, 130, 246, 0.08)',
                                border: '1px solid rgba(59, 130, 246, 0.15)',
                            }}>
                                <Check className="w-7 h-7 text-blue-400" />
                            </div>
                            <h2 className="text-xl font-black text-white mb-2">{t.successTitle}</h2>
                            <p className="text-[14px] text-slate-300 leading-relaxed mb-8">
                                {t.successDesc} <span className="font-bold text-blue-400">{activeUntil}</span>
                            </p>
                            <button
                                onClick={handleClose}
                                className="px-8 py-3 rounded-xl text-[13px] font-bold text-white transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                    boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)',
                                }}
                            >
                                {t.close}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Keyframe animations */}
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
        </>
    );
}
