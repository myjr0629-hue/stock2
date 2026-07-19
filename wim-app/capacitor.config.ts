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
