/**
 * «✦ AI 오늘 볼 것» — 읽기·선별·생성·저장 (서버). 시험: tests/todayPicks.test.ts
 *
 *   읽기  GET /api/today-picks · 웹 /<lang>/today · 마감 푸시 → readPicks (EC2 레디스 mget 한 번 · AI 호출 0 · 기다리지 않는다)
 *   생성  /api/cron/today-picks (하루 5번 — 한국 저녁 조기판 1번 · 아침 08:00 ET 무렵 2번 · 마감 뒤 2번) → runPicks
 *
 * 선별 재료(전부 저장소에 «이미 있는 값» — 직접 공급사 호출 0):
 *   프리 배경만 기존 /api/live/quotes로 최대 5종목을 읽고, 선물·뉴스는 캐시를 읽는다.
 *   · 고래   intrinio:options:eod (또는 :lastgood) — 확정 미결제약정 증가(d). 묶음 한 벌 580KB, 읽기 1번.
 *   · 다크풀 finra:offexchange — services/darkPool.getDarkPoolBatchChecked(앱 칩이 읽는 그 읽기). 장외 비중·20일 평균 대비 배수.
 *   · 감마   structure:part:v2:0~7(미리 굽는 조각 8개)로 후보를 좁히고 → structure:v2:{T}(레벨 판본, 정의 게이트 통과분) 몇십 개만 mget.
 *   · 실적   lib/earningsConfirmed(회사 공지 일정) + services/impliedMoveService.readImpliedMoveRows(읽기 전용 · 벤더 0 · 쓰기 0).
 *   AI    크레딧 Haiku 5.5 만(withFreshTier — 크레딧이 안 되면 AWS 로 넘기지 않고 규칙 해설로 대신한다). 항목마다 한 호출(약 $0.0003).
 *
 * 끄는 법(재배포 없이): GET /api/cron/today-picks?off=1 (Authorization: Bearer CRON_SECRET) → Redis 키 todaypicks:off 에 값. 켜기 off=0.
 *   환경변수 TODAY_PICKS_OFF=1 (재배포 필요) 도 같다. 꺼지면 읽기는 빈 응답(카드·웹 목록·푸시 줄이 모두 사라진다), 생성은 0.
 * 넓힌 선별(11/18, 기본 켜짐): 큰 폭 등락(market:movers 캐시 + 무버 API 와 같은 세션·분할 보정 + 기존 시세 API 정규장 종가 대조)·오늘/내일 실적(예상 변동 없어도)을 앞에,
 *   옵션 계열은 상위 3개 중 1개까지. 옛 선별로 즉시 되돌리기: GET /api/cron/today-picks?broad=0 (Redis 키 todaypicks:broad:off) 또는 환경변수 TODAY_PICKS_BROAD=0(재배포). 다시 켜기 ?broad=1.
 * 하루 AI 호출 상한: TODAY_PICKS_DAILY_CAP(기본 60). 키는 todaypicks:* — TTL 이 있고 Upstash 복제 목록 밖이라 EC2 레디스에만 쓴다(Upstash 명령 0).
 */
