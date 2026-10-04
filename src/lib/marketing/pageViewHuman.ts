// ============================================================================
// 웹 «사람 페이지뷰» — 홈·티커·SEO 페이지의 사람 방문 수 (2026-10-04)
// ----------------------------------------------------------------------------
// 왜: 폰 설치 클릭의 86~93% 가 홈 링크(home·home_hero)에서 나오는데 «홈 방문자 수»가 없어 홈 → 설치 버튼 클릭률을 몰랐다.
//   클릭 쪽은 clk:<sg|uc|wim>:<태그>:<ET날짜>(clickHuman.ts)가 사람만 센다. 이 파일은 그 «분모»다.
//
// 어디서 세나: 서버. [locale]/layout 이 headers()·cookies() 를 읽어 대상 페이지는 전부 매 요청 동적 렌더다
//   (실측 10/4: /ko·/en/flow/NVDA·/en/options-flow 모두 cache-control private,no-store · x-vercel-cache MISS 연속).
//   → 서버가 모든 요청을 본다. 클라이언트 비콘·새 함수 호출·새 클라이언트 JS 가 필요 없다.
//   ★ 나중에 이 페이지들을 ISR/CDN 캐시로 바꾸면 서버가 요청을 못 본다 — 그때는 미들웨어(waitUntil)나 비콘으로 옮길 것.
//
// 판정 = clickHuman.classifyClick 그대로(같은 규칙): 수집기 UA 아님 + prefetch 아님 + Accept-Language 있음
//   + Sec-Fetch-Mode=navigate·Dest=document. 사람 PV = «문서 착지»(바깥에서 들어옴·새로고침·새 탭)만이다.
//   router  Next 앱 라우터 자신의 fetch(사이트 안 <Link> 이동과 prefetch). Next 는 RSC·Next-Router-Prefetch 헤더를
//           서버 컴포넌트에 넘기기 전에 지운다(next/dist/server/app-render/strip-flight-headers — 미리보기 실측 10/4:
//           RSC 요청이 페이지에선 rsc 없는 cors/empty 로 보였다) → 둘을 가를 수 없다. 그래서 «same-origin·cors·empty GET»
//           은 세지도 쓰지도 않는다(prefetch 가 (home) 레이아웃을 돌려도 쓰기 0). 사이트 안 이동 PV 는 이 표에 없다.
//   server action(next-action) 도 쓰기 0. HEAD 는 서버 컴포넌트가 메서드를 몰라 사람 헤더를 갖췄으면 센다(브라우저는 이동에 HEAD 를 안 쓴다).
//   앱 웹뷰(sig_native 쿠키 · UA com.signumhq.app)는 기기 칸 'app' 으로 따로 센다(웹 방문 합계에 안 섞는다).
//   ※ 미들웨어의 'wv' 판정은 쓰지 않는다 — 카카오톡·인스타 등 안드로이드 인앱 브라우저(사람)도 'wv' 를 단다.
//
// 키(EC2 ElastiCache 전용 — 이 파일이 프록시에 직접 쓴다. redisClient 를 안 거치므로 Upstash 명령 0, 장애 때도 0):
//   pv:<페이지군>:<ko|en|ja|xx>:<ET날짜>  = {"<기기>|human": n, "<기기>|site:…", "<기기>|ref:…", "desktop|os:…"}
//   pvb:<페이지군>:<ET날짜>               = {"<기기>|bot|nolang|nonnav|nometa": n}   ← 봇 폭주가 사람 키를 덮어쓰지 않게 키를 나눈다
//   미리보기·로컬은 pvp: · pvbp: (운영 숫자 오염 방지). 45일 보존. 기기 = ios·android·desktop·app.
// 쓰기 상한: 인스턴스·키당 «1초에 한 번»(그 사이 들어온 것은 메모리에서 합쳐 다음 쓰기에 실음) · 키당 하루 상한(사람 5만·그 외 20만)
//   · 프록시 왕복 800ms 상한 · 실패하면 그 묶음은 버리고 30초 쉰다(덮어쓰기 금지 — 읽기 실패 때 절대 쓰지 않는다).
// 개인정보: 쿠키를 심지 않고, IP·UA·주소 원문을 남기지 않는다. 닫힌 목록의 분류 이름과 숫자만.
// 읽기: node scripts/mkt-funnel-human.js [일수]  (페이지군별 사람 PV · 설치 버튼 사람 클릭 · CTR · 기기별)
// ============================================================================

