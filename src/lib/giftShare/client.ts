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
/** 준비 몫은 3분. 발급 직전 영속 표식을 남긴 몫은 완료·취소를 확인할 때까지 만료시키지 않는다. */
const READY_HOLD_MS = 3 * 60_000;
const SHEET_HOLD_MS = 30 * 60_000;
const CLICK_MARGIN_MS = 90_000;
/** 기기 시계가 서버와 이만큼 넘게 다르면 등록 시각 검사에 걸릴 수 있어 선물 링크를 만들지 않는다. */
const CLOCK_TOLERANCE_MS = 5 * 60_000;
/** 서버 토큰 7일 유효 기간보다 짧게 잡는다. 설정 갱신으로 예약 수명을 늘리지 않는다. */
const SERVER_RESERVATION_MS = 6 * 86400_000;

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
const ISSUED_PREFIX = 'signumhq.gift.issued.v1.';
/** 저장소를 못 읽거나 표식이 깨졌으면 한도를 알 수 없다. 빈 목록으로 취급하지 않는다. */
function readMarkers(prefix: string): { token: string; at: number }[] {
  const out: { token: string; at: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const token = giftToken(k.slice(prefix.length));
    const raw = localStorage.getItem(k);
    const at = raw === null ? NaN : Number(raw);
    if (!token || !Number.isSafeInteger(at) || String(at) !== raw) throw new Error('gift marker unavailable');
    out.push({ token, at });
  }
  return out;
}
const dropMarker = (prefix: string, token: string) => { try { localStorage.removeItem(prefix + token); } catch { /* 남은 표식은 보수적으로 다시 센다 */ } };
const liveRetry = (x: SentGift, t: number) => t - x.at < RETRY_WINDOW_MS && x.tries < MAX_TRIES;

/**
 * 공유=선물 준비 — 기기 한도의 셈은 «오늘 보낸 수 + 잡아 둔 몫»이며, 잡기·풀기·보낸 수 반영은 모두 원자 장부(state.ts)에서 한다.
 * - 화면 진입·복귀(refresh, 비동기): 설정·재고·시계 확인 → 재시도 → 기기 몫 + 서버 원자 예약 성공 뒤에만 준비한다.
 * - 클릭(payload, 동기): 준비된 토큰을 한 번만 내준다(내준 뒤 준비 칸은 비운다 — 같은 문서의 다른 단추가 같은 토큰을 받지 않는다).
 * - 완료(complete): 보냈으면(shared·copied·failed) 그 시각(at)으로 서버 등록 + 장부에서 «잡음 → 그날 보낸 수»로 옮긴다. 취소면 그 토큰을 준비 칸으로 되돌린다.
 * 서버 예약은 기존 등록을 먼저 확정하는 방식이다. 계정·IP·전체 몫도 확보하며, 완료 등록은 같은 토큰의 멱등 재요청이다.
 */
