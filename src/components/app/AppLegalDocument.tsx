'use client';

import { Link } from '@/i18n/routing';
import { hasRealUnits, type AppKey } from '@/config/admob';
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
  // WIM (Why'd It Move?) variant — v1 has NO ads, NO push, NO account, NO
  // tracking; learning is stored on-device only. The shared SIGNUM/UC copy above
  // is ad-based and would be FALSE for WIM (and contradicts its "Data Not
  // Collected" store declaration), so WIM renders this accurate variant instead.
  wim: { updated: string; terms: Section[]; privacy: Section[] };
  uc: { updated: string; terms: Section[]; privacy: Section[] };
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
    // Undercurrent 변형 — UC 1.0.1 실측 기준(2026-08-10): 계정 없음 · 광고 미게재
    // (ADS_LIVE=false) · 푸시 플러그인 없음(앱 내 «곧 제공» 표기) · 인앱 구매 없음 ·
    // 인앱 평가만 존재. 공용 SIGNUM 카피는 광고·푸시를 전제하므로 UC 에는 «거짓»이다.
    uc: {
      updated: '최종 업데이트: 2026년 8월',
      terms: [
        {
          title: '서비스 성격',
          body: 'Undercurrent는 뉴스와 돈의 흐름을 나란히 보여주는 리서치·교육용 모바일 앱입니다. 에디션, 괴리 스코어, AI 요약은 정보 제공 목적이며 투자 조언이나 매수/매도 권유가 아닙니다.',
        },
        {
          title: '무료 이용',
          body: '본 앱은 계정 가입 없이 무료로 제공됩니다. 현재 버전에는 인앱 구매가 없으며 광고도 게재하지 않습니다.',
        },
        {
          title: '앱스토어 및 업데이트',
          body: '이용자는 본 앱을 Apple App Store 및 Google Play Store의 규정에 따라 다운로드하여 사용할 수 있습니다. 보안과 안정성을 위해 최신 버전 업데이트가 요구될 수 있습니다.',
        },
        {
          title: '데이터와 책임',
          items: [
            '시장 데이터와 뉴스는 외부 제공자, 네트워크, 캐시 상태에 따라 지연되거나 누락될 수 있습니다.',
            '괴리 판정과 과거 기록은 미래의 수익이나 손실 회피를 보장하지 않습니다.',
            '모든 투자 판단과 그 결과에 대한 책임은 사용자 본인에게 있습니다.',
          ],
        },
        {
          title: '문의',
          body: '서비스나 앱 이용 관련 문의는 contact@signumhq.com 으로 보내주세요.',
        },
      ],
      privacy: [
        {
          title: '계정 없음 · 개인정보를 수집하지 않습니다',
          body: '본 앱은 계정이 없으며 이름·이메일 등 개인을 식별하는 정보를 수집하지 않습니다. 읽은 에디션과 언어 설정 같은 이용 상태는 기기 내부에만 저장되며 앱을 삭제하면 함께 삭제됩니다.',
        },
        {
          title: '서버와 주고받는 정보',
          body: '에디션과 시장 데이터를 불러오기 위해 당사 서버에 표준 네트워크 요청이 전송됩니다. 이 과정에서 앱 버전·언어·기기 OS 같은 기술 정보가 포함될 수 있으나 개인을 식별하지 않습니다.',
        },
        {
          title: '광고·추적 없음',
          body: '현재 버전은 광고를 게재하지 않으며 광고 식별자(IDFA/AAID)를 수집하거나 사용자 추적을 하지 않습니다. 향후 광고를 도입하는 경우 본 방침과 스토어의 개인정보 선언을 먼저 갱신하고 안내드립니다.',
        },
        {
          title: '푸시 알림 없음',
          body: '현재 버전은 푸시 알림을 보내지 않으며 푸시 토큰을 수집하지 않습니다. 앱 내 «곧 제공» 표기는 향후 계획을 뜻하며, 실제 도입 시 별도 동의를 받고 본 방침을 갱신합니다.',
        },
        {
          title: '앱 평가 요청',
          body: '앱 내 평가 요청은 Apple·Google이 제공하는 표준 기능을 사용하며, 이 과정에서 당사가 이용자의 평가 내용이나 개인정보를 수집하지 않습니다. 평가에 대한 보상은 제공하지 않습니다.',
        },
        {
          title: '문의 시 제공되는 정보',
          body: '이메일 등으로 문의하시는 경우 제공하신 이메일 주소와 문의 내용은 답변 목적으로만 사용됩니다.',
        },
        {
          title: '데이터 보관 및 이용자 권리',
          body: '기기에 저장된 이용 상태는 앱 삭제 또는 기기 설정에서 언제든 지울 수 있습니다. 문의와 관련해 제공된 정보의 열람 또는 삭제는 contact@signumhq.com 으로 요청할 수 있습니다.',
        },
        {
          title: '문의',
          body: '개인정보 관련 문의는 contact@signumhq.com 으로 연락해주세요.',
        },
      ],
    },
    wim: {
      updated: '최종 업데이트: 2026년 7월',
      terms: [
        {
          title: '서비스 성격',
          body: 'Why’d It Move?는 실제 시장 데이터로 시장을 배우는 교육용 퀴즈 앱입니다. 문제, 해설, 점수, AI 설명은 학습 목적의 정보이며 투자 조언이나 매수/매도 권유가 아닙니다.',
        },
        {
          title: '무료 이용',
          body: '본 앱은 계정 가입 없이 무료로 제공됩니다. 현재 버전에는 광고와 인앱 구매가 없습니다.',
        },
        {
          title: '앱스토어 및 업데이트',
          body: '이용자는 본 앱을 Apple App Store 및 Google Play Store의 규정에 따라 다운로드하여 사용할 수 있습니다. 보안과 안정성을 위해 최신 버전 업데이트가 요구될 수 있습니다.',
        },
        {
          title: '학습 기록과 책임',
          items: [
            '학습 진행, 정답 기록, 스트릭 등은 기기에만 저장되며 앱을 삭제하면 함께 삭제됩니다.',
            '시장 데이터는 외부 제공자, 네트워크, 캐시 상태에 따라 지연되거나 누락될 수 있습니다.',
            '과거 데이터와 퀴즈 결과는 미래의 수익이나 손실 회피를 보장하지 않으며, 모든 투자 판단과 결과에 대한 책임은 사용자 본인에게 있습니다.',
          ],
        },
        {
          title: '문의',
          body: '서비스나 앱 이용 관련 문의는 contact@signumhq.com 으로 보내주세요.',
        },
      ],
      privacy: [
        {
          title: '계정 없음 · 개인정보를 수집하지 않습니다',
          body: '본 앱은 계정이 없으며 이름·이메일 등 개인을 식별하는 정보를 수집하지 않습니다. 학습 기록(푼 문제, 정답, 스트릭, 열람한 용어)은 오직 기기 내부에만 저장됩니다.',
        },
        {
          title: '서버와 주고받는 정보',
          body: '퀴즈와 시장 데이터를 불러오기 위해 당사 서버에 표준 네트워크 요청이 전송됩니다. 이 과정에서 앱 버전·언어·기기 OS 같은 기술 정보가 포함될 수 있으나 개인을 식별하지 않습니다.',
        },
        {
          title: '광고·추적 없음',
          body: '현재 버전은 광고를 게재하지 않으며, 광고 식별자(IDFA/AAID), 사용자 추적, 분석 SDK를 사용하지 않습니다.',
        },
        {
          title: '푸시 알림',
          body: 'iOS에서는 오늘의 새 퀴즈가 준비되면 하루 한 번 알려드리기 위해 기기 푸시 토큰을 사용합니다. 안드로이드 버전은 현재 알림을 보내지 않습니다. 알림은 앱에서 동의하신 경우에만 켜지며, 앱 내 설정의 알림 스위치 또는 기기 설정에서 언제든 끌 수 있습니다. 알림을 끄면 저장된 푸시 토큰은 삭제됩니다.',
        },
        {
          title: '문의 시 제공되는 정보',
          body: '이메일 등으로 문의하시는 경우 제공하신 이메일 주소와 문의 내용은 답변 목적으로만 사용됩니다.',
        },
        {
          title: '데이터 보관 및 이용자 권리',
          body: '기기에 저장된 학습 기록은 앱 삭제 또는 기기 설정에서 언제든 지울 수 있습니다. 문의와 관련해 제공된 정보의 열람 또는 삭제는 contact@signumhq.com 으로 요청할 수 있습니다.',
        },
        {
          title: '문의',
          body: '개인정보 관련 문의는 contact@signumhq.com 으로 연락해주세요.',
        },
      ],
    },
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
    uc: {
      updated: 'Last updated: August 2026',
      terms: [
        {
          title: 'What this app is',
          body: 'Undercurrent is a research and education app that puts the news next to the money. Editions, divergence scores and AI summaries are informational only and are not investment advice or a recommendation to buy or sell.',
        },
        {
          title: 'Free to use',
          body: 'The app is free and requires no account. This version contains no in-app purchases and serves no ads.',
        },
        {
          title: 'App stores and updates',
          body: 'You may download and use this app under the terms of the Apple App Store and Google Play Store. Updating to the latest version may be required for security and stability.',
        },
        {
          title: 'Data and responsibility',
          items: [
            'Market data and news can be delayed or incomplete depending on third-party providers, network conditions and caching.',
            'Divergence outcomes and past records do not guarantee future gains or the avoidance of losses.',
            'You are solely responsible for your own investment decisions and their results.',
          ],
        },
        {
          title: 'Contact',
          body: 'For questions about the service, email contact@signumhq.com.',
        },
      ],
      privacy: [
        {
          title: 'No account, no personal data',
          body: 'The app has no accounts and does not collect personally identifying information such as your name or email. Usage state such as which editions you have read and your language preference is stored only on your device and is removed when you delete the app.',
        },
        {
          title: 'What is sent to our servers',
          body: 'Standard network requests are sent to our servers to load editions and market data. These may include technical details such as app version, language and device OS, none of which identify you personally.',
        },
        {
          title: 'No ads, no tracking',
          body: 'This version serves no advertising, collects no advertising identifiers (IDFA/AAID), and does not track users. If advertising is introduced later, this policy and the store privacy declarations will be updated first.',
        },
        {
          title: 'No push notifications',
          body: 'This version does not send push notifications and does not collect push tokens. The in-app "coming soon" label refers to a future plan; if it ships, we will ask for consent separately and update this policy.',
        },
        {
          title: 'Rating prompt',
          body: 'The in-app rating prompt uses the standard Apple and Google mechanisms. We do not receive your review content or personal data through it, and no reward is offered for leaving a rating.',
        },
        {
          title: 'Information you send us',
          body: 'If you contact us by email, the address and the contents of your message are used only to answer you.',
        },
        {
          title: 'Retention and your rights',
          body: 'Usage state stored on your device can be cleared at any time by deleting the app or clearing app data. To access or delete information you sent us, email contact@signumhq.com.',
        },
        {
          title: 'Contact',
          body: 'For privacy questions, email contact@signumhq.com.',
        },
      ],
    },
    wim: {
      updated: 'Last updated: July 2026',
      terms: [
        {
          title: 'Nature of the service',
          body: 'Why’d It Move? is an educational quiz app that teaches markets using real market data. Questions, explanations, scores, and AI notes are educational information — not investment advice or buy/sell recommendations.',
        },
        {
          title: 'Free to use',
          body: 'The app is provided for free without an account. This version contains no ads and no in-app purchases.',
        },
        {
          title: 'Stores and updates',
          body: 'You may download and use the app under Apple App Store and Google Play Store rules. Updates may be required for security and stability.',
        },
        {
          title: 'Your records and responsibility',
          items: [
            'Learning progress, answer records, and streaks are stored only on your device and are removed when you delete the app.',
            'Market data may be delayed, missing, or incomplete depending on providers, networks, or cache state.',
            'Past data and quiz results do not guarantee future returns or loss avoidance; you are solely responsible for your own investment decisions and outcomes.',
          ],
        },
        {
          title: 'Support',
          body: 'For service or app questions, contact contact@signumhq.com.',
        },
      ],
      privacy: [
        {
          title: 'No account, no personal data collected',
          body: 'The app has no account and does not collect personally identifying information such as your name or email. Your learning records (solved questions, correct answers, streaks, viewed terms) are stored only on your device.',
        },
        {
          title: 'Information exchanged with our servers',
          body: 'To load quizzes and market data, standard network requests are sent to our servers. These may include technical information such as app version, language, and device OS, and do not identify you personally.',
        },
        {
          title: 'No ads or tracking',
          body: 'This version does not display ads and does not use advertising identifiers (IDFA/AAID), user tracking, or analytics SDKs.',
        },
        {
          title: 'Push notifications',
          body: 'On iOS, a device push token is used to send one daily alert when a new quiz is ready. The Android version does not send notifications at this time. Notifications turn on only when you opt in, and you can disable them anytime with the notification switch in the app’s settings or in your device settings. Turning them off deletes the stored push token.',
        },
        {
          title: 'Information you provide in inquiries',
          body: 'If you contact us, the email address and message you provide are used only to respond to your inquiry.',
        },
        {
          title: 'Data retention and your rights',
          body: 'Learning records stored on your device can be cleared at any time by deleting the app or via device settings. To access or delete information provided in a support inquiry, email contact@signumhq.com.',
        },
        {
          title: 'Contact',
          body: 'For privacy questions, contact contact@signumhq.com.',
        },
      ],
    },
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
    uc: {
      updated: '最終更新: 2026年8月',
      terms: [
        {
          title: 'サービスの性質',
          body: 'Undercurrent はニュースとお金の流れを並べて見るリサーチ・教育用アプリです。エディション、乖離スコア、AI要約は情報提供が目的であり、投資助言や売買の推奨ではありません。',
        },
        {
          title: '無料での利用',
          body: '本アプリはアカウント登録なしで無料で提供されます。現行バージョンにアプリ内購入はなく、広告も表示しません。',
        },
        {
          title: 'アプリストアと更新',
          body: 'Apple App Store および Google Play ストアの規定に従って本アプリをダウンロードし利用できます。セキュリティと安定性のため最新版への更新が必要になる場合があります。',
        },
        {
          title: 'データと責任',
          items: [
            '市場データとニュースは、外部提供元・ネットワーク・キャッシュの状態により遅延または欠落することがあります。',
            '乖離の判定や過去の記録は、将来の利益や損失回避を保証するものではありません。',
            'すべての投資判断とその結果についての責任は利用者ご自身にあります。',
          ],
        },
        {
          title: 'お問い合わせ',
          body: 'サービスに関するお問い合わせは contact@signumhq.com までご連絡ください。',
        },
      ],
      privacy: [
        {
          title: 'アカウントなし・個人情報を収集しません',
          body: '本アプリにアカウントはなく、氏名やメールアドレスなど個人を特定する情報を収集しません。読んだエディションや言語設定などの利用状態は端末内にのみ保存され、アプリを削除すると消去されます。',
        },
        {
          title: 'サーバーとのやり取り',
          body: 'エディションと市場データを取得するため、当社サーバーへ標準的なネットワークリクエストが送信されます。アプリのバージョン・言語・OS などの技術情報が含まれる場合がありますが、個人を特定しません。',
        },
        {
          title: '広告・トラッキングなし',
          body: '現行バージョンは広告を表示せず、広告識別子（IDFA/AAID）の収集やユーザーのトラッキングを行いません。将来的に広告を導入する場合は、本方針とストアのプライバシー申告を先に更新しご案内します。',
        },
        {
          title: 'プッシュ通知なし',
          body: '現行バージョンはプッシュ通知を送信せず、プッシュトークンを収集しません。アプリ内の「近日提供」表示は今後の予定を示すもので、実装時には別途同意を取得し本方針を更新します。',
        },
        {
          title: '評価のお願い',
          body: 'アプリ内の評価リクエストは Apple・Google の標準機能を使用します。その過程で当社がレビュー内容や個人情報を取得することはなく、評価に対する報酬も提供しません。',
        },
        {
          title: 'お問い合わせ時にご提供いただく情報',
          body: 'メール等でお問い合わせいただいた場合、ご提供のメールアドレスと内容は回答の目的にのみ使用します。',
        },
        {
          title: 'データの保管と利用者の権利',
          body: '端末に保存された利用状態は、アプリの削除または端末設定からいつでも消去できます。お問い合わせに関して提供された情報の開示・削除は contact@signumhq.com へご請求ください。',
        },
        {
          title: 'お問い合わせ',
          body: 'プライバシーに関するお問い合わせは contact@signumhq.com までご連絡ください。',
        },
      ],
    },
    wim: {
      updated: '最終更新: 2026年7月',
      terms: [
        {
          title: 'サービスの性質',
          body: 'Why’d It Move?は、実際の市場データで市場を学ぶ教育用クイズアプリです。問題、解説、スコア、AIの説明は学習目的の情報であり、投資助言や売買推奨ではありません。',
        },
        {
          title: '無料での利用',
          body: '本アプリはアカウント登録なしで無料で提供されます。現在のバージョンには広告およびアプリ内課金はありません。',
        },
        {
          title: 'ストアとアップデート',
          body: '利用者はApple App StoreおよびGoogle Play Storeの規約に従って本アプリをダウンロードし、利用できます。セキュリティと安定性のため、最新バージョンへの更新が必要になる場合があります。',
        },
        {
          title: '学習記録と責任',
          items: [
            '学習の進捗、正解記録、ストリークなどは端末内にのみ保存され、アプリを削除すると一緒に削除されます。',
            '市場データは外部提供者、ネットワーク、キャッシュ状態により遅延、欠落、不完全となる場合があります。',
            '過去のデータやクイズ結果は将来の収益や損失回避を保証せず、すべての投資判断とその結果に関する責任は利用者本人にあります。',
          ],
        },
        {
          title: 'お問い合わせ',
          body: 'サービスやアプリ利用に関するお問い合わせは contact@signumhq.com までご連絡ください。',
        },
      ],
      privacy: [
        {
          title: 'アカウントなし・個人情報を収集しません',
          body: '本アプリにはアカウントがなく、氏名やメールアドレスなど個人を識別する情報を収集しません。学習記録(解いた問題、正解、ストリーク、閲覧した用語)は端末内にのみ保存されます。',
        },
        {
          title: 'サーバーとやり取りする情報',
          body: 'クイズや市場データを取得するため、当社サーバーへ標準的なネットワークリクエストが送信されます。この際、アプリバージョン・言語・端末OSなどの技術情報が含まれる場合がありますが、個人を識別しません。',
        },
        {
          title: '広告・トラッキングなし',
          body: '現在のバージョンは広告を表示せず、広告識別子(IDFA/AAID)、ユーザートラッキング、分析SDKを使用しません。',
        },
        {
          title: 'プッシュ通知',
          body: 'iOS では、新しいクイズが準備できたときに1日1回お知らせするため、端末のプッシュトークンを使用します。Android 版は現在、通知を送信しません。通知はアプリで同意した場合のみ有効になり、アプリ内の設定にある通知スイッチ、または端末設定からいつでもオフにできます。オフにすると保存されたプッシュトークンは削除されます。',
        },
        {
          title: 'お問い合わせで提供される情報',
          body: 'お問い合わせいただく場合、提供されたメールアドレスと内容は返信の目的にのみ使用されます。',
        },
        {
          title: 'データの保管と利用者の権利',
          body: '端末に保存された学習記録は、アプリの削除または端末設定からいつでも消去できます。お問い合わせに関する情報の閲覧・削除は contact@signumhq.com までご請求いただけます。',
        },
        {
          title: 'お問い合わせ',
          body: 'プライバシーに関するお問い合わせは contact@signumhq.com までご連絡ください。',
        },
      ],
    },
  },
};