import { getFromCache, mgetFromCache, setInCache, deleteFromCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';
import { getDarkPoolBatchChecked } from '@/services/darkPool';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { indexLevelRowFromStored } from '@/lib/ai/crossSectorLevels';
import { TP_PURPOSE } from '@/lib/ai/todayPicksLine';
import { buildPickV2Prompt, checkPickV2Why, systemFor } from '@/lib/ai/todayPicksV2';
import { newsForStock, providerSymbols } from '@/lib/ai/stockEvidence';
import { applyRegularClose, hasMoverSet, isCommonTickerSymbol, isRegularSessionOpen } from '@/services/moverSession';
import { readEodCloses } from '@/services/eodSnapshot';
import { isImplausibleMove } from '@/services/splitGuard';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { phaseOf, selectWeekEntries } from '@/lib/earningsWeek';
import { etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '@/lib/marketCalendar';
import { readPreMarketContext, readPickPreQuotes, readRegularQuotes, type RegularQuote } from '@/services/preMarketContext';
import { generationSession, type PreMarketContext } from '@/lib/ai/preMarketContext';
import { etWallTimeToMs, lastClosedSessionDate } from '@/lib/marketSession';
import { isEtf } from '@/lib/seo/etfSet';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
import { ruleTexts } from '@/lib/todayPicks/copy';
import {
    assemble, assembleBroad, darkCandidates, earningsCandidates, earningsCandidatesBroad, gammaCandidates, moverCandidates, moverEligible, moverScore, nextWeekdays, whaleCandidates,
    DARK_MIN_RATIO, DARK_MIN_VOLUME, DARK_MIN_PCTILE,
    type DarkRowIn, type EarnRowIn, type LevelRowIn, type MoverRowIn, type OptionsEodBundle, type PrevPick,
} from '@/lib/todayPicks/select';
import type { Cand, DarkFacts, DocStamp, EarnFacts, GammaFacts, LocText, MoverFacts, PickKind, Slot, TodayPick, TodayPicksDoc, WhaleFacts } from '@/lib/todayPicks/types';

export const TP_KEYS = {
    latest: 'todaypicks:v1:latest',
    slot: (etDate: string, slot: Slot) => `todaypicks:v1:${etDate}:${slot}`,
    off: 'todaypicks:off',
    /** 넓힌 선별 끄기(값이 있으면 옛 선별) — 카드·웹·푸시는 그대로 */
    broadOff: 'todaypicks:broad:off',
    day: (etDate: string) => `todaypicks:n:${etDate}`,
    lock: 'perf:lock:todaypicks',
} as const;
/** 문서 보존 — 금요일 마감 뒤 문서가 월요일 아침까지(휴장 연휴 포함) 읽히도록 */
export const TP_DOC_TTL_SEC = 6 * 24 * 3600;
/** 이보다 오래된 문서는 «없음»으로 본다(연휴 최장 4일 + 여유) */
export const TP_MAX_AGE_MS = 5 * 24 * 3600 * 1000;
export const TP_OFF_TTL_SEC = 90 * 24 * 3600;

const OPT_KEY = 'intrinio:options:eod';
const OPT_LASTGOOD_KEY = 'intrinio:options:eod:lastgood';
const PART_KEY = (i: number) => `structure:part:v2:${i}`;
const STRUCT_KEY = (t: string) => `structure:v2:${t}`;
const STRUCT_LASTGOOD = (t: string) => `structure:lastgood:${t}:auto`;
const MIN_OPENING_TICKERS = 50;
const GAMMA_SHORTLIST = 40;

export function picksOffEnv(): boolean { return process.env.TODAY_PICKS_OFF === '1'; }
/** 넓힌 선별 — 기본 켜짐. TODAY_PICKS_BROAD=0 이면 끔(재배포) · Redis todaypicks:broad:off 가 있으면 끔(즉시) */
export function broadOnEnv(): boolean { return process.env.TODAY_PICKS_BROAD !== '0'; }
export async function broadOn(): Promise<boolean> {
    if (!broadOnEnv()) return false;
    return !(await getFromCache<any>(TP_KEYS.broadOff).catch(() => null));
}
export function dailyCap(): number {
    const n = Number(process.env.TODAY_PICKS_DAILY_CAP);
    return Number.isFinite(n) && n >= 0 ? n : 60;
}

// ── 읽기 ──────────────────────────────────────────────────────────────────────────

const isDoc = (d: any): d is TodayPicksDoc => !!d && d.v === 1 && Array.isArray(d.items) && typeof d.at === 'number' && typeof d.etDate === 'string';

export interface ReadResult { doc: TodayPicksDoc | null; off: boolean; ageMs: number | null }

/** 끄기 스위치·문서를 mget하고 FINRA 사실을 같은 원천에서 대조한다. 너무 오래됐으면 문서는 null. */
export async function readPicks(now = Date.now()): Promise<ReadResult> {
    const started = Date.now();
    if (picksOffEnv()) return { doc: null, off: true, ageMs: null };
    const [off, doc] = await mgetFromCache<any>([TP_KEYS.off, TP_KEYS.latest]).catch(() => [null, null] as const);
    if (off) return { doc: null, off: true, ageMs: null };
    if (!isDoc(doc) || !doc.items.length) return { doc: null, off: false, ageMs: null };
    const ageMs = now - doc.at;
    if (ageMs > TP_MAX_AGE_MS) return { doc: null, off: false, ageMs };
    // 같은 날짜 정정은 사실을 교체하고, 다음 날짜는 선별 근거가 유지될 때만 갱신한다.
    // AI 해설에도 옛 배수가 들어갈 수 있어 값이 바뀐 항목은 기존 결정형 해설로 다시 조립한다.
    const symbols = doc.items.filter((p: TodayPick) => p.kind === 'darkpool').map((p: TodayPick) => p.ticker);
    // API의 2.5초 읽기 예산 안에서만 원천을 기다린다. 실패/시간 초과로 기존 카드를 비우지 않는다.
    const budget = Math.max(0, 2_200 - (Date.now() - started));
    let current: Awaited<ReturnType<typeof getDarkPoolBatchChecked>> | null = null;
    if (symbols.length && budget > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            current = await Promise.race([getDarkPoolBatchChecked(symbols).catch(() => null),
                new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), budget); })]);
        } finally { if (timer) clearTimeout(timer); }
    }
    const items = doc.items.map((p: TodayPick) => {
        if (p.facts.kind !== 'darkpool' || !current?.ok) return p;
        const r = current.map[p.ticker];
        if (!r?.date || r.date < p.asOf || !Number.isFinite(r.pct) || !(r.volRatio != null && Number.isFinite(r.volRatio)) || !(r.volume > 0)) return p;
        if (!(r.pct > 0 && r.pct < 100) || r.volRatio < 0 || !Number.isFinite(r.volume)
            || (r.volP != null && (!Number.isFinite(r.volP) || r.volP < 0 || r.volP > 100))) return p;
        const selected = r.volRatio >= DARK_MIN_RATIO && r.volume >= DARK_MIN_VOLUME
            && (r.volP == null || r.volP >= DARK_MIN_PCTILE);
        // 다음 날짜 감소는 별개 관측이다. 같은 날짜 정정은 기존 급증 수치를 남길 근거가 아니다.
        if (r.date > p.asOf && !selected) return p;
        const facts: DarkFacts = { kind: 'darkpool', date: r.date, pct: Math.round(r.pct * 10) / 10,
            ratio: Math.round(r.volRatio * 10) / 10, volume: r.volume, marketAvg: r.marketAvg };
        const text = ruleTexts(p.ticker, facts);
        if (JSON.stringify(facts) === JSON.stringify(p.facts) && selected) return p;
        // 선별을 취소한 정정에는 기존 사실 문장을 재사용한다(새 라벨·문구 추가 없음).
        const why = selected ? text.fallback : text.what;
        return { ...p, asOf: r.date, facts, what: text.what, why, push: text.push, whyAi: false };
    });
    // 넓힌 선별 문서: 읽을 때도 «이미 나온» 실적은 걷어 낸다(관문 11/18 — 크론 사이·크론 실패·다음 날 후보 0에도 끝난 발표가 «실적 임박»으로 남지 않게). 쓰기 없음.
    const shown = doc.sel === 'broad1' ? items.filter((p: TodayPick) => !(p.facts.kind === 'earnings' && releasedBroad(p.facts, now))) : items;
    if (!shown.length) return { doc: null, off: false, ageMs };
    return { doc: { ...doc, items: shown }, off: false, ageMs };
}