export function createGiftPreparation(request: typeof fetch = (...args) => fetch(...args), getDevice = deviceKey, now = Date.now,
  newToken = randomGiftToken, atomic: GiftAtomic = idbAtomic) {
  // null은 최초 미조회·조회 중·실패다. 확정된 꺼짐과 구분하며 어느 쪽도 선물을 발급하지 않는다.
  let enabled: boolean | null = null;
  // 마지막 준비/발급 차단 사유만 메모리에 보관한다(식별자 없음).
  let gate = 'config_pending';
  /**
   * 마지막으로 «성공한» 설정 응답이 꺼짐이었나. 조회 시작·실패에는 바꾸지 않는다(재조회 중에도 꺼짐 확정 유지).
   * 선물 전용 입구가 꺼짐 확정일 때만 기존 운영 선물(공개 맞춤 코드) 공유를 그대로 쓰게 한다 — 새 토큰 발급과 무관.
   */
  let lastKnownOff = false;
  let available = false;
  /** 준비된(잡아 둔) 토큰 하나 — 클릭 때 내주고 비운다. */
  let ready: string | null = null;
  let readyVia: ShareVia | null = null;
  /** 내준 뒤 완료 통지를 기다리는 토큰(시트에 실림). 영속 발급 표식으로 몫을 유지한다. */
  const inSheet = new Set<string>();
  let holdUntil = 0;
  let checkedAt = 0;
  let inflight: Promise<void> | null = null;
  let reserving: Promise<void> | null = null;
  const serverReservations = new Map<string, { via: ShareVia; device: string | null; until: number; owner: string }>();
  const done = new Set<string>();
  /** 이 문서가 보냈지만 장부 반영을 아직 확인 못 한 선물(표식 저장마저 실패한 경우의 대비). */
  const unrecorded = new Map<string, number>();

  /** 트랜잭션 안에서: 완료 기록 대기분(표식·메모리)을 먼저 장부에 합친다. 합친 토큰 목록을 돌려준다. */
  const mergePending = (s: GiftState, pending: { token: string; at: number }[]) => {
    for (const p of pending) recordSent(s, p.token, p.at, kstDay(p.at));
    return pending.map(p => p.token);
  };
  const pendingNow = () => {
    const list = readMarkers(PENDING_PREFIX);
    for (const [token, at] of unrecorded) if (!list.some(p => p.token === token)) list.push({ token, at });
    return list;
  };
  const afterMerge = (tokens: string[]) => { for (const t of tokens) { unrecorded.delete(t); dropMarker(PENDING_PREFIX, t); dropMarker(ISSUED_PREFIX, t); } };

  /** 모든 한도 트랜잭션 안에서 최신 표식을 읽는다. 발급 후 미확정 몫은 날짜·숨김 시간과 무관하게 유지한다. */
  const reconcile = (s: GiftState, t: number) => {
    const merged = mergePending(s, pendingNow());
    for (const { token } of readMarkers(ISSUED_PREFIX)) {
      if (s.counted.includes(token)) continue;
      const hold = s.holds.find(h => h.token === token);
      if (hold) hold.issued = true;
      else s.holds.push({ token, until: t, issued: true });
    }
    s.holds = s.holds.filter(h => h.issued || (h.reservation
      ? t >= h.reservation.at && t - h.reservation.at < SERVER_RESERVATION_MS
      : h.until > t && h.until - t <= SHEET_HOLD_MS));
    return merged;
  };

  /** 한도가 남으면 새 토큰을 잡아 둔다. 오늘 보낸 수 + 모든 문서의 잡음(자정을 걸친 것도 오늘로)이 한도 미만일 때만. */
  const reserve = (via: ShareVia): Promise<void> => {
    if (reserving) return reserving;
    reserving = reserveOne(via).finally(() => { reserving = null; });
    return reserving;
  };
  const reserveOne = async (via: ShareVia) => {
    if (!enabled || !available || ready) return;
    const key = via === 'web' ? null : getDevice();
    if (via !== 'web' && !key) { gate = 'device'; return; }
    const candidate = newToken();
    if (!candidate || done.has(candidate)) { gate = 'random'; return; }
    const r = await atomic((s: GiftState) => {
      const t = now();
      const merged = reconcile(s, t);
      const used = (s.days[kstDay(t)] ?? 0) + s.holds.length;
      const reusable = s.holds.find(h => !h.issued && h.until <= t && h.reservation?.via === via && h.reservation.device === key);
      if (used > dayCap(via) || (!reusable && used >= dayCap(via))) return { ok: false as const, merged };
      const hold = reusable ?? { token: candidate, until: 0, reservation: { at: t, via, device: key, owner: candidate } };
      hold.until = t + READY_HOLD_MS;
      hold.reservation!.owner = candidate;
      if (!reusable) s.holds.push(hold);
      return { ok: true as const, merged, token: hold.token, until: hold.until, at: hold.reservation!.at };
    });
    if (r) afterMerge(r.value.merged);
    if (r?.value.ok !== true) { gate = r ? 'local_cap' : 'ledger'; return; }
    const { token } = r.value;
    // 설정 응답·기기 장부는 서버 한도를 보증하지 않는다. 이 토큰의 예약 성공 응답만 신뢰한다.
    if (!await register(token, now(), via, true, key)) { await release(token, candidate); return; }
    if (ready || !enabled || !available || r.value.until - now() < CLICK_MARGIN_MS) { gate = 'hold'; await release(token, candidate); return; }
    serverReservations.set(token, { via, device: key, until: r.value.at + SERVER_RESERVATION_MS, owner: candidate });
    ready = token; readyVia = via; holdUntil = r.value.until;
  };
  const release = (token: string, owner = serverReservations.get(token)?.owner) => atomic((s: GiftState) => {
    const hold = s.holds.find(h => h.token === token);
    if (!hold || hold.issued || hold.reservation?.owner !== owner) return;
    // 응답 유실이어도 서버가 처리했을 수 있다. 토큰은 남기고 다음 준비에서 같은 몫을 재확인한다.
    hold.until = 0;
  });
  /** 준비·시트의 잡음을 연장한다. 잡음이 사라졌으면(만료 뒤 다른 문서가 가져갔을 수 있음) 준비를 버린다. */
  const renew = async () => {
    const prepared = ready;
    const sheets = [...inSheet];
    if (!prepared && !sheets.length) return;
    const t = now();
    const r = await atomic((s: GiftState) => {
      reconcile(s, t);
      let alive = false;
      for (const h of s.holds) {
        if (h.token === prepared && h.reservation?.owner === serverReservations.get(prepared!)?.owner) { h.until = t + READY_HOLD_MS; alive = true; }
        else if (sheets.includes(h.token)) h.until = t + SHEET_HOLD_MS;
      }
      return alive;
    });
    if (ready !== prepared) return; // 그사이 클릭으로 내줬다
    if (!r?.value) ready = null; // 몫이 사라졌다(만료 뒤 다른 문서가 가져갔을 수 있음) — 다음 준비에서 다시 잡는다
    else holdUntil = t + READY_HOLD_MS;
  };

  /** 서버 등록 — at(공유 완료 시각)의 날짜로 한도를 센다. 같은 토큰 재등록은 서버가 차감 없이 «이미 있음»으로 답한다. */
  const register = async (token: string, at: number, via: ShareVia, reserve = false,
    key = via === 'web' ? null : getDevice()): Promise<boolean> => {
    if (via !== 'web' && !key) return false;
    try {
      const r = await request(reserve ? '/api/gift/reserve' : '/api/gift/issue', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(key ? { 'x-gift-device': key } : {}) },
        body: JSON.stringify({ token, at }), signal: AbortSignal.timeout(4000) });
      if (!r.ok) { if (reserve) gate = 'reserve_rejected'; return false; }
      const body = await r.json();
      if (reserve && body?.ok !== true) gate = 'reserve_rejected';
      return body?.ok === true;
    } catch { if (reserve) gate = 'reserve_error'; return false; }
  };
  const forget = (token: string) => atomic((s: GiftState) => { s.sent = s.sent.filter(x => x.token !== token); });

  /**
   * 공유는 됐지만 등록 응답을 못 받은 토큰만 다시 보낸다(5분 간격·최대 5회·47시간 안). 어느 문서가 보낼지는 장부 트랜잭션 안에서 정한다(중복 0).
   * 재시도는 처음 공유 완료 시각(at)을 그대로 보내므로 언제 처리돼도 공유한 날의 한도를 쓴다.
   */
  const flush = async (via: ShareVia) => {
    const t = now();
    const r = await atomic((s: GiftState) => {
      const merged = reconcile(s, now());
      s.sent = s.sent.filter(x => liveRetry(x, t));
      const due = s.sent.filter(x => t - x.last >= RETRY_GAP_MS).slice(0, 3);
      for (const x of due) { x.tries++; x.last = t; }
      return { merged, due: due.map(x => ({ token: x.token, at: x.at })) };
    });
    if (!r) throw new Error('gift ledger unavailable');
    afterMerge(r.value.merged);
    for (const x of r.value.due) if (await register(x.token, x.at, via)) await forget(x.token);
  };

  const refresh = (via: ShareVia): Promise<void> => {
    if (inflight) return inflight;
    inflight = (async () => {
      enabled = null;
      gate = 'config_pending';
      try {
        const response = await request('/api/gift/share-config', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error();
        const config = await response.json();
        if (typeof config.enabled !== 'boolean') throw new Error();
        enabled = config.enabled;
        lastKnownOff = config.enabled === false;
        // 꺼짐: 장부·발행에 접근하지 않는다. 미발급 준비 몫만 만료로 풀린다.
        if (!enabled) { gate = 'off'; available = false; ready = null; checkedAt = now(); return; }
        // 기기 시계가 서버와 크게 다르면 서버가 at 을 거부할 수 있다 — 선물 링크 없이 일반 공유.
        const skewOk = typeof config.now === 'number' && Math.abs(config.now - now()) <= CLOCK_TOLERANCE_MS;
        available = config.available === true && skewOk;
        gate = !skewOk ? 'clock' : !available ? 'unavailable' : 'not_ready';
        await flush(via);
        if (!available) { const r = ready; ready = null; if (r) await release(r); }
        else { await renew(); await reserve(via); }
        checkedAt = now();
      } catch { gate = enabled === true ? 'ledger' : 'config_error'; enabled = null; ready = null; available = false; checkedAt = 0; } finally { inflight = null; }
    })();
    return inflight;
  };

  /**
   * 링크 발급 직전 유일한 판정. 동기 저장·재읽기까지 성공해야 URL에 토큰을 넣는다.
   * 유효한 준비 몫이 남은 동안 먼저 영속 표식을 남기므로, 이후 IDB 연장/완료 저장이 모두 실패하거나
   * 문서가 닫혀도 다른 탭은 이 미확정 몫을 회수할 수 없다. 확인되지 않은 한도를 시간으로 복구하지 않는다.
   */
  const issueToken = (via: ShareVia): string | null => {
    const t = now();
    const server = ready ? serverReservations.get(ready) : undefined;
    if (enabled !== true || !available || !ready || readyVia !== via || done.has(ready) || t < checkedAt || t - checkedAt >= FRESH_MS
      || holdUntil - t < CLICK_MARGIN_MS || !server || server.via !== via || server.until <= t
      || (via !== 'web' && (!server.device || server.device !== getDevice()))) {
      if (enabled === true && available) gate = !ready ? gate : readyVia !== via ? 'platform' : done.has(ready) ? 'consumed'
        : t < checkedAt || t - checkedAt >= FRESH_MS ? 'stale' : holdUntil - t < CLICK_MARGIN_MS ? 'hold'
        : !server || server.via !== via || server.until <= t ? 'reservation' : 'device_changed';
      return null;
    }
    const token = ready;
    try {
      if (pendingNow().length) { gate = 'pending'; return null; }
      readMarkers(ISSUED_PREFIX);
      localStorage.setItem(ISSUED_PREFIX + token, String(t));
      if (localStorage.getItem(ISSUED_PREFIX + token) !== String(t)) throw new Error('gift marker not saved');
    } catch { gate = 'storage'; ready = null; return null; }
    ready = null;
    gate = 'consumed';
    inSheet.add(token);
    // 표식이 이미 영속적이므로 이 저장이 실패해도 몫은 풀리지 않는다. 재시도 타이머에 정확성을 의존하지 않는다.
    void atomic((s: GiftState) => {
      const hold = s.holds.find(h => h.token === token);
      if (hold) hold.issued = true;
    });
    return token;
  };

  const payload = (original: SharePayload, locale: string, via: ShareVia, ref?: string | null, giftOnly = false): SharePayload => {
    const lang = toGiftLang(locale);
    const token = issueToken(via);
    if (!token && !giftOnly) return original; // 일반 공유는 꺼짐·미확정에도 객체와 문자열을 보존한다.
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
      // 취소 확인도 저장을 마친 뒤에만 재사용한다. 저장 실패면 발급 표식과 미확정 몫을 유지한다.
      void atomic((s: GiftState) => {
        const hold = s.holds.find(h => h.token === usedToken);
        if (!hold) return null;
        hold.issued = false;
        hold.until = now() + READY_HOLD_MS;
        return hold.until;
      }).then(r => {
        if (!r?.value || done.has(usedToken!)) return;
        dropMarker(ISSUED_PREFIX, usedToken!);
        if (!ready && enabled && available) { ready = usedToken; readyVia = via; holdUntil = r.value; }
      });
      return;
    }
    if (done.has(usedToken)) return; // 중복 완료 통지는 한 번만 등록한다.
    done.add(usedToken);
    serverReservations.delete(usedToken);
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
  /** 플래그 꺼짐이 확정됐나(최초 미조회·조회 실패는 false). 기존 선물 입구의 운영 동일 경로 판정 전용. */
  const confirmedOff = () => lastKnownOff;

  return { refresh, payload, complete, confirmedOff, gateReason: () => gate };
}

export const giftPreparation = createGiftPreparation();
