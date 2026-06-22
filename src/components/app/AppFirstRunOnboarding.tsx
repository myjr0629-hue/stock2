'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import styles from './AppFirstRunOnboarding.module.css';

const STORAGE_KEY = 'signum_onboarding_done';

type LocaleKey = 'ko' | 'en' | 'ja';

type OnboardingCopy = {
  kicker: string;
  title: string;
  subtitle: string;
  stepIntro: string;
  stepLegal: string;
  pillars: Array<{ title: string; text: string }>;
  noticeTitle: string;
  noticeText: string;
  disclaimerTitle: string;
  disclaimerItems: string[];
  acknowledge: string;
  back: string;
  next: string;
  enter: string;
  privacy: string;
  terms: string;
  support: string;
  company: string;
};

const COPY: Record<LocaleKey, OnboardingCopy> = {
  ko: {
    kicker: 'SIGNUM HQ APP',
    title: '시장 데이터를 더 선명하게 봅니다',
    subtitle: '옵션 플로우, 다크풀, 감마 레벨, 거시 리스크를 모바일 환경에 맞게 정리한 리서치 앱입니다.',
    stepIntro: '1 / 2 · 앱 이용 안내',
    stepLegal: '2 / 2 · 금융 면책고지',
    pillars: [
      { title: '프리미엄 지표', text: '감마, 수급, 변동성, 거시 데이터를 한 화면에서 확인' },
      { title: '광고 기반 무료', text: '광고 시청으로 일부 상세 리서치와 잠금 영역을 해제' },
      { title: '리포트 알림', text: '리포트 생성 및 주요 업데이트 중심으로 알림 제공 예정' },
    ],
    noticeTitle: '투자 판단을 대신하지 않습니다',
    noticeText: 'SIGNUM HQ는 교육, 리서치, 시장 데이터 참고용 도구입니다. 앱 안의 점수와 해석은 사용자의 독립적인 판단을 돕기 위한 정보입니다.',
    disclaimerTitle: '반드시 확인해 주세요',
    disclaimerItems: [
      '본 앱의 모든 정보는 투자 조언, 매수 또는 매도 권유, 금융상품 추천이 아닙니다.',
      '데이터, 점수, AI 해석, 광고로 해제되는 프리미엄 리서치는 교육 및 시장 참고용으로만 제공됩니다.',
      '실시간 데이터와 외부 API는 지연, 오류, 누락이 발생할 수 있으며 정확성이나 완전성을 보장하지 않습니다.',
      '과거 성과, 백테스트, 지표 신호는 미래 수익을 보장하지 않습니다.',
      '모든 투자 판단과 그 결과에 대한 책임은 사용자 본인에게 있습니다.',
    ],
    acknowledge: '위 내용을 이해했으며, SIGNUM HQ를 리서치 및 시장 데이터 참고용으로만 사용하겠습니다.',
    back: '이전',
    next: '계속',
    enter: '동의하고 시작',
    privacy: '개인정보처리방침',
    terms: '이용약관',
    support: '지원',
    company: 'SIGNUM HQ, LLC',
  },
  en: {
    kicker: 'SIGNUM HQ APP',
    title: 'Read market data with more context',
    subtitle: 'A mobile research app for options flow, dark-pool activity, gamma levels, and macro risk.',
    stepIntro: '1 / 2 · App Overview',
    stepLegal: '2 / 2 · Financial Disclaimer',
    pillars: [
      { title: 'Premium signals', text: 'Gamma, flow, volatility, and macro context in one view' },
      { title: 'Free with ads', text: 'Watch ads to unlock selected premium research sections' },
      { title: 'Report alerts', text: 'Notifications will focus on generated reports and key updates' },
    ],
    noticeTitle: 'This app does not make investment decisions for you',
    noticeText: 'SIGNUM HQ is for education, research, and market-data reference. Scores and interpretation are informational inputs for your independent judgment.',
    disclaimerTitle: 'Please review before using',
    disclaimerItems: [
      'All content is not investment advice, a buy or sell recommendation, or a recommendation of any financial product.',
      'Data, scores, AI interpretation, and ad-unlocked premium research are provided for educational and market-reference purposes only.',
      'Real-time data and third-party APIs may be delayed, incomplete, or incorrect, and accuracy is not guaranteed.',
      'Past performance, backtests, and indicator signals do not guarantee future results.',
      'You are solely responsible for your investment decisions and outcomes.',
    ],
    acknowledge: 'I understand and will use SIGNUM HQ only as a research and market-data reference tool.',
    back: 'Back',
    next: 'Continue',
    enter: 'Agree and Start',
    privacy: 'Privacy Policy',
    terms: 'Terms',
    support: 'Support',
    company: 'SIGNUM HQ, LLC',
  },
  ja: {
    kicker: 'SIGNUM HQ APP',
    title: '市場データをより深く読み解く',
    subtitle: 'オプションフロー、ダークプール、ガンマ水準、マクロリスクをモバイル向けに整理したリサーチアプリです。',
    stepIntro: '1 / 2 · アプリ案内',
    stepLegal: '2 / 2 · 金融免責事項',
    pillars: [
      { title: 'プレミアム指標', text: 'ガンマ、フロー、ボラティリティ、マクロ状況を一画面で確認' },
      { title: '広告ベースで無料', text: '広告視聴により一部の詳細リサーチとロック領域を解除' },
      { title: 'レポート通知', text: 'レポート生成と重要アップデートを中心に通知予定' },
    ],
    noticeTitle: '投資判断を代行するものではありません',
    noticeText: 'SIGNUM HQは教育、リサーチ、市場データ参照のためのツールです。スコアや解釈は、利用者自身の判断を補助する情報です。',
    disclaimerTitle: '利用前に必ずご確認ください',
    disclaimerItems: [
      '本アプリのすべての情報は、投資助言、売買推奨、金融商品の推奨ではありません。',
      'データ、スコア、AI解釈、広告視聴で解除されるプレミアムリサーチは、教育および市場参照目的でのみ提供されます。',
      'リアルタイムデータや外部APIには遅延、誤り、欠落が生じる場合があり、正確性や完全性は保証されません。',
      '過去の実績、バックテスト、指標シグナルは将来の収益を保証しません。',
      '投資判断とその結果に関する責任は、すべて利用者本人にあります。',
    ],
    acknowledge: '上記を理解し、SIGNUM HQをリサーチおよび市場データ参照目的でのみ利用します。',
    back: '戻る',
    next: '続ける',
    enter: '同意して開始',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
    support: 'サポート',
    company: 'SIGNUM HQ, LLC',
  },
};