// ── 재료 읽기 ───────────────────────────────────────────────────────────────────────

/** EC2 프록시 직접 읽기(공용 클라이언트의 회로 차단기를 크게 읽다가 열지 않는다 — services/institutionalFlow.proxyGet 와 같은 방식) */
async function proxyJson(key: string, timeoutMs = 6000): Promise<any | null> {
    const base = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
    const auth = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || '';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetch(`${base}/get?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${auth}` }, signal: ctl.signal, cache: 'no-store' });
        if (!res.ok) return null;
        const raw = await res.json();
        return typeof raw?.result === 'string' ? JSON.parse(raw.result) : raw?.result ?? null;
    } catch { return null; } finally { clearTimeout(timer); }
}

function openingTickers(b: any): number {
    let n = 0;
    for (const v of Object.values<any>(b?.tickers || {})) if ((v?.top || []).some((c: any) => (c?.d ?? 0) > 0)) n++;
    return n;
}
const usableBundle = (b: any): boolean => !!b?.tickers && !isNonTradingDay(b.date) && openingTickers(b) >= MIN_OPENING_TICKERS;

/** 옵션 EOD 묶음 — 오늘 것이 «시장 전체를 말할 만하면» 그것, 아니면 직전 정상본(institutionalFlow.readOptionsEod 와 같은 규칙) */
export async function loadBundle(): Promise<OptionsEodBundle | null> {
    const live = await proxyJson(OPT_KEY);
    if (usableBundle(live)) return live;
    const last = await proxyJson(OPT_LASTGOOD_KEY);
    return usableBundle(last) ? last : null;
}

async function loadDark(universe: string[], oi: Record<string, number>): Promise<DarkRowIn[]> {
    const r = await getDarkPoolBatchChecked(universe);
    if (!r.ok) return [];
    return Object.values(r.map).map((d) => ({ ticker: d.ticker, pct: d.pct, volume: d.volume, volRatio: d.volRatio, volP: d.volP, date: d.date, marketAvg: d.marketAvg, oi: oi[d.ticker] ?? null }));
}

/** 조각 8개(미리 구운 요약)로 후보를 좁히고, 좁힌 종목만 레벨 판본(정의 게이트 통과분)을 읽는다 */
async function loadGammaRows(universe: string[], oi: Record<string, number>, todayEt: string, now: number): Promise<LevelRowIn[]> {
    const uni = new Set(universe);
    const parts = await Promise.all(Array.from({ length: 8 }, (_, i) => getFromCache<{ rows?: any[] }>(PART_KEY(i)).catch(() => null)));
    const pre: Array<{ t: string; oi: number }> = [];
    for (const p of parts) {
        for (const r of p?.rows || []) {
            const t = r?.t;
            if (!t || !uni.has(t) || !(r.px > 0) || !((oi[t] || 0) >= 500_000)) continue;
            const near = (lv: unknown, max: number) => typeof lv === 'number' && lv > 0 && (Math.abs(r.px - lv) / r.px) * 100 <= max;
            if (near(r.fl, 2.0) || near(r.mp, 1.5)) pre.push({ t, oi: oi[t] });
        }
    }
    const short = pre.sort((a, b) => b.oi - a.oi).slice(0, GAMMA_SHORTLIST).map((x) => x.t);
    if (!short.length) return [];
    const keys = [...short.map(STRUCT_KEY), ...short.map(STRUCT_LASTGOOD)];
    const vals = await mgetFromCache<{ data: any; timestamp: number }>(keys).catch(() => keys.map(() => null));
    const out: LevelRowIn[] = [];
    short.forEach((t, i) => {
        const cands = [vals[i], vals[short.length + i]]
            .filter((v): v is { data: any; timestamp: number } => !!v?.data && !(typeof v.data.expiration === 'string' && v.data.expiration < todayEt))
            .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
        const row = indexLevelRowFromStored(t, cands[0], now);
        if (row) out.push({ ticker: t, spot: row.spot, expiration: row.expiration, chainDate: row.chainDate, maxPain: row.maxPain, gammaFlip: row.gammaFlip, oi: oi[t] || 0 });
    });
    return out;
}

async function loadEarnings(now: number, dates: string[]): Promise<EarnRowIn[]> {
    if (!dates.length) return [];
    const entries = selectWeekEntries(CONFIRMED_EARNINGS, dates[0], dates[dates.length - 1]).filter((e) => dates.includes(e.date));
    if (!entries.length) return [];
    const today = etDateOf(now);
    const rows = await readImpliedMoveRows(entries.map((e) => ({ ticker: e.ticker, after: e.date, timing: e.hour === 'bmo' ? 'bmo' : e.hour === 'amc' ? 'amc' : 'unknown' })), today).catch(() => []);
    return entries.map((e, i) => ({
        ticker: e.ticker, date: e.date, hour: e.hour, etTime: e.etTime ?? null,
        impliedPct: rows[i]?.impliedMovePct ?? null, impliedExpiry: rows[i]?.expiry ?? null, session: rows[i]?.session ?? null,
        done: phaseOf(e.date, e.hour, now) === 'done',
    }));
}

