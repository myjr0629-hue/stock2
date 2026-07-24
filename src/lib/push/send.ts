// ============================================================================
// Push send helper — reads device tokens from Upstash Redis and delivers:
//   • Android → Firebase Cloud Messaging (firebase-admin)
//   • iOS     → APNs directly (HTTP/2 + .p8 token auth)
//
// FCM→APNs delivery proved unreliable in the Capacitor+Firebase iOS setup
// (FCM accepted sends but APNs never delivered), while a direct APNs push with
// the same .p8 key delivered reliably — so iOS goes straight to APNs.
//
// Env required (set in Vercel, NOT committed):
//   FIREBASE_SERVICE_ACCOUNT  — Firebase service-account JSON (Android/FCM)
//   APNS_KEY_P8               — the APNs auth key (.p8) contents (iOS)
//   APNS_KEY_ID               — e.g. DK9C5X9M53
//   APNS_TEAM_ID              — e.g. 25RG9GSHHZ
//   APNS_SANDBOX (optional)   — "true" to use the sandbox APNs gateway (dev builds)
// ============================================================================
import 'server-only';
import { Redis } from '@upstash/redis';
import http2 from 'node:http2';
import crypto from 'node:crypto';

const redis = Redis.fromEnv();

type Locale = 'ko' | 'en' | 'ja';
const LOCALES: Locale[] = ['ko', 'en', 'ja'];

const APNS_BUNDLE = 'com.signumhq.app';

// Localized notification copy per type. Mirrors the in-app toggle names.
export const PUSH_CONTENT: Record<'morning' | 'closing', Record<Locale, { title: string; body: string }>> = {
  morning: {
    ko: { title: '🌅 모닝 브리프', body: '오늘의 프리마켓 시장 브리프가 준비됐습니다.' },
    en: { title: '🌅 Morning Brief', body: "Today's pre-market brief is ready." },
    ja: { title: '🌅 モーニングブリーフ', body: '本日のプレマーケット・ブリーフが準備できました。' },
  },
  closing: {
    ko: { title: '📊 장마감 리포트', body: '오늘 장마감 분석 리포트가 나왔습니다.' },
    en: { title: '📊 Closing Report', body: "Today's post-market analysis is ready." },
    ja: { title: '📊 クロージングレポート', body: '本日の引け後分析レポートが届きました。' },
  },
};

// ---- FCM (Android) ---------------------------------------------------------
async function getMessaging() {
  const mod: any = await import('firebase-admin');
  const admin = mod.default ?? mod;
  if (!admin.apps?.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.messaging();
}

// ---- APNs (iOS) ------------------------------------------------------------
const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function apnsAuthToken(): string {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  // Accept a couple of name spellings (P8 vs PB are easy to confuse).
  let key = process.env.APNS_KEY_P8 || process.env.APNS_KEY_PB || process.env.APNS_KEY || '';
  if (!keyId || !teamId || !key) throw new Error('APNS_KEY_ID / APNS_TEAM_ID / APNS_KEY_P8 not set');
  // Tolerate keys pasted with escaped newlines.
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signer = crypto.createSign('SHA256');
  signer.update(header + '.' + claims);
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  return header + '.' + claims + '.' + b64url(sig);
}

const APNS_PROD_HOST = 'https://api.push.apple.com';
const APNS_SANDBOX_HOST = 'https://api.sandbox.push.apple.com';

// Send to a set of iOS APNs tokens over one HTTP/2 connection to `host`.
// Splits failures: `badToken` = wrong APNs environment (retry the other gateway),
// `gone` = permanently unregistered (safe to prune).
async function sendApns(
  host: string,
  tokens: string[],
  copy: { title: string; body: string },
  data: Record<string, string>,
  topic: string = APNS_BUNDLE,   // [MULTI-APP] default = SIGNUM (unchanged); WIM passes com.signumhq.wim
): Promise<{ sent: number; badToken: string[]; gone: string[] }> {
  if (!tokens.length) return { sent: 0, badToken: [], gone: [] };
  const jwt = apnsAuthToken();
  const payload = JSON.stringify({ aps: { alert: { title: copy.title, body: copy.body }, sound: 'default' }, ...data });

  const client = http2.connect(host);
  let sent = 0;
  const badToken: string[] = [];
  const gone: string[] = [];
  try {
    await Promise.all(tokens.map((token) => new Promise<void>((resolve) => {
      const req = client.request({
        ':method': 'POST',
        ':path': '/3/device/' + token,
        'authorization': 'bearer ' + jwt,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0, body = '';
      req.on('response', (h) => { status = Number(h[':status']) || 0; });
      req.setEncoding('utf8');
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        if (status === 200) {
          sent += 1;
        } else if (/BadDeviceToken/.test(body)) {
          badToken.push(token);            // wrong gateway (sandbox token → prod, or vice versa)
        } else if (status === 410 || /Unregistered/.test(body)) {
          gone.push(token);                // permanently gone → prune
        }
        resolve();
      });
      req.on('error', () => resolve());
      req.write(payload);
      req.end();
    })));
  } finally {
    client.close();
  }
  return { sent, badToken, gone };
}

interface SendResult { total: number; sent: number; pruned: number; }

export async function sendPushByType(type: 'morning' | 'closing'): Promise<SendResult> {
  const tokens: string[] = (await redis.smembers('push:token_list')) || [];
  if (!tokens.length) return { total: 0, sent: 0, pruned: 0 };

  // Bucket by platform AND locale.
  const fcm: Record<Locale, string[]> = { ko: [], en: [], ja: [] };
  const apns: Record<Locale, string[]> = { ko: [], en: [], ja: [] };
  for (const token of tokens) {
    const data = await redis.get<{ locale?: string; platform?: string }>(`push:tokens:${token}`);
    const locale: Locale = (data?.locale && LOCALES.includes(data.locale as Locale)) ? (data.locale as Locale) : 'en';
    // iOS = raw APNs hex token (no colon); Android = FCM token (has a colon).
    const isIos = data?.platform === 'ios' || !token.includes(':');
    (isIos ? apns : fcm)[locale].push(token);
  }

  let sent = 0;
  const deadTokens: string[] = [];

  // Android via FCM
  const hasFcm = LOCALES.some((l) => fcm[l].length);
  if (hasFcm) {
    const messaging = await getMessaging();
    for (const locale of LOCALES) {
      const toks = fcm[locale];
      if (!toks.length) continue;
      const copy = PUSH_CONTENT[type][locale];
      for (let i = 0; i < toks.length; i += 500) {
        const batch = toks.slice(i, i + 500);
        const res = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: copy.title, body: copy.body },
          data: { type, locale },
        });
        sent += res.successCount;
        res.responses.forEach((r: any, idx: number) => {
          const code = r.error?.code || '';
          if (!r.success && /registration-token-not-registered|invalid-argument|not-registered/.test(code)) {
            deadTokens.push(batch[idx]);
          }
        });
      }
    }
  }

  // iOS via APNs directly — try the primary gateway, then auto-fallback to the
  // other environment for any token APNs reports as BadDeviceToken (a dev/sandbox
  // token hitting the production gateway, or vice versa). This makes dev builds
  // AND App Store builds both deliver without needing a per-token environment flag,
  // and — critically — no longer prunes a live dev token just for being on the
  // wrong gateway (only 410/Unregistered tokens are pruned).
  const primaryHost = process.env.APNS_SANDBOX === 'true' ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
  const fallbackHost = primaryHost === APNS_PROD_HOST ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
  for (const locale of LOCALES) {
    const toks = apns[locale];
    if (!toks.length) continue;
    const copy = PUSH_CONTENT[type][locale];
    const first = await sendApns(primaryHost, toks, copy, { type, locale });
    sent += first.sent;
    deadTokens.push(...first.gone);
    if (first.badToken.length) {
      const retry = await sendApns(fallbackHost, first.badToken, copy, { type, locale });
      sent += retry.sent;
      deadTokens.push(...retry.gone);
      deadTokens.push(...retry.badToken); // bad on BOTH gateways → truly dead
    }
  }

  // Remove dead tokens — MUST await (Vercel may freeze right after returning).
  if (deadTokens.length) {
    await redis.srem('push:token_list', ...deadTokens);
    await Promise.all(deadTokens.map((t) => redis.del(`push:tokens:${t}`)));
  }

  return { total: tokens.length, sent, pruned: deadTokens.length };
}

