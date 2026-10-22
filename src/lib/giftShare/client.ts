import { GIFT_SHARE_WINDOW_MS, giftToken } from './config';
import { idbAtomic, recordSent, type GiftAtomic, type GiftState, type SentGift } from './state';
import { normalizeGiftRef, toGiftLang } from '@/lib/gift/gift';
import { SHARE_ORIGIN, type ShareOutcome, type ShareVia } from '@/lib/share/share';

export type SharePayload = { title?: string; text?: string; url: string };
const FRESH_MS = 60_000;
/** 재시도 기한 — 서버가 받는 at 범위(48시간)보다 1시간 짧게(기기·서버 시계 차·요청 지연 여유). */
const RETRY_WINDOW_MS = GIFT_SHARE_WINDOW_MS - 3_600_000;
const RETRY_GAP_MS = 5 * 60_000;
const MAX_TRIES = 5;
/**
 * 잡아 둔 몫의 수명. 준비만 한 토큰은 3분(화면이 보이는 동안 refresh 60초마다 연장 — 닫히거나 새로 고친 문서의 몫은 3분 뒤 풀린다),
 * 클릭해 시트에 실은 토큰은 30분(클릭 즉시 연장 요청, 완료·취소 통지에 정리). 클릭 때 준비 몫이 90초 넘게 남아 있어야 선물 링크를 싣는다(연장이 한 번 실패해도 60초 refresh 연장이 먼저 닿게).
 */
const READY_HOLD_MS = 3 * 60_000;
const SHEET_HOLD_MS = 30 * 60_000;
const CLICK_MARGIN_MS = 90_000;
/** 시트 몫 연장 재시도 — 5초 간격 최대 18회(= 클릭 여유 90초 안). */
const EXTEND_GAP_MS = 5_000;
const EXTEND_TRIES = 18;
/** 기기 시계가 서버와 이만큼 넘게 다르면 등록 시각 검사에 걸릴 수 있어 선물 링크를 만들지 않는다. */
const CLOCK_TOLERANCE_MS = 5 * 60_000;

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

/**
 * 보낸 선물의 «완료 기록 대기» 표식(토큰별 localStorage 키 = 공유 완료 시각). 완료 때 장부 트랜잭션보다 «먼저» 동기로 남기고,
 * 장부 반영이 끝나면 지운다. 장부 트랜잭션이 실패하거나 문서가 그 전에 닫혀도 어느 문서든 다음 예약·재시도 트랜잭션 안에서
 * 먼저 합친 뒤 한도를 본다(관문 10222323: 완료 기록 실패 뒤 한도 초과 링크). 토큰별 키라 탭 사이 읽고-쓰기 교차가 없다.
 */
const PENDING_PREFIX = 'signumhq.gift.pending.v1.';
function readPending(): { token: string; at: number }[] {
  const out: { token: string; at: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PENDING_PREFIX)) continue;
      const token = giftToken(k.slice(PENDING_PREFIX.length));
      const at = Number(localStorage.getItem(k));
      if (token && Number.isSafeInteger(at)) out.push({ token, at });
    }
  } catch { /* 표식을 못 읽으면 메모리 대기분만 */ }
  return out;
}
const dropPending = (token: string) => { try { localStorage.removeItem(PENDING_PREFIX + token); } catch { /* 다음에 다시 합쳐도 counted 로 한 번만 센다 */ } };
const liveRetry = (x: SentGift, t: number) => t - x.at < RETRY_WINDOW_MS && x.tries < MAX_TRIES;