import { classifyClick, clickDevice, clickFields, type ClickClass, type HeaderLike } from './clickHuman';
import { refBucketFromUrl } from './referrer';

export const PV_GROUPS = ['home', 'ticker', 'tickers', 'options_flow', 'dark_pool', 'rankings', 'learn', 'how_it_works'] as const;
export type PvGroup = (typeof PV_GROUPS)[number];
export type PvClass = ClickClass | 'router';
export const PV_LOCALES = ['ko', 'en', 'ja', 'xx'] as const;

/** 같은 사람 판정(classifyClick) 그대로 + 앱 라우터 자신의 fetch(router)를 따로 가른다. 순수 함수. */
export function classifyPageView(h: HeaderLike, method = 'GET'): PvClass {
  const cls = classifyClick(h, method);
  if (cls !== 'nonnav') return cls;
  // RSC 헤더가 지워진 앱 라우터 fetch 의 모양: 같은 출처 · fetch 모드(cors/same-origin) · 목적지 없음(empty) · GET
  const mode = (h.get('sec-fetch-mode') || '').toLowerCase();
  if (method.toUpperCase() === 'GET' && (mode === 'cors' || mode === 'same-origin')
    && (h.get('sec-fetch-dest') || '').toLowerCase() === 'empty'
    && (h.get('sec-fetch-site') || '').toLowerCase() === 'same-origin') return 'router';
  return cls;
}

export type PvFields = { human: string[]; other: string[] };

/** 한 요청이 더할 필드 — null 이면 페이지뷰가 아니다(쓰기 0). 순수 함수. */
export function pageViewFields(h: HeaderLike, method: string, native: boolean): PvFields | null {
  if (method.toUpperCase() !== 'GET' || h.get('next-action') != null) return null;
  const cls = classifyPageView(h, method);
  if (cls === 'prefetch' || cls === 'router') return null;
  if (native) return cls === 'human' ? { human: ['app|human'], other: [] } : { human: [], other: [`app|${cls}`] };
  const device = clickDevice(h.get('user-agent') || '');
  if (cls !== 'human') return { human: [], other: [`${device}|${cls}`] };
  // 착지 = 링크 클릭과 똑같은 필드(기기|human · site · 리퍼러 분류 · PC 운영체제)
  return { human: clickFields(h, method, refBucketFromUrl(h.get('referer'))), other: [] };
}

export function pvLocale(raw: string | null | undefined): (typeof PV_LOCALES)[number] {
  const s = String(raw || '').toLowerCase();
  return s === 'ko' || s === 'en' || s === 'ja' ? s : 'xx';
}

export function pvKey(group: PvGroup, loc: string, day: string, vercelEnv = process.env.VERCEL_ENV): string {
  return `${vercelEnv === 'production' ? 'pv' : 'pvp'}:${group}:${pvLocale(loc)}:${day}`;
}
export function pvbKey(group: PvGroup, day: string, vercelEnv = process.env.VERCEL_ENV): string {
  return `${vercelEnv === 'production' ? 'pvb' : 'pvbp'}:${group}:${day}`;
}

export function etDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// ── 쓰기 ──────────────────────────────────────────────────────────────────────
type Counts = Record<string, number>;
/** get: 없으면 {} · 실패면 undefined(→ 그 묶음은 쓰지 않는다). set: 실패는 false. */
export type PvTransport = {
  get(key: string): Promise<Counts | undefined>;
  set(key: string, value: Counts, ttlSec: number): Promise<boolean>;
};

export const PV_TTL_SEC = 60 * 60 * 24 * 45;
export const PV_MIN_GAP_MS = 1000;      // 초당 상한: 인스턴스·키당 쓰기 1회/초
export const PV_CAP_HUMAN = 50_000;     // 일당 상한(키당, 분류 칸 합 — site/ref/os 세부 칸은 안 센다)
export const PV_CAP_OTHER = 200_000;

/** 분류 칸(`기기|분류`)만 더한다 — 세부 칸(`기기|site:…`)은 같은 방문의 중복이라 빼고. */
export function classTotal(o: Counts): number {
  let s = 0;
  for (const [f, n] of Object.entries(o)) if (/^[a-z]+\|[a-z]+$/.test(f)) s += Number(n) || 0;
  return s;
}

/**
 * 인스턴스 안에서 같은 키의 쓰기를 한 줄로 세우고(경합 없음), 쓰는 동안 들어온 증가분은 메모리에서 합쳐 다음 한 번에 싣는다.
 * add() 가 돌려주는 약속은 «그 증가분이 실린 쓰기»가 끝나면 풀린다(after() 가 그만큼만 기다린다).
 */
