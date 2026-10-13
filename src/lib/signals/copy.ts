/**
 * 이상 신호 푸시 문구 — 규칙 문장(순수 함수). «종목 · 무엇이 · 숫자 · 기준 시각» 뒤에 «✦ AI 한 줄»(있을 때만)을 붙인다.
 *
 * 원칙(오늘 볼 것·내 종목 AI 한 줄과 같다)
 *   · 숫자는 facts 에서만 나온다(AI 가 숫자를 쓰지 않는다). 관찰 문장만 — 매수·매도·추천·목표가·예측·전망 없음.
 *   · 금융 공통어(Max Pain · Call Wall · Put Floor · Gamma Flip)는 한·일에서도 번역하지 않는다(대표 10/8). P/C 는 쓰지 않는다(정의 결정 대기).
 *   · 시각은 «M/D HH:mm ET», 날짜 자료는 «FINRA M/D»·«M/D 세션». 광고·구독 권유를 섞지 않는다(정보통신망법 50조 — 권유는 앱 안 화면에서만).
 */
import { asOfText, distStr, md, priceStr, whatText } from '@/lib/todayPicks/copy';
import { weekdayOfDate } from '@/lib/marketSession';
import { etDateOf, etMinutesOf } from '@/lib/marketCalendar';
import type { DetectedSignal, EarnD1Facts, Loc, LocText, MaxPainFacts, WallFacts } from './types';
import { SIG_LOCALES } from './types';

export const SIG_ICON = '⚡';
export const AI_MARK = '✦';

const LEVEL_NAME = { callWall: 'Call Wall', putFloor: 'Put Floor', gammaFlip: 'Gamma Flip' } as const;
const WD: Record<Loc, string[]> = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
};

/** «M/D HH:mm ET» — 관측(구조 판본) 시각을 미국 동부 벽시계로 */
export function etHm(ms: number): string {
    const m = etMinutesOf(ms);
    return `${md(etDateOf(ms))} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ET`;
}

/** «10/13 11:05 ET 기준» */
export function stampText(ms: number, loc: Loc): string {
    const t = etHm(ms);
    return loc === 'ko' ? `${t} 기준` : loc === 'ja' ? `${t}時点` : `as of ${t}`;
}

const signed = (n: number, digits = 1): string => {
    const v = Number(n.toFixed(digits));
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
};

function wallTitle(t: string, f: WallFacts, loc: Loc): string {
    const nm = LEVEL_NAME[f.level];
    const p = priceStr(f.levelPrice);
    const up = f.direction === 'up';
    if (f.level === 'callWall') return loc === 'ko' ? `${t} · ${nm} $${p} 돌파` : loc === 'ja' ? `${t} · ${nm} $${p} 上抜け` : `${t} · above ${nm} $${p}`;
    if (f.level === 'putFloor') return loc === 'ko' ? `${t} · ${nm} $${p} 이탈` : loc === 'ja' ? `${t} · ${nm} $${p} 割れ` : `${t} · below ${nm} $${p}`;
    return loc === 'ko' ? `${t} · ${nm} $${p} ${up ? '위로' : '아래로'}`
        : loc === 'ja' ? `${t} · ${nm} $${p} を${up ? '上回る' : '下回る'}`
            : `${t} · ${up ? 'above' : 'below'} ${nm} $${p}`;
}

function wallBody(f: WallFacts, loc: Loc, ms: number): string {
    const nm = LEVEL_NAME[f.level];
    const d = distStr(Math.abs(f.distPct));
    const up = f.distPct >= 0;
    const rel = loc === 'ko' ? `${nm} ${up ? '위' : '아래'} ${d}%` : loc === 'ja' ? `${nm}の${d}%${up ? '上' : '下'}` : `${d}% ${up ? 'above' : 'below'} ${nm}`;
    const px = loc === 'ko' ? `가격 $${priceStr(f.price)}` : loc === 'ja' ? `価格 $${priceStr(f.price)}` : `Price $${priceStr(f.price)}`;
    const ex = f.expiry ? (loc === 'ko' ? `${md(f.expiry)} 만기` : loc === 'ja' ? `${md(f.expiry)}満期` : `${md(f.expiry)} expiry`) : '';
    return [`${px}${loc === 'ja' ? '、' : ', '}${rel}`, ex, stampText(ms, loc)].filter(Boolean).join(' · ');
}

function maxPainTitle(t: string, f: MaxPainFacts, loc: Loc): string {
    const s = `${signed(f.divPct)}%`;
    return loc === 'ko' ? `${t} · Max Pain 대비 ${s}` : loc === 'ja' ? `${t} · Max Pain比 ${s}` : `${t} · ${s} vs Max Pain`;
}

function maxPainBody(f: MaxPainFacts, loc: Loc, ms: number): string {
    const px = priceStr(f.price), mp = priceStr(f.maxPain), ex = md(f.expiry);
    const edge = distStr(f.p90Pct);
    return [
        loc === 'ko' ? `가격 $${px}, Max Pain $${mp} · ${ex} 만기` : loc === 'ja' ? `価格 $${px}、Max Pain $${mp} · ${ex}満期` : `Price $${px}, Max Pain $${mp} · ${ex} expiry`,
        loc === 'ko' ? `이 종목 최근 20거래일 괴리 상위 10% 경계(${edge}%) 이상` : loc === 'ja' ? `この銘柄の直近20営業日の乖離 上位10%の境界(${edge}%)以上` : `at or beyond its own 20-day top-10% gap (${edge}%)`,
        stampText(ms, loc),
    ].join(' · ');
}

