/**
 * 공유 카드 «받는 쪽 웹 페이지 + 링크 미리보기(OG)» 공용 뷰 모델 — 2026-10-14 (브랜치 feat/viral-loop)
 *
 *   URL  /<ko|en|ja>/s/<pick|line|earn>/<TICKER>?from=share_<kind>&ref=<익명 초대 id>&via=<ios|android|web>
 *   page.tsx(받는 쪽 페이지)·opengraph-image.tsx(링크 미리보기 카드)·generateMetadata 가 «같은 뷰 모델»을 읽는다 — 페이지와 카드의 숫자가 갈라지지 않게.
 *
 * 원칙(대표 «지어내지 않는다»):
 *   · 내용은 «서버가 저장본에서 읽어» 그린다 — 주소의 글을 쓰지 않는다(위조 불가). 새 AI 호출·공급사 호출·생성·저장 0 (읽기만).
 *   · 저장본이 없거나 조건에 안 맞으면 «생성하지 않고» 대체 화면(fallbackReason)으로 간다.
 *   · 숫자·문장은 앱 화면과 같은 기존 모듈 함수로 만든다(새 계산·새 정의 없음):
 *       pick  = readPicks → buildView            (lib/todayPicks/view · copy)
 *       line  = readLines → entryOf → fillAiLine (lib/app/watchlistAiLine — 자리표를 «그 글을 쓴 때의 가격» 기준 거리 %로 채운다)
 *       earn  = getEarningsWeek → viewRow        (lib/earningsWeekView · lib/earnings/earningsImplied.impliedBasisText) + 캘린더 캐시·브리프 팩 «읽기»
 *   · 금융 공통어(GEX·VIX·P/C·RSI·Max Pain·Call Wall·Put Floor·Gamma Flip)는 ko·ja 화면에서도 번역하지 않는다.
 *   · 투자 권유·수익 약속·예측 문구를 새로 만들지 않는다 — 기존 저장 문장만 싣는다. 가짜 희소성·후기 금지.
 *
 * 구조: 위쪽 «순수 함수»(서식·문구·대체 조건 — tests/inviteLanding.test.ts) · 아래쪽 «읽기»(레디스 서비스 호출 — 의존 주입, 서비스는 동적 import 라
 *   순수 부분만 쓰는 시험은 서비스 모듈을 올리지 않는다).
 */
import {
  inviteAppHref, normalizeShareTicker, SHARE_KINDS, toInviteLang,
  type InviteLang, type ShareKind,
} from './kinds';
import { COPY, hourText, mdw, pctText, phaseOf } from '@/lib/earningsWeek';
import {
  asOfLineOf, fmtLevel, fmtPrice, stampET, stampKST, viewRow,
} from '@/lib/earningsWeekView';
import { attachImplied, IMPLIED_LABEL, impliedBasisText, type ImpliedPack, type RowImplied } from '@/lib/earnings/earningsImplied';
import { attachBriefs, fmtEpsUsd, fmtRevUsd, type BriefPack } from '@/lib/earnings/earningsBrief';
import { buildView, type PicksView } from '@/lib/todayPicks/view';
import { UI } from '@/lib/todayPicks/copy';
import type { TodayPicksDoc } from '@/lib/todayPicks/types';
import { fillAiLine, type AiLineEntry } from '@/lib/app/watchlistAiLine';
import { daysBetweenYmd } from '@/lib/marketCalendar';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import type { StoredLine } from '@/services/watchlistAiLineService';
import type { ConfirmedEarnings } from '@/lib/earningsConfirmed';
import type { EarningsWeekData, EarningsWeekRow } from '@/services/earningsWeekService';

// ── 모양 ─────────────────────────────────────────────────────────────────────

export type LandingFallback =
  | 'bad-input'     // 티커 형식 밖
  | 'read-failed'   // 읽기 실패·시간 초과
  | 'off'           // 끄기 스위치(레디스 todaypicks:off · wlai:off)
  | 'no-list'       // pick: 오늘 목록이 없다(저장본 없음·너무 오래됨)
  | 'rotated'       // pick: 목록은 있는데 이 종목이 없다(항목이 이미 돌았다)
  | 'no-line'       // line: 저장본이 없거나 이 언어 글이 없거나 지금 채울 수 없다
  | 'no-row'        // earn: 이번 주 회사 공지 목록에 이 종목이 없다
  | 'done'          // earn: 발표가 끝났다(예상 변동폭은 그 발표 전의 값이라 숨긴다)
  | 'no-move';      // earn: 옵션 반영 변동폭을 아직 못 읽었다

export interface LandingRow { label: string; value: string; note?: string }
export interface LandingOther { ticker: string; chip?: string; text: string; href?: string }
export interface LandingLink { label: string; href: string }

export interface LandingView {
  ok: boolean;
  kind: ShareKind;
  ticker: string;
  lang: InviteLang;
  /** 종류 이름 «오늘 볼 것» */
  kindName: string;
  /** 문서 제목·설명(메타) */
  title: string;
  description: string;
  chip?: string;
  /** 회사명(earn — AI 브리프가 붙인 이름) */
  name?: string;
  /** 핵심 한 줄 */
  headline: string;
  /** headline 자체가 AI 가 쓴 글이다(line) */
  headlineAi: boolean;
  /** 큰 숫자(earn: ±4.3%) */
  hero?: { value: string; label: string; note?: string };
  /** 보조 AI/해설 문장 — ai=true 일 때만 «✦ AI» 표식 */
  aiLine?: { text: string; ai: boolean };
  rows: LandingRow[];
  /** 기준 시각·날짜 한 줄 */
  asOf: string;
  /** 보조 사실 문장(옵션 체인 기준일·출처 등) */
  facts: string[];
  explainTitle: string;
  explain: Array<[string, string]>;
  othersTitle: string;
  others: LandingOther[];
  links: LandingLink[];
  /** 이 카드에 AI 가 쓴 글이 들어 있다 → 위쪽 «✦ AI» 표식 */
  aiBadge: boolean;
  fallbackReason?: LandingFallback;
  fallbackText?: string;
  /** canonical 경로(언어 포함, 도메인 없음) — 없으면 생략 */
  canonicalPath: string | null;
}

