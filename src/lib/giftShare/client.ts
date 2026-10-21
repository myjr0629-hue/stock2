import { giftToken } from './config';
import { normalizeGiftRef, toGiftLang } from '@/lib/gift/gift';
import { SHARE_ORIGIN, type ShareOutcome, type ShareVia } from '@/lib/share/share';

export type SharePayload = { title?: string; text?: string; url: string };
const FRESH_MS = 60_000;
const COPY = {
  ko: '친구에게 SIGNUM PRO 1개월 이용권을 선물합니다. 링크에서 스토어 등록을 완료해야 적용됩니다. 링크당 1명, 대상 자격·재고에 따라 제공되며 이후 자동 갱신 조건은 등록 화면에서 확인하세요.',
  en: 'A gift of 1 month of SIGNUM PRO. Complete redemption in the store through this link. One recipient per link, subject to eligibility and availability. Check subsequent auto-renewal terms on the redemption screen.',
  ja: 'SIGNUM PRO 1か月利用権のプレゼントです。リンク先でストアの登録を完了すると適用されます。1リンクにつき1名、対象資格・在庫によります。その後の自動更新条件は登録画面でご確認ください。',
};
const GENERAL = {
  ko: 'SIGNUM HQ — 미국 주식·옵션 인사이트',
  en: 'SIGNUM HQ — US stock and options insights',
  ja: 'SIGNUM HQ — 米国株・オプションのインサイト',
};

/** 토큰·기기 열쇠는 메모리/로컬 저장소에서만 다룬다. 로그·분석·공유 본문에 열쇠를 싣지 않는다. */
function deviceKey(): string | null {
  try {
    const storage = 'signumhq.gift.device.v1';
    const current = localStorage.getItem(storage);
    if (current && /^[a-f0-9]{64}$/.test(current)) return current;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(storage, key);
    return key;
  } catch { return null; }
}

/** 화면 진입 때 준비한다. 클릭 경로는 동기 payload()와 공유 시트 호출뿐이다. */
export function createGiftPreparation(request: typeof fetch = (...args) => fetch(...args), getDevice = deviceKey, now = Date.now) {
  let enabled = false;
  let ready: { token: string; expiresAt: number } | null = null;
  let checkedAt = 0;
  let inflight: Promise<void> | null = null;
  const refresh = (via: ShareVia): Promise<void> => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const response = await request('/api/gift/share-config', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error();
        const config = await response.json();
        if (typeof config.enabled !== 'boolean') throw new Error();
        enabled = config.enabled;
        if (!enabled || config.available !== true) { ready = null; checkedAt = now(); return; }
        if (!ready || ready.expiresAt <= now()) {
          ready = null;
          const key = via === 'web' ? null : getDevice();
          // 영속 열쇠가 없으면 앱 한도를 우회하는 익명 발행을 하지 않는다.
          if (via !== 'web' && !key) return;
          const r = await request('/api/gift/issue', { method: 'POST', credentials: 'same-origin',
            headers: key ? { 'x-gift-device': key } : {}, signal: AbortSignal.timeout(4000) });
          if (!r.ok) throw new Error();
          const body = await r.json();
          const token = giftToken(body.token);
          if (body.ok === true && token && Number.isFinite(body.expiresAt) && body.expiresAt > now()) ready = { token, expiresAt: body.expiresAt };
        }
        checkedAt = now();
      } catch { ready = null; checkedAt = 0; } finally { inflight = null; }
    })();
    return inflight;
  };
  const payload = (original: SharePayload, locale: string, via: ShareVia, ref?: string | null, giftOnly = false): SharePayload => {
    if (!enabled) return original; // 꺼짐은 객체와 문자열을 그대로 돌려준다.
    const lang = toGiftLang(locale);
    const prepared = ready && ready.expiresAt > now() && now() - checkedAt < FRESH_MS;
    const u = new URL('/app', SHARE_ORIGIN);
    u.searchParams.set('from', prepared ? 'gift' : 'share');
    const validRef = normalizeGiftRef(ref);
    if (validRef) u.searchParams.set('ref', validRef);
    if (lang !== 'en') u.searchParams.set('l', lang);
    if (!prepared) return giftOnly ? { title: 'SIGNUM HQ', text: GENERAL[lang], url: u.toString() } : original;
    u.searchParams.set('via', via);
    u.searchParams.set('gift', ready!.token);
    // 콘텐츠 주소와 설명은 보존하고, 마지막 주소를 수신자용 선물 링크로 쓴다.
    const context = giftOnly ? '' : `${original.text ? `${original.text}\n` : ''}${original.url}\n\n`;
    return { ...original, text: `${context}${COPY[lang]}`, url: u.toString() };
  };
  const complete = (outcome: ShareOutcome, used: SharePayload, via: ShareVia) => {
    if ((outcome === 'shared' || outcome === 'copied') && ready && new URL(used.url).searchParams.get('gift') === ready.token) {
      ready = null;
      void refresh(via);
    }
  };
  return { refresh, payload, complete };
}

export const giftPreparation = createGiftPreparation();
