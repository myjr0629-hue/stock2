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

// Send to a set of iOS APNs tokens over one HTTP/2 connection.
// Returns successCount and the tokens APNs reports as permanently gone.
async function sendApns(
  tokens: string[],
  copy: { title: string; body: string },
  data: Record<string, string>,
): Promise<{ sent: number; dead: string[] }> {
  if (!tokens.length) return { sent: 0, dead: [] };
  const host = process.env.APNS_SANDBOX === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
  const jwt = apnsAuthToken();
  const payload = JSON.stringify({ aps: { alert: { title: copy.title, body: copy.body }, sound: 'default' }, ...data });

  const client = http2.connect(host);
  let sent = 0;
  const dead: string[] = [];
  try {
    await Promise.all(tokens.map((token) => new Promise<void>((resolve) => {
      const req = client.request({
        ':method': 'POST',
        ':path': '/3/device/' + token,
        'authorization': 'bearer ' + jwt,
        'apns-topic': APNS_BUNDLE,
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
        } else if (status === 410 || /BadDeviceToken|Unregistered/.test(body)) {
          dead.push(token);
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
  return { sent, dead };
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

  // iOS via APNs directly
  for (const locale of LOCALES) {
    const toks = apns[locale];
    if (!toks.length) continue;
    const copy = PUSH_CONTENT[type][locale];
    const r = await sendApns(toks, copy, { type, locale });
    sent += r.sent;
    deadTokens.push(...r.dead);
  }

  // Remove dead tokens — MUST await (Vercel may freeze right after returning).
  if (deadTokens.length) {
    await redis.srem('push:token_list', ...deadTokens);
    await Promise.all(deadTokens.map((t) => redis.del(`push:tokens:${t}`)));
  }

  return { total: tokens.length, sent, pruned: deadTokens.length };
}
