import { GIFT_SHARE_WINDOW_MS, giftToken } from './config';
import { normalizeGiftRef, toGiftLang } from '@/lib/gift/gift';
import { SHARE_ORIGIN, type ShareOutcome, type ShareVia } from '@/lib/share/share';

export type SharePayload = { title?: string; text?: string; url: string };
const FRESH_MS = 60_000;
/** 공유는 끝났으나 서버 등록 확인 전인 토큰(응답 유실 재시도용). 미전송 토큰은 저장하지 않는다. */
const SENT_KEY = 'signumhq.gift.sent.v1';
/** 이 기기가 KST 날짜별로 보낸 선물 링크 수 — 서버는 같은 «공유 완료 시각(at)» 날짜로 세므로 두 셈이 같다. */
const DAY_KEY = 'signumhq.gift.day.v1';
/** 재시도 기한 — 서버가 받는 at 범위(48시간)보다 1시간 짧게(기기·서버 시계 차·요청 지연 여유). */
const RETRY_WINDOW_MS = GIFT_SHARE_WINDOW_MS - 3_600_000;
const RETRY_GAP_MS = 5 * 60_000;
const MAX_TRIES = 5;
/** 공유 시트에 실린 선물 링크(완료 전) — 다른 문서·탭이 같은 한도를 동시에 쓰지 않게 잠깐 잡아 둔다. 완료 통지(취소 포함)에 푼다. */
const HOLD_KEY = 'signumhq.gift.hold.v1';
const HOLD_MS = 30 * 60_000;
/** 기기 시계가 서버와 이만큼 넘게 다르면 등록 시각 검사에 걸릴 수 있어 선물 링크를 만들지 않는다. */
const CLOCK_TOLERANCE_MS = 5 * 60_000;
/** at = 공유 완료 시각(기기 시계). 등록·재시도 모두 이 값을 그대로 보내 서버가 같은 날짜로 센다. */
type SentGift = { token: string; at: number; tries: number; last: number };

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
    return Array.isArray(list) ? list.filter((x: any) => giftToken(x?.token) && Number.isSafeInteger(x?.at)
      && Number.isFinite(x?.tries) && Number.isFinite(x?.last)).map((x: any) => ({ token: x.token, at: x.at, tries: x.tries, last: x.last })) : [];
  } catch { return []; }
}
function writeSent(storage: Storage, list: SentGift[]) {
  if (list.length) storage.setItem(SENT_KEY, JSON.stringify(list.slice(-20)));
  else storage.removeItem(SENT_KEY);
}
/** 날짜별 보낸 수. 최근 4일만 보관한다(시계가 하루 뒤로 가도 그날 셈을 잃지 않게). */
function readDays(storage: Storage): Record<string, number> {
  const raw = storage.getItem(DAY_KEY);
  const out: Record<string, number> = {};
  try {
    const saved = JSON.parse(raw || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    for (const [k, v] of Object.entries(saved)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isInteger(v) && (v as number) >= 0) out[k] = v as number;
  } catch { /* 형식 오류는 빈 값 */ }
  return out;
}
const sharedOn = (storage: Storage, day: string) => readDays(storage)[day] ?? 0;
type Hold = { token: string; until: number };
function readHolds(storage: Storage, t: number): Hold[] {
  const raw = storage.getItem(HOLD_KEY);
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((x: any) => giftToken(x?.token) && Number.isFinite(x?.until) && x.until > t && x.until - t <= HOLD_MS)
      .map((x: any) => ({ token: x.token, until: x.until })) : [];
  } catch { return []; }
}
function writeHolds(storage: Storage, list: Hold[]) {
  if (list.length) storage.setItem(HOLD_KEY, JSON.stringify(list.slice(-10)));
  else storage.removeItem(HOLD_KEY);
}
/** 오늘 쓴 수 = 오늘 보낸 수 + 다른 문서가 시트에 띄워 둔 선물 링크(자정을 걸쳐도 보수적으로 오늘에 센다). */
const usedNow = (storage: Storage, t: number, except: string | null) =>
  sharedOn(storage, kstDay(t)) + readHolds(storage, t).filter(h => h.token !== except).length;