/**
 * 공유=선물 준비 — 기기 한도의 셈은 «오늘 보낸 수 + 잡아 둔 몫»이며, 잡기·풀기·보낸 수 반영은 모두 원자 장부(state.ts)에서 한다.
 * - 화면 진입·복귀(refresh, 비동기): 설정·재고·시계 확인 → 재시도 → 한도가 남으면 새 토큰 하나를 «잡아 두고» 준비한다(서버 발행 없음).
 * - 클릭(payload, 동기): 준비된 토큰을 한 번만 내준다(내준 뒤 준비 칸은 비운다 — 같은 문서의 다른 단추가 같은 토큰을 받지 않는다).
 * - 완료(complete): 보냈으면(shared·copied·failed) 그 시각(at)으로 서버 등록 + 장부에서 «잡음 → 그날 보낸 수»로 옮긴다. 취소면 그 토큰을 준비 칸으로 되돌린다.
 * 서버도 같은 at 의 KST 날짜로 세므로, 기기 셈이 한도 안이면 보낸 링크는 서버 한도에 걸리지 않는다(자정·재시도·응답 유실 무관).
 */
export function createGiftPreparation(request: typeof fetch = (...args) => fetch(...args), getDevice = deviceKey, now = Date.now,
  newToken = randomGiftToken, atomic: GiftAtomic = idbAtomic,
  later: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)) {
  let enabled = false;
  let available = false;
  /** 준비된(잡아 둔) 토큰 하나 — 클릭 때 내주고 비운다. */
  let ready: string | null = null;
  /** 내준 뒤 완료 통지를 기다리는 토큰(시트에 실림). 잡음은 refresh 마다 함께 연장한다. */
  const inSheet = new Set<string>();
  let holdUntil = 0;
  let checkedAt = 0;
  let inflight: Promise<void> | null = null;
  const done = new Set<string>();
  /** 이 문서가 보냈지만 장부 반영을 아직 확인 못 한 선물(표식 저장마저 실패한 경우의 대비). */
  const unrecorded = new Map<string, number>();

  /** 트랜잭션 안에서: 완료 기록 대기분(표식·메모리)을 먼저 장부에 합친다. 합친 토큰 목록을 돌려준다. */
  const mergePending = (s: GiftState, pending: { token: string; at: number }[]) => {
    for (const p of pending) recordSent(s, p.token, p.at, kstDay(p.at));
    return pending.map(p => p.token);
  };
  const pendingNow = () => {
    const list = readPending();
    for (const [token, at] of unrecorded) if (!list.some(p => p.token === token)) list.push({ token, at });
    return list;
  };
  const afterMerge = (tokens: string[]) => { for (const t of tokens) { unrecorded.delete(t); dropPending(t); } };

  /** 한도가 남으면 새 토큰을 잡아 둔다. 오늘 보낸 수 + 모든 문서의 잡음(자정을 걸친 것도 오늘로)이 한도 미만일 때만. */
  const reserve = async (via: ShareVia) => {
    if (!enabled || !available || ready) return;
    if (via !== 'web' && !getDevice()) return; // 영속 열쇠가 없으면 앱 한도를 우회하는 익명 등록이 되므로 준비하지 않는다.
    const token = newToken();
    if (!token || done.has(token)) return;
    const t = now();
    const pending = pendingNow();
    const r = await atomic((s: GiftState) => {
      const merged = mergePending(s, pending); // 완료 기록 대기분을 먼저 센 뒤 한도를 본다
      s.holds = s.holds.filter(h => h.until > t && h.until - t <= SHEET_HOLD_MS);
      if ((s.days[kstDay(t)] ?? 0) + s.holds.length >= dayCap(via)) return { ok: false, merged };
      s.holds.push({ token, until: t + READY_HOLD_MS });
      return { ok: true, merged };
    });
    if (r) afterMerge(r.value.merged);
    if (r?.value.ok !== true) return;
    if (ready || !enabled || !available) { void release(token); return; } // 그사이 다른 경로가 준비했거나 꺼졌다
    ready = token; holdUntil = t + READY_HOLD_MS;
  };
  const release = (token: string) => atomic((s: GiftState) => { s.holds = s.holds.filter(h => h.token !== token); });
  /** 준비·시트의 잡음을 연장한다. 잡음이 사라졌으면(만료 뒤 다른 문서가 가져갔을 수 있음) 준비를 버린다. */
  const renew = async () => {
    const prepared = ready;
    const sheets = [...inSheet];
    if (!prepared && !sheets.length) return;
    const t = now();
    const r = await atomic((s: GiftState) => {
      s.holds = s.holds.filter(h => h.until > t && h.until - t <= SHEET_HOLD_MS);
      let alive = false;
      for (const h of s.holds) {
        if (h.token === prepared) { h.until = t + READY_HOLD_MS; alive = true; }
        else if (sheets.includes(h.token)) h.until = t + SHEET_HOLD_MS;
      }
      return alive;
    });
    if (ready !== prepared) return; // 그사이 클릭으로 내줬다
    if (!r?.value) ready = null; // 몫이 사라졌다(만료 뒤 다른 문서가 가져갔을 수 있음) — 다음 준비에서 다시 잡는다
    else holdUntil = t + READY_HOLD_MS;
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
  const forget = (token: string) => atomic((s: GiftState) => { s.sent = s.sent.filter(x => x.token !== token); });

  /**
   * 공유는 됐지만 등록 응답을 못 받은 토큰만 다시 보낸다(5분 간격·최대 5회·47시간 안). 어느 문서가 보낼지는 장부 트랜잭션 안에서 정한다(중복 0).
   * 재시도는 처음 공유 완료 시각(at)을 그대로 보내므로 언제 처리돼도 공유한 날의 한도를 쓴다.
   */
  const flush = async (via: ShareVia) => {
    const t = now();
    const pending = pendingNow();
    const r = await atomic((s: GiftState) => {
      const merged = mergePending(s, pending);
      s.sent = s.sent.filter(x => liveRetry(x, t));
      const due = s.sent.filter(x => t - x.last >= RETRY_GAP_MS).slice(0, 3);
      for (const x of due) { x.tries++; x.last = t; }
      return { merged, due: due.map(x => ({ token: x.token, at: x.at })) };
    });
    if (r) afterMerge(r.value.merged);
    for (const x of r?.value.due ?? []) if (await register(x.token, x.at, via)) await forget(x.token);
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
        // 꺼짐: 장부·발행에 접근하지 않는다(잡음은 수명이 다하면 풀린다).
        if (!enabled) { available = false; ready = null; checkedAt = now(); return; }
        // 기기 시계가 서버와 크게 다르면 서버가 at 을 거부할 수 있다 — 선물 링크 없이 일반 공유.
        const skewOk = typeof config.now === 'number' && Math.abs(config.now - now()) <= CLOCK_TOLERANCE_MS;
        available = config.available === true && skewOk;
        await flush(via);
        if (!available) { const r = ready; ready = null; if (r) await release(r); }
        else { await renew(); await reserve(via); }
        checkedAt = now();
      } catch { ready = null; available = false; checkedAt = 0; } finally { inflight = null; }
    })();
    return inflight;
  };

  const payload = (original: SharePayload, locale: string, via: ShareVia, ref?: string | null, giftOnly = false): SharePayload => {
    if (!enabled) return original; // 꺼짐은 객체와 문자열을 그대로 돌려준다.
    const lang = toGiftLang(locale);
    const t = now();
    const token = ready && available && t - checkedAt < FRESH_MS && holdUntil - t >= CLICK_MARGIN_MS ? ready : null;
    if (token) {
      ready = null; inSheet.add(token); // 한 번만 내준다 — 같은 문서의 다른 단추는 새 준비 전까지 일반 공유.
      // 시트에 실린 몫을 30분으로 연장(비동기 — 남은 1분 안에 트랜잭션이 끝난다). 연장 전에도 몫은 유효하므로 다른 문서는 이미 이 몫을 센다.
      // 실패하면 시트가 열려 있는 동안 5초마다 다시 — 화면 숨김(주기 refresh 멈춤)과 무관하게 준비 몫(≥90초)이 끝나기 전에 연장이 닿게(관문 10222333).
      const extend = (n: number) => void atomic((st: GiftState) => {
        for (const h of st.holds) if (h.token === token) h.until = Math.max(h.until, t + SHEET_HOLD_MS);
      }).then(r => { if (!r && n < EXTEND_TRIES && inSheet.has(token)) later(() => extend(n + 1), EXTEND_GAP_MS); });
      extend(1);
    }
    const validRef = normalizeGiftRef(ref);
    // 등록 API와 같은 출처를 쓴다. 프리뷰 토큰을 운영 재고 영역으로 보내지 않는다.
    const u = new URL('/app', typeof window === 'undefined' ? SHARE_ORIGIN : window.location.origin);
    u.searchParams.set('from', token || validRef ? 'gift' : 'share');
    if (validRef) u.searchParams.set('ref', validRef);
    if (lang !== 'en') u.searchParams.set('l', lang);
    if (!token) return giftOnly ? { title: 'SIGNUM HQ', text: GENERAL[lang], url: u.toString() } : original;
    u.searchParams.set('via', via);
    u.searchParams.set('gift', token);
    // 콘텐츠 주소와 설명은 보존하고, 마지막 주소를 수신자용 선물 링크로 쓴다.
    const context = giftOnly ? '' : `${original.text ? `${original.text}\n` : ''}${original.url}\n\n`;
    return { ...original, text: `${context}${COPY[lang]}`, url: u.toString() };
  };

  /**
   * 공유·복사 완료 뒤 등록한다. 취소(cancelled)는 아무에게도 가지 않았으므로 그 토큰을 준비 칸으로 되돌린다(잡음 유지).
   * 실패(failed)는 공유 전송기가 마지막 수단으로 주소를 수동 복사 창에 띄웠을 수 있어 «보냈을 수 있음»으로 보고 등록·폐기한다(관문 10220553 ②).
   */
  const complete = (outcome: ShareOutcome, used: SharePayload, via: ShareVia) => {
    let usedToken: string | null;
    try { usedToken = giftToken(new URL(used.url).searchParams.get('gift')); } catch { return; }
    if (!usedToken) return; // 선물 링크가 아니었다(꺼짐·일반 공유) — 장부 접근 0
    const wasInSheet = inSheet.delete(usedToken);
    if (outcome !== 'shared' && outcome !== 'copied' && outcome !== 'failed') {
      if (!wasInSheet || done.has(usedToken)) return;
      if (!ready && holdUntil - now() >= CLICK_MARGIN_MS) ready = usedToken; // 취소 뒤 다시 누르면 같은 토큰(몫은 시트 연장으로 유지)
      else void release(usedToken);
      return;
    }
    if (done.has(usedToken)) return; // 중복 완료 통지는 한 번만 등록한다.
    done.add(usedToken);
    if (ready === usedToken) ready = null;
    // 공유 완료 시각 하나로 기기 셈(그 날짜 +1)과 서버 등록(at)을 묶는다.
    const at = now();
    const token = usedToken;
    // 먼저 동기 표식(+메모리) — 아래 장부 트랜잭션이 실패해도 다음 예약·재시도 트랜잭션이 합친 뒤 한도를 본다.
    unrecorded.set(token, at);
    try { localStorage.setItem(PENDING_PREFIX + token, String(at)); } catch { /* 메모리 대기분으로 이 문서에서 합친다 */ }
    const recorded = atomic((s: GiftState) => { recordSent(s, token, at, kstDay(at)); });
    void recorded.then(r => { if (r) afterMerge([token]); });
    void register(token, at, via).then(async ok => { if (ok) { await recorded; await forget(token); } });
    void recorded.then(() => reserve(via));
  };
  return { refresh, payload, complete };
}

export const giftPreparation = createGiftPreparation();