function earnWhen(f: EarnD1Facts, loc: Loc): string {
    const hour = f.hour === 'bmo' ? (loc === 'ko' ? '장 시작 전' : loc === 'ja' ? '寄り付き前' : 'before the open')
        : f.hour === 'amc' ? (loc === 'ko' ? '장 마감 후' : loc === 'ja' ? '引け後' : 'after the close') : '';
    const wd = WD[loc][weekdayOfDate(f.date)];
    const day = loc === 'en' ? `${wd} ${md(f.date)}` : `${md(f.date)}(${wd})`;
    const tm = f.etTime ? ` ${f.etTime} ET` : '';
    return [day, hour].filter(Boolean).join(loc === 'en' ? ', ' : ' ') + tm;
}

function earnTitle(t: string, f: EarnD1Facts, loc: Loc): string {
    const wd = WD[loc][weekdayOfDate(f.date)];
    if (loc === 'ko') return f.tomorrow ? `${t} · 내일 실적 발표` : `${t} · ${md(f.date)}(${wd}) 실적 발표`;
    if (loc === 'ja') return f.tomorrow ? `${t} · 明日決算発表` : `${t} · ${md(f.date)}(${wd})決算発表`;
    return f.tomorrow ? `${t} · reports tomorrow` : `${t} · reports ${wd} ${md(f.date)}`;
}

function earnBody(f: EarnD1Facts, loc: Loc): string {
    const when = earnWhen(f, loc);
    if (f.impliedPct == null || !f.impliedExpiry) return when;
    const im = loc === 'ko' ? `옵션 예상 변동 ±${f.impliedPct.toFixed(1)}%(${md(f.impliedExpiry)} 만기)` : loc === 'ja' ? `想定変動幅 ±${f.impliedPct.toFixed(1)}%(${md(f.impliedExpiry)}満期)` : `implied move ±${f.impliedPct.toFixed(1)}% (${md(f.impliedExpiry)} expiry)`;
    return `${when} · ${im}`;
}

/** 제목 — 신호 한 줄(⚡ 머리 + 종목 · 무엇이) */
export function titleOf(s: DetectedSignal, loc: Loc): string {
    const f = s.facts;
    const t = s.ticker;
    switch (f.kind) {
        case 'wall': return `${SIG_ICON} ${wallTitle(t, f, loc)}`;
        case 'maxpain': return `${SIG_ICON} ${maxPainTitle(t, f, loc)}`;
        case 'darkpool': return `${SIG_ICON} ${t} · ${loc === 'ko' ? '다크풀 급증' : loc === 'ja' ? 'ダークプール急増' : 'dark pool surge'}`;
        case 'whale': return `${SIG_ICON} ${t} · ${loc === 'ko' ? '미결제약정 급증' : loc === 'ja' ? '建玉急増' : 'open interest surge'}`;
        case 'earnings_d1': return `${SIG_ICON} ${earnTitle(t, f, loc)}`;
    }
}

/** 본문의 규칙 줄 — 숫자·기준 시각(AI 가 못 써도 이것은 나간다) */
export function ruleBodyOf(s: DetectedSignal, loc: Loc): string {
    const f = s.facts;
    switch (f.kind) {
        case 'wall': return wallBody(f, loc, f.asOfMs);
        case 'maxpain': return maxPainBody(f, loc, f.asOfMs);
        case 'darkpool': return `${whatText(f, loc)} · ${asOfText(f, s.asOfDate, loc)}`;
        case 'whale': return `${whatText(f, loc)} · ${asOfText(f, s.asOfDate, loc)}`;
        case 'earnings_d1': return earnBody(f, loc);
    }
}

export interface SignalPushCopy { title: string; body: string }

/** 푸시 한 통의 제목·본문. aiLine(해당 언어)이 있으면 «✦ 한 줄»을 줄바꿈 뒤에 붙인다 */
export function pushCopyOf(s: DetectedSignal, loc: Loc, aiLine?: string | null): SignalPushCopy {
    const rule = ruleBodyOf(s, loc);
    const ai = typeof aiLine === 'string' && aiLine.trim() ? `\n${AI_MARK} ${aiLine.trim()}` : '';
    return { title: titleOf(s, loc), body: `${rule}${ai}` };
}

export function copyAllLocales(s: DetectedSignal, ai?: Partial<LocText> | null): Record<Loc, SignalPushCopy> {
    const out = {} as Record<Loc, SignalPushCopy>;
    for (const l of SIG_LOCALES) out[l] = pushCopyOf(s, l, ai?.[l] ?? null);
    return out;
}

/** 푸시를 눌렀을 때 가는 곳 — 그 종목의 Flow 화면(앱 안 경로만) */
export function tapPathOf(ticker: string): string {
    return `/app-view/flow?t=${encodeURIComponent(ticker)}&from=sig`;
}
