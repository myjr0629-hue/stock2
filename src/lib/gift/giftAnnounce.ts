/**
 * «🎁 친구에게 PRO 1개월 선물» 앱 내 안내 — 2026-10-08 (브랜치 feat/gift-announce, 대표 승인 «그렇게해»)
 *   ★2026-10-27 노출 확대(대표 «안내 노출 늘려서 선물 더 퍼지게 해», 브랜치 feat/gift-announce-reach)
 *
 * 왜: 기존 사용자에게 선물 기능을 알리는 가장 빠른 길은 푸시지만, 애플 4.5.4 는 홍보 푸시에 «따로 받은 동의»를 요구한다
 *   (지금 알림 동의는 브리핑용). 그래서 «앱 안»에서 작은 카드로 알린다. 화면 배치·하단 메뉴·광고 칸·문구는 그대로다.
 *
 * 10/27 확대 근거(운영 레디스 실측, ET 10/26): 앱 활성 기기 27(iOS 17·안드 10) · 대시보드 실행 43(«오늘 볼 것» 노출) → 띄움 2.
 *   10/7~10/26 누적 띄움 122 — 하루 활성 기기(16~69)보다 많다 = 돌아오는 사용자 대부분이 «평생 1회»를 이미 써 버렸다(옛 'seen').
 *   → 평생 1회 → «탭·보냄 전까지 최대 3회, 48시간 간격» + 대시보드 밖 «좋은 순간»(실적 캘린더·장마감 리포트를 읽은 뒤) 입구.
 *
 * 언제(전부 만족할 때, 한 실행에 최대 1회):
 *   ① 선물이 켜져 있다(/api/gift/config live — 꺼지면 이 안내도 없다)
 *   ② localStorage 를 쓸 수 있다(못 쓰면 횟수·간격을 지킬 수 없으니 띄우지 않는다)
 *   ③ 이 기기에서 선물 링크를 «누른» 적이 없다(안내·설정 카드·대시보드 단추 어디서든 — 'stop')
 *   ④ 띄운 횟수 < 3('cap') · 마지막으로 띄운 지 48시간이 지났다('gap') — 옛 표식(첫 띄움 시각 숫자)은 «1회»로 읽는다
 *   ⑤ 첫 안내(AppFirstRunOnboarding)를 «이번 실행 전에» 이미 마쳤다 — 막 설치한 사람의 첫 실행엔 띄우지 않는다('new')
 *   ⑥ 대시보드(홈) 화면이다('route') — 또는 «좋은 순간»(실적 캘린더·장마감 리포트 탭에서 GIFT_MOMENT_DWELL_MS 머문 뒤, useGiftMoment)
 *   ⑦ 이번 실행이 평점 요청 회차(앱 세션 3·10번째, lib/app/reviewMoments)가 아니고, 최근 60초 안에 OS 평점 시트를 요청하지 않았다
 *      (인텔 열람·담기·AI 한 줄 순간 — hooks/useReviewPrompt reviewRequestedAt) — OS 평점 시트와 겹치지 않게('review')
 *   ⑧ 다른 시트·결제 창(aria-modal)이 떠 있지 않다('busy')
 * 시점: 대시보드가 뜬 뒤 3.5초 — 첫 화면의 숫자를 본 다음(평점 요청 2.5초보다 늦게).
 *   «실행» = 웹뷰가 새로 뜬 것 + (10/27 저녁) 6시간 이상 백그라운드였다가 돌아온 것(resumeGiftRun — 아래 GIFT_RESUME_MIN_BG_MS).
 * 측정: 띄움 = share-hit 'open' · 누름 'tap' · 보냄 'sent'(표면 gift_pop) · 어디서 띄웠나 'at:dash|earn|report'
 *   · 막힌 이유 'block:<사유>'(실행당 사유마다 1회, 하루 합계 숫자만 — 식별자 없음) — scripts/mkt-gift.js 가 센다.
 *
 * 순수 함수(저장소·경로·시각을 인자로 받는다) — tests/giftAnnounce.test.ts 가 고정한다.
 */
