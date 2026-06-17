'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import '@/styles/app-tokens.css';

const SLIDES = {
  ko: [
    { title: 'SIGNUM HQ', sub: '실시간 옵션 인텔리전스', desc: '월가 수준의 옵션 분석을\n당신의 손안에' },
    { title: '5가지 핵심 기능', sub: '프리미엄 분석 도구', desc: '대시보드 · 가디언 · 커맨드 · 플로우 · 인텔' },
    { title: '시작하기', sub: '모든 준비가 완료되었습니다', desc: '지금 바로 시장을 분석하세요' },
  ],
  en: [
    { title: 'SIGNUM HQ', sub: 'Real-time Options Intelligence', desc: 'Wall Street-grade options analysis\nin your pocket' },
    { title: '5 Core Features', sub: 'Premium Analysis Tools', desc: 'Dashboard · Guardian · Command · Flow · Intel' },
    { title: 'Get Started', sub: 'Everything is ready', desc: 'Start analyzing the market now' },
  ],
  ja: [
    { title: 'SIGNUM HQ', sub: 'リアルタイム・オプション・インテリジェンス', desc: 'ウォール街レベルのオプション分析を\nあなたの手の中に' },
    { title: '5つのコア機能', sub: 'プレミアム分析ツール', desc: 'ダッシュボード · ガーディアン · コマンド · フロー · インテル' },
    { title: '始めましょう', sub: 'すべての準備が整いました', desc: '今すぐ市場を分析しましょう' },
  ],
};

const FEATURE_ICONS = ['📊', '🛡️', '⌨️', '🌊', '🔍'];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const locale = useLocale() as 'ko' | 'en' | 'ja';
  const router = useRouter();
  const slides = SLIDES[locale] || SLIDES.en;

  const handleComplete = () => {
    try { localStorage.setItem('signum_onboarding_done', '1'); } catch {}
    router.push(`/${locale}/app-view/dash`);
  };

  const slide = slides[step];
  const isLast = step === slides.length - 1;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      position: 'relative',
    }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 48 }}>
        {slides.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 24 : 8,
            height: 8,
            borderRadius: 999,
            background: i === step ? 'var(--cyan)' : 'var(--surface-2)',
            transition: 'all 0.3s ease',
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{
          font: 'var(--f-display)',
          fontWeight: 900,
          color: 'var(--text)',
          marginBottom: 12,
          letterSpacing: '-0.02em',
        }}>{slide.title}</h1>
        <p style={{
          font: 'var(--f-body)',
          color: 'var(--cyan)',
          fontWeight: 600,
          marginBottom: 16,
        }}>{slide.sub}</p>
        <p style={{
          font: 'var(--f-body)',
          color: 'var(--text-dim)',
          lineHeight: 1.6,
          whiteSpace: 'pre-line',
        }}>{slide.desc}</p>
      </div>

      {/* Feature icons for slide 2 */}
      {step === 1 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {FEATURE_ICONS.map((icon, i) => (
            <div key={i} style={{
              width: 52, height: 52,
              borderRadius: 12,
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>{icon}</div>
          ))}
        </div>
      )}

      {/* Button */}
      <button
        onClick={() => isLast ? handleComplete() : setStep(step + 1)}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: '16px 32px',
          borderRadius: 'var(--r-btn)',
          background: isLast ? 'linear-gradient(135deg, var(--cyan), #0891b2)' : 'var(--surface-2)',
          color: isLast ? '#fff' : 'var(--text)',
          font: 'var(--f-body)',
          fontWeight: 700,
          border: isLast ? 'none' : '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {isLast ? (locale === 'ko' ? '시작하기' : locale === 'ja' ? '始めましょう' : 'Get Started') : (locale === 'ko' ? '다음' : locale === 'ja' ? '次へ' : 'Next')}
      </button>

      {/* Skip */}
      {!isLast && (
        <button
          onClick={handleComplete}
          style={{
            marginTop: 16,
            background: 'none',
            border: 'none',
            font: 'var(--f-small)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {locale === 'ko' ? '건너뛰기' : locale === 'ja' ? 'スキップ' : 'Skip'}
        </button>
      )}
    </div>
  );
}