// ── 큰 폭 등락(11/18) ─────────────────────────────────────────────────────────────

const MOVERS_KEY = 'market:movers:all:v4';
const MOVERS_LASTGOOD_KEY = 'market:movers:last_good:v4';
const NEWS_DIGEST_KEY = 'guardian:news:digest:v2';
/** 정규장 종가 대조는 상위 몇 종목만(기존 시세 API 한 번) */
const MOVER_VERIFY_MAX = 8;
/** 대조값과 캐시값 등락률 차이가 이보다 크면 다른 세션·오염으로 보고 뺀다(%p) */
const MOVER_MAX_DRIFT = 1.0;
/** 시장 전체를 다룬 기사(종목 태그가 붙어도 그 종목 이야기가 아니다) */
const MARKET_WIDE = /stock market|stocks? to watch|s&p ?500|\bdow\b|nasdaq|futures|market (?:wrap|today|movers)|premarket movers|biggest movers|\bmovers\b/i;

const fin = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export interface MoverLoad { rows: MoverRowIn[]; session: string | null; notes: string[] }

/**
 * 큰 폭 등락 재료 — 무버 캐시(읽기만: 새로 계산·쓰기 없음) → 무버 API 와 같은 정규장 종가 보정·분할 의심 판정(의심 행은 뺀다) → «끝난 세션»만 → 시세 API 정규장 종가로 대조.
 *   · 정규장이 열려 있으면 0(장중 값은 끝난 세션이 아니다).
 *   · EOD 로 다시 만든 행(regularCloseFrom = 마지막으로 끝난 세션)은 그 세션 확정 종가.
 *   · 그 밖의 행은 스냅샷이 «그 세션 날짜·마감 30분 전 이후»에 찍혔고 시세 API 의 정규장 종가(같은 날짜)로 대조될 때만 — 숫자는 대조값을 쓴다.
 *   전날 값을 «오늘»로 쓰지 않는다: 항목의 날짜(session)는 언제나 그 등락이 속한 세션이다.
 */
export async function loadMovers(now: number, deps: { quotes?: (t: string[]) => Promise<Record<string, RegularQuote> | null> } = {}): Promise<MoverLoad> {
    const notes: string[] = [];
    if (isRegularSessionOpen(now)) return { rows: [], session: null, notes: ['movers:regular-open'] };
    const [cur, lg] = await mgetFromCache<any>([MOVERS_KEY, MOVERS_LASTGOOD_KEY]).catch(() => [null, null]);
    const src = [cur, lg].filter(hasMoverSet).sort((a, b) => (Number(b?.ts) || 0) - (Number(a?.ts) || 0))[0];
    if (!src) return { rows: [], session: null, notes: ['movers:none'] };
    const session = lastClosedSessionDate(now);
    const regular = await applyRegularClose({ value: src.value ?? [], gainers: src.gainers ?? [], losers: src.losers ?? [] }, now);
    // 분할 의심(무버 API 의 splitGuard 판정 isImplausibleMove)은 보정하지 않고 뺀다 — 공급사 분할 조회 0 · 설명 못 하는 숫자는 내보내지 않는다
    // 무버 목록은 등락률 상위 30이 소형주로 차서 대형주 큰 폭 등락이 빠진다(11/17 실측: 목록 4종목 vs 같은 세션 EOD 전 종목 12종목 — CRM −9.5%·NOW −6.5%·UNH −5.4% 등).
    // EOD 가 «마지막으로 끝난 세션»과 같은 날짜일 때(= applyRegularClose 가 쓴 그 날짜 게이트)만 같은 EOD 전 종목을 후보에 더한다 — 같은 원천·같은 세션, 새 읽기는 프로세스 캐시(5분).
    const eod = (regular.value ?? []).some((m: any) => m?.regularCloseFrom === session) ? await readEodCloses().catch(() => null) : null;
    const eodRows: any[] = [];
    if (eod?.date === session) for (const [t, e] of eod.rows) {
        if (!isCommonTickerSymbol(t) || !(e.c >= 1) || !(e.v >= 10000)) continue;
        eodRows.push({ ticker: t, price: e.c, changePercent: e.chgPct, value: e.c * e.v, regularCloseFrom: eod.date });
    }
    const lists = [...(regular.value ?? []), ...(regular.gainers ?? []).filter((m: any) => m?.changePercent > 0), ...(regular.losers ?? []).filter((m: any) => m?.changePercent < 0), ...eodRows]
        .filter((m: any) => !isImplausibleMove(Number(m?.price) || 0, Number(m?.changePercent) || 0));
    const ts = Number(src.ts) || 0;
    // 스냅샷은 그 세션 날짜·마감 «뒤»에 찍힌 것만(관문 11/18: 마감 전 값은 장중 거래대금이다)
    const snapOk = ts > 0 && ts <= now && etDateOf(ts) === session && etMinutesOf(ts) >= sessionCloseMinutes(session);
    const byT = new Map<string, { ticker: string; price: number; changePct: number; value: number; basis: 'eod' | 'snap' }>();
    for (const r of lists) {
        const t = String(r?.ticker || '').toUpperCase();
        if (!t || byT.has(t) || r?.splitAdjusted) continue;   // 분할 보정 행은 설명이 필요해 이 카드에서 뺀다
        const basis = r?.regularCloseFrom === session ? 'eod' : !r?.regularCloseFrom && snapOk ? 'snap' : null;
        const price = fin(r?.price), chg = fin(r?.changePercent), value = fin(r?.value);
        if (!basis || price == null || chg == null || value == null) continue;
        byT.set(t, { ticker: t, price, changePct: chg, value, basis });
    }
    const pre = [...byT.values()].filter((r) => moverEligible(r, isEtf)).sort((a, b) => moverScore(b) - moverScore(a) || a.ticker.localeCompare(b.ticker)).slice(0, MOVER_VERIFY_MAX);
    if (!pre.length) return { rows: [], session, notes: [byT.size ? 'movers:none-eligible' : 'movers:no-session-rows'] };
    const quotes = await (deps.quotes ?? readRegularQuotes)(pre.map((r) => r.ticker)).catch(() => null);
    if (!quotes) notes.push('movers:quotes-unavailable');
    const digest = await getFromCache<any>(NEWS_DIGEST_KEY).catch(() => null);
    // 보도 창: 전 거래일 마감 ~ 이 세션 마감(관문 11/18 — 세션이 끝난 뒤 나온 보도를 끝난 등락의 근거로 쓰지 않는다)
    const newsWindowStart = etWallTimeToMs(prevTradingDate(session), sessionCloseMinutes(prevTradingDate(session)));
    const newsWindowEnd = Math.min(now, etWallTimeToMs(session, sessionCloseMinutes(session)));
    const rows: MoverRowIn[] = [];
    for (const r of pre) {
        const q = quotes?.[r.ticker];
        let price = r.price, chg = r.changePct;
        if (q && q.regularDate === session && (q.regularKind == null || q.regularKind === 'close') && q.price != null && q.price > 0 && q.chg != null) {
            if (Math.abs(q.chg - r.changePct) > MOVER_MAX_DRIFT) { notes.push(`movers:drift:${r.ticker}`); continue; }
            price = q.price; chg = q.chg;
        } else if (r.basis === 'snap') { notes.push(`movers:unverified:${r.ticker}`); continue; }   // 스냅샷 행은 대조돼야만 쓴다
        if (!moverEligible({ ticker: r.ticker, price, changePct: chg, value: r.value }, isEtf)) continue;
        const earn = CONFIRMED_EARNINGS.find((e) => e.ticker === r.ticker && ((e.date === session && e.hour === 'bmo') || (e.date === prevTradingDate(session) && e.hour === 'amc')));
        const news = (Array.isArray(digest?.items) ? digest.items : []).find((n: any) => {
            const h = typeof n?.headline === 'string' ? n.headline.trim() : '';
            const at = Date.parse(String(n?.publishedAt || ''));
            const symbols = providerSymbols(n);
            return h.length >= 12 && h.length <= 300 && !MARKET_WIDE.test(h) && Number.isFinite(at) && at >= newsWindowStart && at <= newsWindowEnd
                && symbols.length <= 2 && newsForStock({ text: '', headline: h, symbols }, r.ticker);
        });
        rows.push({ ticker: r.ticker, session, price, changePct: chg, value: r.value, shownValue: r.basis === 'eod' ? r.value : null,
            earnings: earn ? { date: earn.date, hour: earn.hour as 'bmo' | 'amc' } : null,
            news: news ? { headline: String(news.headline).trim(), publishedAt: String(news.publishedAt) } : null });
    }
    return { rows, session, notes };
}