import { APP_SESSION_REVIEW } from '@/lib/app/reviewMoments';
import type { GiftLang } from './gift';

export const GIFT_ANNOUNCE_KEY = 'signumhq.gift.announce.v1';
/** AppFirstRunOnboarding 의 STORAGE_KEY 와 같은 값('accepted' = 첫 안내를 마쳤다) */
export const ONBOARDING_DONE_KEY = 'signumhq.app.onboarding.v1';
export const GIFT_ANNOUNCE_DELAY_MS = 3500;
/** 시트가 떠 있어 미뤘을 때 한 번 더 볼 때까지 */
export const GIFT_ANNOUNCE_RETRY_MS = 5000;

export interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** 최대 띄움 횟수(탭·보냄 전까지) */
export const GIFT_ANNOUNCE_MAX = 3;
/** 띄움 사이 최소 간격 */
export const GIFT_ANNOUNCE_GAP_MS = 48 * 3600_000;
/** «좋은 순간» — 그 화면에 이만큼 머문 뒤 */
export const GIFT_MOMENT_DWELL_MS = 10_000;
/** OS 평점 시트를 요청한 뒤 이만큼은 띄우지 않는다(인텔 열람·담기·AI 한 줄 등 어떤 순간이든 — hooks/useReviewPrompt) */
export const GIFT_REVIEW_QUIET_MS = 60_000;
/**
 * ★2026-10-27 저녁(코디네이터 결정, ops-1028) 앱 재개 = 새 기회 — 네이티브 앱은 백그라운드에서 돌아와도 웹뷰를 다시 읽지 않아
 *   («app:resume» 만, NativeAppProvider) «한 실행 최대 1회»가 며칠씩 이어진다. 이만큼 이상 백그라운드였다가 돌아오면
 *   대시보드 입구를 «새 실행»처럼 다시 잰다. 48시간 간격·최대 3회·멈춤·첫 실행 제외·평점/시트 겹침 금지는 그대로(giftAnnounceBlock).
 */
export const GIFT_RESUME_MIN_BG_MS = 6 * 3600_000;
/** 백그라운드 중 타이머가 멈췄는지 보는 심장 박동 간격 — 박동 사이가 GIFT_SUSPEND_DRIFT_MS 보다 길면 그 사이 앱이 멈춰 있었다 */
export const GIFT_HEARTBEAT_MS = 60_000;
export const GIFT_SUSPEND_DRIFT_MS = 180_000;

/** «이번 실행» 상태 — GiftAnnounceHost 가 모듈에 하나 둔다(재마운트돼도 같은 웹뷰 실행이면 같은 값) */
export interface AnnounceRun {
  /** 이번 실행(또는 6시간+ 재개 뒤)에 띄웠다 */
  shown: boolean;
  /** 대시보드 입구 판정을 끝냈다 */
  dashDone: boolean;
  /** 이번 실행에 센 막힌 사유 */
  counted: Set<string>;
  /** 실행 시작 때 첫 안내를 마친 상태였나(null = 아직 안 읽음) */
  onboarded: boolean | null;
  /** 백그라운드로 간 시각(appStateChange isActive=false), 0 = 모름 */
  bgAt: number;
  /** 마지막 심장 박동 시각 */
  aliveAt: number;
  /** 가장 최근에 심장 박동이 끊겼던 구간 [stallFrom, stallTo](백그라운드에서 타이머가 멈춘 경우 — 비활성 알림이 늦게 와도
   *  재개 길이를 잰다). 재개 «바로 전»에 끝난 구간만 쓴다(stallTo 가 재개 시각에서 GIFT_SUSPEND_DRIFT_MS 안). 0 = 없음 */
  stallFrom: number;
  stallTo: number;
}
export const newAnnounceRun = (now = Date.now()): AnnounceRun =>
  ({ shown: false, dashDone: false, counted: new Set(), onboarded: null, bgAt: 0, aliveAt: now, stallFrom: 0, stallTo: 0 });

