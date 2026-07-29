'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePathname } from '@/i18n/routing';
import { resolveAppLocale } from '@/lib/appLocale';
import styles from './AppFirstRunOnboarding.module.css';

type OnboardingCopy = {
  kicker: string;
  legalTitle: string;
  legalSubtitle: string;
  legalBody: string;
  legalStep: string;
  alertStep: string;
  bullets: string[];
  ack: string;
  terms: string;
  privacy: string;
  continue: string;
  back: string;
  start: string;
  alertTitle: string;
  alertSubtitle: string;
  alertBody: string;
  alertPills: Array<{ title: string; text: string }>;
};

const STORAGE_KEY = 'signumhq.app.onboarding.v1';

const COPY: Record<string, OnboardingCopy> = {
  ko: {
    kicker: 'SIGNUM HQ APP',
    legalTitle: '금융 데이터 고지',
    legalSubtitle: 'SIGNUM HQ는 교육과 리서치를 위한 시장 데이터 앱입니다.',
    legalBody:
      '지표, AI 요약, 알림은 투자 조언이나 매수/매도 권유가 아닙니다. 정확성, 수익, 손실 회피를 보장하지 않으며 모든 투자 판단과 책임은 사용자에게 있습니다.',
    legalStep: '1 / 2 · 필수 고지',
    alertStep: '2 / 2 · 알림 설정',
    bullets: [
      '투자 조언 또는 매수/매도 권유가 아닙니다.',
      '교육, 리서치, 시장 데이터 참고용입니다.',
      '정확성, 수익, 손실 회피를 보장하지 않습니다.',
      '광고 시청은 데이터 접근 권한만 해제하며 수익 가능성을 의미하지 않습니다.',
    ],
    ack: 'SIGNUM HQ 앱 약관과 금융 고지를 읽고 동의합니다.',
    terms: '앱 약관',
    privacy: '앱 개인정보 처리방침',
    continue: '계속',
    back: '이전',
    start: '시작하기',
    alertTitle: '리포트 알림',
    alertSubtitle: '장마감 리포트와 주요 시장 브리핑이 생성되면 알림을 받을 수 있습니다.',
    alertBody:
      '알림은 정보 제공 목적의 리마인더입니다. 개인화된 투자 추천이나 매매 신호가 아니며, 언제든 기기 설정에서 변경할 수 있습니다.',
    alertPills: [
      { title: '장마감 리포트', text: '섹터 및 핵심 종목 브리핑' },
      { title: '시장 브리프', text: '리스크와 매크로 요약' },
      { title: '데이터 잠금해제', text: '광고 기반 미리보기 안내' },
    ],
  },
  en: {
    kicker: 'SIGNUM HQ APP',
    legalTitle: 'Financial Data Notice',
    legalSubtitle: 'SIGNUM HQ is a market data app for education and research.',
    legalBody:
      'Indicators, AI summaries, and notifications in this app are not investment advice or buy/sell recommendations. Accuracy, returns, and loss avoidance are not guaranteed. All investment decisions remain your responsibility.',
    legalStep: '1 / 2 · Required notice',
    alertStep: '2 / 2 · Notifications',
    bullets: [
      'Not investment advice or a buy/sell recommendation.',
      'For education, research, and market-data reference only.',
      'Accuracy, returns, and loss avoidance are not guaranteed.',
      'Watching ads unlocks data access only; it does not imply profit potential.',
    ],
    ack: 'I confirm that I have read and agree to the SIGNUM HQ app terms and financial disclaimer.',
    terms: 'App Terms',
    privacy: 'App Privacy Policy',
    continue: 'Continue',
    back: 'Back',
    start: 'Start',
    alertTitle: 'Report Alerts',
    alertSubtitle: 'Get notified when closing reports and major market briefings are generated.',
    alertBody:
      'Notifications are informational reminders. They are not personalized investment recommendations or trading signals, and can be changed in settings at any time.',
    alertPills: [
      { title: 'Closing Reports', text: 'Sector and key ticker briefings' },
      { title: 'Market Briefs', text: 'Risk and macro summaries' },
      { title: 'Data Unlocks', text: 'Ad-supported preview access' },
    ],
  },
  ja: {
    kicker: 'SIGNUM HQ APP',
    legalTitle: '金融データに関する注意',
    legalSubtitle: 'SIGNUM HQは教育とリサーチのための市場データアプリです。',
    legalBody:
      '指標、AI要約、通知は投資助言または売買推奨ではありません。正確性、収益、損失回避は保証されず、すべての投資判断と責任は利用者本人にあります。',
    legalStep: '1 / 2 · 必須確認',
    alertStep: '2 / 2 · 通知設定',
    bullets: [
      '投資助言または売買推奨ではありません。',
      '教育、リサーチ、市場データの参照用です。',
      '正確性、収益、損失回避を保証しません。',
      '広告視聴はデータアクセスを解除するだけで、利益可能性を示すものではありません。',
    ],
    ack: 'SIGNUM HQアプリ利用規約および金融データに関する注意を読み、同意します。',
    terms: 'アプリ利用規約',
    privacy: 'アプリプライバシーポリシー',
    continue: '続ける',
    back: '戻る',
    start: '開始',
    alertTitle: 'レポート通知',
    alertSubtitle: '引け後レポートや主要な市場ブリーフィングが生成されたときに通知を受け取れます。',
    alertBody:
      '通知は情報提供目的のリマインダーです。個別の投資推奨や取引シグナルではなく、いつでも端末設定で変更できます。',
    alertPills: [
      { title: '引け後レポート', text: 'セクターと主要銘柄のブリーフィング' },
      { title: '市場ブリーフ', text: 'リスクとマクロの要約' },
      { title: 'データ解除', text: '広告サポート付きプレビュー案内' },
    ],
  },
};