export class PvWriter {
  private pending = new Map<string, Counts>();
  private chain = new Map<string, Promise<void>>();
  private last = new Map<string, number>();
  private capped = new Set<string>();

  constructor(
    private t: PvTransport,
    private now: () => number = () => Date.now(),
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  add(key: string, fields: string[], cap: number): Promise<void> {
    if (!fields.length || this.capped.has(key)) return Promise.resolve();
    const open = this.pending.get(key);
    if (open) {                                   // 아직 안 떠난 묶음에 합류
      for (const f of fields) open[f] = (open[f] || 0) + 1;
      return this.chain.get(key) ?? Promise.resolve();
    }
    const batch: Counts = {};
    for (const f of fields) batch[f] = (batch[f] || 0) + 1;
    this.pending.set(key, batch);
    const run = (this.chain.get(key) ?? Promise.resolve()).then(() => this.flush(key, cap)).catch(() => {});
    this.chain.set(key, run);
    void run.then(() => { if (this.chain.get(key) === run) this.chain.delete(key); });
    return run;
  }

  private async flush(key: string, cap: number): Promise<void> {
    const wait = (this.last.get(key) ?? -Infinity) + PV_MIN_GAP_MS - this.now();
    if (wait > 0) await this.sleep(wait);
    const inc = this.pending.get(key);
    this.pending.delete(key);                     // 여기서부터 들어오는 것은 다음 묶음
    if (!inc) return;
    if (this.last.size > 500) this.last.clear();  // 메모리 상한(키는 하루 ~40개)
    this.last.set(key, this.now());
    const cur = await this.t.get(key);
    if (cur === undefined) return;                // 읽기 실패 → 쓰지 않는다(부분 값으로 덮어쓰기 금지)
    if (classTotal(cur) >= cap) { this.capped.add(key); return; }
    const next: Counts = { ...cur };
    for (const [f, n] of Object.entries(inc)) next[f] = (Number(next[f]) || 0) + n;
    await this.t.set(key, next, PV_TTL_SEC);
  }
}

// EC2 레디스 프록시 직접 호출 — redisClient 의 «EC2 실패·쿨다운 → Upstash» 경로를 일부러 피한다(Upstash 명령 0).
const EC2_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const ec2Auth = () => process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY || '';
const EC2_TIMEOUT_MS = 800;
let ec2DownUntil = 0;

export const ec2Transport: PvTransport = {
  async get(key) {
    const auth = ec2Auth();
    if (!auth || Date.now() < ec2DownUntil) return undefined;
    try {
      const r = await fetch(`${EC2_URL}/get?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${auth}` }, cache: 'no-store', signal: AbortSignal.timeout(EC2_TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const v = (await r.json())?.result ?? null;
      if (v == null) return {};
      if (typeof v !== 'object' || Array.isArray(v)) return undefined;   // 모르는 모양이면 건드리지 않는다
      return v as Counts;
    } catch {
      ec2DownUntil = Date.now() + 30_000;
      return undefined;
    }
  },
  async set(key, value, ttlSec) {
    const auth = ec2Auth();
    if (!auth || Date.now() < ec2DownUntil) return false;
    try {
      const r = await fetch(`${EC2_URL}/set`, {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(EC2_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, ttl: ttlSec }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return true;
    } catch {
      ec2DownUntil = Date.now() + 30_000;
      return false;
    }
  },
};

const writer = new PvWriter(ec2Transport);
const JOB_DEADLINE_MS = 4000;

/** 응답 뒤(after) 에서만 부른다. 절대 던지지 않고, 4초 넘게 붙잡지 않는다. */
export async function recordPageView(
  group: PvGroup, loc: string, day: string, f: PvFields, w: PvWriter = writer, deadlineMs = JOB_DEADLINE_MS,
): Promise<void> {
  try {
    const jobs: Promise<void>[] = [];
    if (f.human.length) jobs.push(w.add(pvKey(group, loc, day), f.human, PV_CAP_HUMAN));
    if (f.other.length) jobs.push(w.add(pvbKey(group, day), f.other, PV_CAP_OTHER));
    if (!jobs.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(jobs),
      new Promise<void>((r) => { timer = setTimeout(r, deadlineMs); }),
    ]);
    if (timer) clearTimeout(timer);
  } catch { /* 집계 실패가 화면에 닿지 않는다 */ }
}