function resolveLocale(locale: string): LocaleKey {
  if (locale === 'ko' || locale === 'ja') return locale;
  return 'en';
}


// ============================================================================
// 광고가 «실제로» 켜졌을 때만 갈아끼우는 문장
// ----------------------------------------------------------------------------
// 방침이 사실과 어긋나는 사고를 «구조적으로» 막는다. 아래 두 문장은 광고를 켜는
// 스위치(config/admob.ts 의 REAL_UNIT_IDS)와 같은 조건으로 바뀌므로, 유닛을
// 채워 배포하는 순간 광고와 방침이 «같은 배포에서» 함께 바뀐다.
// 사람이 기억해서 따로 고치는 구조였으면 또 어긋났을 것이다.
//
// ⚠️ 스토어의 App Privacy / 데이터 안전성 선언은 콘솔이라 여전히 «수동»이다.
//    유닛을 켜기 전에 그쪽부터 맞춰야 한다(.agent/NOW.md A1·A2).
// ============================================================================
type AdSwap = { freeFrom: string; freeTo: string; noAdsTitle: string; adsSection: Section };

const ADS_ON: Record<LocaleKey, Record<'uc' | 'wim', AdSwap>> = {
  ko: {
    uc: {
      freeFrom: '본 앱은 계정 가입 없이 무료로 제공됩니다. 현재 버전에는 인앱 구매가 없으며 광고도 게재하지 않습니다.',
      freeTo: '본 앱은 계정 가입 없이 무료로 제공되며, 광고를 통해 운영됩니다. 현재 버전에는 인앱 구매가 없습니다.',
      noAdsTitle: '광고·추적 없음',
      adsSection: {
        title: '광고와 광고 식별자',
        body: '본 앱은 Google AdMob 광고를 게재합니다. 광고 제공·측정·부정 사용 방지를 위해 모바일 광고 식별자(iOS의 IDFA, Android의 AAID)가 사용될 수 있습니다. iOS에서는 사용자가 추적을 허용한 경우에만 IDFA가 사용됩니다. 광고 식별자는 기기 설정에서 언제든 초기화하거나 맞춤형 광고를 제한할 수 있으며, 유럽경제지역·영국 사용자는 앱 설정의 「광고 개인정보 설정」에서 동의를 언제든 변경하거나 철회할 수 있습니다.',
      },
    },
    wim: {
      freeFrom: '본 앱은 계정 가입 없이 무료로 제공됩니다. 현재 버전에는 광고와 인앱 구매가 없습니다.',
      freeTo: '본 앱은 계정 가입 없이 무료로 제공되며, 광고를 통해 운영됩니다. 현재 버전에는 인앱 구매가 없습니다.',
      noAdsTitle: '광고·추적 없음',
      adsSection: {
        title: '광고와 광고 식별자',
        body: '본 앱은 Google AdMob 광고를 게재합니다. 광고 제공·측정·부정 사용 방지를 위해 모바일 광고 식별자(iOS의 IDFA, Android의 AAID)가 사용될 수 있습니다. iOS에서는 사용자가 추적을 허용한 경우에만 IDFA가 사용됩니다. 광고 식별자는 기기 설정에서 언제든 초기화하거나 맞춤형 광고를 제한할 수 있으며, 유럽경제지역·영국 사용자는 앱 설정에서 동의를 언제든 변경하거나 철회할 수 있습니다. 학습 기록은 기기에만 저장되며 광고에 사용되지 않습니다.',
      },
    },
  },
  en: {
    uc: {
      freeFrom: 'The app is free and requires no account. This version contains no in-app purchases and serves no ads.',
      freeTo: 'The app is free, requires no account, and is supported by advertising. This version contains no in-app purchases.',
      noAdsTitle: 'No ads, no tracking',
      adsSection: {
        title: 'Advertising and advertising identifiers',
        body: 'This app serves Google AdMob advertising. A mobile advertising identifier (IDFA on iOS, AAID on Android) may be used for ad delivery, measurement, and fraud prevention. On iOS the IDFA is used only if you allow tracking. You can reset the advertising identifier or limit personalized ads in your device settings at any time, and users in the EEA and UK can change or withdraw consent at any time from “Ad privacy settings” in the app.',
      },
    },
    wim: {
      freeFrom: 'The app is provided for free without an account. This version contains no ads and no in-app purchases.',
      freeTo: 'The app is provided for free without an account and is supported by advertising. This version contains no in-app purchases.',
      noAdsTitle: 'No ads or tracking',
      adsSection: {
        title: 'Advertising and advertising identifiers',
        body: 'This app serves Google AdMob advertising. A mobile advertising identifier (IDFA on iOS, AAID on Android) may be used for ad delivery, measurement, and fraud prevention. On iOS the IDFA is used only if you allow tracking. You can reset the advertising identifier or limit personalized ads in your device settings at any time, and users in the EEA and UK can change or withdraw consent at any time in the app settings. Your learning progress stays on the device and is not used for advertising.',
      },
    },
  },
  ja: {
    uc: {
      freeFrom: '本アプリはアカウント登録なしで無料で提供されます。現行バージョンにアプリ内購入はなく、広告も表示しません。',
      freeTo: '本アプリはアカウント登録なしで無料で提供され、広告により運営されています。現行バージョンにアプリ内購入はありません。',
      noAdsTitle: '広告・トラッキングなし',
      adsSection: {
        title: '広告と広告識別子',
        body: '本アプリは Google AdMob の広告を表示します。広告配信・測定・不正利用防止のため、モバイル広告識別子（iOS の IDFA、Android の AAID）が使用される場合があります。iOS では利用者がトラッキングを許可した場合にのみ IDFA が使用されます。広告識別子は端末の設定からいつでもリセットまたはパーソナライズ広告の制限ができ、EEA・英国の利用者はアプリ設定の「広告プライバシー設定」からいつでも同意を変更・撤回できます。',
      },
    },
    wim: {
      freeFrom: '本アプリはアカウント登録なしで無料で提供されます。現在のバージョンには広告およびアプリ内課金はありません。',
      freeTo: '本アプリはアカウント登録なしで無料で提供され、広告により運営されています。現在のバージョンにアプリ内課金はありません。',
      noAdsTitle: '広告・トラッキングなし',
      adsSection: {
        title: '広告と広告識別子',
        body: '本アプリは Google AdMob の広告を表示します。広告配信・測定・不正利用防止のため、モバイル広告識別子（iOS の IDFA、Android の AAID）が使用される場合があります。iOS では利用者がトラッキングを許可した場合にのみ IDFA が使用されます。広告識別子は端末の設定からいつでもリセットまたはパーソナライズ広告の制限ができ、EEA・英国の利用者はアプリ設定からいつでも同意を変更・撤回できます。学習の記録は端末内に保存され、広告には使用されません。',
      },
    },
  },
};

