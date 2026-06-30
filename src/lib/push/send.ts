// ============================================================================
// Push send helper — reads device tokens from Upstash Redis and delivers
// notifications via Firebase Cloud Messaging (firebase-admin).
//
// Env required (set in Vercel, NOT committed):
//   FIREBASE_SERVICE_ACCOUNT  — the Firebase service-account JSON (one line)
//   (Upstash Redis env is already configured for /api/push/register)
// ============================================================================
import 'server-only';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

type Locale = 'ko' | 'en' | 'ja';
const LOCALES: Locale[] = ['ko', 'en', 'ja'];

// Localized notification copy per type. Mirrors the in-app toggle names
// (Morning Briefing / Closing Report).
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

// Lazily initialize firebase-admin once per server instance. The CJS module is
// reached via either the namespace or the default export depending on interop.
async function getMessaging() {
  const mod: any = await import('firebase-admin');
  const admin = mod.default ?? mod;
  if (!admin.apps?.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.messaging();
}

interface SendResult { total: number; sent: number; pruned: number; }

export async function sendPushByType(type: 'morning' | 'closing'): Promise<SendResult> {
  const tokens: string[] = (await redis.smembers('push:token_list')) || [];
  if (!tokens.length) return { total: 0, sent: 0, pruned: 0 };

  // Bucket tokens by locale so each device gets copy in its language.
  const byLocale: Record<Locale, string[]> = { ko: [], en: [], ja: [] };
  for (const token of tokens) {
    const data = await redis.get<{ locale?: string }>(`push:tokens:${token}`);
    const locale: Locale = (data?.locale && LOCALES.includes(data.locale as Locale)) ? (data.locale as Locale) : 'en';
    byLocale[locale].push(token);
  }

  const messaging = await getMessaging();
  let sent = 0;
  const deadTokens: string[] = [];

  for (const locale of LOCALES) {
    const toks = byLocale[locale];
    if (!toks.length) continue;
    const copy = PUSH_CONTENT[type][locale];

    // FCM multicast caps at 500 tokens per request.
    for (let i = 0; i < toks.length; i += 500) {
      const batch = toks.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: copy.title, body: copy.body },
        data: { type, locale },
      });
      sent += res.successCount;

      // Collect tokens FCM reports as permanently invalid.
      res.responses.forEach((r: any, idx: number) => {
        const code = r.error?.code || '';
        if (!r.success && /registration-token-not-registered|invalid-argument|not-registered/.test(code)) {
          deadTokens.push(batch[idx]);
        }
      });
    }
  }

  // Remove dead tokens — MUST await: on Vercel the function may freeze right
  // after returning, so fire-and-forget redis writes would never land (dead
  // tokens would linger forever and waste every future send).
  if (deadTokens.length) {
    await redis.srem('push:token_list', ...deadTokens);
    await Promise.all(deadTokens.map(t => redis.del(`push:tokens:${t}`)));
  }

  return { total: tokens.length, sent, pruned: deadTokens.length };
}
