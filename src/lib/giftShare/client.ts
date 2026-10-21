import { giftToken } from './config';
import { normalizeGiftRef, toGiftLang } from '@/lib/gift/gift';
import { SHARE_ORIGIN, type ShareOutcome, type ShareVia } from '@/lib/share/share';

export type SharePayload = { title?: string; text?: string; url: string };
const FRESH_MS = 60_000;
/** 공유는 끝났으나 서버 등록 확인 전인 토큰(응답 유실 재시도용). 미전송 토큰은 저장하지 않는다. */
const SENT_KEY = 'signumhq.gift.sent.v1';
/** 이 기기의 오늘(KST) 선물 공유 횟수 — 서버 기기 한도(앱 3·웹 1)를 넘는 공유에 선물 문구를 붙이지 않는다. */
const DAY_KEY = 'signumhq.gift.day.v1';
const TOKEN_TTL_MS = 7 * 86_400_000;
const RETRY_GAP_MS = 5 * 60_000;
const MAX_TRIES = 5;
/** day = 이 토큰의 등록 시도를 마지막으로 셈한 KST 날짜(서버 기기 한도는 등록 시점 날짜로 센다). */
type SentGift = { token: string; at: number; tries: number; last: number; day?: string };

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

/** 32바이트 무작위 → base64url 43자. 서버 형식 검사(giftToken)와 같다. 서버 호출·한도 소모 없음. */
function randomGiftToken(): string | null {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return giftToken(btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  } catch { return null; }
}

const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const dayCap = (via: ShareVia) => via === 'web' ? 1 : 3;

// 저장소 읽기 오류는 호출자에게 그대로 던진다(저장소를 못 쓰면 선물 문구를 붙이지 않는다). 형식 오류만 빈 값.
function readSent(storage: Storage): SentGift[] {
  const raw = storage.getItem(SENT_KEY);
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((x: any) => giftToken(x?.token) && Number.isFinite(x?.at)
      && Number.isFinite(x?.tries) && Number.isFinite(x?.last)) : [];
  } catch { return []; }
}
function writeSent(storage: Storage, list: SentGift[]) {
  if (list.length) storage.setItem(SENT_KEY, JSON.stringify(list.slice(-20)));
  else storage.removeItem(SENT_KEY);
}
/**
 * 오늘(KST) 이 기기가 쓴(또는 쓸) 서버 기기 한도 = 오늘 셈한 등록 시도 + 다른 날 공유됐고 오늘 재시도될 미등록 토큰(예약분).
 * 자정 뒤 재시도가 오늘 한도를 쓰는데 새 선물 링크를 또 내보내지 않게 한다(관문 10220544).
 */
function usedToday(storage: Storage, now: number): number {
  const today = kstDay(now);
  const pending = readSent(storage).filter(x => now - x.at < TOKEN_TTL_MS && x.tries < MAX_TRIES && x.day !== today).length;
  return sharedToday(storage, now) + pending;
}
function countToday(storage: Storage, now: number) {
  storage.setItem(DAY_KEY, JSON.stringify({ day: kstDay(now), n: sharedToday(storage, now) + 1 }));
}
function sharedToday(storage: Storage, now: number): number {
  const raw = storage.getItem(DAY_KEY);
  try {
    const saved = JSON.parse(raw || 'null');
    return saved?.day === kstDay(now) && Number.isInteger(saved?.n) && saved.n >= 0 ? saved.n : 0;
  } catch { return 0; }
}

/**
 * 공유=선물 준비. 화면 진입 때는 설정·재고만 확인하고 토큰은 기기에서 만든다(서버 발행 없음).
 * 선물 등록(서버 발행·한도 차감)은 공유·복사 «완료» 뒤 그 토큰으로 1회만 한다.
 * 완료된 토큰은 즉시 폐기하고 다음 공유엔 새 토큰을 쓴다(재사용 없음). 클릭 경로는 동기 payload()와 공유 시트뿐이다.
 */