/**
 * 백그라운드로 갔다 — 처음 간 시각만 남긴다(재개 전 중복 알림은 무시).
 * 박동 검사를 먼저 한다: 알림이 JS 가 멈췄다 깨어난 «뒤»에 처리되면(늦은 알림) 그 끊김 구간의 끝 = 이 시각이 되어
 * resumeBgStart 가 이 알림을 «제때 온 것»으로 오인하지 않는다(관문 10271845).
 */
export function noteGiftBackground(run: AnnounceRun, now: number): void {
  noteGiftHeartbeat(run, now);
  if (!run.bgAt) run.bgAt = now;
}
/** 심장 박동 — 직전 박동과 간격이 크면(타이머가 멈췄었다) 그 구간을 남긴다(가장 최근 것으로 덮는다) */
export function noteGiftHeartbeat(run: AnnounceRun, now: number): void {
  if (now - run.aliveAt > GIFT_SUSPEND_DRIFT_MS) { run.stallFrom = run.aliveAt; run.stallTo = now; }
  run.aliveAt = now;
}
/**
 * 앱이 돌아왔다 — 백그라운드가 GIFT_RESUME_MIN_BG_MS 이상이면 «새 실행»으로 되돌리고 true.
 * 백그라운드 시작(resumeBgStart): 비활성 알림이 제때 왔으면 그 시각. 알림이 재개 «뒤»에 늦게 처리됐으면(JS 가 멈춰 있었다)
 *   바로 전 박동 끊김 구간의 «시작 + 박동 간격»(멈춘 시점의 가장 늦은 추정 = 짧게 잰다). 둘 다 없으면 재지 않는다. 재개마다 표식은 지운다.
 * 첫 안내 완료 여부는 지금 값으로 다시 읽는다 — 6시간 전에 첫 안내를 마친 사람은 이제 «막 설치한 첫 실행»이 아니다.
 */
export function resumeBgStart(run: AnnounceRun, now: number): number {
  const stall = run.stallTo > 0 && now - run.stallTo <= GIFT_SUSPEND_DRIFT_MS;   // 재개 바로 전에 끝난 끊김만
  if (run.bgAt && (!stall || run.bgAt < run.stallTo)) return run.bgAt;         // 비활성 알림이 제때 왔다
  if (stall) return run.stallFrom + GIFT_HEARTBEAT_MS;                          // 알림이 늦었거나 없다 — 짧게 잰다
  return NaN;
}
/** 방금 멈췄다 깨어났나 — 마지막 박동(또는 비활성 알림)이 끊김 기준보다 오래전(재개 처리 전에 깨어난 타이머) */
export const wokeFromSuspend = (run: AnnounceRun, now: number): boolean => now - run.aliveAt > GIFT_SUSPEND_DRIFT_MS;
/**
 * 위 머리말대로 재개를 판정한다(6시간 이상 = 새 실행으로 되돌리고 true).
 * 안내 시트가 아직 열려 있으면 되돌리지 않는다 — 닫자마자 같은 안내가 다시 뜨지 않게(관문 10271845).
 */
export function resumeGiftRun(run: AnnounceRun, now: number, onboardedNow: boolean, sheetOpen = false): boolean {
  const from = resumeBgStart(run, now);
  run.bgAt = 0;
  run.stallFrom = 0;
  run.stallTo = 0;
  run.aliveAt = now;
  if (sheetOpen || !Number.isFinite(from) || now - from < GIFT_RESUME_MIN_BG_MS) return false;
  run.shown = false;
  run.dashDone = false;
  run.counted = new Set();
  run.onboarded = onboardedNow;
  return true;
}

/** «좋은 순간» 알림 이벤트(useGiftMoment → GiftAnnounceHost) */
export const GIFT_MOMENT_EVENT = 'sg:gift-moment';
export type GiftMomentWhere = 'earn' | 'report';
export type GiftShowAt = 'dash' | GiftMomentWhere;

export type AnnounceBlock = 'off' | 'nostore' | 'stop' | 'cap' | 'gap' | 'new' | 'route' | 'review' | 'busy';
/** 집계하는 사유(닫힌 목록 — 서버 /api/share-hit 도 같은 목록만 받는다). 'off'(설정 꺼짐)·'route'(대시보드로 오면 다시 잰다)는 세지 않는다. */
export const GIFT_BLOCK_METRICS = ['nostore', 'stop', 'cap', 'gap', 'new', 'review', 'busy'] as const;