// ============================================================================
// [WIM] "Today's quiz is ready" push — fully ISOLATED from SIGNUM above:
//   • its own token set  push:token_list:wim
//   • apns-topic com.signumhq.wim (same team .p8 key)
//   • WIM copy (not SIGNUM's market-report copy)
// iOS-only for now: WIM Android FCM needs a Firebase Android app for
// com.signumhq.wim (no google-services.json yet) — until then no WIM Android
// tokens exist, so there is nothing to send there.
// ============================================================================
const WIM_BUNDLE = 'com.signumhq.wim';
export const WIM_PUSH_CONTENT: Record<Locale, { title: string; body: string }> = {
  ko: { title: '📊 오늘의 문제', body: '오늘의 미국주식 퀴즈가 나왔어요. 3분 수사 시작!' },
  en: { title: '📊 Today’s Quiz', body: "Today's market quiz is live — start your 3-minute investigation." },
  ja: { title: '📊 今日の問題', body: '今日の米国株クイズが公開。3分の捜査を始めよう！' },
};

export async function sendWimQuizPush(): Promise<SendResult> {
  const tokens: string[] = (await redis.smembers('push:token_list:wim')) || [];
  if (!tokens.length) return { total: 0, sent: 0, pruned: 0 };

  const apns: Record<Locale, string[]> = { ko: [], en: [], ja: [] };
  for (const token of tokens) {
    const data = await redis.get<{ locale?: string; platform?: string }>(`push:tokens:${token}`);
    const locale: Locale = (data?.locale && LOCALES.includes(data.locale as Locale)) ? (data.locale as Locale) : 'en';
    // iOS = raw APNs hex token (no colon). WIM Android (FCM, has a colon) is skipped
    // until WIM Firebase exists — bucket only iOS for now.
    if (data?.platform === 'ios' || !token.includes(':')) apns[locale].push(token);
  }

  let sent = 0;
  const deadTokens: string[] = [];
  const primaryHost = process.env.APNS_SANDBOX === 'true' ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
  const fallbackHost = primaryHost === APNS_PROD_HOST ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
  for (const locale of LOCALES) {
    const toks = apns[locale];
    if (!toks.length) continue;
    const copy = WIM_PUSH_CONTENT[locale];
    const first = await sendApns(primaryHost, toks, copy, { type: 'quiz', locale }, WIM_BUNDLE);
    sent += first.sent;
    deadTokens.push(...first.gone);
    if (first.badToken.length) {
      const retry = await sendApns(fallbackHost, first.badToken, copy, { type: 'quiz', locale }, WIM_BUNDLE);
      sent += retry.sent;
      deadTokens.push(...retry.gone);
      deadTokens.push(...retry.badToken);
    }
  }

  if (deadTokens.length) {
    await redis.srem('push:token_list:wim', ...deadTokens);
    await Promise.all(deadTokens.map((t) => redis.del(`push:tokens:${t}`)));
  }
  return { total: tokens.length, sent, pruned: deadTokens.length };
}
