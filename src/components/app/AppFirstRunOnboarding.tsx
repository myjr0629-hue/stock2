'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from '@/i18n/routing';
import { resolveAppLocale } from '@/lib/appLocale';
import { readStoredPushPrefs } from '@/lib/push/prefs';
import { markSignalSynced, signalSyncExtras } from '@/lib/app/signalSync';
import dynamic from 'next/dynamic';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import {
  ONB_NUMBERED_STEPS, isNativeShell, onbStepNo, permSrc, stepAfterLegal, stepAfterValue, stepSrc,
  type OnbMode, type OnbStep, type PushResult,
} from '@/lib/app/onboardingConfig';
import { firstRunCopy } from '@/lib/app/firstRunCopy';
import { loadOnbMode, useOnbMode } from './onboardingMode';
// 가치·알림 단계(카드·시세·레벨·AI 줄)는 이 오버레이를 «이미 마친 기기»(대부분의 사용자)에는 한 바이트도 싣지 않도록 필요할 때만 불러온다 —
// 법적 고지의 동의 체크를 누르면 ValuePrefetch 가 같은 조각을 미리 불러오고 데이터도 미리 받는다.
const FirstRunValueStep = dynamic(() => import('./FirstRunValueStep').then((m) => m.FirstRunValueStep), { ssr: false, loading: () => null });
const FirstRunNotifStep = dynamic(() => import('./FirstRunValueStep').then((m) => m.FirstRunNotifStep), { ssr: false, loading: () => null });
const ValuePrefetch = dynamic(() => import('./FirstRunValueStep').then((m) => m.ValuePrefetch), { ssr: false, loading: () => null });
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

/**
 * 푸시 권한을 요청하고, 허용되면 토큰을 서버에 등록한다(네이티브만). 옛 흐름의 [시작하기]와 새 흐름의 [알림 받기]가 같은 함수를 쓴다.
 * 돌려주는 값: 'granted' · 'denied' · 'na'(네이티브가 아니거나 플러그인이 없다) — 계측(onb_perm)에만 쓴다.
 * (finish() 안에 있던 코드를 그대로 옮겼다 — 동작은 같다.)
 */
async function requestPushAndRegister(): Promise<PushResult> {
  let result: PushResult = 'na';
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
        // ★2026-10-13 «내 종목 이상 신호»: 기기의 내 종목 이름 목록(최대 100)·시간대·알림 권한(허용됨)을 같은 등록 POST 에 얹는다(lib/app/signalSync)
        const extras = signalSyncExtras();
        fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            platform,
            locale: resolveAppLocale(),
            preferences: readStoredPushPrefs() ?? undefined,
            ...extras,
            notifPerm: true,
          }),
        })
          .then(res => {
            if (!res.ok) throw new Error(`register ${res.status}`);
            markSignalSynced(extras.tickers, token);
          })
          .catch(() => {
            if (attempt < 4) {
              setTimeout(() => postToken(token, attempt + 1), 2000 * (attempt + 1));
            }
          });
      };

      const permResult = await PushNotifications.requestPermissions();
      result = permResult.receive === 'granted' ? 'granted' : 'denied';
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
  return result;
}