export function createGiftPreparation(request: typeof fetch = (...args) => fetch(...args), getDevice = deviceKey, now = Date.now,
  newToken = randomGiftToken) {
  let enabled = false;
  let available = false;
  let ready: string | null = null;
  let checkedAt = 0;
  let inflight: Promise<void> | null = null;
  const done = new Set<string>();

  /** 오늘 한도·저장소·기기 열쇠가 허용할 때만 새 토큰을 준비한다. 저장소를 못 쓰면 선물 문구를 붙이지 않는다. */
  const prepare = (via: ShareVia) => {
    ready = null;
    if (!enabled || !available) return;
    try {
      const storage = localStorage;
      if (usedToday(storage, now()) >= dayCap(via)) return;
      // 쓰기 가능 여부를 확인한다(등록 재시도 장부를 남길 수 없으면 선물 링크를 보내지 않는다).
      const list = readSent(storage);
      storage.setItem(SENT_KEY, JSON.stringify(list));
      writeSent(storage, list); // 빈 장부는 남기지 않는다
    } catch { return; }
    // 영속 열쇠가 없으면 앱 한도를 우회하는 익명 등록이 되므로 준비하지 않는다.
    if (via !== 'web' && !getDevice()) return;
    const token = newToken();
    if (token && !done.has(token)) ready = token;
  };

  /** 서버 등록 — 같은 토큰 재등록은 서버가 차감 없이 «이미 있음»으로 답한다. */
  const register = async (token: string, via: ShareVia): Promise<boolean> => {
    const key = via === 'web' ? null : getDevice();
    if (via !== 'web' && !key) return false;
    try {
      const r = await request('/api/gift/issue', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(key ? { 'x-gift-device': key } : {}) },
        body: JSON.stringify({ token }), signal: AbortSignal.timeout(4000) });
      if (!r.ok) return false;
      const body = await r.json();
      return body?.ok === true;
    } catch { return false; }
  };

  /** 공유는 됐지만 등록 응답을 못 받은 토큰만 다시 보낸다(간격·횟수·기한 제한). */
  const flush = async (via: ShareVia) => {
    let storage: Storage;
    let list: SentGift[];
    try { storage = localStorage; list = readSent(storage); } catch { return; }
    const t = now();
    const due = list.filter(x => t - x.at < TOKEN_TTL_MS && x.tries < MAX_TRIES && t - x.last >= RETRY_GAP_MS).slice(0, 3);
    for (const entry of due) {
      entry.tries++; entry.last = t;
      try {
        // 다른 날 공유분의 첫 재시도는 오늘 서버 기기 한도를 쓸 수 있으므로 오늘 횟수에 한 번 반영한다(과대 계산은 일반 공유 쪽으로만 기운다).
        if (entry.day !== kstDay(t)) { countToday(storage, t); entry.day = kstDay(t); }
        writeSent(storage, readSent(storage).map(x => x.token === entry.token ? entry : x));
      } catch { return; }
      const ok = await register(entry.token, via);
      // 요청을 보낸 뒤 KST 날짜가 바뀌었으면 서버는 새 날짜로 셌을 수 있다 — 그날에도 1회 반영한다.
      try {
        const t2 = now();
        if (kstDay(t2) !== kstDay(t)) {
          countToday(storage, t2);
          writeSent(storage, readSent(storage).map(x => x.token === entry.token ? { ...x, day: kstDay(t2) } : x));
        }
      } catch { return; }
      if (ok) {
        try { writeSent(storage, readSent(storage).filter(x => x.token !== entry.token)); } catch { return; }
      }
    }
    try {
      writeSent(storage, readSent(storage).filter(x => t - x.at < TOKEN_TTL_MS && x.tries < MAX_TRIES));
    } catch { /* 다음 확인 때 */ }
  };

  const refresh = (via: ShareVia): Promise<void> => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const response = await request('/api/gift/share-config', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error();
        const config = await response.json();
        if (typeof config.enabled !== 'boolean') throw new Error();
        enabled = config.enabled;
        // 꺼짐: 저장소·발행에 접근하지 않는다.
        if (!enabled) { available = false; ready = null; checkedAt = now(); return; }
        available = config.available === true;
        // 재시도를 먼저 해 오늘 한도 반영을 끝낸 뒤 준비한다. 이미 준비된 토큰도 한도에 닿았으면 버린다.
        await flush(via);
        if (!available) ready = null;
        else if (!ready) prepare(via);
        else { try { if (usedToday(localStorage, now()) >= dayCap(via)) ready = null; } catch { ready = null; } }
        checkedAt = now();
      } catch { ready = null; available = false; checkedAt = 0; } finally { inflight = null; }
    })();
    return inflight;
  };

  const payload = (original: SharePayload, locale: string, via: ShareVia, ref?: string | null, giftOnly = false): SharePayload => {
    if (!enabled) return original; // 꺼짐은 객체와 문자열을 그대로 돌려준다.
    const lang = toGiftLang(locale);
    let underCap = false;
    try { underCap = usedToday(localStorage, now()) < dayCap(via); } catch { underCap = false; }
    const prepared = !!ready && available && underCap && now() - checkedAt < FRESH_MS;
    const validRef = normalizeGiftRef(ref);
    // 등록 API와 같은 출처를 쓴다. 프리뷰 토큰을 운영 재고 영역으로 보내지 않는다.
    const u = new URL('/app', typeof window === 'undefined' ? SHARE_ORIGIN : window.location.origin);
    u.searchParams.set('from', prepared || validRef ? 'gift' : 'share');
    if (validRef) u.searchParams.set('ref', validRef);
    if (lang !== 'en') u.searchParams.set('l', lang);
    if (!prepared) return giftOnly ? { title: 'SIGNUM HQ', text: GENERAL[lang], url: u.toString() } : original;
    u.searchParams.set('via', via);
    u.searchParams.set('gift', ready!);
    // 콘텐츠 주소와 설명은 보존하고, 마지막 주소를 수신자용 선물 링크로 쓴다.
    const context = giftOnly ? '' : `${original.text ? `${original.text}\n` : ''}${original.url}\n\n`;
    return { ...original, text: `${context}${COPY[lang]}`, url: u.toString() };
  };

  /**
   * 공유·복사 완료 뒤 등록한다. 취소(cancelled)만 아무것도 하지 않는다(토큰은 아무에게도 가지 않았다).
   * 실패(failed)는 공유 전송기가 마지막 수단으로 주소를 수동 복사 창에 띄웠을 수 있어 «보냈을 수 있음»으로 보고 등록·폐기한다(관문 10220553 ②).
   */
  const complete = (outcome: ShareOutcome, used: SharePayload, via: ShareVia) => {
    if (outcome !== 'shared' && outcome !== 'copied' && outcome !== 'failed') return;
    let usedToken: string | null;
    try { usedToken = giftToken(new URL(used.url).searchParams.get('gift')); } catch { return; }
    if (!usedToken || done.has(usedToken)) return; // 중복 완료 통지는 한 번만 등록한다.
    done.add(usedToken);
    // 보낸 토큰은 즉시 폐기한다 — 다음 공유는 반드시 새 토큰.
    if (ready === usedToken) ready = null;
    const t = now();
    try {
      const storage = localStorage;
      countToday(storage, t);
      writeSent(storage, [...readSent(storage), { token: usedToken, at: t, tries: 1, last: t, day: kstDay(t) }]);
    } catch { /* 장부를 못 남겨도 등록은 한 번 시도한다 */ }
    void register(usedToken, via).then(ok => {
      try {
        // 23:59:59 공유가 00:00:01 에 처리되는 경계: 응답 시각 날짜가 다르면 그날에도 1회 반영한다(관문 10220553 ①).
        const t2 = now();
        if (kstDay(t2) !== kstDay(t)) {
          countToday(localStorage, t2);
          // 장부의 셈 날짜도 새 날로 — 재시도 때 같은 날 두 번 세지 않는다.
          writeSent(localStorage, readSent(localStorage).map(x => x.token === usedToken ? { ...x, day: kstDay(t2) } : x));
        }
        if (ok) writeSent(localStorage, readSent(localStorage).filter(x => x.token !== usedToken));
      } catch { /* 다음 확인 때 */ }
    });
    prepare(via);
  };
  return { refresh, payload, complete };
}

export const giftPreparation = createGiftPreparation();
