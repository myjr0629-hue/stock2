// ============================================================================
// 블랙프라이데이 «앱 밖» 안내 푸시 — 순수 규칙 + 실행기(저장소·발송기 주입) (2026-11-26 밤, feat/bf-push-1126)
// ----------------------------------------------------------------------------
// 왜: 블프 할인(iOS 애플 오퍼 코드 «연간 첫 1년 50%» · 안드 Play bf-annual-50)은 앱 안에서만 보인다. 앱을 열지 않는 무료·체험 사용자에게
//   기간(11/27~12/2 07:00 UTC) 중 최대 두 번 «앱 밖»에서 알린다. 대표 11/26 «매출 극대화» · 11/16 «업계 표준 수익화 승인».
//
// 정책(동의 없이는 보내지 않는 곳):
//   · 애플 4.5.4 — 홍보 푸시는 «앱 화면의 동의 문구로 명시적으로 동의한 사람»만 + 앱 안 끄기. → iOS 는 혜택 알림 동의(preferences.promo === true)만.
//   · 한국 정보통신망법 50조 — 영리 목적 광고성 정보(앱 푸시 포함)는 사전 동의 · 제목 맨 앞 «(광고)» · 수신거부 방법 · 21~08시 별도 동의.
//     → 한국 수신자(기기 언어 ko 또는 시간대 Asia/Seoul)는 플랫폼과 무관하게 동의자만 · «(광고)» · 수신거부 안내 · 현지 19~20시에만.
//   · 그 밖 안드로이드(en·ja) — 구글 Play 는 자기 앱 혜택 알림에 별도 동의를 요구하지 않는다(업계 표준 = 알림 허용 + 앱 안 끄기).
//     → «혜택 알림»을 끄지 않았고(promo !== false) 알림 전체·시스템 권한이 켜진 기기. 본문에 끄는 곳(설정 › 알림)을 적는다.
// 공통: SIGNUM 앱 기기만 · 마스터 알림 켬 · 시스템 권한 «꺼짐» 보고 제외 · 180일 넘게 안 연 기기 제외 · 현지 19:00~20:59 · 모닝·마감 발송 창 피함.
// 두 번: A(시작 · 현지 11/27~11/29 저녁 · 6시간 안 앱을 열었으면 다음 저녁으로) · B(마지막 저녁 · 현지 12/1) · 기기당 각 1회 · 두 통 사이 20시간.
// 문구: 가격 숫자 없음(스토어프런트마다 다르다 — 탭하면 앱 시트가 그 기기의 실제 가격을 보여 준다) · 종료 시각은 그 기기 시간대로 정확히.
//   예측·투자 권유 없음 · 이모지 없음 · «선착순·마지막 기회» 같은 거짓 긴급성 없음(실제 종료 시각만).
// 탭: data.type=bf_offer → 앱(app-view/layout)이 대시보드로 연 뒤 그 플랫폼의 블프 시트(가격·조건·고지)를 연다 · 계측 push_open/push_bf.
// 상한: 회차 120 · 하루(ET) 400 · 기기 자리는 보내기 «전에» SET NX(실패도 자리를 놓지 않는다 — 중복보다 누락) · 끄기 3중(아래).
// 끄기: 환경 변수 BF_PUSH=off · Upstash bf-push:off(크론 ?off=1 / ?off=0) · 한 회차 ?dry=1(보내지 않음). 12/2 07:00 UTC 뒤엔 저절로 0.
// ============================================================================
import { createHash } from 'node:crypto';
import type { SignalPushItem, SendOutcome } from '@/lib/push/sendSignal';
import { parseRecord } from '@/lib/push/prefs';
import { inPushBlackout, sanitizeTz } from '@/lib/signals/plan';
import { promoAllowed, promoDefaultOn, promoKoreaRecipient, toPromoLoc, type PromoLoc } from '@/lib/push/promoConsent';