/** 광고가 실제로 켜진 앱의 방침에서 «광고 없음» 문장을 사실로 갈아끼운다 */
function applyAdsOn(sections: Section[], loc: LocaleKey, v: 'uc' | 'wim'): Section[] {
  const sw = ADS_ON[loc][v];
  return sections.map((sec) => {
    if (sec.title === sw.noAdsTitle) return sw.adsSection;
    if (sec.body === sw.freeFrom) return { ...sec, body: sw.freeTo };
    return sec;
  });
}

export function AppLegalDocument({ locale, doc, backHref, badgeText, variant }: { locale: string; doc: DocType; backHref?: string; badgeText?: string; variant?: 'default' | 'wim' | 'uc' }) {
  const loc = resolveLocale(locale);
  const copy = COPY[loc];
  // 앱별 «사실과 일치하는» 문서를 고른다. 기본(default) 카피는 SIGNUM 전용이며
  // 광고·푸시를 전제하므로 UC/WIM 에 쓰면 거짓 진술이 된다 (2026-08-10 실측 수정).
  const set = variant === 'wim' ? copy.wim : variant === 'uc' ? copy.uc : null;
  const appKey: AppKey | null = variant === 'wim' ? 'wim' : variant === 'uc' ? 'uc' : null;
  // 광고가 실제로 켜진 앱만 «광고 있음» 문장으로 바뀐다. 유닛이 null 인 동안은
  // 광고가 나가지 않으므로 «광고 없음»이 그대로 사실이다.
  const adsOn = !!appKey && hasRealUnits(appKey);
  const rawSections = doc === 'privacy'
    ? (set ? set.privacy : copy.privacy)
    : (set ? set.terms : copy.terms);
  const sections =
    doc === 'privacy' && adsOn && (variant === 'uc' || variant === 'wim')
      ? applyAdsOn(rawSections, loc, variant)
      : rawSections;
  const title = doc === 'privacy' ? copy.privacyTitle : copy.termsTitle;
  const updated = set ? set.updated : copy.updated;
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
            <p className={styles.updated}>{updated}</p>
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