/**
 * 넓힌 선별의 «발표가 이미 나왔나» — 옛 phaseOf(장후 18:00 ET 까지 «당일») 보다 앞당긴다(관문 11/18): 공지 시각(etTime)이 있으면 그 시각,
 * 없으면 개장 전 발표는 09:30 ET · 장 마감 후·시각 미정은 그날 정규장 마감(조기 폐장 포함). «오늘 볼 것»에는 아직 나오지 않은 발표만 둔다.
 */
export function releasedBroad(r: { date: string; hour: string; etTime?: string | null }, now: number): boolean {
    const today = etDateOf(now);
    if (r.date < today) return true;
    if (r.date > today) return false;
    const min = etMinutesOf(now);
    const m = typeof r.etTime === 'string' ? r.etTime.match(/^(\d{2}):(\d{2})/) : null;
    if (m) return min >= Number(m[1]) * 60 + Number(m[2]);
    return r.hour === 'bmo' ? min >= 9 * 60 + 30 : min >= sessionCloseMinutes(today);
}

export interface Gathered {
    mover: Cand<MoverFacts>[];
    whale: Cand<WhaleFacts>[]; darkpool: Cand<DarkFacts>[]; gamma: Cand<GammaFacts>[]; earnings: Cand<EarnFacts>[];
    stamp: DocStamp;
    notes: string[];
    earlyEarnDates: string[];
}