export const BF_PUSH_TYPE = 'bf_offer';
/** 블프 할인 끝(lib/app/blackFriday BF_VALID_UNTIL 과 같다 — 12/1 23:00 PT) */
export const BF_PUSH_END = Date.parse('2026-12-02T07:00:00Z');
/** 첫 발송 가능 시각(배포 당일 밤 실수 발송 방지 — 현지 11/27 저녁부터) */
export const BF_PUSH_START = Date.parse('2026-11-27T00:00:00Z');
/** 현지 발송 시간(시 단위 · 끝 미포함) — 한국 21시 전 · 저녁 */
export const BF_PUSH_HOURS: readonly [number, number] = [19, 21];
/** A 회차 현지 날짜 · B 회차 현지 날짜 */
export const BF_WAVE_DAYS = { a: ['2026-11-27', '2026-11-28', '2026-11-29'], b: ['2026-12-01'] } as const;
export type BfWave = 'a' | 'b';
/** B 는 끝나기 30분 전까지만 */
export const BF_B_MIN_LEFT_MS = 30 * 60_000;
export const BF_RECENT_OPEN_MS = 6 * 3600_000;
export const BF_STALE_MS = 180 * 86400_000;
export const BF_MAX_PER_RUN = 120;
export const BF_MAX_PER_DAY = 400;
export const BF_SENT_TTL_S = 20 * 86400;
export const BF_GAP_S = 20 * 3600;
export const BF_STATS_TTL_S = 60 * 86400;

export const BF_KEYS = {
  tokens: 'push:token_list',
  token: (t: string) => `push:tokens:${t}`,
  sent: (wave: BfWave, dev: string) => `push:bf:sent:${wave}:${dev}`,
  gap: (dev: string) => `push:bf:gap:${dev}`,
  day: (etDay: string) => `push:bf:day:${etDay}`,
  stats: (etDay: string) => `push:stats:bf:${etDay}`,
  off: 'bf-push:off',
};

/** 기기 키 — 토큰 원문을 키에 쓰지 않는다 */
export function bfDevKey(token: string): string {
  return createHash('sha256').update('bf1126\0' + String(token)).digest('hex').slice(0, 16);
}

export function bfPushEnvOff(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.BF_PUSH || '').trim().toLowerCase();
  return v === 'off' || v === '0' || v === 'false';
}

export type BfLoc = PromoLoc;
export const toBfLoc = toPromoLoc;

/** 시간대가 없으면 언어로 짐작(trial-push 와 같다) */
export function bfTimeZone(tz: unknown, loc: BfLoc): string {
  const s = sanitizeTz(tz);
  if (s) return s;
  return loc === 'ko' ? 'Asia/Seoul' : loc === 'ja' ? 'Asia/Tokyo' : 'America/New_York';
}

export const bfKoreaRecipient = promoKoreaRecipient;
export { promoAllowed, promoDefaultOn };

function localParts(now: number, tz: string): { day: string; hour: number } | null {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    const parts = Object.fromEntries(f.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour);
    if (!parts.year || !Number.isInteger(hour)) return null;
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour };
  } catch { return null; }
}

/** 지금 이 시간대에서 열린 회차(없으면 null) */
export function bfWaveNow(now: number, tz: string): BfWave | null {
  if (now < BF_PUSH_START || now >= BF_PUSH_END) return null;
  const lp = localParts(now, tz);
  if (!lp || lp.hour < BF_PUSH_HOURS[0] || lp.hour >= BF_PUSH_HOURS[1]) return null;
  if ((BF_WAVE_DAYS.a as readonly string[]).includes(lp.day)) return 'a';
  if ((BF_WAVE_DAYS.b as readonly string[]).includes(lp.day) && BF_PUSH_END - now >= BF_B_MIN_LEFT_MS) return 'b';
  return null;
}

