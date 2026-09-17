import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.signumhq.wim',
  appName: "Why'd It Move",
  webDir: 'www',

  // Remote webview — same architecture as SIGNUM HQ / Undercurrent (both
  // store-approved). /en/wim is the entry; the page routes once to the
  // device locale (mirrors the UC pattern).
  server: {
    url: 'https://www.signumhq.com/en/wim',
    cleartext: false,
    // ★ 2026-09-17: SIGNUM 과 «같은 원인»이 여기에도 있었다(대표 관찰: 앱을 띄워두고
    //   다른 앱 갔다 돌아오면 크롬 창이 뜬다).
    //   기제: Capacitor iOS 는 allowNavigation 이 비어 있으면
    //     navURL.starts(with: serverURL «전체 문자열»)
    //   만 통과시킨다. serverURL 이 .../en/<앱> 이므로 «같은 도메인의 다른 경로»는
    //   전부 시스템 브라우저로 나간다.
    //   방아쇠는 로케일 이동이 아니다 — 그건 이미 router.replace(문서 재생성 없음)라 안전하다.
    //   iOS 가 메모리 압박으로 WebView 를 폐기한 뒤 «복귀 시 재로드» 할 때,
    //   재로드 대상이 부트스트랩 후의 현재 URL(/ko/<앱>)이라 접두사 검사에 걸려 튕긴다.
    //   호스트를 허용해 두면 경로와 무관하게 앱 안에서 처리된다.
    //   ※ 이 값은 «네이티브 번들에 컴파일»된다 — 웹 배포로는 바뀌지 않는다. 새 빌드 필요.
    allowNavigation: ['www.signumhq.com', 'signumhq.com', '*.signumhq.com'],
  },

  ios: {
    contentInset: 'never', // CSS env() owns safe areas (UC lesson)
    backgroundColor: '#F2EEFF',
    scheme: 'wim',
    preferredContentMode: 'mobile',
  },

  android: {
    backgroundColor: '#F2EEFF',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#F2EEFF',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F2EEFF',
    },
  },
};

export default config;
