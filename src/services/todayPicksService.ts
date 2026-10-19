import { summarizeWhaleOpening } from '@/lib/whaleOpening';
import { optionExpiryJudge } from '@/lib/marketCalendar';
/**
 * «✦ AI 오늘 볼 것» — 읽기·선별·생성·저장 (서버). 시험: tests/todayPicks.test.ts
 *
 *   읽기  GET /api/today-picks · 웹 /<lang>/today · 마감 푸시 → readPicks (EC2 레디스 mget 한 번 · AI 호출 0 · 기다리지 않는다)
 *   생성  /api/cron/today-picks (하루 4번 — 아침 08:00 ET 무렵 2번 · 마감 뒤 2번) → runPicks
 *
 * 재료(전부 저장소에 «이미 있는 값» — 공급사 호출 0, Intrinio 429 재발 방지):
 *   · 고래   intrinio:options:eod (또는 :lastgood) — 확정 미결제약정 증가(d). 묶음 한 벌 580KB, 읽기 1번.
 *   · 다크풀 finra:offexchange — services/darkPool.getDarkPoolBatchChecked(앱 칩이 읽는 그 읽기). 장외 비중·20일 평균 대비 배수.
 *   · 감마   structure:part:v2:0~7(미리 굽는 조각 8개)로 후보를 좁히고 → structure:v2:{T}(레벨 판본, 정의 게이트 통과분) 몇십 개만 mget.
 *   · 실적   lib/earningsConfirmed(회사 공지 일정) + services/impliedMoveService.readImpliedMoveRows(읽기 전용 · 벤더 0 · 쓰기 0).
 *   AI    크레딧 Haiku 5.5 만(withFreshTier — 크레딧이 안 되면 AWS 로 넘기지 않고 규칙 해설로 대신한다). 항목마다 한 호출(약 $0.0003).
 *
 * 끄는 법(재배포 없이): GET /api/cron/today-picks?off=1 (Authorization: Bearer CRON_SECRET) → Redis 키 todaypicks:off 에 값. 켜기 off=0.
 *   환경변수 TODAY_PICKS_OFF=1 (재배포 필요) 도 같다. 꺼지면 읽기는 빈 응답(카드·웹 목록·푸시 줄이 모두 사라진다), 생성은 0.
 * 하루 AI 호출 상한: TODAY_PICKS_DAILY_CAP(기본 60). 키는 todaypicks:* — TTL 이 있고 Upstash 복제 목록 밖이라 EC2 레디스에만 쓴다(Upstash 명령 0).
 */