/** 종료 시각을 그 기기 시간대·언어로(예: «12월 2일 오후 4시» · «Dec 2, 2:00 AM» · «12月2日 16:00») — ICU 판(로컬·서버)에 따라 달라지지 않게 직접 짠다 */
export function bfEndLabel(loc: BfLoc, tz: string): string {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(BF_PUSH_END)).map((x) => [x.type, x.value]));
    const M = Number(p.month), D = Number(p.day), h = Number(p.hour) % 24, mm = String(p.minute).padStart(2, '0');
    if (![M, D, h].every(Number.isInteger)) throw new Error('parts');
    const h12 = h % 12 === 0 ? 12 : h % 12;
    if (loc === 'ko') return `${M}월 ${D}일 ${h < 12 ? '오전' : '오후'} ${h12}시${mm === '00' ? '' : ` ${Number(mm)}분`}`;
    if (loc === 'ja') return `${M}月${D}日 ${h}:${mm}`;
    return `${MON[M - 1]} ${D}, ${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  } catch {
    return loc === 'ko' ? '12월 2일' : loc === 'ja' ? '12月2日' : 'Dec 2';
  }
}

export interface BfCopy { title: string; body: string }

/** 문구 — 한국 수신자는 «(광고)» + 수신거부 안내(법정 표기), 그 밖도 끄는 곳을 적는다 */
export function bfPushContent(wave: BfWave, loc: BfLoc, tz: string, korea: boolean): BfCopy {
  const end = bfEndLabel(loc, tz);
  if (loc === 'ko') {
    const title = wave === 'a' ? 'SIGNUM HQ 블랙프라이데이 연간 PRO 첫 1년 50%' : 'SIGNUM HQ 블프 연간 PRO 50% 할인 곧 종료';
    const body = wave === 'a'
      ? `미국 주식 앱 SIGNUM HQ 연간 PRO가 첫 1년 50% 할인 중이에요(${end}까지). 이후 정가로 자동 갱신되며 언제든 해지할 수 있어요. 탭하면 내 가격을 확인할 수 있어요.`
      : `미국 주식 앱 SIGNUM HQ 블랙프라이데이 할인이 ${end}에 끝나요. 연간 PRO 첫 1년 50%, 이후 정가 자동 갱신·언제든 해지. 탭하면 내 가격을 확인할 수 있어요.`;
    return korea
      ? { title: `(광고) ${title}`, body: `${body} 수신거부: 설정 › 알림 › 혜택·할인 알림` }
      : { title, body: `${body} 알림 끄기: 설정 › 알림` };
  }
  if (loc === 'ja') {
    const title = wave === 'a' ? 'SIGNUM HQ ブラックフライデー 年額PRO 初年度50%オフ' : 'SIGNUM HQ 年額PRO 50%オフ まもなく終了';
    const body = wave === 'a'
      ? `米国株アプリ SIGNUM HQ の年額PROが初年度50%オフです(${end}まで)。以降は通常価格で自動更新、いつでも解約できます。タップで価格を確認できます。通知オフ: 設定 › 通知`
      : `米国株アプリ SIGNUM HQ のブラックフライデー割引は${end}に終了します。年額PRO初年度50%オフ、以降は通常価格で自動更新・いつでも解約可。タップで価格を確認できます。通知オフ: 設定 › 通知`;
    return korea ? { title: `(광고) ${title}`, body: `${body} 수신거부: 설정 › 알림` } : { title, body };
  }
  const title = wave === 'a' ? 'SIGNUM HQ Black Friday 50% off annual PRO' : 'SIGNUM HQ Black Friday offer ends soon';
  const body = wave === 'a'
    ? `SIGNUM HQ, the US stock app: your first year of annual PRO is 50% off until ${end}. Then the regular price, auto-renews, cancel anytime. Tap to see your price. Turn off in Settings › Notifications.`
    : `The SIGNUM HQ Black Friday offer ends ${end}. First year of annual PRO 50% off, then the regular price, cancel anytime. Tap to see your price. Turn off in Settings › Notifications.`;
  return korea ? { title: `(광고) ${title}`, body: `${body} 수신거부: 설정 › 알림` } : { title, body };
}

export interface BfTokenRec {
  token?: string; app?: string; platform?: string; locale?: string; tz?: string;
  preferences?: { enabled?: boolean; promo?: boolean } | null; notifPerm?: boolean; lastSeenAt?: string; createdAt?: string;
}

export type BfSkip = 'no_record' | 'not_signum' | 'platform' | 'muted' | 'no_permission' | 'no_consent' | 'stale' | 'not_window' | 'recent_open';

/** 이 기기에 지금 보낼까 — {wave, ...} 또는 안 보내는 이유 */
export function bfPushDecision(rec: BfTokenRec | null, now: number): { send: true; wave: BfWave; loc: BfLoc; tz: string; korea: boolean; platform: 'ios' | 'android' } | { send: false; skip: BfSkip } {
  if (!rec || typeof rec !== 'object') return { send: false, skip: 'no_record' };
  if (rec.app && rec.app !== 'signum') return { send: false, skip: 'not_signum' };
  const platform = String(rec.platform || '').toLowerCase();
  if (platform !== 'ios' && platform !== 'android') return { send: false, skip: 'platform' };
  if (rec.preferences?.enabled === false) return { send: false, skip: 'muted' };
  if (rec.notifPerm === false) return { send: false, skip: 'no_permission' };
  if (!promoAllowed(rec)) return { send: false, skip: 'no_consent' };
  const seen = Date.parse(rec.lastSeenAt || rec.createdAt || '');
  if (!Number.isFinite(seen) || now - seen > BF_STALE_MS) return { send: false, skip: 'stale' };
  const loc = toBfLoc(rec.locale);
  const tz = bfTimeZone(rec.tz, loc);
  const wave = bfWaveNow(now, tz);
  if (!wave) return { send: false, skip: 'not_window' };
  // A 는 사흘 저녁 중 하나 — 방금 앱을 연 사람(앱 안 블프 시트를 이미 봤을 가능성)은 다음 저녁으로. B(마지막 저녁)는 미루지 않는다
  if (wave === 'a' && now - seen < BF_RECENT_OPEN_MS) return { send: false, skip: 'recent_open' };
  return { send: true, wave, loc, tz, korea: bfKoreaRecipient(loc, rec.tz), platform };
}

export function bfPushData(wave: BfWave): Record<string, string> {
  return { type: BF_PUSH_TYPE, w: wave };
}

// ── 실행기 ───────────────────────────────────────────────────────────────────
export interface BfStore {
  smembers(key: string): Promise<string[]>;
  mget(keys: string[]): Promise<unknown[]>;
  /** SET key val NX EX ttl → 잡았나 */
  setNx(key: string, val: string, ttlS: number): Promise<boolean>;
  incr(key: string, ttlS: number): Promise<number>;
  get(key: string): Promise<unknown>;
  hincr(key: string, fields: Record<string, number>, ttlS: number): Promise<void>;
}
export type BfSender = (items: SignalPushItem[]) => Promise<Map<string, SendOutcome>>;

export interface BfRunResult {
  on: boolean; reason?: string; dry: boolean; total: number; eligible: number; sent: number; fail: number; dead: number;
  skips: Record<string, number>; byWave: Record<string, number>; byLoc: Record<string, number>; byPlatform: Record<string, number>;
  preview?: { wave: BfWave; loc: BfLoc; korea: boolean; tz: string; title: string; body: string }[];
}

const isOn = (v: unknown) => v === 1 || v === '1' || v === true;

export async function runBfPush(opts: { store: BfStore; send: BfSender; now: number; dry: boolean; envOff: boolean; etDay: string; maxRun?: number; maxDay?: number }): Promise<BfRunResult> {
  const { store, send, now, dry, etDay } = opts;
  const maxRun = opts.maxRun ?? BF_MAX_PER_RUN;
  const maxDay = opts.maxDay ?? BF_MAX_PER_DAY;
  const res: BfRunResult = { on: true, dry, total: 0, eligible: 0, sent: 0, fail: 0, dead: 0, skips: {}, byWave: {}, byLoc: {}, byPlatform: {} };
  const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] || 0) + 1; };
  if (opts.envOff) return { ...res, on: false, reason: 'env_off' };
  if (isOn(await store.get(BF_KEYS.off))) return { ...res, on: false, reason: 'switch_off' };
  if (now < BF_PUSH_START || now >= BF_PUSH_END) return { ...res, on: false, reason: 'outside_period' };
  if (!dry && inPushBlackout(now)) return { ...res, on: false, reason: 'blackout' };

  const tokens = (await store.smembers(BF_KEYS.tokens)).filter((t) => typeof t === 'string' && t.length >= 20 && t.length <= 400);
  res.total = tokens.length;
  const picked: { token: string; d: Extract<ReturnType<typeof bfPushDecision>, { send: true }> }[] = [];
  for (let i = 0; i < tokens.length; i += 200) {
    const chunk = tokens.slice(i, i + 200);
    const raws = await store.mget(chunk.map(BF_KEYS.token));
    chunk.forEach((token, j) => {
      const d = bfPushDecision(parseRecord<BfTokenRec>(raws[j]), now);
      if (!d.send) { bump(res.skips, d.skip); return; }
      picked.push({ token, d });
    });
  }
  // 이미 그 회차를 받은 기기는 미리 걸러 센다(읽기만 — 자리는 아래에서 SET NX 로 잡는다)
  const sentRaw = picked.length ? await store.mget(picked.map((p) => BF_KEYS.sent(p.d.wave, bfDevKey(p.token)))) : [];
  const gapRaw = picked.length ? await store.mget(picked.map((p) => BF_KEYS.gap(bfDevKey(p.token)))) : [];
  const todo = picked.filter((p, i) => {
    if (sentRaw[i] != null) { bump(res.skips, 'sent'); return false; }
    if (gapRaw[i] != null) { bump(res.skips, 'gap'); return false; }
    return true;
  });
  res.eligible = todo.length;
  for (const p of todo) { bump(res.byWave, p.d.wave); bump(res.byLoc, p.d.korea ? `${p.d.loc}_kr` : p.d.loc); bump(res.byPlatform, p.d.platform); }

  if (dry) {
    const seen = new Set<string>();
    res.preview = [];
    for (const p of todo) {
      const k = `${p.d.wave}|${p.d.loc}|${p.d.korea}|${p.d.tz}`;
      if (seen.has(k) || res.preview.length >= 12) continue;
      seen.add(k);
      res.preview.push({ wave: p.d.wave, loc: p.d.loc, korea: p.d.korea, tz: p.d.tz, ...bfPushContent(p.d.wave, p.d.loc, p.d.tz, p.d.korea) });
    }
    return res;
  }

  const items: SignalPushItem[] = [];
  for (const p of todo) {
    if (items.length >= maxRun) { bump(res.skips, 'run_cap'); continue; }
    const dev = bfDevKey(p.token);
    // 하루 상한 — 먼저 예약(겹친 실행도 넘지 못한다)
    const n = await store.incr(BF_KEYS.day(etDay), 3 * 86400);
    if (n > maxDay) { bump(res.skips, 'day_cap'); break; }
    // 회차 자리 → 20시간 간격 자리 — 둘 다 잡혀야 보낸다(못 잡으면 다른 실행이 보냈거나 보내는 중)
    if (!(await store.setNx(BF_KEYS.sent(p.d.wave, dev), String(now), BF_SENT_TTL_S))) { bump(res.skips, 'sent_race'); continue; }
    if (!(await store.setNx(BF_KEYS.gap(dev), String(now), BF_GAP_S))) { bump(res.skips, 'gap_race'); continue; }
    const c = bfPushContent(p.d.wave, p.d.loc, p.d.tz, p.d.korea);
    items.push({ id: dev, token: p.token, platform: p.d.platform, title: c.title, body: c.body, data: bfPushData(p.d.wave), quiet: false, thread: 'bf1126' });
  }
  if (items.length) {
    const out = await send(items);
    for (const it of items) {
      const r = out.get(it.id) ?? 'fail';
      if (r === 'ok') res.sent++; else if (r === 'dead') res.dead++; else res.fail++;
    }
  }
  const stat: Record<string, number> = { runs: 1, eligible: res.eligible, sent: res.sent, fail: res.fail, dead: res.dead };
  // 회차·언어·플랫폼별 «보낸 시도» 수(성공·실패 합) — 판독용
  const seg = new Map(todo.map((p) => [bfDevKey(p.token), `w_${p.d.wave}_${p.d.korea ? p.d.loc + '_kr' : p.d.loc}_${p.d.platform}`]));
  for (const it of items) { const k = seg.get(it.id); if (k) stat[k] = (stat[k] || 0) + 1; }
  for (const [k, v] of Object.entries(res.skips)) stat[`skip_${k}`] = v;
  await store.hincr(BF_KEYS.stats(etDay), stat, BF_STATS_TTL_S);
  return res;
}