// ── 문구(한·일·영) ───────────────────────────────────────────────────────────
// 규칙: ① 자동 갱신 고지는 «무료» 문장 «안에» ② 가짜 희소성 금지(남은 수·타이머·«선착순»·«전원 증정» 없음) ③ 가격 숫자 없음(스토어가 사용자 통화로 청구)
//       ④ 금융 공통어는 번역하지 않는다 ⑤ 투자 권유·예측 문구 없음 — 사실 문장만.

interface LandingCopy {
  kindName: Record<ShareKind, string>;
  kicker: Record<ShareKind, string>;
  cta: string;
  ctaSub: string;
  /** 쿠폰 코드가 켜져 있을 때만 CTA 아래 한 줄 */
  codeLine: string;
  othersT: Record<ShareKind, string>;
  linkPick: string;
  linkEarn: string;
  linkFlow: (t: string) => string;
  estEps: string;
  estRev: string;
  /** line 의 기준 시각 한 줄 */
  asOfAt: (d: { ny: string; kst: string }) => string;
  chainDate: (d: string) => string;
  explainLineT: string;
  /** 앱에서 온 행(이번 주 밖)의 날짜가 회사 공지 전일 수 있을 때 — 앱 실적 화면 문구와 같은 말 */
  dateNote: { est: string; unconfirmed: string };
  fb: {
    failed: string;
    pickRotated: (t: string) => string;
    lineNone: (t: string) => string;
    earnNoRow: (t: string) => string;
    earnDone: (t: string, when: string) => string;
    earnNoMove: (t: string, when: string) => string;
  };
  lineDesc: string;
  foot: string;
}

const LC: Record<InviteLang, LandingCopy> = {
  ko: {
    kindName: { pick: '오늘 볼 것', line: 'AI 한 줄', earn: '실적 · 옵션 반영 변동폭' },
    kicker: { pick: 'AI 오늘 볼 것', line: 'AI 한 줄', earn: '실적 · 옵션 반영 변동폭' },
    cta: '앱에서 이어 보기',
    ctaSub: 'iOS · Android · 무료',
    codeLine: '링크로 설치하면 PRO 1개월 무료 — 이후 자동 갱신, 언제든 해지',
    othersT: { pick: '함께 보기', line: '함께 보기', earn: '이번 주 다른 실적 발표' },
    linkPick: '오늘 볼 것 전체 보기',
    linkEarn: '이번 주 실적 전체 보기',
    linkFlow: (t) => `${t} 옵션·다크풀 페이지`,
    estEps: 'EPS 추정',
    estRev: '매출 추정',
    asOfAt: ({ ny, kst }) => `기준 시각 뉴욕 ${ny} · 한국 ${kst}`,
    chainDate: (d) => `옵션 체인 기준일 ${d}`,
    explainLineT: '이 숫자 읽는 법',
    dateNote: { est: '회사 공지 전 — 날짜가 바뀔 수 있습니다', unconfirmed: '발표일·추정치는 발표 전까지 바뀔 수 있습니다' },
    fb: {
      failed: '지금은 이 카드를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.',
      pickRotated: (t) => `지금 목록에 ${t} 항목이 없습니다. 목록은 새로 고를 때마다 바뀝니다. 지금 목록은 아래와 같습니다.`,
      lineNone: (t) => `${t}의 AI 한 줄이 지금은 준비되어 있지 않습니다.`,
      earnNoRow: (t) => `이번 주 실적 일정에 ${t} 항목이 없습니다. 회사가 직접 공지한 일정만 담습니다.`,
      earnDone: (t, when) => `${t} 실적 발표(${when})는 끝났습니다. 옵션 반영 변동폭은 발표 전의 값이라 발표 뒤에는 보여 주지 않습니다.`,
      earnNoMove: (t, when) => `${t} 실적(${when})의 옵션 반영 변동폭은 자료를 갱신하는 중입니다.`,
    },
    lineDesc: 'Max Pain · Call Wall · Put Floor 같은 옵션 가격대를 AI가 한 줄로 풀어 줍니다. 무료, 가입 없이.',
    foot: '무료 · 가입 없이 · iOS·Android',
  },
  en: {
    kindName: { pick: 'Worth watching today', line: 'AI one-liner', earn: 'Earnings · options-implied move' },
    kicker: { pick: 'AI · Worth watching today', line: 'AI one-liner', earn: 'Earnings · options-implied move' },
    cta: 'Continue in the app',
    ctaSub: 'iOS · Android · Free',
    codeLine: 'Install via this link for PRO free for the first month — then auto-renews, cancel anytime',
    othersT: { pick: 'Also see', line: 'Also see', earn: 'Other reports this week' },
    linkPick: 'See the full list',
    linkEarn: 'See all earnings this week',
    linkFlow: (t) => `${t} options & dark pool page`,
    estEps: 'EPS est.',
    estRev: 'Revenue est.',
    asOfAt: ({ ny, kst }) => `As of NY ${ny} · Korea ${kst}`,
    chainDate: (d) => `Options chain as of ${d}`,
    explainLineT: 'How to read these numbers',
    dateNote: { est: 'Not yet announced by the company — the date may change', unconfirmed: 'Dates and estimates can change before the report' },
    fb: {
      failed: 'This card could not be loaded right now. Please try again in a moment.',
      pickRotated: (t) => `${t} is not on the list right now. The list changes each time it is re-picked. This is the current list.`,
      lineNone: (t) => `There is no AI one-liner for ${t} right now.`,
      earnNoRow: (t) => `${t} is not on this week’s earnings list. Only report dates the companies themselves announced are included.`,
      earnDone: (t, when) => `${t} has reported (${when}). The implied move is a pre-report figure, so it is not shown after the report.`,
      earnNoMove: (t, when) => `The options-implied move for the ${t} report (${when}) is being updated.`,
    },
    lineDesc: 'AI explains option levels such as Max Pain, Call Wall and Put Floor in one line. Free, no account.',
    foot: 'Free · no account · iOS & Android',
  },
  ja: {
    kindName: { pick: '今日の注目', line: 'AI ひとこと', earn: '決算 · オプション織り込み変動幅' },
    kicker: { pick: 'AI 今日の注目', line: 'AI ひとこと', earn: '決算 · オプション織り込み変動幅' },
    cta: 'アプリで続きを見る',
    ctaSub: 'iOS · Android · 無料',
    codeLine: 'このリンクから始めるとPRO 1か月無料 — 以降は自動更新、いつでも解約可',
    othersT: { pick: 'あわせて見る', line: 'あわせて見る', earn: '今週の他の決算' },
    linkPick: '今日の注目をすべて見る',
    linkEarn: '今週の決算をすべて見る',
    linkFlow: (t) => `${t} オプション・ダークプールのページ`,
    estEps: 'EPS予想',
    estRev: '売上予想',
    asOfAt: ({ ny, kst }) => `基準時刻 NY ${ny} · 日本 ${kst}`,
    chainDate: (d) => `オプションチェーン基準日 ${d}`,
    explainLineT: '数値の読み方',
    dateNote: { est: '会社の発表前 — 日付が変わることがあります', unconfirmed: '発表日・予想は発表まで変わることがあります' },
    fb: {
      failed: 'このカードを今は読み込めません。しばらくしてからもう一度お試しください。',
      pickRotated: (t) => `現在のリストに${t}はありません。リストは選び直すたびに入れ替わります。現在のリストは以下のとおりです。`,
      lineNone: (t) => `${t}のAIひとことは現在ありません。`,
      earnNoRow: (t) => `今週の決算日程に${t}はありません。企業が自ら告知した日程だけを載せています。`,
      earnDone: (t, when) => `${t}の決算発表(${when})は終了しました。想定変動幅は発表前の値のため、発表後は表示しません。`,
      earnNoMove: (t, when) => `${t}の決算(${when})のオプション織り込み変動幅は、データを更新中です。`,
    },
    lineDesc: 'Max Pain・Call Wall・Put Floorなどのオプション価格帯をAIが一言で解説。無料、登録不要。',
    foot: '無料 · 登録不要 · iOS・Android',
  },
};