import { getFromCache, mgetFromCache, setInCache, deleteFromCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';
import { getDarkPoolBatchChecked } from '@/services/darkPool';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { indexLevelRowFromStored } from '@/lib/ai/crossSectorLevels';
import { buildPickUserPrompt, checkPickWhy, TP_PURPOSE, TP_SYSTEM } from '@/lib/ai/todayPicksLine';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { phaseOf, selectWeekEntries } from '@/lib/earningsWeek';
import { etDateOf, etMinutesOf, isNonTradingDay } from '@/lib/marketCalendar';
import { lastClosedSessionDate } from '@/lib/marketSession';
import { isEtf } from '@/lib/seo/etfSet';
import { tryBackgroundLock, releaseBackgroundLock } from '@/lib/cache/staleLock';
import { ruleTexts } from '@/lib/todayPicks/copy';
import {
    assemble, darkCandidates, earningsCandidates, gammaCandidates, nextWeekdays, whaleCandidates,
    DARK_MIN_RATIO, DARK_MIN_VOLUME, DARK_MIN_PCTILE,
    type DarkRowIn, type EarnRowIn, type LevelRowIn, type OptionsEodBundle, type PrevPick,
} from '@/lib/todayPicks/select';
import type { Cand, DarkFacts, DocStamp, EarnFacts, GammaFacts, LocText, PickKind, Slot, TodayPick, TodayPicksDoc, WhaleFacts } from '@/lib/todayPicks/types';

export const TP_KEYS = {
    latest: 'todaypicks:v1:latest',
    slot: (etDate: string, slot: Slot) => `todaypicks:v1:${etDate}:${slot}`,
    off: 'todaypicks:off',
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
    const whaleRead = doc.items.some(p => p.kind === 'whale') ? proxyJson(OPT_KEY, Math.max(1, budget)) : Promise.resolve(null);
    let current: Awaited<ReturnType<typeof getDarkPoolBatchChecked>> | null = null;
    if (symbols.length && budget > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            current = await Promise.race([getDarkPoolBatchChecked(symbols).catch(() => null),
                new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), budget); })]);
        } finally { if (timer) clearTimeout(timer); }
    }
    const whaleBundle = await whaleRead;
    const isExpired = optionExpiryJudge(now);
    const items = doc.items.map((p: TodayPick) => {
        if (p.facts.kind === 'whale') {
            const row = whaleBundle?.tickers?.[p.ticker] ?? whaleBundle?.stale?.[p.ticker];
            const openedOn = whaleBundle?.tickers?.[p.ticker] ? whaleBundle.prevDate : row?.prevDate;
            const opening = summarizeWhaleOpening(row, isExpired, whaleBundle?.tickers?.[p.ticker] ? whaleBundle : row);
            // 같은 원천의 날짜로 갱신한다. 읽기 실패 시 합계는 결측, 기존 단일 계약 사실은 보존.
            const facts = { ...p.facts, opening, ...(opening && openedOn ? {
                openedOn, notional: opening.notional,
                callPct: opening.notional > 0 ? opening.callNotional / opening.notional * 100 : 0,
                best: opening.largest ?? p.facts.best,
                jump: opening.largest ? (opening.largest.oi > opening.largest.added ? opening.largest.oi / (opening.largest.oi - opening.largest.added) : null) : p.facts.jump,
            } : {}) };
            const changed = opening && openedOn && JSON.stringify(facts) !== JSON.stringify(p.facts);
            const text = changed ? ruleTexts(p.ticker, facts) : null;
            return { ...p, facts, asOf: opening && openedOn ? openedOn : p.asOf,
                ...(text ? { what: text.what, why: opening?.contracts === 0 ? text.what : text.fallback, push: text.push, whyAi: false } : {}) };
        }
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
    return { doc: { ...doc, items }, off: false, ageMs };
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

export interface Gathered {
    whale: Cand<WhaleFacts>[]; darkpool: Cand<DarkFacts>[]; gamma: Cand<GammaFacts>[]; earnings: Cand<EarnFacts>[];
    stamp: DocStamp;
    notes: string[];
    earlyEarnDates: string[];
}

/** 재료를 읽어 종류별 후보와 «자료 날짜 표식(stamp)»을 만든다. 읽기 실패는 그 종류만 빠지고 notes 에 남는다. */
export async function gather(now = Date.now()): Promise<Gathered> {
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
    const [dark, gammaRows, earn] = await Promise.all([
        universe.length ? loadDark(universe, oi).catch((): DarkRowIn[] => []) : Promise.resolve([] as DarkRowIn[]),
        universe.length ? loadGammaRows(universe, oi, todayEt, now).catch((): LevelRowIn[] => []) : Promise.resolve([] as LevelRowIn[]),
        loadEarnings(now, dates).catch((): EarnRowIn[] => []),
    ]);
    if (universe.length && !dark.length) notes.push('finra:none');
    if (universe.length && !gammaRows.length) notes.push('structure:none');

    const whale = whaleCandidates(bundle, { lastClosed, isEtf });
    const darkC = darkCandidates(dark, { isEtf });
    const gamma = gammaCandidates(gammaRows, { todayEt, isEtf });
    const earnings = earningsCandidates(earn, { dates });

    const chains = gammaRows.map((r) => r.chainDate).filter((x): x is string => !!x).sort();
    const stamp: DocStamp = {
        opt: typeof bundle?.date === 'string' ? bundle.date : null,
        opened: typeof bundle?.prevDate === 'string' ? bundle.prevDate : null,
        finra: darkC[0]?.asOf ?? dark.map((d) => d.date).filter((x): x is string => !!x).sort().pop() ?? null,
        chain: gamma[0]?.asOf ?? chains[chains.length - 1] ?? null,
        earn: dates[0] ?? null,
    };
    return { whale, darkpool: darkC, gamma, earnings, stamp, notes, earlyEarnDates };
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
export async function writeWhy(c: Cand, etDate: string, year: number): Promise<WhyResult> {
    const t0 = Date.now();
    if (!(await reserveCall(etDate))) return { outcome: 'capped', reasons: ['cap'], ms: 0 };
    let last: string[] = [];
    try {
        const res = await withFreshTier(() => callBedrock({
            system: TP_SYSTEM,
            userPrompt: buildPickUserPrompt(c.ticker, c.facts, etDate),
            maxTokens: 400,
            temperature: 0.2,
            timeoutMs: 15_000,
            label: TP_PURPOSE,
            purpose: TP_PURPOSE,
            expectJson: true,
            locale: 'multi',
            validate: (text: string) => { const r = checkPickWhy(text, c.ticker, c.facts, year, etDate); last = r.reasons; return { ok: r.ok, reasons: r.reasons }; },
        }));
        const chk = checkPickWhy(res.text, c.ticker, c.facts, year, etDate);
        if (!chk.ok || !chk.text) return { outcome: 'guard', reasons: chk.reasons, ms: Date.now() - t0, provider: res.provider };
        return { outcome: 'ai', text: chk.text, reasons: [], ms: Date.now() - t0, provider: res.provider };
    } catch (e) {
        if (isFreshTierSkipped(e)) return { outcome: last.length ? 'guard' : 'skipped', reasons: last.length ? last : ['credit-skip'], ms: Date.now() - t0 };
        return { outcome: 'error', reasons: [String((e as Error)?.message || e).slice(0, 120)], ms: Date.now() - t0 };
    }
}

// ── 생성 ──────────────────────────────────────────────────────────────────────────────

/** 크론이 움직이는 ET 시간 창 — 아침 07:30~10:30 · 마감 뒤 16:30~21:00 (서머타임이 바뀌어도 같은 크론 시각표가 맞는 시각에만 돈다) */
export function inWindow(now: number): boolean {
    const m = etMinutesOf(now);
    return (m >= 7 * 60 + 30 && m <= 10 * 60 + 30) || (m >= 16 * 60 + 30 && m <= 21 * 60);
}

/** ET 시각 → 슬롯(정오 전 = 아침, 이후 = 마감 뒤) */
export const slotOf = (now: number): Slot => (etMinutesOf(now) < 12 * 60 ? 'am' : 'pm');

const sameStamp = (a: DocStamp, b: DocStamp): boolean => a.opt === b.opt && a.opened === b.opened && a.finra === b.finra && a.chain === b.chain && a.earn === b.earn;

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
    status: 'generated' | 'fresh' | 'off' | 'empty' | 'locked' | 'dry' | 'error';
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
    if (picksOffEnv() || (await getFromCache<any>(TP_KEYS.off).catch(() => null))) return { ok: true, status: 'off', ...base };

    const locked = o.dry ? true : await tryBackgroundLock(TP_KEYS.lock, 90);
    if (!locked) return { ok: true, status: 'locked', ...base };
    try {
        const t0 = Date.now();
        const g = await gather(now);
        const prevDoc = (await getFromCache<TodayPicksDoc>(TP_KEYS.latest).catch(() => null));
        const prev = isDoc(prevDoc) ? prevDoc : null;
        const counts = { whale: g.whale.length, darkpool: g.darkpool.length, gamma: g.gamma.length, earnings: g.earnings.length } as Record<PickKind, number>;

        if (!o.force && !o.dry && prev && prev.etDate === etDate && prev.items.length && sameStamp(prev.stamp, g.stamp)) {
            return { ok: true, status: 'fresh', ...base, counts, stamp: g.stamp, notes: g.notes, reason: 'same-data-today' };
        }

        const picked = assemble({ whale: g.whale, darkpool: g.darkpool, gamma: g.gamma, earnings: g.earnings }, { prev: prevPicksOf(prev && prev.etDate !== etDate ? prev : null), max: 5, earlyEarnDates: g.earlyEarnDates });
        if (!picked.length) return { ok: true, status: 'empty', ...base, counts, stamp: g.stamp, notes: g.notes };

        const year = Number(etDate.slice(0, 4));
        const items: TodayPick[] = [];
        const whys: WhyResult[] = [];
        // 항목마다 한 호출을 동시에(최대 5) — 못 만든 항목은 규칙 해설
        const results = (o.dry || o.noAi) ? picked.map((): WhyResult => ({ outcome: 'skipped', reasons: [o.dry ? 'dry' : 'no-ai'], ms: 0 })) : await Promise.all(picked.map((c) => writeWhy(c, etDate, year)));
        picked.forEach((c, i) => {
            const rt = ruleTexts(c.ticker, c.facts);
            const w = results[i];
            whys.push(w);
            items.push({ id: c.id, kind: c.kind, ticker: c.ticker, asOf: c.asOf, facts: c.facts, what: rt.what, why: w.outcome === 'ai' && w.text ? w.text : rt.fallback, whyAi: w.outcome === 'ai', push: rt.push });
        });
        const reasons = whys.flatMap((w, i) => (w.outcome === 'ai' ? [] : [`${picked[i].id}:${w.outcome}:${(w.reasons[0] || '').slice(0, 60)}`]));
        const doc: TodayPicksDoc = {
            v: 1, slot, etDate, at: now, stamp: g.stamp, items,
            gen: { calls: whys.filter((w) => w.outcome !== 'capped' && w.reasons[0] !== 'dry' && w.reasons[0] !== 'no-ai').length, ok: whys.filter((w) => w.outcome === 'ai').length, fallback: whys.filter((w) => w.outcome !== 'ai').length, ms: Date.now() - t0, ...(reasons.length ? { reasons: reasons.slice(0, 10) } : {}) },
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

/** 끄기/켜기 — 키 하나(TTL 90일, EC2 전용) */
export async function setOff(on: boolean): Promise<boolean> {
    if (on) return setInCache(TP_KEYS.off, { at: Date.now() }, TP_OFF_TTL_SEC).catch(() => false);
    return deleteFromCache(TP_KEYS.off).then(() => true).catch(() => false);
}