/** 재료를 읽어 종류별 후보와 «자료 날짜 표식(stamp)»을 만든다. 읽기 실패는 그 종류만 빠지고 notes 에 남는다. */
export async function gather(now = Date.now(), o: { broad?: boolean } = {}): Promise<Gathered> {
    const todayEt = etDateOf(now);
    const lastClosed = lastClosedSessionDate(now);
    const notes: string[] = [];
    const bundle = await loadBundle();
    if (!bundle) notes.push('bundle:none');
    const universe = Object.keys(bundle?.tickers || {}).filter((t) => /^[A-Z][A-Z0-9.]{0,6}$/.test(t) && !isEtf(t));
    const oi: Record<string, number> = {};
    for (const t of universe) oi[t] = (Number(bundle!.tickers![t]?.callOI) || 0) + (Number(bundle!.tickers![t]?.putOI) || 0);

    // 실적 창: 앞으로 평일 3일(발표가 끝난 것은 후보에서 빠진다) · 오늘/내일 발표는 카드 맨 앞
    const dates = nextWeekdays(todayEt, 3);
    const earlyEarnDates = dates.slice(0, 2);
    const [dark, gammaRows, earn, movers] = await Promise.all([
        universe.length ? loadDark(universe, oi).catch((): DarkRowIn[] => []) : Promise.resolve([] as DarkRowIn[]),
        universe.length ? loadGammaRows(universe, oi, todayEt, now).catch((): LevelRowIn[] => []) : Promise.resolve([] as LevelRowIn[]),
        loadEarnings(now, dates).catch((): EarnRowIn[] => []),
        o.broad ? loadMovers(now).catch((): MoverLoad => ({ rows: [], session: null, notes: ['movers:error'] })) : Promise.resolve(null),
    ]);
    if (movers) notes.push(...movers.notes.slice(0, 6));
    if (universe.length && !dark.length) notes.push('finra:none');
    if (universe.length && !gammaRows.length) notes.push('structure:none');

    const whale = whaleCandidates(bundle, { lastClosed, isEtf });
    const darkC = darkCandidates(dark, { isEtf });
    const gamma = gammaCandidates(gammaRows, { todayEt, isEtf });
    // 넓힌 선별: 오늘·내일 발표는 예상 변동이 없어도 후보(옵션 미결제약정 규모로 알려진 회사 우선) · 옛 선별은 그대로
    const earnings = o.broad
        ? earningsCandidatesBroad(earn.map((r) => ({ ...r, oi: oi[r.ticker] ?? null, done: r.done || releasedBroad(r, now) })), { dates: earlyEarnDates, isEtf })
        : earningsCandidates(earn, { dates });
    const mover = movers ? moverCandidates(movers.rows, { isEtf }) : [];

    const chains = gammaRows.map((r) => r.chainDate).filter((x): x is string => !!x).sort();
    const stamp: DocStamp = {
        opt: typeof bundle?.date === 'string' ? bundle.date : null,
        opened: typeof bundle?.prevDate === 'string' ? bundle.prevDate : null,
        finra: darkC[0]?.asOf ?? dark.map((d) => d.date).filter((x): x is string => !!x).sort().pop() ?? null,
        chain: gamma[0]?.asOf ?? chains[chains.length - 1] ?? null,
        earn: dates[0] ?? null,
        ...(o.broad ? {
            mov: movers?.session ? `${movers.session}|${mover.slice(0, 5).map((c) => `${c.ticker}${c.facts.news ? '+n' : ''}`).join(',')}` : null,
            // 넓힌 실적 후보(발표가 끝나면 빠진다) — 같은 슬롯에서도 끝난 발표가 남지 않게 다시 만든다(관문 11/18)
            ern: earnings.map((c) => c.ticker).join(',') || null,
            sel: 'broad1',
        } : {}),
    };
    return { mover, whale, darkpool: darkC, gamma, earnings, stamp, notes, earlyEarnDates };
}

// ── AI 한 줄 ────────────────────────────────────────────────────────────────────────

let dayChain: Promise<unknown> = Promise.resolve();
/** 하루 AI 호출 상한 안이면 한 번을 «예약»한다(인스턴스 안에서는 줄을 세운다 — 상한은 비용 안전망이지 정확한 계량기가 아니다) */
function reserveCall(etDate: string): Promise<boolean> {
    const p = dayChain.then(async () => {
        const k = TP_KEYS.day(etDate);
        const cur = Number(await getFromCache<number>(k).catch(() => 0)) || 0;
        if (cur >= dailyCap()) return false;
        await setInCache(k, cur + 1, 3 * 24 * 3600).catch(() => false);
        return true;
    });
    dayChain = p.catch(() => undefined);
    return p;
}
export async function callsToday(etDate: string): Promise<number> {
    return Number(await getFromCache<number>(TP_KEYS.day(etDate)).catch(() => 0)) || 0;
}

export type WhyOutcome = 'ai' | 'guard' | 'skipped' | 'capped' | 'error';
export interface WhyResult { outcome: WhyOutcome; text?: LocText; reasons: string[]; ms: number; provider?: string }

/** 항목 하나의 해설 — 크레딧 Haiku 5.5 만. 못 만들면 호출자가 규칙 해설을 쓴다. */
export async function writeWhy(c: Cand, etDate: string, year: number, context?: PreMarketContext): Promise<WhyResult> {
    const t0 = Date.now();
    if (!(await reserveCall(etDate))) return { outcome: 'capped', reasons: ['cap'], ms: 0 };
    let last: string[] = [];
    try {
        const res = await withFreshTier(() => callBedrock({
            system: systemFor(c.facts),
            userPrompt: buildPickV2Prompt(c.ticker, c.facts, etDate, context),
            maxTokens: 400,
            temperature: 0.2,
            timeoutMs: 15_000,
            label: TP_PURPOSE,
            purpose: TP_PURPOSE,
            expectJson: true,
            locale: 'multi',
            validate: (text: string) => { const r = checkPickV2Why(text, c.ticker, c.facts, year, etDate); last = r.reasons; return { ok: r.ok, reasons: r.reasons }; },
        }));
        const chk = checkPickV2Why(res.text, c.ticker, c.facts, year, etDate);
        if (!chk.ok || !chk.text) return { outcome: 'guard', reasons: chk.reasons, ms: Date.now() - t0, provider: res.provider };
        return { outcome: 'ai', text: chk.text, reasons: [], ms: Date.now() - t0, provider: res.provider };
    } catch (e) {
        if (isFreshTierSkipped(e)) return { outcome: last.length ? 'guard' : 'skipped', reasons: last.length ? last : ['credit-skip'], ms: Date.now() - t0 };
        return { outcome: 'error', reasons: [String((e as Error)?.message || e).slice(0, 120)], ms: Date.now() - t0 };
    }
}