/** OG 카드 하단 문구(페이지 푸터와 같은 말) */
export const OG_FOOT: Record<InviteLang, string> = { ko: LC.ko.foot, en: LC.en.foot, ja: LC.ja.foot };

// ── 입력 검사 ────────────────────────────────────────────────────────────────

/** 주소의 종류·티커 검사 — 형식 밖이면 null (page 는 notFound). 종류는 정확히 pick|line|earn(소문자), 티커는 normalizeShareTicker. */
export function parseLandingParams(kind: unknown, ticker: unknown): { kind: ShareKind; ticker: string } | null {
  if (typeof kind !== 'string' || !(SHARE_KINDS as readonly string[]).includes(kind)) return null;
  const t = normalizeShareTicker(ticker);
  return t ? { kind: kind as ShareKind, ticker: t } : null;
}

/** 쿼리 via — ios|android|web, 그 밖(없음·모름)은 web */
export function viaOf(raw: unknown): 'ios' | 'android' | 'web' {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'ios' || v === 'android' ? v : 'web';
}

const FLOW_SET = new Set<string>(FLOW_TICKERS as readonly string[]);

/** canonical 경로 — pick→/{l}/today · earn→/{l}/earnings-week · line→FLOW_TICKERS 에 있으면 /{l}/flow/{T}, 아니면 null */
export function canonicalPathOf(kind: ShareKind, ticker: string, lang: InviteLang): string | null {
  if (kind === 'pick') return `/${lang}/today`;
  if (kind === 'earn') return `/${lang}/earnings-week`;
  return FLOW_SET.has(ticker) ? `/${lang}/flow/${ticker}` : null;
}

/** 이 카드 주소의 경로(쿼리 없음) — og:url */
export const cardPathOf = (kind: ShareKind, ticker: string, lang: InviteLang): string => `/${lang}/s/${kind}/${encodeURIComponent(ticker)}`;

// ── CTA ──────────────────────────────────────────────────────────────────────

export interface LandingCta {
  href: string;
  label: string;
  sub: string;
  /** 쿠폰 코드가 켜져 있을 때만(없으면 undefined — 화면에 쿠폰 문구를 그리지 않는다) */
  codeLine?: string;
}

/**
 * «앱에서 이어 보기» — href = inviteAppHref(kind, {lang, ref, code}). ref 는 형식 검사를 통과한 값만, code 는 선물 코드가 live 일 때만.
 * gift 는 giftConfig() 결과(서버 환경변수 기반)를 호출자가 넘긴다 — 이 파일은 환경을 읽지 않는다.
 */
export function landingCta(
  kind: ShareKind,
  lang: InviteLang,
  opts: { ref?: string | null; gift?: { live: false } | { live: true; code: string } | null } = {},
): LandingCta {
  const code = opts.gift && opts.gift.live ? opts.gift.code : null;
  const c = LC[lang];
  return {
    href: inviteAppHref(kind, { lang, ref: opts.ref ?? null, code }),
    label: c.cta,
    sub: c.ctaSub,
    ...(code ? { codeLine: c.codeLine } : {}),
  };
}

// ── 작은 도구 ────────────────────────────────────────────────────────────────

