// ============================================================================
// Single source of truth for the NATIVE app's INTENDED locale.
//
// The Capacitor shell boots the WebView at a hardcoded /en/ (capacitor
// server.url = https://www.signumhq.com/en/app-view/dash), so on EVERY cold
// start `window.location.pathname` is "/en/…" until the self-route runs. Any
// code that derived a NAVIGATION-TARGET locale from that path therefore picked
// "en" on a cold-start deep-link — which opened the market-close report push in
// English even for users who chose Korean (2026-07 bug).
//
// RULE: resolve a target locale ONLY from the saved choice (never the URL).
//   saved in-app choice  →  device language  →  'en'
// The saved key is written by the in-app language switcher (settings page).
// ============================================================================

export const APP_LOCALES = ['ko', 'en', 'ja'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const APP_LOCALE_KEY = 'signumhq.app.locale';

const isAppLocale = (v: string | null | undefined): v is AppLocale =>
  !!v && (APP_LOCALES as readonly string[]).includes(v);

/** The locale the app SHOULD be in for the current user. Use this for every
 *  native navigation target / deep-link / push registration — do not read
 *  window.location.pathname for that purpose. */
export function resolveAppLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(APP_LOCALE_KEY);
    if (isAppLocale(saved)) return saved;
  } catch { /* storage unavailable */ }
  try {
    const dev = (navigator.language || '').slice(0, 2).toLowerCase();
    if (isAppLocale(dev)) return dev;
  } catch { /* no navigator */ }
  return 'en';
}