export function AppFirstRunOnboarding() {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = COPY[locale] ?? COPY.en;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [accepted, setAccepted] = useState(false);
  const isDocumentRoute = pathname?.includes('/app-view/terms') ||
    pathname?.includes('/app-view/privacy') ||
    pathname?.includes('/app-view/onboarding');

  useEffect(() => {
    setMounted(true);
    try {
      setVisible(!isDocumentRoute && window.localStorage.getItem(STORAGE_KEY) !== 'accepted');
    } catch {
      setVisible(false);
    }
  }, [isDocumentRoute]);

  useEffect(() => {
    if (!mounted) return;

    document.documentElement.classList.toggle('app-onboarding-open', visible);

    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;

        const { adManager } = await import('@/services/adManager');
        await adManager.setBannerSuppressed(visible);
      } catch {
        // Web preview or plugin unavailable.
      }
    })();

    return () => {
      cancelled = true;
      document.documentElement.classList.remove('app-onboarding-open');
    };
  }, [mounted, visible]);

  // Re-register the push token on EVERY app launch (not just onboarding). Onboarding
  // runs once, so if the server pruned a device token (e.g. the old APNs env bug) or
  // the token rotated, the device would never come back. This re-posts the current
  // token each launch when permission is already granted (does NOT prompt — the first
  // grant stays with onboarding). Idempotent. Native only → web/App Store unaffected.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;
        const platform = Capacitor.getPlatform();
        // @ts-ignore — @capacitor/push-notifications is installed at native build time
        const PushMod: any = await import('@capacitor/push-notifications');
        const PushNotifications = PushMod.PushNotifications;
        const perm = await PushNotifications.checkPermissions();
        if (perm?.receive !== 'granted' || cancelled) return;

        const postToken = (token: string, attempt = 0) => {
          if (!token) return;
          try { window.localStorage.setItem('signumhq.push.token', token); } catch {}
          fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, platform, locale: resolveAppLocale() }),
          })
            .then(res => { if (!res.ok) throw new Error(`register ${res.status}`); })
            .catch(() => { if (attempt < 4) setTimeout(() => postToken(token, attempt + 1), 2000 * (attempt + 1)); });
        };

        PushNotifications.addListener('registration', (token: { value: string }) => {
          postToken(token.value);
        });
        await PushNotifications.register();
      } catch {
        // web preview / plugin unavailable
      }
    })();
    return () => { cancelled = true; };
  }, [mounted]);

  if (!mounted || !visible || isDocumentRoute) return null;

  const finish = async () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      // If storage is unavailable, close for the current session.
    }

    // Request push notification permissions (native only)
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const platform = Capacitor.getPlatform();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // @ts-ignore — @capacitor/push-notifications is installed at native build time
        const PushMod: any = await import('@capacitor/push-notifications');
        const PushNotifications = PushMod.PushNotifications;

        // The server routes by platform: Android sends the FCM token that the
        // 'registration' event yields, iOS sends the raw APNs hex token and the
        // server pushes to APNs directly with the .p8 key. (FCM->iOS silently
        // failed in this Capacitor+Firebase setup, which is why iOS moved off it.)
        // @capacitor-community/fcm is therefore dead weight in both binaries, but
        // AppDelegate.swift still imports FirebaseCore/FirebaseMessaging through it,
        // so dropping the package breaks the iOS build. Removing it means editing
        // the push-registration path of a live app — worth doing, but only with a
        // real-device push test, which a simulator cannot give us. Left in place.
        const postToken = (token: string, attempt = 0) => {
          if (!token) return;
          try {
            window.localStorage.setItem('signumhq.push.token', token);
          } catch {}
          // Retry with backoff: a single fire-and-forget POST is lost if the
          // first-launch network blips, and onboarding never re-runs — so the
          // device would never register. Retry a few times before giving up.
          fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              platform,
              locale: resolveAppLocale(),
            }),
          })
            .then(res => {
              if (!res.ok) throw new Error(`register ${res.status}`);
            })
            .catch(() => {
              if (attempt < 4) {
                setTimeout(() => postToken(token, attempt + 1), 2000 * (attempt + 1));
              }
            });
        };

        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive === 'granted') {
          // Attach listeners BEFORE register() — register() resolves the token
          // asynchronously, so a listener added afterwards can miss it.
          PushNotifications.addListener('registrationError', (err: { error: string }) => {
            console.warn('[Push] registration error:', err?.error);
          });

          // The 'registration' event value is the device token: an FCM token on
          // Android, the raw APNs token on iOS. The server routes by platform
          // (Android → FCM, iOS → APNs directly), so both just post the value.
          PushNotifications.addListener('registration', (token: { value: string }) => {
            console.log('[Push] token registered (' + platform + ')');
            postToken(token.value);
          });

          await PushNotifications.register();
        }
      }
    } catch {
      // Push not available (web preview or plugin missing)
    }

    setVisible(false);
  };

  const termsHref = `/${locale}/app-view/terms`;
  const privacyHref = `/${locale}/app-view/privacy`;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="app-onboarding-title">
      <div className={styles.shell}>
        <section className={styles.panel}>
          <header className={styles.hero}>
            <span className={styles.kicker}>{copy.kicker}</span>
            <h1 id="app-onboarding-title" className={styles.title}>
              {step === 0 ? copy.legalTitle : copy.alertTitle}
            </h1>
            <p className={styles.subtitle}>
              {step === 0 ? copy.legalSubtitle : copy.alertSubtitle}
            </p>
          </header>

          <div className={styles.body}>
            <p className={styles.stepLabel}>{step === 0 ? copy.legalStep : copy.alertStep}</p>

            {step === 0 ? (
              <>
                <div className={styles.notice}>
                  <p className={styles.noticeTitle}>{copy.legalTitle}</p>
                  <p className={styles.noticeText}>{copy.legalBody}</p>
                </div>
                <ul className={styles.disclaimerList}>
                  {copy.bullets.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <label className={styles.ack}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={event => setAccepted(event.currentTarget.checked)}
                  />
                  <span>{copy.ack}</span>
                </label>
              </>
            ) : (
              <>
                <div className={styles.pillGrid}>
                  {copy.alertPills.map(item => (
                    <div className={styles.pill} key={item.title}>
                      <span className={styles.pillStrong}>{item.title}</span>
                      <span className={styles.pillText}>{item.text}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.notice}>
                  <p className={styles.noticeTitle}>{copy.alertTitle}</p>
                  <p className={styles.noticeText}>{copy.alertBody}</p>
                </div>
              </>
            )}

            <div className={styles.links}>
              <Link href={termsHref}>{copy.terms}</Link>
              <Link href={privacyHref}>{copy.privacy}</Link>
            </div>
          </div>

          <div className={`${styles.actions} ${step === 0 ? styles.actionsSingle : ''}`}>
            {step === 1 && (
              <button type="button" className={styles.ghostButton} onClick={() => setStep(0)}>
                {copy.back}
              </button>
            )}
            <button
              type="button"
              className={styles.primaryButton}
              disabled={step === 0 && !accepted}
              onClick={() => (step === 0 ? setStep(1) : finish())}
            >
              {step === 0 ? copy.continue : copy.start}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