function getCopy(locale: string): OnboardingCopy {
  if (locale === 'ja' || locale === 'en' || locale === 'ko') return COPY[locale];
  return COPY.en;
}

export function AppFirstRunOnboarding() {
  const locale = useLocale();
  const copy = useMemo(() => getCopy(locale), [locale]);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== '1');
    } catch {
      setVisible(true);
    }
  }, []);

  const complete = () => {
    if (!accepted) return;
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="app-onboarding-title">
      <div className={styles.shell}>
        <section className={styles.panel}>
          <header className={styles.hero}>
            <span className={styles.kicker}>{copy.kicker}</span>
            <h1 id="app-onboarding-title" className={styles.title}>{copy.title}</h1>
            <p className={styles.subtitle}>{copy.subtitle}</p>
          </header>

          <div className={styles.body}>
            {step === 0 ? (
              <>
                <p className={styles.stepLabel}>{copy.stepIntro}</p>
                <div className={styles.pillGrid}>
                  {copy.pillars.map((pillar) => (
                    <div className={styles.pill} key={pillar.title}>
                      <span className={styles.pillStrong}>{pillar.title}</span>
                      <span className={styles.pillText}>{pillar.text}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.notice}>
                  <p className={styles.noticeTitle}>{copy.noticeTitle}</p>
                  <p className={styles.noticeText}>{copy.noticeText}</p>
                </div>
              </>
            ) : (
              <>
                <p className={styles.stepLabel}>{copy.stepLegal}</p>
                <div className={styles.notice}>
                  <p className={styles.noticeTitle}>{copy.disclaimerTitle}</p>
                  <ul className={styles.disclaimerList}>
                    {copy.disclaimerItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <label className={styles.ack}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  <span>{copy.acknowledge}</span>
                </label>
                <div className={styles.links}>
                  <a href={`/${locale}/privacy`}>{copy.privacy}</a>
                  <a href={`/${locale}/terms`}>{copy.terms}</a>
                  <a href="mailto:contact@signumhq.com">{copy.support}: contact@signumhq.com</a>
                  <span>{copy.company}</span>
                </div>
              </>
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => (step === 0 ? setStep(1) : setStep(0))}
            >
              {step === 0 ? copy.stepLegal.replace(/^2 \/ 2 ·\s*/, '') : copy.back}
            </button>
            {step === 0 ? (
              <button type="button" className={styles.primaryButton} onClick={() => setStep(1)}>
                {copy.next}
              </button>
            ) : (
              <button type="button" className={styles.primaryButton} disabled={!accepted} onClick={complete}>
                {copy.enter}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
