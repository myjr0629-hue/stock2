import { giftToken } from './config';
import { normalizeGiftRef, toGiftLang } from '@/lib/gift/gift';
import { SHARE_ORIGIN, type ShareOutcome, type ShareVia } from '@/lib/share/share';

export type SharePayload = { title?: string; text?: string; url: string };
const FRESH_MS = 60_000;
const PENDING_KEY = 'signumhq.gift.pending.v1';
type PendingGift = { token: string; expiresAt: number };

function readPending(storage: Storage, now: number): PendingGift | null {
  const raw = storage.getItem(PENDING_KEY);
  try {
    const saved = JSON.parse(raw || 'null');
    const token = giftToken(saved?.token);
    return token && Number.isFinite(saved?.expiresAt) && saved.expiresAt > now
      ? { token, expiresAt: saved.expiresAt } : null;
  } catch { return null; }
}
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

/** 기기 열쇠는 로컬 저장소에서만 다룬다. 로그·분석·공유 본문에 열쇠를 싣지 않는다. */
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
  let ready: PendingGift | null = null;
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
        // 출처별 미전송 토큰을 복원한다. 재로딩·앱 재진입이 발행 한도를 소진하지 않는다.
        const storage = localStorage;
        ready = readPending(storage, now());
        if (!ready) {
          // 저장 불가 상태에서 자동 발행을 반복하지 않는다.
          storage.setItem(PENDING_KEY, 'null');
          const key = via === 'web' ? null : getDevice();
          // 영속 열쇠가 없으면 앱 한도를 우회하는 익명 발행을 하지 않는다.
          if (via !== 'web' && !key) return;
          const r = await request('/api/gift/issue', { method: 'POST', credentials: 'same-origin',
            headers: key ? { 'x-gift-device': key } : {}, signal: AbortSignal.timeout(4000) });
          if (!r.ok) throw new Error();
          const body = await r.json();
          const token = giftToken(body.token);
          if (body.ok === true && token && Number.isFinite(body.expiresAt) && body.expiresAt > now()) {
            const pending = { token, expiresAt: body.expiresAt };
            storage.setItem(PENDING_KEY, JSON.stringify(pending));
            ready = pending;
          }
        }
        checkedAt = now();
      } catch { ready = null; checkedAt = 0; } finally { inflight = null; }
    })();
    return inflight;
  };
  const payload = (original: SharePayload, locale: string, via: ShareVia, ref?: string | null, giftOnly = false): SharePayload => {
    if (!enabled) return original; // 꺼짐은 객체와 문자열을 그대로 돌려준다.
    if (ready) {
      try {
        // 다른 문서에서 이미 보낸 토큰을 오래 열린 화면에서 다시 내보내지 않는다.
        if (readPending(localStorage, now())?.token !== ready.token) ready = null;
      } catch { ready = null; }
    }
    const lang = toGiftLang(locale);
    const prepared = ready && ready.expiresAt > now() && now() - checkedAt < FRESH_MS;
    const validRef = normalizeGiftRef(ref);
    // 발행 API와 같은 출처를 쓴다. 프리뷰 토큰을 운영 재고 영역으로 보내지 않는다.
    const u = new URL('/app', typeof window === 'undefined' ? SHARE_ORIGIN : window.location.origin);
    u.searchParams.set('from', prepared || validRef ? 'gift' : 'share');
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
      const usedToken = ready.token;
      ready = null;
      try {
        // 다른 문서가 이미 준비한 다음 토큰까지 지우지 않는다.
        if (readPending(localStorage, now())?.token === usedToken) localStorage.removeItem(PENDING_KEY);
      } catch { return; }
      void refresh(via);
    }
  };
  return { refresh, payload, complete };
}

export const giftPreparation = createGiftPreparation();