function countShare(storage: Storage, day: string) {
  const days = readDays(storage);
  days[day] = (days[day] ?? 0) + 1;
  storage.setItem(DAY_KEY, JSON.stringify(Object.fromEntries(Object.entries(days).sort(([a], [b]) => a < b ? -1 : 1).slice(-4))));
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
      if (sharedOn(storage, kstDay(now())) >= dayCap(via)) return; // 다른 시트가 잡아 둔 몫은 클릭(payload) 때 본다
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

  /** 서버 등록 — at(공유 완료 시각)의 날짜로 한도를 센다. 같은 토큰 재등록은 서버가 차감 없이 «이미 있음»으로 답한다. */
  const register = async (token: string, at: number, via: ShareVia): Promise<boolean> => {
    const key = via === 'web' ? null : getDevice();
    if (via !== 'web' && !key) return false;
    try {
      const r = await request('/api/gift/issue', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(key ? { 'x-gift-device': key } : {}) },
        body: JSON.stringify({ token, at }), signal: AbortSignal.timeout(4000) });
      if (!r.ok) return false;
      const body = await r.json();
      return body?.ok === true;
    } catch { return false; }
  };

  /**
   * 공유는 됐지만 등록 응답을 못 받은 토큰만 다시 보낸다(5분 간격·최대 5회·47시간 안).
   * 재시도는 처음 공유 완료 시각(at)을 그대로 보내므로 언제 처리돼도 공유한 날의 한도를 쓴다 — 오늘 셈과 무관하다.
   */
  const flush = async (via: ShareVia) => {
    let storage: Storage;
    try { storage = localStorage; readSent(storage); } catch { return; }
    const live = (x: SentGift, t: number) => t - x.at < RETRY_WINDOW_MS && x.tries < MAX_TRIES;
    const t0 = now();
    const due = readSent(storage).filter(x => live(x, t0) && t0 - x.last >= RETRY_GAP_MS).slice(0, 3);
    for (const item of due) {
      let entry: SentGift | undefined;
      try {
        const t = now();
        entry = readSent(storage).find(x => x.token === item.token);
        if (!entry || !live(entry, t) || t - entry.last < RETRY_GAP_MS) continue; // 다른 문서가 먼저 재시도했거나 끝냈다
        entry = { ...entry, tries: entry.tries + 1, last: t };
        const saved = entry;
        writeSent(storage, readSent(storage).map(x => x.token === saved.token ? saved : x));
      } catch { return; }
      if (await register(entry.token, entry.at, via)) {
        try { writeSent(storage, readSent(storage).filter(x => x.token !== item.token)); } catch { return; }
      }
    }
    try {
      const t = now();
      writeSent(storage, readSent(storage).filter(x => live(x, t)));
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
        // 기기 시계가 서버와 크게 다르면 서버가 at 을 거부할 수 있다 — 선물 링크 없이 일반 공유.
        const skewOk = typeof config.now === 'number' && Math.abs(config.now - now()) <= CLOCK_TOLERANCE_MS;
        available = config.available === true && skewOk;
        await flush(via);
        if (!available) ready = null;
        else if (!ready) prepare(via);
        else { try { if (sharedOn(localStorage, kstDay(now())) >= dayCap(via)) ready = null; } catch { ready = null; } }
        checkedAt = now();
      } catch { ready = null; available = false; checkedAt = 0; } finally { inflight = null; }
    })();
    return inflight;
  };

  const payload = (original: SharePayload, locale: string, via: ShareVia, ref?: string | null, giftOnly = false): SharePayload => {
    if (!enabled) return original; // 꺼짐은 객체와 문자열을 그대로 돌려준다.
    const lang = toGiftLang(locale);
    let prepared = !!ready && available && now() - checkedAt < FRESH_MS;
    if (prepared) {
      try {
        const storage = localStorage;
        const t = now();
        prepared = usedNow(storage, t, ready) < dayCap(via);
        // 시트에 싣는 링크를 잡아 둔다(못 잡으면 선물 문구를 붙이지 않는다).
        if (prepared) writeHolds(storage, [...readHolds(storage, t).filter(h => h.token !== ready), { token: ready!, until: t + HOLD_MS }]);
      } catch { prepared = false; }
    }
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
    let usedToken: string | null;
    try { usedToken = giftToken(new URL(used.url).searchParams.get('gift')); } catch { return; }
    if (!usedToken) return; // 선물 링크가 아니었다(꺼짐·일반 공유) — 저장소 접근 0
    // 시트가 닫혔다 — 결과와 무관하게 잡아 둔 한도를 푼다(보냈으면 아래에서 그날 셈으로 옮긴다).
    try { const t = now(); writeHolds(localStorage, readHolds(localStorage, t).filter(h => h.token !== usedToken)); } catch { /* 30분 뒤 저절로 풀린다 */ }
    if (outcome !== 'shared' && outcome !== 'copied' && outcome !== 'failed') return;
    if (done.has(usedToken)) return; // 중복 완료 통지는 한 번만 등록한다.
    done.add(usedToken);
    // 보낸 토큰은 즉시 폐기한다 — 다음 공유는 반드시 새 토큰.
    if (ready === usedToken) ready = null;
    // 공유 완료 시각 하나로 기기 셈(그 날짜 +1)과 서버 등록(at)을 묶는다. 등록·재시도가 언제 처리돼도 같은 날짜로 센다.
    const at = now();
    try {
      const storage = localStorage;
      countShare(storage, kstDay(at));
      writeSent(storage, [...readSent(storage), { token: usedToken, at, tries: 1, last: at }]);
    } catch { /* 장부를 못 남겨도 등록은 한 번 시도한다 */ }
    void register(usedToken, at, via).then(ok => {
      if (!ok) return; // 장부에 남은 토큰은 다음 확인 때 같은 at 으로 재시도한다
      try { writeSent(localStorage, readSent(localStorage).filter(x => x.token !== usedToken)); } catch { /* 다음 확인 때 */ }
    });
    prepare(via);
  };
  return { refresh, payload, complete };
}

export const giftPreparation = createGiftPreparation();
