'use client';

import { Link } from '@/i18n/routing';
import styles from './AppLegalDocument.module.css';

type LocaleKey = 'ko' | 'en' | 'ja';
type DocType = 'terms' | 'privacy';

type Section = {
  title: string;
  body?: string;
  items?: string[];
};

type LegalCopy = {
  back: string;
  badge: string;
  updated: string;
  termsTitle: string;
  privacyTitle: string;
  terms: Section[];
  privacy: Section[];
};

const COPY: Record<LocaleKey, LegalCopy> = {
  ko: {
    back: '뒤로',
    badge: 'SIGNUM HQ APP',
    updated: '최종 업데이트: 2026년 6월',
    termsTitle: '앱 이용약관',
    privacyTitle: '앱 개인정보처리방침',
    terms: [
      {
        title: '서비스 성격',
        body: 'SIGNUM HQ 앱은 교육, 리서치, 시장 데이터 참고용 모바일 앱입니다. 앱의 데이터, 점수, AI 해석, 광고 시청으로 열람하는 리서치는 투자 조언이나 매수/매도 권유가 아닙니다.',
      },
      {
        title: '광고 기반 무료 모델',
        body: 'SIGNUM HQ 앱은 광고 기반으로 무료 제공될 수 있습니다. 보상형 광고는 일부 리서치 영역을 제한된 시간 동안 열람하기 위한 수단이며, 광고 제거 옵션은 광고 노출을 줄이기 위한 기능입니다. 수익 또는 성과를 보장하는 유료 투자 서비스가 아닙니다.',
      },
      {
        title: '앱스토어 및 업데이트',
        body: '이용자는 본 앱을 Apple App Store 및 Google Play Store의 규정에 따라 다운로드하여 사용할 수 있습니다. 데이터 동기화, 보안, 안정성을 위해 최신 버전 업데이트가 요구될 수 있습니다.',
      },
      {
        title: '데이터와 책임',
        items: [
          '실시간 데이터는 외부 데이터 제공자, 네트워크, 캐시 상태에 따라 지연되거나 누락될 수 있습니다.',
          '과거 성과, 백테스트, 지표 신호는 미래 수익이나 손실 회피를 보장하지 않습니다.',
          '모든 투자 판단과 그 결과에 대한 책임은 사용자 본인에게 있습니다.',
        ],
      },
      {
        title: '문의',
        body: '서비스, 데이터, 광고, 앱 이용 관련 문의는 contact@signumhq.com 으로 보내주세요.',
      },
    ],
    privacy: [
      {
        title: '처리할 수 있는 정보',
        items: [
          '앱 사용 정보, 앱 버전, 언어, 기기 OS, 오류 및 진단 정보',
          'AdMob 광고 제공, 측정, 부정 사용 방지를 위한 모바일 광고 식별자(AAID 또는 IDFA)',
          '리포트 생성 및 주요 업데이트 알림 제공을 위한 푸시 알림 토큰',
          '사용자가 문의할 때 제공하는 이메일 주소와 문의 내용',
        ],
      },
      {
        title: '광고 식별자와 동의',
        body: 'iOS에서는 사용자가 허용한 경우 IDFA가 사용될 수 있으며, Android에서는 AAID가 광고 제공 및 측정에 사용될 수 있습니다. 사용자는 각 OS 설정에서 광고 추적 및 맞춤형 광고 설정을 변경할 수 있습니다.',
      },
      {
        title: '푸시 알림',
        body: '푸시 알림은 개인화된 매수/매도 지시가 아니라 리포트 생성, 주요 업데이트, 서비스 공지를 알리기 위한 용도로 사용됩니다. 알림 권한은 기기 설정에서 언제든지 변경할 수 있습니다.',
      },
      {
        title: '제3자 SDK',
        body: '광고 제공을 위해 Google AdMob 등 제3자 SDK가 사용될 수 있으며, 해당 SDK는 광고 제공, 측정, 보안, 부정 사용 방지를 위해 필요한 정보를 처리할 수 있습니다.',
      },
      {
        title: '데이터 보관 및 사용자 권리',
        body: '본 앱은 계정 없이 작동하므로 사용자 프로필을 생성하지 않습니다. 광고 식별자와 진단 정보는 광고 측정 및 부정 사용 방지에 필요한 기간 동안만 보관된 후 삭제되거나 익명화됩니다. 사용자는 기기 설정에서 언제든지 광고 식별자를 초기화하거나 맞춤형 광고를 제한할 수 있으며, 문의와 관련해 제공된 정보의 열람 또는 삭제를 contact@signumhq.com 으로 요청할 수 있습니다.',
      },
      {
        title: '문의',
        body: '개인정보 관련 문의는 contact@signumhq.com 으로 연락해주세요.',
      },
    ],
  },
  en: {
    back: 'Back',
    badge: 'SIGNUM HQ APP',
    updated: 'Last updated: June 2026',
    termsTitle: 'App Terms of Service',
    privacyTitle: 'App Privacy Policy',
    terms: [
      {
        title: 'Nature of the service',
        body: 'SIGNUM HQ is a mobile app for education, research, and market-data reference. Data, scores, AI interpretations, and ad-unlocked research are not investment advice or buy/sell recommendations.',
      },
      {
        title: 'Free ad-supported model',
        body: 'The app may be provided for free with advertising. Rewarded ads may unlock selected research areas for a limited time, and ad-removal options are designed to reduce ad exposure. They are not paid advisory products or return guarantees.',
      },
      {
        title: 'Stores and updates',
        body: 'You may download and use the app under Apple App Store and Google Play Store rules. Updates may be required for data synchronization, security, and stability.',
      },
      {
        title: 'Data and responsibility',
        items: [
          'Real-time data may be delayed, missing, or incomplete because of providers, networks, or cache state.',
          'Past performance, backtests, and indicator signals do not guarantee future returns or loss avoidance.',
          'You are solely responsible for your investment decisions and outcomes.',
        ],
      },
      {
        title: 'Support',
        body: 'For service, data, advertising, or app questions, contact contact@signumhq.com.',
      },
    ],
    privacy: [
      {
        title: 'Information we may process',
        items: [
          'App usage, app version, language, device OS, diagnostics, and error information',
          'Mobile advertising identifiers such as AAID or IDFA for AdMob ad delivery, measurement, and fraud prevention',
          'Push notification tokens for report-generation alerts and important app updates',
          'Email address and message content when you contact support',
        ],
      },
      {
        title: 'Advertising identifiers and consent',
        body: 'On iOS, IDFA may be used when you grant permission. On Android, AAID may be used for ad delivery and measurement. You can change ad tracking and personalized ad settings in your operating system settings.',
      },
      {
        title: 'Push notifications',
        body: 'Push notifications are used for report-generation alerts, important updates, and service notices. They are not personalized buy or sell instructions. You can change notification permissions in your device settings.',
      },
      {
        title: 'Third-party SDKs',
        body: 'Third-party SDKs such as Google AdMob may be used for advertising. These SDKs may process information needed for ad delivery, measurement, security, and fraud prevention.',
      },
      {
        title: 'Data retention and your rights',
        body: 'Because the app works without an account, we do not build user profiles. Advertising identifiers and diagnostics are retained only as long as needed for ad measurement and fraud prevention, then deleted or anonymized. You can reset your advertising identifier or limit personalized ads in your device settings at any time, and you may request access to or deletion of any information provided in a support inquiry by emailing contact@signumhq.com.',
      },
      {
        title: 'Contact',
        body: 'For privacy questions, contact contact@signumhq.com.',
      },
    ],
  },
  ja: {
    back: '戻る',
    badge: 'SIGNUM HQ APP',
    updated: '最終更新: 2026年6月',
    termsTitle: 'アプリ利用規約',
    privacyTitle: 'アプリ・プライバシーポリシー',
    terms: [
      {
        title: 'サービスの性質',
        body: 'SIGNUM HQアプリは、教育、リサーチ、市場データ参照を目的としたモバイルアプリです。データ、スコア、AI解釈、広告視聴で開放されるリサーチは、投資助言や売買推奨ではありません。',
      },
      {
        title: '広告ベースの無料モデル',
        body: '本アプリは広告により無料で提供される場合があります。リワード広告は一部のリサーチ領域を一定時間閲覧するための手段であり、広告削除オプションは広告表示を減らすための機能です。収益や成果を保証する有料助言サービスではありません。',
      },
      {
        title: 'ストアとアップデート',
        body: '利用者はApple App StoreおよびGoogle Play Storeの規約に従って本アプリをダウンロードし、利用できます。データ同期、セキュリティ、安定性のため、最新バージョンへの更新が必要になる場合があります。',
      },
      {
        title: 'データと責任',
        items: [
          'リアルタイムデータは外部データ提供者、ネットワーク、キャッシュ状態により遅延、欠落、不完全となる場合があります。',
          '過去の実績、バックテスト、指標シグナルは将来の収益や損失回避を保証しません。',
          'すべての投資判断とその結果に関する責任は利用者本人にあります。',
        ],
      },
      {
        title: 'お問い合わせ',
        body: 'サービス、データ、広告、アプリ利用に関するお問い合わせは contact@signumhq.com までご連絡ください。',
      },
    ],
    privacy: [
      {
        title: '処理する可能性のある情報',
        items: [
          'アプリ利用情報、アプリバージョン、言語、端末OS、診断情報、エラー情報',
          'AdMob広告の配信、測定、不正利用防止のためのモバイル広告識別子(AAIDまたはIDFA)',
          'レポート生成通知および重要なアップデート通知のためのプッシュ通知トークン',
          'サポートへ連絡する際に提供されるメールアドレスと問い合わせ内容',
        ],
      },
      {
        title: '広告識別子と同意',
        body: 'iOSでは利用者が許可した場合にIDFAが使用されることがあります。AndroidではAAIDが広告配信および測定に使用されることがあります。広告トラッキングやパーソナライズ広告の設定は、各OSの設定から変更できます。',
      },
      {
        title: 'プッシュ通知',
        body: 'プッシュ通知は、個別の売買指示ではなく、レポート生成、重要なアップデート、サービス通知のために使用されます。通知権限は端末設定からいつでも変更できます。',
      },
      {
        title: '第三者SDK',
        body: '広告配信のためにGoogle AdMobなどの第三者SDKが使用される場合があります。これらのSDKは広告配信、測定、セキュリティ、不正利用防止に必要な情報を処理することがあります。',
      },
      {
        title: 'データ保管と利用者の権利',
        body: '本アプリはアカウントなしで動作するため、利用者プロファイルを作成しません。広告識別子および診断情報は、広告測定と不正利用防止に必要な期間のみ保管され、その後削除または匿名化されます。利用者は端末設定でいつでも広告識別子をリセットしたりパーソナライズ広告を制限でき、お問い合わせで提供された情報の閲覧または削除を contact@signumhq.com までご請求いただけます。',
      },
      {
        title: 'お問い合わせ',
        body: 'プライバシーに関するお問い合わせは contact@signumhq.com までご連絡ください。',
      },
    ],
  },
};

function resolveLocale(locale: string): LocaleKey {
  if (locale === 'ko' || locale === 'ja') return locale;
  return 'en';
}

export function AppLegalDocument({ locale, doc, backHref, badgeText }: { locale: string; doc: DocType; backHref?: string; badgeText?: string }) {
  const copy = COPY[resolveLocale(locale)];
  const sections = doc === 'privacy' ? copy.privacy : copy.terms;
  const title = doc === 'privacy' ? copy.privacyTitle : copy.termsTitle;
  const badge = badgeText || copy.badge;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <Link href={(backHref || '/app-view/dash') as never} className={styles.back}>
            {copy.back}
          </Link>
          <span className={styles.badge}>{badge}</span>
        </div>

        <article className={styles.card}>
          <header className={styles.hero}>
            <span className={styles.badge}>{badge}</span>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.updated}>{copy.updated}</p>
          </header>

          <div className={styles.body}>
            {sections.map((section) => (
              <section className={styles.section} key={section.title}>
                <h2>{section.title}</h2>
                {section.body ? <p>{section.body}</p> : null}
                {section.items ? (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
            <section className={styles.section}>
              <h2>SIGNUM HQ, LLC</h2>
              <p>
                <span className={styles.contact}>contact@signumhq.com</span>
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