/** 코드포인트 기준으로 자른다(…). CJK·이모지에서 글자가 깨지지 않게 */
export function clipText(s: string, max: number): string {
  const a = Array.from(String(s ?? ''));
  return a.length <= max ? a.join('') : `${a.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const BRAND = 'SIGNUM HQ';

function baseView(kind: ShareKind, ticker: string, lang: InviteLang): LandingView {
  const c = LC[lang];
  return {
    ok: false, kind, ticker, lang,
    kindName: c.kindName[kind],
    title: ticker ? `${ticker} — ${c.kindName[kind]} | ${BRAND}` : `${c.kindName[kind]} | ${BRAND}`,
    description: genericDescription(kind, lang),
    headline: '', headlineAi: false,
    rows: [], asOf: '', facts: [],
    explainTitle: '', explain: [],
    othersTitle: c.othersT[kind], others: [], links: [],
    aiBadge: false,
    canonicalPath: ticker ? canonicalPathOf(kind, ticker, lang) : null,
  };
}

function genericDescription(kind: ShareKind, lang: InviteLang): string {
  if (kind === 'pick') return UI[lang].metaDesc(null);
  if (kind === 'earn') return COPY[lang].lead;
  return LC[lang].lineDesc;
}

/** 대체 화면 — 생성하지 않고 «사실 한 줄 + 갈 곳»만 */
export function fallbackView(
  kind: ShareKind, ticker: string, lang: InviteLang, reason: LandingFallback,
  parts: Partial<Pick<LandingView, 'others' | 'rows' | 'links' | 'chip' | 'name'>> & { text?: string } = {},
): LandingView {
  const c = LC[lang];
  const v = baseView(kind, ticker, lang);
  const { text, ...rest } = parts;
  const fallbackText = text ?? (kind === 'pick' && (reason === 'no-list' || reason === 'off') ? UI[lang].empty : c.fb.failed);
  return { ...v, ...rest, ok: false, fallbackReason: reason, fallbackText, links: rest.links ?? defaultLinks(kind, ticker, lang) };
}

function defaultLinks(kind: ShareKind, ticker: string, lang: InviteLang): LandingLink[] {
  const c = LC[lang];
  if (kind === 'pick') return [{ label: c.linkPick, href: `/${lang}/today` }];
  if (kind === 'earn') return [{ label: c.linkEarn, href: `/${lang}/earnings-week` }];
  return ticker && FLOW_SET.has(ticker) ? [{ label: c.linkFlow(ticker), href: `/${lang}/flow/${ticker}` }] : [];
}

// ── pick ─────────────────────────────────────────────────────────────────────

const PICK_OTHERS_MAX = 4;
/** UI.how 의 설명 순서(고래 · 다크풀 · Gamma Flip/Max Pain · 실적) — 이 카드 종류의 설명 한 항목만 붙인다 */
const PICK_HOW_INDEX = { whale: 0, darkpool: 1, gamma: 2, earnings: 3 } as const;

/** 오늘 볼 것 — 이 종목 항목을 큰 카드로, 나머지(최대 4)를 «함께 보기» 로. 항목이 이미 돌았으면 오늘 목록 전체 + 사실 한 줄. */
export function composePick(doc: TodayPicksDoc | null, off: boolean, ticker: string, lang: InviteLang): LandingView {
  const c = LC[lang];
  const ui = UI[lang];
  const view: PicksView = buildView(doc, lang, off);
  if (off) return fallbackView('pick', ticker, lang, 'off', { text: ui.empty });
  if (!view.items.length) return fallbackView('pick', ticker, lang, 'no-list', { text: ui.empty });

  const asOthers = (xs: PicksView['items']): LandingOther[] => xs.map((p) => ({
    ticker: p.ticker, chip: p.label, text: p.what, ...(FLOW_SET.has(p.ticker) ? { href: `/${lang}/flow/${p.ticker}` } : {}),
  }));
  const mine = view.items.find((p) => p.ticker === ticker);
  if (!mine) {
    // 항목이 돌았다 — 오늘 목록 전체를 «오늘 볼 것» 제목으로 보여 준다
    return { ...fallbackView('pick', ticker, lang, 'rotated', { text: c.fb.pickRotated(ticker), others: asOthers(view.items.slice(0, 8)) }), othersTitle: ui.title };
  }

  const pickedLine = view.pickedAt ? ui.pickedLine(view.pickedAt) : '';
  const v = baseView('pick', ticker, lang);
  const others = asOthers(view.items.filter((p) => p !== mine && p.ticker !== ticker).slice(0, PICK_OTHERS_MAX));
  return {
    ...v,
    ok: true,
    title: `${ticker} · ${mine.label} — ${ui.title} | ${BRAND}`,
    description: clipText(`${ticker} ${mine.what} (${mine.asOf}). ${mine.why}`, 200),
    chip: mine.label,
    headline: mine.what,
    aiLine: { text: mine.why, ai: mine.ai },
    asOf: [mine.asOf, pickedLine].filter(Boolean).join(' · '),
    facts: [...(mine.kind === 'darkpool' ? [ui.sourceFinra] : []), ui.howRule],
    explainTitle: ui.howT,
    explain: [ui.how[PICK_HOW_INDEX[mine.kind]]],
    others,
    links: defaultLinks('pick', ticker, lang),
    aiBadge: mine.ai,
  };
}

// ── line ─────────────────────────────────────────────────────────────────────

/**
 * 내 종목 AI 한 줄 — «자리표를 채운 글» + 숫자(기준가·레벨) + 기준 시각 + 옵션 체인 기준일.
 *   entry = entryOf(stored, lang) (호출자가 만든다). 거리 %는 «그 글을 쓴 때의 가격(stored.spot)» 기준 — 화면의 기준가와 같은 값이다.
 *   채울 수 없으면(null) 대체 화면 — 지형이 바뀐 글은 그리지 않는다(aiLineState).
 */
export function composeLine(stored: StoredLine | null, entry: AiLineEntry | null, off: boolean, ticker: string, lang: InviteLang): LandingView {
  const c = LC[lang];
  const w = COPY[lang];
  if (off) return fallbackView('line', ticker, lang, 'off', { text: c.fb.lineNone(ticker) });
  if (!stored || !entry || !fin(stored.spot)) return fallbackView('line', ticker, lang, 'no-line', { text: c.fb.lineNone(ticker) });
  const lv = stored.lv ?? { mp: null, cw: null, pf: null, gf: null };
  const text = fillAiLine(entry, {
    price: stored.spot, maxPain: lv.mp, callWall: lv.cw, putFloor: lv.pf, gammaFlipLevel: lv.gf, chainDate: stored.chain,
  });
  if (!text) return fallbackView('line', ticker, lang, 'no-line', { text: c.fb.lineNone(ticker) });

  const rows: LandingRow[] = [];
  const price = fmtPrice(stored.spot);
  if (price) rows.push({ label: w.col.price, value: price });
  const add = (label: string, x: number | null | undefined) => { const s = fmtLevel(x); if (s) rows.push({ label, value: s }); };
  add('Max Pain', lv.mp);
  add('Call Wall', lv.cw);
  add('Put Floor', lv.pf);
  add('Gamma Flip', lv.gf);

  const at = fin(stored.at) && stored.at > 0 ? c.asOfAt({ ny: stampET(stored.at, lang), kst: stampKST(stored.at, lang) }) : '';
  const chainOk = typeof stored.chain === 'string' && /^\d{4}-\d{2}-\d{2}/.test(stored.chain);
  const facts = chainOk ? [c.chainDate(mdw(stored.chain.slice(0, 10), lang))] : [];
  const v = baseView('line', ticker, lang);
  return {
    ...v,
    ok: true,
    title: `${ticker} — ${c.kindName.line} | ${BRAND}`,
    description: clipText(text, 200),
    headline: text,
    headlineAi: true,
    rows,
    asOf: at,
    facts,
    explainTitle: c.explainLineT,
    explain: [w.read[1]],
    links: defaultLinks('line', ticker, lang),
    aiBadge: true,
  };
}

// ── earn ─────────────────────────────────────────────────────────────────────

/** 캘린더 행의 EPS·매출 추정 + AI 브리프(회사명·관전 포인트) — 이 발표(row)에 맞는 것만 */
export interface EarnExtra {
  eps: number | null;
  rev: number | null;
  quarter: number | null;
  year: number | null;
  brief?: Partial<Record<InviteLang, { name?: string; watch?: string }>>;
}

const EARN_OTHERS_MAX = 4;

/**
 * 원천 캘린더 행(Redis 캐시 읽기)과 브리프 팩에서 이 발표의 EPS·매출·AI 브리프를 고른다.
 *   · 같은 종목의 캘린더 행 중 이 발표일(회사 공지)에 가장 가까운 것(±30일 — 같은 발표로 보는 폭, lib/earnings/earningsBrief 와 같은 값). 없으면 추정치 없음.
 *   · 관전 포인트는 attachBriefs 가 «이 행의 EPS·매출»로 {EPS}·{REV} 를 채우고 남은 숫자를 표 값과 대조한 뒤에만 나온다(앱 실적 화면과 같은 출구).
 */
export function pickEarnExtra(calRows: unknown, pack: BriefPack | null | undefined, row: { ticker: string; date: string }): EarnExtra | null {
  const list = Array.isArray(calRows) ? (calRows as Array<Record<string, unknown>>) : [];
  let best: Record<string, unknown> | null = null;
  let bestAbs = Infinity;
  for (const x of list) {
    if (!x || String(x.ticker || '').toUpperCase() !== row.ticker || typeof x.date !== 'string') continue;
    const d = daysBetweenYmd(row.date, x.date);
    if (d == null) continue;
    const a = Math.abs(d);
    if (a <= 30 && a < bestAbs) { best = x; bestAbs = a; }
  }
  const num = (v: unknown): number | null => (fin(v) ? v : null);
  const eps = best ? num(best.epsEstimate) : null;
  const rev = best ? num(best.revenueEstimate) : null;
  const quarter = best ? num(best.quarter) : null;
  const year = best ? num(best.year) : null;
  const att = attachBriefs(
    [{ ticker: row.ticker, date: row.date, dateFrom: best ? (typeof best.dateFrom === 'string' ? best.dateFrom : best.date !== row.date ? String(best.date) : null) : null, epsEstimate: eps, revenueEstimate: rev, quarter }],
    pack,
  );
  const brief = att.rows[0].brief;
  if (eps == null && rev == null && !brief) return null;
  return { eps, rev, quarter, year, ...(brief ? { brief } : {}) };
}

/**
 * «앱과 같은 원천» 행 — 이번 주(월~금) 목록 밖의 발표(앱 실적 화면은 21일치)를 같은 카드로 그리기 위한 한 행.
 *   앱 라우트(/api/market/earnings-calendar)와 같은 재료: 캘린더 행(회사 공지를 입힌 것) + 변동폭 묶음(earnings:implied:v1) + 브리프 팩. 읽기만 한다.
 */
export interface EarnAlt {
  row: EarningsWeekRow;
  dataSession: string | null;
  dataBasis: 'live' | 'eod' | null;
  dataAt: number | null;
  /** 'confirmed' = 회사 공지 · 'est' = 확인했으나 공지 전 · null = 모름(원천 날짜) */
  dateStatus: string | null;
}

/**
 * 캘린더 행(회사 공지를 입힌 것)·변동폭 묶음·브리프 팩에서 이 종목의 «가장 가까운 아직 안 지난» 발표를 고른다.
 *   · 행이 하나도 없으면 alt=null(→ no-row). 전부 지났으면 가장 최근 행(→ composeEarn 이 «발표 완료» 대체 화면).
 *   · 변동폭은 attachImplied(앱과 같은 규칙: 발표 완료·만기 지남·값 없음이면 null)로 붙인다 — 없으면 impliedMovePct=null(→ no-move).
 *   · 발표 시각(etTime)은 회사 공지 목록(confirmed)에 있을 때만, 기준가(spot)는 이 원천에 없어 비운다(지어내지 않는다).
 */
export function appSourceEarn(
  calRows: unknown,
  impliedPack: ImpliedPack | null | undefined,
  briefPack: BriefPack | null | undefined,
  ticker: string,
  nowMs: number,
  confirmed: readonly ConfirmedEarnings[] = [],
): { alt: EarnAlt | null; extra: EarnExtra | null } {
  const list = Array.isArray(calRows) ? (calRows as Array<Record<string, unknown>>) : [];
  const mine = list
    .filter((x) => x && String(x.ticker || '').toUpperCase() === ticker && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!mine.length) return { alt: null, extra: null };
  const hourOf = (x: Record<string, unknown>): 'amc' | 'bmo' | '' => (x.hour === 'amc' || x.hour === 'bmo' ? x.hour : '');
  const open = mine.find((x) => phaseOf(String(x.date), hourOf(x), nowMs) !== 'done');
  const pickRow = open ?? mine[mine.length - 1];
  const date = String(pickRow.date);
  const hour = hourOf(pickRow);
  const im = attachImplied([{ ticker, date, hour }], impliedPack, nowMs).rows[0].implied;
  const conf = confirmed.find((c) => c.ticker === ticker && c.date === date);
  const row: EarningsWeekRow = {
    ticker, date, hour, etTime: conf?.etTime ?? null,
    impliedMovePct: im?.pct ?? null, impliedExpiry: im?.expiry ?? null, impliedBasis: im?.basis ?? null, impliedSession: im?.session ?? null,
    impliedAsOf: null, straddle: null, strike: null, spot: null, impliedReason: null,
    maxPain: null, callWall: null, putFloor: null, levelsExpiry: null, levelsChainDate: null, levelsAsOf: null,
  };
  const dateStatus = conf || pickRow.dateStatus === 'confirmed' ? 'confirmed' : typeof pickRow.dateStatus === 'string' ? pickRow.dateStatus : null;
  return {
    alt: { row, dataSession: im?.session ?? null, dataBasis: im?.basis ?? null, dataAt: impliedPack && fin(impliedPack.at) ? impliedPack.at : null, dateStatus },
    extra: pickEarnExtra(mine, briefPack, { ticker, date }),
  };
}

/** «10/14(수) 장 마감 후» — 문장 속에서 쓸 때(영어는 소문자 시작) */
function whenInSentence(etLine: string, lang: InviteLang, hasTime: boolean, hour: string): string {
  if (lang !== 'en' || hasTime) return etLine;
  const c = COPY.en;
  const h = hourText(hour, c);
  return etLine.endsWith(h) ? `${etLine.slice(0, etLine.length - h.length)}${h.charAt(0).toLowerCase()}${h.slice(1)}` : etLine;
}

/**
 * 실적 — 이번 주(월~금) 회사 공지 목록의 이 종목 행. 발표일·시간 · «옵션이 반영한 예상 변동폭(%)» + 기준(만기·세션) · 기준가 · EPS/매출 추정(있으면) · 회사명·AI 관전 포인트(있으면).
 *   이번 주 목록에 행이 없으면 alt(= 앱과 같은 원천에서 읽은 행 — appSourceEarn)로 같은 카드를 그린다. 기준가는 그 원천에 없어 빠지고,
 *   날짜가 회사 공지 전일 수 있으면 그 사실 한 줄을 붙인다.
 *   없는 종목(no-row)·발표 끝(done)·변동폭 없음(no-move)은 대체 화면 — 이번 주 다른 발표를 «함께 보기»로 붙인다.
 */
export function composeEarn(
  week: EarningsWeekData | null, extra: EarnExtra | null, ticker: string, lang: InviteLang, nowMs: number = Date.now(), alt: EarnAlt | null = null,
): LandingView {
  const c = LC[lang];
  const w = COPY[lang];
  const inWeek = week ? week.rows.find((r) => r.ticker === ticker) ?? null : null;
  const row = inWeek ?? alt?.row ?? null;
  if (!week && !row) return fallbackView('earn', ticker, lang, 'read-failed');

  const others: LandingOther[] = (week?.rows ?? [])
    .filter((r) => r.ticker !== ticker && r.impliedMovePct != null && r.impliedMovePct > 0 && phaseOf(r.date, r.hour, nowMs) !== 'done')
    .sort((a, b) => (b.impliedMovePct! - a.impliedMovePct!) || a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker))
    .slice(0, EARN_OTHERS_MAX)
    .map((r) => ({ ticker: r.ticker, text: `${pctText(r.impliedMovePct)} · ${mdw(r.date, lang)}`, ...(FLOW_SET.has(r.ticker) ? { href: `/${lang}/flow/${r.ticker}` } : {}) }));

  if (!row) return fallbackView('earn', ticker, lang, 'no-row', { text: c.fb.earnNoRow(ticker), others });

  // 숫자 기준(세션·호가 종류·계산 시각)은 행이 온 원천의 것 — 이번 주 목록이면 그 목록, 앱 원천이면 변동폭 묶음
  const src = inWeek && week ? week : { dataSession: alt?.dataSession ?? null, dataBasis: alt?.dataBasis ?? null, dataAt: alt?.dataAt ?? null };
  const v = viewRow(row, lang, src, nowMs);
  const whenRow: LandingRow = { label: w.col.when, value: v.etLine, ...(v.kstLine ? { note: v.kstLine } : {}) };
  if (v.phase === 'done') return fallbackView('earn', ticker, lang, 'done', { text: c.fb.earnDone(ticker, mdw(row.date, lang)), rows: [whenRow], others, chip: w.done });
  if (!v.moveText || v.moveText === '—') return fallbackView('earn', ticker, lang, 'no-move', { text: c.fb.earnNoMove(ticker, v.etLine), rows: [whenRow], others });

  const implied: RowImplied | null = row.impliedExpiry && row.impliedMovePct != null
    ? { pct: row.impliedMovePct, expiry: row.impliedExpiry, basis: row.impliedBasis, session: row.impliedSession }
    : null;
  const basis = impliedBasisText(implied, lang);
  const hero = { value: v.moveText, label: IMPLIED_LABEL[lang], ...(basis ? { note: basis } : {}) };

  const rows: LandingRow[] = [whenRow];
  if (v.priceText) rows.push({ label: w.col.price, value: v.priceText });
  const q = extra && fin(extra.quarter) && fin(extra.year) ? `Q${extra.quarter} FY${String(extra.year).slice(-2)}` : undefined;
  if (extra && fin(extra.eps)) rows.push({ label: c.estEps, value: fmtEpsUsd(extra.eps), ...(q ? { note: q } : {}) });
  if (extra && fin(extra.rev)) rows.push({ label: c.estRev, value: fmtRevUsd(extra.rev), ...(q && !fin(extra.eps) ? { note: q } : {}) });

  const brief = extra?.brief?.[lang];
  const name = brief?.name;
  const watch = brief?.watch;
  const etHasTime = !!row.etTime;
  const when = whenInSentence(v.etLine, lang, etHasTime, row.hour);
  const headline = lang === 'ko' ? `${when} 실적 발표` : lang === 'ja' ? `${when} 決算発表` : `Reports ${when}`;
  const base = baseView('earn', ticker, lang);
  return {
    ...base,
    ok: true,
    title: `${ticker} ${lang === 'en' ? 'earnings' : lang === 'ja' ? '決算' : '실적'} ${mdw(row.date, lang)} — ${hero.label} ${hero.value} | ${BRAND}`,
    description: clipText(`${ticker}: ${headline} · ${hero.label} ${hero.value}${basis ? ` (${basis})` : ''}`, 200),
    ...(name ? { name } : {}),
    ...(v.phase === 'today' ? { chip: w.today } : {}),
    headline,
    hero,
    ...(watch ? { aiLine: { text: watch, ai: true } } : {}),
    rows,
    asOf: asOfLineOf(src as EarningsWeekData, lang) ?? '',
    facts: !inWeek && alt && alt.dateStatus !== 'confirmed' ? [alt.dateStatus === 'est' ? c.dateNote.est : c.dateNote.unconfirmed] : [],
    explainTitle: w.readT,
    explain: [w.read[0], w.read[2]],
    others,
    links: defaultLinks('earn', ticker, lang),
    aiBadge: !!watch,
  };
}

// ── OG 카드용 평평한 묶음 ────────────────────────────────────────────────────

export interface OgCard {
  /** 데이터 카드인가(false = 종류 제목 + 브랜드만) */
  data: boolean;
  lang: InviteLang;
  kind: ShareKind | null;
  kindName: string;
  ticker: string;
  chip?: string;
  name?: string;
  hero?: { value: string; label: string; note?: string };
  headline: string;
  headlineAi: boolean;
  aiLine?: { text: string; ai: boolean };
  stats: Array<{ label: string; value: string }>;
  asOf: string;
  foot: string;
  aiBadge: boolean;
}

/** 카드 글자 수 상한(코드포인트) — 1200×630 에서 줄 수가 넘치지 않게(headlineAi = AI 한 줄이 headline 인 line 카드) */
const OG_CLIP = {
  headline: { ko: 54, ja: 54, en: 96 },
  headlineAi: { ko: 80, ja: 80, en: 140 },
  ai: { ko: 80, ja: 80, en: 130 },
  asOf: { ko: 84, ja: 84, en: 120 },
} as const;

/** 뷰 → OG 카드. 대체 화면이거나 뷰가 없으면 «종류 제목 + 브랜드»만(data=false) */
export function ogCardOf(view: LandingView | null, lang: InviteLang): OgCard {
  const foot = OG_FOOT[lang];
  if (!view || !view.ok) {
    return {
      data: false, lang, kind: view?.kind ?? null, kindName: view?.kindName ?? '',
      ticker: view?.ticker ?? '', headline: '', headlineAi: false, stats: [], asOf: '', foot, aiBadge: false,
    };
  }
  const L = view.lang;
  return {
    data: true, lang: L, kind: view.kind, kindName: view.kindName, ticker: view.ticker,
    ...(view.chip ? { chip: view.chip } : {}),
    ...(view.name ? { name: clipText(view.name, 30) } : {}),
    ...(view.hero ? { hero: { ...view.hero, ...(view.hero.note ? { note: clipText(view.hero.note, 40) } : {}) } } : {}),
    headline: clipText(view.headline, (view.headlineAi ? OG_CLIP.headlineAi : OG_CLIP.headline)[L]),
    headlineAi: view.headlineAi,
    ...(view.aiLine ? { aiLine: { text: clipText(view.aiLine.text, OG_CLIP.ai[L]), ai: view.aiLine.ai } } : {}),
    stats: view.kind === 'earn'
      ? view.rows.slice(1, 4).map((r) => ({ label: r.label, value: r.value }))
      : view.rows.slice(0, 4).map((r) => ({ label: r.label, value: r.value })),
    asOf: clipText(view.asOf, OG_CLIP.asOf[L]),
    foot,
    aiBadge: view.aiBadge,
  };
}

/** 카드에 그려질 모든 글자 — 한·일 글꼴 서브셋 요청에 쓴다(숫자·기호·브랜드 포함) */
export function ogGlyphs(card: OgCard): string {
  return [
    card.kindName, card.ticker, card.chip ?? '', card.name ?? '', card.hero?.value ?? '', card.hero?.label ?? '', card.hero?.note ?? '',
    card.headline, card.aiLine?.text ?? '', card.asOf, card.foot, ...card.stats.flatMap((s) => [s.label, s.value]),
    'SIGNUM HQ AI signumhq.com ET 0123456789:/()-–—±%$.,·→+ ',
  ].join('');
}

// ── 읽기(레디스 서비스) ──────────────────────────────────────────────────────

export interface LandingDeps {
  picks(): Promise<{ doc: TodayPicksDoc | null; off: boolean }>;
  line(ticker: string, lang: InviteLang): Promise<{ stored: StoredLine | null; entry: AiLineEntry | null; off: boolean }>;
  earn(ticker: string, nowMs?: number): Promise<{ week: EarningsWeekData | null; extra: EarnExtra | null; alt?: EarnAlt | null }>;
}

/**
 * 실서비스 읽기 — 전부 «읽기만»(저장본 · 레디스 캐시). 서비스 모듈은 호출될 때 올린다(동적 import).
 *   background: getEarningsWeek 가 낡은 사본을 주고 «응답 뒤» 갱신을 맡길 때(page 는 after 로 넘긴다).
 *   ⚠ getMarketEarningsCalendar 는 부르지 않는다 — 캐시가 비면 FMP 를 만들러 가는 경로다. 캐시(market:earnings-calendar:v4)를 읽기만 한다(earningsWeekService.pendingFromCalendar 와 같다).
 */
export function makeDefaultDeps(background?: (p: Promise<unknown>) => void): LandingDeps {
  return {
    async picks() {
      const { readPicks } = await import('@/services/todayPicksService');
      const r = await readPicks();
      return { doc: r.doc, off: r.off };
    },
    async line(ticker, lang) {
      const svc = await import('@/services/watchlistAiLineService');
      const r = await svc.readLines([ticker]);
      const stored = r.lines[ticker] ?? null;
      return { stored, entry: svc.entryOf(stored, lang), off: r.off };
    },
    async earn(ticker, nowMs = Date.now()) {
      const { getEarningsWeek } = await import('@/services/earningsWeekService');
      let week: EarningsWeekData | null = null;
      try { week = await getEarningsWeek(background ? { background } : {}); } catch { week = null; }
      const row = week ? week.rows.find((r) => r.ticker === ticker) : undefined;
      const [{ getFromCache }, { EARNINGS_CALENDAR_CACHE_KEY, earningsCalendarUniverse }, { EARNINGS_BRIEF_KEY }] = await Promise.all([
        import('@/services/redisClient'),
        import('@/services/earningsCalendarService'),
        import('@/lib/earnings/earningsBrief'),
      ]);
      const [cal, pack] = await Promise.all([
        getFromCache<{ rows?: unknown }>(EARNINGS_CALENDAR_CACHE_KEY).catch(() => null),
        getFromCache<BriefPack>(EARNINGS_BRIEF_KEY).catch(() => null),
      ]);
      if (week && row) return { week, extra: pickEarnExtra(cal?.rows, pack, row), alt: null };

      // 이번 주 목록에 없다 → 앱 실적 화면과 같은 원천을 «읽기만» 한다(/api/market/earnings-calendar 와 같은 재료):
      //   캘린더 «캐시» + 같은 덮기 함수(applyConfirmedEarnings — getMarketEarningsCalendar 가 쓰는 그것) + 변동폭 묶음 읽기 + 브리프 팩.
      //   ⚠ getMarketEarningsCalendar 는 부르지 않는다 — 캐시가 비면 FMP 를 만들러 가는 경로라 공유 링크가 공급사를 부를 수 있게 된다. 갱신(refreshImpliedPack)·브리프 채우기도 부르지 않는다.
      const [{ applyConfirmedEarnings, CONFIRMED_EARNINGS, PENDING_EARNINGS }, { readImpliedPack }, { etDateOf }] = await Promise.all([
        import('@/lib/earningsConfirmed'),
        import('@/services/earningsImpliedService'),
        import('@/lib/marketCalendar'),
      ]);
      const raw = Array.isArray(cal?.rows) ? (cal!.rows as Array<{ ticker: string; date: string; hour: string }>) : [];
      const overlaid = applyConfirmedEarnings(raw, etDateOf(nowMs), { universe: earningsCalendarUniverse(), confirmed: CONFIRMED_EARNINGS, pending: PENDING_EARNINGS }).rows;
      const impliedPack = await readImpliedPack();
      const r = appSourceEarn(overlaid, impliedPack, pack, ticker, nowMs, CONFIRMED_EARNINGS);
      return { week, extra: r.extra, alt: r.alt };
    },
  };
}

/** 한 번 읽는 데 쓰는 상한 — 레디스가 느려도 페이지·카드가 매달리지 않게(넘으면 read-failed 대체 화면) */
export const LOAD_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('landing-timeout')), ms); });
  return Promise.race([p, t]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * 종류·티커·언어 → 뷰 모델 하나. 던지지 않는다(읽기 실패·시간 초과는 read-failed 대체 화면).
 * 티커가 형식 밖이면 bad-input(page 는 그 전에 parseLandingParams 로 notFound).
 */
export async function loadLanding(
  kind: ShareKind,
  tickerRaw: unknown,
  lang: string | null | undefined,
  deps: LandingDeps = makeDefaultDeps(),
  nowMs: number = Date.now(),
): Promise<LandingView> {
  const l = toInviteLang(lang);
  const ticker = normalizeShareTicker(tickerRaw);
  if (!ticker) return fallbackView(kind, '', l, 'bad-input');
  try {
    if (kind === 'pick') {
      const r = await withTimeout(deps.picks(), LOAD_TIMEOUT_MS);
      return composePick(r.doc, r.off, ticker, l);
    }
    if (kind === 'line') {
      const r = await withTimeout(deps.line(ticker, l), LOAD_TIMEOUT_MS);
      return composeLine(r.stored, r.entry, r.off, ticker, l);
    }
    const r = await withTimeout(deps.earn(ticker, nowMs), LOAD_TIMEOUT_MS);
    return composeEarn(r.week, r.extra, ticker, l, nowMs, r.alt ?? null);
  } catch {
    return fallbackView(kind, ticker, l, 'read-failed');
  }
}