export interface AnnounceState {
  /** 띄운 횟수 */
  n: number;
  /** 마지막으로 띄운 시각(ms) */
  last: number;
  /** 선물 링크를 눌렀다(이 뒤로는 안내하지 않는다) */
  stop?: 1;
}

/**
 * 표식 읽기 — 없음 = 처음. 옛 표식(첫 띄움 시각 숫자, 10/8~10/27)은 «1회 · 그 시각»으로 읽는다.
 * 알 수 없는 값은 «한도 다 씀»으로 본다(매번 뜨는 것보다 안 뜨는 게 낫다). 저장소가 던지면 null.
 */
export function readAnnounceState(store: StoreLike | null): AnnounceState | null {
  if (!store) return null;
  let raw: string | null;
  try { raw = store.getItem(GIFT_ANNOUNCE_KEY); } catch { return null; }
  if (raw == null || raw === '') return { n: 0, last: 0 };
  if (/^\d{1,16}$/.test(raw)) return { n: 1, last: Number(raw) };
  try {
    const o = JSON.parse(raw) as { n?: unknown; last?: unknown; stop?: unknown };
    const n = Number(o?.n), last = Number(o?.last);
    if (Number.isInteger(n) && n >= 0 && Number.isFinite(last) && last >= 0) return o.stop ? { n, last, stop: 1 } : { n, last };
  } catch { /* 깨진 값 */ }
  return { n: GIFT_ANNOUNCE_MAX, last: 0 };
}

export interface AnnounceInput {
  /** 선물 설정이 켜져 있다(useGiftConfig 가 null 이 아님) */
  live: boolean;
  /** localStorage — 접근이 막히면 null */
  store: StoreLike | null;
  /** 이번 실행이 시작될 때 첫 안내를 이미 마친 상태였다 */
  onboardedAtMount: boolean;
  /** 지금 경로(window.location.pathname) */
  path: string;
  /** 다른 시트·결제 창이 떠 있다 */
  dialogOpen: boolean;
  /** 지금 시각(ms) */
  now: number;
  /** «좋은 순간» 입구 — 경로 검사(⑥ 대시보드)를 건너뛴다(부른 화면이 이미 그 순간을 확인했다) */
  moment?: boolean;
  /** 이번 실행에서 마지막으로 OS 평점 시트를 요청한 시각(ms, 없으면 0) */
  reviewAt?: number;
}

export const isDashPath = (path: string): boolean => /\/app-view\/dash\/?$/.test(path);
/** 실적 캘린더(«좋은 순간» 입구 — GiftAnnounceHost 가 경로로 잰다) */
export const isEarningsPath = (path: string): boolean => /\/app-view\/earnings\/?$/.test(path);

/** 띄우면 안 되는 이유(없으면 null = 띄운다). 검사 순서 = 위 머리말 ①~⑧. */
export function giftAnnounceBlock(i: AnnounceInput): AnnounceBlock | null {
  if (!i.live) return 'off';
  const st = readAnnounceState(i.store);
  if (!st) return 'nostore';
  if (st.stop) return 'stop';
  if (st.n >= GIFT_ANNOUNCE_MAX) return 'cap';
  if (st.n > 0 && i.now - st.last < GIFT_ANNOUNCE_GAP_MS) return 'gap';
  if (!i.onboardedAtMount) return 'new';
  if (!i.moment && !isDashPath(i.path)) return 'route';
  try {
    const n = parseInt(i.store!.getItem(APP_SESSION_REVIEW.storageKey) || '0', 10) || 0;
    if ((APP_SESSION_REVIEW.milestones ?? []).includes(n)) return 'review';
  } catch { /* 회차를 못 읽으면 겹침 검사만 건너뛴다 */ }
  if (i.reviewAt && i.now - i.reviewAt < GIFT_REVIEW_QUIET_MS) return 'review';
  if (i.dialogOpen) return 'busy';
  return null;
}