// ── 생성 ──────────────────────────────────────────────────────────────────────────────

/** UTC 고정 조기판: 08:30~09:00 UTC = 17:30~18:00 KST.
 * EDT 04:30 / 11월 서머타임 종료 뒤 EST 03:30(프리 04:00 개장 직전).
 * EST 03:30을 PRE 시세로 꾸미지 않고 선물·뉴스 + 날짜 있는 직전 정규장 재료를 쓴다.
 * 기존 아침·마감 창은 유지한다. */
export function inWindow(now: number): boolean {
    if (isNonTradingDay(etDateOf(now))) return false;
    const m = etMinutesOf(now);
    const d = new Date(now);
    const utc = d.getUTCHours() * 60 + d.getUTCMinutes();
    return (utc >= 8 * 60 + 30 && utc < 9 * 60)
        || (m >= 7 * 60 + 30 && m <= 10 * 60 + 30) || (m >= 16 * 60 + 30 && m <= 21 * 60);
}

/** 조기판(pre) · 기존 아침판(am) · 마감판(pm). 표시 문구는 바꾸지 않는다. */
export const slotOf = (now: number): Slot => etMinutesOf(now) < 450 ? 'pre' : etMinutesOf(now) < 720 ? 'am' : 'pm';

const sameStamp = (a: DocStamp, b: DocStamp): boolean => a.opt === b.opt && a.opened === b.opened && a.finra === b.finra && a.chain === b.chain && a.earn === b.earn
    && (a.mov ?? null) === (b.mov ?? null) && (a.ern ?? null) === (b.ern ?? null) && (a.sel ?? null) === (b.sel ?? null);

/**
 * 넓힌 선별에서 AI 를 부르지 않는 항목 — 규칙 문장이 곧 «확인된 사실»이다(새 AI 호출 없음 · 기존 예산 안에서 오히려 줄어든다).
 *   · 실적: 회사가 공지한 발표 일정(옵션 용어 없이)
 *   · 근거(회사 실적 발표·종목 보도)가 없는 큰 폭 등락: «설명하는 보도가 확인되지 않았다»
 */
export function ruleOnly(c: Cand, broad: boolean): boolean {
    if (!broad) return false;
    if (c.kind === 'earnings') return true;
    if (c.kind === 'mover') { const f = c.facts as MoverFacts; return !f.earnings && !f.news; }
    return false;
}

export interface RunOpts {
    now?: number;
    /** 같은 날·같은 자료여도 다시 만든다(점검용 — 크론 ?force=1) */
    force?: boolean;
    /** 저장·AI 호출 없이 고른 결과만(크론 ?dry=1) */
    dry?: boolean;
    /** AI 를 부르지 않고 규칙 해설로만(점검용) */
    noAi?: boolean;
}

export interface RunSummary {
    ok: boolean;
    status: 'generated' | 'fresh' | 'off' | 'empty' | 'pruned' | 'locked' | 'dry' | 'error' | 'closed';
    slot: Slot;
    etDate: string;
    items?: Array<{ id: string; kind: PickKind; ticker: string; asOf: string; whyAi: boolean }>;
    counts?: Record<PickKind, number>;
    gen?: TodayPicksDoc['gen'];
    stamp?: DocStamp;
    notes?: string[];
    reason?: string;
    doc?: TodayPicksDoc;
}

/** 돌려 쓰기(같은 자료로 같은 카드를 또 보이지 않기) 기준 — «다른 ET 날짜»의 직전 문서만. 같은 날 다시 만들 때(force·두 번째 크론에서 자료가 바뀐 경우)는 순위를 흔들지 않는다 */
function prevPicksOf(doc: TodayPicksDoc | null): PrevPick[] {
    return (doc?.items || []).map((p) => ({ kind: p.kind, ticker: p.ticker, asOf: p.asOf }));
}

