import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.signumhq.undercurrent',
  appName: 'Undercurrent',
  webDir: 'www',

  // Remote webview — same architecture as SIGNUM HQ (store-approved precedent).
  // /en/ is the entry; the page itself routes once to the device locale.
  server: {
    url: 'https://www.signumhq.com/en/undercurrent',
    cleartext: false,
  },

  ios: {
    contentInset: 'never', // CSS env() owns safe areas; 'always' left the scroll offset displaced after sheet rubber-band
    backgroundColor: '#F6F3ED',
    scheme: 'undercurrent',
    preferredContentMode: 'mobile',
  },

  android: {
    backgroundColor: '#F6F3ED',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#F6F3ED',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F6F3ED',
    },
  },
};

export default config;