export function AppFirstRunOnboarding() {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = COPY[locale] ?? COPY.en;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<OnbStep>('legal');
  const [accepted, setAccepted] = useState(false);
  // 첫 실행 «가치 먼저»(v2) — 끄기 스위치(레디스 onb2:off)를 읽는다. 아직 모르면 null → 첫 그림은 v2 로 가정하고,
  // 법적 고지 [계속]을 누를 때 읽기가 끝나기를 기다린다(onLegalNext). 못 읽으면 옛 흐름(legacy).
  const [advancing, setAdvancing] = useState(false);
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
        if (perm?.receive !== 'granted') {
          // ★2026-10-13 시스템 알림 권한이 꺼져 있다고만 서버에 알린다(권한을 묻지 않는다) — 서버는 이 기기에 «내 종목 이상 신호»를 보내지 않는다.
          //   저장된 토큰이 있을 때만(옛 등록 기기). 서버는 모르는 토큰이면 새로 만들지 않는다.
          try {
            const saved = window.localStorage.getItem('signumhq.push.token');
            if (saved && !cancelled) {
              fetch('/api/push/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: saved, notifPerm: false }) }).catch(() => {});
            }
          } catch { /* 저장소 없음 */ }
          return;
        }
        if (cancelled) return;

        const postToken = (token: string, attempt = 0) => {
          if (!token) return;
          try { window.localStorage.setItem('signumhq.push.token', token); } catch {}
          // ★2026-10-13 내 종목 이름 목록·시간대·알림 권한(허용됨)도 함께 — 서버가 «내 종목 이상 신호»에 쓴다(lib/app/signalSync)
          const extras = signalSyncExtras();
          fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // ★2026-10-12 저장된 알림 선호(설정에서 만졌을 때만)를 함께 — 서버는 새 토큰만 기본값 true, 기존 선호는 지킨다(lib/push/prefs)
            body: JSON.stringify({ token, platform, locale: resolveAppLocale(), preferences: readStoredPushPrefs() ?? undefined, ...extras, notifPerm: true }),
          })
            .then(res => { if (!res.ok) throw new Error(`register ${res.status}`); markSignalSynced(extras.tickers, token); })
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

  // 설정은 «보이는 동안만» 읽는다(이미 마친 기기는 요청 0). 동의 체크를 누르면 바로 가치 단계 데이터 미리받기가 시작된다(아래 prefetch)
  const cfgMode: OnbMode | null = useOnbMode(mounted && visible && !isDocumentRoute);
  const mode: OnbMode = cfgMode ?? 'v2';

  // 계측: 단계가 보였다 — 실행당 단계마다 한 번(하루 합계만 · 식별자 없음)
  const shownSteps = useRef(new Set<string>());
  const legalDoneCounted = useRef(false);
  useEffect(() => {
    if (!mounted || !visible || isDocumentRoute) return;
    const src = stepSrc(step, mode);
    if (shownSteps.current.has(src)) return;
    shownSteps.current.add(src);
    trackFunnel('onb_show', { src });
  }, [mounted, visible, isDocumentRoute, step, mode]);

  if (!mounted || !visible || isDocumentRoute) return null;

  const wl: 'ko' | 'en' | 'ja' = locale === 'ko' || locale === 'ja' ? locale : 'en';

  /** 첫 안내를 마쳤다고 적고 닫는다 — 옛 흐름의 finish() 첫 줄과 같은 저장 */
  const markDone = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      // If storage is unavailable, close for the current session.
    }
  };

  // ── 옛 흐름(legacy)의 [시작하기] — 저장 → 푸시 권한 요청 → 닫기. 순서·동작은 그대로(계측만 추가) ──
  const finish = async () => {
    markDone();
    trackFunnel('onb_done', { src: 'onb_oldalert' });
    const r = await requestPushAndRegister();
    const ps = permSrc(r);
    if (ps) trackFunnel('onb_perm', { src: ps });
    setVisible(false);
  };

  // ── 새 흐름(v2) ──
  // 법적 고지 [계속] — 끄기 스위치를 아직 못 읽었으면(최대 5초) 읽고 나서 간다. 옛 흐름이면 옛 2/2 알림 단계로.
  const onLegalNext = async () => {
    if (advancing) return;
    setAdvancing(true);
    // 옛 흐름에서 «이전»으로 돌아왔다가 다시 [계속]을 눌러도 한 번만 센다
    if (!legalDoneCounted.current) { legalDoneCounted.current = true; trackFunnel('onb_done', { src: 'onb_legal' }); }
    const m = cfgMode ?? (await loadOnbMode());
    setAdvancing(false);
    setStep(stepAfterLegal(m));
  };
  // 가치 단계가 끝났다(담았거나 건너뛰었다) — 푸시 권한이 있는 네이티브는 알림 단계로, 아니면 끝
  const onValueFinish = () => {
    const next = stepAfterValue(isNativeShell());
    if (next === 'done') { markDone(); setVisible(false); return; }
    setStep(next);
  };
  // 알림 단계 [알림 받기] — 이때 OS 권한 창이 뜬다. 거절해도 그대로 앱으로 들어간다
  const onNotifAllow = async () => {
    if (advancing) return;
    setAdvancing(true);
    markDone();
    trackFunnel('onb_done', { src: 'onb_notif' });
    const r = await requestPushAndRegister();
    const ps = permSrc(r);
    if (ps) trackFunnel('onb_perm', { src: ps });
    setVisible(false);
  };
  // 알림 단계 [나중에] — 권한 창을 열지 않는다(설정에서 언제든 켤 수 있다)
  const onNotifLater = () => {
    trackFunnel('onb_skip', { src: 'onb_notif' });
    markDone();
    setVisible(false);
  };

  const termsHref = `/${locale}/app-view/terms`;
  const privacyHref = `/${locale}/app-view/privacy`;

  // 새 흐름의 가치·알림 단계는 머리·본문·붙박이 버튼 줄을 스스로 그린다(FirstRunValueStep.tsx)
  if (step === 'value' || step === 'notif') {
    return (
      <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="app-onboarding-title">
        <div className={styles.shell}>
          <section className={styles.panel}>
            {step === 'value' ? (
              <FirstRunValueStep
                loc={wl}
                active
                stepLabel={firstRunCopy(wl).value.stepLabel(onbStepNo('value'), ONB_NUMBERED_STEPS)}
                onFinish={onValueFinish}
              />
            ) : (
              <FirstRunNotifStep
                loc={wl}
                stepLabel={firstRunCopy(wl).notif.stepLabel()}
                busy={advancing}
                onAllow={onNotifAllow}
                onLater={onNotifLater}
              />
            )}
          </section>
        </div>
      </div>
    );
  }

  const legal = step === 'legal';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="app-onboarding-title">
      <div className={styles.shell}>
        <section className={styles.panel}>
          <header className={styles.hero}>
            <span className={styles.kicker}>{copy.kicker}</span>
            <h1 id="app-onboarding-title" className={styles.title}>
              {legal ? copy.legalTitle : copy.alertTitle}
            </h1>
            <p className={styles.subtitle}>
              {legal ? copy.legalSubtitle : copy.alertSubtitle}
            </p>
          </header>

          <div className={styles.body}>
            <p className={styles.stepLabel}>{legal ? copy.legalStep : copy.alertStep}</p>

            {legal ? (
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

          <div className={`${styles.actions} ${legal ? styles.actionsSingle : ''}`}>
            {!legal && (
              <button type="button" className={styles.ghostButton} onClick={() => setStep('legal')}>
                {copy.back}
              </button>
            )}
            <button
              type="button"
              className={styles.primaryButton}
              disabled={legal && (!accepted || advancing)}
              onClick={() => (legal ? onLegalNext() : finish())}
            >
              {legal ? copy.continue : copy.start}
            </button>
          </div>
        </section>
      </div>
      {/* 동의 체크를 누르면 가치 단계에 쓸 데이터(인기 12종목의 시세·레벨·AI 한 줄)를 미리 받는다 — 화면에는 아무것도 그리지 않는다 */}
      {legal && accepted && cfgMode === 'v2' && <ValuePrefetch loc={wl} />}
    </div>
  );
}
