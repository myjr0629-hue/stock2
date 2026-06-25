'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import '@/styles/app-tokens.css';

type LocaleKey = 'ko' | 'en' | 'ja';

const COPY: Record<LocaleKey, {
  steps: Array<{ eyebrow: string; title: string; body: string; bullets: string[] }>;
  next: string;
  start: string;
  skip: string;
}> = {
  en: {
    steps: [
      {
        eyebrow: 'Financial Data Notice',
        title: 'Research only, not advice',
        body: 'SIGNUM HQ provides market data, indicators, AI summaries, and report alerts for education and research.',
        bullets: [
          'Signals are not buy or sell recommendations.',
          'Market data may be delayed, missing, or incomplete.',
          'You are responsible for your own decisions and risk.',
        ],
      },
      {
        eyebrow: 'Ads & Unlocks',
        title: 'Free app with advertising',
        body: 'Rewarded ads may unlock selected research surfaces for a limited time. Ads do not create advisory products or return guarantees.',
        bullets: [
          'AdMob may use advertising identifiers for delivery and measurement.',
          'You can control ad tracking in your device settings.',
          'Premium or ad-free options reduce ad exposure only.',
        ],
      },
      {
        eyebrow: 'Notifications',
        title: 'Alerts stay informational',
        body: 'Notifications may announce reports, market-data status, and app updates. They are not personalized trading instructions.',
        bullets: [
          'Default language is English.',
          'App terms and privacy policy are available in the footer.',
          'Support: contact@signumhq.com',
        ],
      },
    ],
    next: 'Next',
    start: 'Start App',
    skip: 'Skip',
  },
  ko: {
    steps: [
      {
        eyebrow: '금융 데이터 고지',
        title: '리서치용 정보이며 투자 조언이 아닙니다',
        body: 'SIGNUM HQ는 교육과 리서치를 위한 시장 데이터, 지표, AI 요약, 리포트 알림을 제공합니다.',
        bullets: [
          '신호와 점수는 매수 또는 매도 추천이 아닙니다.',
          '시장 데이터는 지연, 누락, 오류가 있을 수 있습니다.',
          '투자 판단과 위험 관리는 사용자 본인의 책임입니다.',
        ],
      },
      {
        eyebrow: '광고와 잠금 해제',
        title: '광고 기반 무료 앱입니다',
        body: '보상형 광고는 일부 리서치 영역을 제한된 시간 동안 열 수 있습니다. 광고 시청은 자문 상품이나 수익 보장을 의미하지 않습니다.',
        bullets: [
          'AdMob은 광고 제공과 측정을 위해 광고 식별자를 사용할 수 있습니다.',
          '광고 추적 설정은 기기 설정에서 관리할 수 있습니다.',
          '프리미엄 또는 광고 제거 옵션은 광고 노출을 줄이는 기능입니다.',
        ],
      },
      {
        eyebrow: '알림',
        title: '알림은 정보 제공 목적입니다',
        body: '알림은 리포트, 시장 데이터 상태, 앱 업데이트를 안내할 수 있습니다. 개인화된 매매 지시가 아닙니다.',
        bullets: [
          '기본 언어는 영어입니다.',
          '앱 약관과 개인정보처리방침은 푸터에서 확인할 수 있습니다.',
          '지원: contact@signumhq.com',
        ],
      },
    ],
    next: '다음',
    start: '앱 시작',
    skip: '건너뛰기',
  },
  ja: {
    steps: [
      {
        eyebrow: '金融データ通知',
        title: 'リサーチ用情報であり投資助言ではありません',
        body: 'SIGNUM HQは教育とリサーチのために、市場データ、指標、AI要約、レポート通知を提供します。',
        bullets: [
          'シグナルやスコアは売買推奨ではありません。',
          '市場データは遅延、欠落、不完全な場合があります。',
          '投資判断とリスク管理は利用者ご自身の責任です。',
        ],
      },
      {
        eyebrow: '広告とロック解除',
        title: '広告対応の無料アプリです',
        body: 'リワード広告により、一部のリサーチ領域を一定時間利用できます。広告視聴は助言商品や収益保証を意味しません。',
        bullets: [
          'AdMobは広告配信と測定のため広告識別子を使用する場合があります。',
          '広告トラッキング設定は端末設定で管理できます。',
          'プレミアムまたは広告削除は広告表示を減らす機能です。',
        ],
      },
      {
        eyebrow: '通知',
        title: '通知は情報提供目的です',
        body: '通知はレポート、市場データ状態、アプリ更新を案内します。個別の売買指示ではありません。',
        bullets: [
          '既定言語は英語です。',
          'アプリ規約とプライバシーポリシーはフッターで確認できます。',
          'サポート: contact@signumhq.com',
        ],
      },
    ],
    next: '次へ',
    start: 'アプリを開始',
    skip: 'スキップ',
  },
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const locale = useLocale() as LocaleKey;
  const router = useRouter();
  const copy = COPY[locale] || COPY.en;
  const current = copy.steps[step];
  const isLast = step === copy.steps.length - 1;

  const complete = () => {
    try {
      localStorage.setItem('signum_onboarding_done', '1');
      localStorage.setItem('signum_app_first_run_notice_v1', 'accepted');
      localStorage.setItem('signumhq.app.onboarding.v1', 'accepted');
    } catch {}
    router.push('/app-view/dash');
  };

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom))',
      background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.16), transparent 36%), #07101f',
      color: 'var(--text)',
    }}>
      <section style={{
        width: 'min(100%, 392px)',
        border: '1px solid rgba(34,211,238,0.20)',
        borderRadius: 24,
        background: 'linear-gradient(145deg, rgba(9,23,41,0.96), rgba(6,12,24,0.98))',
        boxShadow: '0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {copy.steps.map((_, index) => (
              <span
                key={index}
                style={{
                  width: index === step ? 30 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: index === step ? 'var(--cyan)' : 'rgba(148,163,184,0.18)',
                  boxShadow: index === step ? '0 0 18px rgba(34,211,238,0.45)' : 'none',
                  transition: 'all 0.25s ease',
                }}
              />
            ))}
          </div>
          <p style={{
            margin: '0 0 9px',
            color: '#22d3ee',
            fontSize: 11,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>
            {current.eyebrow}
          </p>
          <h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.08, fontWeight: 950, letterSpacing: 0 }}>
            {current.title}
          </h1>
          <p style={{ margin: '13px 0 0', color: 'rgba(203,213,225,0.88)', fontSize: 14, lineHeight: 1.62, fontWeight: 650 }}>
            {current.body}
          </p>
        </div>

        <div style={{ padding: 20 }}>
          <ul style={{ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
            {current.bullets.map((item) => (
              <li key={item} style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr',
                gap: 10,
                color: 'rgba(226,232,240,0.90)',
                fontSize: 13,
                lineHeight: 1.55,
                fontWeight: 700,
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  marginTop: 7,
                  borderRadius: 999,
                  background: '#22d3ee',
                  boxShadow: '0 0 12px rgba(34,211,238,0.65)',
                }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
            <button
              onClick={() => (isLast ? complete() : setStep(step + 1))}
              style={{
                height: 48,
                borderRadius: 15,
                border: 0,
                background: isLast ? 'linear-gradient(135deg, #22d3ee, #10b981)' : 'rgba(34,211,238,0.12)',
                color: isLast ? '#03111c' : '#e5f7ff',
                fontSize: 14,
                fontWeight: 950,
                boxShadow: isLast ? '0 14px 34px rgba(34,211,238,0.24)' : 'inset 0 0 0 1px rgba(34,211,238,0.22)',
              }}
            >
              {isLast ? copy.start : copy.next}
            </button>
            {!isLast && (
              <button
                onClick={complete}
                style={{ height: 44, border: 0, background: 'transparent', color: 'rgba(148,163,184,0.86)', fontSize: 12, fontWeight: 800 }}
              >
                {copy.skip}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