/** 띄운 순간 표식(횟수 +1 · 시각) — 쓰기에 실패하면 false(호출자는 띄우지 않는다: 매번 뜨는 것보다 안 뜨는 게 낫다). */
export function markGiftAnnounced(store: StoreLike | null, now = Date.now()): boolean {
  const st = readAnnounceState(store);
  if (!store || !st) return false;
  const next = JSON.stringify(st.stop ? { n: st.n + 1, last: now, stop: 1 } : { n: st.n + 1, last: now });
  try {
    store.setItem(GIFT_ANNOUNCE_KEY, next);
    return store.getItem(GIFT_ANNOUNCE_KEY) === next;
  } catch {
    return false;
  }
}

/** 선물 링크를 눌렀다(어느 입구든) — 이 기기에는 더 안내하지 않는다. 실패는 삼킨다(최악이면 최대 3회 안에서 한 번 더 뜬다). */
export function markGiftAnnounceStop(store: StoreLike | null): void {
  const st = readAnnounceState(store);
  if (!store || !st || st.stop) return;
  try { store.setItem(GIFT_ANNOUNCE_KEY, JSON.stringify({ n: st.n, last: st.last, stop: 1 })); } catch { /* 저장소 막힘 */ }
}

/** 첫 안내를 마쳤나 — 실행 시작 때 한 번 읽는다. */
export function readOnboarded(store: StoreLike | null): boolean {
  try {
    return !!store && store.getItem(ONBOARDING_DONE_KEY) === 'accepted';
  } catch {
    return false;
  }
}

/** 경로 첫 칸(/ko/app-view/… → ko)으로 문구 언어를 고른다 — 화면 언어와 같은 값. */
export const localeFromPath = (path: string): string => (path.split('/')[1] || 'en');

// 제목·부제(자동 갱신 고지 포함)는 GIFT_COPY(title·sub·subIosOnly)를 그대로 쓴다 — 설정 카드와 한 문장.
export interface GiftAnnounceCopy {
  eyebrow: string; cta: string; later: string; close: string;
  /** 줄 끝에서 쪼개면 안 되는 묶음(제목·부제) — iOS 웹뷰는 일본어 구절 줄바꿈(auto-phrase)을 몰라 «1か/月»처럼 끊는다(10/8 로컬 실측) */
  keep: string[];
}
export const GIFT_ANNOUNCE_COPY: Record<GiftLang, GiftAnnounceCopy> = {
  ko: { eyebrow: '새 기능', cta: '선물 링크 보내기', later: '설정에서 언제든 다시 보낼 수 있어요', close: '닫기',
    keep: ['PRO 1개월', '자동 갱신', '언제든 해지'] },
  en: { eyebrow: 'NEW', cta: 'Send gift link', later: 'You can send it again anytime from Settings', close: 'Close',
    keep: ['1 month', 'auto-renews', 'cancel anytime'] },
  ja: { eyebrow: '新機能', cta: 'ギフトリンクを送る', later: '設定からいつでも送れます', close: '閉じる',
    keep: ['PRO 1か月無料', 'PRO 1か月', 'プレゼント', 'iPhoneの', '友だち', 'リンクから', '始めると', '以降は', '自動更新、', 'いつでも解約可'] },
};

/** 글을 «묶음(nb=true)»과 나머지로 나눈다 — 화면은 묶음을 white-space:nowrap 으로 감싼다. 긴 묶음부터 맞춘다. */
export function keepTogether(text: string, keep: string[]): { t: string; nb: boolean }[] {
  const ks = keep.filter(Boolean).sort((a, b) => b.length - a.length);
  const out: { t: string; nb: boolean }[] = [];
  let rest = text;
  while (rest) {
    let at = -1, hit = '';
    for (const k of ks) {
      const i = rest.indexOf(k);
      if (i >= 0 && (at < 0 || i < at || (i === at && k.length > hit.length))) { at = i; hit = k; }
    }
    if (at < 0) { out.push({ t: rest, nb: false }); break; }
    if (at > 0) out.push({ t: rest.slice(0, at), nb: false });
    out.push({ t: hit, nb: true });
    rest = rest.slice(at + hit.length);
  }
  return out;
}