export async function runPicks(o: RunOpts = {}): Promise<RunSummary> {
    const now = o.now ?? Date.now();
    const etDate = etDateOf(now);
    const slot = slotOf(now);
    const base = { slot, etDate };
    // force/dry·직접 호출도 주말·휴장에는 생성하지 않는다.
    if (isNonTradingDay(etDate)) return { ok: true, status: 'closed', ...base };
    if (picksOffEnv() || (await getFromCache<any>(TP_KEYS.off).catch(() => null))) return { ok: true, status: 'off', ...base };

    const broad = await broadOn();
    const locked = o.dry ? true : await tryBackgroundLock(TP_KEYS.lock, 90);
    if (!locked) return { ok: true, status: 'locked', ...base };
    try {
        const t0 = Date.now();
        const g = await gather(now, { broad });
        const prevDoc = (await getFromCache<TodayPicksDoc>(TP_KEYS.latest).catch(() => null));
        const prev = isDoc(prevDoc) ? prevDoc : null;
        const counts = { whale: g.whale.length, darkpool: g.darkpool.length, gamma: g.gamma.length, earnings: g.earnings.length, ...(broad ? { mover: g.mover.length } : {}) } as Record<PickKind, number>;

        if (!o.force && !o.dry && prev && prev.etDate === etDate && prev.slot === slot && prev.items.length && sameStamp(prev.stamp, g.stamp)) {
            return { ok: true, status: 'fresh', ...base, counts, stamp: g.stamp, notes: g.notes, reason: 'same-data-today' };
        }

        const prevPicks = prevPicksOf(prev && prev.etDate !== etDate ? prev : null);
        const picked = broad
            ? assembleBroad({ mover: g.mover, whale: g.whale, darkpool: g.darkpool, gamma: g.gamma, earnings: g.earnings }, { prev: prevPicks, max: 5, earlyEarnDates: g.earlyEarnDates, slot })
            : assemble({ whale: g.whale, darkpool: g.darkpool, gamma: g.gamma, earnings: g.earnings }, { prev: prevPicks, max: 5, earlyEarnDates: g.earlyEarnDates });
        if (!picked.length) {
            // 넓힌 선별: 후보가 0 이어도 같은 날 직전 문서에 «이미 나온» 실적이 남지 않게 그 항목만 걷어 낸다(관문 11/18). 다른 항목·문장은 그대로.
            if (broad && !o.dry && prev && prev.sel === 'broad1' && prev.etDate === etDate) {
                const keep = prev.items.filter((p) => !(p.facts.kind === 'earnings' && releasedBroad(p.facts, now)));
                if (keep.length !== prev.items.length) {
                    const pruned: TodayPicksDoc = { ...prev, items: keep, stamp: g.stamp };
                    await Promise.all([setInCache(TP_KEYS.latest, pruned, TP_DOC_TTL_SEC), setInCache(TP_KEYS.slot(etDate, prev.slot), pruned, TP_DOC_TTL_SEC)]);
                    return { ok: true, status: 'pruned', ...base, counts, stamp: g.stamp, notes: g.notes, reason: `released-earnings:${prev.items.length - keep.length}` };
                }
            }
            return { ok: true, status: 'empty', ...base, counts, stamp: g.stamp, notes: g.notes };
        }

        const context = etMinutesOf(now) < 570 && !o.dry && !o.noAi
            ? await readPreMarketContext(now, await readPickPreQuotes(picked.map(c => c.ticker), now)) : undefined;
        const year = Number(etDate.slice(0, 4));
        const items: TodayPick[] = [];
        const whys: WhyResult[] = [];
        // 항목마다 한 호출을 동시에(최대 5) — 못 만든 항목은 규칙 해설
        const results = (o.dry || o.noAi) ? picked.map((): WhyResult => ({ outcome: 'skipped', reasons: [o.dry ? 'dry' : 'no-ai'], ms: 0 }))
            : await Promise.all(picked.map((c) => (ruleOnly(c, broad) ? Promise.resolve<WhyResult>({ outcome: 'skipped', reasons: ['rule-only'], ms: 0 }) : writeWhy(c, etDate, year, context))));
        picked.forEach((c, i) => {
            const rt = ruleTexts(c.ticker, c.facts, { plain: broad });
            const w = results[i];
            whys.push(w);
            items.push({ id: c.id, kind: c.kind, ticker: c.ticker, asOf: c.asOf, facts: c.facts, what: rt.what, why: w.outcome === 'ai' && w.text ? w.text : rt.fallback, whyAi: w.outcome === 'ai', push: rt.push });
        });
        const reasons = whys.flatMap((w, i) => (w.outcome === 'ai' || w.reasons[0] === 'rule-only' ? [] : [`${picked[i].id}:${w.outcome}:${(w.reasons[0] || '').slice(0, 60)}`]));
        const doc: TodayPicksDoc = {
            v: 1, slot, etDate, session: generationSession(now), ...(context ? { context } : {}), at: now, stamp: g.stamp, items, ...(broad ? { sel: 'broad1' as const } : {}),
            gen: { calls: whys.filter((w) => w.outcome !== 'capped' && w.reasons[0] !== 'dry' && w.reasons[0] !== 'no-ai' && w.reasons[0] !== 'rule-only').length, ok: whys.filter((w) => w.outcome === 'ai').length, fallback: whys.filter((w) => w.outcome !== 'ai').length, ms: Date.now() - t0, ...(reasons.length ? { reasons: reasons.slice(0, 10) } : {}) },
        };
        const summary: RunSummary = {
            ok: true, status: o.dry ? 'dry' : 'generated', ...base, counts, stamp: g.stamp, notes: g.notes, gen: doc.gen,
            items: items.map((p) => ({ id: p.id, kind: p.kind, ticker: p.ticker, asOf: p.asOf, whyAi: p.whyAi })),
            ...(o.dry ? { doc } : {}),
        };
        if (!o.dry) {
            await Promise.all([
                setInCache(TP_KEYS.latest, doc, TP_DOC_TTL_SEC),
                setInCache(TP_KEYS.slot(etDate, slot), doc, TP_DOC_TTL_SEC),
            ]);
        }
        return summary;
    } catch (e) {
        return { ok: false, status: 'error', ...base, reason: String((e as Error)?.message || e).slice(0, 160) };
    } finally {
        if (!o.dry) await releaseBackgroundLock(TP_KEYS.lock);
    }
}

/** 넓힌 선별 끄기/켜기 — 키 하나(TTL 90일, EC2 전용). 끄면 다음 생성부터 옛 선별(stamp.sel 이 바뀌어 같은 슬롯도 다시 만든다) */
export async function setBroad(on: boolean): Promise<boolean> {
    if (!on) return setInCache(TP_KEYS.broadOff, { at: Date.now() }, TP_OFF_TTL_SEC).catch(() => false);
    return deleteFromCache(TP_KEYS.broadOff).then(() => true).catch(() => false);
}

/** 끄기/켜기 — 키 하나(TTL 90일, EC2 전용) */
export async function setOff(on: boolean): Promise<boolean> {
    if (on) return setInCache(TP_KEYS.off, { at: Date.now() }, TP_OFF_TTL_SEC).catch(() => false);
    return deleteFromCache(TP_KEYS.off).then(() => true).catch(() => false);
}
